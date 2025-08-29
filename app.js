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
import deviceRoutes from './routes/device.routes.js'; // Assuming you have this from your repo

// --- BASIC SETUP ---
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// --- CORS CONFIGURATION (APPLY BEFORE ALL ROUTES) ---
const allowedOrigins = [
  // Development environments
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',

  // Production Frontend URLs
  'https://play.teamg.store',
  'https://iptv-frontend-iota.vercel.app', // Old Vercel URL (can be kept for now)
  
  // Cloudflare URL from your screenshot
  'https://iptv-frontend-clean.pages.dev',

  // Mobile App (Capacitor) origins
  'http://localhost',
  'capacitor://localhost',
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    // Helpful debug logging for incoming origins
    console.log('CORS origin check:', origin);

    // Direct whitelist match
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }

    // Allow file:// origins (common for mobile WebViews / Capacitor / Cordova) and common app schemes
    if (origin.startsWith('file:') || origin.startsWith('ionic:') || origin.startsWith('android-webview:') || origin.startsWith('capacitor:')) {
      return callback(null, true);
    }

    // Allow subdomains of trusted hosts (e.g., *.teamg.store, *.pages.dev)
    try {
      const parsed = new URL(origin);
      const hostname = parsed.hostname || '';
      if (hostname.endsWith('teamg.store') || hostname.endsWith('pages.dev') || hostname.endsWith('vercel.app')) {
        return callback(null, true);
      }
    } catch (err) {
      // If origin is not a valid URL, continue to block below
    }

    console.warn('CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id'],
  credentials: true,
  optionsSuccessStatus: 204 // For legacy browser support
};

// Apply CORS middleware to all incoming requests
app.use(cors(corsOptions));

// Explicitly handle pre-flight requests for all routes
app.options('*', cors(corsOptions));
// --- END OF CORS CONFIGURATION ---


// --- MIDDLEWARE SETUP ---
// Increase payload size limits for large requests like M3U uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// --- API ROUTES ---
// Health check route to verify the server is running
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'iptv-backend',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Register all your application routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/content', adminContentRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/videos', videosRoutes);
app.use('/api/m3u', m3uRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/manage-vod', vodManagementRoutes);
app.use('/api/admin', migrationRoutes); // Note: might conflict with other /api/admin routes if paths overlap
app.use('/api/progress', progressRoutes);
app.use('/api/devices', deviceRoutes); // Assuming you have device management routes


// --- GLOBAL ERROR HANDLER ---
// This should be the last middleware
app.use((err, req, res, next) => {
  console.error('An unexpected error occurred:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

export default app;
