import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from "@libsql/client";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-this";

// Database client
let db: any = null;
let dbInitialized = false;

const getDb = () => {
  if (!db && process.env.TURSO_DATABASE_URL) {
    db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return db;
};

const app = express();
app.use(express.json());

// Initialize database on first request
const initDb = async () => {
  if (dbInitialized) return;
  
  const client = getDb();
  if (!client) {
    console.log("No Turso config, using local SQLite fallback");
    return;
  }
  
  try {
    // Create tables
    await client.execute({ sql: `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL, operator_number INTEGER UNIQUE, secret_question TEXT, secret_answer TEXT, commission_rate REAL DEFAULT 8)`, args: [] });
    await client.execute({ sql: `CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT DEFAULT 'individual', responsible TEXT, address TEXT, city TEXT, cuit TEXT, phone TEXT, email TEXT, default_price REAL DEFAULT 0)`, args: [] });
    await client.execute({ sql: `CREATE TABLE IF NOT EXISTS fields (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, name TEXT NOT NULL, area REAL NOT NULL)`, args: [] });
    await client.execute({ sql: `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, unit TEXT NOT NULL, cost_per_unit REAL NOT NULL)`, args: [] });
    await client.execute({ sql: `CREATE TABLE IF NOT EXISTS financial_years (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, end_date TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`, args: [] });
    await client.execute({ sql: `CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, field_id INTEGER NOT NULL, date TEXT NOT NULL, product_id INTEGER, product_amount REAL, price_per_hectare REAL DEFAULT 0, total_amount REAL DEFAULT 0, status TEXT DEFAULT 'pending', notes TEXT, operator_id INTEGER, invoicing_status TEXT DEFAULT 'pending', vat_rate REAL DEFAULT 0, machine_hectares REAL DEFAULT 0, paid INTEGER DEFAULT 0, financial_year_id INTEGER)`, args: [] });
    await client.execute({ sql: `CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, description TEXT NOT NULL, amount REAL NOT NULL, date TEXT NOT NULL, category TEXT, financial_year_id INTEGER)`, args: [] });
    
    // Check if admin exists
    const adminCheck = await client.execute({ sql: "SELECT * FROM users WHERE username = 'admin'", args: [] });
    if (adminCheck.rows.length === 0) {
      const hashedPassword = bcrypt.hashSync("administrador", 10);
      await client.execute({ sql: "INSERT INTO users (username, password, role) VALUES (?, ?, ?)", args: ["admin", hashedPassword, "admin"] });
      console.log("Admin user created");
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
    const client = getDb();
    if (!client) return res.status(500).json({ error: "No database" });
    await client.execute({ sql: "SELECT 1", args: [] });
    res.json({ status: "ok" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const client = getDb();
    if (!client) return res.status(500).json({ error: "Database not available" });
    
    const { username, password } = req.body;
    const result = await client.execute({ sql: "SELECT * FROM users WHERE username = ?", args: [username] });
    const user = result.rows[0] as any;
    
    if (!user || !bcrypt.compareSync(password, user.password as string)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, operator_number: user.operator_number }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, operator_number: user.operator_number } });
  } catch (error: any) {
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
