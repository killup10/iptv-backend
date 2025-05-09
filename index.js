// index.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import fetch from "node-fetch"; // npm install node-fetch

import m3uRoutes from "./routes/m3u.routes.js";
import videosRoutes from "./routes/videos.routes.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import adminContentRoutes from "./routes/adminContent.routes.js";
import channelsRoutes from "./routes/channels.routes.js";
import { verifyToken } from "./middlewares/verifyToken.js";

dotenv.config();

const app = express();

// Middlewares CORS para tu frontend
app.use(cors({
  origin: [
    "https://iptv-frontend-iota.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000"
  ],
  methods: ["GET","POST","PUT","DELETE"],
  allowedHeaders: ["Content-Type","Authorization"],
  credentials: true
}));
app.use(express.json());

// ————— Proxy HLS/M3U8 —————
// Ejemplo: frontend hace fetch("/proxy?url=" + encodeURIComponent(streamUrl))
app.get("/proxy", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send("Missing url query parameter");
  try {
    const response = await fetch(url);
    res.set({
      "Content-Type": response.headers.get("content-type") || "application/vnd.apple.mpegurl",
      "Access-Control-Allow-Origin": "*"
    });
    response.body.pipe(res);
  } catch (err) {
    console.error("Error en proxy:", err.message);
    res.status(500).send("Error al redirigir stream");
  }
});

// ————— Rutas API —————
app.get("/", (_req, res) => {
  res.send("Servidor backend IPTV activo 🚀");
});

app.use("/api/auth", (req, _, next) => {
  console.log("↪️ Auth route hit:", req.method, req.originalUrl);
  next();
});
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/videos", videosRoutes);
app.use("/api/m3u", m3uRoutes);
app.use("/api/admin-content", adminContentRoutes);
app.use("/api/channels", channelsRoutes);

// ————— Conexión MongoDB —————
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB conectado");
    app.listen(PORT, () => {
      console.log(`🚀 Servidor en puerto ${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ Error al conectar MongoDB:", err);
  });
