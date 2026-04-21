const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config();
const app = express();
const PORT = 3000;
const ACCESS_CODE = process.env.ACCESS_CODE;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Strictly restrict Admin brute force
  message: { success: false, message: 'Too many admin login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Configure Multer for secure image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'img-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only images (jpeg, jpg, png, webp, gif) are allowed!'));
    }
  }
});

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

function requireAdminAuth(req, res, next) {
  if (req.session && req.session.adminAuthenticated === true) {
    return next();
  }
  return res.redirect('/admin/login');
}

function loadProducts() {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'products.json'), 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading products.json:', err);
    return [];
  }
}

function saveProducts(data) {
  try {
    fs.writeFileSync(path.join(__dirname, 'products.json'), JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving products.json:', err);
  }
}

let products = loadProducts();

app.get('/', (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect('/catalog');
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/auth/login', loginLimiter, (req, res) => {
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

// ADMIN ROUTES

app.get('/admin/login', (req, res) => {
  if (req.session && req.session.adminAuthenticated) return res.redirect('/admin');
  res.sendFile(path.join(__dirname, 'views', 'admin-login.html'));
});

app.post('/admin/auth', adminLimiter, (req, res) => {
  const { username, password } = req.body;
  
  const userSafe = Buffer.from(username || '');
  const expectedUser = Buffer.from(ADMIN_USERNAME);
  const passSafe = Buffer.from(password || '');
  const expectedPass = Buffer.from(ADMIN_PASSWORD);
  
  // Prevent length mismatch crash & use timing safe equal to prevent timing attacks
  const userMatch = userSafe.length === expectedUser.length && crypto.timingSafeEqual(userSafe, expectedUser);
  const passMatch = passSafe.length === expectedPass.length && crypto.timingSafeEqual(passSafe, expectedPass);
  
  if (userMatch && passMatch) {
    req.session.adminAuthenticated = true;
    return res.json({ success: true, redirect: '/admin' });
  }
  
  return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
});

app.post('/admin/logout', (req, res) => {
  if (req.session) {
    req.session.adminAuthenticated = false;
  }
  res.redirect('/');
});

app.get('/admin', requireAdminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-dashboard.html'));
});

app.get('/api/admin/products', requireAdminAuth, (req, res) => {
  res.json(products);
});

app.post('/api/admin/product', requireAdminAuth, (req, res) => {
  const { name, set, price, rarity, condition, badge, img } = req.body;
  if (!name || isNaN(price) || !rarity) {
    return res.status(400).json({ success: false, message: 'Invalid product data.' });
  }
  
  const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
  const newProduct = {
    id: newId,
    name,
    set: set || '',
    price: parseFloat(price),
    rarity,
    condition: condition || '',
    badge: badge === '' ? null : badge,
    img: img || '/placeholder.png'
  };
  
  products.push(newProduct);
  saveProducts(products);
  res.json({ success: true, product: newProduct });
});

app.put('/api/admin/product/:id', requireAdminAuth, (req, res) => {
  const { id } = req.params;
  const index = products.findIndex(p => p.id === parseInt(id));
  if (index === -1) return res.status(404).json({ success: false, message: 'Product not found.' });
  
  const { name, set, price, rarity, condition, badge, img } = req.body;
  
  if (name) products[index].name = name;
  if (set !== undefined) products[index].set = set;
  if (price !== undefined && !isNaN(price)) products[index].price = parseFloat(price);
  if (rarity) products[index].rarity = rarity;
  if (condition !== undefined) products[index].condition = condition;
  if (badge !== undefined) products[index].badge = badge === '' ? null : badge;
  if (img) products[index].img = img;
  
  saveProducts(products);
  res.json({ success: true, product: products[index] });
});

app.delete('/api/admin/product/:id', requireAdminAuth, (req, res) => {
  const { id } = req.params;
  const index = products.findIndex(p => p.id === parseInt(id));
  if (index === -1) return res.status(404).json({ success: false, message: 'Product not found.' });
  
  products.splice(index, 1);
  saveProducts(products);
  res.json({ success: true });
});

// Secure image upload endpoint for Admin
app.post('/api/admin/upload-image', requireAdminAuth, (req, res) => {
  upload.single('image')(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: err.message });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image uploaded.' });
    }
    
    // Normalize path to use forward slashes for URLs
    const imageUrl = '/uploads/' + req.file.filename;
    res.json({ success: true, imgUrl: imageUrl });
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

// HELPER: Fetch Live Crypto Rates
async function getCryptoRates() {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: 'bitcoin,ethereum,tether,usd-coin',
        vs_currencies: 'gbp'
      }
    });
    return {
      BTC: 1 / response.data.bitcoin.gbp,
      ETH: 1 / response.data.ethereum.gbp,
      USDT: 1 / response.data.tether.gbp,
      USDC: 1 / response.data['usd-coin'].gbp
    };
  } catch (err) {
    console.error('Error fetching rates:', err.message);
    return { BTC: 0.000015, ETH: 0.00025, USDT: 1.25, USDC: 1.25 }; // Fallback
  }
}

// BLOCKCHAIN MONITORING ENGINE
async function checkBlockchainTransactions() {
  if (!app.locals.orders) return;
  const now = new Date();

  for (const orderId in app.locals.orders) {
    const order = app.locals.orders[orderId];
    if (order.status !== 'pending' && order.status !== 'detecting') continue;
    if (now > order.expiresAt) { order.status = 'expired'; continue; }

    try {
      let detectedTx = null;
      const amountToFind = parseFloat(order.cryptoAmount);

      if (order.cryptoCurrency === 'BTC') {
        const res = await axios.get(`https://api.blockcypher.com/v1/btc/main/addrs/${order.cryptoAddress}/full?limit=10`);
        detectedTx = res.data.txs?.find(tx =>
          tx.outputs.some(out => Math.abs((out.value / 100000000) - amountToFind) < 0.00000001)
        );
        if (detectedTx && detectedTx.confirmations >= 3) order.status = 'confirmed';
      }
      else if (order.cryptoCurrency === 'ETH') {
        const apiKey = process.env.ETHERSCAN_API_KEY;
        const res = await axios.get(`https://api.etherscan.io/api?module=account&action=txlist&address=${order.cryptoAddress}&sort=desc&apikey=${apiKey}`);
        detectedTx = res.data.result?.find(tx =>
          Math.abs((parseFloat(tx.value) / 1e18) - amountToFind) < 0.00000001
        );
        if (detectedTx && parseInt(detectedTx.confirmations) >= 3) order.status = 'confirmed';
      }
      else if (order.cryptoCurrency === 'USDT') {
        const res = await axios.get(`https://api.trongrid.io/v1/accounts/${order.cryptoAddress}/transactions/trc20?limit=20`, {
          headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY || '' }
        });
        detectedTx = res.data.data?.find(tx =>
          tx.token_info.symbol === 'USDT' &&
          Math.abs((parseInt(tx.value) / 1e6) - amountToFind) < 0.01
        );
        // TronGrid doesn't return confirmations in this endpoint, usually 1 confirmation is near-instant
        // For 3 confirmations, we can check the block height or just assume confirmed if seen (TRON is very fast)
        if (detectedTx) order.status = 'confirmed';
      }
      else if (order.cryptoCurrency === 'USDC') {
        // USDC on Ethereum check
        const apiKey = process.env.ETHERSCAN_API_KEY;
        const res = await axios.get(`https://api.etherscan.io/api?module=account&action=tokentx&address=${order.cryptoAddress}&sort=desc&apikey=${apiKey}`);
        detectedTx = res.data.result?.find(tx =>
          tx.tokenSymbol === 'USDC' &&
          Math.abs((parseFloat(tx.value) / 1e6) - amountToFind) < 0.01
        );
        if (detectedTx && parseInt(detectedTx.confirmations) >= 3) order.status = 'confirmed';
      }

      if (detectedTx && order.status !== 'confirmed') {
        order.status = 'detecting'; // Payment seen, waiting for confirmations
      }
    } catch (err) {
      console.error(`Error checking blockchain for order ${orderId}:`, err.message);
    }
  }
}

// Run monitoring every 45 seconds
setInterval(checkBlockchainTransactions, 45000);

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

  const rates = await getCryptoRates();
  const config = CRYPTO_CONFIG[currency];
  if (!config) return res.status(400).json({ error: 'Unsupported currency' });

  // Add unique "dust" to identify order (0.00000001 - 0.00000999)
  const dust = (Math.floor(Math.random() * 999) + 1) / Math.pow(10, config.decimals);
  const cryptoAmount = ((fiatAmount * rates[currency]) + dust).toFixed(config.decimals);

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
  console.log(`\nMONARCH LABS running at http://localhost:${PORT}`);
  console.log(`Access code: ${ACCESS_CODE}\n`);
});