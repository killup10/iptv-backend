// iptv-backend/routes/channels.routes.js
import express from "express";
import Channel from "../models/Channel.js";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import multer from "multer";
import mongoose from "mongoose";

const router = express.Router();

// Configuración de Multer (sin cambios)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "application/octet-stream" ||
      file.mimetype === "audio/mpegurl" ||
      file.mimetype === "application/vnd.apple.mpegurl" ||
      file.originalname.endsWith(".m3u") ||
      file.originalname.endsWith(".m3u8")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de archivo no permitido. Solo .m3u o .m3u8."), false);
    }
  },
});

// --- RUTAS PARA USUARIOS ---

// GET /api/channels/list
// Filtra por ?section=NOMBRE_DE_LA_SECCION que define el admin
// También puede filtrar por ?featured=true para la Home.
router.get("/list", async (req, res) => {
  console.log("BACKEND: /api/channels/list - Solicitud. Query:", JSON.stringify(req.query));
  try {
    let query = { active: true, isPubliclyVisible: true };

    if (req.query.featured === "true") {
      query.isFeatured = true;
      delete query.isPubliclyVisible; // Los destacados se muestran independientemente
      console.log("BACKEND: /api/channels/list - Filtrando por destacados.");
    }

    // Filtrar por la sección especificada
    if (req.query.section) {
      if (req.query.section.toLowerCase() === 'todos') {
        // "Todos" significa no filtrar por sección específica (ya tenemos active:true, isPubliclyVisible:true)
        console.log(`BACKEND: /api/channels/list - Mostrando todos los canales (activos y visibles).`);
      } else {
        query.section = req.query.section; // Búsqueda exacta por esa sección
        console.log(`BACKEND: /api/channels/list - Filtrando por sección: ${req.query.section}`);
      }
    }

    const channels = await Channel.find(query).sort({ name: 1 });
    console.log(`BACKEND: /api/channels/list - Canales encontrados: ${channels.length}`);

    const data = channels.map((c) => ({
      id: c._id,
      name: c.name,
      thumbnail: c.logo || "",
      url: c.url,
      section: c.section || "General", // Campo 'section'
      description: c.description || "",
      requiresPlan: c.requiresPlan || ["gplay"],
      isFeatured: c.isFeatured || false,
      // isPubliclyVisible ya está implícito por el filtro, no es necesario enviarlo si no se usa en UI para esto
    }));
    res.json(data);
  } catch (err) {
    console.error("Error en GET /api/channels/list:", err.name, err.message, err.stack);
    if (!res.headersSent) res.status(500).json({ error: "Error al obtener canales." });
  }
});

// GET /api/channels/id/:id (PARA ACCEDER/REPRODUCIR UN CANAL)
// La lógica de acceso multiplan y visibilidad se mantiene aquí.
router.get("/id/:id", verifyToken, async (req, res) => {
  console.log(`BACKEND: /api/channels/id/${req.params.id} - Solicitud por usuario: ${req.user?.username}`);
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: "ID de canal inválido." });
    }
    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: "Canal no encontrado" });
    }
    console.log(`BACKEND: /api/channels/id/${req.params.id} - Encontrado: ${channel.name}, Planes Req: [${(channel.requiresPlan || []).join(',')}]`);

    const userPlan = req.user?.plan;
    const userRole = req.user?.role;

    if (!channel.active && userRole !== "admin") {
      return res.status(403).json({ error: "Este canal no está activo." });
    }

    let canAccess = false;
    if (userRole === 'admin') canAccess = true;
    else if (channel.requiresPlan && channel.requiresPlan.includes('free_preview')) canAccess = true;
    else if (userPlan && Array.isArray(channel.requiresPlan) && channel.requiresPlan.includes(userPlan)) canAccess = true;
    // Lógica de jerarquía de planes (opcional, si premium puede ver sports, etc.)
    // const planHierarchy = { 'gplay': 1, 'cinefilo': 2, 'sports': 3, 'premium': 4 };
    // if (!canAccess && userPlan && Array.isArray(channel.requiresPlan)) {
    //     const userLevel = planHierarchy[userPlan] || 0;
    //     const channelMinLevel = Math.min(...channel.requiresPlan.map(rp => planHierarchy[rp] || Infinity));
    //     if (userLevel >= channelMinLevel) { // Si el nivel del usuario es igual o mayor al nivel mínimo del canal
    //          canAccess = true;
    //          console.log(`BACKEND: /api/channels/id/${req.params.id} - Acceso permitido por jerarquía de plan.`);
    //     }
    // }

    if (!canAccess) {
      return res.status(403).json({
        error: `Acceso denegado. Planes requeridos: ${(channel.requiresPlan || ['N/A']).join(', ')}. Tu plan: '${userPlan || 'ninguno'}'.`
      });
    }
    res.json({
      id: channel._id, name: channel.name, url: channel.url, logo: channel.logo,
      section: channel.section, description: channel.description || "", active: channel.active,
      isFeatured: channel.isFeatured, requiresPlan: channel.requiresPlan,
    });
  } catch (error) {
    console.error(`Error en GET /api/channels/id/${req.params.id}:`, error.name, error.message, error.stack);
    if (!res.headersSent) res.status(500).json({ error: "Error al obtener el canal." });
  }
});

// NUEVA RUTA: GET /api/channels/sections - Para que el frontend obtenga la lista de secciones únicas
router.get("/sections", async (req, res) => {
  console.log("BACKEND: /api/channels/sections - Solicitud para obtener lista de secciones únicas.");
  try {
    // Obtener todas las 'section' distintas de los canales activos y públicamente visibles
    const distinctSections = await Channel.distinct("section", { active: true, isPubliclyVisible: true });
    // Filtrar null o undefined y asegurar que sean strings no vacíos
    const validSections = distinctSections.filter(s => s && typeof s === 'string' && s.trim() !== '').sort();
    
    console.log(`BACKEND: /api/channels/sections - Secciones únicas encontradas: ${validSections.length}`, validSections);
    res.json(["Todos", ...validSections]); // Añadir "Todos" para el filtro del frontend
  } catch (error) {
    console.error("Error en GET /api/channels/sections:", error.name, error.message, error.stack);
    if (!res.headersSent) {
      res.status(500).json({ error: "Error al obtener lista de secciones." });
    }
  }
});

// --- RUTAS SOLO PARA ADMINISTRADORES ---
router.get("/admin/list", verifyToken, isAdmin, async (req, res) => {
  console.log("BACKEND: /api/channels/admin/list - Solicitud.");
  try {
    const channels = await Channel.find({}).sort({ name: 1 });
    console.log(`BACKEND: /api/channels/admin/list - Canales admin: ${channels.length}`);
    res.json(
      channels.map((c) => ({
        id: c._id, _id: c._id, name: c.name, url: c.url, logo: c.logo, section: c.section,
        description: c.description, active: c.active, isFeatured: c.isFeatured,
        requiresPlan: c.requiresPlan, isPubliclyVisible: c.isPubliclyVisible,
        createdAt: c.createdAt, updatedAt: c.updatedAt,
      }))
    );
  } catch (err) {
    console.error("Error GET /api/channels/admin/list:", err.name, err.message, err.stack);
    if (!res.headersSent) res.status(500).json({ error: "Error al obtener canales admin." });
  }
});

router.post("/admin", verifyToken, isAdmin, async (req, res, next) => {
  console.log("BACKEND: POST /api/channels/admin - Crear canal. Body:", JSON.stringify(req.body));
  try {
    const { name, url, section, logo, description, active, isFeatured, requiresPlan, isPubliclyVisible } = req.body;
    if (!name || !url || !section) {
      return res.status(400).json({ error: "Nombre, URL y Sección son requeridos." });
    }
    const existingChannel = await Channel.findOne({ $or: [{ name }, { url }] });
    if (existingChannel) return res.status(409).json({ error: "Canal ya existe (nombre o URL)." });
    
    const newChannel = new Channel({
      name, url, section, logo: logo || "", description: description || "",
      active: active !== undefined ? active : true,
      isFeatured: isFeatured || false,
      requiresPlan: Array.isArray(requiresPlan) && requiresPlan.length > 0 ? requiresPlan : ["gplay"],
      isPubliclyVisible: isPubliclyVisible === undefined ? true : isPubliclyVisible,
    });
    const savedChannel = await newChannel.save();
    console.log("BACKEND: POST /api/channels/admin - Canal creado:", savedChannel.name);
    res.status(201).json(savedChannel);
  } catch (error) {
    console.error("Error POST /api/channels/admin:", error.name, error.message, error.stack);
    if (error.name === 'ValidationError') return res.status(400).json({ error: "Error de validación.", details: error.errors });
    if (!res.headersSent) next(error);
  }
});

router.put("/admin/:id", verifyToken, isAdmin, async (req, res, next) => {
  const channelId = req.params.id;
  console.log(`BACKEND: PUT /api/channels/admin/${channelId} - Actualizar. Body:`, JSON.stringify(req.body));
  try {
    if (!mongoose.Types.ObjectId.isValid(channelId)) return res.status(400).json({ error: "ID inválido." });
    
    const updateData = req.body;
    delete updateData._id;
    if (updateData.hasOwnProperty('requiresPlan')) {
        if (!Array.isArray(updateData.requiresPlan) || updateData.requiresPlan.length === 0) {
            updateData.requiresPlan = ["gplay"];
        }
    }
    if (updateData.hasOwnProperty('section') && (!updateData.section || updateData.section.trim() === '')) {
        updateData.section = "General"; // Default si la sección se envía vacía
    }


    const updatedChannel = await Channel.findByIdAndUpdate(
      channelId,
      { $set: updateData, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );
    if (!updatedChannel) return res.status(404).json({ error: "Canal no encontrado." });
    
    console.log(`BACKEND: PUT /api/channels/admin/${channelId} - Actualizado: ${updatedChannel.name}`);
    res.json(updatedChannel);
  } catch (error) {
    console.error(`Error PUT /api/channels/admin/${channelId}:`, error.name, error.message, error.stack);
    if (error.name === 'ValidationError') return res.status(400).json({ error: "Error de validación.", details: error.errors });
    if (!res.headersSent) next(error);
  }
});

router.delete("/admin/:id", verifyToken, isAdmin, async (req, res, next) => {
  const channelId = req.params.id;
  console.log(`BACKEND: DELETE /api/channels/admin/${channelId} - Eliminar canal.`);
  try {
    if (!mongoose.Types.ObjectId.isValid(channelId)) return res.status(400).json({ error: "ID inválido." });
    const deletedChannel = await Channel.findByIdAndDelete(channelId);
    if (!deletedChannel) return res.status(404).json({ error: "Canal no encontrado." });
    console.log(`BACKEND: DELETE /api/channels/admin/${channelId} - Eliminado:`, deletedChannel.name);
    res.json({ message: "Canal eliminado.", id: channelId });
  } catch (error) {
    console.error(`Error DELETE /api/channels/admin/${channelId}:`, error.name, error.message, error.stack);
    if (!res.headersSent) next(error);
  }
});

router.post("/admin/process-m3u", verifyToken, isAdmin, upload.single('m3uFile'), async (req, res, next) => {
  console.log("BACKEND: /api/channels/admin/process-m3u - INICIO.");
  if (!req.file) return res.status(400).json({ error: "No se subió M3U." });
  try {
    const m3uContent = req.file.buffer.toString('utf8');
    console.log(`BACKEND: /api/channels/admin/process-m3u - Procesando: ${req.file.originalname}`);
    let channelsFound = 0, channelsAdded = 0, channelsUpdated = 0;
    let currentInfo = {};
    const lines = m3uContent.split('\n');

    for (const line of lines) {
      if (line.startsWith('#EXTINF:')) {
        channelsFound++;
        currentInfo = { name: '', logo: '', section: 'M3U Import', url: '', description: 'Importado de M3U', active: true, isFeatured: false, requiresPlan: ['gplay'], isPubliclyVisible: true };
        const infoMatch = line.match(/#EXTINF:-?\d+([^,]*),(.*)/);
        if (infoMatch && infoMatch[2]) currentInfo.name = infoMatch[2].trim();
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        if (logoMatch && logoMatch[1]) currentInfo.logo = logoMatch[1];
        const groupMatch = line.match(/group-title="([^"]+)"/);
        if (groupMatch && groupMatch[1]) currentInfo.section = groupMatch[1].trim() || "M3U Import"; // Usa group-title como 'section'

      } else if (line.trim() && !line.startsWith('#') && currentInfo.name && line.trim().startsWith('http')) {
        currentInfo.url = line.trim();
        if (currentInfo.name && currentInfo.url) {
          try {
            const existing = await Channel.findOne({ url: currentInfo.url });
            if (existing) {
              let changed = false;
              if (existing.name !== currentInfo.name) { existing.name = currentInfo.name; changed = true; }
              if (existing.logo !== currentInfo.logo && currentInfo.logo) { existing.logo = currentInfo.logo; changed = true; }
              if (existing.section !== currentInfo.section && currentInfo.section) { existing.section = currentInfo.section; changed = true; }
              if (changed) { existing.updatedAt = Date.now(); await existing.save(); channelsUpdated++; }
            } else {
              const newChannel = new Channel(currentInfo);
              await newChannel.save(); channelsAdded++;
            }
          } catch (dbError) { console.error("Error M3U DB:", currentInfo.name, dbError.message); }
        }
        currentInfo = {};
      }
    }
    console.log(`BACKEND: /api/channels/admin/process-m3u - Fin. Encontrados:${channelsFound}, Añadidos:${channelsAdded}, Actualizados:${channelsUpdated}`);
    res.json({ message: `M3U procesado.`, channelsFoundInFile: channelsFound, channelsAdded, channelsUpdated });
  } catch (error) {
    console.error("Error CRÍTICO M3U:", error.name, error.message, error.stack);
    if (!res.headersSent) res.status(500).json({ error: "Error al procesar M3U." });
  }
});

export default router;