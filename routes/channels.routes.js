// iptv-backend/routes/channels.routes.js
import express from "express";
import Channel from "../models/Channel.js";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import multer from "multer"; // Para manejar subida de archivos M3U

const router = express.Router();

// Configuración de Multer para subida de archivos en memoria
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Límite de 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "application/octet-stream" || 
            file.mimetype === "audio/mpegurl" || 
            file.mimetype === "application/vnd.apple.mpegurl" || 
            file.originalname.endsWith('.m3u') || 
            file.originalname.endsWith('.m3u8')) {
            cb(null, true);
        } else {
            cb(new Error("Tipo de archivo no permitido para M3U. Solo .m3u o .m3u8."), false);
        }
    }
});

// --- RUTAS PARA USUARIOS (prefijo /api/channels/...) ---

// GET /api/channels/list 
// Usado por fetchUserChannels y fetchFeaturedChannels (frontend filtrará por isFeatured si es necesario)
router.get("/list", async (req, res) => {
  try {
    let query = { active: true };
    // Si se pasa un parámetro ?featured=true, filtrar por canales destacados.
    if (req.query.featured === 'true') {
        query.isFeatured = true;
    }

    const channels = await Channel.find(query).sort({ name: 1 });

    const data = channels.map(c => ({
      id: c._id,
      name: c.name,
      thumbnail: c.logo || "", 
      url: c.url,
      category: c.category || "GENERAL",
      description: c.description || "",
      requiresPlan: c.requiresPlan || "gplay",
      isFeatured: c.isFeatured || false
    }));
    res.json(data);
  } catch (error) {
    console.error("Error al obtener canales (/list):", error);
    res.status(500).json({ error: "Error al obtener canales" });
  }
});

// GET /api/channels/id/:id (Para la página Watch.jsx)
router.get("/id/:id", verifyToken, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    
    if (!channel) {
      return res.status(404).json({ error: "Canal no encontrado" });
    }

    const userPlan = req.user?.plan || 'gplay';
    const userRole = req.user?.role;
    const planHierarchy = { 'gplay': 1, 'cinefilo': 2, 'sports': 3, 'premium': 4 }; 
    
    const channelRequiredPlanLevel = planHierarchy[channel.requiresPlan] || 0;
    const userPlanLevel = planHierarchy[userPlan] || 0;

    if (!channel.active && userRole !== 'admin') {
        return res.status(403).json({ error: "Este canal no está activo actualmente." });
    }
    if (userRole !== 'admin' && channelRequiredPlanLevel > userPlanLevel) {
        return res.status(403).json({ error: `Acceso denegado. Se requiere plan '${channel.requiresPlan}' o superior. Tu plan es '${userPlan}'.` });
    }

    res.json({ 
      id: channel._id,
      _id: channel._id,
      name: channel.name,
      url: channel.url,
      logo: channel.logo,
      thumbnail: channel.logo,
      category: channel.category,
      description: channel.description || "",
      active: channel.active,
      isFeatured: channel.isFeatured,
      requiresPlan: channel.requiresPlan
    });
  } catch (error) {
    console.error(`Error al obtener canal por ID (${req.params.id}):`, error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: "ID de canal inválido" });
    }
    res.status(500).json({ error: "Error interno al obtener el canal" });
  }
});

// GET /api/channels/main-sections (Para LiveTVPage.jsx)
router.get("/main-sections", verifyToken, async (req, res) => {
    try {
        const userPlan = req.user?.plan || 'gplay';
        const userRole = req.user?.role;

        // --- ¡IMPORTANTE! PERSONALIZA ESTA LISTA DE SECCIONES ---
        const allDefinedSections = [
            { key: "GPLAY_GENERAL", displayName: "Canales GPlay", requiresPlan: "gplay", categoriesIncluded: ["GENERAL", "NOTICIAS", "INFANTILES", "VARIADOS", "MUSICA", "NOTICIAS BASICAS", "INFANTILES BASICOS", "ENTRETENIMIENTO GENERAL"], order: 1, thumbnailSample: "/img/sections/gplay_general.jpg" },
            { key: "CINEFILO_PLUS", displayName: "Cinéfilo Plus", requiresPlan: "cinefilo", categoriesIncluded: ["PELIS", "SERIES", "CULTURA", "DOCUMENTALES"], order: 2, thumbnailSample: "/img/sections/cinefilo_plus.jpg" },
            { key: "SPORTS_TOTAL", displayName: "Deportes Total", requiresPlan: "sports", categoriesIncluded: ["DEPORTES", "EVENTOS DEPORTIVOS"], order: 5, thumbnailSample: "/img/sections/sports_total.jpg" },
            { key: "PREMIUM_LOCALES", displayName: "Canales Locales (Premium)", requiresPlan: "premium", categoriesIncluded: ["LOCALES"], order: 10, thumbnailSample: "/img/sections/premium_locales.jpg" },
            { key: "PREMIUM_NOVELAS", displayName: "Novelas (Premium)", requiresPlan: "premium", categoriesIncluded: ["NOVELAS"], order: 11, thumbnailSample: "/img/sections/premium_novelas.jpg" },
            { key: "PREMIUM_VARIADOS_FULL", displayName: "Variados Full (Premium)", requiresPlan: "premium", categoriesIncluded: ["VARIADOS PREMIUM", "ENTRETENIMIENTO VIP"], order: 12, thumbnailSample: "/img/sections/premium_variados.jpg" },
            { key: "PREMIUM_CINE_TOTAL", displayName: "Cine Total (Premium)", requiresPlan: "premium", categoriesIncluded: ["PELIS PREMIUM", "ESTRENOS CINE"], order: 13, thumbnailSample: "/img/sections/premium_pelis.jpg" },
            { key: "PREMIUM_INFANTILES_PLUS", displayName: "Infantiles Plus (Premium)", requiresPlan: "premium", categoriesIncluded: ["INFANTILES PREMIUM"], order: 14, thumbnailSample: "/img/sections/premium_infantiles.jpg" },
            { key: "PREMIUM_DEPORTES_MAX", displayName: "Deportes Max (Premium)", requiresPlan: "premium", categoriesIncluded: ["DEPORTES", "DEPORTES PREMIUM", "EVENTOS DEPORTIVOS", "FUTBOL TOTAL"], order: 15, thumbnailSample: "/img/sections/premium_deportes.jpg" },
            { key: "PREMIUM_CULTURA_HD", displayName: "Cultura y Documentales HD (Premium)", requiresPlan: "premium", categoriesIncluded: ["CULTURA PREMIUM", "DOCUMENTALES VIP"], order: 16, thumbnailSample: "/img/sections/premium_cultura.jpg" },
            { key: "PREMIUM_INFO_GLOBAL", displayName: "Informativos Global (Premium)", requiresPlan: "premium", categoriesIncluded: ["NOTICIAS INTERNACIONALES", "FINANZAS", "INFORMATIVO"], order: 17, thumbnailSample: "/img/sections/premium_info.jpg" },
        ];
        // Ajusta la jerarquía de tus planes si es diferente
        const planHierarchy = { 'gplay': 1, 'cinefilo': 2, 'sports': 3, 'premium': 4 }; 
        const currentUserPlanLevel = planHierarchy[userPlan] || 0;

        let accessibleSections = [];
        if (userRole === 'admin') {
            accessibleSections = allDefinedSections;
        } else {
            accessibleSections = allDefinedSections.filter(section => {
                const requiredPlanLevel = planHierarchy[section.requiresPlan] || 0;
                return currentUserPlanLevel >= requiredPlanLevel;
            });
        }
        
        res.json(accessibleSections.sort((a, b) => a.order - b.order));
    } catch (error) {
        console.error("Error al obtener secciones principales de canales:", error);
        res.status(500).json({ error: "Error al obtener las secciones de canales" });
    }
});

// --- RUTAS SOLO PARA ADMINISTRADORES (prefijo /api/channels/admin/...) ---

// GET /api/channels/admin/list (Para AdminPanel)
router.get("/admin/list", verifyToken, isAdmin, async (req, res) => {
    try {
        const channels = await Channel.find({}).sort({ name: 1 });
        res.json(channels.map(c => ({ // Enviar datos completos para el admin
            id: c._id,
            _id: c._id, // Incluir _id también puede ser útil
            name: c.name,
            url: c.url,
            logo: c.logo,
            category: c.category,
            description: c.description,
            active: c.active,
            isFeatured: c.isFeatured,
            requiresPlan: c.requiresPlan,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt
        })));
    } catch (error) {
        console.error("Error al obtener todos los canales para admin:", error);
        res.status(500).json({ error: "Error al obtener la lista completa de canales" });
    }
});

// POST /api/channels/admin (Para AdminPanel - Crear Canal)
router.post("/admin", verifyToken, isAdmin, async (req, res) => {
  try {
    const { name, url, category, logo, description, active, isFeatured, requiresPlan } = req.body;
    
    if (!name || !url) {
      return res.status(400).json({ error: "El nombre y la URL del canal son requeridos." });
    }

    const existingChannel = await Channel.findOne({ $or: [{ name }, { url }] });
    if (existingChannel) {
      return res.status(409).json({ error: `Ya existe un canal con ese nombre o URL.` });
    }

    const newChannel = new Channel({
      name,
      url,
      category: category || "GENERAL",
      logo: logo || "",
      description: description || "",
      active: active !== undefined ? active : true,
      isFeatured: isFeatured || false,
      requiresPlan: requiresPlan || "gplay",
    });

    const savedChannel = await newChannel.save();
    res.status(201).json(savedChannel); // Devolver el documento completo guardado
  } catch (error) {
    console.error("Error al crear canal (admin):", error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: "Error de validación al crear el canal.", details: error.errors });
    }
    res.status(500).json({ error: "Error interno al crear el canal." });
  }
});

// PUT /api/channels/admin/:id (Para AdminPanel - Actualizar Canal)
router.put("/admin/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const channelId = req.params.id;
    const { name, url, category, logo, description, active, isFeatured, requiresPlan } = req.body;

    const updateData = {
        name, url, category, logo, description, 
        active, isFeatured, requiresPlan,
        updatedAt: Date.now()
    };
    
    Object.keys(updateData).forEach(key => {
        // Permitir enviar false, pero no undefined (a menos que quieras borrar el campo, lo cual es raro para PUT)
        if (updateData[key] === undefined) {
            delete updateData[key];
        }
    });
    
    // No actualizar si solo se envía updatedAt o si updateData está vacío
    if (Object.keys(updateData).length <= 1 && updateData.updatedAt) {
        const channelExists = await Channel.findById(channelId);
        if (!channelExists) return res.status(404).json({ error: "Canal no encontrado." });
        return res.json(channelExists); // Devuelve el canal sin cambios si no hay nada que actualizar
    }

    const updatedChannel = await Channel.findByIdAndUpdate(
      channelId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedChannel) {
      return res.status(404).json({ error: "Canal no encontrado para actualizar." });
    }

    res.json(updatedChannel); // Devolver el documento completo actualizado
  } catch (error) {
    console.error(`Error al actualizar canal (${req.params.id}):`, error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: "Error de validación al actualizar canal.", details: error.errors });
    }
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: "ID de canal inválido." });
    }
    res.status(500).json({ error: "Error interno al actualizar el canal." });
  }
});

// DELETE /api/channels/admin/:id (Para AdminPanel - Eliminar Canal)
router.delete("/admin/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const channelId = req.params.id;
    const deletedChannel = await Channel.findByIdAndDelete(channelId);

    if (!deletedChannel) {
      return res.status(404).json({ error: "Canal no encontrado para eliminar." });
    }
    res.json({ message: "Canal eliminado correctamente.", id: channelId });
  } catch (error) {
    console.error(`Error al eliminar canal (${req.params.id}):`, error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: "ID de canal inválido." });
    }
    res.status(500).json({ error: "Error interno al eliminar el canal." });
  }
});

// POST /api/channels/admin/process-m3u (Para AdminPanel - Subir M3U)
router.post("/admin/process-m3u", verifyToken, isAdmin, upload.single('m3uFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No se subió ningún archivo M3U." });
    }
    try {
        const m3uContent = req.file.buffer.toString('utf8');
        // Aquí va tu lógica compleja para parsear el contenido M3U
        // y luego iterar para crear o actualizar canales en la base de datos.
        // Esto es solo un placeholder de la lógica.
        
        const lines = m3uContent.split('\n');
        let channelsProcessed = 0;
        let channelsAdded = 0;
        let channelsUpdated = 0;
        let currentChannelInfo = {};

        for (const line of lines) {
            if (line.startsWith('#EXTINF:')) {
                // Reset para nuevo canal
                currentChannelInfo = { name: '', logo: '', category: 'M3U Import', url: '' };
                
                const infoMatch = line.match(/#EXTINF:-?\d+([^,]*),(.*)/);
                if (infoMatch && infoMatch[2]) {
                    currentChannelInfo.name = infoMatch[2].trim();
                }

                // Intentar extraer tvg-logo (logo)
                const logoMatch = line.match(/tvg-logo="([^"]+)"/);
                if (logoMatch && logoMatch[1]) {
                    currentChannelInfo.logo = logoMatch[1];
                }
                
                // Intentar extraer group-title (category)
                const groupMatch = line.match(/group-title="([^"]+)"/);
                if (groupMatch && groupMatch[1]) {
                    currentChannelInfo.category = groupMatch[1].trim() || "M3U Import";
                }

            } else if (line.trim() && !line.startsWith('#') && currentChannelInfo.name) {
                currentChannelInfo.url = line.trim();
                
                // Lógica para guardar/actualizar el canal
                if (currentChannelInfo.name && currentChannelInfo.url) {
                    channelsProcessed++;
                    try {
                        const existingChannel = await Channel.findOne({ url: currentChannelInfo.url });
                        if (existingChannel) {
                            // Actualizar si es necesario (ej. nombre, logo, categoría)
                            let  isChanged = false;
                            if(existingChannel.name !== currentChannelInfo.name) {existingChannel.name = currentChannelInfo.name; isChanged = true;}
                            if(existingChannel.logo !== currentChannelInfo.logo && currentChannelInfo.logo) {existingChannel.logo = currentChannelInfo.logo; isChanged = true;}
                            if(existingChannel.category !== currentChannelInfo.category && currentChannelInfo.category) {existingChannel.category = currentChannelInfo.category; isChanged = true;}
                            
                            if(isChanged) {
                                existingChannel.updatedAt = Date.now();
                                await existingChannel.save();
                                channelsUpdated++;
                            }
                        } else {
                            const newChannel = new Channel({
                                name: currentChannelInfo.name,
                                url: currentChannelInfo.url,
                                logo: currentChannelInfo.logo,
                                category: currentChannelInfo.category,
                                description: "Importado de M3U",
                                active: true,
                                isFeatured: false, // Por defecto no destacado
                                requiresPlan: 'gplay' // Plan base por defecto
                            });
                            await newChannel.save();
                            channelsAdded++;
                        }
                    } catch (dbError) {
                        console.error("Error guardando canal de M3U:", currentChannelInfo.name, dbError.message);
                    }
                }
                currentChannelInfo = {}; // Reset para el siguiente
            }
        }

        res.json({ 
            message: `Archivo M3U "${req.file.originalname}" procesado.`,
            channelsFoundInFile: channelsProcessed, // O un contador de #EXTINF encontrados
            channelsAdded: channelsAdded,
            channelsUpdated: channelsUpdated
        });

    } catch (error) {
        console.error("Error al procesar archivo M3U:", error);
        res.status(500).json({ error: "Error interno al procesar el archivo M3U." });
    }
});


export default router;