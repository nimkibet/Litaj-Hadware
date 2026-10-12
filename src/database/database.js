const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'data', 'pos.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database:', dbPath);
    }
});

function initializeDatabase() {
    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('fixed', 'variable')),
                selling_price REAL,
                buying_price REAL,
                profit_margin REAL,
                stock_quantity INTEGER DEFAULT 0,
                min_threshold INTEGER DEFAULT 5,
                barcode TEXT,
                category TEXT DEFAULT 'Uncategorized'
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS sales_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL,
                total_charged REAL NOT NULL,
                calculated_qty REAL NOT NULL,
                calculated_profit REAL NOT NULL,
                cashier_id INTEGER,
                customer_id INTEGER,
                tax_amount REAL DEFAULT 0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (item_id) REFERENCES inventory(id),
                FOREIGN KEY (cashier_id) REFERENCES users(id),
                FOREIGN KEY (customer_id) REFERENCES customers(id)
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                pin TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'cashier')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone TEXT,
                outstanding_debt REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.run(`ALTER TABLE inventory ADD COLUMN stock_quantity INTEGER DEFAULT 0`, (err) => {});
        db.run(`ALTER TABLE inventory ADD COLUMN min_threshold INTEGER DEFAULT 5`, (err) => {});
        db.run(`ALTER TABLE inventory ADD COLUMN barcode TEXT`, (err) => {});
        db.run(`ALTER TABLE inventory ADD COLUMN category TEXT DEFAULT 'Uncategorized'`, (err) => {});
        db.run(`ALTER TABLE inventory ADD COLUMN is_quick_add BOOLEAN DEFAULT false`, (err) => {});

        db.run(`ALTER TABLE sales_log ADD COLUMN cashier_id INTEGER`, (err) => {});
        db.run(`ALTER TABLE sales_log ADD COLUMN customer_id INTEGER`, (err) => {});
        db.run(`ALTER TABLE sales_log ADD COLUMN tax_amount REAL DEFAULT 0`, (err) => {});
        db.run(`ALTER TABLE sales_log ADD COLUMN buying_price_at_sale REAL DEFAULT 0`, (err) => {});
        db.run(`ALTER TABLE sales_log ADD COLUMN is_deleted INTEGER DEFAULT 0`, (err) => {});
        db.run(`ALTER TABLE sales_log ADD COLUMN deleted_at DATETIME`, (err) => {});
        db.run(`ALTER TABLE sales_log ADD COLUMN deleted_by INTEGER`, (err) => {});
        db.run(`ALTER TABLE sales_log ADD COLUMN status TEXT DEFAULT 'active'`, (err) => {});

        db.run(`INSERT OR IGNORE INTO users (username, pin, role) VALUES ('admin', '1234', 'admin')`);
        db.run(`INSERT OR IGNORE INTO users (username, pin, role) VALUES ('cashier', '0000', 'cashier')`);
        db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_pin', '1234')`);
        db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('tax_rate', '0')`);
    });
}

function getDatabase() {
    return db;
}

function getSetting(key) {
    return new Promise((resolve, reject) => {
        db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.value : null);
        });
    });
}

function setSetting(key, value) {
    return new Promise((resolve, reject) => {
        db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

module.exports = {
    db,
    getDatabase,
    initializeDatabase,
    getSetting,
    setSetting
};