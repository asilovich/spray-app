-- Schema completo para Spray App en PostgreSQL/Supabase

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  operator_number INTEGER UNIQUE,
  secret_question TEXT,
  secret_answer TEXT,
  commission_rate REAL DEFAULT 8
);

-- Tabla de clientes
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) DEFAULT 'individual',
  responsible VARCHAR(255),
  address TEXT,
  city VARCHAR(255),
  cuit VARCHAR(50),
  phone VARCHAR(50),
  email VARCHAR(255),
  default_price REAL DEFAULT 0
);

-- Tabla de lotes/campos
CREATE TABLE IF NOT EXISTS fields (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  area REAL NOT NULL
);

-- Tabla de productos
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  cost_per_unit REAL NOT NULL
);

-- Tabla de ejercicios financieros
CREATE TABLE IF NOT EXISTS financial_years (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de trabajos
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  field_id INTEGER NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_amount REAL,
  price_per_hectare REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  operator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  invoicing_status VARCHAR(50) DEFAULT 'pending',
  vat_rate REAL DEFAULT 0,
  machine_hectares REAL DEFAULT 0,
  paid INTEGER DEFAULT 0,
  financial_year_id INTEGER REFERENCES financial_years(id) ON DELETE SET NULL
);

-- Tabla de gastos
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  date DATE NOT NULL,
  category VARCHAR(100),
  financial_year_id INTEGER REFERENCES financial_years(id) ON DELETE SET NULL
);

-- Insertar usuario admin por defecto (password: administrador)
INSERT INTO users (id, username, password, role, operator_number, secret_question, secret_answer, commission_rate) 
VALUES (1, 'admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', NULL, 'Nombre de tu primera mascota?', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 0)
ON CONFLICT (id) DO NOTHING;
