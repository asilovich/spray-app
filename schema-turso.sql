-- Schema para Spray App en Turso (SQLite)

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  operator_number INTEGER UNIQUE,
  secret_question TEXT,
  secret_answer TEXT,
  commission_rate REAL DEFAULT 8
);

-- Tabla de clientes
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'individual',
  responsible TEXT,
  address TEXT,
  city TEXT,
  cuit TEXT,
  phone TEXT,
  email TEXT,
  default_price REAL DEFAULT 0
);

-- Tabla de lotes/campos
CREATE TABLE IF NOT EXISTS fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  area REAL NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Tabla de productos
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  cost_per_unit REAL NOT NULL
);

-- Tabla de ejercicios financieros
CREATE TABLE IF NOT EXISTS financial_years (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  end_date TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de trabajos
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  product_id INTEGER,
  product_amount REAL,
  price_per_hectare REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  operator_id INTEGER,
  invoicing_status TEXT DEFAULT 'pending',
  vat_rate REAL DEFAULT 0,
  machine_hectares REAL DEFAULT 0,
  paid INTEGER DEFAULT 0,
  financial_year_id INTEGER,
  FOREIGN KEY (field_id) REFERENCES fields(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (operator_id) REFERENCES users(id),
  FOREIGN KEY (financial_year_id) REFERENCES financial_years(id)
);

-- Tabla de gastos
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  category TEXT,
  financial_year_id INTEGER,
  FOREIGN KEY (financial_year_id) REFERENCES financial_years(id)
);

-- Insertar usuario admin por defecto (password: administrador)
INSERT OR IGNORE INTO users (id, username, password, role, operator_number, secret_question, secret_answer, commission_rate) 
VALUES (1, 'admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', NULL, 'Nombre de tu primera mascota?', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 0);
