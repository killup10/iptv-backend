// iptv-backend/controllers/channel.controller.js
import Channel from "../models/Channel.js";

// --- FUNCIONES PARA USUARIOS (ACCESIBLES A TRAVÉS DE /api/channels/...) ---

export const getPublicChannels = async (req, res, next) => {
  try {
    let query = { active: true };
    if (req.query.featured === 'true') {
        query.isFeatured = true;
    }
    const channels = await Channel.find(query).sort({ name: 1 });
    const data = channels.map(c => ({
      id: c._id, name: c.name, thumbnail: c.logo || "", url: c.url,
      category: c.category || "GENERAL", description: c.description || "",
      requiresPlan: c.requiresPlan || "gplay", isFeatured: c.isFeatured || false
    }));
    res.json(data);
  } catch (error) {
    console.error("Error en channel.controller (getPublicChannels):", error.message);
    res.status(500).json({ error: "Error al obtener la lista de canales" });
  }
};

export const getChannelById = async (req, res, next) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: "Canal no encontrado" });

    const userPlan = req.user?.plan || 'gplay';
    const userRole = req.user?.role;
    const planHierarchy = { 'gplay': 1, 'cinefilo': 2, 'sports': 3, 'premium': 4 }; 
    const channelRequiredPlanLevel = planHierarchy[channel.requiresPlan] || 0;
    const userPlanLevel = planHierarchy[userPlan] || 0;

    if (!channel.active && userRole !== 'admin') {
      return res.status(403).json({ error: "Este canal no está activo actualmente." });
    }
    if (userRole !== 'admin' && channelRequiredPlanLevel > userPlanLevel) {
      return res.status(403).json({ error: `Acceso denegado. Plan '${channel.requiresPlan}' requerido. Tu plan: '${userPlan}'.` });
    }
    res.json({ 
      id: channel._id, _id: channel._id, name: channel.name, url: channel.url,
      logo: channel.logo, thumbnail: channel.logo, category: channel.category,
      description: channel.description || "", active: channel.active,
      isFeatured: channel.isFeatured, requiresPlan: channel.requiresPlan
    });
  } catch (error) {
    console.error(`Error en channel.controller (getChannelById - ${req.params.id}):`, error.message);
    if (error.kind === 'ObjectId') return res.status(400).json({ error: "ID de canal inválido" });
    res.status(500).json({ error: "Error interno al obtener el canal" });
  }
};

export const getMainChannelSections = async (req, res, next) => {
    try {
        const userPlan = req.user?.plan || 'gplay';
        const userRole = req.user?.role;
        // --- ¡IMPORTANTE! PERSONALIZA ESTA LISTA DE SECCIONES ---
        const allDefinedSections = [
            { key: "GPLAY_GENERAL", displayName: "Canales GPlay", requiresPlan: "gplay", categoriesIncluded: ["GENERAL", "NOTICIAS", "INFANTILES", "VARIADOS", "MUSICA", "NOTICIAS BASICAS", "INFANTILES BASICOS", "ENTRETENIMIENTO GENERAL", "SIN CATEGORIA"], order: 1, thumbnailSample: "/img/sections/gplay_general.jpg" },
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
        const planHierarchy = { 'gplay': 1, 'cinefilo': 2, 'sports': 3, 'premium': 4 }; 
        const currentUserPlanLevel = planHierarchy[userPlan] || 0;
        let accessibleSections = (userRole === 'admin') ? allDefinedSections 
            : allDefinedSections.filter(s => (planHierarchy[s.requiresPlan] || 0) <= currentUserPlanLevel);
        res.json(accessibleSections.sort((a, b) => a.order - b.order));
    } catch (error) {
        console.error("Error en channel.controller (getMainChannelSections):", error.message);
        res.status(500).json({ error: "Error al obtener las secciones de canales" });
    }
};

// --- FUNCIONES SOLO PARA ADMINISTRADORES (ACCESIBLES A TRAVÉS DE /api/channels/admin/...) ---

export const getAllChannelsAdmin = async (req, res, next) => {
    try {
        const channels = await Channel.find({}).sort({ name: 1 });
        res.json(channels.map(c => ({
            id: c._id, _id: c._id, name: c.name, url: c.url, logo: c.logo,
            category: c.category, description: c.description, active: c.active,
            isFeatured: c.isFeatured, requiresPlan: c.requiresPlan,
            createdAt: c.createdAt, updatedAt: c.updatedAt
        })));
    } catch (error) {
        console.error("Error en channel.controller (getAllChannelsAdmin):", error.message);
        res.status(500).json({ error: "Error al obtener todos los canales para administración" });
    }
};

export const createChannelAdmin = async (req, res, next) => {
  try {
    const { name, url, category, logo, description, active, isFeatured, requiresPlan } = req.body;
    if (!name || !url) return res.status(400).json({ error: "Nombre y URL requeridos." });

    const existing = await Channel.findOne({ $or: [{ name: name.trim() }, { url: url.trim() }] });
    if (existing) return res.status(409).json({ error: "Canal con ese nombre o URL ya existe." });

    const newChannel = new Channel({
      name: name.trim(), url: url.trim(), 
      category: category ? category.trim() : "GENERAL",
      logo: logo ? logo.trim() : "", description: description ? description.trim() : "",
      active: active !== undefined ? active : true,
      isFeatured: isFeatured || false,
      requiresPlan: requiresPlan || "gplay",
    });
    const savedChannel = await newChannel.save();
    res.status(201).json(savedChannel);
  } catch (error) {
    console.error("Error en channel.controller (createChannelAdmin):", error.message);
    if (error.name === 'ValidationError') return res.status(400).json({ error: "Error de validación", details: error.errors });
    res.status(500).json({ error: "Error interno al crear canal." });
  }
};

export const updateChannelAdmin = async (req, res, next) => {
  try {
    const channelId = req.params.id;
    const updatePayload = req.body;
    const updateData = {};
    ['name', 'url', 'logo', 'category', 'description', 'active', 'isFeatured', 'requiresPlan'].forEach(key => {
        if (updatePayload[key] !== undefined) {
            updateData[key] = typeof updatePayload[key] === 'string' ? updatePayload[key].trim() : updatePayload[key];
        }
    });

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No se proporcionaron campos para actualizar." });
    }
    updateData.updatedAt = Date.now();

    const updatedChannel = await Channel.findByIdAndUpdate(channelId, { $set: updateData }, { new: true, runValidators: true });
    if (!updatedChannel) return res.status(404).json({ error: "Canal no encontrado." });
    res.json(updatedChannel);
  } catch (error) {
    console.error(`Error en channel.controller (updateChannelAdmin - ${req.params.id}):`, error.message);
    if (error.name === 'ValidationError') return res.status(400).json({ error: "Error de validación", details: error.errors });
    if (error.kind === 'ObjectId') return res.status(400).json({ error: "ID de canal inválido." });
    res.status(500).json({ error: "Error interno al actualizar canal." });
  }
};

export const deleteChannelAdmin = async (req, res, next) => {
  try {
    const channelId = req.params.id;
    const deletedChannel = await Channel.findByIdAndDelete(channelId);
    if (!deletedChannel) return res.status(404).json({ error: "Canal no encontrado." });
    res.json({ message: "Canal eliminado.", id: channelId });
  } catch (error) {
    console.error(`Error en channel.controller (deleteChannelAdmin - ${req.params.id}):`, error.message);
    if (error.kind === 'ObjectId') return res.status(400).json({ error: "ID de canal inválido." });
    res.status(500).json({ error: "Error interno al eliminar canal." });
  }
};

export const processM3UAdmin = async (req, res, next) => {
    if (!req.file) return res.status(400).json({ error: "No se subió archivo M3U." });
    try {
        const m3uContent = req.file.buffer.toString('utf8');
        const lines = m3uContent.split(/\r?\n/);
        let channelsAdded = 0, channelsUpdated = 0, channelsSkipped = 0;
        let currentChannelInfo = null;

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('#EXTINF:')) {
                currentChannelInfo = { name: '', logo: '', category: 'M3U Import', url: '', description: 'Importado de M3U', active: true, isFeatured: false, requiresPlan: 'gplay' };
                const infoMatch = trimmedLine.match(/#EXTINF:-?\d+([^,]*),(.*)/);
                if (infoMatch && infoMatch[2]) currentChannelInfo.name = infoMatch[2].trim();
                const attributesString = infoMatch && infoMatch[1] ? infoMatch[1].trim() : "";
                const logoMatch = attributesString.match(/tvg-logo="([^"]+)"/);
                if (logoMatch && logoMatch[1]) currentChannelInfo.logo = logoMatch[1];
                const groupMatch = attributesString.match(/group-title="([^"]+)"/);
                if (groupMatch && groupMatch[1]) currentChannelInfo.category = groupMatch[1].trim() || "M3U Import";
            } else if (currentChannelInfo && trimmedLine && !trimmedLine.startsWith('#')) {
                currentChannelInfo.url = trimmedLine;
                if (currentChannelInfo.name && currentChannelInfo.url) {
                    try {
                        const existingChannel = await Channel.findOne({ url: currentChannelInfo.url });
                        if (existingChannel) {
                            let needsUpdate = false;
                            if (existingChannel.name !== currentChannelInfo.name && currentChannelInfo.name) { existingChannel.name = currentChannelInfo.name; needsUpdate = true; }
                            if (currentChannelInfo.logo && existingChannel.logo !== currentChannelInfo.logo) { existingChannel.logo = currentChannelInfo.logo; needsUpdate = true; }
                            if (currentChannelInfo.category && existingChannel.category !== currentChannelInfo.category) { existingChannel.category = currentChannelInfo.category; needsUpdate = true; }
                            if (needsUpdate) {
                                existingChannel.updatedAt = Date.now();
                                await existingChannel.save();
                                channelsUpdated++;
                            } else {
                                channelsSkipped++;
                            }
                        } else {
                            const newChannel = new Channel(currentChannelInfo);
                            await newChannel.save();
                            channelsAdded++;
                        }
                    } catch (dbError) {
                        console.warn("Error procesando canal de M3U:", currentChannelInfo.name, dbError.message);
                        channelsSkipped++;
                    }
                }
                currentChannelInfo = null;
            }
        }
        res.json({ message: `M3U procesado: ${channelsAdded} añadidos, ${channelsUpdated} actualizados, ${channelsSkipped} omitidos.`, channelsAdded, channelsUpdated, channelsSkipped });
    } catch (error) {
        console.error("Error al procesar M3U:", error.message);
        res.status(500).json({ error: "Error interno procesando M3U." });
    }
};