// 📁 backend/routes/adminContent.routes.js
import express from "express";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import Content from "../models/content.model.js"; // model para VOD y canales

const router = express.Router();

// POST /api/admin-content/vod
router.post("/vod", verifyToken, isAdmin, async (req, res) => {
  const { title, url, type } = req.body;
  if (!title || !url || !type) return res.status(400).json({ error: "Faltan campos" });

  try {
    const content = await Content.create({ title, url, type });
    res.json({ success: true, content });
  } catch (err) {
    res.status(500).json({ error: "Error al guardar el contenido" });
  }
});

// POST /api/admin-content/series
router.post("/series", verifyToken, isAdmin, async (req, res) => {
  const { title, url } = req.body;
  if (!title || !url) return res.status(400).json({ error: "Faltan campos" });

  try {
    const content = await Content.create({ title, url, type: "series" });
    res.json({ success: true, content });
  } catch (err) {
    res.status(500).json({ error: "Error al guardar el contenido" });
  }
});

// GET /api/admin-content/series
router.get("/series", verifyToken, isAdmin, async (req, res) => {
  const content = await Content.find({ type: "series" }).sort({ createdAt: -1 });
  res.json(content);
});


// GET /api/admin-content
router.get("/", verifyToken, isAdmin, async (req, res) => {
  const content = await Content.find().sort({ createdAt: -1 });
  res.json(content);
});

// DELETE /api/admin-content/:id
router.delete("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    await Content.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar" });
  }
});

export default router;
