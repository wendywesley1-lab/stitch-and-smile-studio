// ============================================================
//  Stitch & Smile Studio — Production Backend
//  Node.js + Express + SQLite + Stripe + SendGrid
// ============================================================
require('dotenv').config();

const express    = require('express');
const path       = require('path');
const fs         = require('fs');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const Database   = require('better-sqlite3');
const Stripe     = require('stripe');
const sgMail     = require('@sendgrid/mail');
const multer     = require('multer');
const archiver   = require('archiver');
const cors       = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Stripe & SendGrid setup ──────────────────────────────────
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

const JWT_SECRET    = process.env.JWT_SECRET || 'change-this-secret-in-production';
const SHOP_EMAIL    = process.env.SHOP_EMAIL || 'hello@stitchandsmile.com';
const SHOP_NAME     = process.env.SHOP_NAME  || 'Stitch & Smile Studio';
const DRIVE_SHIP_COST = parseFloat(process.env.DRIVE_SHIP_COST || '4.99');

// ── Uploads folder ───────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Multer (file upload) ─────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.zip','.pes','.dst','.exp','.jef','.vp3','.hus','.svs','.xxx',
                     '.pec','.sew','.csd','.svg','.png','.eps','.ai','.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    allowed.includes(ext) ? cb(null, true) : cb(new Error('File type not allowed'));
  }
});

// ── SQLite database ──────────────────────────────────────────
const db = new Database(path.join(__dirname, 'shop.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name   TEXT    NOT NULL,
    last_name    TEXT    NOT NULL,
    email        TEXT    UNIQUE NOT NULL,
    password_hash TEXT   NOT NULL,
    phone        TEXT    DEFAULT '',
    newsletter   INTEGER DEFAULT 0,
    is_admin     INTEGER DEFAULT 0,
    created_at   TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    UNIQUE NOT NULL,
    icon       TEXT    DEFAULT '📁',
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    description TEXT    DEFAULT '',
    price       REAL    NOT NULL,
    hoop_sizes  TEXT    DEFAULT '',
    formats     TEXT    DEFAULT 'PES, DST',
    ship_cost   REAL    DEFAULT 4.99,
    type        TEXT    DEFAULT 'embroidery',
    icon        TEXT    DEFAULT '🧵',
    featured    INTEGER DEFAULT 0,
    file_path   TEXT    DEFAULT '',
    created_at  TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id               INTEGER NOT NULL REFERENCES users(id),
    stripe_payment_intent TEXT    DEFAULT '',
    total                 REAL    NOT NULL,
    status                TEXT    DEFAULT 'pending',
    created_at            TEXT    DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id         INTEGER NOT NULL REFERENCES orders(id),
    product_id       INTEGER NOT NULL REFERENCES products(id),
    delivery_type    TEXT    NOT NULL,
    price            REAL    NOT NULL,
    shipping_address TEXT    DEFAULT ''
  );
`);

// Seed categories & sample products on first run
const catCount = db.prepare('SELECT COUNT(*) as n FROM categories').get().n;
if (catCount === 0) {
  const insertCat = db.prepare('INSERT INTO categories (name, icon, sort_order) VALUES (?, ?, ?)');
  const cats = [
    ['Animals & Pets',     '🐾', 1],
    ['Flowers & Nature',   '🌸', 2],
    ['Children & Baby',    '🍼', 3],
    ['Holiday & Seasonal', '🎄', 4],
    ['Sea Life',           '🐠', 5],
    ['Dinosaurs',          '🦕', 6],
    ['Butterflies',        '🦋', 7],
    ['Vector Art',         '🎨', 8],
  ];
  cats.forEach(c => insertCat.run(...c));

  const getCatId = name => db.prepare('SELECT id FROM categories WHERE name=?').get(name)?.id;
  const insertProd = db.prepare(`
    INSERT INTO products (name, category_id, description, price, hoop_sizes, formats, ship_cost, type, icon, featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const sampleProducts = [
    ['Happy Puppy Set',        getCatId('Animals & Pets'),     'A set of 3 adorable puppy designs, perfect for kids clothing or tote bags!', 3.99, '4x4, 5x7',       'PES, DST, EXP, JEF', 4.99, 'embroidery', '🐶', 1],
    ['Rose Garden Collection', getCatId('Flowers & Nature'),   '6 stunning rose designs in full bloom. Great for pillowcases and aprons!',   4.99, '4x4, 5x7, 6x10', 'PES, DST, VP3, HUS', 4.99, 'embroidery', '🌹', 1],
    ['Baby Elephant Set',      getCatId('Children & Baby'),    'Super sweet elephant designs for baby onesies and bibs!',                    3.49, '3x3, 4x4',       'PES, DST, EXP',      4.99, 'embroidery', '🐘', 0],
    ['Christmas Magic Bundle', getCatId('Holiday & Seasonal'), '12 festive Christmas designs — Santa, reindeer, snowflakes & more!',         6.99, '4x4, 5x7',       'PES, DST, JEF, VP3', 4.99, 'embroidery', '🎅', 1],
    ['Ocean Friends',          getCatId('Sea Life'),           'Octopus, starfish, seahorse and more! Adorable under-the-sea fun.',          4.49, '4x4, 5x7',       'PES, DST, EXP',      4.99, 'embroidery', '🐙', 0],
    ['Dino Roar Pack',         getCatId('Dinosaurs'),          'T-Rex, Triceratops, Stegosaurus & Brachiosaurus — kids go crazy for these!', 3.99, '4x4, 5x7',       'PES, DST, JEF',      4.99, 'embroidery', '🦕', 1],
    ['Butterfly Dreams',       getCatId('Butterflies'),        '8 gorgeous butterfly designs with realistic detail + SVG vector files!',     4.99, '4x4, 5x7, 8x8',  'PES, DST, EXP, SVG', 4.99, 'both',       '🦋', 0],
    ['Floral Vector Pack',     getCatId('Vector Art'),         '30 premium floral vector graphics for digital crafting & scrapbooking.',     7.99, 'N/A',             'SVG, PNG, EPS, AI',  4.99, 'vector',     '🌺', 0],
    ['Happy Kitty Set',        getCatId('Animals & Pets'),     '3 cute cat designs — sitting, playing and sleeping kitties!',               3.49, '3x3, 4x4',       'PES, DST, EXP',      4.99, 'embroidery', '😺', 0],
    ['Sunflower Patch',        getCatId('Flowers & Nature'),   'Cheerful sunflower designs that brighten up any project!',                  3.99, '4x4, 5x7',       'PES, DST, VP3',      4.99, 'embroidery', '🌻', 1],
    ['Halloween Spooky Set',   getCatId('Holiday & Seasonal'), '8 spooky-cute Halloween designs — ghosts, pumpkins, witches & bats!',       5.49, '4x4, 5x7',       'PES, DST, EXP, JEF', 4.99, 'embroidery', '🎃', 0],
    ['Baby Shower Bundle',     getCatId('Children & Baby'),    '10 sweet baby shower designs — great for gifts and keepsakes!',             5.99, '4x4, 5x7',       'PES, DST, EXP',      4.99, 'embroidery', '👶', 0],
  ];
  sampleProducts.forEach(p => insertProd.run(...p));

  // Create default admin account
  const adminHash = bcrypt.hashSync('Admin1!stitch', 10);
  db.prepare(`INSERT OR IGNORE INTO users (first_name, last_name, email, password_hash, is_admin)
              VALUES ('Studio','Admin','admin@stitchandsmile.com',?,1)`).run(adminHash);
  console.log('✅ Database seeded with sample data');
}

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Stripe webhooks need raw body — mount BEFORE express.json for that route
app.post('/api/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

app.use(express.static(path.join(__dirname, 'public')));

// ── Auth middleware ──────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Admin only' });
    next();
  });
}

// ============================================================
//  AUTH ROUTES
// ============================================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone, newsletter } = req.body;
    if (!firstName || !lastName || !email || !password)
      return res.status(400).json({ error: 'Missing required fields' });

    const emailLower = email.toLowerCase().trim();
    if (db.prepare('SELECT id FROM users WHERE email=?').get(emailLower))
      return res.status(409).json({ error: 'An account with this email already exists' });

    // Password validation
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) return res.status(400).json({ error: pwCheck.message });

    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare(
      'INSERT INTO users (first_name, last_name, email, password_hash, phone, newsletter) VALUES (?,?,?,?,?,?)'
    ).run(firstName.trim(), lastName.trim(), emailLower, hash, phone || '', newsletter ? 1 : 0);

    const user = db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid);
    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email?.toLowerCase().trim());
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Invalid email or password' });
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

app.put('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body;
    db.prepare('UPDATE users SET first_name=?, last_name=?, phone=? WHERE id=?')
      .run(firstName, lastName, phone || '', req.user.id);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Could not update profile' });
  }
});

// ============================================================
//  CATEGORY ROUTES
// ============================================================
app.get('/api/categories', (req, res) => {
  const cats = db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all();
  // attach product count
  cats.forEach(c => {
    c.count = db.prepare('SELECT COUNT(*) as n FROM products WHERE category_id=?').get(c.id).n;
  });
  res.json(cats);
});

app.post('/api/admin/categories', requireAdmin, (req, res) => {
  const { name, icon } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name required' });
  if (db.prepare('SELECT id FROM categories WHERE name=?').get(name))
    return res.status(409).json({ error: 'Category already exists' });
  const result = db.prepare('INSERT INTO categories (name, icon) VALUES (?, ?)').run(name.trim(), icon || '📁');
  res.json(db.prepare('SELECT * FROM categories WHERE id=?').get(result.lastInsertRowid));
});

app.delete('/api/admin/categories/:id', requireAdmin, (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  const inUse = db.prepare('SELECT COUNT(*) as n FROM products WHERE category_id=?').get(cat.id).n;
  if (inUse > 0) return res.status(409).json({ error: 'Cannot delete — designs exist in this category' });
  db.prepare('DELETE FROM categories WHERE id=?').run(cat.id);
  res.json({ ok: true });
});

// ============================================================
//  PRODUCT ROUTES
// ============================================================
app.get('/api/products', (req, res) => {
  const { category, search, featured } = req.query;
  let sql = `
    SELECT p.*, c.name AS category_name, c.icon AS category_icon
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE 1=1
  `;
  const params = [];
  if (category && category !== 'all') {
    sql += ' AND c.name = ?'; params.push(category);
  }
  if (search) {
    sql += ' AND (p.name LIKE ? OR p.description LIKE ? OR c.name LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q);
  }
  if (featured === 'true') { sql += ' AND p.featured = 1'; }
  sql += ' ORDER BY p.featured DESC, p.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/products/:id', (req, res) => {
  const p = db.prepare(`
    SELECT p.*, c.name AS category_name, c.icon AS category_icon
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json(p);
});

app.post('/api/admin/products', requireAdmin, upload.single('file'), (req, res) => {
  try {
    const { name, categoryId, description, price, hoopSizes, formats, shipCost, type, icon, featured } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Name and price are required' });
    const filePath = req.file ? req.file.filename : '';
    const result = db.prepare(`
      INSERT INTO products (name, category_id, description, price, hoop_sizes, formats, ship_cost, type, icon, featured, file_path)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      name.trim(), categoryId || null, description || '', parseFloat(price),
      hoopSizes || '', formats || 'PES, DST', parseFloat(shipCost || 4.99),
      type || 'embroidery', icon || '🧵', featured === 'true' ? 1 : 0, filePath
    );
    res.json(db.prepare('SELECT * FROM products WHERE id=?').get(result.lastInsertRowid));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not add product' });
  }
});

// Upload / replace a product's file
app.post('/api/admin/products/:id/file', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  db.prepare('UPDATE products SET file_path=? WHERE id=?').run(req.file.filename, req.params.id);
  res.json({ ok: true, filename: req.file.filename });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const { name, categoryId, description, price, hoopSizes, formats, shipCost, type, icon, featured } = req.body;
  db.prepare(`
    UPDATE products SET name=?, category_id=?, description=?, price=?, hoop_sizes=?,
      formats=?, ship_cost=?, type=?, icon=?, featured=? WHERE id=?
  `).run(
    name, categoryId || null, description, parseFloat(price), hoopSizes,
    formats, parseFloat(shipCost), type, icon, featured ? 1 : 0, req.params.id
  );
  res.json(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id));
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const prod = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!prod) return res.status(404).json({ error: 'Product not found' });
  // Delete file if present
  if (prod.file_path) {
    const fp = path.join(UPLOADS_DIR, prod.file_path);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  db.prepare('DELETE FROM products WHERE id=?').run(prod.id);
  res.json({ ok: true });
});

// ============================================================
//  STRIPE CHECKOUT ROUTES
// ============================================================

// Step 1: Create a PaymentIntent
app.post('/api/checkout/create-intent', requireAuth, async (req, res) => {
  try {
    const { items } = req.body; // [{ productId, deliveryType }]
    if (!items || items.length === 0) return res.status(400).json({ error: 'Cart is empty' });

    let total = 0;
    const lineItems = [];
    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id=?').get(item.productId);
      if (!product) return res.status(404).json({ error: `Product ${item.productId} not found` });
      const price = item.deliveryType === 'drive'
        ? product.price + product.ship_cost
        : product.price;
      total += price;
      lineItems.push({ product, price, deliveryType: item.deliveryType });
    }

    const amountCents = Math.round(total * 100);
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   amountCents,
      currency: 'usd',
      metadata: {
        userId:    req.user.id.toString(),
        itemCount: items.length.toString(),
        items:     JSON.stringify(items),
      },
      automatic_payment_methods: { enabled: true },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      total,
      lineItems: lineItems.map(li => ({
        name:         li.product.name,
        icon:         li.product.icon,
        price:        li.price,
        deliveryType: li.deliveryType,
      })),
    });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: 'Payment setup failed. Please try again.' });
  }
});

// Step 2: Confirm order after Stripe client confirms payment
app.post('/api/checkout/confirm', requireAuth, async (req, res) => {
  try {
    const { paymentIntentId, shippingAddress, items } = req.body;

    // Verify payment really succeeded with Stripe
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== 'succeeded')
      return res.status(400).json({ error: 'Payment not confirmed' });

    // Make sure we haven't already processed this order
    const existing = db.prepare('SELECT id FROM orders WHERE stripe_payment_intent=?').get(paymentIntentId);
    if (existing) return res.json({ orderId: existing.id, alreadyProcessed: true });

    // Calculate total from actual DB prices (never trust client)
    let total = 0;
    const orderedItems = [];
    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id=?').get(item.productId);
      const price = item.deliveryType === 'drive'
        ? product.price + product.ship_cost
        : product.price;
      total += price;
      orderedItems.push({ product, price, deliveryType: item.deliveryType });
    }

    // Create order in DB
    const orderResult = db.prepare(
      'INSERT INTO orders (user_id, stripe_payment_intent, total, status) VALUES (?,?,?,?)'
    ).run(req.user.id, paymentIntentId, total, 'completed');

    const orderId = orderResult.lastInsertRowid;

    for (const item of orderedItems) {
      db.prepare(
        'INSERT INTO order_items (order_id, product_id, delivery_type, price, shipping_address) VALUES (?,?,?,?,?)'
      ).run(orderId, item.product.id, item.deliveryType, item.price, JSON.stringify(shippingAddress || {}));
    }

    // Send confirmation email
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    await sendOrderConfirmationEmail(user, orderedItems, orderId);

    res.json({ orderId, total });
  } catch (err) {
    console.error('Order confirm error:', err);
    res.status(500).json({ error: 'Order processing failed. Contact support.' });
  }
});

// ============================================================
//  STRIPE WEBHOOK (backup confirmation)
// ============================================================
async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'payment_intent.succeeded') {
    console.log('Webhook: payment_intent.succeeded', event.data.object.id);
    // Primary confirmation handled via /api/checkout/confirm
    // This webhook is a safety net
  }
  res.json({ received: true });
}

// ============================================================
//  ORDER ROUTES
// ============================================================
app.get('/api/orders', requireAuth, (req, res) => {
  const orders = db.prepare(
    'SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC'
  ).all(req.user.id);

  const result = orders.map(order => {
    const items = db.prepare(`
      SELECT oi.*, p.name, p.icon, p.file_path
      FROM order_items oi JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
    `).all(order.id);
    return { ...order, items };
  });

  res.json(result);
});

// Protected download endpoint — only for paid customers
app.get('/api/orders/:orderId/download/:itemId', requireAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?')
    .get(req.params.orderId, req.user.id);
  if (!order) return res.status(403).json({ error: 'Not authorized' });

  const item = db.prepare('SELECT oi.*, p.file_path, p.name FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.id=? AND oi.order_id=?')
    .get(req.params.itemId, order.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  if (!item.file_path) {
    return res.status(404).json({ error: 'File not yet uploaded by admin. Contact support.' });
  }

  const filePath = path.join(UPLOADS_DIR, item.file_path);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on server. Contact support.' });
  }

  const downloadName = `${item.name.replace(/[^a-zA-Z0-9]/g, '_')}.zip`;
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.setHeader('Content-Type', 'application/zip');

  // If already a zip, stream it directly
  const ext = path.extname(item.file_path).toLowerCase();
  if (ext === '.zip') {
    return fs.createReadStream(filePath).pipe(res);
  }

  // Otherwise wrap in a zip on the fly
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', err => res.status(500).json({ error: err.message }));
  archive.pipe(res);
  archive.file(filePath, { name: path.basename(item.file_path) });
  archive.finalize();
});

// ============================================================
//  ADMIN — USERS LIST
// ============================================================
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, first_name, last_name, email, phone, is_admin, newsletter, created_at FROM users ORDER BY created_at DESC').all();
  const withOrderCounts = users.map(u => {
    u.orderCount = db.prepare('SELECT COUNT(*) as n FROM orders WHERE user_id=?').get(u.id).n;
    return u;
  });
  res.json(withOrderCounts);
});

// ============================================================
//  EMAIL
// ============================================================
async function sendOrderConfirmationEmail(user, orderedItems, orderId) {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('⚠️  SendGrid not configured — skipping email');
    return;
  }

  const downloadItems  = orderedItems.filter(i => i.deliveryType === 'download');
  const driveItems     = orderedItems.filter(i => i.deliveryType === 'drive');

  const downloadSection = downloadItems.length > 0 ? `
    <h3 style="color:#00C9A7">⚡ Your Downloads Are Ready!</h3>
    <p>Log in to your account and visit <strong>My Orders</strong> to download your files:</p>
    <ul>
      ${downloadItems.map(i => `<li><strong>${i.product.icon} ${i.product.name}</strong> — $${i.price.toFixed(2)}</li>`).join('')}
    </ul>
    <p>
      <a href="${process.env.SITE_URL || 'https://yoursite.com'}/orders"
         style="background:#FF6B9D;color:white;padding:12px 24px;border-radius:50px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:8px">
        ⬇️ Go to My Downloads
      </a>
    </p>` : '';

  const driveSection = driveItems.length > 0 ? `
    <h3 style="color:#C77DFF">💾 USB Drive Orders</h3>
    <p>We're preparing your USB drive(s) and will ship within 3–5 business days!</p>
    <ul>
      ${driveItems.map(i => `<li><strong>${i.product.icon} ${i.product.name}</strong> — $${i.price.toFixed(2)}</li>`).join('')}
    </ul>` : '';

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#FF6B9D,#C77DFF);padding:30px;text-align:center;border-radius:12px 12px 0 0">
        <h1 style="color:white;margin:0;font-size:28px">🧵 Stitch &amp; Smile Studio</h1>
        <p style="color:rgba(255,255,255,0.9);margin:8px 0 0">Order Confirmation #${orderId}</p>
      </div>
      <div style="background:#fff8fd;padding:30px;border-radius:0 0 12px 12px;border:2px solid #F0D6F5">
        <p style="font-size:18px">Hi <strong>${user.first_name}</strong>! 🎀</p>
        <p>Thank you so much for your order! We're thrilled you chose Stitch &amp; Smile Studio.</p>
        ${downloadSection}
        ${driveSection}
        <hr style="border:1px solid #F0D6F5;margin:24px 0">
        <p style="font-size:13px;color:#888">
          Questions? Reply to this email or visit our site.<br>
          Happy stitching! 🌈
        </p>
      </div>
    </div>`;

  await sgMail.send({
    to:      user.email,
    from:    { email: SHOP_EMAIL, name: SHOP_NAME },
    subject: `🎀 Your Stitch & Smile order is confirmed! (Order #${orderId})`,
    html,
    text: `Hi ${user.first_name}! Your order #${orderId} is confirmed. Log in to download your files: ${process.env.SITE_URL || 'https://yoursite.com'}/orders`,
  });

  console.log(`✅ Confirmation email sent to ${user.email}`);
}

// ============================================================
//  HELPERS
// ============================================================
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, is_admin: user.is_admin === 1 },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function publicUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

function validatePassword(pw) {
  if (!pw || pw.length < 8)          return { valid: false, message: 'Password must be at least 8 characters' };
  if (!/[A-Z]/.test(pw))             return { valid: false, message: 'Password must contain an uppercase letter' };
  if (!/[a-z]/.test(pw))             return { valid: false, message: 'Password must contain a lowercase letter' };
  if (!/[0-9]/.test(pw))             return { valid: false, message: 'Password must contain a number' };
  if (!/[!@#$%^&*()\-_=+[\]{};:'",.<>?/\\|`~]/.test(pw))
    return { valid: false, message: 'Password must contain a special character (!@#$%^&* etc.)' };
  return { valid: true };
}

// Catch-all: serve frontend for any unknown route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start server ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🧵 Stitch & Smile Studio running on port ${PORT}`);
  console.log(`   Visit: http://localhost:${PORT}`);
});
