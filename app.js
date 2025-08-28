// iptv-backend/app.js

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import adminContentRoutes from './routes/adminContent.routes.js';
import channelsRoutes from './routes/channels.routes.js';
import videosRoutes from './routes/videos.routes.js';
import m3uRoutes from './routes/m3u.routes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import vodManagementRoutes from './routes/vodManagement.routes.js';
import migrationRoutes from './routes/migration.routes.js';
import progressRoutes from './routes/progress.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- CONFIGURACIÓN DE CORS ACTUALIZADA ---
const allowedOrigins = [
  // Orígenes para la web y desarrollo
  "https://iptv-frontend-iota.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "https://play.teamg.store",

  // Orígenes para la aplicación móvil (APK/Capacitor)
  "http://localhost",
  "capacitor://localhost"
];

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir solicitudes sin origen (como Postman o apps nativas) y las de la lista
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id'],
  credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Habilitar respuesta para pre-flight
// --- FIN DE LA CONFIGURACIÓN DE CORS ---

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/content', adminContentRoutes);
app.use('/api/channels', channelsRoutes);
app.use('/api/videos', videosRoutes);
app.use('/api/m3u', m3uRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/manage-vod', vodManagementRoutes);
app.use('/api/admin', migrationRoutes);
app.use('/api/progress', progressRoutes);

// Manejador de errores global
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Error interno del servidor'
  });
});

export default app;