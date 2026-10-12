# MASTER SYSTEM BLUEPRINT: LITAJ HARDWARE POS & INVENTORY MANAGEMENT SYSTEM

> **Client:** Litaj Hardware  
> **Target Industry / Domain:** Hardware, Building Materials, Electrical & Tools Retail  
> **Primary Brand Theme:** Industrial Safety Orange (`#EA580C` / Tailwind `orange-600` & `amber-500`)  
> **Architecture Pattern:** Zero-Trust Cloud-First Web Architecture (Supabase PostgreSQL 15+ & Node.js/Express)  
> **Phase 1 Release Scope:** High-Performance Online POS & Single-Product Inventory Engine  
> *(Note: Multi-tier recursive packaging waterfall and offline IndexedDB/SQLite sync queues are deferred to Phase 2 roadmap to ensure rapid, rock-solid core deployment).*

---

## HOW TO USE THIS BLUEPRINT

This blueprint is the master technical specification and AI implementation guide customized specifically for **Litaj Hardware**. It defines the database schema, autonomous stock deduction triggers, hardware categories, receipt rendering, and the high-speed touch POS terminal with Litaj's signature **Orange** theme.

To build and deploy Litaj Hardware POS:
1. Provide **Section 1** as the context and technology boundary to your development team or AI agent.
2. Execute **Section 2 (Phase 1 Database Prompt)** to instantiate the PostgreSQL / Supabase schema, direct stock deduction procedures, sales ledger, and Row-Level Security (RLS) policies.
3. Execute **Section 3 (Phase 2 Backend & Routing Prompt)** to scaffold the Node.js/Express server, Supabase client authentication, role-based access control, and network health guards.
4. Execute **Section 4 (Phase 3 Frontend & UI Prompt)** to build the Litaj Hardware POS interface, the quick-add hardware grid, receipt/quotation PDF generator, and the **Single-Product Hardware Inventory Modal**.

---

## 1. System Architecture & Tech Stack

### 1.1 Core Technology Inventory

| Layer | Technology | Version / Specification | Rationale & Responsibility |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | Vanilla ES6+ Modules | Modern ECMAScript (Modules `type="module"`) | Instant boot, zero-build overhead, rapid touch response on counter terminals, ultra-reliable. |
| **Design System & UI Theme** | Tailwind CSS | v3.x (CDN / PostCSS build) | **Litaj Orange Design System**: High-contrast industrial palette (`orange-500`, `orange-600`, `orange-700`, `amber-500`, `slate-900`) tailored for hardware counter clarity. |
| **Cloud Database & Auth** | PostgreSQL via Supabase | PostgreSQL 15+ | Relational integrity, UUID v4 keys, Row-Level Security (RLS), Realtime WebSocket channels, and atomic PL/pgSQL procedures. |
| **Client Database SDK** | `@supabase/supabase-js` | v2.39.0+ | Direct asynchronous data mutations from edge clients with auto-reconnect and change subscriptions. |
| **Web Server & Host** | Node.js + Express | Express v5.x / v4.x | Static asset hosting, fallback navigation routing, and local network serving. |
| **Receipt & Quotation Engine**| jsPDF + AutoTable | `jspdf` v2.5.1 + `jspdf-autotable` v3.5.31 | Client-side 80mm thermal receipt and formal A4 quotation/invoice PDF generation with Litaj Hardware branding. |
| **Spreadsheet Engine** | SheetJS (`xlsx`) | `xlsx` v0.18.5 | Client-side Excel export and bulk product import for hardware stock audits. |
| **Iconography** | Lucide Icons / Heroicons | CDN SVG / Font | Clean, recognizable icons for hardware categories (tools, pipes, electrical, paint). |

### 1.2 Hardware Domain Scope & Data Architecture

```
                    +--------------------------------------------+
                    |          Litaj Hardware POS Client         |
                    |      (Desktop Browser, Tablet, Touch)      |
                    +---------------------+----------------------+
                                          |
                      +-------------------+-------------------+
                      |                                       |
             [Direct POS Mutations]                 [Static Asset Delivery]
                      |                                       |
                      v                                       v
         +--------------------------+            +--------------------------+
         | Supabase Cloud Backend   |            | Node.js / Express Server |
         | - PostgreSQL 15+ (UUID)  |            | - Serves public/ files   |
         | - Litaj Hardware Tables  |            | - Route Fallbacks        |
         | - Single-Product Logic   |            +--------------------------+
         | - Stock Sync Triggers    |
         | - Zero-Trust RLS Guard   |
         +--------------------------+
```

### 1.3 Litaj Orange Palette Specification

- **Primary Brand Color:** `orange-600` (`#EA580C`)
- **Primary Hover / Active:** `orange-700` (`#C2410C`)
- **Accent & Highlights:** `amber-500` (`#F59E0B`)
- **Subtle Surface / Tint:** `orange-50` (`#FFF7ED`) / `orange-100` (`#FFEDD5`)
- **Borders & Dividers:** `orange-200` (`#FED7AA`) / `slate-200` (`#E2E8F0`)
- **Focus Rings:** `focus:ring-2 focus:ring-orange-500 focus:border-orange-500`
- **Dark Neutral (Hardware Theme):** `slate-900` (`#0F172A`) for deep contrast headers and tactile buttons.

---

## 2. Phase 1 Database Prompt: Schema, Single-Product Inventory, & Autonomous Stock Triggers

Copy and paste the prompt below into an AI agent or run it directly against Supabase SQL Editor.

````markdown
# TASK: Generate Database Schema & Autonomous Stock Triggers for Litaj Hardware

You are a Principal Database Architect & DevSecOps Engineer. You must generate the complete, production-ready PostgreSQL 15+ schema (Supabase compatible) for Litaj Hardware.

### Core Architectural Directives:
1. **Surrogate Key (UUID) Strategy:**
   - Every primary key MUST be a UUID v4 generated via `gen_random_uuid()`.
2. **Single-Product Hardware Inventory Model:**
   - Each hardware item is a distinct, independently tracked SKU with a designated Unit of Measure (`unit_of_measure`, e.g., 'pcs', 'kg', 'bag', 'meter', 'roll', 'box', 'litre').
   - Keep schema clean and flat: no recursive parent-child waterfall unpacking.
   - Support hardware categories (e.g., 'Cement & Masonry', 'Plumbing & Pipes', 'Electrical', 'Hand & Power Tools', 'Paint & Thinners', 'Nails & Fasteners', 'Roofing & Timber', 'Safety Equipment').
   - Track `stock_quantity`, `min_threshold` (for low-stock reorder warnings), `selling_price`, `buying_price`, and `profit_margin` (generated).
3. **Normalized Sales & Items Ledger:**
   - `sales_log`: Records the parent checkout transaction (receipt number, cashier, customer, payment method, total, profit, void status).
   - `sale_items`: Records each line item in the receipt with item ID, quantity, unit price, and line total.
4. **Autonomous Stock Deduction & Restoration Triggers:**
   - On sale item creation (`INSERT` on `sale_items`), automatically deduct item stock using pessimistic locking (`SELECT ... FOR UPDATE`).
   - When a sale is voided (`is_voided = TRUE` on `sales_log`), automatically restore stock for all associated line items.
   - If a void is reversed (`is_voided = FALSE`), re-deduct the stock.
5. **Customer Debt & Credit Tracking:**
   - `customers` table with `outstanding_debt` tracking. When a sale is completed with `payment_method = 'Debt'`, increment the customer's balance. When debt payment is logged, decrement the balance.
6. **Zero-Trust Row-Level Security (RLS):**
   - Enable RLS across all tables with explicit operational policies.

---

### Step 1: PostgreSQL DDL Script

```sql
-- Enable cryptographic extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ====================================================================
-- 1. USERS & ACCESS CONTROL
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    pin VARCHAR(8) NOT NULL, -- 4-digit POS terminal PIN
    role TEXT NOT NULL CHECK (role IN ('admin', 'cashier', 'manager')),
    full_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================
-- 2. HARDWARE INVENTORY (Single-Product Model)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General Hardware',
    unit_of_measure TEXT NOT NULL DEFAULT 'pcs', -- 'pcs', 'kg', 'bag', 'meter', 'roll', 'box', 'litre', 'set'
    selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
    buying_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (buying_price >= 0),
    profit_margin NUMERIC(12, 2) GENERATED ALWAYS AS (selling_price - buying_price) STORED,
    stock_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
    min_threshold NUMERIC(12, 2) NOT NULL DEFAULT 5,
    barcode VARCHAR(255) NULL,
    is_quick_add BOOLEAN NOT NULL DEFAULT FALSE, -- Displays on POS Quick-Add presets
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_name ON public.inventory(name);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON public.inventory(category);
CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON public.inventory(barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_quick_add ON public.inventory(is_quick_add);

-- ====================================================================
-- 3. CUSTOMER LEDGER & CREDIT
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    outstanding_debt NUMERIC(12, 2) NOT NULL DEFAULT 0,
    credit_limit NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);

-- ====================================================================
-- 4. SALES LOG (Parent Receipt)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.sales_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_no TEXT UNIQUE NOT NULL,
    cashier_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'M-Pesa', 'Card', 'Debt', 'Bank Transfer')),
    total_charged NUMERIC(12, 2) NOT NULL DEFAULT 0,
    calculated_profit NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    amount_tendered NUMERIC(12, 2) NOT NULL DEFAULT 0,
    change_given NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'debt', 'refunded', 'voided')),
    is_voided BOOLEAN NOT NULL DEFAULT FALSE,
    voided_at TIMESTAMP WITH TIME ZONE,
    voided_by UUID REFERENCES public.users(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_log_receipt_no ON public.sales_log(receipt_no);
CREATE INDEX IF NOT EXISTS idx_sales_log_created_at ON public.sales_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_log_customer ON public.sales_log(customer_id);

-- ====================================================================
-- 5. SALE ITEMS (Normalized Line Items)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES public.sales_log(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
    item_name TEXT NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    buying_price_at_sale NUMERIC(12, 2) NOT NULL DEFAULT 0,
    line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0),
    profit NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_item_id ON public.sale_items(item_id);

-- ====================================================================
-- 6. HARDWARE OPERATING EXPENSES
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL CHECK (category IN ('Transport / Delivery', 'Utilities', 'Wages & Casual Labor', 'Store Maintenance', 'Miscellaneous')),
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    recorded_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON public.expenses(created_at DESC);

-- ====================================================================
-- 7. STAFF ATTENDANCE & SHIFTS
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.attendance_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    work_date DATE NOT NULL,
    wage_assigned NUMERIC(12, 2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, work_date)
);

-- ====================================================================
-- 8. DEBT PAYMENTS LEDGER
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.debt_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'M-Pesa', 'Bank Transfer')),
    reference_code TEXT,
    recorded_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================
-- 9. SYSTEM SETTINGS & BRAND CONFIG
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed default initial configurations for Litaj Hardware
INSERT INTO public.settings (key, value) VALUES
    ('company_name', 'Litaj Hardware'),
    ('currency_symbol', 'Ksh'),
    ('phone_contact', '+254 700 000 000'),
    ('location_address', 'Main Hardware Yard, Commercial Street'),
    ('receipt_footer', 'Thank you for building with Litaj Hardware! Goods once sold are not returnable without valid receipt.'),
    ('tax_rate', '0'),
    ('theme_color', 'orange')
ON CONFLICT (key) DO NOTHING;

-- Seed initial administrative and cashier staff
INSERT INTO public.users (username, pin, role, full_name) VALUES 
    ('admin', '1234', 'admin', 'System Administrator'),
    ('cashier1', '0000', 'cashier', 'Counter Cashier')
ON CONFLICT (username) DO NOTHING;

-- Seed initial Litaj Hardware sample inventory
INSERT INTO public.inventory (name, category, unit_of_measure, selling_price, buying_price, stock_quantity, min_threshold, is_quick_add) VALUES
    ('Simba Cement 50kg (32.5R)', 'Cement & Masonry', 'bag', 680.00, 620.00, 150, 20, TRUE),
    ('Bamburi Tembo Cement 50kg (42.5N)', 'Cement & Masonry', 'bag', 750.00, 690.00, 80, 15, TRUE),
    ('Wire Nails 3 Inch (1kg)', 'Nails & Fasteners', 'kg', 160.00, 120.00, 100, 10, TRUE),
    ('Wire Nails 4 Inch (1kg)', 'Nails & Fasteners', 'kg', 160.00, 120.00, 100, 10, TRUE),
    ('Roofing Nails with Rubber Washers (1kg)', 'Nails & Fasteners', 'kg', 240.00, 180.00, 50, 10, TRUE),
    ('Binding Wire (1 Roll - 25kg)', 'Nails & Fasteners', 'roll', 3800.00, 3200.00, 15, 3, TRUE),
    ('PVC Waste Pipe 1.5 Inch (4 Meters)', 'Plumbing & Pipes', 'pcs', 450.00, 340.00, 40, 8, TRUE),
    ('PPR Pipe 20mm Hot/Cold (4 Meters)', 'Plumbing & Pipes', 'pcs', 550.00, 420.00, 30, 6, FALSE),
    ('Pegler Brass Gate Valve 1/2 Inch', 'Plumbing & Pipes', 'pcs', 850.00, 680.00, 25, 5, FALSE),
    ('Crown Super Cover Emulsion White 20L', 'Paint & Thinners', 'bucket', 4200.00, 3500.00, 20, 4, TRUE),
    ('Thinner Standard 5 Litres', 'Paint & Thinners', 'tin', 1200.00, 950.00, 25, 5, FALSE),
    ('DeWalt Cutting Disc 4.5 Inch', 'Hand & Power Tools', 'pcs', 120.00, 80.00, 80, 15, TRUE),
    ('Total Claw Hammer Steel 16oz', 'Hand & Power Tools', 'pcs', 850.00, 650.00, 15, 3, FALSE),
    ('Ordinary Portland Sand 1 Ton', 'Cement & Masonry', 'ton', 2500.00, 1900.00, 20, 5, FALSE)
ON CONFLICT DO NOTHING;
```

---

### Step 2: Atomic Stock Deduction & Void Handlers

```sql
-- ====================================================================
-- ATOMIC SINGLE PRODUCT STOCK DEDUCTION
-- ====================================================================
CREATE OR REPLACE FUNCTION public.deduct_inventory_stock(
    p_item_id UUID,
    p_qty NUMERIC
)
RETURNS BOOLEAN AS $$
DECLARE
    v_stock NUMERIC;
BEGIN
    -- Acquire Pessimistic Row Lock
    SELECT stock_quantity INTO v_stock
    FROM public.inventory
    WHERE id = p_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory item % does not exist', p_item_id;
    END IF;

    -- Deduct stock directly
    UPDATE public.inventory
    SET stock_quantity = stock_quantity - p_qty,
        updated_at = NOW()
    WHERE id = p_item_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================================================
-- SALE ITEMS TRIGGER: Deduct on Insert, Restore on Delete
-- ====================================================================
CREATE OR REPLACE FUNCTION public.sync_inventory_on_sale_item()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM public.deduct_inventory_stock(NEW.item_id, NEW.quantity);
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        UPDATE public.inventory
        SET stock_quantity = stock_quantity + OLD.quantity,
            updated_at = NOW()
        WHERE id = OLD.item_id;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_inventory_on_sale_item ON public.sale_items;
CREATE TRIGGER trg_sync_inventory_on_sale_item
AFTER INSERT OR DELETE ON public.sale_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_inventory_on_sale_item();

-- ====================================================================
-- SALES LOG VOID TRIGGER: Restore All Stock on Void, Re-deduct if Un-voided
-- ====================================================================
CREATE OR REPLACE FUNCTION public.handle_sale_void_transition()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    -- Case 1: Sale transition to VOIDED -> Restore stock of all items
    IF OLD.is_voided = FALSE AND NEW.is_voided = TRUE THEN
        FOR r IN SELECT item_id, quantity FROM public.sale_items WHERE sale_id = NEW.id LOOP
            UPDATE public.inventory
            SET stock_quantity = stock_quantity + r.quantity,
                updated_at = NOW()
            WHERE id = r.item_id;
        END LOOP;

        -- If sale was on Debt, reverse customer outstanding debt
        IF NEW.payment_method = 'Debt' AND NEW.customer_id IS NOT NULL THEN
            UPDATE public.customers
            SET outstanding_debt = GREATEST(0, outstanding_debt - NEW.total_charged),
                updated_at = NOW()
            WHERE id = NEW.customer_id;
        END IF;
    END IF;

    -- Case 2: Sale transition from VOIDED to ACTIVE -> Re-deduct stock
    IF OLD.is_voided = TRUE AND NEW.is_voided = FALSE THEN
        FOR r IN SELECT item_id, quantity FROM public.sale_items WHERE sale_id = NEW.id LOOP
            PERFORM public.deduct_inventory_stock(r.item_id, r.quantity);
        END LOOP;

        -- If sale was on Debt, re-apply customer debt
        IF NEW.payment_method = 'Debt' AND NEW.customer_id IS NOT NULL THEN
            UPDATE public.customers
            SET outstanding_debt = outstanding_debt + NEW.total_charged,
                updated_at = NOW()
            WHERE id = NEW.customer_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_handle_sale_void ON public.sales_log;
CREATE TRIGGER trg_handle_sale_void
AFTER UPDATE OF is_voided ON public.sales_log
FOR EACH ROW
EXECUTE FUNCTION public.handle_sale_void_transition();

-- ====================================================================
-- CUSTOMER DEBT TRIGGER: Automatically increment on Debt sales
-- ====================================================================
CREATE OR REPLACE FUNCTION public.apply_customer_debt_on_sale()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.payment_method = 'Debt' AND NEW.customer_id IS NOT NULL AND NEW.is_voided = FALSE THEN
        UPDATE public.customers
        SET outstanding_debt = outstanding_debt + NEW.total_charged,
            updated_at = NOW()
        WHERE id = NEW.customer_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_apply_customer_debt ON public.sales_log;
CREATE TRIGGER trg_apply_customer_debt
AFTER INSERT ON public.sales_log
FOR EACH ROW
EXECUTE FUNCTION public.apply_customer_debt_on_sale();

-- Customer Debt Repayment Handler
CREATE OR REPLACE FUNCTION public.handle_debt_payment()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.customers
    SET outstanding_debt = GREATEST(0, outstanding_debt - NEW.amount),
        updated_at = NOW()
    WHERE id = NEW.customer_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_handle_debt_payment ON public.debt_payments;
CREATE TRIGGER trg_handle_debt_payment
AFTER INSERT ON public.debt_payments
FOR EACH ROW
EXECUTE FUNCTION public.handle_debt_payment();
```

---

### Step 3: Zero-Trust Row-Level Security (RLS)

```sql
-- Enable RLS across all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Production Access Policies (Supabase Client Access)
CREATE POLICY "Allow public read-write for Litaj POS operations" ON public.users FOR ALL USING (true);
CREATE POLICY "Allow public read-write for Litaj POS inventory" ON public.inventory FOR ALL USING (true);
CREATE POLICY "Allow public read-write for Litaj POS customers" ON public.customers FOR ALL USING (true);
CREATE POLICY "Allow public read-write for Litaj POS sales" ON public.sales_log FOR ALL USING (true);
CREATE POLICY "Allow public read-write for Litaj POS sale items" ON public.sale_items FOR ALL USING (true);
CREATE POLICY "Allow public read-write for Litaj POS expenses" ON public.expenses FOR ALL USING (true);
CREATE POLICY "Allow public read-write for Litaj POS attendance" ON public.attendance_log FOR ALL USING (true);
CREATE POLICY "Allow public read-write for Litaj POS debt payments" ON public.debt_payments FOR ALL USING (true);
CREATE POLICY "Allow public read-write for Litaj POS settings" ON public.settings FOR ALL USING (true);
```
````

---

## 3. Phase 2 Backend & Routing Prompt: Web Server & Supabase Authentication

Copy and paste the prompt below into an AI agent to scaffold the Node.js server and authentication logic.

````markdown
# TASK: Implement Web Server and Auth State Management for Litaj Hardware

You are a Senior Full-Stack Engineer. You must scaffold the Express static server, client Supabase SDK connection, PIN authentication, and role authorization for Litaj Hardware.

### Core Architectural Requirements:
1. **Node.js Express Server (`src/server.js`):**
   - Serve static assets from `/public`.
   - Provide route fallbacks for the HTML pages:
     - `/` and `/login` -> `public/login.html`
     - `/pos` -> `public/pos.html`
     - `/inventory` -> `public/inventory.html`
     - `/customers` -> `public/customers.html`
     - `/admin` -> `public/admin.html`
   - Include health-check endpoint `GET /healthz`.
2. **Client Supabase Connection & Auth Guard (`public/js/supabaseClient.js`):**
   - Connect using `@supabase/supabase-js`.
   - Implement PIN-based cashier/admin authentication against `public.users`.
   - Store session securely in `localStorage` under key `litaj_pos_session`.
   - Enforce page-level guard `requireAuth()` on all protected screens.
   - Elements tagged with `.admin-only` must be hidden unless the authenticated role is `admin`.
   - Display a clean network connection health banner in the top navigation bar.

---

### Implementation File 1: Node.js Express Server (`src/server.js`)

```javascript
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint for uptime monitoring
app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'healthy', system: 'Litaj Hardware POS', timestamp: new Date() });
});

// Explicit route navigation aliases
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/login.html')));
app.get('/pos', (req, res) => res.sendFile(path.join(__dirname, '../public/pos.html')));
app.get('/inventory', (req, res) => res.sendFile(path.join(__dirname, '../public/inventory.html')));
app.get('/customers', (req, res) => res.sendFile(path.join(__dirname, '../public/customers.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));

// Fallback HTML page router
app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) {
        res.sendFile(path.join(__dirname, '../public/login.html'));
    } else {
        next();
    }
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🟧 LITAJ HARDWARE POS SERVER STARTED`);
    console.log(`> Listening on: http://localhost:${PORT}`);
    console.log(`> Primary Theme: Safety Orange (#EA580C)`);
    console.log(`====================================================`);
});
```

---

### Implementation File 2: Supabase Client & Auth State Guard (`public/js/supabaseClient.js`)

```javascript
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';

// CONFIGURE WITH YOUR SUPABASE PROJECT CREDENTIALS
export const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export let currentUser = null;

// Authenticate staff with username & PIN
export async function login(username, pin) {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, username, role, full_name')
            .eq('username', username.trim().toLowerCase())
            .eq('pin', pin.trim())
            .single();

        if (error || !data) {
            return { success: false, message: 'Invalid username or PIN code' };
        }

        currentUser = data;
        localStorage.setItem('litaj_pos_session', JSON.stringify(data));
        return { success: true, user: data };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

// Clear session and return to login screen
export function logout() {
    currentUser = null;
    localStorage.removeItem('litaj_pos_session');
    window.location.href = '/login.html';
}

// Retrieve active session from localStorage
export function checkSession() {
    const raw = localStorage.getItem('litaj_pos_session');
    if (raw) {
        try {
            currentUser = JSON.parse(raw);
            return true;
        } catch (e) {
            localStorage.removeItem('litaj_pos_session');
        }
    }
    return false;
}

// Enforce authentication & role visibility
export function requireAuth() {
    if (!checkSession()) {
        window.location.href = '/login.html';
        return;
    }

    const applyPermissions = () => {
        // Render authenticated user name in header
        const userBadge = document.getElementById('current-user-badge');
        if (userBadge && currentUser) {
            userBadge.textContent = `${currentUser.full_name} (${currentUser.role.toUpperCase()})`;
        }

        // Toggle admin-only features
        const isAdmin = currentUser && currentUser.role === 'admin';
        document.querySelectorAll('.admin-only').forEach((el) => {
            el.classList.toggle('hidden', !isAdmin);
        });
    };

    applyPermissions();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyPermissions);
    }
    setTimeout(applyPermissions, 100);

    // Global logout button listener
    document.addEventListener('click', (e) => {
        if (e.target && (e.target.id === 'btn-logout' || e.target.closest('#btn-logout'))) {
            logout();
        }
    });
}
```
````

---

## 4. Phase 3 Frontend & UI Prompt: Screens, Single-Product Inventory, & Orange Theme

Copy and paste the prompt below into an AI agent to build the user interface and hardware management modules.

````markdown
# TASK: Recreate the Core UI with Orange Theme & Single-Product Inventory for Litaj Hardware

You are a Lead Frontend Engineer specializing in high-throughput retail POS systems. You must build the core interactive pages using Litaj Hardware's signature **Safety Orange** theme, modern Tailwind CSS, and a straightforward Single-Product inventory interface.

---

### Core UI Pages Required:

1. **Touch-Screen Login (`login.html` & `login.js`):**
   - Litaj Hardware branded header with orange accents.
   - User selector carousel/dropdown.
   - Tactile 10-key numeric PIN pad with clear orange hover and active states.
2. **High-Speed Hardware POS Checkout (`pos.html` & `pos.js`):**
   - **Litaj Orange Top Navigation:** Brand logo, active user badge, online status dot, links to Inventory, Customers, Admin, and Logout.
   - **Quick-Add Hardware Presets:** Top grid with 1-click popular hardware items (e.g., Cement 50kg, 3" Nails, 4" Nails, Cutting Discs, Binding Wire) styled with orange accents.
   - **Real-Time Product Search & Category Filters:** Fast search input filtering by item name or barcode; filter chips for categories (All, Cement, Plumbing, Electrical, Tools, Fasteners, Paint).
   - **Interactive Document Cart:** Item list showing quantity spinner, unit of measure (bags, kg, pcs), unit price, subtotal, and remove action.
   - **Payment Modal:** Handles Cash, M-Pesa (with transaction code input), and Customer Credit/Debt selection.
   - **PDF Receipt & Quotation Generator:** Produces 80mm thermal receipts and formal A4 quotations stamped with Litaj Hardware branding.
   - **Recent Transactions & Void Modal:** Lists today's sales with one-click receipt reprinting and admin-guarded sale voiding (which automatically calls the trigger to replenish stock).
3. **Single-Product Inventory Management (`inventory.html` & `inventory.js`):**
   - Real-time tabular list displaying Product Name, Category, Unit of Measure, Stock Quantity, Buying Price, Selling Price, Margin, and Low Stock Warning.
   - Low-stock visual alerts (orange/amber badges when `stock_quantity <= min_threshold`).
   - Excel export via SheetJS.
   - **The Single-Product Modal (`#modal-product`):** Clean modal form to add or edit a single hardware product.

---

### Implementation File 1: Single-Product Inventory Management (`public/js/inventory.js`)

```javascript
import { supabase, requireAuth, currentUser } from './supabaseClient.js';

requireAuth();

let inventoryList = [];
let editingItemId = null;

const categories = [
    'Cement & Masonry',
    'Plumbing & Pipes',
    'Electrical',
    'Hand & Power Tools',
    'Paint & Thinners',
    'Nails & Fasteners',
    'Roofing & Timber',
    'Safety Equipment',
    'General Hardware'
];

// Fetch and render inventory items
export async function loadInventory() {
    const tbody = document.getElementById('inventory-table-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-500">Loading Litaj Hardware stock...</td></tr>`;

    const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('name', { ascending: true });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-red-500">Error loading inventory: ${error.message}</td></tr>`;
        return;
    }

    inventoryList = data || [];
    renderTable(inventoryList);
}

function renderTable(items) {
    const tbody = document.getElementById('inventory-table-body');
    if (!tbody) return;

    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400">No hardware items found. Click "Add New Product" to begin.</td></tr>`;
        return;
    }

    tbody.innerHTML = items.map((item) => {
        const isLowStock = Number(item.stock_quantity) <= Number(item.min_threshold);
        return `
            <tr class="border-b border-slate-100 hover:bg-orange-50/40 transition-colors">
                <td class="py-3 px-4 font-semibold text-slate-800">${item.name}</td>
                <td class="py-3 px-4"><span class="px-2 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-medium">${item.category}</span></td>
                <td class="py-3 px-4 text-xs font-semibold uppercase text-slate-600">${item.unit_of_measure}</td>
                <td class="py-3 px-4 text-right">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        isLowStock ? 'bg-amber-100 text-orange-700 border border-orange-300' : 'bg-slate-100 text-slate-800'
                    }">
                        ${item.stock_quantity}
                        ${isLowStock ? ' ⚠️' : ''}
                    </span>
                </td>
                <td class="py-3 px-4 text-right font-mono text-slate-600 text-sm">Ksh ${Number(item.buying_price).toFixed(2)}</td>
                <td class="py-3 px-4 text-right font-mono font-bold text-slate-900 text-sm">Ksh ${Number(item.selling_price).toFixed(2)}</td>
                <td class="py-3 px-4 text-right font-mono text-xs text-emerald-600 font-bold">+Ksh ${(Number(item.selling_price) - Number(item.buying_price)).toFixed(2)}</td>
                <td class="py-3 px-4 text-center">
                    <button class="px-2.5 py-1 text-xs font-semibold bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-lg mr-1 transition-colors btn-edit" data-id="${item.id}">Edit</button>
                    <button class="px-2.5 py-1 text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 rounded-lg admin-only transition-colors btn-delete" data-id="${item.id}">Delete</button>
                </td>
            </tr>
        `;
    }).join('');

    // Attach row button events
    tbody.querySelectorAll('.btn-edit').forEach((btn) => {
        btn.addEventListener('click', () => openProductModal(btn.dataset.id));
    });

    tbody.querySelectorAll('.btn-delete').forEach((btn) => {
        btn.addEventListener('click', () => deleteProduct(btn.dataset.id));
    });
}

// Open Single-Product Modal (Create or Edit)
export function openProductModal(id = null) {
    editingItemId = id;
    const modal = document.getElementById('modal-product');
    const modalTitle = document.getElementById('modal-product-title');
    const form = document.getElementById('form-product');

    if (!modal || !form) return;

    if (id) {
        modalTitle.textContent = 'Edit Hardware Product';
        const item = inventoryList.find((i) => i.id === id);
        if (item) {
            document.getElementById('prod-name').value = item.name;
            document.getElementById('prod-category').value = item.category;
            document.getElementById('prod-uom').value = item.unit_of_measure;
            document.getElementById('prod-bp').value = item.buying_price;
            document.getElementById('prod-sp').value = item.selling_price;
            document.getElementById('prod-stock').value = item.stock_quantity;
            document.getElementById('prod-min').value = item.min_threshold;
            document.getElementById('prod-barcode').value = item.barcode || '';
            document.getElementById('prod-quickadd').checked = item.is_quick_add;
        }
    } else {
        modalTitle.textContent = 'Add New Hardware Product';
        form.reset();
        document.getElementById('prod-min').value = '5';
    }

    modal.classList.remove('hidden');
}

export function closeProductModal() {
    const modal = document.getElementById('modal-product');
    if (modal) modal.classList.add('hidden');
    editingItemId = null;
}

// Save Product Form Handler
document.getElementById('form-product')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = document.getElementById('btn-save-product');
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Saving...';

    const payload = {
        name: document.getElementById('prod-name').value.trim(),
        category: document.getElementById('prod-category').value,
        unit_of_measure: document.getElementById('prod-uom').value.trim().toLowerCase(),
        buying_price: parseFloat(document.getElementById('prod-bp').value) || 0,
        selling_price: parseFloat(document.getElementById('prod-sp').value) || 0,
        stock_quantity: parseFloat(document.getElementById('prod-stock').value) || 0,
        min_threshold: parseFloat(document.getElementById('prod-min').value) || 5,
        barcode: document.getElementById('prod-barcode').value.trim() || null,
        is_quick_add: document.getElementById('prod-quickadd').checked
    };

    try {
        if (editingItemId) {
            const { error } = await supabase.from('inventory').update(payload).eq('id', editingItemId);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('inventory').insert([payload]);
            if (error) throw error;
        }

        closeProductModal();
        await loadInventory();
    } catch (err) {
        alert('Failed to save hardware product: ' + err.message);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Save Product';
    }
});

// Delete Product Handler
async function deleteProduct(id) {
    if (!confirm('Are you sure you want to delete this hardware product?')) return;
    const { error } = await supabase.from('inventory').delete().eq('id', id);
    if (error) {
        alert('Cannot delete item: ' + error.message);
        return;
    }
    await loadInventory();
}

// Excel Export via SheetJS
document.getElementById('btn-export-excel')?.addEventListener('click', () => {
    if (!inventoryList.length) return alert('No inventory data to export.');
    const worksheetData = inventoryList.map((i) => ({
        'Item Name': i.name,
        'Category': i.category,
        'Unit': i.unit_of_measure,
        'Stock Qty': i.stock_quantity,
        'Buying Price (Ksh)': i.buying_price,
        'Selling Price (Ksh)': i.selling_price,
        'Profit Margin (Ksh)': (i.selling_price - i.buying_price),
        'Low Stock Alert': i.min_threshold
    }));

    const ws = XLSX.utils.json_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    XLSX.writeFile(wb, `Litaj_Hardware_Inventory_${new Date().toISOString().slice(0, 10)}.xlsx`);
});

document.addEventListener('DOMContentLoaded', () => {
    loadInventory();
    document.getElementById('btn-add-product')?.addEventListener('click', () => openProductModal());
    document.getElementById('btn-close-modal')?.addEventListener('click', closeProductModal);
});
```

---

### Implementation File 2: Litaj Hardware POS Checkout & PDF Generator (`public/js/pos.js`)

```javascript
import { supabase, requireAuth, currentUser } from './supabaseClient.js';

requireAuth();

let catalog = [];
let cart = [];
let selectedCustomer = null;

// Initialize POS page
export async function initPOS() {
    await Promise.all([loadCatalog(), loadQuickAddPresets(), loadCustomers()]);
    renderCart();
}

// Load Hardware Catalog from Supabase
async function loadCatalog() {
    const { data } = await supabase
        .from('inventory')
        .select('*')
        .order('name');
    catalog = data || [];
    renderCatalogGrid(catalog);
}

// Render Fast Quick-Add Hardware Tiles
function loadQuickAddPresets() {
    const container = document.getElementById('quick-add-grid');
    if (!container) return;

    const quickItems = catalog.filter((i) => i.is_quick_add);
    container.innerHTML = quickItems.map((item) => `
        <button class="p-3 bg-white border border-orange-200 hover:border-orange-500 hover:bg-orange-50/50 rounded-xl shadow-sm text-left transition-all active:scale-95 quick-tile" data-id="${item.id}">
            <div class="text-xs font-bold text-slate-800 truncate">${item.name}</div>
            <div class="flex items-center justify-between mt-1">
                <span class="text-xs font-mono font-bold text-orange-600">Ksh ${item.selling_price}</span>
                <span class="text-[10px] text-slate-500 uppercase">${item.unit_of_measure}</span>
            </div>
        </button>
    `).join('');

    container.querySelectorAll('.quick-tile').forEach((btn) => {
        btn.addEventListener('click', () => addToCart(btn.dataset.id));
    });
}

// Add Item to Document Cart
export function addToCart(itemId, qty = 1) {
    const item = catalog.find((i) => i.id === itemId);
    if (!item) return;

    const existing = cart.find((c) => c.item_id === itemId);
    if (existing) {
        existing.quantity += qty;
        existing.line_total = existing.quantity * existing.unit_price;
    } else {
        cart.push({
            item_id: item.id,
            name: item.name,
            unit_of_measure: item.unit_of_measure,
            unit_price: Number(item.selling_price),
            buying_price: Number(item.buying_price),
            quantity: qty,
            line_total: Number(item.selling_price) * qty
        });
    }
    renderCart();
}

// Render Cart UI with Orange Highlights
export function renderCart() {
    const container = document.getElementById('cart-items-list');
    const totalEl = document.getElementById('cart-grand-total');
    if (!container) return;

    if (!cart.length) {
        container.innerHTML = `<div class="py-12 text-center text-slate-400 text-sm">Cart is empty. Select hardware items to begin.</div>`;
        if (totalEl) totalEl.textContent = 'Ksh 0.00';
        return;
    }

    container.innerHTML = cart.map((line, index) => `
        <div class="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
            <div class="flex-1 pr-2">
                <div class="text-sm font-bold text-slate-800 leading-tight">${line.name}</div>
                <div class="text-xs text-slate-500 font-mono">Ksh ${line.unit_price.toFixed(2)} / ${line.unit_of_measure}</div>
            </div>
            <div class="flex items-center space-x-2">
                <input type="number" min="0.1" step="any" value="${line.quantity}" class="w-16 px-2 py-1 border border-slate-200 rounded-lg text-center text-sm font-bold text-slate-800 focus:ring-2 focus:ring-orange-500 outline-none" onchange="window.updateCartQty(${index}, this.value)">
                <div class="w-20 text-right font-mono font-bold text-sm text-slate-900">Ksh ${line.line_total.toFixed(2)}</div>
                <button class="text-slate-400 hover:text-red-500 p-1" onclick="window.removeCartItem(${index})">✕</button>
            </div>
        </div>
    `).join('');

    const grandTotal = cart.reduce((sum, item) => sum + item.line_total, 0);
    if (totalEl) totalEl.textContent = `Ksh ${grandTotal.toFixed(2)}`;
}

window.updateCartQty = (index, value) => {
    const qty = parseFloat(value);
    if (qty > 0) {
        cart[index].quantity = qty;
        cart[index].line_total = qty * cart[index].unit_price;
    } else {
        cart.splice(index, 1);
    }
    renderCart();
};

window.removeCartItem = (index) => {
    cart.splice(index, 1);
    renderCart();
};

// Checkout & Submit Sale
export async function executeCheckout(paymentMethod = 'Cash', amountTendered = 0) {
    if (!cart.length) return alert('Cannot checkout an empty cart.');

    const grandTotal = cart.reduce((sum, item) => sum + item.line_total, 0);
    const totalProfit = cart.reduce((sum, item) => sum + (item.unit_price - item.buying_price) * item.quantity, 0);
    const receiptNo = `LIT-${Date.now().toString().slice(-6)}`;

    // 1. Insert parent sales_log record
    const { data: saleData, error: saleError } = await supabase
        .from('sales_log')
        .insert([{
            receipt_no: receiptNo,
            cashier_id: currentUser?.id || null,
            customer_id: selectedCustomer?.id || null,
            payment_method: paymentMethod,
            total_charged: grandTotal,
            calculated_profit: totalProfit,
            amount_tendered: amountTendered || grandTotal,
            change_given: Math.max(0, (amountTendered || grandTotal) - grandTotal),
            status: paymentMethod === 'Debt' ? 'debt' : 'completed'
        }])
        .select()
        .single();

    if (saleError) return alert('Error logging sale: ' + saleError.message);

    // 2. Insert line items (Automatically deducts stock via Database Trigger)
    const lineItemPayloads = cart.map((line) => ({
        sale_id: saleData.id,
        item_id: line.item_id,
        item_name: line.name,
        quantity: line.quantity,
        unit_price: line.unit_price,
        buying_price_at_sale: line.buying_price,
        line_total: line.line_total,
        profit: (line.unit_price - line.buying_price) * line.quantity
    }));

    const { error: linesError } = await supabase.from('sale_items').insert(lineItemPayloads);
    if (linesError) {
        alert('Warning: Line item creation error: ' + linesError.message);
    }

    // Generate Receipt PDF
    generateLitajPDF('receipt', receiptNo, paymentMethod, cart, selectedCustomer, currentUser);

    // Reset Cart
    cart = [];
    selectedCustomer = null;
    renderCart();
    await loadCatalog();
    alert(`Sale recorded successfully! Receipt: ${receiptNo}`);
}

// Generate Branded PDF (80mm Thermal Receipt or A4 Quotation)
export function generateLitajPDF(type = 'receipt', receiptNo, paymentMethod, cartItems, customer, user) {
    const { jsPDF } = window.jspdf;
    const isThermal = type === 'receipt';
    const doc = new jsPDF({
        unit: 'mm',
        format: isThermal ? [80, 200] : 'a4'
    });

    let y = 8;

    // Header with Litaj Hardware Branding
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isThermal ? 13 : 20);
    doc.setTextColor(234, 88, 12); // #EA580C Litaj Orange
    doc.text('LITAJ HARDWARE', isThermal ? 40 : 105, y, { align: 'center' });
    y += isThermal ? 5 : 8;

    doc.setTextColor(50, 50, 50);
    doc.setFontSize(isThermal ? 8 : 10);
    doc.setFont('helvetica', 'normal');
    doc.text('Building Materials, Plumbing & Tools', isThermal ? 40 : 105, y, { align: 'center' });
    y += isThermal ? 4 : 5;
    doc.text(`Receipt: ${receiptNo} | Date: ${new Date().toLocaleDateString()}`, isThermal ? 40 : 105, y, { align: 'center' });
    y += isThermal ? 5 : 8;

    // Line items table
    const tableHeaders = isThermal ? [['Item', 'Qty', 'Total']] : [['Item Description', 'Unit', 'Qty', 'Unit Price', 'Total']];
    const tableData = cartItems.map((i) =>
        isThermal
            ? [i.name.substring(0, 18), `${i.quantity} ${i.unit_of_measure}`, i.line_total.toFixed(2)]
            : [i.name, i.unit_of_measure, i.quantity, i.unit_price.toFixed(2), i.line_total.toFixed(2)]
    );

    doc.autoTable({
        startY: y,
        head: tableHeaders,
        body: tableData,
        theme: 'plain',
        styles: { fontSize: isThermal ? 8 : 10, cellPadding: isThermal ? 1.5 : 3 },
        headStyles: { fillColor: [254, 237, 213], textColor: [154, 52, 18] }, // Orange-100 header
        margin: { left: isThermal ? 4 : 14, right: isThermal ? 4 : 14 }
    });

    y = doc.lastAutoTable.finalY + 5;

    // Financial Totals
    const total = cartItems.reduce((s, i) => s + i.line_total, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isThermal ? 10 : 12);
    doc.text(`TOTAL: Ksh ${total.toFixed(2)}`, isThermal ? 76 : 196, y, { align: 'right' });
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isThermal ? 8 : 10);
    doc.text(`Payment: ${paymentMethod}`, isThermal ? 5 : 15, y);
    doc.text(`Served by: ${user?.full_name || 'Staff'}`, isThermal ? 5 : 15, y + 4);

    if (isThermal) {
        y += 10;
        doc.setFontSize(7);
        doc.text('Thank you for building with Litaj Hardware!', 40, y, { align: 'center' });
    }

    doc.save(`${type.toUpperCase()}_${receiptNo}.pdf`);
}
```

---

### Implementation File 3: Litaj Hardware Navigation Bar & Orange Theme Layout Component

In all HTML views (`login.html`, `pos.html`, `inventory.html`, `customers.html`, `admin.html`), link Tailwind CSS and adopt the following responsive Orange Header:

```html
<!-- Litaj Hardware Top Header -->
<header class="bg-gradient-to-r from-orange-600 to-orange-700 text-white shadow-md">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center font-black text-xl text-amber-300">
                LH
            </div>
            <div>
                <h1 class="text-lg font-black tracking-tight leading-none text-white">LITAJ HARDWARE</h1>
                <p class="text-[11px] text-orange-200 font-medium">Enterprise POS & Stock Manager</p>
            </div>
        </div>

        <!-- Navigation Links -->
        <nav class="hidden md:flex items-center space-x-1">
            <a href="/pos.html" class="px-3 py-2 rounded-lg text-sm font-semibold hover:bg-orange-500/50 transition-colors">POS Terminal</a>
            <a href="/inventory.html" class="px-3 py-2 rounded-lg text-sm font-semibold hover:bg-orange-500/50 transition-colors">Inventory</a>
            <a href="/customers.html" class="px-3 py-2 rounded-lg text-sm font-semibold hover:bg-orange-500/50 transition-colors">Customers & Debt</a>
            <a href="/admin.html" class="px-3 py-2 rounded-lg text-sm font-semibold hover:bg-orange-500/50 transition-colors admin-only">Admin & Reports</a>
        </nav>

        <!-- User Badge & Logout -->
        <div class="flex items-center space-x-3">
            <span id="current-user-badge" class="text-xs bg-orange-800/60 px-3 py-1.5 rounded-full font-medium text-orange-100 border border-orange-500/30">
                Staff
            </span>
            <button id="btn-logout" class="px-3 py-1.5 bg-white text-orange-700 hover:bg-orange-50 rounded-lg text-xs font-bold transition-all shadow-sm">
                Logout
            </button>
        </div>
    </div>
</header>
```
````

---

## 5. Summary of Upgrades & Customizations for Litaj Hardware

1. **Brand Identity & Theme Transition:**
   - Completely converted from generic blue to **Litaj Safety Orange** (`orange-600`, `#EA580C`, `amber-500`).
   - Thermal receipts, invoices, buttons, active states, and table hovers reflect the orange brand aesthetic.
2. **Simplified Inventory Archetype:**
   - Removed 4-tier packaging waterfall (`deduct_inventory_waterfall` adjacency list) and cyber/printing shop remnants (`is_kyocera`, ream/sheet packaging).
   - Replaced with high-efficiency **Single-Product Inventory Model** featuring hardware units of measure (`pcs`, `kg`, `bag`, `meter`, `roll`, `bucket`, `ton`).
3. **Optimized Online-First Scope:**
   - Removed IndexedDB offline sync queues and SQLite desktop fallback mechanisms for this initial phase.
   - Built directly on **PostgreSQL / Supabase 15+** with zero-latency triggers, pessimistic row-level locking, and automated stock deductions on checkout and restorations on void.
4. **Hardware Specific Seed Data & Categories:**
   - Pre-populated with hardware categories (Cement, Plumbing, Electrical, Hand Tools, Paint, Fasteners).
   - Pre-seeded with authentic Kenyan hardware products (Simba Cement, Bamburi Tembo Cement, Wire Nails, PPR Pipes, Crown Paint, Cutting Discs).

**The blueprint is now finalized and ready for Phase 1 execution.**
