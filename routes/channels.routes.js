// routes/channels.routes.js
import express from "express";
import Channel from "../models/Channel.js";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import getTMDBThumbnail from "../utils/getTMDBThumbnail.js"; // ⬅️ Importamos la utilidad

const router = express.Router();

// Obtener todos los canales
router.get("/list", async (req, res) => {
  try {
    console.log("Buscando canales activos...");
    const channels = await Channel.find({ active: true }).sort({ name: 1 });
    console.log(`Se encontraron ${channels.length} canales`);
    res.json(channels);
  } catch (error) {
    console.error('Error al obtener canales:', error);
    res.status(500).json({ error: 'Error al obtener canales' });
  }
});

// Agregar un nuevo canal (solo admin)
router.post("/", verifyToken, isAdmin, async (req, res) => {
  try {
    const { name, url, category, logo } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: 'Nombre y URL son requeridos' });
    }

    const existingChannel = await Channel.findOne({ url });
    if (existingChannel) {
      return res.status(400).json({ error: 'Ya existe un canal con esta URL' });
    }

    // 🔍 Buscar thumbnail automáticamente si no se envió logo
    const thumbnail = logo || await getTMDBThumbnail(name);

    const newChannel = new Channel({
      name,
      url,
      category: category || 'general',
      logo: thumbnail
    });

    await newChannel.save();
    res.status(201).json(newChannel);
  } catch (error) {
    console.error('Error al crear canal:', error);
    res.status(400).json({ error: 'Error al crear canal' });
  }
});

// Eliminar un canal (solo admin)
router.delete("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const channel = await Channel.findByIdAndDelete(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: 'Canal no encontrado' });
    }
    res.json({ message: 'Canal eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar canal:', error);
    res.status(500).json({ error: 'Error al eliminar canal' });
  }
});

// Actualizar un canal (solo admin)
router.put("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const { name, url, category, logo, active } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: 'Nombre y URL son requeridos' });
    }

    const updatedChannel = await Channel.findByIdAndUpdate(
      req.params.id,
      {
        name,
        url,
        category: category || 'general',
        logo: logo || '',
        active: active !== undefined ? active : true,
        updatedAt: Date.now()
      },
      { new: true }
    );

    if (!updatedChannel) {
      return res.status(404).json({ error: 'Canal no encontrado' });
    }

    res.json(updatedChannel);
  } catch (error) {
    console.error('Error al actualizar canal:', error);
    res.status(400).json({ error: 'Error al actualizar canal' });
  }
});

export default router;
