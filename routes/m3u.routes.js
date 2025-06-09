// routes/m3u.routes.js
import express from "express";
import multer from "multer";
import { uploadM3U } from "../controllers/m3u.controller.js";
import { verifyToken } from "../middlewares/verifyToken.js";

const router = express.Router();

// Configurar multer para manejar archivos
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB límite
});

// Subir un archivo M3U (masivo)
router.post("/bulk-upload", verifyToken, upload.single('file'), uploadM3U);

export default router;
