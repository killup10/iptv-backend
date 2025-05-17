// iptv-backend/controllers/channel.controller.js
import Channel from "../models/Channel.js"; // Asegúrate que tu modelo Channel.js tenga los campos:
                                        // name, url, logo, category, description, active, isFeatured, requiresPlan

// --- FUNCIONES PARA USUARIOS (ACCESIBLES A TRAVÉS DE /api/channels/...) ---

// GET /api/channels/list (Para fetchUserChannels en frontend)
export const getPublicChannels = async (req, res, next) => {
  try {
    let query = { active: true };
    // Nota: El filtrado real por plan del usuario para esta lista general
    // usualmente se haría en el frontend después de obtener esta lista base,
    // o el backend necesitaría conocer el plan del usuario (si verifyToken se usa aquí y es opcional).
    // Por simplicidad, devolvemos todos los activos y el frontend puede filtrar más.
    // O si esta ruta SIEMPRE requiere token, puedes usar req.user.plan aquí.
    // Para fetchFeaturedChannels, el frontend podría filtrar localmente por `isFeatured: true`.

    const channels = await Channel.find(query).sort({ name: 1 });

    const data = channels.map(c => ({
      id: c._id,
      name: c.name,
      thumbnail: c.logo || "", 
      url: c.url,
      category: c.category || "GENERAL", // Asegurar un valor por defecto
      description: c.description || "",
      requiresPlan: c.requiresPlan || "gplay", // Enviar para lógica del frontend
      isFeatured: c.isFeatured || false       // Enviar para lógica del frontend
    }));
    res.json(data);
  } catch (error) {
    console.error("Error en channel.controller (getPublicChannels):", error);
    res.status(500).json({ error: "Error al obtener la lista de canales" });
  }
};

// GET /api/channels/id/:id (Para la página Watch.jsx)
export const getChannelById = async (req, res, next) => {
  try {
    const channel = await Channel.findById(req.params.id);
    
    if (!channel) {
      return res.status(404).json({ error: "Canal no encontrado" });
    }

    // Lógica de acceso:
    const userPlan = req.user?.plan || 'gplay'; // Asumir plan base si no hay usuario o plan en el token
    const userRole = req.user?.role;
    // Define la jerarquía de tus planes. Ajusta los números si es necesario.
    const planHierarchy = { 'gplay': 1, 'cinefilo': 2, 'sports': 3, 'premium': 4 }; 
    
    const channelRequiredPlanLevel = planHierarchy[channel.requiresPlan] || 0; // Nivel 0 si el plan del canal no se reconoce
    const userPlanLevel = planHierarchy[userPlan] || 0; // Nivel 0 si el plan del usuario no se reconoce

    if (!channel.active && userRole !== 'admin') { // Solo admins pueden ver canales inactivos
        return res.status(403).json({ error: "Este canal no está activo actualmente." });
    }
    // Si el canal requiere un plan superior al del usuario (y no es admin)
    if (userRole !== 'admin' && channelRequiredPlanLevel > userPlanLevel) {
        return res.status(403).json({ error: `Acceso denegado. Se requiere plan '${channel.requiresPlan}' o superior. Tu plan es '${userPlan}'.` });
    }

    res.json({ 
      id: channel._id,
      _id: channel._id,
      name: channel.name,
      url: channel.url,
      logo: channel.logo,
      thumbnail: channel.logo, // Frontend a menudo espera 'thumbnail'
      category: channel.category,
      description: channel.description || "",
      active: channel.active,
      isFeatured: channel.isFeatured,
      requiresPlan: channel.requiresPlan
    });
  } catch (error) {
    console.error(`Error en channel.controller (getChannelById - ${req.params.id}):`, error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: "ID de canal inválido" });
    }
    res.status(500).json({ error: "Error interno al obtener el canal" });
  }
};

// GET /api/channels/main-sections (Para LiveTVPage.jsx)
export const getMainChannelSections = async (req, res, next) => {
    try {
        const userPlan = req.user?.plan || 'gplay'; // Plan base si no hay usuario/plan en el token
        const userRole = req.user?.role;

        // --- ¡IMPORTANTE! PERSONALIZA ESTA LISTA ---
        // Define tus secciones y las categorías de canales que pertenecen a cada una.
        // 'categoriesIncluded' debe coincidir con los valores que guardas en el campo 'category' de tus canales.
        const allDefinedSections = [
            { key: "GPLAY_GENERAL", displayName: "Canales GPlay", requiresPlan: "gplay", categoriesIncluded: ["GENERAL", "NOTICIAS", "INFANTILES", "VARIADOS", "MUSICA"], order: 1, thumbnailSample: "/img/sections/gplay_general.jpg" },
            { key: "CINEFILO_PLUS", displayName: "Cinéfilo Plus", requiresPlan: "cinefilo", categoriesIncluded: ["PELIS", "SERIES", "CULTURA", "DOCUMENTALES"], order: 2, thumbnailSample: "/img/sections/cinefilo_plus.jpg" },
            { key: "SPORTS_TOTAL", displayName: "Deportes Total", requiresPlan: "sports", categoriesIncluded: ["DEPORTES", "EVENTOS DEPORTIVOS"], order: 5, thumbnailSample: "/img/sections/sports_total.jpg" },
            
            // Secciones Premium (pueden ser más específicas)
            { key: "PREMIUM_LOCALES", displayName: "Canales Locales (Premium)", requiresPlan: "premium", categoriesIncluded: ["LOCALES"], order: 10, thumbnailSample: "/img/sections/premium_locales.jpg" },
            { key: "PREMIUM_NOVELAS", displayName: "Novelas (Premium)", requiresPlan: "premium", categoriesIncluded: ["NOVELAS"], order: 11, thumbnailSample: "/img/sections/premium_novelas.jpg" },
            { key: "PREMIUM_VARIADOS_FULL", displayName: "Variados Full (Premium)", requiresPlan: "premium", categoriesIncluded: ["VARIADOS", "VARIADOS PREMIUM", "ENTRETENIMIENTO VIP"], order: 12, thumbnailSample: "/img/sections/premium_variados.jpg" },
            { key: "PREMIUM_CINE_TOTAL", displayName: "Cine Total (Premium)", requiresPlan: "premium", categoriesIncluded: ["PELIS", "PELIS PREMIUM", "ESTRENOS CINE"], order: 13, thumbnailSample: "/img/sections/premium_pelis.jpg" },
            { key: "PREMIUM_INFANTILES_PLUS", displayName: "Infantiles Plus (Premium)", requiresPlan: "premium", categoriesIncluded: ["INFANTILES", "INFANTILES PREMIUM"], order: 14, thumbnailSample: "/img/sections/premium_infantiles.jpg" },
            { key: "PREMIUM_DEPORTES_MAX", displayName: "Deportes Max (Premium)", requiresPlan: "premium", categoriesIncluded: ["DEPORTES", "DEPORTES PREMIUM", "EVENTOS DEPORTIVOS", "FUTBOL TOTAL"], order: 15, thumbnailSample: "/img/sections/premium_deportes.jpg" },
            { key: "PREMIUM_CULTURA_HD", displayName: "Cultura y Documentales HD (Premium)", requiresPlan: "premium", categoriesIncluded: ["CULTURA", "CULTURA PREMIUM", "DOCUMENTALES", "DOCUMENTALES VIP"], order: 16, thumbnailSample: "/img/sections/premium_cultura.jpg" },
            { key: "PREMIUM_INFO_GLOBAL", displayName: "Informativos Global (Premium)", requiresPlan: "premium", categoriesIncluded: ["NOTICIAS", "NOTICIAS INTERNACIONALES", "FINANZAS", "INFORMATIVO"], order: 17, thumbnailSample: "/img/sections/premium_info.jpg" },
        ];

        // Ajusta la jerarquía de tus planes si es diferente
        const planHierarchy = { 'gplay': 1, 'cinefilo': 2, 'sports': 3, 'premium': 4 }; 
        const currentUserPlanLevel = planHierarchy[userPlan] || 0; 

        let accessibleSections = [];
        if (userRole === 'admin') {
            accessibleSections = allDefinedSections; // Admin ve todas las secciones definidas
        } else {
            accessibleSections = allDefinedSections.filter(section => {
                const requiredPlanLevel = planHierarchy[section.requiresPlan] || 0;
                return currentUserPlanLevel >= requiredPlanLevel;
            });
        }
        
        res.json(accessibleSections.sort((a, b) => a.order - b.order));

    } catch (error) {
        console.error("Error en channel.controller (getMainChannelSections):", error);
        res.status(500).json({ error: "Error al obtener las secciones de canales" });
    }
};

// --- FUNCIONES SOLO PARA ADMINISTRADORES (ACCESIBLES A TRAVÉS DE /api/channels/admin/...) ---

// GET /api/channels/admin/list (Para AdminPanel)
export const getAllChannelsAdmin = async (req, res, next) => {
    try {
        const channels = await Channel.find({}).sort({ name: 1 });
        res.json(channels.map(c => ({ // Enviar datos completos para el admin
            id: c._id,
            _id: c._id,
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
        console.error("Error en channel.controller (getAllChannelsAdmin):", error);
        res.status(500).json({ error: "Error al obtener todos los canales para administración" });
    }
};

// POST /api/channels/admin (Para AdminPanel - Crear Canal)
export const createChannelAdmin = async (req, res, next) => {
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
    console.error("Error en channel.controller (createChannelAdmin):", error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: "Error de validación al crear el canal.", details: error.errors });
    }
    res.status(500).json({ error: "Error interno al crear el canal." });
  }
};

// PUT /api/channels/admin/:id (Para AdminPanel - Actualizar Canal)
export const updateChannelAdmin = async (req, res, next) => {
  try {
    const channelId = req.params.id;
    const { name, url, category, logo, description, active, isFeatured, requiresPlan } = req.body;

    const updateData = {
        name, url, category, logo, description, 
        active, isFeatured, requiresPlan,
        updatedAt: Date.now()
    };
    
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    if (Object.keys(updateData).length <= 1 && updateData.updatedAt) { // Solo se está actualizando updatedAt o nada
        // Si solo se envió updatedAt (o nada más), buscamos el canal para devolverlo sin error
        const channelExists = await Channel.findById(channelId);
        if (!channelExists) return res.status(404).json({ error: "Canal no encontrado." });
        // No hay campos válidos para actualizar, pero el canal existe.
        // Podrías devolver el canal existente o un mensaje indicando que no hubo cambios.
        console.log("UpdateChannelAdmin: No se proporcionaron campos válidos para actualizar, devolviendo canal existente.");
        return res.json(channelExists);
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
    console.error(`Error en channel.controller (updateChannelAdmin - ${req.params.id}):`, error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: "Error de validación al actualizar el canal.", details: error.errors });
    }
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: "ID de canal inválido." });
    }
    res.status(500).json({ error: "Error interno al actualizar el canal." });
  }
};

// DELETE /api/channels/admin/:id (Para AdminPanel - Eliminar Canal)
export const deleteChannelAdmin = async (req, res, next) => {
  try {
    const channelId = req.params.id;
    const deletedChannel = await Channel.findByIdAndDelete(channelId);

    if (!deletedChannel) {
      return res.status(404).json({ error: "Canal no encontrado para eliminar." });
    }
    res.json({ message: "Canal eliminado correctamente.", id: channelId });
  } catch (error) {
    console.error(`Error en channel.controller (deleteChannelAdmin - ${req.params.id}):`, error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: "ID de canal inválido." });
    }
    res.status(500).json({ error: "Error interno al eliminar el canal." });
  }
};

// POST /api/channels/admin/process-m3u (Para AdminPanel - Subir M3U)
// Necesitarás multer o similar configurado en tus rutas para manejar file uploads (req.file)
export const processM3UAdmin = async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({ error: "No se subió ningún archivo M3U." });
    }

    // Aquí iría tu lógica para parsear req.file.buffer (o el path si guardas temporalmente)
    // y crear/actualizar canales en la base de datos.
    // Esta lógica puede ser compleja y similar a la que tienes en m3u.controller.js.
    // Por simplicidad, este es un placeholder.

    console.log("processM3UAdmin: Archivo M3U recibido:", req.file.originalname);
    // Ejemplo: const content = req.file.buffer.toString('utf8');
    // parseM3UContentAndSaveChannels(content, req.user.id); // Tu lógica de parseo

    // Simulación de respuesta
    const channelsProcessed = Math.floor(Math.random() * 100); // Simular canales procesados

    res.json({ 
        message: `Archivo M3U "${req.file.originalname}" procesado.`,
        channelsProcessed: channelsProcessed,
        // Podrías devolver más detalles si es necesario
    });
};