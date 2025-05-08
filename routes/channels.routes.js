// routes/channels.routes.js
import express from "express";
import Channel from "../models/Channel.js";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import getTMDBThumbnail from "../utils/getTMDBThumbnail.js";

const router = express.Router();

// Obtener todos los canales activos (mapea a { id, name, thumbnail, url })
router.get("/list", async (req, res) => {
  try {
    const channels = await Channel.find({ active: true }).sort({ name: 1 });
    const payload = channels.map(c => ({
      id: c._id,
      name: c.name,
      thumbnail: c.logo || "",
      url: c.url
    }));
    res.json(payload);
  } catch (error) {
    console.error("Error al obtener canales:", error);
    res.status(500).json({ error: "Error al obtener canales" });
  }
});

// Agregar un nuevo canal (solo admin)
router.post("/", verifyToken, isAdmin, async (req, res) => {
  try {
    const { name, url, category, logo } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: "Nombre y URL son requeridos" });
    }

    const existing = await Channel.findOne({ url });
    if (existing) {
      return res.status(400).json({ error: "Ya existe un canal con esta URL" });
    }

    const thumbnail = logo || (await getTMDBThumbnail(name)) || "";
    const newChannel = new Channel({
      name,
      url,
      category: category || "general",
      logo: thumbnail,
      active: true
    });
    await newChannel.save();

    // Devolver formato limpio
    res.status(201).json({
      id: newChannel._id,
      name: newChannel.name,
      thumbnail: newChannel.logo,
      url: newChannel.url
    });
  } catch (error) {
    console.error("Error al crear canal:", error);
    res.status(400).json({ error: "Error al crear canal" });
  }
});

// Eliminar un canal (solo admin)
router.delete("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const channel = await Channel.findByIdAndDelete(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: "Canal no encontrado" });
    }
    res.json({ message: "Canal eliminado correctamente" });
  } catch (error) {
    console.error("Error al eliminar canal:", error);
    res.status(500).json({ error: "Error al eliminar canal" });
  }
});

// Actualizar un canal (solo admin)
router.put("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const { name, url, category, logo, active } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: "Nombre y URL son requeridos" });
    }

    const thumbnail = logo || "";
    const updated = await Channel.findByIdAndUpdate(
      req.params.id,
      {
        name,
        url,
        category: category || "general",
        logo: thumbnail,
        active: active !== undefined ? active : true,
        updatedAt: Date.now()
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Canal no encontrado" });
    }

    res.json({
      id: updated._id,
      name: updated.name,
      thumbnail: updated.logo,
      url: updated.url,
      active: updated.active
    });
  } catch (error) {
    console.error("Error al actualizar canal:", error);
    res.status(400).json({ error: "Error al actualizar canal" });
  }
});

export default router;
