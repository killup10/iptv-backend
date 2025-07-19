import dotenv from "dotenv";
import mongoose from "mongoose";
import fetch from "node-fetch";
import express from "express";
import cors from "cors";
import app from "./app.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import videosRoutes from "./routes/videos.routes.js";
import m3uRoutes from "./routes/m3u.routes.js";
import adminContentRoutes from "./routes/adminContent.routes.js";
import channelsRoutes from "./routes/channels.routes.js";
import deviceRoutes from "./routes/device.routes.js";
import capitulosRoutes from "./routes/capitulos.routes.js";
import Device from "./models/Device.js";

dotenv.config();

// --- CORS ---
const allowedOrigins = [
  "https://iptv-frontend-iota.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "https://play.teamg.store"
];
console.log("Orígenes permitidos para CORS:", allowedOrigins);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Para Electron o Postman
    const trimmedOrigin = origin.trim();
    if (allowedOrigins.includes(trimmedOrigin)) {
      console.log(`CORS: Origen permitido: ${trimmedOrigin}`);
      return callback(null, true);
    } else {
      console.warn(`CORS: Origen NO PERMITIDO: '${trimmedOrigin}'`);
      return callback(new Error(`El origen '${trimmedOrigin}' no está permitido por CORS.`));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// Configuración de límites y timeouts
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Aumentar timeout para las conexiones
app.use((req, res, next) => {
  res.setTimeout(300000); // 5 minutos
  next();
});

// --- Proxy de imagenes ---
app.get("/img-proxy", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send("Falta el parámetro 'url'.");

  try {
    const decodedUrl = decodeURIComponent(url);
    if (!decodedUrl.startsWith("http")) return res.status(400).send("URL inválida.");

    const response = await fetch(decodedUrl, {
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0"
      },
      timeout: 10000
    });

    if (!response.ok) {
      console.warn(`Proxy imagen falló: ${decodedUrl} - ${response.status}`);
      return res.status(response.status).send("Error al obtener la imagen.");
    }

    res.set("Content-Type", response.headers.get("content-type") || "image/jpeg");
    response.body.pipe(res);
  } catch (err) {
    console.error("Error en /img-proxy:", err.message);
    res.status(500).send("Error interno del proxy de imagen.");
  }
});

// --- Proxy de HLS/M3U8 ---
app.get("/proxy", async (req, res) => {
  const { url: encodedUrl } = req.query;
  if (!encodedUrl) return res.status(400).send("Falta el parámetro 'url'.");

  try {
    const decodedUrl = decodeURIComponent(encodedUrl);
    if (!decodedUrl.startsWith("http")) return res.status(400).send("URL inválida.");

    const response = await fetch(decodedUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 20000
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "No se pudo leer cuerpo del error.");
      console.error(`Proxy HLS error: ${response.status} - ${errorBody}`);
      return res.status(response.status).send("Error desde destino.");
    }

    res.set("Content-Type", response.headers.get("content-type") || "application/octet-stream");
    response.body.pipe(res);
  } catch (err) {
    console.error(`Error en /proxy:`, err.message);
    res.status(500).send("Error interno.");
  }
});

// --- Rutas principales ---
app.get("/", (_req, res) => {
  res.send("Servidor backend IPTV TeamG Play v5 ACTIVO 🚀");
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/videos", videosRoutes);
app.use("/api/m3u", m3uRoutes);
app.use("/api/admin-content", adminContentRoutes);
app.use("/api/channels", channelsRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/capitulos", capitulosRoutes);



// --- Funciones de limpieza automática de dispositivos ---
const runDeviceCleanup = async () => {
  try {
    console.log('🧹 Ejecutando limpieza automática de dispositivos...');
    
    // Desactivar dispositivos obsoletos (más de 7 días sin actividad)
    const staleResult = await Device.deactivateStale(7);
    console.log(`✅ ${staleResult.modifiedCount} dispositivos obsoletos desactivados`);
    
    // Eliminar dispositivos inactivos antiguos (más de 30 días)
    const cleanupResult = await Device.cleanupInactive(30);
    console.log(`✅ ${cleanupResult.deletedCount} dispositivos inactivos eliminados`);
    
    // Estadísticas
    const totalActive = await Device.countDocuments({ isActive: true });
    const totalInactive = await Device.countDocuments({ isActive: false });
    console.log(`📊 Dispositivos activos: ${totalActive}, inactivos: ${totalInactive}`);
    
  } catch (error) {
    console.error('❌ Error en limpieza automática de dispositivos:', error);
  }
};

// Programar limpieza automática cada 6 horas
const scheduleDeviceCleanup = () => {
  const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 horas en milisegundos
  
  // Ejecutar limpieza inicial después de 5 minutos del inicio del servidor
  setTimeout(runDeviceCleanup, 5 * 60 * 1000);
  
  // Programar limpieza periódica
  setInterval(runDeviceCleanup, CLEANUP_INTERVAL);
  
  console.log('⏰ Limpieza automática de dispositivos programada cada 6 horas');
};

// --- MongoDB ---
const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB conectado");
    
    // Iniciar servidor
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
      
      // Programar limpieza automática de dispositivos
      scheduleDeviceCleanup();
    });
  })
  .catch(err => {
    console.error("❌ Error crítico con MongoDB:", err);
    process.exit(1);
  });

// --- Manejador de errores global ---
app.use((err, req, res, next) => {
  console.error("--- ERROR GLOBAL ---");
  console.error("Path:", req.path);
  console.error("Error:", err.message);
  if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
    console.error("Stack:", err.stack);
  }
  res.status(err.status || 500).json({ error: err.message || "Error interno." });
});
