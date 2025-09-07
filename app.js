import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Import all your route handlers
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import adminContentRoutes from './routes/adminContent.routes.js';
import channelRoutes from './routes/channels.routes.js';
import videosRoutes from './routes/videos.routes.js';
import m3uRoutes from './routes/m3u.routes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import vodManagementRoutes from './routes/vodManagement.routes.js';
import migrationRoutes from './routes/migration.routes.js';
import progressRoutes from './routes/progress.routes.js';
import deviceRoutes from './routes/device.routes.js';
import collectionRoutes from './routes/collection.routes.js';

// --- BASIC SETUP ---
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// --- PERFORMANCE LOGGER ---
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    // Exclude health checks from performance logs to avoid noise
    if (req.originalUrl !== '/api/health') {
      console.log(`[PERF] ${req.method} ${req.originalUrl} - ${res.statusCode} [${duration}ms]`);
    }
  });
  next();
});

// --- CORS CONFIGURATION (APPLY BEFORE ALL ROUTES) ---
const allowedDomains = [
  'play.teamg.store',
  'iptv-frontend-iota.vercel.app',
  'iptv-frontend-clean.pages.dev',
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin || origin === 'null') {
      return callback(null, true);
    }

    // For development, allow all localhost and 127.0.0.1 origins regardless of port or protocol
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
      console.log(`CORS dev origin allowed: ${origin}`);
      return callback(null, true);
    }
    
    // For mobile webviews (Capacitor/Cordova)
    if (origin.startsWith('capacitor://') || origin.startsWith('ionic://')) {
        console.log(`CORS mobile origin allowed: ${origin}`);
        return callback(null, true);
    }

    // Check if the origin's domain is in our production whitelist
    try {
      const originUrl = new URL(origin);
      if (allowedDomains.includes(originUrl.hostname)) {
        console.log(`CORS production origin allowed: ${origin}`);
        return callback(null, true);
      }
    } catch (e) {
        // Invalid URL, will be blocked below
    }

    // If we get here, the origin is not allowed
    console.warn(`CORS blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id'],
  credentials: true,
  optionsSuccessStatus: 204
};

// Apply CORS middleware to all incoming requests
app.use(cors(corsOptions));

// Explicitly handle pre-flight requests for all routes
app.options('*', cors(corsOptions));
// --- END OF CORS CONFIGURATION ---


// --- MIDDLEWARE SETUP ---
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- API ROUTES ---
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'iptv-backend',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/content', adminContentRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/videos', videosRoutes);
app.use('/api/m3u', m3uRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/manage-vod', vodManagementRoutes);
app.use('/api/admin', migrationRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api', collectionRoutes);

// --- GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
  console.error('An unexpected error occurred:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

export default app;
