// iptv-backend/routes/channels.routes.js
import express from "express";
import Channel from "../models/Channel.js"; // Asegúrate que el modelo esté bien importado
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import multer from "multer";
import mongoose from "mongoose"; // Importa mongoose para isValidObjectId

const router = express.Router();

// Configuración de Multer (la que ya tienes)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
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
router.get("/list", async (req, res) => {
  console.log("BACKEND: /api/channels/list - Solicitud recibida. Query:", req.query);
  try {
    let query = { active: true }; // Por defecto, solo canales activos

    // Filtrar por canales destacados si se especifica
    if (req.query.featured === "true") {
      query.isFeatured = true;
      console.log("BACKEND: /api/channels/list - Filtrando por canales destacados.");
    }

    // Filtrar por categorías si se especifica el parámetro 'categories'
    // El frontend debería enviar las categorías como una lista separada por comas: ?categories=CAT1,CAT2,CAT3
    if (req.query.categories) {
      const categoriesToSearch = req.query.categories.split(',').map(cat => cat.trim()).filter(cat => cat); // Limpia y filtra vacíos
      if (categoriesToSearch.length > 0) {
        query.category = { $in: categoriesToSearch };
        console.log(`BACKEND: /api/channels/list - Filtrando por categorías: ${categoriesToSearch.join(', ')}`);
      }
    }
    // Si necesitas un parámetro 'category' para una sola categoría, puedes añadir:
    // else if (req.query.category) {
    //   query.category = req.query.category;
    //   console.log(`BACKEND: /api/channels/list - Filtrando por categoría: ${req.query.category}`);
    // }


    const channels = await Channel.find(query).sort({ name: 1 });
    console.log(`BACKEND: /api/channels/list - Canales encontrados con filtro actual: ${channels.length}`);

    const data = channels.map((c) => ({
      id: c._id,
      name: c.name,
      thumbnail: c.logo || "",
      url: c.url,
      category: c.category || "GENERAL",
      description: c.description || "",
      requiresPlan: c.requiresPlan || "gplay",
      isFeatured: c.isFeatured || false,
    }));
    res.json(data);
  } catch (err) {
    console.error("Error en GET /api/channels/list:", err.name, err.message, err.stack);
    if (!res.headersSent) {
        res.status(500).json({ error: "Error al obtener canales." });
    }
  }
});

// GET /api/channels/id/:id
router.get("/id/:id", verifyToken, async (req, res) => {
  console.log(`BACKEND: /api/channels/id/${req.params.id} - Solicitud recibida.`);
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        console.log(`BACKEND: /api/channels/id/${req.params.id} - ID inválido.`);
        return res.status(400).json({ error: "ID de canal con formato inválido." });
    }
    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      console.log(`BACKEND: /api/channels/id/${req.params.id} - Canal no encontrado.`);
      return res.status(404).json({ error: "Canal no encontrado" });
    }
    console.log(`BACKEND: /api/channels/id/${req.params.id} - Canal encontrado: ${channel.name}`);

    const userPlan = req.user?.plan || "gplay";
    const userRole = req.user?.role;
    const planHierarchy = { gplay: 1, cinefilo: 2, sports: 3, premium: 4, };
    const channelRequired = planHierarchy[channel.requiresPlan] || 0;
    const userLevel = planHierarchy[userPlan] || 0;

    if (!channel.active && userRole !== "admin") {
      console.log(`BACKEND: /api/channels/id/${req.params.id} - Acceso denegado: Canal inactivo.`);
      return res.status(403).json({ error: "Este canal no está activo actualmente." });
    }
    if (userRole !== "admin" && channelRequired > userLevel) {
      console.log(`BACKEND: /api/channels/id/${req.params.id} - Acceso denegado: Plan insuficiente.`);
      return res.status(403).json({ error: `Acceso denegado. Se requiere plan '${channel.requiresPlan}' o superior. Tu plan es '${userPlan}'.` });
    }

    console.log(`BACKEND: /api/channels/id/${req.params.id} - Enviando datos del canal.`);
    res.json({
      id: channel._id, _id: channel._id, name: channel.name, url: channel.url,
      logo: channel.logo, thumbnail: channel.logo, category: channel.category,
      description: channel.description || "", active: channel.active,
      isFeatured: channel.isFeatured, requiresPlan: channel.requiresPlan,
    });
  } catch (error) {
    console.error(`Error en GET /api/channels/id/${req.params.id}:`, error.name, error.message, error.stack);
    if (!res.headersSent) {
        res.status(500).json({ error: "Error interno al obtener el canal." });
    }
  }
});

// GET /api/channels/main-sections
router.get("/main-sections", verifyToken, async (req, res) => {
  console.log(`BACKEND: /api/channels/main-sections - INICIO DE RUTA. Usuario: ${req.user?.username}, Rol: ${req.user?.role}, Plan: ${req.user?.plan}`);
  try {
    const userPlan = req.user?.plan || "gplay";
    const userRole = req.user?.role;
    const planHierarchy = { gplay: 1, cinefilo: 2, sports: 3, premium: 4 };
    const currentLevel = planHierarchy[userPlan] || 0;
    console.log(`BACKEND: /api/channels/main-sections - UserPlan: ${userPlan}, UserRole: ${userRole}, CurrentLevel: ${currentLevel}`);

    const sections = [
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
    console.log("BACKEND: /api/channels/main-sections - ¿Array 'sections' definido?", Array.isArray(sections) ? `Sí, ${sections.length} elementos.` : "NO, ES UNDEFINED O NO ES UN ARRAY.");

    if (!Array.isArray(sections) || sections.length === 0) {
        console.error("BACKEND: /api/channels/main-sections - ¡EL ARRAY 'sections' NO ESTÁ DEFINIDO CORRECTAMENTE O ESTÁ VACÍO!");
        return res.status(500).json({ error: "Error interno del servidor: configuración de secciones de canales incorrecta." });
    }

    const filteredSections =
      userRole === "admin"
        ? sections
        : sections.filter(
            (s) => (planHierarchy[s.requiresPlan] || 0) <= currentLevel
          );
    console.log(`BACKEND: /api/channels/main-sections - Secciones filtradas: ${filteredSections.length}. Enviando respuesta.`);
    res.json(filteredSections.sort((a, b) => a.order - b.order));

  } catch (err) {
    console.error("Error DENTRO de /api/channels/main-sections:", err.name, err.message, err.stack);
    if (!res.headersSent) {
        res.status(500).json({ error: "Error fatal al obtener las secciones principales de canales." });
    }
  }
});

// --- RUTAS SOLO PARA ADMINISTRADORES ---

router.get("/admin/list", verifyToken, isAdmin, async (req, res) => {
  console.log("BACKEND: /api/channels/admin/list - Solicitud recibida.");
  try {
    const channels = await Channel.find({}).sort({ name: 1 });
    console.log(`BACKEND: /api/channels/admin/list - Canales de admin encontrados: ${channels.length}`);
    res.json(
      channels.map((c) => ({
        id: c._id, _id: c._id, name: c.name, url: c.url, logo: c.logo, category: c.category,
        description: c.description, active: c.active, isFeatured: c.isFeatured,
        requiresPlan: c.requiresPlan, createdAt: c.createdAt, updatedAt: c.updatedAt,
      }))
    );
  } catch (err) {
    console.error("Error en GET /api/channels/admin/list:", err.name, err.message, err.stack);
    if (!res.headersSent) {
      res.status(500).json({ error: "Error al obtener lista completa de canales para admin." });
    }
  }
});

router.post("/admin", verifyToken, isAdmin, async (req, res, next) => {
  console.log("BACKEND: POST /api/channels/admin - Solicitud para crear canal. Body:", req.body);
  try {
    const { name, url, category, logo, description, active, isFeatured, requiresPlan } = req.body;
    if (!name || !url) {
      console.log("BACKEND: POST /api/channels/admin - Faltan nombre o URL.");
      return res.status(400).json({ error: "Nombre y URL son requeridos." });
    }
    const existingChannel = await Channel.findOne({ $or: [{ name }, { url }] });
    if (existingChannel) {
      console.log("BACKEND: POST /api/channels/admin - Canal ya existe con ese nombre o URL:", name);
      return res.status(409).json({ error: "Ya existe un canal con ese nombre o URL." });
    }
    const newChannel = new Channel({
      name, url, category: category || "GENERAL", logo: logo || "", description: description || "",
      active: active !== undefined ? active : true,
      isFeatured: isFeatured || false,
      requiresPlan: requiresPlan || "gplay",
    });
    const savedChannel = await newChannel.save();
    console.log("BACKEND: POST /api/channels/admin - Canal creado exitosamente:", savedChannel.name);
    res.status(201).json(savedChannel);
  } catch (error) {
    console.error("Error en POST /api/channels/admin:", error.name, error.message, error.stack);
    if (error.name === 'ValidationError') {
        return res.status(400).json({ error: "Error de validación al crear canal.", details: error.errors });
    }
    // Pasa al manejador de errores global si no es un ValidationError manejado aquí
    if (!res.headersSent) {
        next(error);
    }
  }
});

router.put("/admin/:id", verifyToken, isAdmin, async (req, res, next) => {
  const channelId = req.params.id;
  console.log(`BACKEND: PUT /api/channels/admin/${channelId} - Solicitud para actualizar canal. Body:`, req.body);
  try {
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
        console.log(`BACKEND: PUT /api/channels/admin/${channelId} - ID inválido.`);
        return res.status(400).json({ error: "ID de canal inválido." });
    }
    const updateData = req.body;
    delete updateData._id; // No permitir actualizar el _id

    // Lógica para evitar que campos se establezcan a null o undefined si no se envían explícitamente para borrar
    // (El comportamiento de $set es actualizar solo los campos provistos, así que esto es más para control fino)
    // Object.keys(updateData).forEach(key => {
    //     if (updateData[key] === undefined) {
    //         delete updateData[key];
    //     }
    // });

    const updatedChannel = await Channel.findByIdAndUpdate(
      channelId,
      { $set: updateData, updatedAt: Date.now() }, // $set actualiza solo los campos en updateData
      { new: true, runValidators: true }
    );
    if (!updatedChannel) {
      console.log(`BACKEND: PUT /api/channels/admin/${channelId} - Canal no encontrado.`);
      return res.status(404).json({ error: "Canal no encontrado para actualizar." });
    }
    console.log(`BACKEND: PUT /api/channels/admin/${channelId} - Canal actualizado:`, updatedChannel.name);
    res.json(updatedChannel);
  } catch (error) {
    console.error(`Error en PUT /api/channels/admin/${channelId}:`, error.name, error.message, error.stack);
    if (error.name === 'ValidationError') {
        return res.status(400).json({ error: "Error de validación al actualizar canal.", details: error.errors });
    }
    if (!res.headersSent) {
        next(error);
    }
  }
});

router.delete("/admin/:id", verifyToken, isAdmin, async (req, res, next) => {
  const channelId = req.params.id;
  console.log(`BACKEND: DELETE /api/channels/admin/${channelId} - Solicitud para eliminar canal.`);
  try {
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
        console.log(`BACKEND: DELETE /api/channels/admin/${channelId} - ID inválido.`);
        return res.status(400).json({ error: "ID de canal inválido." });
    }
    const deletedChannel = await Channel.findByIdAndDelete(channelId);
    if (!deletedChannel) {
      console.log(`BACKEND: DELETE /api/channels/admin/${channelId} - Canal no encontrado.`);
      return res.status(404).json({ error: "Canal no encontrado para eliminar." });
    }
    console.log(`BACKEND: DELETE /api/channels/admin/${channelId} - Canal eliminado:`, deletedChannel.name);
    res.json({ message: "Canal eliminado correctamente.", id: channelId });
  } catch (error) {
    console.error(`Error en DELETE /api/channels/admin/${channelId}:`, error.name, error.message, error.stack);
    if (!res.headersSent) {
        next(error);
    }
  }
});

router.post(
  "/admin/process-m3u",
  verifyToken,
  isAdmin,
  upload.single('m3uFile'),
  async (req, res, next) => {
    console.log("BACKEND: /api/channels/admin/process-m3u - INICIO DE RUTA.");
    if (!req.file) {
      console.log("BACKEND: /api/channels/admin/process-m3u - No se subió archivo M3U.");
      return res.status(400).json({ error: "No se subió ningún archivo M3U." });
    }
    try {
      const m3uContent = req.file.buffer.toString('utf8');
      console.log(`BACKEND: /api/channels/admin/process-m3u - Procesando M3U: ${req.file.originalname}, Tamaño: ${req.file.size} bytes.`);
      
      let channelsFoundInFile = 0;
      let channelsAdded = 0;
      let channelsUpdated = 0;
      let currentChannelInfo = {};
      const lines = m3uContent.split('\n');
      console.log(`BACKEND: /api/channels/admin/process-m3u - Número de líneas en M3U: ${lines.length}`);

      for (const line of lines) {
        if (line.startsWith('#EXTINF:')) {
          channelsFoundInFile++;
          currentChannelInfo = { 
            name: '', logo: '', category: 'M3U Import', url: '',
            description: 'Importado de M3U', active: true, isFeatured: false, requiresPlan: 'gplay'
          };
          const infoMatch = line.match(/#EXTINF:-?\d+([^,]*),(.*)/);
          if (infoMatch && infoMatch[2]) currentChannelInfo.name = infoMatch[2].trim();
          const logoMatch = line.match(/tvg-logo="([^"]+)"/);
          if (logoMatch && logoMatch[1]) currentChannelInfo.logo = logoMatch[1];
          const groupMatch = line.match(/group-title="([^"]+)"/);
          if (groupMatch && groupMatch[1]) currentChannelInfo.category = groupMatch[1].trim() || "M3U Import";
        } else if (line.trim() && !line.startsWith('#') && currentChannelInfo.name && line.trim().startsWith('http')) {
          currentChannelInfo.url = line.trim();
          if (currentChannelInfo.name && currentChannelInfo.url) {
            try {
              const existingChannel = await Channel.findOne({ url: currentChannelInfo.url });
              if (existingChannel) {
                let isChanged = false;
                if (existingChannel.name !== currentChannelInfo.name) { existingChannel.name = currentChannelInfo.name; isChanged = true; }
                if (existingChannel.logo !== currentChannelInfo.logo && currentChannelInfo.logo) { existingChannel.logo = currentChannelInfo.logo; isChanged = true; }
                if (existingChannel.category !== currentChannelInfo.category && currentChannelInfo.category) { existingChannel.category = currentChannelInfo.category; isChanged = true; }
                if (isChanged) {
                  existingChannel.updatedAt = Date.now();
                  await existingChannel.save();
                  channelsUpdated++;
                }
              } else {
                const newChannel = new Channel(currentChannelInfo);
                await newChannel.save();
                channelsAdded++;
              }
            } catch (dbError) {
              console.error("Error guardando/actualizando canal desde M3U:", currentChannelInfo.name, dbError.message, dbError.stack);
            }
          }
          currentChannelInfo = {};
        }
      }
      console.log(`BACKEND: /api/channels/admin/process-m3u - Finalizado. Encontrados: ${channelsFoundInFile}, Añadidos: ${channelsAdded}, Actualizados: ${channelsUpdated}`);
      res.json({ 
        message: `Archivo M3U "${req.file.originalname}" procesado.`,
        channelsFoundInFile, channelsAdded, channelsUpdated
      });
    } catch (error) {
      console.error("Error CRÍTICO procesando M3U en /admin/process-m3u:", error.name, error.message, error.stack);
      if (!res.headersSent) {
          res.status(500).json({ error: "Error interno fatal al procesar el archivo M3U." });
      }
    }
  }
);

export default router;