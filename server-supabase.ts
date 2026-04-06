import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase Client
const supabaseUrl = process.env.SUPABASE_URL || "https://kroezoodizcefkgtzmit.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-this";

const app = express();
app.use(express.json());

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    const { data, error } = await supabase.from("users").select("count").limit(1);
    if (error) throw error;
    res.json({ status: "ok", db: "connected" });
  } catch (e: any) {
    res.status(500).json({ status: "error", db: "disconnected", error: e.message });
  }
});

// Initialize Database Schema
const initDb = async () => {
  console.log("Database initialization skipped - using Supabase");
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

// API Routes - Login
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const { data: users, error } = await supabase
    .from("users")
    .select("*")
    .eq("username", username)
    .single();
  
  if (error || !users || !bcrypt.compareSync(password, users.password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  
  const token = jwt.sign({ 
    id: users.id, 
    username: users.username, 
    role: users.role, 
    operator_number: users.operator_number 
  }, JWT_SECRET);
  
  res.json({ 
    token, 
    user: { 
      id: users.id, 
      username: users.username, 
      role: users.role, 
      operator_number: users.operator_number 
    } 
  });
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
  if (!process.env.VERCEL) {
    const PORT = Number(process.env.PORT) || 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  }
}).catch(console.error);

export default app;
