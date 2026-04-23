import express from "express";
import pg from "pg";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

// Dynamic import for Vite (only in dev)
let createViteServer: any = null;
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  import("vite").then((vite) => {
    createViteServer = vite.createServer;
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-this";

// PostgreSQL pool for Neon
let pool: any = null;
let dbInitialized = false;

const getPool = () => {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
};

const app = express();
app.use(express.json());

// Initialize database
const initDb = async () => {
  if (dbInitialized) return;
  
  const client = getPool();
  if (!client) {
    console.log("No database config");
    return;
  }
  
  try {
    // Create tables
    await client.query(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL,
      operator_number INTEGER UNIQUE,
      secret_question TEXT,
      secret_answer TEXT,
      commission_rate REAL DEFAULT 8
    )`);
    
    await client.query(`CREATE TABLE IF NOT EXISTS clients (
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
    )`);
    
    await client.query(`CREATE TABLE IF NOT EXISTS fields (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL,
      name VARCHAR(255) NOT NULL,
      area REAL NOT NULL
    )`);
    
    await client.query(`CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      unit VARCHAR(50) NOT NULL,
      cost_per_unit REAL NOT NULL
    )`);
    
    await client.query(`CREATE TABLE IF NOT EXISTS financial_years (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      end_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    
    await client.query(`CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      field_id INTEGER NOT NULL,
      date DATE NOT NULL,
      product_id INTEGER,
      product_amount REAL,
      price_per_hectare REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      notes TEXT,
      operator_id INTEGER,
      invoicing_status VARCHAR(50) DEFAULT 'pending',
      vat_rate REAL DEFAULT 0,
      machine_hectares REAL DEFAULT 0,
      paid INTEGER DEFAULT 0,
      financial_year_id INTEGER
    )`);
    
    await client.query(`CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      date DATE NOT NULL,
      category VARCHAR(100),
      financial_year_id INTEGER
    )`);
    
    // Check if admin exists
    const adminCheck = await client.query("SELECT * FROM users WHERE username = 'admin'");
    console.log("Admin check result:", adminCheck.rows.length, "rows");
    
    if (adminCheck.rows.length === 0) {
      const hashedPassword = bcrypt.hashSync("administrador", 10);
      console.log("Creating admin user with hashed password:", hashedPassword.substring(0, 20) + "...");
      
      await client.query(
        "INSERT INTO users (username, password, role) VALUES ($1, $2, $3)",
        ["admin", hashedPassword, "admin"]
      );
      console.log("Admin user created successfully");
      
      // Verify
      const verify = await client.query("SELECT username, role FROM users WHERE username = 'admin'");
      console.log("Verified admin:", verify.rows[0]);
    } else {
      console.log("Admin already exists");
    }
    
    dbInitialized = true;
    console.log("Database initialized");
  } catch (error: any) {
    console.error("DB init error:", error.message);
    throw error;
  }
};

// Middleware to init DB
app.use('/api', async (req, res, next) => {
  try {
    await initDb();
    next();
  } catch (error: any) {
    res.status(500).json({ error: "Database error", message: error.message });
  }
});

// Health check
app.get("/api/health", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "No database" });
    await client.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { username, password } = req.body;
    console.log("Login attempt for:", username);
    
    const result = await client.query("SELECT * FROM users WHERE username = $1", [username]);
    const user = result.rows[0];
    
    if (!user) {
      console.log("User not found:", username);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    const passwordMatch = bcrypt.compareSync(password, user.password);
    console.log("Password match:", passwordMatch);
    
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, operator_number: user.operator_number }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, operator_number: user.operator_number } });
  } catch (error: any) {
    console.error("Login error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { username, password, role, operator_number, secret_question, secret_answer, commission_rate } = req.body;
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    const hashedAnswer = secret_answer ? bcrypt.hashSync(secret_answer.toLowerCase().trim(), 10) : null;
    
    await client.query(
      "INSERT INTO users (username, password, role, operator_number, secret_question, secret_answer, commission_rate) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [username, hashedPassword, role, operator_number || null, secret_question || null, hashedAnswer, commission_rate || 8]
    );
    
    res.status(201).json({ success: true });
  } catch (error: any) {
    console.error("Register error:", error.message);
    if (error.message.includes("duplicate")) {
      return res.status(400).json({ error: "Username or operator number already exists" });
    }
    res.status(500).json({ error: error.message });
  }
});

// Clients
app.get("/api/clients", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const result = await client.query("SELECT * FROM clients ORDER BY name");
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/clients", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { name, type, responsible, address, city, cuit, phone, email, default_price } = req.body;
    
    const result = await client.query(
      "INSERT INTO clients (name, type, responsible, address, city, cuit, phone, email, default_price) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
      [name, type || 'individual', responsible, address, city, cuit, phone, email, default_price || 0]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error("Create client error:", error.message);
    if (error.message.includes("duplicate")) {
      return res.status(400).json({ error: "Client name or CUIT already exists" });
    }
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/clients/:id", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { id } = req.params;
    const { name, type, responsible, address, city, cuit, phone, email, default_price } = req.body;
    
    const result = await client.query(
      "UPDATE clients SET name=$1, type=$2, responsible=$3, address=$4, city=$5, cuit=$6, phone=$7, email=$8, default_price=$9 WHERE id=$10 RETURNING *",
      [name, type, responsible, address, city, cuit, phone, email, default_price, id]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: "Client not found" });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/clients/:id", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { id } = req.params;
    await client.query("DELETE FROM clients WHERE id=$1", [id]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Fields
app.get("/api/fields", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const result = await client.query("SELECT * FROM fields ORDER BY name");
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/fields", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { client_id, name, area } = req.body;
    
    const result = await client.query(
      "INSERT INTO fields (client_id, name, area) VALUES ($1, $2, $3) RETURNING *",
      [client_id, name, area]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/fields/:id", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { id } = req.params;
    const { client_id, name, area } = req.body;
    
    const result = await client.query(
      "UPDATE fields SET client_id=$1, name=$2, area=$3 WHERE id=$4 RETURNING *",
      [client_id, name, area, id]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: "Field not found" });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/fields/:id", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { id } = req.params;
    await client.query("DELETE FROM fields WHERE id=$1", [id]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Users
app.get("/api/users", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const result = await client.query("SELECT id, username, role, operator_number, commission_rate FROM users ORDER BY username");
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Jobs
app.get("/api/jobs", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const result = await client.query(`
      SELECT j.*, f.name as field_name, f.area, c.name as client_name, p.name as product_name, 
             u.operator_number, u.username as operator_name
      FROM jobs j 
      LEFT JOIN fields f ON j.field_id = f.id 
      LEFT JOIN clients c ON f.client_id = c.id 
      LEFT JOIN products p ON j.product_id = p.id 
      LEFT JOIN users u ON j.operator_id = u.id
      WHERE j.financial_year_id IS NULL
      ORDER BY j.date DESC
    `);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/jobs", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { field_id, date, product_id, product_amount, price_per_hectare, total_amount, status, notes, operator_id, invoicing_status, vat_rate, machine_hectares, paid, financial_year_id } = req.body;
    
    const result = await client.query(
      `INSERT INTO jobs (field_id, date, product_id, product_amount, price_per_hectare, total_amount, status, notes, operator_id, invoicing_status, vat_rate, machine_hectares, paid, financial_year_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [field_id, date, product_id || null, product_amount, price_per_hectare || 0, total_amount || 0, status || 'pending', notes, operator_id || null, invoicing_status || 'pending', vat_rate || 0, machine_hectares || 0, paid || 0, financial_year_id || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/jobs/:id", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { id } = req.params;
    const { status } = req.body;
    
    const result = await client.query(
      "UPDATE jobs SET status=$1 WHERE id=$2 RETURNING *",
      [status, id]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: "Job not found" });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH for updating job status (used by frontend)
app.patch("/api/jobs/:id", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { id } = req.params;
    const { status } = req.body;
    
    const result = await client.query(
      "UPDATE jobs SET status=$1 WHERE id=$2 RETURNING *",
      [status, id]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: "Job not found" });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH for updating job billing information
app.patch("/api/jobs/:id/billing", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { id } = req.params;
    const { invoicing_status, vat_rate, paid } = req.body;
    
    const result = await client.query(
      "UPDATE jobs SET invoicing_status=$1, vat_rate=$2, paid=$3 WHERE id=$4 RETURNING *",
      [invoicing_status, vat_rate, paid ? 1 : 0, id]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: "Job not found" });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/jobs/:id", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { id } = req.params;
    await client.query("DELETE FROM jobs WHERE id=$1", [id]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Products
app.get("/api/products", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const result = await client.query("SELECT * FROM products ORDER BY name");
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/products", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { name, unit, cost_per_unit } = req.body;
    
    const result = await client.query(
      "INSERT INTO products (name, unit, cost_per_unit) VALUES ($1, $2, $3) RETURNING *",
      [name, unit, cost_per_unit]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stats
app.get("/api/stats", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const statsResult = await client.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN total_amount ELSE 0 END), 0) as pending_revenue,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END), 0) as collected_revenue,
        COALESCE(SUM(machine_hectares), 0) as total_machine_hectares
      FROM jobs
      WHERE financial_year_id IS NULL
    `);
    
    const stats = statsResult.rows[0];
    
    res.json({
      total_jobs: parseInt(stats.total_jobs),
      total_revenue: parseFloat(stats.total_revenue),
      pending_revenue: parseFloat(stats.pending_revenue),
      collected_revenue: parseFloat(stats.collected_revenue),
      total_hectares: parseFloat(stats.total_machine_hectares),
      total_machine_hectares: parseFloat(stats.total_machine_hectares)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Financial Years
app.get("/api/financial-years", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const result = await client.query("SELECT * FROM financial_years ORDER BY end_date DESC");
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/financial-years", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { name, end_date } = req.body;
    
    const result = await client.query(
      "INSERT INTO financial_years (name, end_date) VALUES ($1, $2) RETURNING *",
      [name, end_date]
    );
    
    const newYearId = result.rows[0].id;

    // Move current jobs to the new financial year
    await client.query("UPDATE jobs SET financial_year_id = $1 WHERE financial_year_id IS NULL", [newYearId]);
    
    // Move current expenses to the new financial year
    await client.query("UPDATE expenses SET financial_year_id = $1 WHERE financial_year_id IS NULL", [newYearId]);
    
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get jobs for a specific financial year
app.get("/api/financial-years/:id/jobs", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { id } = req.params;
    
    const result = await client.query(`
      SELECT j.*, f.name as field_name, f.area, c.name as client_name, p.name as product_name, 
             u.operator_number, u.username as operator_name, u.commission_rate as operator_commission_rate
      FROM jobs j 
      LEFT JOIN fields f ON j.field_id = f.id 
      LEFT JOIN clients c ON f.client_id = c.id 
      LEFT JOIN products p ON j.product_id = p.id 
      LEFT JOIN users u ON j.operator_id = u.id
      WHERE j.financial_year_id = $1
      ORDER BY j.date DESC
    `, [id]);
    
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get expenses for a specific financial year
app.get("/api/financial-years/:id/expenses", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { id } = req.params;
    
    const result = await client.query(`
      SELECT * FROM expenses 
      WHERE financial_year_id = $1
      ORDER BY date DESC
    `, [id]);
    
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update financial year
app.put("/api/financial-years/:id", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { id } = req.params;
    const { name, end_date } = req.body;
    
    const result = await client.query(
      "UPDATE financial_years SET name=$1, end_date=$2 WHERE id=$3 RETURNING *",
      [name, end_date, id]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: "Financial year not found" });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete financial year
app.delete("/api/financial-years/:id", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { id } = req.params;
    const { password } = req.body;
    
    // TODO: Verify admin password before deleting
    // For now, just delete the financial year and associated data
    
    // Delete associated jobs and expenses first
    await client.query("DELETE FROM jobs WHERE financial_year_id = $1", [id]);
    await client.query("DELETE FROM expenses WHERE financial_year_id = $1", [id]);
    
    const result = await client.query(
      "DELETE FROM financial_years WHERE id=$1 RETURNING *",
      [id]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: "Financial year not found" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Expenses
app.get("/api/expenses", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const result = await client.query("SELECT * FROM expenses WHERE financial_year_id IS NULL ORDER BY date DESC");
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/expenses", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { description, amount, date, category, financial_year_id } = req.body;
    
    const result = await client.query(
      "INSERT INTO expenses (description, amount, date, category, financial_year_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [description, amount, date, category, financial_year_id || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Finances
app.get("/api/finances", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    // Get income from jobs
    const incomeResult = await client.query(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as totalRevenue,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END), 0) as invoiced,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN total_amount ELSE 0 END), 0) as pending
      FROM jobs
      WHERE financial_year_id IS NULL
    `);
    
    // Get expenses
    const expenseResult = await client.query("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE financial_year_id IS NULL");
    
    // Get operator summary
    const operatorResult = await client.query(`
      SELECT 
        u.id as operator_id,
        u.username as operator_name,
        u.operator_number,
        u.commission_rate,
        COALESCE(SUM(j.machine_hectares), 0) as total_area,
        COALESCE(SUM(j.total_amount), 0) as total_revenue,
        COALESCE(SUM(j.total_amount) * (u.commission_rate / 100.0), 0) as commission_amount
      FROM users u
      LEFT JOIN jobs j ON u.id = j.operator_id AND j.financial_year_id IS NULL
      WHERE u.role = 'operator'
      GROUP BY u.id, u.username, u.operator_number, u.commission_rate
      ORDER BY u.operator_number
    `);
    
    // Get operator jobs
    const operatorJobsResult = await client.query(`
      SELECT 
        j.operator_id,
        j.date,
        j.machine_hectares,
        j.total_amount,
        j.status,
        c.name as client_name,
        f.name as field_name,
        u.commission_rate,
        (j.total_amount * (u.commission_rate / 100.0)) as commission_amount
      FROM jobs j
      LEFT JOIN fields f ON j.field_id = f.id
      LEFT JOIN clients c ON f.client_id = c.id
      LEFT JOIN users u ON j.operator_id = u.id
      WHERE j.financial_year_id IS NULL
      ORDER BY j.operator_id, j.date DESC
    `);
    
    // Group jobs by operator
    const operatorSummary = operatorResult.rows.map(op => ({
      ...op,
      jobs: operatorJobsResult.rows.filter(j => j.operator_id === op.operator_id)
    }));
    
    // Get client summary
    const clientResult = await client.query(`
      SELECT 
        c.name as client_name,
        f.name as field_name,
        f.area,
        COALESCE(SUM(CASE WHEN j.status = 'completed' THEN j.machine_hectares ELSE 0 END), 0) as completed_area,
        COALESCE(SUM(CASE WHEN j.status = 'pending' THEN j.machine_hectares ELSE 0 END), 0) as pending_area,
        COALESCE(SUM(j.total_amount), 0) as total_amount
      FROM clients c
      LEFT JOIN fields f ON c.id = f.client_id
      LEFT JOIN jobs j ON f.id = j.field_id AND j.financial_year_id IS NULL
      GROUP BY c.name, f.name, f.area
      ORDER BY c.name, f.name
    `);
    
    const totalRevenue = parseFloat(incomeResult.rows[0].totalrevenue);
    const totalExpenses = parseFloat(expenseResult.rows[0].total) + operatorSummary.reduce((sum, op) => sum + parseFloat(op.commission_amount), 0);
    const balance = totalRevenue - totalExpenses;
    
    res.json({
      totalRevenue,
      totalExpenses,
      balance,
      operatorSummary,
      clientSummary: clientResult.rows
    });
  } catch (error: any) {
    console.error("Finances error:", error.message);
    res.status(500).json({ error: error.message });
  }
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

// Start server
if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server on port ${PORT}`);
  });
}

export default app;
