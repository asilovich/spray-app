import express from "express";
import pg from "pg";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

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
    
    const clientsCount = await client.query("SELECT COUNT(*) FROM clients");
    const jobsCount = await client.query("SELECT COUNT(*) FROM jobs");
    const fieldsCount = await client.query("SELECT COUNT(*) FROM fields");
    const totalAmount = await client.query("SELECT COALESCE(SUM(total_amount), 0) as total FROM jobs");
    
    res.json({
      clients: parseInt(clientsCount.rows[0].count),
      jobs: parseInt(jobsCount.rows[0].count),
      fields: parseInt(fieldsCount.rows[0].count),
      total: parseFloat(totalAmount.rows[0].total)
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
    
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Expenses
app.get("/api/expenses", async (req, res) => {
  try {
    const client = getPool();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const result = await client.query("SELECT * FROM expenses ORDER BY date DESC");
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
    
    const incomeResult = await client.query("SELECT COALESCE(SUM(total_amount), 0) as total FROM jobs");
    const expenseResult = await client.query("SELECT COALESCE(SUM(amount), 0) as total FROM expenses");
    
    const income = parseFloat(incomeResult.rows[0].total);
    const expenses = parseFloat(expenseResult.rows[0].total);
    
    res.json({ income, expenses, profit: income - expenses });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Serve static frontend
app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

export default app;
