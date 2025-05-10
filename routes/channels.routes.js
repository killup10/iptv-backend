// routes/channels.routes.js
import express from "express";
import Channel from "../models/Channel.js";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import getTMDBThumbnail from "../utils/getTMDBThumbnail.js";

const router = express.Router();

// Obtener todos los canales activos (formato limpio)
router.get("/list", async (req, res) => {
  try {
    const channels = await Channel.find({ active: true }).sort({ name: 1 });
    const data = channels.map(c => ({
      id: c._id,
      name: c.name,
      thumbnail: c.logo || "",
      url: c.url,
      category: c.category || "general"
    }));
    res.json(data);
  } catch (error) {
    console.error("Error al obtener canales:", error);
    res.status(500).json({ error: "Error al obtener canales" });
  }
});

// Agregar un canal
router.post("/", verifyToken, isAdmin, async (req, res) => {
  try {
    const { name, url, category, logo } = req.body;
    if (!name || !url) return res.status(400).json({ error: "Nombre y URL son requeridos" });

    const exists = await Channel.findOne({ url });
    if (exists) return res.status(400).json({ error: "Ya existe un canal con esta URL" });

    const thumbnail = logo || (await getTMDBThumbnail(name)) || "";

    const newChannel = new Channel({
      name,
      url,
      category: category || "general",
      logo: thumbnail,
      active: true
    });

    await newChannel.save();
    res.status(201).json({
      id: newChannel._id,
      name: newChannel.name,
      thumbnail: newChannel.logo,
      url: newChannel.url,
      category: newChannel.category
    });
  } catch (error) {
    console.error("Error al crear canal:", error);
    res.status(400).json({ error: "Error al crear canal" });
  }
});

// Actualizar canal
router.put("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const { name, url, category, logo, active } = req.body;
    if (!name || !url) return res.status(400).json({ error: "Nombre y URL son requeridos" });

    const updated = await Channel.findByIdAndUpdate(
      req.params.id,
      {
        name,
        url,
        category: category || "general",
        logo: logo || "",
        active: active !== undefined ? active : true,
        updatedAt: Date.now()
      },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: "Canal no encontrado" });

    res.json({
      id: updated._id,
      name: updated.name,
      thumbnail: updated.logo,
      url: updated.url,
      category: updated.category,
      active: updated.active
    });
  } catch (error) {
    console.error("Error al actualizar canal:", error);
    res.status(400).json({ error: "Error al actualizar canal" });
  }
});

// Eliminar canal
router.delete("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const deleted = await Channel.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Canal no encontrado" });
    res.json({ message: "Canal eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar canal" });
  }
});

export default router;
