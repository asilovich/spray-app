import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from "@libsql/client";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SQLite Database Client (persistent in ./db folder)
const DB_PATH = process.env.TURSO_DATABASE_URL || "file:db/pulverizaciones.db";
const db = createClient({
  url: DB_PATH,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-this";

const app = express();
app.use(express.json());

// Helper for DB queries (Turso uses async)
const dbQuery = async (sql: string, args: any[] = []) => {
  return await db.execute({ sql, args });
};

// Initialize Database Schema
const initDb = async () => {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      operator_number INTEGER UNIQUE,
      secret_question TEXT,
      secret_answer TEXT,
      commission_rate REAL DEFAULT 8
    )`,
    `CREATE TABLE IF NOT EXISTS clients (
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
    )`,
    `CREATE TABLE IF NOT EXISTS fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      area REAL NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      cost_per_unit REAL NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS jobs (
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
    )`,
    `CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      category TEXT,
      financial_year_id INTEGER,
      FOREIGN KEY (financial_year_id) REFERENCES financial_years(id)
    )`,
    `CREATE TABLE IF NOT EXISTS financial_years (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ], "write");

  // Migration / Column checks
  const columnsToAdd = [
    { table: 'jobs', column: 'operator_id', type: 'INTEGER' },
    { table: 'jobs', column: 'invoicing_status', type: 'TEXT DEFAULT "pending"' },
    { table: 'jobs', column: 'vat_rate', type: 'REAL DEFAULT 0' },
    { table: 'jobs', column: 'price_per_hectare', type: 'REAL DEFAULT 0' },
    { table: 'jobs', column: 'total_amount', type: 'REAL DEFAULT 0' },
    { table: 'jobs', column: 'machine_hectares', type: 'REAL DEFAULT 0' },
    { table: 'jobs', column: 'paid', type: 'INTEGER DEFAULT 0' },
    { table: 'jobs', column: 'financial_year_id', type: 'INTEGER' },
    { table: 'expenses', column: 'financial_year_id', type: 'INTEGER' },
    { table: 'clients', column: 'default_price', type: 'REAL DEFAULT 0' },
    { table: 'users', column: 'secret_question', type: 'TEXT' },
    { table: 'users', column: 'secret_answer', type: 'TEXT' },
    { table: 'users', column: 'commission_rate', type: 'REAL DEFAULT 8' }
  ];

  for (const item of columnsToAdd) {
    try {
      await db.execute(`ALTER TABLE ${item.table} ADD COLUMN ${item.column} ${item.type}`);
    } catch (e) {
      // Ignore if column already exists
    }
  }

  // Default admin
  const adminCheck = await db.execute("SELECT * FROM users WHERE role = 'admin'");
  if (adminCheck.rows.length === 0) {
    const hashedPassword = bcrypt.hashSync("administrador", 10);
    await db.execute({
      sql: "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
      args: ["admin", hashedPassword, "admin"]
    });
  }
};

// Auth Middleware
const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// API Routes
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const result = await db.execute({
    sql: "SELECT * FROM users WHERE username = ?",
    args: [username]
  });
  const user = result.rows[0] as any;
  if (!user || !bcrypt.compareSync(password, user.password as string)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, operator_number: user.operator_number }, JWT_SECRET);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, operator_number: user.operator_number } });
});

app.post("/api/auth/register", async (req, res) => {
  const { username, password, role, operator_number, secret_question, secret_answer, commission_rate } = req.body;
  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const hashedAnswer = secret_answer ? bcrypt.hashSync(secret_answer.toLowerCase().trim(), 10) : null;
    await db.execute({
      sql: "INSERT INTO users (username, password, role, operator_number, secret_question, secret_answer, commission_rate) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [username, hashedPassword, role || 'operator', operator_number, secret_question, hashedAnswer, commission_rate || 8]
    });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: "El usuario o número de operario ya existe." });
  }
});

app.post("/api/register", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { username, password, role, operator_number, secret_question, secret_answer, commission_rate } = req.body;
  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const hashedAnswer = secret_answer ? bcrypt.hashSync(secret_answer.toLowerCase().trim(), 10) : null;
    await db.execute({
      sql: "INSERT INTO users (username, password, role, operator_number, secret_question, secret_answer, commission_rate) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [username, hashedPassword, role, operator_number, secret_question, hashedAnswer, commission_rate || 8]
    });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: "El usuario o número de operario ya existe." });
  }
});

app.patch("/api/users/:id", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { commission_rate } = req.body;
  if (commission_rate !== undefined) {
    await db.execute({
      sql: "UPDATE users SET commission_rate = ? WHERE id = ?",
      args: [commission_rate, req.params.id]
    });
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "No fields to update" });
  }
});

app.get("/api/auth/secret-question", async (req, res) => {
  const { username } = req.query;
  const result = await db.execute({
    sql: "SELECT secret_question FROM users WHERE username = ?",
    args: [username as string]
  });
  const user = result.rows[0] as any;
  if (!user || !user.secret_question) {
    return res.status(404).json({ error: "Usuario no encontrado o no tiene pregunta secreta configurada." });
  }
  res.json({ secret_question: user.secret_question });
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { username, secret_answer, new_password } = req.body;
  const result = await db.execute({
    sql: "SELECT * FROM users WHERE username = ?",
    args: [username]
  });
  const user = result.rows[0] as any;
  
  if (!user || !user.secret_answer) {
    return res.status(400).json({ error: "Invalid request" });
  }

  if (!bcrypt.compareSync(secret_answer.toLowerCase().trim(), user.secret_answer)) {
    return res.status(401).json({ error: "La respuesta secreta es incorrecta." });
  }

  const hashedPassword = bcrypt.hashSync(new_password, 10);
  await db.execute({
    sql: "UPDATE users SET password = ? WHERE username = ?",
    args: [hashedPassword, username]
  });
  res.json({ success: true });
});

app.get("/api/users", authenticate, async (req: any, res) => {
  const result = await db.execute("SELECT id, username, role, operator_number FROM users");
  res.json(result.rows);
});

// Clients
app.get("/api/clients", authenticate, async (req, res) => {
  const result = await db.execute("SELECT * FROM clients");
  res.json(result.rows);
});

app.post("/api/clients", authenticate, async (req: any, res) => {
  const { name, type, responsible, address, city, cuit, phone, email, default_price, fields } = req.body;
  
  const existingResult = await db.execute({
    sql: "SELECT * FROM clients WHERE TRIM(LOWER(name)) = TRIM(LOWER(?)) OR (TRIM(cuit) = TRIM(?) AND cuit IS NOT NULL AND TRIM(cuit) != '')",
    args: [name, cuit || null]
  });
  
  if (existingResult.rows.length > 0) {
    return res.status(400).json({ error: "Ya existe un cliente o empresa con ese nombre o CUIT." });
  }

  try {
    const result = await db.execute({
      sql: "INSERT INTO clients (name, type, responsible, address, city, cuit, phone, email, default_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [name, type, responsible, address, city, cuit, phone, email, default_price || 0]
    });
    const clientId = Number(result.lastInsertRowid);

    if (fields && Array.isArray(fields)) {
      for (const field of fields) {
        await db.execute({
          sql: "INSERT INTO fields (client_id, name, area) VALUES (?, ?, ?)",
          args: [clientId, field.name, field.area]
        });
      }
    }
    res.json({ id: clientId });
  } catch (error) {
    console.error("Error creating client:", error);
    res.status(500).json({ error: "Failed to create client" });
  }
});

app.delete("/api/clients/:id", authenticate, async (req: any, res) => {
  try {
    const jobsCount = await db.execute({
      sql: "SELECT COUNT(*) as count FROM jobs JOIN fields ON jobs.field_id = fields.id WHERE fields.client_id = ?",
      args: [req.params.id]
    });
    
    if ((jobsCount.rows[0] as any).count > 0) {
      return res.status(400).json({ error: "No se puede eliminar el cliente porque tiene pulverizaciones asociadas." });
    }

    await db.execute({ sql: "DELETE FROM fields WHERE client_id = ?", args: [req.params.id] });
    await db.execute({ sql: "DELETE FROM clients WHERE id = ?", args: [req.params.id] });
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting client:", error);
    res.status(500).json({ error: "Failed to delete client" });
  }
});

app.patch("/api/clients/:id", authenticate, async (req: any, res) => {
  const { name, type, responsible, address, city, cuit, phone, email, default_price } = req.body;
  const clientId = req.params.id;
  
  if (name || cuit) {
    const existing = await db.execute({
      sql: "SELECT * FROM clients WHERE id != ? AND (TRIM(LOWER(name)) = TRIM(LOWER(?)) OR (TRIM(cuit) = TRIM(?) AND cuit IS NOT NULL AND TRIM(cuit) != ''))",
      args: [clientId, name || null, cuit || null]
    });
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Ya existe otro cliente o empresa con ese nombre o CUIT." });
    }
  }

  const updates: string[] = [];
  const args: any[] = [];
  
  if (name !== undefined) { updates.push("name = ?"); args.push(name); }
  if (type !== undefined) { updates.push("type = ?"); args.push(type); }
  if (responsible !== undefined) { updates.push("responsible = ?"); args.push(responsible); }
  if (address !== undefined) { updates.push("address = ?"); args.push(address); }
  if (city !== undefined) { updates.push("city = ?"); args.push(city); }
  if (cuit !== undefined) { updates.push("cuit = ?"); args.push(cuit); }
  if (phone !== undefined) { updates.push("phone = ?"); args.push(phone); }
  if (email !== undefined) { updates.push("email = ?"); args.push(email); }
  if (default_price !== undefined) { updates.push("default_price = ?"); args.push(default_price); }
  
  if (updates.length > 0) {
    args.push(clientId);
    await db.execute(`UPDATE clients SET ${updates.join(", ")} WHERE id = ?`, args);
    
    if (default_price !== undefined) {
      await db.execute({
        sql: "UPDATE jobs SET price_per_hectare = ?, total_amount = machine_hectares * ? WHERE field_id IN (SELECT id FROM fields WHERE client_id = ?)",
        args: [default_price, default_price, clientId]
      });
    }
  }
  res.json({ success: true });
});

// Fields
app.get("/api/fields", authenticate, async (req, res) => {
  const result = await db.execute(`
    SELECT fields.*, clients.name as client_name 
    FROM fields 
    JOIN clients ON fields.client_id = clients.id
  `);
  res.json(result.rows);
});

app.post("/api/fields", authenticate, async (req: any, res) => {
  const { client_id, name, area } = req.body;
  const result = await db.execute({
    sql: "INSERT INTO fields (client_id, name, area) VALUES (?, ?, ?)",
    args: [client_id, name, area]
  });
  res.json({ id: Number(result.lastInsertRowid) });
});

app.patch("/api/fields/:id", authenticate, async (req: any, res) => {
  const { name, area } = req.body;
  const updates: string[] = [];
  const args: any[] = [];
  
  if (name !== undefined) { updates.push("name = ?"); args.push(name); }
  if (area !== undefined) { updates.push("area = ?"); args.push(area); }
  
  if (updates.length > 0) {
    args.push(req.params.id);
    await db.execute(`UPDATE fields SET ${updates.join(", ")} WHERE id = ?`, args);
  }
  res.json({ success: true });
});

// Products
app.get("/api/products", authenticate, async (req, res) => {
  const result = await db.execute("SELECT * FROM products");
  res.json(result.rows);
});

app.post("/api/products", authenticate, async (req, res) => {
  const { name, unit, cost_per_unit } = req.body;
  const result = await db.execute({
    sql: "INSERT INTO products (name, unit, cost_per_unit) VALUES (?, ?, ?)",
    args: [name, unit, cost_per_unit]
  });
  res.json({ id: Number(result.lastInsertRowid) });
});

// Jobs
app.get("/api/jobs", authenticate, async (req: any, res) => {
  let query = `
    SELECT jobs.*, fields.name as field_name, fields.area, clients.name as client_name, products.name as product_name, users.username as operator_name, users.operator_number, users.commission_rate as operator_commission_rate
    FROM jobs
    JOIN fields ON jobs.field_id = fields.id
    JOIN clients ON fields.client_id = clients.id
    LEFT JOIN products ON jobs.product_id = products.id
    LEFT JOIN users ON jobs.operator_id = users.id
    WHERE jobs.financial_year_id IS NULL
  `;
  const args: any[] = [];

  if (req.user.role === 'operator') {
    query += ` AND jobs.operator_id = ?`;
    args.push(req.user.id);
  }

  query += ` ORDER BY jobs.date DESC`;
  
  const result = await db.execute(query, args);
  res.json(result.rows);
});

app.post("/api/jobs", authenticate, async (req: any, res) => {
  const { field_id, date, product_id, product_amount, price_per_hectare, total_amount, status, notes, operator_id, invoicing_status, vat_rate, machine_hectares } = req.body;
  const finalOperatorId = req.user.role === 'operator' ? req.user.id : operator_id;

  const result = await db.execute({
    sql: `INSERT INTO jobs (field_id, date, product_id, product_amount, price_per_hectare, total_amount, status, notes, operator_id, invoicing_status, vat_rate, machine_hectares)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [field_id, date, product_id, product_amount, price_per_hectare || 0, total_amount || 0, status || 'pending', notes, finalOperatorId, invoicing_status || 'pending', vat_rate || 0, machine_hectares || 0]
  });
  res.json({ id: Number(result.lastInsertRowid) });
});

app.patch("/api/jobs/:id/billing", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { invoicing_status, vat_rate, paid } = req.body;
  
  let query = "UPDATE jobs SET invoicing_status = ?, vat_rate = ?";
  const args: any[] = [invoicing_status, vat_rate];
  
  if (paid !== undefined) {
    query += ", paid = ?";
    args.push(paid ? 1 : 0);
  }
  
  query += " WHERE id = ?";
  args.push(req.params.id);
  
  await db.execute(query, args);
  res.json({ success: true });
});

app.patch("/api/jobs/:id", authenticate, async (req: any, res) => {
  if (req.user.role === 'operator') {
    const jobRes = await db.execute({ sql: "SELECT operator_id FROM jobs WHERE id = ?", args: [req.params.id] });
    if (jobRes.rows.length === 0 || (jobRes.rows[0] as any).operator_id !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  const updates = req.body;
  const keys = Object.keys(updates);
  const args = Object.values(updates);
  const setClause = keys.map(key => `${key} = ?`).join(", ");
  args.push(req.params.id);
  await db.execute(`UPDATE jobs SET ${setClause} WHERE id = ?`, args as any);
  res.json({ success: true });
});

app.delete("/api/jobs/:id", authenticate, async (req: any, res) => {
  if (req.user.role === 'operator') {
    const jobRes = await db.execute({ sql: "SELECT operator_id FROM jobs WHERE id = ?", args: [req.params.id] });
    if (jobRes.rows.length === 0 || (jobRes.rows[0] as any).operator_id !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }
  }
  await db.execute({ sql: "DELETE FROM jobs WHERE id = ?", args: [req.params.id] });
  res.json({ success: true });
});

// Expenses
app.get("/api/expenses", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const result = await db.execute("SELECT * FROM expenses WHERE financial_year_id IS NULL ORDER BY date DESC");
  res.json(result.rows);
});

app.post("/api/expenses", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { description, amount, date, category } = req.body;
  
  if (!description || amount === undefined || !date) {
    return res.status(400).json({ error: "Description, amount and date are required" });
  }
  
  const result = await db.execute({
    sql: "INSERT INTO expenses (description, amount, date, category) VALUES (?, ?, ?, ?)",
    args: [description, amount, date, category || null]
  });
  res.json({ id: Number(result.lastInsertRowid) });
});

// Financial Years
app.get("/api/financial-years", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const result = await db.execute("SELECT * FROM financial_years ORDER BY end_date DESC");
  res.json(result.rows);
});

app.post("/api/financial-years", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { name, end_date } = req.body;
  
  const result = await db.execute({
    sql: "INSERT INTO financial_years (name, end_date) VALUES (?, ?)",
    args: [name, end_date]
  });
  const yearId = Number(result.lastInsertRowid);
  
  await db.execute({ sql: "UPDATE jobs SET financial_year_id = ? WHERE date <= ? AND financial_year_id IS NULL", args: [yearId, end_date] });
  await db.execute({ sql: "UPDATE expenses SET financial_year_id = ? WHERE date <= ? AND financial_year_id IS NULL", args: [yearId, end_date] });
  
  res.json({ id: yearId, success: true });
});

app.delete("/api/financial-years/:id", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { password } = req.body;
  const userRes = await db.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [req.user.id] });
  const user = userRes.rows[0] as any;
  if (!user || !bcrypt.compareSync(password, user.password as string)) {
    return res.status(401).json({ error: "Invalid password" });
  }

  await db.execute({ sql: "DELETE FROM jobs WHERE financial_year_id = ?", args: [req.params.id] });
  await db.execute({ sql: "DELETE FROM expenses WHERE financial_year_id = ?", args: [req.params.id] });
  await db.execute({ sql: "DELETE FROM financial_years WHERE id = ?", args: [req.params.id] });
  res.json({ success: true });
});

app.get("/api/financial-years/:id/jobs", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const result = await db.execute(`
    SELECT jobs.*, fields.name as field_name, fields.area, clients.name as client_name, products.name as product_name, users.username as operator_name, users.operator_number, users.commission_rate as operator_commission_rate
    FROM jobs
    JOIN fields ON jobs.field_id = fields.id
    JOIN clients ON fields.client_id = clients.id
    LEFT JOIN products ON jobs.product_id = products.id
    LEFT JOIN users ON jobs.operator_id = users.id
    WHERE jobs.financial_year_id = ?
    ORDER BY jobs.date DESC
  `, [req.params.id]);
  res.json(result.rows);
});

app.get("/api/financial-years/:id/expenses", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const result = await db.execute("SELECT * FROM expenses WHERE financial_year_id = ? ORDER BY date DESC", [req.params.id]);
  res.json(result.rows);
});

// Stats & Finances
app.get("/api/stats", authenticate, async (req: any, res) => {
  let query = `
    SELECT 
      COUNT(*) as total_jobs,
      COALESCE(SUM(total_amount), 0) as total_revenue,
      COALESCE(SUM(CASE WHEN paid = 0 THEN total_amount ELSE 0 END), 0) as pending_revenue,
      COALESCE(SUM(CASE WHEN paid = 1 THEN total_amount ELSE 0 END), 0) as collected_revenue,
      COALESCE(SUM(fields.area), 0) as total_hectares,
      COALESCE(SUM(machine_hectares), 0) as total_machine_hectares
    FROM jobs
    JOIN fields ON jobs.field_id = fields.id
    WHERE jobs.financial_year_id IS NULL
  `;
  const args: any[] = [];
  if (req.user.role === 'operator') {
    query += ` AND jobs.operator_id = ?`;
    args.push(req.user.id);
  }
  const result = await db.execute(query, args);
  res.json(result.rows[0]);
});

app.get("/api/finances", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  
  const clientSummaryRes = await db.execute(`
    SELECT clients.name as client_name, fields.name as field_name, SUM(fields.area) as total_lot_area, SUM(jobs.machine_hectares) as total_machine_area,
      SUM(CASE WHEN jobs.invoicing_status = 'invoiced' THEN jobs.machine_hectares ELSE 0 END) as invoiced_area,
      SUM(CASE WHEN jobs.invoicing_status = 'pending' THEN jobs.machine_hectares ELSE 0 END) as pending_area,
      SUM(CASE WHEN jobs.invoicing_status = 'no_invoice' THEN jobs.machine_hectares ELSE 0 END) as no_invoice_area,
      SUM(jobs.total_amount) as total_revenue, SUM(jobs.total_amount * (jobs.vat_rate / 100.0)) as total_vat
    FROM jobs JOIN fields ON jobs.field_id = fields.id JOIN clients ON fields.client_id = clients.id
    WHERE jobs.financial_year_id IS NULL GROUP BY clients.id, fields.id
  `);

  const operatorSummaryRawRes = await db.execute(`
    SELECT users.id as operator_id, users.username as operator_name, users.operator_number, users.commission_rate,
      SUM(jobs.machine_hectares) as total_area, SUM(jobs.total_amount * (COALESCE(users.commission_rate, 8) / 100.0)) as commission_amount
    FROM jobs JOIN users ON jobs.operator_id = users.id WHERE jobs.financial_year_id IS NULL GROUP BY users.id
  `);

  const operatorJobsRes = await db.execute(`
    SELECT jobs.operator_id, jobs.date, clients.name as client_name, fields.name as field_name, jobs.machine_hectares, jobs.total_amount,
      jobs.total_amount * (COALESCE(users.commission_rate, 8) / 100.0) as commission_amount
    FROM jobs JOIN fields ON jobs.field_id = fields.id JOIN clients ON fields.client_id = clients.id JOIN users ON jobs.operator_id = users.id
    WHERE jobs.operator_id IS NOT NULL AND jobs.financial_year_id IS NULL ORDER BY jobs.date DESC
  `);

  const operatorSummary = operatorSummaryRawRes.rows.map((op: any) => ({
    ...op,
    jobs: (operatorJobsRes.rows as any[]).filter(job => job.operator_id === op.operator_id)
  }));

  const expensesRes = await db.execute("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE financial_year_id IS NULL");
  const revenueRes = await db.execute("SELECT COALESCE(SUM(total_amount), 0) as total FROM jobs WHERE financial_year_id IS NULL");

  const totalCommissions = operatorSummary.reduce((sum, op: any) => sum + (op.commission_amount || 0), 0);
  const totalRevenue = Number((revenueRes.rows[0] as any).total);
  const totalExpenses = Number((expensesRes.rows[0] as any).total) + totalCommissions;

  res.json({ clientSummary: clientSummaryRes.rows, operatorSummary, totalRevenue, totalExpenses, balance: totalRevenue - totalExpenses });
});

// Serve frontend
if (process.env.NODE_ENV !== "production") {
  const vitePromise = createViteServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(async (req, res, next) => {
    const vite = await vitePromise;
    vite.middlewares(req, res, next);
  });
} else {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

// Initial DB setup
initDb().then(() => {
  // Listen on PORT if not running as a Vercel function
  if (!process.env.VERCEL) {
    const PORT = Number(process.env.PORT) || 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  }
}).catch(console.error);

export default app;
