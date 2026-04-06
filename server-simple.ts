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

// Supabase Client - Lazy initialization
let supabase: any = null;
let dbError: string | null = null;

const getSupabase = () => {
  if (!supabase) {
    try {
      const supabaseUrl = process.env.SUPABASE_URL || "https://kroezoodizcefkgtzmit.supabase.co";
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
      
      if (!supabaseKey) {
        dbError = "SUPABASE_SERVICE_ROLE_KEY not configured";
        console.error(dbError);
        return null;
      }
      
      supabase = createClient(supabaseUrl, supabaseKey);
      console.log("Supabase client created");
    } catch (e: any) {
      dbError = e.message;
      console.error("Failed to create Supabase client:", e.message);
      return null;
    }
  }
  return supabase;
};

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-this";

const app = express();
app.use(express.json());

// Health check endpoint - no DB required
app.get("/api/health", async (req, res) => {
  const client = getSupabase();
  if (!client) {
    return res.status(500).json({ 
      status: "error", 
      message: "Database not configured", 
      error: dbError 
    });
  }
  
  try {
    const { data, error } = await client.from("users").select("id").limit(1);
    if (error) throw error;
    res.json({ status: "ok", db: "connected", data });
  } catch (e: any) {
    console.error("Health check error:", e.message);
    res.status(500).json({ 
      status: "error", 
      db: "disconnected", 
      error: e.message 
    });
  }
});

// Login endpoint
app.post("/api/login", async (req, res) => {
  const client = getSupabase();
  if (!client) {
    return res.status(500).json({ error: "Database not available" });
  }
  
  try {
    const { username, password } = req.body;
    console.log("Login attempt:", username);
    
    const { data: user, error } = await client
      .from("users")
      .select("*")
      .eq("username", username)
      .single();
    
    if (error) {
      console.error("Login query error:", error.message);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    const token = jwt.sign({ 
      id: user.id, 
      username: user.username, 
      role: user.role, 
      operator_number: user.operator_number 
    }, JWT_SECRET);
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        role: user.role, 
        operator_number: user.operator_number 
      } 
    });
  } catch (e: any) {
    console.error("Login error:", e.message);
    res.status(500).json({ error: "Login failed", message: e.message });
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

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

// Start server
if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
