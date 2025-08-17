import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
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

// CORS configurado explícitamente para permitir PUT con application/json y headers usados por el frontend
const corsOptions = {
  origin: true, // refleja el origen
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id'],
  credentials: false,
  maxAge: 86400
};

// Middleware
app.use(cors(corsOptions));
// Responder preflight para todas las rutas
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos desde el directorio 'uploads'
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
