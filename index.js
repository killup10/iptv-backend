// index.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import fetch from "node-fetch"; // Asegúrate de tenerlo instalado: npm install node-fetch

import m3uRoutes from "./routes/m3u.routes.js";
import videosRoutes from "./routes/videos.routes.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import adminContentRoutes from "./routes/adminContent.routes.js";
import channelsRoutes from "./routes/channels.routes.js";
// import { verifyToken } from "./middlewares/verifyToken.js"; // No parece usarse globalmente, si es por ruta, está bien

dotenv.config();

const app = express();

// Middlewares CORS para tu frontend
app.use(cors({
  origin: [
    "https://iptv-frontend-iota.vercel.app", // Tu frontend en Vercel
    "http://localhost:5173", // Tu frontend en desarrollo local (Vite)
    "http://localhost:3000"  // Otro posible puerto de desarrollo local
  ],
  methods: ["GET","POST","PUT","DELETE"],
  allowedHeaders: ["Content-Type","Authorization"],
  credentials: true
}));
app.use(express.json());

// ————— Proxy HLS/M3U8 —————
app.get("/proxy", async (req, res) => {
  const { url: encodedUrl } = req.query; // Renombrado a encodedUrl para claridad

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

  try {
    const targetResponse = await fetch(decodedUrl, {
      headers: {
        // Algunos servidores de streaming son sensibles al User-Agent.
        // Puedes probar con uno genérico de navegador o el de un reproductor conocido si tienes problemas.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36',
        // 'Referer': Podría ser necesario para algunos streams, usa el origen del stream si es el caso.
      },
      timeout: 10000 // Timeout de 10 segundos para la petición al origen (opcional)
    });

    if (!targetResponse.ok) {
      const errorBody = await targetResponse.text().catch(() => "No se pudo leer el cuerpo del error.");
      console.error(`Proxy: Error desde el servidor de destino (${decodedUrl}): ${targetResponse.status} ${targetResponse.statusText}. Cuerpo: ${errorBody}`);
      return res.status(targetResponse.status).send(`Error desde el servidor de destino: ${targetResponse.statusText}`);
    }

    // Configurar cabeceras para la respuesta del proxy al cliente
    // Es importante pasar los headers correctos para que el player funcione bien (especialmente para HLS)
    res.set({
      "Content-Type": targetResponse.headers.get("content-type") || "application/octet-stream",
      "Access-Control-Allow-Origin": "*", // Necesario para que el frontend lea la respuesta del proxy
      // Para HLS y streaming en general, 'Cache-Control' y 'Content-Length' pueden ser importantes
      // 'Cache-Control': targetResponse.headers.get('cache-control') || 'no-cache',
      // Si el Content-Length está disponible, pasarlo puede ayudar.
      // 'Content-Length': targetResponse.headers.get('content-length'),
      // Para seeking (byte range requests)
      // 'Accept-Ranges': targetResponse.headers.get('accept-ranges') || 'bytes',
    });

    // Transmitir el cuerpo de la respuesta del servidor de destino al cliente
    targetResponse.body.pipe(res);

  } catch (err) {
    console.error(`Proxy: Error al hacer fetch a ${decodedUrl}:`, err.message, err.stack);
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
        return res.status(504).send(`Proxy: No se pudo alcanzar el servidor de destino (${decodedUrl}).`);
    } else if (err.name === 'FetchError' && err.type === 'request-timeout') {
        return res.status(504).send(`Proxy: Timeout al conectar con el servidor de destino (${decodedUrl}).`);
    }
    res.status(500).send("Proxy: Error interno al intentar redirigir el stream.");
  }
});

// ————— Rutas API —————
app.get("/", (_req, res) => {
  res.send("Servidor backend IPTV activo 🚀");
});

// Middleware de log para rutas específicas (ejemplo)
app.use("/api/auth", (req, _, next) => {
  console.log(`↪️  ${req.method} /api/auth${req.url}`);
  next();
});

// Definición de rutas
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes); // Considera proteger estas rutas con verifyToken si no lo hacen internamente
app.use("/api/videos", videosRoutes);
app.use("/api/m3u", m3uRoutes);
app.use("/api/admin-content", adminContentRoutes); // Considera proteger
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
    process.exit(1); // Terminar el proceso si no se puede conectar a la DB
  });

// Manejador de errores global simple (opcional, pero buena práctica)
app.use((err, req, res, next) => {
  console.error("Global error handler:", err.stack);
  res.status(500).send('Algo salió mal en el servidor!');
});