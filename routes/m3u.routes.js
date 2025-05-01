import express from "express";
import { uploadM3U, listM3U } from "../controllers/m3u.controller.js";
import { authenticateToken } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Subir archivo M3U
router.post("/upload", authenticateToken, uploadM3U);

// 🔹 Nueva ruta: listar archivos M3U
router.get("/list", authenticateToken, listM3U);

// Ruta de prueba
router.get("/", (req, res) => {
  res.json({ message: "Ruta M3U activa ✅" });
});

export default router;
