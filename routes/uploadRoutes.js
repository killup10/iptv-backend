import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadController } from '../controllers/uploadController.js';
import { verifyToken, isAdmin } from '../middlewares/verifyToken.js';

const router = express.Router();

// Configurar multer para la subida de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/') // Asegúrate de que este directorio exista
  },
  filename: function (req, file, cb) {
    // Generar nombre único para el archivo
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Filtro para archivos
const fileFilter = (req, file, cb) => {
  // Aceptar solo archivos .m3u
  if (path.extname(file.originalname).toLowerCase() === '.m3u') {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos .m3u'));
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // Límite de 10MB
  }
});

// Ruta para subida masiva de archivos
router.post('/bulk-upload', 
  verifyToken,
  isAdmin,
  upload.single('file'),
  uploadController.handleBulkUpload
);

// Ruta para verificar duplicados
router.get('/check-duplicate',
  verifyToken,
  isAdmin,
  uploadController.checkDuplicate
);

// Manejador de errores de multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'El archivo es demasiado grande. Máximo 10MB'
      });
    }
    return res.status(400).json({
      success: false,
      message: 'Error en la subida del archivo',
      error: error.message
    });
  }
  
  if (error.message === 'Solo se permiten archivos .m3u') {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  next(error);
});

export default router;
