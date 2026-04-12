const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

const ACCESS_CODE = 'TREX_T0NY';
const SESSION_SECRET = crypto.randomBytes(64).toString('hex');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    sameSite: 'strict',
    maxAge: 1000 * 60 * 60 * 2
  }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated === true) {
    return next();
  }
  // Don't store returnTo for login page or root
  if (req.originalUrl !== '/' && req.originalUrl !== '/auth/login') {
    req.session.returnTo = req.originalUrl;
  }
  return res.redirect('/');
}

const products = [
  { id: 1, name: 'Charizard VMAX', set: 'Darkness Ablaze', price: 89.99, rarity: 'Secret Rare', condition: 'NM', badge: 'HOT', img: 'https://images.pokemontcg.io/swsh3/189_hires.png' },
  { id: 2, name: 'Pikachu V-UNION', set: 'Celebrations', price: 24.99, rarity: 'Ultra Rare', condition: 'NM', badge: 'NEW', img: 'https://images.pokemontcg.io/cel25/1_hires.png' },
  { id: 3, name: 'Mewtwo EX (Full Art)', set: 'Next Destinies', price: 149.99, rarity: 'Full Art', condition: 'LP', badge: 'RARE', img: 'https://images.pokemontcg.io/bw4/98_hires.png' },
  { id: 4, name: 'Rayquaza VMAX', set: 'Evolving Skies', price: 74.99, rarity: 'Secret Rare', condition: 'NM', badge: 'HOT', img: 'https://images.pokemontcg.io/swsh7/218_hires.png' },
  { id: 5, name: 'Umbreon VMAX (Alt Art)', set: 'Evolving Skies', price: 199.99, rarity: 'Alt Art', condition: 'NM', badge: 'LIMITED', img: 'https://images.pokemontcg.io/swsh7/215_hires.png' },
  { id: 6, name: 'Blastoise & Piplup GX', set: 'Cosmic Eclipse', price: 39.99, rarity: 'Tag Team', condition: 'NM', badge: null, img: 'https://images.pokemontcg.io/sm12/38_hires.png' },
  { id: 7, name: 'Lugia V (Alt Art)', set: 'Silver Tempest', price: 129.99, rarity: 'Alt Art', condition: 'NM', badge: 'LIMITED', img: 'https://images.pokemontcg.io/swsh11/186_hires.png' },
  { id: 8, name: 'Booster Bundle (x10)', set: 'Mixed Sets', price: 49.99, rarity: 'Bundle', condition: 'Sealed', badge: 'DEAL', img: 'https://images.pokemontcg.io/swsh7/220_hires.png' },
];

app.get('/', (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect('/catalog');
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/auth/login', (req, res) => {
  const { code, age_verify } = req.body;
  if (!age_verify) return res.status(400).json({ success: false, message: 'Age verification required.' });
  const provided = Buffer.from(String(code));
  const expected = Buffer.from(ACCESS_CODE);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(401).json({ success: false, message: 'Invalid access code.' });
  }
  req.session.authenticated = true;
  req.session.loginTime = Date.now();
  // FIX: Always redirect to catalog after login, ignore returnTo for checkout
  let redirectTo = req.session.returnTo || '/catalog';
  // If trying to return to checkout with empty cart, go to catalog instead
  if (redirectTo === '/checkout') {
    redirectTo = '/catalog';
  }
  delete req.session.returnTo;
  return res.json({ success: true, redirect: redirectTo });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

app.get('/catalog', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'catalog.html'));
});

app.get('/api/products', requireAuth, (req, res) => {
  const { category } = req.query;
  let filtered = products;
  if (category && category !== 'ALL') filtered = products.filter(p => p.rarity.toUpperCase() === category);
  res.json(filtered);
});

app.get('/checkout', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'checkout.html'));
});

app.post('/api/order', requireAuth, (req, res) => {
  const { name, phone, address, items, delivery, payment } = req.body;
  if (!name || !phone || !address || !items || !delivery || !payment) {
    return res.status(400).json({ success: false, message: 'Missing required fields.' });
  }
  const itemList = items.map(i => `• ${i.name} x${i.qty} - £${i.price}`).join('\n');
  const total = items.reduce((sum, i) => sum + (parseFloat(i.price) * i.qty), 0).toFixed(2);
  const message = `*[ORDER DETAILS]*\n*DELIVERY TO:*\nName: ${name}\nPhone: ${phone}\nAddress: ${address}\n\n*ITEMS:*\n${itemList}\n\n*SUBTOTAL:* £${total}\n*PAYMENT:* ${payment}\n*DELIVERY:* ${delivery}`;
  const whatsappNumber = '447000000000';
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  res.json({ success: true, whatsappUrl });
});

// CRYPTO PAYMENT ENDPOINTS
app.post('/api/crypto-init', requireAuth, async (req, res) => {
  const { orderId, currency, fiatAmount, name, phone, address, items, delivery, payment } = req.body;
  if (!orderId || !currency || !fiatAmount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Store addresses securely server-side only (use env vars in production)
  const CRYPTO_CONFIG = {
    BTC: { address: process.env.BTC_WALLET || 'YOUR_BTC_ADDRESS', network: 'Bitcoin', decimals: 8 },
    ETH: { address: process.env.ETH_WALLET || 'YOUR_ETH_ADDRESS', network: 'Ethereum (ERC20)', decimals: 18 },
    USDT: { address: process.env.USDT_WALLET || 'YOUR_USDT_ADDRESS', network: 'Tron (TRC20)', decimals: 6 },
    USDC: { address: process.env.USDC_WALLET || 'YOUR_USDC_ADDRESS', network: 'Ethereum (ERC20)', decimals: 6 }
  };

  const CRYPTO_RATES = { BTC: 0.000015, ETH: 0.00025, USDT: 1.25, USDC: 1.25 };

  const config = CRYPTO_CONFIG[currency];
  if (!config) return res.status(400).json({ error: 'Unsupported currency' });

  const cryptoAmount = (fiatAmount * CRYPTO_RATES[currency]).toFixed(config.decimals);

  // Store order in memory (use database in production)
  if (!app.locals.orders) app.locals.orders = {};
  app.locals.orders[orderId] = {
    orderId, customerName: name, customerPhone: phone, customerAddress: address,
    items, delivery, paymentMethod: payment, cryptoCurrency: currency,
    cryptoAddress: config.address, cryptoAmount, fiatAmount, status: 'pending',
    createdAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60 * 1000)
  };

  res.json({
    address: config.address,
    cryptoAmount,
    network: config.network,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000)
  });
});

app.get('/api/crypto-status', requireAuth, (req, res) => {
  const { orderId } = req.query;
  const order = app.locals.orders?.[orderId];
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (new Date() > order.expiresAt && order.status === 'pending') {
    order.status = 'expired';
  }
  res.json({ status: order.status });
});

// 404 handler - FIXED
app.use((req, res) => {
  if (req.session && req.session.authenticated) {
    res.status(404).redirect('/catalog');
  } else {
    res.redirect('/');
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\nTONYY SHOP running at http://localhost:${PORT}`);
  console.log(`Access code: ${ACCESS_CODE}\n`);
});