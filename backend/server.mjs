/* =========================================================
   TANDOOR ET GRILLE — static server + order backend
   Vanilla Node (no deps). Serves the site AND provides the
   order API + live SSE stream that powers the dashboard.
   Run (from the site root):  node backend/server.mjs
   (PORT env optional, default 8210)

   NOTE: this lives in backend/ deliberately — the site itself is
   deployed to Vercel as a pure static site, and a server file at
   the repo root makes Vercel misdetect the project as a Node app.
   This backend needs an always-on Node host (Render/Railway/Fly),
   not Vercel, because it keeps orders/customers on local disk and
   holds long-lived SSE connections for the kitchen dashboard.
   ========================================================= */
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

// Site root is the parent of backend/ — static files and .data/ live there.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = process.env.PORT || 8210;
const OWNER_PASS = process.env.OWNER_PASS || 'tandoor2024';
// Online ordering is temporarily disabled (menu/site still being finalized).
// The UI already hides checkout; this is the server-side backstop so no order
// can be created even via a stale cached page or a direct API call.
// Set ORDERING_ENABLED=true in the environment (or flip the default below)
// to re-open checkout — the front end's own flag in js/order.js must match.
const ORDERING_ENABLED = process.env.ORDERING_ENABLED === 'true';
const DATA_DIR = join(ROOT, '.data');
const DATA_FILE = join(DATA_DIR, 'orders.json');
const CUSTOMERS_FILE = join(DATA_DIR, 'customers.json');
const SECRET_FILE = join(DATA_DIR, 'secret.txt');

/* ---------------- auth secret (stable across restarts) ---------------- */
let SECRET = process.env.AUTH_SECRET || '';
if (!SECRET) {
  try {
    if (existsSync(SECRET_FILE)) SECRET = readFileSync(SECRET_FILE, 'utf8').trim();
  } catch {}
  if (!SECRET) {
    SECRET = crypto.randomBytes(32).toString('hex');
    try { mkdirSync(DATA_DIR, { recursive: true }); writeFileSync(SECRET_FILE, SECRET); } catch {}
  }
}

/* ---------------- order store (file-backed) ---------------- */
const bus = new EventEmitter();
bus.setMaxListeners(0);
let orders = [];
try {
  if (existsSync(DATA_FILE)) orders = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
} catch { orders = []; }

async function persist() {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(DATA_FILE, JSON.stringify(orders, null, 2));
  } catch (e) { console.error('persist failed', e); }
}

function orderNumber() {
  const n = orders.length + 1;
  return 'TG' + String(1000 + n);
}

const STATUS_FLOW = ['pending', 'accepted', 'preparing', 'ready', 'completed'];

/* ---------------- customer accounts (file-backed) ---------------- */
let customers = [];
try {
  if (existsSync(CUSTOMERS_FILE)) customers = JSON.parse(readFileSync(CUSTOMERS_FILE, 'utf8'));
} catch { customers = []; }

async function persistCustomers() {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(CUSTOMERS_FILE, JSON.stringify(customers, null, 2));
  } catch (e) { console.error('persist customers failed', e); }
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}
function makeCustomer(email, password, name, phone) {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    id: crypto.randomUUID(),
    email: String(email).toLowerCase().trim(),
    name: String(name || '').slice(0, 80),
    phone: String(phone || '').slice(0, 40),
    salt,
    hash: hashPassword(password, salt),
    marketingOptIn: true,
    createdAt: Date.now(),
  };
}
function verifyPassword(cust, password) {
  const h = hashPassword(password, cust.salt);
  const a = Buffer.from(h, 'hex'), b = Buffer.from(cust.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------------- stateless session tokens (HMAC) ---------------- */
function b64url(buf) { return Buffer.from(buf).toString('base64url'); }
function signToken(customerId) {
  const payload = b64url(JSON.stringify({ sub: customerId, exp: Date.now() + 1000 * 60 * 60 * 24 * 60 })); // 60 days
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function verifyToken(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [payload, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.exp || data.exp < Date.now()) return null;
    return data.sub;
  } catch { return null; }
}
function customerFromReq(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const id = verifyToken(token);
  return id ? customers.find((c) => c.id === id) || null : null;
}
function publicCustomer(c) { return { id: c.id, email: c.email, name: c.name, phone: c.phone }; }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------------- helpers ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'Cache-Control': 'no-cache', ...headers });
  res.end(body);
}
function json(res, code, obj) {
  send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });
}
function isOwner(req, url) {
  const key = req.headers['x-owner-key'] || url.searchParams.get('key');
  return key === OWNER_PASS;
}

/* ---------------- API ---------------- */
async function handleApi(req, res, url) {
  const path = url.pathname;

  // ---- customer signup ----
  if (path === '/api/auth/signup' && req.method === 'POST') {
    const body = await readBody(req);
    const email = String(body.email || '').toLowerCase().trim();
    if (!EMAIL_RE.test(email)) return json(res, 400, { error: 'invalid email' });
    if (String(body.password || '').length < 6) return json(res, 400, { error: 'password too short' });
    if (!body.name || !body.phone) return json(res, 400, { error: 'name and phone required' });
    if (customers.some((c) => c.email === email)) return json(res, 409, { error: 'email already registered' });
    const cust = makeCustomer(email, body.password, body.name, body.phone);
    customers.push(cust);
    persistCustomers();
    return json(res, 201, { token: signToken(cust.id), customer: publicCustomer(cust) });
  }

  // ---- customer login ----
  if (path === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody(req);
    const email = String(body.email || '').toLowerCase().trim();
    const cust = customers.find((c) => c.email === email);
    if (!cust || !verifyPassword(cust, body.password || '')) return json(res, 401, { error: 'invalid email or password' });
    return json(res, 200, { token: signToken(cust.id), customer: publicCustomer(cust) });
  }

  // ---- who am I ----
  if (path === '/api/auth/me' && req.method === 'GET') {
    const cust = customerFromReq(req);
    if (!cust) return json(res, 401, { error: 'not signed in' });
    return json(res, 200, { customer: publicCustomer(cust) });
  }

  // ---- owner: export customer emails ----
  if (path === '/api/customers' && req.method === 'GET') {
    if (!isOwner(req, url)) return json(res, 401, { error: 'unauthorized' });
    const list = [...customers].sort((a, b) => b.createdAt - a.createdAt).map((c) => ({
      email: c.email, name: c.name, phone: c.phone,
      marketingOptIn: c.marketingOptIn !== false,
      createdAt: c.createdAt,
      orders: orders.filter((o) => o.customerId === c.id).length,
    }));
    return json(res, 200, { customers: list });
  }

  // create order (requires a signed-in customer)
  if (path === '/api/orders' && req.method === 'POST') {
    if (!ORDERING_ENABLED) return json(res, 503, { error: 'ordering temporarily disabled' });
    const account = customerFromReq(req);
    if (!account) return json(res, 401, { error: 'sign in required' });
    const body = await readBody(req);
    if (!Array.isArray(body.items) || !body.items.length) return json(res, 400, { error: 'empty order' });
    const name = (body.customer && body.customer.name) || account.name;
    const phone = (body.customer && body.customer.phone) || account.phone;
    if (!name || !phone) return json(res, 400, { error: 'missing customer' });
    const order = {
      id: crypto.randomUUID(),
      number: orderNumber(),
      items: body.items,          // [{name, qty, price}]
      subtotal: Number(body.subtotal) || 0,
      tax: Number(body.tax) || 0,
      total: Number(body.total) || 0,
      customerId: account.id,
      customer: {
        name: String(name).slice(0, 80),
        phone: String(phone).slice(0, 40),
        email: account.email,
        pickupTime: String((body.customer && body.customer.pickupTime) || 'ASAP').slice(0, 60),
        notes: String((body.customer && body.customer.notes) || '').slice(0, 500),
      },
      lang: body.lang === 'fr' ? 'fr' : 'en',
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    orders.push(order);
    persist();
    bus.emit('event', { type: 'created', order });
    return json(res, 201, { order });
  }

  // list orders (owner)
  if (path === '/api/orders' && req.method === 'GET') {
    if (!isOwner(req, url)) return json(res, 401, { error: 'unauthorized' });
    const list = [...orders].sort((a, b) => b.createdAt - a.createdAt);
    return json(res, 200, { orders: list });
  }

  // live stream (owner) — must be checked before the single-order regex
  if (path === '/api/orders/stream' && req.method === 'GET') {
    if (!isOwner(req, url)) return json(res, 401, { error: 'unauthorized' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const snap = [...orders].sort((a, b) => b.createdAt - a.createdAt);
    res.write(`data: ${JSON.stringify({ type: 'snapshot', orders: snap })}\n\n`);
    const onEvt = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    bus.on('event', onEvt);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); bus.off('event', onEvt); });
    return;
  }

  // single order (public — for customer status lookup)
  const m = path.match(/^\/api\/orders\/([^/]+)$/);
  if (m && req.method === 'GET') {
    const o = orders.find((x) => x.id === m[1] || x.number === m[1]);
    if (!o) return json(res, 404, { error: 'not found' });
    return json(res, 200, { order: o });
  }

  // update status (owner)
  if (m && req.method === 'PATCH') {
    if (!isOwner(req, url)) return json(res, 401, { error: 'unauthorized' });
    const body = await readBody(req);
    const o = orders.find((x) => x.id === m[1]);
    if (!o) return json(res, 404, { error: 'not found' });
    const next = body.status;
    if (!['pending', 'accepted', 'preparing', 'ready', 'completed', 'denied'].includes(next))
      return json(res, 400, { error: 'bad status' });
    o.status = next;
    o.updatedAt = Date.now();
    persist();
    bus.emit('event', { type: 'updated', order: o });
    return json(res, 200, { order: o });
  }

  return json(res, 404, { error: 'no route' });
}

/* ---------------- static ---------------- */
async function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  // dashboard/order friendly URLs
  if (p === '/order') p = '/order.html';
  if (p === '/dashboard') p = '/dashboard.html';
  if (p === '/hall') p = '/hall.html';
  const safe = normalize(p).replace(/^(\.\.[/\\])+/, '');
  // Never serve the backend source, the private data store, or any dotfile
  // (.data/ holds the auth secret + customer records).
  if (/^[/\\]?(backend|\.data)([/\\]|$)/.test(safe) || /(^|[/\\])\.[^/\\]+/.test(safe)) {
    return send(res, 404, 'Not found');
  }
  const file = join(ROOT, safe);
  if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden');
  try {
    const data = await readFile(file);
    const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
    send(res, 200, data, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  } catch {
    send(res, 404, 'Not found');
  }
}

/* ---------------- server ---------------- */
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    json(res, 500, { error: 'server error' });
  }
}).listen(PORT, () => {
  console.log(`Tandoor et Grille running → http://localhost:${PORT}`);
  console.log(`Dashboard → http://localhost:${PORT}/dashboard.html  (passcode: ${OWNER_PASS})`);
});
