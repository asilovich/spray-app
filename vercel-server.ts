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

// Serve static frontend
app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

export default app;
