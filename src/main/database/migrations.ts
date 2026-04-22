import type Database from 'better-sqlite3'

export function runMigrations(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number

  if (version < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS products (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        barcode     TEXT UNIQUE,
        name        TEXT NOT NULL,
        description TEXT,
        price_usd   REAL NOT NULL CHECK (price_usd >= 0),
        cost_usd    REAL DEFAULT 0,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        stock       INTEGER NOT NULL DEFAULT 0,
        min_stock   INTEGER NOT NULL DEFAULT 0,
        is_active   INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

      CREATE TABLE IF NOT EXISTS customers (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        id_rif     TEXT UNIQUE,
        address    TEXT,
        phone      TEXT,
        email      TEXT,
        notes      TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_customers_id_rif ON customers(id_rif);
      CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

      CREATE TABLE IF NOT EXISTS invoices (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number  TEXT NOT NULL UNIQUE,
        customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        subtotal_usd    REAL NOT NULL DEFAULT 0,
        tax_percent     REAL NOT NULL DEFAULT 0,
        tax_amount_usd  REAL NOT NULL DEFAULT 0,
        total_usd       REAL NOT NULL DEFAULT 0,
        rate_ves        REAL,
        rate_cop        REAL,
        total_ves       REAL,
        total_cop       REAL,
        payment_method  TEXT NOT NULL DEFAULT 'cash',
        notes           TEXT,
        status          TEXT NOT NULL DEFAULT 'completed',
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(created_at);
      CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);

      CREATE TABLE IF NOT EXISTS invoice_items (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        product_name TEXT NOT NULL,
        quantity    INTEGER NOT NULL CHECK (quantity > 0),
        unit_price  REAL NOT NULL,
        subtotal    REAL NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

      CREATE TABLE IF NOT EXISTS exchange_rates (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        currency    TEXT NOT NULL UNIQUE,
        rate        REAL NOT NULL CHECK (rate > 0),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)

    // Seed initial data
    const insertRate = db.prepare(
      'INSERT OR IGNORE INTO exchange_rates (currency, rate) VALUES (?, ?)'
    )
    insertRate.run('VES', 36.5)
    insertRate.run('COP', 4200)

    const insertSetting = db.prepare(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
    )
    insertSetting.run('business_name', 'Mi Negocio')
    insertSetting.run('business_rif', '')
    insertSetting.run('business_address', '')
    insertSetting.run('business_phone', '')
    insertSetting.run('tax_percent', '16')
    insertSetting.run('next_invoice_number', '1')

    db.pragma('user_version = 1')
  }
}
