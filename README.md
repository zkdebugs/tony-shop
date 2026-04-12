# 🃏 TONYY SHOP — Secure Pokemon Card Marketplace

A cyberpunk-aesthetic Pokémon card shop with **server-side session authentication** and fully protected routes.

## Stack
- **Node.js + Express** — minimal, no bloat
- **express-session** — server-side session management
- **No database** — all data in-memory

---

## Quick Start

```bash
npm install
node server.js
```

Visit: http://localhost:3000
Access code: `TONYY SHOP2024`

---

## Security Architecture

### Route Protection (the main fix)
Every protected route runs the `requireAuth` middleware **on the server**:

```js
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated === true) return next();
  req.session.returnTo = req.originalUrl;  // remember where they wanted to go
  return res.redirect('/');
}
```

This means:
- Visiting `/catalog` directly → **redirected to login**, no HTML served
- Visiting `/checkout` directly → **redirected to login**
- API endpoints (`/api/products`, `/api/order`) → **401** if not authenticated
- **No frontend trick can bypass this** — the session check is on the server

### Timing-Safe Password Comparison
Prevents timing attacks that could leak whether the code is partially correct:

```js
const provided = Buffer.from(String(code));
const expected = Buffer.from(ACCESS_CODE);
if (!crypto.timingSafeEqual(provided, expected)) { ... }
```

### Session Cookie Security
```js
cookie: {
  httpOnly: true,      // JS can't read the cookie — blocks XSS theft
  sameSite: 'strict',  // Blocks CSRF attacks
  maxAge: 7200000      // 2 hour expiry
}
```

### Session Secret
Generated fresh on each server start using `crypto.randomBytes(64)`.
In production, load from an environment variable:
```js
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex');
```

---

## Customisation

### Change the access code
```js
// server.js line ~13
const ACCESS_CODE = 'YOUR_CODE_HERE';
```

### Update WhatsApp number
```js
// server.js near bottom of /api/order
const whatsappNumber = '447XXXXXXXXX'; // UK format, no +
```

### Add/edit products
Edit the `products` array in `server.js` — no database needed.

### Production checklist
- [ ] Set `cookie.secure = true` (requires HTTPS)
- [ ] Set `SESSION_SECRET` as environment variable
- [ ] Change `ACCESS_CODE` to something strong
- [ ] Update WhatsApp number
- [ ] Consider rate-limiting `/auth/login`

---

## File Structure

```
TONYY SHOP/
├── server.js          ← All routing + auth logic
├── views/
│   ├── login.html     ← Public: login page
│   ├── catalog.html   ← Protected: product catalog
│   └── checkout.html  ← Protected: checkout + WhatsApp order
└── package.json
```
