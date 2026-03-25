import express from "express";
import { createServer as createViteServer } from "vite";
import postgres from "postgres";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PostgreSQL Database Client (Supabase)
const DB_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "";
console.log("Database URL configured:", DB_URL ? "Yes (hidden)" : "No");

// Create sql proxy for lazy initialization
const sql = new Proxy({} as any, {
  get(target, prop) {
    const client = postgres(DB_URL, {
      prepare: false,
      max: 1,
      idle_timeout: 10,
      connect_timeout: 5,
      ssl: { rejectUnauthorized: false },
    });
    return (client as any)[prop];
  },
});

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-this";

const app = express();
app.use(express.json());

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    console.log("Health check called");
    if (!sql) {
      return res.status(500).json({ status: "error", message: "Database client not initialized" });
    }
    const result = await sql`SELECT 1 as test`;
    console.log("Health check success:", result);
    res.json({ status: "ok", db: "connected", test: result[0] });
  } catch (e: any) {
    console.error("Health check failed:", e.message, e.stack);
    res.status(500).json({ status: "error", db: "disconnected", error: e.message, stack: e.stack });
  }
});

// Initialize Database Schema
const initDb = async () => {
  // Create tables if they don't exist
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL,
      operator_number INTEGER UNIQUE,
      secret_question TEXT,
      secret_answer TEXT,
      commission_rate REAL DEFAULT 8
    )
  `;

  await sql`
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
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS fields (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      area REAL NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      unit VARCHAR(50) NOT NULL,
      cost_per_unit REAL NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS financial_years (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      end_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
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
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      date DATE NOT NULL,
      category VARCHAR(100),
      financial_year_id INTEGER REFERENCES financial_years(id) ON DELETE SET NULL
    )
  `;

  // Default admin (password: administrador)
  const adminCheck = await sql`SELECT * FROM users WHERE role = 'admin'`;
  if (adminCheck.length === 0) {
    const hashedPassword = bcrypt.hashSync("administrador", 10);
    await sql`
      INSERT INTO users (username, password, role)
      VALUES ('admin', ${hashedPassword}, 'admin')
    `;
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
  const result = await sql`SELECT * FROM users WHERE username = ${username}`;
  const user = result[0] as any;
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
    await sql`
      INSERT INTO users (username, password, role, operator_number, secret_question, secret_answer, commission_rate)
      VALUES (${username}, ${hashedPassword}, ${role || 'operator'}, ${operator_number}, ${secret_question}, ${hashedAnswer}, ${commission_rate || 8})
    `;
    res.json({ success: true });
  } catch (e: any) {
    console.error("Registration error:", e);
    res.status(400).json({ error: e.message || "El usuario o número de operario ya existe." });
  }
});

app.post("/api/register", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { username, password, role, operator_number, secret_question, secret_answer, commission_rate } = req.body;
  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const hashedAnswer = secret_answer ? bcrypt.hashSync(secret_answer.toLowerCase().trim(), 10) : null;
    await sql`
      INSERT INTO users (username, password, role, operator_number, secret_question, secret_answer, commission_rate)
      VALUES (${username}, ${hashedPassword}, ${role}, ${operator_number}, ${secret_question}, ${hashedAnswer}, ${commission_rate || 8})
    `;
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: "El usuario o número de operario ya existe." });
  }
});

app.patch("/api/users/:id", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { commission_rate } = req.body;
  if (commission_rate !== undefined) {
    await sql`UPDATE users SET commission_rate = ${commission_rate} WHERE id = ${req.params.id}`;
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "No fields to update" });
  }
});

app.get("/api/auth/secret-question", async (req, res) => {
  const { username } = req.query;
  const result = await sql`SELECT secret_question FROM users WHERE username = ${username as string}`;
  const user = result[0] as any;
  if (!user || !user.secret_question) {
    return res.status(404).json({ error: "Usuario no encontrado o no tiene pregunta secreta configurada." });
  }
  res.json({ secret_question: user.secret_question });
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { username, secret_answer, new_password } = req.body;
  const result = await sql`SELECT * FROM users WHERE username = ${username}`;
  const user = result[0] as any;
  
  if (!user || !user.secret_answer) {
    return res.status(400).json({ error: "Invalid request" });
  }

  if (!bcrypt.compareSync(secret_answer.toLowerCase().trim(), user.secret_answer)) {
    return res.status(401).json({ error: "La respuesta secreta es incorrecta." });
  }

  const hashedPassword = bcrypt.hashSync(new_password, 10);
  await sql`UPDATE users SET password = ${hashedPassword} WHERE username = ${username}`;
  res.json({ success: true });
});

app.get("/api/users", authenticate, async (req: any, res) => {
  const result = await sql`SELECT id, username, role, operator_number FROM users`;
  res.json(result);
});

// Clients
app.get("/api/clients", authenticate, async (req, res) => {
  const result = await sql`SELECT * FROM clients`;
  res.json(result);
});

app.post("/api/clients", authenticate, async (req: any, res) => {
  const { name, type, responsible, address, city, cuit, phone, email, default_price, fields: clientFields } = req.body;
  
  const existingResult = await sql`
    SELECT * FROM clients 
    WHERE TRIM(LOWER(name)) = TRIM(LOWER(${name})) 
    OR (TRIM(cuit) = TRIM(${cuit || null}) AND cuit IS NOT NULL AND TRIM(cuit) != '')
  `;
  
  if (existingResult.length > 0) {
    return res.status(400).json({ error: "Ya existe un cliente o empresa con ese nombre o CUIT." });
  }

  try {
    const result = await sql`
      INSERT INTO clients (name, type, responsible, address, city, cuit, phone, email, default_price)
      VALUES (${name}, ${type}, ${responsible}, ${address}, ${city}, ${cuit}, ${phone}, ${email}, ${default_price || 0})
      RETURNING id
    `;
    const clientId = result[0].id;

    if (clientFields && Array.isArray(clientFields)) {
      for (const field of clientFields) {
        await sql`INSERT INTO fields (client_id, name, area) VALUES (${clientId}, ${field.name}, ${field.area})`;
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
    const jobsCount = await sql`
      SELECT COUNT(*) as count FROM jobs JOIN fields ON jobs.field_id = fields.id WHERE fields.client_id = ${req.params.id}
    `;
    
    if ((jobsCount[0] as any).count > 0) {
      return res.status(400).json({ error: "No se puede eliminar el cliente porque tiene pulverizaciones asociadas." });
    }

    await sql`DELETE FROM fields WHERE client_id = ${req.params.id}`;
    await sql`DELETE FROM clients WHERE id = ${req.params.id}`;
    
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
    const existing = await sql`
      SELECT * FROM clients 
      WHERE id != ${clientId} 
      AND (TRIM(LOWER(name)) = TRIM(LOWER(${name || null})) 
      OR (TRIM(cuit) = TRIM(${cuit || null}) AND cuit IS NOT NULL AND TRIM(cuit) != ''))
    `;
    if (existing.length > 0) {
      return res.status(400).json({ error: "Ya existe otro cliente o empresa con ese nombre o CUIT." });
    }
  }

  const updates: string[] = [];
  const args: any[] = [];
  
  if (name !== undefined) { updates.push("name = " + sql(name)); args.push(name); }
  if (type !== undefined) { updates.push("type = " + sql(type)); args.push(type); }
  if (responsible !== undefined) { updates.push("responsible = " + sql(responsible)); args.push(responsible); }
  if (address !== undefined) { updates.push("address = " + sql(address)); args.push(address); }
  if (city !== undefined) { updates.push("city = " + sql(city)); args.push(city); }
  if (cuit !== undefined) { updates.push("cuit = " + sql(cuit)); args.push(cuit); }
  if (phone !== undefined) { updates.push("phone = " + sql(phone)); args.push(phone); }
  if (email !== undefined) { updates.push("email = " + sql(email)); args.push(email); }
  if (default_price !== undefined) { updates.push("default_price = " + sql(default_price)); args.push(default_price); }
  
  if (updates.length > 0) {
    await sql`UPDATE clients SET ${sql(updates.join(", "))} WHERE id = ${clientId}`;
    
    if (default_price !== undefined) {
      await sql`
        UPDATE jobs SET price_per_hectare = ${default_price}, total_amount = machine_hectares * ${default_price} 
        WHERE field_id IN (SELECT id FROM fields WHERE client_id = ${clientId})
      `;
    }
  }
  res.json({ success: true });
});

// Fields
app.get("/api/fields", authenticate, async (req, res) => {
  const result = await sql`
    SELECT fields.*, clients.name as client_name 
    FROM fields 
    JOIN clients ON fields.client_id = clients.id
  `;
  res.json(result);
});

app.post("/api/fields", authenticate, async (req: any, res) => {
  const { client_id, name, area } = req.body;
  const result = await sql`
    INSERT INTO fields (client_id, name, area) VALUES (${client_id}, ${name}, ${area})
    RETURNING id
  `;
  res.json({ id: result[0].id });
});

app.patch("/api/fields/:id", authenticate, async (req: any, res) => {
  const { name, area } = req.body;
  
  if (name !== undefined) {
    await sql`UPDATE fields SET name = ${name} WHERE id = ${req.params.id}`;
  }
  if (area !== undefined) {
    await sql`UPDATE fields SET area = ${area} WHERE id = ${req.params.id}`;
  }
  res.json({ success: true });
});

// Products
app.get("/api/products", authenticate, async (req, res) => {
  const result = await sql`SELECT * FROM products`;
  res.json(result);
});

app.post("/api/products", authenticate, async (req, res) => {
  const { name, unit, cost_per_unit } = req.body;
  const result = await sql`
    INSERT INTO products (name, unit, cost_per_unit) VALUES (${name}, ${unit}, ${cost_per_unit})
    RETURNING id
  `;
  res.json({ id: result[0].id });
});

// Jobs
app.get("/api/jobs", authenticate, async (req: any, res) => {
  let query = sql`
    SELECT jobs.*, fields.name as field_name, fields.area, clients.name as client_name, products.name as product_name, users.username as operator_name, users.operator_number, users.commission_rate as operator_commission_rate
    FROM jobs
    JOIN fields ON jobs.field_id = fields.id
    JOIN clients ON fields.client_id = clients.id
    LEFT JOIN products ON jobs.product_id = products.id
    LEFT JOIN users ON jobs.operator_id = users.id
    WHERE jobs.financial_year_id IS NULL
  `;

  if (req.user.role === 'operator') {
    query = sql`${query} AND jobs.operator_id = ${req.user.id}`;
  }

  const result = await sql`${query} ORDER BY jobs.date DESC`;
  res.json(result);
});

app.post("/api/jobs", authenticate, async (req: any, res) => {
  const { field_id, date, product_id, product_amount, price_per_hectare, total_amount, status, notes, operator_id, invoicing_status, vat_rate, machine_hectares } = req.body;
  const finalOperatorId = req.user.role === 'operator' ? req.user.id : operator_id;

  const result = await sql`
    INSERT INTO jobs (field_id, date, product_id, product_amount, price_per_hectare, total_amount, status, notes, operator_id, invoicing_status, vat_rate, machine_hectares)
    VALUES (${field_id}, ${date}, ${product_id}, ${product_amount}, ${price_per_hectare || 0}, ${total_amount || 0}, ${status || 'pending'}, ${notes}, ${finalOperatorId}, ${invoicing_status || 'pending'}, ${vat_rate || 0}, ${machine_hectares || 0})
    RETURNING id
  `;
  res.json({ id: result[0].id });
});

app.patch("/api/jobs/:id/billing", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { invoicing_status, vat_rate, paid } = req.body;
  
  await sql`
    UPDATE jobs SET invoicing_status = ${invoicing_status}, vat_rate = ${vat_rate}, paid = ${paid !== undefined ? (paid ? 1 : 0) : sql`paid`}
    WHERE id = ${req.params.id}
  `;
  res.json({ success: true });
});

app.patch("/api/jobs/:id", authenticate, async (req: any, res) => {
  if (req.user.role === 'operator') {
    const jobRes = await sql`SELECT operator_id FROM jobs WHERE id = ${req.params.id}`;
    if (jobRes.length === 0 || (jobRes[0] as any).operator_id !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  const updates = req.body;
  const keys = Object.keys(updates);
  
  for (const key of keys) {
    await sql`UPDATE jobs SET ${sql(key)} = ${updates[key]} WHERE id = ${req.params.id}`;
  }
  res.json({ success: true });
});

app.delete("/api/jobs/:id", authenticate, async (req: any, res) => {
  if (req.user.role === 'operator') {
    const jobRes = await sql`SELECT operator_id FROM jobs WHERE id = ${req.params.id}`;
    if (jobRes.length === 0 || (jobRes[0] as any).operator_id !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }
  }
  await sql`DELETE FROM jobs WHERE id = ${req.params.id}`;
  res.json({ success: true });
});

// Expenses
app.get("/api/expenses", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const result = await sql`SELECT * FROM expenses WHERE financial_year_id IS NULL ORDER BY date DESC`;
  res.json(result);
});

app.post("/api/expenses", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { description, amount, date, category } = req.body;
  
  if (!description || amount === undefined || !date) {
    return res.status(400).json({ error: "Description, amount and date are required" });
  }
  
  const result = await sql`
    INSERT INTO expenses (description, amount, date, category) VALUES (${description}, ${amount}, ${date}, ${category || null})
    RETURNING id
  `;
  res.json({ id: result[0].id });
});

// Financial Years
app.get("/api/financial-years", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const result = await sql`SELECT * FROM financial_years ORDER BY end_date DESC`;
  res.json(result);
});

app.post("/api/financial-years", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { name, end_date } = req.body;
  
  const result = await sql`
    INSERT INTO financial_years (name, end_date) VALUES (${name}, ${end_date})
    RETURNING id
  `;
  const yearId = result[0].id;
  
  await sql`UPDATE jobs SET financial_year_id = ${yearId} WHERE date <= ${end_date} AND financial_year_id IS NULL`;
  await sql`UPDATE expenses SET financial_year_id = ${yearId} WHERE date <= ${end_date} AND financial_year_id IS NULL`;
  
  res.json({ id: yearId, success: true });
});

app.delete("/api/financial-years/:id", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { password } = req.body;
  const userRes = await sql`SELECT * FROM users WHERE id = ${req.user.id}`;
  const user = userRes[0] as any;
  if (!user || !bcrypt.compareSync(password, user.password as string)) {
    return res.status(401).json({ error: "Invalid password" });
  }

  await sql`DELETE FROM jobs WHERE financial_year_id = ${req.params.id}`;
  await sql`DELETE FROM expenses WHERE financial_year_id = ${req.params.id}`;
  await sql`DELETE FROM financial_years WHERE id = ${req.params.id}`;
  res.json({ success: true });
});

app.get("/api/financial-years/:id/jobs", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const result = await sql`
    SELECT jobs.*, fields.name as field_name, fields.area, clients.name as client_name, products.name as product_name, users.username as operator_name, users.operator_number, users.commission_rate as operator_commission_rate
    FROM jobs
    JOIN fields ON jobs.field_id = fields.id
    JOIN clients ON fields.client_id = clients.id
    LEFT JOIN products ON jobs.product_id = products.id
    LEFT JOIN users ON jobs.operator_id = users.id
    WHERE jobs.financial_year_id = ${req.params.id}
    ORDER BY jobs.date DESC
  `;
  res.json(result);
});

app.get("/api/financial-years/:id/expenses", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const result = await sql`SELECT * FROM expenses WHERE financial_year_id = ${req.params.id} ORDER BY date DESC`;
  res.json(result);
});

// Stats & Finances
app.get("/api/stats", authenticate, async (req: any, res) => {
  let query = sql`
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

  if (req.user.role === 'operator') {
    query = sql`${query} AND jobs.operator_id = ${req.user.id}`;
  }
  const result = await query;
  res.json(result[0]);
});

app.get("/api/finances", authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  
  const clientSummaryRes = await sql`
    SELECT clients.name as client_name, fields.name as field_name, SUM(fields.area) as total_lot_area, SUM(jobs.machine_hectares) as total_machine_area,
      SUM(CASE WHEN jobs.invoicing_status = 'invoiced' THEN jobs.machine_hectares ELSE 0 END) as invoiced_area,
      SUM(CASE WHEN jobs.invoicing_status = 'pending' THEN jobs.machine_hectares ELSE 0 END) as pending_area,
      SUM(CASE WHEN jobs.invoicing_status = 'no_invoice' THEN jobs.machine_hectares ELSE 0 END) as no_invoice_area,
      SUM(jobs.total_amount) as total_revenue, SUM(jobs.total_amount * (jobs.vat_rate / 100.0)) as total_vat
    FROM jobs JOIN fields ON jobs.field_id = fields.id JOIN clients ON fields.client_id = clients.id
    WHERE jobs.financial_year_id IS NULL GROUP BY clients.id, fields.id
  `;

  const operatorSummaryRawRes = await sql`
    SELECT users.id as operator_id, users.username as operator_name, users.operator_number, users.commission_rate,
      SUM(jobs.machine_hectares) as total_area, SUM(jobs.total_amount * (COALESCE(users.commission_rate, 8) / 100.0)) as commission_amount
    FROM jobs JOIN users ON jobs.operator_id = users.id WHERE jobs.financial_year_id IS NULL GROUP BY users.id
  `;

  const operatorJobsRes = await sql`
    SELECT jobs.operator_id, jobs.date, clients.name as client_name, fields.name as field_name, jobs.machine_hectares, jobs.total_amount,
      jobs.total_amount * (COALESCE(users.commission_rate, 8) / 100.0) as commission_amount
    FROM jobs JOIN fields ON jobs.field_id = fields.id JOIN clients ON fields.client_id = clients.id JOIN users ON jobs.operator_id = users.id
    WHERE jobs.operator_id IS NOT NULL AND jobs.financial_year_id IS NULL ORDER BY jobs.date DESC
  `;

  const operatorSummary = operatorSummaryRawRes.map((op: any) => ({
    ...op,
    jobs: (operatorJobsRes as any[]).filter(job => job.operator_id === op.operator_id)
  }));

  const expensesRes = await sql`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE financial_year_id IS NULL`;
  const revenueRes = await sql`SELECT COALESCE(SUM(total_amount), 0) as total FROM jobs WHERE financial_year_id IS NULL`;

  const totalCommissions = operatorSummary.reduce((sum, op: any) => sum + (op.commission_amount || 0), 0);
  const totalRevenue = Number((revenueRes[0] as any).total);
  const totalExpenses = Number((expensesRes[0] as any).total) + totalCommissions;

  res.json({ clientSummary: clientSummaryRes, operatorSummary, totalRevenue, totalExpenses, balance: totalRevenue - totalExpenses });
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

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

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
