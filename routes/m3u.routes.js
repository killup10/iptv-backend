// routes/m3u.routes.js
import express from "express";
import { uploadM3U } from "../controllers/m3u.controller.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Ruta para subir M3U (POST)
router.post("/upload", authMiddleware, uploadM3U);

// Ruta de prueba (opcional)
router.get("/", (req, res) => {
  res.json({ message: "Ruta M3U activa ✅" });
});

export default router;
