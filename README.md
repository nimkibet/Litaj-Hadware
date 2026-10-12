# 🟧 Litaj Hardware POS & Inventory System

> **Enterprise Point of Sale, Stock Management, and Customer Debt Ledger for Litaj Hardware.**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla ES6+ Modules + Tailwind CSS v3 |
| Backend | Node.js + Express v4 |
| Database | Supabase (PostgreSQL 15+) |
| PDF Engine | jsPDF + AutoTable |
| Spreadsheet | SheetJS (xlsx) |

---

## Project Structure

```
litaj-hardware-pos/
├── public/
│   ├── login.html          # Staff PIN login
│   ├── pos.html            # POS checkout terminal
│   ├── inventory.html      # Stock management
│   ├── customers.html      # Customer debt ledger
│   ├── js/
│   │   ├── supabaseClient.js  # Auth, session, Supabase SDK
│   │   ├── login.js
│   │   ├── pos.js
│   │   ├── inventory.js
│   │   └── customers.js
│   └── partials/
│       └── nav.html
├── src/
│   └── server.js           # Express web server
├── .env.example            # Safe template — copy to .env
├── .gitignore
└── package.json
```

---

## Setup

### 1. Clone & Install
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```
Fill in your Supabase credentials inside `.env`. **Never commit `.env`.**

### 3. Configure Supabase Meta Tags
In each HTML file, update the two meta tags:
```html
<meta name="supa-url" content="https://YOUR_PROJECT.supabase.co">
<meta name="supa-key" content="YOUR_ANON_KEY">
```

### 4. Run Database Schema
Copy the SQL from `CLONE_BLUEPRINT.md` → Section 2 and run it in your Supabase SQL Editor.

### 5. Start Server
```bash
npm run dev   # development (nodemon)
npm start     # production
```

Open: [http://localhost:3000](http://localhost:3000)

---

## Default Login
| Username | PIN | Role |
|---|---|---|
| `admin` | `1234` | Admin |
| `cashier1` | `0000` | Cashier |

---

## Security Notes
- `.env` and `superbase credetnials.txt` are in `.gitignore` — never committed.
- Supabase `ANON_KEY` (public key) is safe to expose in the client.
- **Service-role key is never used in any frontend file.**
- RLS is enabled on all database tables.

---

## Phase 2 Roadmap
- [ ] Offline IndexedDB sync queue
- [ ] SQLite local fallback
- [ ] Multi-tier packaging waterfall (for paper/stationery if needed)
- [ ] Admin financial dashboard (monthly closes, expense tracking)
- [ ] Attendance & wages module
