// routes/m3u.routes.js
import express from "express";
const router = express.Router();

// Ruta de prueba
router.get("/", (req, res) => {
  res.json({ message: "Ruta M3U activa ✅" });
});

export default router;
