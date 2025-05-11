// routes/channels.routes.js
import express from "express";
import Channel from "../models/Channel.js"; // Asegúrate que la ruta a tu modelo Channel sea correcta
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import getTMDBThumbnail from "../utils/getTMDBThumbnail.js"; // Usado en POST /

const router = express.Router();

// Obtener todos los canales activos (PÚBLICO para Home, y para usuarios logueados)
// Frontend usa esto para 'fetchFeaturedChannels' y 'fetchUserChannels'
router.get("/list", async (req, res) => {
  try {
    // Si req.user existe (de un verifyToken opcional que podrías añadir aquí en el futuro),
    // podrías filtrar por plan del usuario. Por ahora, devuelve todos los activos.
    const channels = await Channel.find({ active: true }).sort({ name: 1 });
    const data = channels.map(c => ({
      id: c._id, // Frontend espera 'id'
      name: c.name,
      thumbnail: c.logo || "", // Frontend usa 'thumbnail'
      url: c.url,
      category: c.category || "general"
    }));
    res.json(data);
  } catch (error) {
    console.error("Error al obtener canales (/list):", error);
    res.status(500).json({ error: "Error al obtener canales" });
  }
});

// NUEVO: Obtener un canal específico por ID (Protegido, para la página de reproducción Watch.jsx)
router.get("/id/:id", verifyToken, async (req, res) => { // Usamos /id/:id para ser más específicos
  try {
    const channel = await Channel.findById(req.params.id);
    
    if (!channel) {
      return res.status(404).json({ error: "Canal no encontrado" });
    }
    if (!channel.active && (!req.user || req.user.role !== 'admin')) { // Solo admins pueden ver canales inactivos
        return res.status(403).json({ error: "Este canal no está activo actualmente." });
    }

    // Devolver el objeto canal completo o mapearlo si es necesario
    // Watch.jsx espera: id, name (o title/titulo), url, description (opcional)
    res.json({ 
      id: channel._id,
      _id: channel._id, // A veces útil tener ambos
      name: channel.name, // Watch.jsx usa 'name' para el título
      url: channel.url,
      logo: channel.logo, // O thumbnail si prefieres ese nombre consistentemente
      thumbnail: channel.logo,
      category: channel.category,
      description: channel.description || "", // Añade description si tu modelo Channel lo tiene
      active: channel.active
    });
  } catch (error) {
    console.error(`Error al obtener canal por ID (${req.params.id}):`, error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: "ID de canal inválido" });
    }
    res.status(500).json({ error: "Error interno al obtener el canal" });
  }
});

// Agregar un canal (Admin)
router.post("/", verifyToken, isAdmin, async (req, res) => {
  try {
    const { name, url, category, logo, description } = req.body; // Añadido description
    if (!name || !url) {
      return res.status(400).json({ error: "Nombre y URL son requeridos" });
    }

    const exists = await Channel.findOne({ url });
    if (exists) {
      return res.status(400).json({ error: "Ya existe un canal con esta URL" });
    }

    let finalLogo = logo;
    if (!finalLogo && name) { // Solo busca en TMDB si no se provee logo y hay nombre
        try {
            finalLogo = await getTMDBThumbnail(name, 'tv'); // 'tv' para canales
        } catch (tmdbError) {
            console.warn(`TMDB (crear canal): No se pudo obtener logo para "${name}": ${tmdbError.message}`);
            finalLogo = "";
        }
    }

    const newChannel = new Channel({
      name,
      url,
      category: category || "general",
      logo: finalLogo || "",
      description: description || "", // Añadido description
      active: true,
      // user: req.user.id, // Si tu modelo Channel tiene campo 'user' y quieres asociar quién lo creó
    });

    const savedChannel = await newChannel.save();
    // Devolver el canal en el formato que el frontend podría esperar (similar a GET /id/:id)
    res.status(201).json({
      id: savedChannel._id,
      name: savedChannel.name,
      thumbnail: savedChannel.logo,
      url: savedChannel.url,
      category: savedChannel.category,
      description: savedChannel.description,
      active: savedChannel.active
    });
  } catch (error) {
    console.error("Error al crear canal:", error);
    // Si hay error de validación de Mongoose, podría ser más específico
    if (error.name === 'ValidationError') {
        return res.status(400).json({ error: "Error de validación", details: error.errors });
    }
    res.status(400).json({ error: "Error al crear canal" });
  }
});

// Actualizar canal (Admin)
router.put("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const { name, url, category, logo, active, description } = req.body; // Añadido description
    // Podrías querer validar que al menos name y url vengan
    // if (!name || !url) return res.status(400).json({ error: "Nombre y URL son requeridos" });

    const updateData = { ...req.body, updatedAt: Date.now() };
    // Si logo es undefined en req.body, no lo actualices para no borrarlo si no se envía.
    // Si se envía un string vacío "", sí se actualiza (borra el logo).
    // Similar para otros campos opcionales.
    // Mongoose por defecto solo actualiza los campos presentes en el objeto de actualización.

    const updatedChannel = await Channel.findByIdAndUpdate(
      req.params.id,
      updateData, // Pasa todos los campos del body que coincidan con el schema
      { new: true } // Devuelve el documento actualizado
    );

    if (!updatedChannel) {
      return res.status(404).json({ error: "Canal no encontrado" });
    }

    res.json({
      id: updatedChannel._id,
      name: updatedChannel.name,
      thumbnail: updatedChannel.logo,
      url: updatedChannel.url,
      category: updatedChannel.category,
      description: updatedChannel.description,
      active: updatedChannel.active
    });
  } catch (error) {
    console.error(`Error al actualizar canal (${req.params.id}):`, error);
    if (error.name === 'ValidationError') {
        return res.status(400).json({ error: "Error de validación", details: error.errors });
    }
    if (error.kind === 'ObjectId') {
        return res.status(400).json({ error: "ID de canal inválido" });
    }
    res.status(500).json({ error: "Error al actualizar canal" });
  }
});

// Eliminar canal (Admin)
router.delete("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const deleted = await Channel.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Canal no encontrado" });
    res.json({ message: "Canal eliminado correctamente" });
  } catch (error) {
    console.error(`Error al eliminar canal (${req.params.id}):`, error);
    if (error.kind === 'ObjectId') {
        return res.status(400).json({ error: "ID de canal inválido" });
    }
    res.status(500).json({ error: "Error al eliminar canal" });
  }
});

export default router;