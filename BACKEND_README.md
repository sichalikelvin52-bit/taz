# TAZ Furnitures — Backend API v2.4

**Zero dependencies · Pure Node.js · JSON database**

---

## Quick Start

```bash
# 1. Start the server
node server.js

# 2. Server runs at:
http://localhost:3747/api/
```

---

## Authentication

All endpoints except `/api/auth/login` require a Bearer token.

```bash
# Login (default PIN: 1234)
curl -X POST http://localhost:3747/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"pin":"1234"}'

# Use the token in all subsequent requests
curl http://localhost:3747/api/dashboard \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with PIN → get token |
| POST | `/api/auth/logout` | Invalidate token |
| POST | `/api/auth/change-pin` | Change PIN (requires auth) |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard` | Summary metrics, overdue orders, recent transactions |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | List all orders (filter: `?status=Pending&search=...`) |
| GET | `/api/orders/:id` | Single order with payment history |
| POST | `/api/orders` | Create order |
| PUT | `/api/orders/:id` | Update order |
| DELETE | `/api/orders/:id` | Delete order |

**POST /api/orders body:**
```json
{
  "client": "Martha Eji",
  "client_id": "C001",
  "item": "Cream white 3,2,2",
  "qty": 1,
  "price": 1800000,
  "advance": 700000,
  "status": "Pending",
  "delivery": "Pending",
  "notes": ""
}
```

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/payments` | All payments (filter: `?type=Client Payment&order_id=ORD001`) |
| GET | `/api/payments/:id` | Single payment |
| POST | `/api/payments` | Record payment |
| DELETE | `/api/payments/:id` | Delete payment |

**POST /api/payments body:**
```json
{
  "type": "Client Payment",
  "amount": 500000,
  "method": "Mobile Money",
  "order_id": "ORD001",
  "date": "2025-08-14",
  "notes": "Balance payment"
}
```

**Payment types:** `Client Payment` | `Worker Payment` | `Expense` | `Supplier Payment`

### Expenses
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/expenses` | All expenses with totals by category |
| POST | `/api/expenses` | Add expense |
| DELETE | `/api/expenses/:id` | Delete expense |

### Workers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workers` | All workers with payment totals |
| GET | `/api/workers/:id` | Worker + full payment history |
| POST | `/api/workers` | Add worker |
| PUT | `/api/workers/:id` | Update worker |
| DELETE | `/api/workers/:id` | Delete worker |

### Clients
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/clients` | All clients with order counts |
| GET | `/api/clients/:id` | Client + orders + payments |
| POST | `/api/clients` | Add client |
| PUT | `/api/clients/:id` | Update client |
| DELETE | `/api/clients/:id` | Delete client |

### Suppliers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/suppliers` | All suppliers with payment totals |
| GET | `/api/suppliers/:id` | Supplier + payment history |
| POST | `/api/suppliers` | Add supplier |
| PUT | `/api/suppliers/:id` | Update supplier |
| DELETE | `/api/suppliers/:id` | Delete supplier |

### Reports & System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/report/pl` | Full Profit & Loss report |
| GET | `/api/settings` | Workshop settings |
| PUT | `/api/settings` | Update settings |
| GET | `/api/audit` | Audit log (`?limit=50`) |
| GET | `/api/export` | Full database JSON export |
| GET | `/api/health` | Server health check |

---

## Response Format

All responses follow this structure:
```json
{
  "success": true,
  "msg": "OK",
  "data": { ... }
}
```

Errors:
```json
{
  "success": false,
  "msg": "Error description",
  "data": null
}
```

---

## Data Storage

- **Database:** `data/taz_db.json` (atomic writes with temp file)
- **Audit log:** `data/taz_log.ndjson` (newline-delimited JSON)
- **Backups:** Export via `GET /api/export`

---

## Security

- PIN is stored as HMAC-SHA256 hash (never plaintext)
- JWT tokens (HMAC-SHA256 signed, 8-hour expiry)
- All sessions stored server-side and invalidated on PIN change
- CORS enabled for frontend integration

---

## Connecting the Frontend

Set `API_URL` in the frontend to point to this server:

```js
const API_URL = 'http://localhost:3747/api';
```

The frontend HTML file (`taz_furnitures_v24.html`) is pre-configured to connect to this backend automatically and falls back to local storage if the backend is unreachable.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3747` | Server port |
| `JWT_SECRET` | built-in | Change in production! |
