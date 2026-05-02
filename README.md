# TAZ Furnitures Management System v2.4
### Mzuzu Workshop · Complete Backend + Frontend

---

## What's included

| File | Description |
|------|-------------|
| `server.js` | Node.js backend API server (zero dependencies) |
| `taz_furnitures_v24.html` | Frontend app that connects to the backend |
| `start.sh` | Linux / macOS startup script |
| `start.bat` | Windows startup script |
| `BACKEND_README.md` | Full API documentation |

---

## Quick Start (2 steps)

### Step 1 — Start the backend

**Linux / macOS:**
```bash
chmod +x start.sh
./start.sh
```

**Windows:**
```
Double-click start.bat
```

**Or directly:**
```bash
node server.js
```

You'll see:
```
  ╔══════════════════════════════════════╗
  ║   TAZ FURNITURES BACKEND  v2.4       ║
  ║   API:  http://localhost:3747/api/   ║
  ╚══════════════════════════════════════╝
```

### Step 2 — Open the frontend

Open `taz_furnitures_v24.html` in your browser.

The login screen shows "Backend online" when connected. Enter Owner PIN `1234` or Cashier PIN `5678`.

---

## System Requirements

- **Node.js** v18 or newer — https://nodejs.org
- Any modern browser (Chrome, Firefox, Edge, Safari)
- No other software needed

---

## Security

| Feature | Detail |
|---------|--------|
| Authentication | PIN-based login with JWT tokens |
| Roles | Owner (full access) and Cashier (showroom only) |
| PIN storage | HMAC-SHA256 hashed (never stored in plain text) |
| Default PINs | Owner and Cashier have separate default PINs |
| Token expiry | 8 hours — must re-login after |
| Token invalidation | All sessions cleared on PIN change |
| CORS | Configured for local use |

**Change the default PINs after first login** via Settings → Change PIN (owner only).

For production, set a strong JWT secret and a shared API key for request access:
```bash
API_KEY=your-shared-access-key JWT_SECRET=your-very-long-random-secret node server.js
```
If `API_KEY` is not set, the backend will use a local fallback key: `taz-access-key`.

---

## API Overview

All endpoints require `Authorization: Bearer <token>` except `/api/auth/login` and `/api/health`.

### Authentication
```
POST /api/auth/login          { "pin": "1234" }  →  { token, expires, role }
POST /api/auth/logout
POST /api/auth/change-pin     { "type": "owner"|"cashier", "current_pin", "new_pin" }  (owner only)
```

**Roles:**
- **Owner** (PIN: 1234): Full access to all features
- **Cashier** (PIN: 5678): Limited to showroom (stock and sales recording)

### Core endpoints
```
GET/POST        /api/orders
GET/PUT/DELETE  /api/orders/:id

GET/POST        /api/payments
GET/DELETE      /api/payments/:id

GET/POST        /api/expenses
DELETE          /api/expenses/:id

GET/POST/PUT/DELETE  /api/workers/:id
GET/POST/PUT/DELETE  /api/clients/:id
GET/POST/PUT/DELETE  /api/suppliers/:id
```

### Reports & System
```
GET  /api/dashboard          Summary metrics + overdue orders + recent transactions
GET  /api/report/pl          Full Profit & Loss report
GET  /api/settings           Workshop settings
PUT  /api/settings           Update settings
GET  /api/audit?limit=50     Activity audit log
GET  /api/export             Download full JSON backup
GET  /api/health             Server health check
```

---

## Database

Data is stored in `data/taz_db.json` (created automatically on first run).

- Atomic writes (temp file → rename) prevent corruption
- Audit log in `data/taz_log.ndjson`
- Pre-loaded with all 14 orders, 11 clients, 5 workers, 3 suppliers from the original spreadsheet

**Backup:** `GET /api/export` downloads the full database as JSON.

---

## Features

**Dashboard**
- Live revenue, outstanding, worker costs, supplier costs, net profit
- Revenue vs balance chart per client
- Order status donut chart
- Outstanding balances table with one-click payment collection
- Recent 15 transactions timeline

**Orders**
- Full CRUD — create, read, update, delete
- Filter by status, search by client/item
- Balance auto-calculated: price − received
- Advance payment auto-recorded as a transaction when order is created
- Delivery status tracking

**Payment History**
- Every transaction in one timeline view
- Income vs outflow metrics
- Filter by type: Client / Worker / Expense / Supplier
- Net flow calculated

**Payments**
- Record any payment type
- Linked to orders and workers/suppliers
- Summaries by type

**Expenses**
- Categorised expense tracking
- Auto-creates payment record
- Top category summary

**Workers**
- Worker cards with total paid, last payment, transaction count
- Dedicated "Pay Worker" flow (Wages / Advance / Bonus / Piece)
- Full payment history per worker via `/api/workers/:id`

**Clients**
- Client directory with order count and total spent
- Full order + payment history per client via `/api/clients/:id`
- Search by name or phone

**Suppliers**
- Supplier cards with total paid, payment terms, last payment
- Pay supplier flow with invoice tracking
- Full payment history per supplier via `/api/suppliers/:id`

**P&L Report**
- Full income statement: contracted → collected → outstanding
- All cost lines: workers, suppliers, expenses
- Net profit/loss with status alert
- Per-worker payment summary table
- Printable

**Audit Log**
- Every create, update, delete, and login event recorded
- Timestamped, stored in backend

**Settings**
- Workshop name, location, phone, currency — all editable
- PIN change (current PIN required, all sessions invalidated)
- System info: uptime, record counts, server version
- Export full JSON backup
- Lock / log out

---

## Changing the port

```bash
PORT=8080 node server.js
```

Then update `API_URL` in `taz_furnitures_v24.html`:
```js
const API_URL = 'http://localhost:8080/api';
```

---

## Data seeded from original spreadsheet

All data from `Carpentry_Workshop_Management_copy.xlsx` is pre-loaded:

- 14 orders (ORD001–ORD014)
- 11 clients (C001–C011)  
- 5 workers (W001–W005)
- 3 suppliers (SUP001–SUP003)
- 2 initial payments (TXN001–TXN002)
