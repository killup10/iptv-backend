// iptv-backend/index.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import fetch from "node-fetch"; // Asegúrate de tener node-fetch instalado: npm install node-fetch

// Importar Rutas
import m3uRoutes from "./routes/m3u.routes.js";
import videosRoutes from "./routes/videos.routes.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import adminContentRoutes from "./routes/adminContent.routes.js";
import channelsRoutes from "./routes/channels.routes.js";

dotenv.config();

const app = express();

// --- Middlewares ---

const allowedOrigins = [
  "https://iptv-frontend-iota.vercel.app", // Tu frontend en Vercel
  "http://localhost:5173",                 // Puerto común para Vite
  "http://localhost:5174",                 // El puerto que estás usando ahora
  "http://localhost:3000",                 // Otro posible puerto local
  // Puedes añadir más si es necesario
];

app.use(cors({
  origin: function (origin, callback) {
    // Permitir peticiones sin 'origin' (ej. Postman, apps móviles) O si el origen está en la lista
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS: Origen no permitido: ${origin}`);
      callback(new Error('Este origen no está permitido por la política CORS.'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Incluir OPTIONS para preflight
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true 
}));

app.use(express.json()); // Para parsear JSON en el cuerpo de las peticiones

// --- Proxy HLS/M3U8 ---
app.get("/proxy", async (req, res) => {
  const { url: encodedUrl } = req.query;
  if (!encodedUrl) {
    return res.status(400).send("Falta el parámetro 'url' en la consulta.");
  }
  let decodedUrl;
  try {
    decodedUrl = decodeURIComponent(encodedUrl);
  } catch (e) {
    console.error("Proxy: Error al decodificar URL:", e.message, "URL recibida:", encodedUrl);
    return res.status(400).send("URL mal formada o inválida.");
  }

  console.log(`Proxy: Intentando acceder a URL decodificada: ${decodedUrl}`);
  if (!decodedUrl.startsWith('http://') && !decodedUrl.startsWith('https://')) {
      console.error(`Proxy: URL decodificada no es absoluta: ${decodedUrl}`);
      return res.status(400).send("El proxy solo puede procesar URLs absolutas.");
  }

  try {
    const targetResponse = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36',
      },
      timeout: 15000 // Timeout de 15 segundos
    });

    if (!targetResponse.ok) {
      const errorBody = await targetResponse.text().catch(() => "No se pudo leer el cuerpo del error del destino.");
      console.error(`Proxy: Error desde el servidor de destino (${decodedUrl}): ${targetResponse.status} ${targetResponse.statusText}. Cuerpo: ${errorBody}`);
      return res.status(targetResponse.status).send(`Error desde el servidor de destino: ${targetResponse.statusText}`);
    }
    res.set({
      "Content-Type": targetResponse.headers.get("content-type") || "application/octet-stream",
    });
    targetResponse.body.pipe(res);
  } catch (err) {
    console.error(`Proxy: Error al hacer fetch a ${decodedUrl}:`, err.message, err.stack);
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
        return res.status(504).send(`Proxy: No se pudo alcanzar el servidor de destino.`);
    } else if (err.name === 'FetchError' && (err.type === 'request-timeout' || err.message.includes('timeout'))) {
        return res.status(504).send(`Proxy: Timeout al conectar con el servidor de destino.`);
    }
    res.status(500).send("Proxy: Error interno al intentar redirigir el stream.");
  }
});

// --- Rutas API ---
app.get("/", (_req, res) => {
  res.send("Servidor backend IPTV activo v4 🚀"); // Cambiado a v4 para verificar deploy
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/videos", videosRoutes); 
app.use("/api/m3u", m3uRoutes);
app.use("/api/admin-content", adminContentRoutes);
app.use("/api/channels", channelsRoutes); 

// --- Conexión MongoDB y Arranque del Servidor ---
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB conectado");
    app.listen(PORT, () => {
      console.log(`🚀 Servidor en puerto ${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ Error crítico al conectar MongoDB o iniciar servidor:", err);
    process.exit(1); // Salir si no se puede conectar a la DB o iniciar el servidor
  });

// Manejador de errores global (debe ir al final)
app.use((err, req, res, next) => {
  console.error("Manejador de errores global:", err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Algo salió mal en el servidor!'
  });
});