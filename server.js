const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const app = express();
const PORT = 3000;
const ACCESS_CODE = process.env.ACCESS_CODE;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex');
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
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

const products = [
  // INJECTABLES
  { id: 1, name: 'Test E 300mg', set: 'Premium Oil', price: 30.00, rarity: 'INJECTABLES', condition: 'Lab Tested', badge: 'HOT', img: '/injectable_vial_premium.png' },
  { id: 2, name: 'Test C 250mg', set: 'Premium Oil', price: 30.00, rarity: 'INJECTABLES', condition: 'Lab Tested', badge: null, img: '/injectable_vial_premium.png' },
  { id: 3, name: 'Test P 120mg', set: 'Premium Oil', price: 25.00, rarity: 'INJECTABLES', condition: 'Lab Tested', badge: null, img: '/injectable_vial_premium.png' },
  { id: 4, name: 'Sustanon 300mg', set: 'Multi-Ester', price: 30.00, rarity: 'INJECTABLES', condition: 'Lab Tested', badge: 'HOT', img: '/injectable_vial_premium.png' },
  { id: 5, name: 'Test 400mg', set: 'Super Bulk', price: 35.00, rarity: 'INJECTABLES', condition: 'Lab Tested', badge: 'RARE', img: '/injectable_vial_premium.png' },
  { id: 6, name: 'NPP 150mg', set: 'Quick Deca', price: 30.00, rarity: 'INJECTABLES', condition: 'Lab Tested', badge: null, img: '/injectable_vial_premium.png' },
  { id: 7, name: 'Deca 330mg', set: 'Joint Support', price: 30.00, rarity: 'INJECTABLES', condition: 'Lab Tested', badge: null, img: '/injectable_vial_premium.png' },
  { id: 8, name: 'EQ 350mg', set: 'Endurance', price: 30.00, rarity: 'INJECTABLES', condition: 'Lab Tested', badge: null, img: '/injectable_vial_premium.png' },
  { id: 9, name: 'Mast P 150mg', set: 'Cutting', price: 30.00, rarity: 'INJECTABLES', condition: 'Lab Tested', badge: null, img: '/injectable_vial_premium.png' },
  { id: 10, name: 'Mast E 250mg', set: 'Cutting', price: 35.00, rarity: 'INJECTABLES', condition: 'Lab Tested', badge: 'LIMITED', img: '/injectable_vial_premium.png' },
  { id: 11, name: 'Tren A 120mg', set: 'Hardcore', price: 30.00, rarity: 'INJECTABLES', condition: 'Lab Tested', badge: 'HOT', img: '/injectable_vial_premium.png' },
  { id: 12, name: 'Tren E 250mg', set: 'Hardcore', price: 35.00, rarity: 'INJECTABLES', condition: 'Lab Tested', badge: 'LIMITED', img: '/injectable_vial_premium.png' },
  { id: 13, name: 'Primobolan 150mg', set: 'Gentle Lean', price: 55.00, rarity: 'INJECTABLES', condition: 'Lab Tested', badge: 'RARE', img: '/injectable_vial_premium.png' },

  // ORALS
  { id: 14, name: 'Dbol 20mg', set: 'Crown Pharma', price: 25.00, rarity: 'ORALS', condition: '50 Tabs', badge: 'HOT', img: '/oral_steroid_pack_premium.png' },
  { id: 15, name: 'Dbol 50mg', set: 'Crown Pharma', price: 30.00, rarity: 'ORALS', condition: '50 Tabs', badge: null, img: '/oral_steroid_pack_premium.png' },
  { id: 16, name: 'Oxy 50mg', set: 'Crown Pharma', price: 35.00, rarity: 'ORALS', condition: '50 Tabs', badge: 'HOT', img: '/oral_steroid_pack_premium.png' },
  { id: 17, name: 'Anavar 20mg', set: 'Crown Pharma', price: 36.00, rarity: 'ORALS', condition: '50 Tabs', badge: null, img: '/oral_steroid_pack_premium.png' },
  { id: 18, name: 'Anavar 50mg', set: 'Crown Pharma', price: 45.00, rarity: 'ORALS', condition: '50 Tabs', badge: 'LIMITED', img: '/oral_steroid_pack_premium.png' },
  { id: 19, name: 'Winstrol 20mg', set: 'Crown Pharma', price: 25.00, rarity: 'ORALS', condition: '50 Tabs', badge: null, img: '/oral_steroid_pack_premium.png' },
  { id: 20, name: 'Winstrol 50mg', set: 'Crown Pharma', price: 30.00, rarity: 'ORALS', condition: '50 Tabs', badge: null, img: '/oral_steroid_pack_premium.png' },
  { id: 21, name: 'Turinabol 20mg', set: 'Crown Pharma', price: 30.00, rarity: 'ORALS', condition: '50 Tabs', badge: null, img: '/oral_steroid_pack_premium.png' },
  { id: 22, name: 'Proviron 20mg', set: 'Crown Pharma', price: 25.00, rarity: 'ORALS', condition: '50 Tabs', badge: null, img: '/oral_steroid_pack_premium.png' },
  { id: 23, name: 'Telmisartan 40mg', set: 'Crown Pharma', price: 25.00, rarity: 'ORALS', condition: '50 Tabs', badge: null, img: '/oral_steroid_pack_premium.png' },
  { id: 24, name: 'Yohimbine 5mg', set: 'Crown Pharma', price: 25.00, rarity: 'ORALS', condition: '50 Tabs', badge: null, img: '/oral_steroid_pack_premium.png' },
  { id: 25, name: 'Superdrol 20mg', set: 'Crown Pharma', price: 25.00, rarity: 'ORALS', condition: '50 Tabs', badge: 'RARE', img: '/oral_steroid_pack_premium.png' },
  { id: 26, name: 'Melatonin 5mg', set: 'Crown Pharma', price: 20.00, rarity: 'ORALS', condition: '100 Tabs', badge: 'DEAL', img: '/oral_steroid_pack_premium.png' },

  // PEPTIDES
  { id: 27, name: 'Bpc157 10mg', set: 'Healing', price: 25.00, rarity: 'PEPTIDES', condition: 'Lab Tested', badge: null, img: '/peptide_vial_high_tech.png' },
  { id: 28, name: 'GHK-CU 100mg', set: 'Healing', price: 45.00, rarity: 'PEPTIDES', condition: 'Lab Tested', badge: null, img: '/peptide_vial_high_tech.png' },
  { id: 29, name: 'Kisspeptin 10mg', set: 'Hormone', price: 40.00, rarity: 'PEPTIDES', condition: 'Lab Tested', badge: null, img: '/peptide_vial_high_tech.png' },
  { id: 30, name: 'MT2 10mg', set: 'Tanning', price: 45.00, rarity: 'PEPTIDES', condition: 'Lab Tested', badge: 'HOT', img: '/peptide_vial_high_tech.png' },
  { id: 31, name: 'Glow 50mg', set: 'Advanced', price: 70.00, rarity: 'PEPTIDES', condition: 'Lab Tested', badge: 'RARE', img: '/peptide_vial_high_tech.png' },
  { id: 32, name: 'Reta Pens 20mg', set: 'Fat Loss', price: 120.00, rarity: 'PEPTIDES', condition: 'Lab Tested', badge: 'LIMITED', img: '/peptide_vial_high_tech.png' },
  { id: 33, name: 'Reta 30mg Vials', set: 'Fat Loss', price: 150.00, rarity: 'PEPTIDES', condition: 'Lab Tested', badge: 'LIMITED', img: '/peptide_vial_high_tech.png' },
];

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