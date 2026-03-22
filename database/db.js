const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(
  process.env.DATABASE_URL || path.join(__dirname, "../numafrik.db")
);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT    UNIQUE NOT NULL,
    password    TEXT    NOT NULL,
    name        TEXT,
    phone       TEXT,
    credits     REAL    DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now')),
    is_active   INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS orders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    fivesim_id    INTEGER,
    service       TEXT    NOT NULL,
    country       TEXT    NOT NULL,
    phone_number  TEXT,
    sms_code      TEXT,
    status        TEXT    DEFAULT 'PENDING',
    cost_fcfa     REAL    NOT NULL,
    cost_5sim     REAL    NOT NULL,
    margin_fcfa   REAL    NOT NULL,
    created_at    TEXT    DEFAULT (datetime('now')),
    expires_at    TEXT,
    finished_at   TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    type            TEXT    NOT NULL,
    amount_fcfa     REAL    NOT NULL,
    credits_added   REAL,
    payment_method  TEXT,
    payment_ref     TEXT,
    status          TEXT    DEFAULT 'PENDING',
    created_at      TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

console.log("✅ Base de données initialisée");

module.exports = db;
