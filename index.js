// iptv-backend/index.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import fetch from "node-fetch"; // Asegúrate de que esté en tu package.json

import m3uRoutes from "./routes/m3u.routes.js";
import videosRoutes from "./routes/videos.routes.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import adminContentRoutes from "./routes/adminContent.routes.js";
import channelsRoutes from "./routes/channels.routes.js";

dotenv.config();
const app = express();

// --- Middlewares ---

// Tu lista original de orígenes permitidos (la comentaremos temporalmente)
/*
const allowedOrigins = [
  "https://iptv-frontend-iota.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "https://play.teamg.store"
];
*/

// Configuración de CORS SIMPLIFICADA PARA DEPURACIÓN
console.log("Aplicando configuración de CORS simplificada (origin: '*') para depuración.");
app.use(cors({
  origin: '*', // <--- CAMBIO TEMPORAL: Permite todos los orígenes
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

/*
// Tu configuración de CORS original (comentada temporalmente)
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS: Origen no permitido: ${origin}`);
      callback(new Error(`Origen ${origin} no permitido por CORS.`));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));
*/

app.use(express.json()); // Para parsear cuerpos JSON

// --- Proxy HLS/M3U8 (si aún lo necesitas) ---
app.get("/proxy", async (req, res) => {
  const { url: encodedUrl } = req.query;
  if (!encodedUrl) return res.status(400).send("Falta el parámetro 'url'.");
  let decodedUrl;
  try {
    decodedUrl = decodeURIComponent(encodedUrl);
  } catch (e) {
    console.error("Proxy: Error al decodificar URL:", e.message, "URL recibida:", encodedUrl);
    return res.status(400).send("URL mal formada.");
  }
  if (!decodedUrl.startsWith('http://') && !decodedUrl.startsWith('https://')) {
    return res.status(400).send("Proxy solo procesa URLs absolutas.");
  }
  console.log(`Proxy: Accediendo a: ${decodedUrl}`);
  try {
    const targetResponse = await fetch(decodedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36' },
      timeout: 20000
    });
    if (!targetResponse.ok) {
      const errorBody = await targetResponse.text().catch(() => "No se pudo leer cuerpo del error.");
      console.error(`Proxy: Error desde destino (${decodedUrl}): ${targetResponse.status} ${targetResponse.statusText}. Cuerpo: ${errorBody}`);
      return res.status(targetResponse.status).send(`Error desde destino: ${targetResponse.statusText}`);
    }
    res.set({ 
        "Content-Type": targetResponse.headers.get("content-type") || "application/octet-stream",
    });
    targetResponse.body.pipe(res);
  } catch (err) {
    console.error(`Proxy: Fetch error a ${decodedUrl}:`, err.message);
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') return res.status(504).send(`Proxy: No se pudo alcanzar destino.`);
    if (err.name === 'FetchError' && (err.type === 'request-timeout' || err.message.includes('timeout'))) return res.status(504).send(`Proxy: Timeout conectando a destino.`);
    res.status(500).send("Proxy: Error interno.");
  }
});

// --- Rutas API ---
app.get("/", (_req, res) => {
  res.send("Servidor backend IPTV TeamG Play v5 ACTIVO 🚀 (CORS DEBUG MODE)");
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/videos", videosRoutes); 
app.use("/api/m3u", m3uRoutes);
app.use("/api/admin-content", adminContentRoutes);
app.use("/api/channels", channelsRoutes); 

// --- Conexión MongoDB y Arranque ---
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB conectado");
    app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
  })
  .catch(err => {
    console.error("❌ Error crítico al conectar a MongoDB o iniciar servidor:", err);
    process.exit(1);
  });

// Manejador de errores global
app.use((err, req, res, next) => {
  console.error("--- MANEJADOR DE ERRORES GLOBAL ---");
  console.error("Path:", req.path);
  console.error("Error:", err.message);
  if (process.env.NODE_ENV === 'development') {
    console.error("Stack:", err.stack);
  }
  console.error("---------------------------------");
  res.status(err.status || 500).json({
    error: err.message || 'Algo salió muy mal en el servidor!'
  });
});
