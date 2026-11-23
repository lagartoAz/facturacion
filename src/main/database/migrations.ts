import type Database from 'better-sqlite3'
import { existsSync, readFileSync } from 'fs'
import { mimeFromPath } from '../shared/image-mime'

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

  if (version < 18) {
    // Product photos move INTO the database. They used to live as loose files
    // under userData with only their absolute path in `image_path`, which meant
    // an access terminal ("Acceso"/USB) could never show them, and a database
    // restored on another PC lost every photo. Existing files are imported once;
    // from here on the blob in the DB is the only copy that matters.
    db.exec(`
      ALTER TABLE products ADD COLUMN image_blob BLOB;
      ALTER TABLE products ADD COLUMN image_mime TEXT;
    `)
    const rows = db
      .prepare("SELECT id, image_path FROM products WHERE image_path IS NOT NULL AND image_path <> ''")
      .all() as { id: number; image_path: string }[]
    const update = db.prepare('UPDATE products SET image_blob = ?, image_mime = ? WHERE id = ?')
    for (const row of rows) {
      try {
        if (!existsSync(row.image_path)) continue
        update.run(readFileSync(row.image_path), mimeFromPath(row.image_path), row.id)
      } catch {
        // An unreadable photo must not stop the migration.
      }
    }
    db.pragma('user_version = 18')
  }

  if (version < 19) {
    // Debt (credit) payments can now be received in different currencies and
    // methods, just like a point-of-sale charge, so the cash register knows
    // where the physical money landed. amount_usd stays the figure that reduces
    // the balance; the extra columns record how it was actually paid.
    db.exec(`
      ALTER TABLE customer_payments ADD COLUMN method TEXT NOT NULL DEFAULT 'cash';
      ALTER TABLE customer_payments ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
      ALTER TABLE customer_payments ADD COLUMN amount_ves REAL;
      ALTER TABLE customer_payments ADD COLUMN amount_cop REAL;
      ALTER TABLE customer_payments ADD COLUMN rate_ves REAL;
      ALTER TABLE customer_payments ADD COLUMN rate_cop REAL;
    `)
    // Threshold (USD) above which a customer's debt is considered "critical".
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('critical_debt_threshold', '40')").run()
    db.pragma('user_version = 19')
  }

  if (version < 20) {
    // Loyalty points add-on ("Fidelidad"). The schema always ships with the base
    // app, but the feature stays dormant until it is activated with a license
    // (see loyalty_enabled). The ledger is append-only: every earn/redeem is one
    // row, so a customer's balance is just SUM(points) over their rows.
    db.exec(`
      CREATE TABLE IF NOT EXISTS loyalty_ledger (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        invoice_id  INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
        points      INTEGER NOT NULL,
        type        TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'adjust')),
        note        TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_ledger(customer_id);
      CREATE INDEX IF NOT EXISTS idx_loyalty_invoice ON loyalty_ledger(invoice_id);
    `)
    // Config defaults. loyalty_enabled is the single source of truth for whether
    // the feature is on; activation flips it to '1'. The others are the earning
    // rate (points per 1 USD spent) and the USD value of 1 point when redeemed.
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('loyalty_enabled', '0')").run()
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('loyalty_points_per_usd', '1')").run()
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('loyalty_redeem_value_usd', '0.01')").run()
    db.pragma('user_version = 20')
  }

  if (version < 21) {
    // Loyalty v2: configurable earning rules, a rewards catalog and a raffle.
    // Points stay the single currency (loyalty_ledger); the raffle derives
    // entries from a customer's points, and rewards are redeemed for points.
    db.exec(`
      -- Points granted per unit of a given product (the "por producto" rule).
      CREATE TABLE IF NOT EXISTS loyalty_product_points (
        product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
        points     INTEGER NOT NULL DEFAULT 0
      );

      -- Catalogue of things a customer can redeem points for.
      CREATE TABLE IF NOT EXISTS loyalty_rewards (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        kind        TEXT NOT NULL CHECK (kind IN ('discount_usd', 'discount_pct', 'custom')),
        cost_points INTEGER NOT NULL CHECK (cost_points > 0),
        value       REAL NOT NULL DEFAULT 0,
        active       INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      -- Raffles. Only one is 'open' at a time; drawing one records the winner.
      CREATE TABLE IF NOT EXISTS loyalty_raffles (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        name               TEXT NOT NULL,
        status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'drawn')),
        points_per_entry   INTEGER NOT NULL DEFAULT 0,
        min_points         INTEGER NOT NULL DEFAULT 0,
        winner_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        winner_name        TEXT,
        drawn_at           TEXT,
        created_at         TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
    `)

    // Earning rules (all additive; each has its own switch).
    const def = (k: string, v: string): void => {
      db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(k, v)
    }
    def('loyalty_earn_money', '1') // 1 pt per USD spent (uses loyalty_points_per_usd)
    def('loyalty_earn_product', '0') // points per product (uses loyalty_product_points)
    def('loyalty_earn_invoice', '0') // flat points per finalized invoice
    def('loyalty_points_per_invoice', '0')
    def('loyalty_currency_filter', '') // '' | USD | VES | COP — only count sales in this currency
    def('loyalty_exclude_credit', '1') // don't earn on credit invoices
    // Rewards / raffle toggles.
    def('loyalty_rewards_enabled', '1')
    def('loyalty_raffle_enabled', '0')
    def('loyalty_raffle_points_per_entry', '0') // every N points = 1 extra entry (0 = single entry)
    def('loyalty_raffle_min_points', '0') // minimum points to take part
    db.pragma('user_version = 21')
  }
}
