#!/usr/bin/env node
/**
 * TAZ Furnitures Management System — Backend API v2.4
 * Pure Node.js · No external dependencies · JSON file database
 * 
 * Start: node server.js
 * Default: http://localhost:3747
 */

'use strict';

const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const url     = require('url');

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const PORT    = process.env.PORT || 3747;
const DB_PATH = path.join(__dirname, 'data', 'taz_db.json');
const LOG_PATH= path.join(__dirname, 'data', 'taz_log.ndjson');
const SECRET  = process.env.JWT_SECRET || 'taz-furnitures-secret-2024-mzuzu';
const TOKEN_TTL = 8 * 60 * 60 * 1000; // 8 hours
const ACCESS_KEY = process.env.API_KEY || 'mysecret123';

if (!process.env.API_KEY) {
  console.warn('[SECURITY] API_KEY is not set. Using default key taz-access-key for local use. Set API_KEY in environment for production.');
}

function requireApiKey(req, res) {
  const key = req.headers['x-api-key'];
  if (!key || key !== ACCESS_KEY) {
    return err(res, 401, 'Unauthorized');
  }
  return true;
}

// ─────────────────────────────────────────────
// DATABASE (JSON flat-file with atomic writes)
// ─────────────────────────────────────────────
const SCHEMA = {
  meta:      { version: '2.4', created: new Date().toISOString(), workshop: 'TAZ Furnitures', location: 'Mzuzu, Malawi' },
  settings:  { pin_owner: hashPin('1234'), pin_cashier: hashPin('5678'), workshop_name: 'TAZ Furnitures', location: 'Mzuzu, Malawi', phone: '', currency: 'MWK', tax_rate: 0 },
  sessions:  {},          // token -> { expires, role }
  orders:    [],
  payments:  [],
  expenses:  [],
  workers:   [],
  clients:   [],
  suppliers: [],
  stock:     [],
  sales:     [],
  audit_log: []
};

function hashPin(pin) {
  return crypto.createHmac('sha256', SECRET).update(pin).digest('hex');
}

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      const data = JSON.parse(raw);
      // Merge missing keys from schema
      return { ...SCHEMA, ...data, settings: { ...SCHEMA.settings, ...data.settings }, sessions: data.sessions || {} };
    }
  } catch (e) {
    console.error('[DB] Load error:', e.message);
  }
  return { ...SCHEMA };
}

function saveDB() {
  const tmp = DB_PATH + '.tmp';
  // Clean expired sessions before saving
  const now = Date.now();
  Object.keys(DB.sessions).forEach(t => { if (DB.sessions[t].expires < now) delete DB.sessions[t]; });
  // Keep audit_log to last 1000
  if (DB.audit_log.length > 1000) DB.audit_log = DB.audit_log.slice(-1000);
  fs.writeFileSync(tmp, JSON.stringify(DB, null, 2), 'utf8');
  fs.renameSync(tmp, DB_PATH);
}

function appendLog(entry) {
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n');
  } catch {}
}

// Ensure data directory
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
let DB = loadDB();
DB.stock = (DB.stock || []).map(x => ({ ...x, cost_price: Number(x.cost_price) || 0 }));
DB.sales = (DB.sales || []).map(x => ({ ...x, cost_price: Number(x.cost_price) || 0, cost_total: Number(x.cost_total) || ((Number(x.cost_price) || 0) * (Number(x.qty) || 0)), profit: Number(x.profit) || ((Number(x.total) || 0) - ((Number(x.cost_price) || 0) * (Number(x.qty) || 0))) }));
console.log(`[DB] Loaded — Orders:${DB.orders.length} Workers:${DB.workers.length} Clients:${DB.clients.length}`);

// ─────────────────────────────────────────────
// SEED DATA (only if empty)
// ─────────────────────────────────────────────
function seedIfEmpty() {
  if (DB.orders.length > 0) return;
  console.log('[DB] Seeding initial data…');
  DB.clients = [
    { id:'C001', name:'Martha Eji',          phone:'',          email:'', loc:'Mataifa, Mzuzu',        notes:'Cream white 3,2,2',      created:'2025-08-14' },
    { id:'C002', name:'Lilian',              phone:'990357543', email:'', loc:'Mzuzu, Mpherembe',      notes:'Brown 3,2,1',            created:'2025-08-14' },
    { id:'C003', name:'Sibongire Jere',      phone:'882118942', email:'', loc:'Euthini, Mzimba',       notes:'Dark grey L-shape',      created:'2025-08-14' },
    { id:'C004', name:'Mbale',               phone:'989868145', email:'', loc:'Mzuzu',                  notes:'Blue bed',               created:'2025-08-14' },
    { id:'C005', name:'Mtaski',              phone:'',          email:'', loc:'Ekwendeni',              notes:'2 seater + kitchen unit', created:'2025-08-14' },
    { id:'C006', name:'Lyson Sibande',       phone:'993609037', email:'', loc:'Mzuzu',                  notes:'Cream white 3,2,1',      created:'2025-08-14' },
    { id:'C007', name:'Khaze Bujo',          phone:'',          email:'', loc:'South Africa',           notes:'Rose queen bed',         created:'2025-08-14' },
    { id:'C008', name:'Chigomezgo Mwanmke',  phone:'999695031', email:'', loc:'Mzuzu',                  notes:'Brown board bed queen',  created:'2025-08-14' },
    { id:'C009', name:'Chimwemwe Mwalwanda', phone:'993983982', email:'', loc:'Mzuzu',                  notes:'Black 3 seater L-shape', created:'2025-08-14' },
    { id:'C010', name:'Yama Sten Khwa',      phone:'991833286', email:'', loc:"Mzuzu, Ching'ambo",     notes:'L-shape, single, double', created:'2025-08-14' },
    { id:'C011', name:'Anganile',            phone:'888810703', email:'', loc:'Geisha',                 notes:'2 seater + single seater', created:'2025-08-14' },
  ];
  DB.workers = [
    { id:'W001', name:'Yamikani Mwenye',   role:'Carpenter', phone:'993823999', rtype:'Hourly', rate:0, nid:'', addr:'', created:'2025-08-14', active:true },
    { id:'W002', name:'Victor Pensulo',    role:'Carpenter', phone:'995967712', rtype:'Piece',  rate:0, nid:'', addr:'', created:'2025-08-14', active:true },
    { id:'W003', name:'Benard Dickson',    role:'Carpenter', phone:'989283097', rtype:'Hourly', rate:0, nid:'', addr:'', created:'2025-08-14', active:true },
    { id:'W004', name:'Chifundo Makhalira',role:'Finisher',  phone:'987261629', rtype:'',       rate:0, nid:'', addr:'', created:'2025-08-14', active:true },
    { id:'W005', name:'Chinoko',           role:'Sander',    phone:'',          rtype:'',       rate:0, nid:'', addr:'', created:'2025-08-14', active:true },
  ];
  DB.suppliers = [
    { id:'SUP001', name:'Mzuzu Timber & Wood',  cp:'James Phiri',  phone:'0888123456', cat:'Timber/Wood',        loc:'Mzuzu Industrial', terms:'Cash on delivery', notes:'Main timber supplier', created:'2025-08-14', active:true },
    { id:'SUP002', name:'Northern Fabrics Ltd',  cp:'Grace Tembo',  phone:'0999234567', cat:'Fabric/Upholstery',  loc:'Mzuzu City',       terms:'Net 14 days',      notes:'Upholstery fabrics and foam', created:'2025-08-14', active:true },
    { id:'SUP003', name:'Hardware Plus',         cp:'Mr Banda',     phone:'0777345678', cat:'Hardware & Fittings',loc:'Mzuzu Market',     terms:'Cash on delivery', notes:'Screws, hinges, handles', created:'2025-08-14', active:true },
  ];
  DB.stock = [
    { id:'STK001', item:'3 Seater Sofa', category:'Sofa', qty:4, unit_price:850000, cost_price:600000, reorder_level:2, location:'Main Showroom', notes:'Fabric finish', created:'2025-08-14' },
    { id:'STK002', item:'Dining Table 6 Seater', category:'Dining', qty:2, unit_price:1200000, cost_price:850000, reorder_level:1, location:'Front Display', notes:'Mahogany', created:'2025-08-14' },
    { id:'STK003', item:'Queen Bed Frame', category:'Bedroom', qty:1, unit_price:760000, cost_price:520000, reorder_level:2, location:'Bedroom Corner', notes:'Low stock sample', created:'2025-08-14' }
  ];
  DB.sales = [];
  DB.orders = [
    { id:'ORD001', date:'2025-08-14', client_id:'C001', client:'Martha Eji',          item:'Cream white 3,2,2',          qty:1, price:1800000, advance:700000,  received:850000,  status:'Completed', due:'', delivery:'Pending',   ddate:'', notes:'', created:'2025-08-14' },
    { id:'ORD002', date:'2025-08-14', client_id:'C002', client:'Lilian',              item:'Brown 3,2,1',                qty:1, price:1750000, advance:200000,  received:200000,  status:'Pending',   due:'', delivery:'Pending',   ddate:'', notes:'', created:'2025-08-14' },
    { id:'ORD003', date:'2025-08-14', client_id:'C003', client:'Sibongire Jere',      item:'Dark grey L-shape',          qty:1, price:900000,  advance:500000,  received:500000,  status:'Completed', due:'', delivery:'',         ddate:'', notes:'', created:'2025-08-14' },
    { id:'ORD004', date:'2025-08-14', client_id:'C004', client:'Mbale',               item:'Blue bed',                   qty:1, price:470000,  advance:200000,  received:200000,  status:'Pending',   due:'', delivery:'',         ddate:'', notes:'', created:'2025-08-14' },
    { id:'ORD005', date:'2025-08-14', client_id:'C005', client:'Mtaski',              item:'2 seater + kitchen unit',    qty:1, price:1050000, advance:550000,  received:550000,  status:'Pending',   due:'', delivery:'',         ddate:'', notes:'', created:'2025-08-14' },
    { id:'ORD006', date:'2025-08-14', client_id:'C006', client:'Lyson Sibande',       item:'Cream white 3,2,1',          qty:1, price:1300000, advance:800000,  received:800000,  status:'Completed', due:'', delivery:'',         ddate:'', notes:'', created:'2025-08-14' },
    { id:'ORD007', date:'2025-08-14', client_id:'C007', client:'Khaze Bujo',          item:'Rose queen bed',             qty:1, price:960000,  advance:200000,  received:200000,  status:'Pending',   due:'', delivery:'',         ddate:'', notes:'', created:'2025-08-14' },
    { id:'ORD008', date:'2025-08-14', client_id:'C008', client:'Chigomezgo Mwanmke',  item:'Brown board bed queen',      qty:1, price:1150000, advance:1150000, received:1150000, status:'Completed', due:'', delivery:'',         ddate:'', notes:'', created:'2025-08-14' },
    { id:'ORD009', date:'2025-08-14', client_id:'C009', client:'Chimwemwe Mwalwanda', item:'Coach 3 + L-shape',          qty:1, price:1300000, advance:600000,  received:600000,  status:'Completed', due:'', delivery:'Collected', ddate:'', notes:'', created:'2025-08-14' },
    { id:'ORD010', date:'2025-08-14', client_id:'C010', client:'Yama Sten Khwa',      item:'L-shape + single double bed',qty:1, price:1900000, advance:960000,  received:960000,  status:'Pending',   due:'', delivery:'',         ddate:'', notes:'', created:'2025-08-14' },
    { id:'ORD011', date:'2025-08-14', client_id:'C011', client:'Sekile Mwambughi',    item:'Chest of drawers',           qty:1, price:500000,  advance:240000,  received:240000,  status:'Pending',   due:'', delivery:'',         ddate:'', notes:'', created:'2025-08-14' },
    { id:'ORD012', date:'2025-08-14', client_id:'',     client:'Mrs Thindwa',         item:'Chesterfield 2,1,1',         qty:1, price:1600000, advance:640000,  received:640000,  status:'Pending',   due:'', delivery:'',         ddate:'', notes:'', created:'2025-08-14' },
    { id:'ORD013', date:'2025-08-14', client_id:'',     client:'Kaunda Kavuzi',       item:'Chester double bed',         qty:1, price:580000,  advance:580000,  received:580000,  status:'Completed', due:'', delivery:'',         ddate:'', notes:'', created:'2025-08-14' },
    { id:'ORD014', date:'2025-08-14', client_id:'',     client:'Anganile',            item:'2 seater + single seater',   qty:1, price:900000,  advance:500000,  received:500000,  status:'Pending',   due:'', delivery:'',         ddate:'', notes:'', created:'2025-08-14' },
  ];
  DB.payments = [
    { id:'TXN001', date:'2025-08-14', type:'Client Payment',  order_id:'ORD001', linked_id:'',    amount:150000, method:'Mobile Money', notes:'Deposit from Martha',   created:'2025-08-14' },
    { id:'TXN002', date:'2025-08-14', type:'Worker Payment',  order_id:'',       linked_id:'W001',amount:20000,  method:'Cash',         notes:'Advance — Yamikani',    created:'2025-08-14' },
  ];
  DB.expenses = [];
  saveDB();
  console.log('[DB] Seed complete.');
}
seedIfEmpty();

// ─────────────────────────────────────────────
// ID GENERATORS
// ─────────────────────────────────────────────
function nextId(prefix, arr) {
  const nums = arr.map(x => parseInt((x.id || '').replace(prefix, '')) || 0);
  return prefix + String(Math.max(0, ...nums) + 1).padStart(3, '0');
}

// ─────────────────────────────────────────────
// MINI JWT (HMAC-SHA256, no external lib)
// ─────────────────────────────────────────────
function toBase64Url(str) {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64Url(str) {
  // Add padding if needed
  const padded = str + '==='.slice(0, (4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
}

function signToken(payload) {
  const header  = toBase64Url(JSON.stringify({ alg:'HS256', typ:'JWT' }));
  const body    = toBase64Url(JSON.stringify(payload));
  const sig     = toBase64Url(crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, b, s] = parts;
    if (!h || !b || !s) return null;
    const expected = toBase64Url(crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest());
    if (s !== expected) {
      console.warn('[AUTH] Token signature mismatch');
      return null;
    }
    const payload = JSON.parse(fromBase64Url(b));
    if (payload.exp <= Date.now()) {
      console.warn('[AUTH] Token expired:', new Date(payload.exp));
      return null;
    }
    return payload;
  } catch (e) { 
    console.warn('[AUTH] Token verification error:', e.message);
    return null; 
  }
}

// ─────────────────────────────────────────────
// HTTP HELPERS
// ─────────────────────────────────────────────
function readBody(req) {
  return new Promise((res, rej) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 2e6) rej(new Error('Body too large')); });
    req.on('end', () => {
      try { res(data ? JSON.parse(data) : {}); }
      catch { rej(new Error('Invalid JSON')); }
    });
    req.on('error', rej);
  });
}

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':  'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-api-key',
    'X-Powered-By': 'TAZ-Backend/2.4'
  });
  res.end(body);
}

function ok(res, data = {}, msg = 'OK') { send(res, 200, { success: true, msg, data }); }
function created(res, data = {}) { send(res, 201, { success: true, msg: 'Created', data }); }
function err(res, status, msg) { send(res, status, { success: false, msg, data: null }); }

function getToken(req) {
  const auth = req.headers['authorization'] || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

function requireAuth(req, res) {
  const token = getToken(req);
  if (!token) { 
    console.warn('[AUTH] No token provided in request');
    err(res, 401, 'No token provided'); 
    return null; 
  }
  console.log('[AUTH] Verifying token:', token.substring(0, 20) + '...');
  const payload = verifyToken(token);
  if (!payload) { 
    console.warn('[AUTH] Token verification failed');
    err(res, 401, 'Invalid or expired token'); 
    return null; 
  }
  console.log('[AUTH] Token valid for role:', payload.role);
  return payload;
}

// ─────────────────────────────────────────────
// AUDIT LOGGER
// ─────────────────────────────────────────────
function audit(action, entity, id, data = {}) {
  const entry = { action, entity, id, ...data, ts: new Date().toISOString() };
  DB.audit_log.push(entry);
  appendLog(entry);
}

// ─────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────
async function router(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-api-key'
    });
    return res.end();
  }

  const parsed  = url.parse(req.url, true);
  const pathname = parsed.pathname || '';
  if (pathname.startsWith('/api/') && !requireApiKey(req, res)) return;
  const parts   = pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
  const method  = req.method;
  const query   = parsed.query;

  // Rate limit map (simple in-memory)
  const ip = req.socket.remoteAddress;

  try {
    // ── AUTH ──────────────────────────────────────────
    if (parts[0] === 'auth') {

      // POST /api/auth/login
      if (parts[1] === 'login' && method === 'POST') {
        const { pin } = await readBody(req);
        if (!pin) return err(res, 400, 'PIN required');
        const hashed = hashPin(String(pin));
        let role = null;
        console.log('[LOGIN] Attempting with PIN:', String(pin), 'Hashed:', hashed.substring(0, 8) + '...');
        console.log('[LOGIN] Owner PIN hash:', DB.settings.pin_owner.substring(0, 8) + '...');
        console.log('[LOGIN] Cashier PIN hash:', DB.settings.pin_cashier.substring(0, 8) + '...');
        if (hashed === DB.settings.pin_owner) {
          role = 'owner';
        } else if (hashed === DB.settings.pin_cashier) {
          role = 'cashier';
        }
        if (!role) {
          console.log('[LOGIN] PIN incorrect - no match');
          audit('LOGIN_FAIL', 'auth', null, { ip });
          return err(res, 401, 'Incorrect PIN');
        }
        const exp = Date.now() + TOKEN_TTL;
        const token = signToken({ sub: role, role, exp, iss: 'taz-backend' });
        console.log('[LOGIN] Token created for role:', role, 'Expires:', new Date(exp));
        DB.sessions[token] = { expires: exp, ip, role };
        saveDB();
        audit('LOGIN', 'auth', role, { ip });
        return ok(res, { token, expires: exp, role, workshop: DB.settings.workshop_name }, 'Authenticated');
      }

      // POST /api/auth/logout
      if (parts[1] === 'logout' && method === 'POST') {
        const token = getToken(req);
        if (token) delete DB.sessions[token];
        saveDB();
        return ok(res, {}, 'Logged out');
      }

      // POST /api/auth/change-pin
      if (parts[1] === 'change-pin' && method === 'POST') {
        const payload = requireAuth(req, res);
        if (!payload) return;
        if (payload.role !== 'owner') return err(res, 403, 'Only owner can change PINs');
        const { type, current_pin, new_pin } = await readBody(req);
        if (!type || !current_pin || !new_pin) return err(res, 400, 'type, current_pin and new_pin required');
        if (!['owner', 'cashier'].includes(type)) return err(res, 400, 'type must be owner or cashier');
        const pinKey = 'pin_' + type;
        if (hashPin(String(current_pin)) !== DB.settings[pinKey]) return err(res, 401, 'Current PIN incorrect');
        if (!/^\d{4}$/.test(String(new_pin))) return err(res, 400, 'PIN must be exactly 4 digits');
        DB.settings[pinKey] = hashPin(String(new_pin));
        // Invalidate all sessions
        DB.sessions = {};
        saveDB();
        audit('PIN_CHANGE', 'auth', type, { ip });
        return ok(res, {}, 'PIN updated — please log in again');
      }

      return err(res, 404, 'Auth endpoint not found');
    }

    // ── HEALTH CHECK (API key only, no JWT required)
    if (parts[0] === 'health' && method === 'GET') {
      return ok(res, { status: 'ok', version: '2.4', uptime: process.uptime(), orders: DB.orders.length, ts: new Date().toISOString() });
    }

    // ── ALL ROUTES BELOW REQUIRE AUTH ─────────────────
    const payload = requireAuth(req, res);
    if (!payload) return;

    // Role-based access: cashier only showroom (stock/sales)
    const isOwner = payload.role === 'owner';
    const isCashier = payload.role === 'cashier';
    if (isCashier && !['stock', 'sales', 'health'].includes(parts[0])) {
      return err(res, 403, 'Access denied — cashier role limited to showroom');
    }

    // ── DASHBOARD ──────────────────────────────────────
    if (parts[0] === 'dashboard' && method === 'GET') {
      const orders   = DB.orders;
      const payments = DB.payments;
      const expenses = DB.expenses;
      const stock = DB.stock;
      const sales = DB.sales;

      const ordersRevenue  = orders.reduce((s, o) => s + (o.received || 0), 0);
      const showroomRevenue = sales.reduce((s, x) => s + (x.total || 0), 0);
      const showroomCost    = sales.reduce((s, x) => s + (x.cost_total || 0), 0);
      const showroomProfit  = showroomRevenue - showroomCost;
      const totalRevenue   = ordersRevenue + showroomRevenue;
      const totalValue     = orders.reduce((s, o) => s + (o.price || 0), 0);
      const totalOutstanding = orders.reduce((s, o) => s + Math.max(0, (o.price || 0) - (o.received || 0)), 0);
      const totalWorkerPay = payments.filter(p => p.type === 'Worker Payment').reduce((s, p) => s + (p.amount || 0), 0);
      const totalSupplierPay = payments.filter(p => p.type === 'Supplier Payment').reduce((s, p) => s + (p.amount || 0), 0);
      const totalExpenses  = expenses.reduce((s, e) => s + (e.amount || 0), 0);
      const netProfit      = totalRevenue - showroomCost - totalWorkerPay - totalSupplierPay - totalExpenses;
      const lowStockItems  = stock.filter(s => (s.qty || 0) <= (s.reorder_level || 0));
      const showroomSalesTotal = sales.reduce((x, s) => x + (s.total || 0), 0);

      const byStatus = { Pending: 0, Completed: 0, 'In Progress': 0, Other: 0 };
      orders.forEach(o => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; if (!byStatus[o.status]) byStatus.Other++; });

      const overdue = orders.filter(o => (o.price || 0) > (o.received || 0))
        .sort((a, b) => ((b.price - b.received) - (a.price - a.received)))
        .slice(0, 10);

      const recent = [...payments].reverse().slice(0, 15);

      return ok(res, {
        summary: { totalRevenue, ordersRevenue, showroomRevenue, showroomCost, showroomProfit, totalValue, totalOutstanding, totalWorkerPay, totalSupplierPay, totalExpenses, netProfit },
        counts:  { orders: orders.length, workers: DB.workers.length, clients: DB.clients.length, suppliers: DB.suppliers.length, payments: payments.length, stock: stock.length, sales: sales.length },
        ordersByStatus: byStatus,
        overdueOrders: overdue,
        recentTransactions: recent,
        stock: {
          totalItems: stock.length,
          totalUnits: stock.reduce((x, s) => x + (s.qty || 0), 0),
          lowAlerts: lowStockItems.length,
          lowItems: lowStockItems.slice(0, 10),
          showroomSalesTotal,
          showroomProfit
        }
      });
    }

    // ── ORDERS ─────────────────────────────────────────
    if (parts[0] === 'orders') {

      if (method === 'GET' && !parts[1]) {
        let rows = DB.orders;
        if (query.status && query.status !== 'all') rows = rows.filter(o => o.status === query.status);
        if (query.search) {
          const s = query.search.toLowerCase();
          rows = rows.filter(o => o.client.toLowerCase().includes(s) || o.item.toLowerCase().includes(s) || (o.id || '').toLowerCase().includes(s));
        }
        if (query.client_id) rows = rows.filter(o => o.client_id === query.client_id);
        // Attach balance
        rows = rows.map(o => ({ ...o, balance: (o.price || 0) - (o.received || 0) }));
        return ok(res, { orders: rows, total: rows.length });
      }

      if (method === 'GET' && parts[1]) {
        const o = DB.orders.find(x => x.id === parts[1]);
        if (!o) return err(res, 404, 'Order not found');
        const orderPayments = DB.payments.filter(p => p.order_id === o.id);
        return ok(res, { ...o, balance: (o.price || 0) - (o.received || 0), payments: orderPayments });
      }

      if (method === 'POST') {
        const body = await readBody(req);
        const { client, item, price } = body;
        if (!client || !item || !price) return err(res, 400, 'client, item and price are required');
        const advance  = Number(body.advance) || 0;
        const received = Number(body.received) || advance;
        const o = {
          id:        nextId('ORD', DB.orders),
          date:      body.date || new Date().toISOString().split('T')[0],
          client_id: body.client_id || '',
          client:    String(client).trim(),
          item:      String(item).trim(),
          qty:       Number(body.qty) || 1,
          price:     Number(price),
          advance,
          received,
          status:    body.status || 'Pending',
          due:       body.due || '',
          delivery:  body.delivery || 'Pending',
          ddate:     body.ddate || '',
          notes:     body.notes || '',
          created:   new Date().toISOString().split('T')[0]
        };
        DB.orders.push(o);
        if (advance > 0) {
          DB.payments.push({
            id: nextId('TXN', DB.payments), date: o.date,
            type: 'Client Payment', order_id: o.id, linked_id: '',
            amount: advance, method: body.payment_method || 'Cash',
            notes: `Advance payment — ${client}`, created: o.created
          });
        }
        saveDB();
        audit('CREATE', 'order', o.id);
        return created(res, o);
      }

      if (method === 'PUT' && parts[1]) {
        const idx = DB.orders.findIndex(x => x.id === parts[1]);
        if (idx < 0) return err(res, 404, 'Order not found');
        const body = await readBody(req);
        const old = DB.orders[idx];
        DB.orders[idx] = {
          ...old,
          client:    body.client    !== undefined ? String(body.client).trim()    : old.client,
          client_id: body.client_id !== undefined ? body.client_id                : old.client_id,
          item:      body.item      !== undefined ? String(body.item).trim()      : old.item,
          qty:       body.qty       !== undefined ? Number(body.qty)              : old.qty,
          price:     body.price     !== undefined ? Number(body.price)            : old.price,
          advance:   body.advance   !== undefined ? Number(body.advance)          : old.advance,
          received:  body.received  !== undefined ? Number(body.received)         : old.received,
          status:    body.status    !== undefined ? body.status                   : old.status,
          due:       body.due       !== undefined ? body.due                      : old.due,
          delivery:  body.delivery  !== undefined ? body.delivery                 : old.delivery,
          ddate:     body.ddate     !== undefined ? body.ddate                    : old.ddate,
          notes:     body.notes     !== undefined ? body.notes                    : old.notes,
          updated:   new Date().toISOString().split('T')[0]
        };
        saveDB();
        audit('UPDATE', 'order', parts[1]);
        return ok(res, DB.orders[idx], 'Order updated');
      }

      if (method === 'DELETE' && parts[1]) {
        const idx = DB.orders.findIndex(x => x.id === parts[1]);
        if (idx < 0) return err(res, 404, 'Order not found');
        DB.orders.splice(idx, 1);
        saveDB();
        audit('DELETE', 'order', parts[1]);
        return ok(res, {}, 'Order deleted');
      }
    }

    // ── PAYMENTS ───────────────────────────────────────
    if (parts[0] === 'payments') {

      if (method === 'GET' && !parts[1]) {
        let rows = DB.payments;
        if (query.type && query.type !== 'all') rows = rows.filter(p => p.type === query.type);
        if (query.order_id) rows = rows.filter(p => p.order_id === query.order_id);
        if (query.linked_id) rows = rows.filter(p => p.linked_id === query.linked_id);
        // Summary
        const summary = {
          client:   DB.payments.filter(p => p.type === 'Client Payment').reduce((s, p) => s + (p.amount || 0), 0),
          worker:   DB.payments.filter(p => p.type === 'Worker Payment').reduce((s, p) => s + (p.amount || 0), 0),
          supplier: DB.payments.filter(p => p.type === 'Supplier Payment').reduce((s, p) => s + (p.amount || 0), 0),
          expense:  DB.payments.filter(p => p.type === 'Expense').reduce((s, p) => s + (p.amount || 0), 0),
        };
        return ok(res, { payments: [...rows].reverse(), total: rows.length, summary });
      }

      if (method === 'GET' && parts[1]) {
        const p = DB.payments.find(x => x.id === parts[1]);
        if (!p) return err(res, 404, 'Payment not found');
        return ok(res, p);
      }

      if (method === 'POST') {
        const body = await readBody(req);
        const { type, amount } = body;
        if (!type || !amount) return err(res, 400, 'type and amount are required');
        const p = {
          id:        nextId('TXN', DB.payments),
          date:      body.date || new Date().toISOString().split('T')[0],
          type:      String(type),
          order_id:  body.order_id  || '',
          linked_id: body.linked_id || '',
          amount:    Number(amount),
          method:    body.method || 'Cash',
          notes:     body.notes  || '',
          created:   new Date().toISOString().split('T')[0]
        };
        DB.payments.push(p);
        // Update order received amount
        if (p.order_id && p.type === 'Client Payment') {
          const o = DB.orders.find(x => x.id === p.order_id);
          if (o) { o.received = (o.received || 0) + p.amount; o.updated = p.date; }
        }
        saveDB();
        audit('CREATE', 'payment', p.id, { type, amount });
        return created(res, p);
      }

      if (method === 'DELETE' && parts[1]) {
        const idx = DB.payments.findIndex(x => x.id === parts[1]);
        if (idx < 0) return err(res, 404, 'Payment not found');
        DB.payments.splice(idx, 1);
        saveDB();
        audit('DELETE', 'payment', parts[1]);
        return ok(res, {}, 'Payment deleted');
      }
    }

    // ── EXPENSES ───────────────────────────────────────
    if (parts[0] === 'expenses') {

      if (method === 'GET') {
        let rows = DB.expenses;
        if (query.cat && query.cat !== 'all') rows = rows.filter(e => e.cat === query.cat);
        const total = DB.expenses.reduce((s, e) => s + (e.amount || 0), 0);
        const by_cat = {};
        DB.expenses.forEach(e => { by_cat[e.cat] = (by_cat[e.cat] || 0) + e.amount; });
        return ok(res, { expenses: [...rows].reverse(), total, by_cat, count: rows.length });
      }

      if (method === 'POST') {
        const body = await readBody(req);
        if (!body.desc || !body.amount) return err(res, 400, 'desc and amount are required');
        const e = {
          id:      DB.expenses.length + 1,
          date:    body.date   || new Date().toISOString().split('T')[0],
          cat:     body.cat    || 'Other',
          desc:    String(body.desc).trim(),
          amount:  Number(body.amount),
          method:  body.method || 'Cash',
          order_id:body.order_id || '',
          receipt: body.receipt  || '',
          created: new Date().toISOString().split('T')[0]
        };
        DB.expenses.push(e);
        DB.payments.push({
          id: nextId('TXN', DB.payments), date: e.date,
          type: 'Expense', order_id: e.order_id, linked_id: '',
          amount: e.amount, method: e.method, notes: `${e.cat}: ${e.desc}`,
          created: e.created
        });
        saveDB();
        audit('CREATE', 'expense', String(e.id), { cat: e.cat, amount: e.amount });
        return created(res, e);
      }

      if (method === 'DELETE' && parts[1]) {
        const idx = DB.expenses.findIndex(x => String(x.id) === parts[1]);
        if (idx < 0) return err(res, 404, 'Expense not found');
        DB.expenses.splice(idx, 1);
        saveDB();
        audit('DELETE', 'expense', parts[1]);
        return ok(res, {}, 'Expense deleted');
      }
    }

    // ── WORKERS ────────────────────────────────────────
    if (parts[0] === 'workers') {

      if (method === 'GET' && !parts[1]) {
        const workers = DB.workers.map(w => {
          const paid = DB.payments.filter(p => p.type === 'Worker Payment' && p.linked_id === w.id).reduce((s, p) => s + (p.amount || 0), 0);
          const txns = DB.payments.filter(p => p.type === 'Worker Payment' && p.linked_id === w.id);
          const last = txns.slice(-1)[0];
          return { ...w, total_paid: paid, txn_count: txns.length, last_payment: last ? last.date : null };
        });
        return ok(res, { workers, total: workers.length });
      }

      if (method === 'GET' && parts[1]) {
        const w = DB.workers.find(x => x.id === parts[1]);
        if (!w) return err(res, 404, 'Worker not found');
        const payments = DB.payments.filter(p => p.type === 'Worker Payment' && p.linked_id === w.id);
        const total_paid = payments.reduce((s, p) => s + (p.amount || 0), 0);
        return ok(res, { ...w, payments: [...payments].reverse(), total_paid });
      }

      if (method === 'POST') {
        const body = await readBody(req);
        if (!body.name) return err(res, 400, 'name is required');
        const w = {
          id:      nextId('W', DB.workers),
          name:    String(body.name).trim(),
          role:    body.role   || 'Carpenter',
          phone:   body.phone  || '',
          rtype:   body.rtype  || 'Hourly',
          rate:    Number(body.rate) || 0,
          nid:     body.nid    || '',
          addr:    body.addr   || '',
          active:  true,
          created: new Date().toISOString().split('T')[0]
        };
        DB.workers.push(w);
        saveDB();
        audit('CREATE', 'worker', w.id, { name: w.name });
        return created(res, w);
      }

      if (method === 'PUT' && parts[1]) {
        const idx = DB.workers.findIndex(x => x.id === parts[1]);
        if (idx < 0) return err(res, 404, 'Worker not found');
        const body = await readBody(req);
        const old = DB.workers[idx];
        DB.workers[idx] = { ...old, ...body, id: old.id, created: old.created, updated: new Date().toISOString().split('T')[0] };
        saveDB();
        audit('UPDATE', 'worker', parts[1]);
        return ok(res, DB.workers[idx], 'Worker updated');
      }

      if (method === 'DELETE' && parts[1]) {
        const idx = DB.workers.findIndex(x => x.id === parts[1]);
        if (idx < 0) return err(res, 404, 'Worker not found');
        DB.workers.splice(idx, 1);
        saveDB();
        audit('DELETE', 'worker', parts[1]);
        return ok(res, {}, 'Worker deleted');
      }
    }

    // ── CLIENTS ────────────────────────────────────────
    if (parts[0] === 'clients') {

      if (method === 'GET' && !parts[1]) {
        let rows = DB.clients;
        if (query.search) {
          const s = query.search.toLowerCase();
          rows = rows.filter(c => c.name.toLowerCase().includes(s) || (c.phone || '').includes(s));
        }
        const enriched = rows.map(c => {
          const orders = DB.orders.filter(o => o.client_id === c.id);
          const spent  = orders.reduce((s, o) => s + (o.received || 0), 0);
          return { ...c, order_count: orders.length, total_spent: spent };
        });
        return ok(res, { clients: enriched, total: enriched.length });
      }

      if (method === 'GET' && parts[1]) {
        const c = DB.clients.find(x => x.id === parts[1]);
        if (!c) return err(res, 404, 'Client not found');
        const orders   = DB.orders.filter(o => o.client_id === c.id);
        const payments = DB.payments.filter(p => orders.some(o => o.id === p.order_id));
        const spent    = orders.reduce((s, o) => s + (o.received || 0), 0);
        return ok(res, { ...c, orders, payments: [...payments].reverse(), total_spent: spent });
      }

      if (method === 'POST') {
        const body = await readBody(req);
        if (!body.name) return err(res, 400, 'name is required');
        const c = {
          id:      nextId('C', DB.clients),
          name:    String(body.name).trim(),
          phone:   body.phone || '',
          email:   body.email || '',
          loc:     body.loc   || '',
          notes:   body.notes || '',
          created: new Date().toISOString().split('T')[0]
        };
        DB.clients.push(c);
        saveDB();
        audit('CREATE', 'client', c.id, { name: c.name });
        return created(res, c);
      }

      if (method === 'PUT' && parts[1]) {
        const idx = DB.clients.findIndex(x => x.id === parts[1]);
        if (idx < 0) return err(res, 404, 'Client not found');
        const body = await readBody(req);
        const old = DB.clients[idx];
        DB.clients[idx] = { ...old, ...body, id: old.id, created: old.created, updated: new Date().toISOString().split('T')[0] };
        saveDB();
        audit('UPDATE', 'client', parts[1]);
        return ok(res, DB.clients[idx], 'Client updated');
      }

      if (method === 'DELETE' && parts[1]) {
        const idx = DB.clients.findIndex(x => x.id === parts[1]);
        if (idx < 0) return err(res, 404, 'Client not found');
        DB.clients.splice(idx, 1);
        saveDB();
        audit('DELETE', 'client', parts[1]);
        return ok(res, {}, 'Client deleted');
      }
    }

    // ── SUPPLIERS ──────────────────────────────────────
    if (parts[0] === 'suppliers') {

      if (method === 'GET' && !parts[1]) {
        let rows = DB.suppliers;
        if (query.search) {
          const s = query.search.toLowerCase();
          rows = rows.filter(x => x.name.toLowerCase().includes(s) || (x.cp || '').toLowerCase().includes(s));
        }
        const enriched = rows.map(s => {
          const paid = DB.payments.filter(p => p.type === 'Supplier Payment' && p.linked_id === s.id).reduce((x, p) => x + (p.amount || 0), 0);
          const txns = DB.payments.filter(p => p.type === 'Supplier Payment' && p.linked_id === s.id);
          return { ...s, total_paid: paid, txn_count: txns.length, last_payment: txns.length ? txns.slice(-1)[0].date : null };
        });
        const total_paid = DB.payments.filter(p => p.type === 'Supplier Payment').reduce((s, p) => s + (p.amount || 0), 0);
        return ok(res, { suppliers: enriched, total: enriched.length, total_paid });
      }

      if (method === 'GET' && parts[1]) {
        const s = DB.suppliers.find(x => x.id === parts[1]);
        if (!s) return err(res, 404, 'Supplier not found');
        const payments = DB.payments.filter(p => p.type === 'Supplier Payment' && p.linked_id === s.id);
        const total_paid = payments.reduce((x, p) => x + (p.amount || 0), 0);
        return ok(res, { ...s, payments: [...payments].reverse(), total_paid });
      }

      if (method === 'POST') {
        const body = await readBody(req);
        if (!body.name) return err(res, 400, 'name is required');
        const s = {
          id:      nextId('SUP', DB.suppliers),
          name:    String(body.name).trim(),
          cp:      body.cp    || '',
          phone:   body.phone || '',
          cat:     body.cat   || 'General Supplies',
          loc:     body.loc   || '',
          terms:   body.terms || 'Cash on delivery',
          notes:   body.notes || '',
          active:  true,
          created: new Date().toISOString().split('T')[0]
        };
        DB.suppliers.push(s);
        saveDB();
        audit('CREATE', 'supplier', s.id, { name: s.name });
        return created(res, s);
      }

      if (method === 'PUT' && parts[1]) {
        const idx = DB.suppliers.findIndex(x => x.id === parts[1]);
        if (idx < 0) return err(res, 404, 'Supplier not found');
        const body = await readBody(req);
        const old = DB.suppliers[idx];
        DB.suppliers[idx] = { ...old, ...body, id: old.id, created: old.created, updated: new Date().toISOString().split('T')[0] };
        saveDB();
        audit('UPDATE', 'supplier', parts[1]);
        return ok(res, DB.suppliers[idx], 'Supplier updated');
      }

      if (method === 'DELETE' && parts[1]) {
        const idx = DB.suppliers.findIndex(x => x.id === parts[1]);
        if (idx < 0) return err(res, 404, 'Supplier not found');
        DB.suppliers.splice(idx, 1);
        saveDB();
        audit('DELETE', 'supplier', parts[1]);
        return ok(res, {}, 'Supplier deleted');
      }
    }

    // ── STOCK ──────────────────────────────────────────
    if (parts[0] === 'stock') {

      if (method === 'GET' && !parts[1]) {
        let rows = DB.stock;
        if (query.search) {
          const s = String(query.search).toLowerCase();
          rows = rows.filter(x => (x.item || '').toLowerCase().includes(s) || (x.category || '').toLowerCase().includes(s) || (x.id || '').toLowerCase().includes(s));
        }
        if (query.low_only === '1') rows = rows.filter(x => (x.qty || 0) <= (x.reorder_level || 0));
        const enriched = rows.map(x => ({
          ...x,
          stock_status: (x.qty || 0) <= 0 ? 'Out of Stock' : (x.qty || 0) <= (x.reorder_level || 0) ? 'Low Stock' : 'In Stock'
        }));
        const lowAlerts = DB.stock.filter(x => (x.qty || 0) <= (x.reorder_level || 0));
        return ok(res, {
          stock: enriched,
          total: enriched.length,
          summary: {
            totalUnits: DB.stock.reduce((a, b) => a + (b.qty || 0), 0),
            totalValue: DB.stock.reduce((a, b) => a + ((b.qty || 0) * (b.unit_price || 0)), 0),
            totalCost: DB.stock.reduce((a, b) => a + ((b.qty || 0) * (b.cost_price || 0)), 0),
            lowAlerts: lowAlerts.length
          },
          alerts: lowAlerts.slice(0, 10)
        });
      }

      if (method === 'GET' && parts[1]) {
        const x = DB.stock.find(v => v.id === parts[1]);
        if (!x) return err(res, 404, 'Stock item not found');
        return ok(res, x);
      }

      if (method === 'POST') {
        const body = await readBody(req);
        if (!body.item || body.qty === undefined) return err(res, 400, 'item and qty are required');
        const x = {
          id: nextId('STK', DB.stock),
          item: String(body.item).trim(),
          category: body.category || 'Furniture',
          qty: Number(body.qty) || 0,
          unit_price: Number(body.unit_price) || 0,
          cost_price: Number(body.cost_price) || 0,
          reorder_level: Number(body.reorder_level) || 0,
          location: body.location || 'Showroom',
          notes: body.notes || '',
          created: new Date().toISOString().split('T')[0]
        };
        DB.stock.push(x);
        saveDB();
        audit('CREATE', 'stock', x.id, { item: x.item, qty: x.qty });
        return created(res, x);
      }

      if (method === 'PUT' && parts[1]) {
        const idx = DB.stock.findIndex(v => v.id === parts[1]);
        if (idx < 0) return err(res, 404, 'Stock item not found');
        const body = await readBody(req);
        const old = DB.stock[idx];
        DB.stock[idx] = {
          ...old,
          item: body.item !== undefined ? String(body.item).trim() : old.item,
          category: body.category !== undefined ? body.category : old.category,
          qty: body.qty !== undefined ? Number(body.qty) : old.qty,
          unit_price: body.unit_price !== undefined ? Number(body.unit_price) : old.unit_price,
          cost_price: body.cost_price !== undefined ? Number(body.cost_price) : old.cost_price,
          reorder_level: body.reorder_level !== undefined ? Number(body.reorder_level) : old.reorder_level,
          location: body.location !== undefined ? body.location : old.location,
          notes: body.notes !== undefined ? body.notes : old.notes,
          updated: new Date().toISOString().split('T')[0]
        };
        saveDB();
        audit('UPDATE', 'stock', parts[1]);
        return ok(res, DB.stock[idx], 'Stock updated');
      }

      if (method === 'DELETE' && parts[1]) {
        const idx = DB.stock.findIndex(v => v.id === parts[1]);
        if (idx < 0) return err(res, 404, 'Stock item not found');
        DB.stock.splice(idx, 1);
        saveDB();
        audit('DELETE', 'stock', parts[1]);
        return ok(res, {}, 'Stock deleted');
      }
    }

    // ── SALES ──────────────────────────────────────────
    if (parts[0] === 'sales') {
      if (method === 'GET' && !parts[1]) {
        let rows = DB.sales;
        if (query.search) {
          const s = String(query.search).toLowerCase();
          rows = rows.filter(x => (x.item || '').toLowerCase().includes(s) || (x.customer || '').toLowerCase().includes(s) || (x.id || '').toLowerCase().includes(s));
        }
        return ok(res, {
          sales: [...rows].reverse(),
          total: rows.length,
          summary: {
            qty: rows.reduce((a, b) => a + (b.qty || 0), 0),
            amount: rows.reduce((a, b) => a + (b.total || 0), 0),
            cost: rows.reduce((a, b) => a + (b.cost_total || 0), 0),
            profit: rows.reduce((a, b) => a + (b.profit || 0), 0)
          }
        });
      }

      if (method === 'POST') {
        const body = await readBody(req);
        if (!body.item || !body.qty) return err(res, 400, 'item and qty are required');
        const qty = Number(body.qty);
        if (qty <= 0) return err(res, 400, 'qty must be above zero');

        let stockItem = null;
        if (body.stock_id) stockItem = DB.stock.find(x => x.id === body.stock_id);
        if (!stockItem) {
          const byName = String(body.item).toLowerCase();
          stockItem = DB.stock.find(x => String(x.item || '').toLowerCase() === byName) || null;
        }
        if (stockItem && (stockItem.qty || 0) < qty) return err(res, 400, `Not enough stock for ${stockItem.item}`);

        const unitPrice = Number(body.unit_price) || Number(stockItem?.unit_price) || 0;
        const costPrice = Number(body.cost_price) || Number(stockItem?.cost_price) || 0;
        const total = qty * unitPrice;
        const costTotal = qty * costPrice;
        const sale = {
          id: nextId('SAL', DB.sales),
          date: body.date || new Date().toISOString().split('T')[0],
          customer: body.customer || 'Walk-in Customer',
          item: String(body.item).trim(),
          stock_id: stockItem ? stockItem.id : '',
          qty,
          unit_price: unitPrice,
          cost_price: costPrice,
          total,
          cost_total: costTotal,
          profit: total - costTotal,
          method: body.method || 'Cash',
          notes: body.notes || '',
          created: new Date().toISOString().split('T')[0]
        };
        DB.sales.push(sale);

        if (stockItem) {
          stockItem.qty = (stockItem.qty || 0) - qty;
          stockItem.updated = sale.date;
        }

        DB.payments.push({
          id: nextId('TXN', DB.payments), date: sale.date,
          type: 'Client Payment', order_id: '', linked_id: sale.id,
          amount: sale.total, method: sale.method,
          notes: `Showroom sale: ${sale.item} x${sale.qty}`, created: sale.created
        });

        saveDB();
        audit('CREATE', 'sale', sale.id, { item: sale.item, qty: sale.qty, total: sale.total });
        return created(res, sale);
      }

      if (method === 'DELETE' && parts[1]) {
        const idx = DB.sales.findIndex(x => x.id === parts[1]);
        if (idx < 0) return err(res, 404, 'Sale not found');
        const sale = DB.sales[idx];
        if (sale.stock_id) {
          const stockItem = DB.stock.find(x => x.id === sale.stock_id);
          if (stockItem) {
            stockItem.qty = (stockItem.qty || 0) + (sale.qty || 0);
            stockItem.updated = new Date().toISOString().split('T')[0];
          }
        }
        DB.sales.splice(idx, 1);
        saveDB();
        audit('DELETE', 'sale', parts[1]);
        return ok(res, {}, 'Sale deleted');
      }
    }

    // ── SETTINGS ───────────────────────────────────────
    if (parts[0] === 'settings') {
      if (method === 'GET') {
        const { pin_hash, ...safe } = DB.settings;
        return ok(res, { settings: safe, meta: DB.meta });
      }
      if (method === 'PUT') {
        const body = await readBody(req);
        const allowed = ['workshop_name','location','phone','currency','tax_rate'];
        allowed.forEach(k => { if (body[k] !== undefined) DB.settings[k] = body[k]; });
        saveDB();
        audit('UPDATE', 'settings', 'global');
        return ok(res, DB.settings, 'Settings saved');
      }
    }

    // ── P&L REPORT ─────────────────────────────────────
    if (parts[0] === 'report' && parts[1] === 'pl' && method === 'GET') {
      const orders   = DB.orders;
      const payments = DB.payments;
      const expenses = DB.expenses;
      const sales    = DB.sales;

      const totalValue     = orders.reduce((s, o) => s + (o.price || 0), 0);
      const ordersReceived = orders.reduce((s, o) => s + (o.received || 0), 0);
      const showroomSales  = sales.reduce((s, x) => s + (x.total || 0), 0);
      const showroomSalesCost = sales.reduce((s, x) => s + (x.cost_total || 0), 0);
      const showroomGrossProfit = showroomSales - showroomSalesCost;
      const totalReceived  = ordersReceived + showroomSales;
      const totalOutstanding = totalValue - totalReceived;
      const workerPay      = payments.filter(p => p.type === 'Worker Payment').reduce((s, p) => s + (p.amount || 0), 0);
      const supplierPay    = payments.filter(p => p.type === 'Supplier Payment').reduce((s, p) => s + (p.amount || 0), 0);
      const expensesTotal  = expenses.reduce((s, e) => s + (e.amount || 0), 0);
      const netProfit      = totalReceived - showroomSalesCost - workerPay - supplierPay - expensesTotal;

      const workerSummary = DB.workers.map(w => {
        const paid = payments.filter(p => p.type === 'Worker Payment' && p.linked_id === w.id).reduce((s, p) => s + (p.amount || 0), 0);
        const txns = payments.filter(p => p.type === 'Worker Payment' && p.linked_id === w.id);
        return { id: w.id, name: w.name, role: w.role, total_paid: paid, txn_count: txns.length, last: txns.length ? txns.slice(-1)[0].date : null };
      });

      const expByCat = {};
      expenses.forEach(e => { expByCat[e.cat] = (expByCat[e.cat] || 0) + e.amount; });

      return ok(res, {
        pl: { totalValue, ordersReceived, showroomSales, showroomSalesCost, showroomGrossProfit, totalReceived, totalOutstanding, workerPay, supplierPay, expensesTotal, netProfit },
        workerSummary,
        expensesByCategory: expByCat,
        generated: new Date().toISOString()
      });
    }

    // ── AUDIT LOG ──────────────────────────────────────
    if (parts[0] === 'audit' && method === 'GET') {
      const limit = parseInt(query.limit) || 50;
      return ok(res, { log: DB.audit_log.slice(-limit).reverse(), total: DB.audit_log.length });
    }

    // ── EXPORT ─────────────────────────────────────────
    if (parts[0] === 'export' && method === 'GET') {
      const { sessions, ...exportData } = DB;
      const body = JSON.stringify(exportData, null, 2);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="taz_backup_${new Date().toISOString().split('T')[0]}.json"`,
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(body);
    }

    // ── HEALTH ─────────────────────────────────────────
    if (parts[0] === 'health') {
      return ok(res, { status: 'ok', version: '2.4', uptime: process.uptime(), orders: DB.orders.length, ts: new Date().toISOString() });
    }

    err(res, 404, `Endpoint not found: ${method} /api/${parts.join('/')}`);

  } catch (e) {
    console.error('[ERROR]', e.message);
    err(res, 500, 'Internal server error: ' + e.message);
  }
}

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const server = http.createServer(router);
server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║   TAZ FURNITURES BACKEND  v2.4       ║');
  console.log('  ║   Mzuzu Workshop Management          ║');
  console.log('  ╠══════════════════════════════════════╣');
  console.log(`  ║   API:  http://localhost:${PORT}/api/  ║`);
  console.log(`  ║   DB:   ${DB_PATH}   ║`);
  console.log('  ╠══════════════════════════════════════╣');
  console.log('  ║   Default PIN: 1234                  ║');
  console.log('  ║   POST /api/auth/login {"pin":"1234"}║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
});

server.on('error', e => console.error('[Server]', e.message));
process.on('SIGINT', () => { saveDB(); console.log('\n[DB] Saved on exit.'); process.exit(0); });
process.on('SIGTERM', () => { saveDB(); process.exit(0); });
