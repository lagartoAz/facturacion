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
    insertSetting.run('tax_percent', '0')
    insertSetting.run('next_invoice_number', '1')

    db.pragma('user_version = 1')
  }

  if (version < 2) {
    db.exec(`ALTER TABLE products ADD COLUMN image_path TEXT`)
    db.pragma('user_version = 2')
  }

  if (version < 3) {
    db.exec(`ALTER TABLE products ADD COLUMN is_by_weight INTEGER NOT NULL DEFAULT 0`)
    // Set tax_percent to 0 (IVA removed)
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('tax_percent', '0')").run()
    db.pragma('user_version = 3')
  }

  if (version < 4) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS customer_payments (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        amount_usd  REAL NOT NULL CHECK (amount_usd > 0),
        notes       TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);
    `)
    db.pragma('user_version = 4')
  }

  if (version < 5) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cash_register (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        opening_amount  REAL NOT NULL DEFAULT 0,
        opening_notes   TEXT,
        closing_amount  REAL,
        closing_notes   TEXT,
        sales_cash      REAL DEFAULT 0,
        sales_card      REAL DEFAULT 0,
        sales_transfer  REAL DEFAULT 0,
        sales_credit    REAL DEFAULT 0,
        total_invoices  INTEGER DEFAULT 0,
        expected_cash   REAL,
        difference      REAL,
        status          TEXT NOT NULL DEFAULT 'open',
        opened_at       TEXT NOT NULL DEFAULT (datetime('now')),
        closed_at       TEXT
      );
    `)
    db.pragma('user_version = 5')
  }

  if (version < 6) {
    // Recreate invoice_items with nullable product_id for custom items
    db.exec(`
      CREATE TABLE invoice_items_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        product_id  INTEGER REFERENCES products(id) ON DELETE RESTRICT,
        product_name TEXT NOT NULL,
        quantity    REAL NOT NULL,
        unit_price  REAL NOT NULL,
        subtotal    REAL NOT NULL
      );
      INSERT INTO invoice_items_new SELECT * FROM invoice_items;
      DROP TABLE invoice_items;
      ALTER TABLE invoice_items_new RENAME TO invoice_items;
      CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
    `)
    db.pragma('user_version = 6')
  }

  if (version < 7) {
    db.exec(`
      ALTER TABLE cash_register ADD COLUMN opening_amount_ves REAL NOT NULL DEFAULT 0;
      ALTER TABLE cash_register ADD COLUMN opening_amount_cop REAL NOT NULL DEFAULT 0;
      ALTER TABLE cash_register ADD COLUMN closing_amount_ves REAL;
      ALTER TABLE cash_register ADD COLUMN closing_amount_cop REAL;
    `)
    db.pragma('user_version = 7')
  }

  if (version < 8) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cash_register_withdrawals (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        cash_register_id INTEGER NOT NULL REFERENCES cash_register(id) ON DELETE CASCADE,
        amount           REAL NOT NULL CHECK (amount > 0),
        reason           TEXT NOT NULL,
        created_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_withdrawals_register ON cash_register_withdrawals(cash_register_id);
    `)
    db.pragma('user_version = 8')
  }

  if (version < 9) {
    db.exec(`ALTER TABLE cash_register_withdrawals ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'`)
    db.pragma('user_version = 9')
  }

  if (version < 10) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_payments (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        method      TEXT NOT NULL,
        amount      REAL NOT NULL CHECK (amount > 0)
      );
      CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);
    `)
    db.pragma('user_version = 10')
  }

  if (version < 11) {
    db.exec(`
      ALTER TABLE invoices ADD COLUMN payment_amount_ves REAL;
      ALTER TABLE cash_register ADD COLUMN sales_card_ves REAL DEFAULT 0;
      ALTER TABLE cash_register ADD COLUMN sales_transfer_ves REAL DEFAULT 0;
    `)
    db.pragma('user_version = 11')
  }

  if (version < 12) {
    db.exec(`
      ALTER TABLE invoices ADD COLUMN payment_amount_cop REAL;
      ALTER TABLE cash_register ADD COLUMN sales_transfer_cop REAL DEFAULT 0;
    `)
    db.pragma('user_version = 12')
  }

  if (version < 13) {
    db.exec(`
      ALTER TABLE invoices ADD COLUMN cash_currency TEXT DEFAULT 'USD';
      ALTER TABLE cash_register ADD COLUMN sales_cash_ves REAL DEFAULT 0;
      ALTER TABLE cash_register ADD COLUMN sales_cash_cop REAL DEFAULT 0;
    `)
    db.pragma('user_version = 13')
  }

  if (version < 14) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pending_carts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        label       TEXT,
        cart_data   TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
    `)
    db.pragma('user_version = 14')
  }

  if (version < 15) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS quotes (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_number    TEXT NOT NULL UNIQUE,
        customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        subtotal_usd    REAL NOT NULL DEFAULT 0,
        total_usd       REAL NOT NULL DEFAULT 0,
        rate_ves        REAL,
        rate_cop        REAL,
        total_ves       REAL,
        total_cop       REAL,
        notes           TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      CREATE INDEX IF NOT EXISTS idx_quotes_date ON quotes(created_at);

      CREATE TABLE IF NOT EXISTS quote_items (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id     INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
        product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_name TEXT NOT NULL,
        quantity     REAL NOT NULL,
        unit_price   REAL NOT NULL,
        subtotal     REAL NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);
    `)
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('next_quote_number', '1')").run()
    db.pragma('user_version = 15')
  }

  if (version < 16) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        name         TEXT NOT NULL,
        contact_name TEXT,
        phone        TEXT,
        email        TEXT,
        address      TEXT,
        notes        TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
      ALTER TABLE products ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;
    `)
    db.pragma('user_version = 16')
  }

  if (version < 17) {
    // Purchase (restock) invoices: an incoming shipment from a supplier that
    // adds stock to the inventory. Kept separate from sales `invoices`.
    db.exec(`
      CREATE TABLE IF NOT EXISTS purchases (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id   INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
        supplier_name TEXT,
        reference     TEXT,
        notes         TEXT,
        total_cost    REAL NOT NULL DEFAULT 0,
        total_items   REAL NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(created_at);

      CREATE TABLE IF NOT EXISTS purchase_items (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id  INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
        product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_name TEXT NOT NULL,
        quantity     REAL NOT NULL,
        unit_cost    REAL NOT NULL DEFAULT 0,
        subtotal     REAL NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
    `)
    db.pragma('user_version = 17')
  }
}
