// iptv-backend/controllers/channel.controller.js
import Channel from "../models/Channel.js"; // Asegúrate que la ruta a tu modelo Channel sea correcta
import mongoose from "mongoose";
import readline from 'readline'; // Para procesar M3U línea por línea
import { Readable } from 'stream';  // Para procesar M3U desde buffer

// Para la ruta GET /api/channels/list (Pública, usada por LiveTVPage y Home para destacados)
export const getPublicChannels = async (req, res, next) => {
  console.log("CTRL: getPublicChannels - Query:", JSON.stringify(req.query));
  try {
    let queryConditions = { active: true }; // Por defecto, solo canales activos

    // Si es para la sección de destacados, también deben ser visibles públicamente
    // y marcados como destacados.
    if (req.query.featured === "true") {
      queryConditions.isFeatured = true;
      queryConditions.isPubliclyVisible = true; 
    } else {
      // Para listados generales (no destacados), solo los públicamente visibles
      queryConditions.isPubliclyVisible = true;
      if (req.query.section && req.query.section.toLowerCase() !== 'todos') {
        queryConditions.section = req.query.section;
      }
    }

    const channels = await Channel.find(queryConditions).sort({ name: 1 }); // Ordena alfabéticamente
    console.log(`CTRL: getPublicChannels - Canales encontrados para query ${JSON.stringify(queryConditions)}: ${channels.length}`);
    
    // Mapeo para el frontend (evita enviar campos innecesarios o sensibles)
    const data = channels.map((c) => ({
      id: c._id,
      name: c.name,
      thumbnail: c.logo || "/img/placeholder-thumbnail.png", // Envía un placeholder si no hay logo
      section: c.section || "General",
      // No envíes la URL del stream aquí para rutas públicas de listado
      // description: c.description || "", // Opcional
      // requiresPlan: c.requiresPlan || ["gplay"], // Opcional, el acceso se verifica al reproducir
      // isFeatured: c.isFeatured || false,
      // isPubliclyVisible: c.isPubliclyVisible === undefined ? true : c.isPubliclyVisible,
    }));
    res.json(data);
  } catch (err) {
    console.error("Error en CTRL:getPublicChannels:", err.message);
    next(err); // Pasa al manejador de errores global
  }
};

// Para la ruta GET /api/channels/sections (botones de filtro en LiveTVPage)
export const getChannelFilterSections = async (req, res, next) => {
  console.log("CTRL: getChannelFilterSections - Solicitud.");
  try {
    // Obtener secciones distintas solo de canales activos y públicamente visibles
    const distinctSections = await Channel.distinct("section", { 
      active: true, 
      isPubliclyVisible: true 
    });
    // Filtrar secciones nulas o vacías y ordenar
    const validSections = distinctSections
      .filter(s => s && typeof s === 'string' && s.trim() !== '')
      .sort((a,b) => a.localeCompare(b));
    
    console.log(`CTRL: getChannelFilterSections - Secciones encontradas: ${validSections.length}`, validSections);
    res.json(["Todos", ...validSections]); // Añade "Todos" al principio
  } catch (error) {
    console.error("Error en CTRL:getChannelFilterSections:", error.message);
    next(error);
  }
};

// Para la ruta GET /api/channels/id/:id (Reproducción, protegida, verifica plan)
export const getChannelByIdForUser = async (req, res, next) => {
  const channelId = req.params.id;
  console.log(`CTRL: getChannelByIdForUser - ID: ${channelId}, Usuario: ${req.user?.username}, Plan Usuario: ${req.user?.plan}`);
  try {
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ error: "ID de canal inválido." });
    }
    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ error: "Canal no encontrado" });
    }

    console.log(`CTRL: getChannelByIdForUser - Canal encontrado: ${channel.name}, Planes Requeridos: ${channel.requiresPlan?.join(', ')}`);

    const userPlan = req.user?.plan || 'gplay'; // Asume 'gplay' como plan básico por defecto
    const userRole = req.user?.role;

    if (!channel.active && userRole !== "admin") {
      return res.status(403).json({ error: "Este canal no está activo." });
    }

    let canAccess = false;
    const planHierarchy = { 'gplay': 1, 'estandar': 2, 'sports': 3, 'cinefilo': 4, 'premium': 5 }; // Define tu jerarquía de planes
    const userLevel = planHierarchy[userPlan] || 0;

    if (userRole === 'admin') {
      canAccess = true;
    } else if (!channel.requiresPlan || channel.requiresPlan.length === 0) {
      // Si el canal no tiene planes específicos, es accesible por cualquier plan (asumiendo que 'gplay' es el mínimo)
      if (userLevel >= planHierarchy['gplay']) canAccess = true; 
    } else {
      // El usuario debe tener al menos uno de los planes requeridos por el canal,
      // o un plan superior según la jerarquía.
      canAccess = channel.requiresPlan.some(reqPlanKey => {
          const requiredLevel = planHierarchy[reqPlanKey] || Infinity; // Si el plan no está en la jerarquía, hacerlo muy restrictivo
          return userLevel >= requiredLevel;
      });
    }

    if (!canAccess) {
      console.log(`CTRL: getChannelByIdForUser - Acceso DENEGADO para ${req.user?.username} (plan: ${userPlan}) al canal ${channel.name}`);
      return res.status(403).json({
        error: `Acceso denegado. Tu plan '${userPlan}' no permite acceder a este canal.`
      });
    }
    
    console.log(`CTRL: getChannelByIdForUser - Acceso PERMITIDO para ${req.user?.username} al canal ${channel.name}`);
    // Devuelve todos los datos del canal, incluyendo la URL, ya que el acceso está permitido
    res.json({
      id: channel._id,
      name: channel.name,
      url: channel.url, // URL real del stream
      logo: channel.logo,
      section: channel.section,
      description: channel.description || "",
      active: channel.active,
      isFeatured: channel.isFeatured,
      requiresPlan: channel.requiresPlan,
      isPubliclyVisible: channel.isPubliclyVisible,
    });
  } catch (error) {
    console.error(`Error en CTRL:getChannelByIdForUser para ID ${channelId}:`, error.message);
    next(error);
  }
};

// --- CONTROLADORES PARA RUTAS DE ADMINISTRACIÓN ---

// GET /api/channels/admin/list (Para AdminPanel)
export const getAllChannelsAdmin = async (req, res, next) => {
  console.log("CTRL: getAllChannelsAdmin - Solicitud para listar todos los canales (admin).");
  try {
    // Para el panel de admin, usualmente queremos todos los canales, sin filtros de 'active' o 'isPubliclyVisible'
    // a menos que el admin explícitamente los aplique desde la UI (lo cual no es común para una lista de gestión).
    // Puedes añadir paginación aquí si la lista es muy grande.
    const channels = await Channel.find({}).sort({ createdAt: -1 }); // Ordena por más recientes primero

    console.log(`CTRL: getAllChannelsAdmin - Canales encontrados: ${channels.length}`);
    // Devuelve los datos completos del canal para el panel de administración
    res.json(channels.map(c => ({
        id: c._id, // El frontend usa 'id'
        _id: c._id, // También útil tener _id
        name: c.name,
        url: c.url,
        logo: c.logo,
        description: c.description,
        section: c.section,
        active: c.active,
        isFeatured: c.isFeatured,
        requiresPlan: c.requiresPlan,
        isPubliclyVisible: c.isPubliclyVisible,
        createdAt: c.createdAt, // Útil para el admin
        updatedAt: c.updatedAt  // Útil para el admin
    })));
  } catch (error) {
    console.error("Error en CTRL:getAllChannelsAdmin:", error.message);
    next(error);
  }
};

// POST /api/channels/admin (o /api/channels/admin/create)
export const createChannelAdmin = async (req, res, next) => {
  console.log("CTRL: createChannelAdmin - Datos recibidos:", req.body);
  try {
    const { name, url, logo, description, section, active, isFeatured, requiresPlan, isPubliclyVisible } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: "Nombre y URL del canal son obligatorios." });
    }

    // Validación de planes (si requiresPlan es un array y tiene enums en el modelo)
    if (requiresPlan && Array.isArray(requiresPlan)) {
        const validEnumPlans = Channel.schema.path('requiresPlan').caster?.enumValues;
        if (validEnumPlans) { // Solo valida si el enum está definido en el schema
            for (const plan of requiresPlan) {
                if (plan && !validEnumPlans.includes(plan)) {
                    return res.status(400).json({ error: `Plan inválido en la lista: '${plan}'. Válidos: ${validEnumPlans.join(', ')}` });
                }
            }
        }
    }


    const newChannel = new Channel({
      name,
      url,
      logo: logo || undefined, // Si es opcional y puede ser string vacío
      description: description || undefined,
      section: section || "General",
      active: active !== undefined ? active : true,
      isFeatured: isFeatured || false,
      requiresPlan: requiresPlan || [], // Asegura que sea un array
      isPubliclyVisible: isPubliclyVisible !== undefined ? isPubliclyVisible : true,
      user: req.user.id // Asocia el canal con el admin que lo crea
    });

    const savedChannel = await newChannel.save();
    console.log("CTRL: createChannelAdmin - Canal guardado:", savedChannel._id);
    res.status(201).json(savedChannel);
  } catch (error) {
    console.error("Error en CTRL:createChannelAdmin:", error.message, error.stack);
    if (error.name === 'ValidationError') {
        return res.status(400).json({ error: error.message });
    }
    next(error);
  }
};

// PUT /api/channels/admin/:id
export const updateChannelAdmin = async (req, res, next) => {
  const channelId = req.params.id;
  console.log(`CTRL: updateChannelAdmin - ID: ${channelId}, Datos:`, req.body);
  try {
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ error: "ID de canal inválido." });
    }

    const { name, url, logo, description, section, active, isFeatured, requiresPlan, isPubliclyVisible } = req.body;
    
    // Validación de planes
    if (requiresPlan && Array.isArray(requiresPlan)) {
        const validEnumPlans = Channel.schema.path('requiresPlan').caster?.enumValues;
        if (validEnumPlans) {
            for (const plan of requiresPlan) {
                if (plan && !validEnumPlans.includes(plan)) {
                    return res.status(400).json({ error: `Plan inválido en la lista: '${plan}'. Válidos: ${validEnumPlans.join(', ')}` });
                }
            }
        }
    }

    const updateData = {
        name, url, logo, description, section, active, isFeatured, 
        requiresPlan: requiresPlan || [], // Asegura que sea un array
        isPubliclyVisible
    };
    // Remover campos undefined para no sobreescribir con undefined si no se envían
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);


    const updatedChannel = await Channel.findByIdAndUpdate(channelId, updateData, { new: true });

    if (!updatedChannel) {
      return res.status(404).json({ error: "Canal no encontrado para actualizar." });
    }
    console.log("CTRL: updateChannelAdmin - Canal actualizado:", updatedChannel._id);
    res.json(updatedChannel);
  } catch (error) {
    console.error(`Error en CTRL:updateChannelAdmin para ID ${channelId}:`, error.message);
     if (error.name === 'ValidationError') {
        return res.status(400).json({ error: error.message });
    }
    next(error);
  }
};

// DELETE /api/channels/admin/:id
export const deleteChannelAdmin = async (req, res, next) => {
  const channelId = req.params.id;
  console.log(`CTRL: deleteChannelAdmin - ID: ${channelId}`);
  try {
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ error: "ID de canal inválido." });
    }
    const deletedChannel = await Channel.findByIdAndDelete(channelId);
    if (!deletedChannel) {
      return res.status(404).json({ error: "Canal no encontrado para eliminar." });
    }
    console.log("CTRL: deleteChannelAdmin - Canal eliminado:", deletedChannel._id);
    res.json({ message: "Canal eliminado exitosamente." });
  } catch (error) {
    console.error(`Error en CTRL:deleteChannelAdmin para ID ${channelId}:`, error.message);
    next(error);
  }
};

// POST /api/channels/admin/process-m3u
export const processM3UAdmin = async (req, res, next) => {
  console.log("CTRL: processM3UAdmin - Archivo recibido:", req.file ? req.file.originalname : "No hay archivo");
  if (!req.file) {
    return res.status(400).json({ error: "No se proporcionó ningún archivo M3U." });
  }

  try {
    const fileContent = req.file.buffer.toString('utf8');
    const lines = fileContent.split(/\r?\n/);
    
    let channelsToAdd = [];
    let currentChannel = {};

    if (!lines[0].startsWith('#EXTM3U')) {
        return res.status(400).json({ error: 'Archivo M3U inválido: Falta la cabecera #EXTM3U.' });
    }

    for (const line of lines) {
      if (line.startsWith('#EXTINF:')) {
        currentChannel = { user: req.user.id, active: true, isPubliclyVisible: true, requiresPlan: ['gplay'] }; // Defaults
        const infoMatch = line.match(/#EXTINF:-1(?:.*?tvg-id="([^"]*)")?(?:.*?tvg-name="([^"]*)")?(?:.*?tvg-logo="([^"]*)")?(?:.*?group-title="([^"]*)")?,(.+)/);
        if (infoMatch) {
          // infoMatch[1] = tvg-id, infoMatch[2] = tvg-name, infoMatch[3] = tvg-logo, infoMatch[4] = group-title, infoMatch[5] = channel name
          currentChannel.name = (infoMatch[2] || infoMatch[5] || 'Canal Sin Nombre').trim();
          currentChannel.logo = infoMatch[3] || '';
          currentChannel.section = infoMatch[4] || 'General';
          // Podrías añadir más lógica para extraer otros campos si están presentes
        } else {
           // Fallback si el formato es más simple: #EXTINF:-1,Nombre del Canal
           const nameMatch = line.match(/#EXTINF:-1,(.+)/);
           if (nameMatch) currentChannel.name = nameMatch[1].trim();
        }
      } else if (line.trim() && !line.startsWith('#') && currentChannel.name) {
        currentChannel.url = line.trim();
        if (currentChannel.name && currentChannel.url) {
            channelsToAdd.push(currentChannel);
        }
        currentChannel = {}; // Reset para el siguiente canal
      }
    }

    if (channelsToAdd.length === 0) {
      return res.status(400).json({ message: "No se encontraron canales válidos en el archivo M3U." });
    }

    // Opcional: Evitar duplicados por URL o por nombre antes de insertar
    let channelsAddedCount = 0;
    for (const chData of channelsToAdd) {
        try {
            // Busca si ya existe un canal con la misma URL para evitar duplicados exactos
            const existingChannel = await Channel.findOne({ url: chData.url });
            if (!existingChannel) {
                const newChannel = new Channel(chData);
                await newChannel.save();
                channelsAddedCount++;
            } else {
                console.log(`CTRL: processM3UAdmin - Canal ya existente (misma URL): ${chData.url}, omitiendo.`);
            }
        } catch (saveError) {
            console.error(`CTRL: processM3UAdmin - Error guardando canal individual ${chData.name}: ${saveError.message}`);
            // Continuar con los demás canales
        }
    }
    
    console.log(`CTRL: processM3UAdmin - Canales procesados del M3U: ${channelsToAdd.length}, Canales nuevos añadidos: ${channelsAddedCount}`);
    res.json({ message: `M3U procesado. ${channelsAddedCount} canales nuevos añadidos de ${channelsToAdd.length} encontrados.`, channelsAdded: channelsAddedCount });

  } catch (error) {
    console.error("Error en CTRL:processM3UAdmin:", error.message);
    next(error);
  }
};
