// iptv-backend/controllers/channel.controller.js
import Channel from "../models/Channel.js";
import mongoose from "mongoose";
import readline from 'readline';
import { Readable } from 'stream';

/**
 * Lista estática de planes permitidos para los canales. Se utiliza en las
 * validaciones de creación/edición para evitar discrepancias si el modelo se
 * carga con un esquema antiguo.
 */
const VALID_CHANNEL_PLANS = [
  'gplay',
  'estandar',
  'cinefilo',
  'sports',
  'premium',
  'free_preview',
  'basico'
];

// Para la ruta GET /api/channels/list
export const getPublicChannels = async (req, res, next) => {
  console.log("CTRL: getPublicChannels - Query:", JSON.stringify(req.query));
  try {
    let queryConditions = { active: true };

    if (req.query.featured === "true") {
      queryConditions.isFeatured = true;
      queryConditions.isPubliclyVisible = true;
    } else {
      queryConditions.isPubliclyVisible = true;
      if (req.query.section && req.query.section.toLowerCase() !== 'todos') {
        queryConditions.section = req.query.section;
      }
    }

    const channels = await Channel.find(queryConditions).sort({ name: 1 });
    console.log(`CTRL: getPublicChannels - Canales encontrados para query ${JSON.stringify(queryConditions)}: ${channels.length}`);

    const data = channels.map((c) => ({
      id: c._id,
      name: c.name,
      thumbnail: c.logo || "/img/placeholder-thumbnail.png",
      section: c.section || "General",
      description: c.description || "",
      // No es estrictamente necesario enviar requiresPlan para listados públicos si el acceso se verifica al reproducir
      // requiresPlan: c.requiresPlan || ["gplay"], 
      isFeatured: c.isFeatured || false,
      isPubliclyVisible: c.isPubliclyVisible === undefined ? true : c.isPubliclyVisible,
    }));
    res.json(data);
  } catch (err) {
    console.error("Error en CTRL:getPublicChannels:", err.message);
    next(err);
  }
};

// Para la ruta GET /api/channels/sections (botones de filtro)
export const getChannelFilterSections = async (req, res, next) => {
  console.log("CTRL: getChannelFilterSections - Solicitud.");
  try {
    const distinctSections = await Channel.distinct("section", {
      active: true,
      isPubliclyVisible: true
    });
    const validSections = distinctSections
      .filter(s => s && typeof s === 'string' && s.trim() !== '')
      .sort((a, b) => a.localeCompare(b));

    console.log(`CTRL: getChannelFilterSections - Secciones encontradas: ${validSections.length}`, validSections);
    res.json(["Todos", ...validSections]);
  } catch (error) {
    console.error("Error en CTRL:getChannelFilterSections:", error.message);
    next(error);
  }
};

// Para la ruta GET /api/channels/id/:id (reproducción y verificación de plan)
export const getChannelByIdForUser = async (req, res, next) => {
  const channelId = req.params.id;
  // El plan del usuario vendrá del token (ej. 'gplay', 'premium', etc.)
  const userPlanFromToken = req.user?.plan || 'gplay'; // Si no hay plan en token, asume el más básico ('gplay')
  const userRole = req.user?.role;

  console.log(`CTRL: getChannelByIdForUser - ID: ${channelId}, Usuario: ${req.user?.username}, Plan Usuario (del token): ${userPlanFromToken}`);
  try {
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ error: "ID de canal inválido." });
    }
    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ error: "Canal no encontrado" });
    }

  console.log(`CTRL: getChannelByIdForUser - Canal encontrado: ${channel.name}, Planes Requeridos por Canal: ${channel.requiresPlan?.join(', ')}`);
  console.log(`CTRL: getChannelByIdForUser - URL presente? ${!!channel.url} ${channel.url ? `(length=${channel.url.length})` : ''}`);

    if (!channel.active && userRole !== "admin") {
      return res.status(403).json({ error: "Este canal no está activo." });
    }

    let canAccess = false;
    // Definir la jerarquía de planes usando las MISMAS CLAVES que en tu modelo y AdminPanel
    const planHierarchy = {
      'gplay': 1,
      'estandar': 2,
      'sports': 3,
      'cinefilo': 4,
      'premium': 5
    };

    // Normalizar el plan en caso de que aún exista el valor antiguo 'basico'
    const normalizedUserPlanKey = userPlanFromToken === 'basico' ? 'gplay' : userPlanFromToken;
    const userLevel = planHierarchy[normalizedUserPlanKey] || 0; // Nivel del plan del usuario

    if (userRole === 'admin') {
      canAccess = true;
    } else {
      // Normalizar plans: si el canal no tiene requiresPlan definido o está vacío,
      // asumimos el plan básico 'gplay' (esto evita que canales nuevos sin campo queden bloqueados).
      const channelRequiredPlans = (Array.isArray(channel.requiresPlan) && channel.requiresPlan.length > 0)
        ? channel.requiresPlan
        : ['gplay'];

      // El canal tiene planes requeridos. El usuario necesita tener un plan cuyo nivel sea IGUAL O SUPERIOR
      // a CUALQUIERA de los planes requeridos por el canal.
      canAccess = channelRequiredPlans.some(reqPlanKey => {
        const requiredLevel = planHierarchy[reqPlanKey];
        if (requiredLevel === undefined) { // Plan desconocido en el canal, tratar como muy restrictivo o loguear error
          console.warn(`CTRL: getChannelByIdForUser - Plan desconocido '${reqPlanKey}' en los requisitos del canal ${channel.name}`);
          return false;
        }
        return userLevel >= requiredLevel;
      });
    }

    if (!canAccess) {
      console.log(`CTRL: getChannelByIdForUser - Acceso DENEGADO para ${req.user?.username} (plan token: ${userPlanFromToken}, nivel: ${userLevel}) al canal ${channel.name} (req: ${channel.requiresPlan?.join(', ')})`);
      
      // Determinar el plan mínimo requerido para acceder al canal
      const requiredPlans = channel.requiresPlan || [];
      const planNames = {
        'gplay': 'G-Play',
        'estandar': 'Estándar', 
        'sports': 'Sports',
        'cinefilo': 'Cinéfilo',
        'premium': 'Premium'
      };
      
      const currentPlanName = planNames[normalizedUserPlanKey] || normalizedUserPlanKey;
      const requiredPlanNames = requiredPlans.map(plan => planNames[plan] || plan).join(' o ');
      
      return res.status(403).json({
        error: `📺 ¡Este canal es contenido premium!`,
        message: `Este canal requiere el plan ${requiredPlanNames}. Tu plan actual (${currentPlanName}) no incluye acceso a este contenido.`,
        currentPlan: currentPlanName,
        requiredPlans: requiredPlanNames,
        upgradeMessage: "Actualiza tu plan para acceder a todos nuestros canales premium de televisión en vivo."
      });
    }

    console.log(`CTRL: getChannelByIdForUser - Acceso PERMITIDO para ${req.user?.username} al canal ${channel.name}`);
    res.json({
      id: channel._id, name: channel.name, url: channel.url, logo: channel.logo,
      section: channel.section, description: channel.description || "", active: channel.active,
      isFeatured: channel.isFeatured, requiresPlan: channel.requiresPlan,
      isPubliclyVisible: channel.isPubliclyVisible,
    });
  } catch (error) {
    console.error(`Error en CTRL:getChannelByIdForUser para ID ${channelId}:`, error.message);
    next(error);
  }
};

// --- CONTROLADORES PARA RUTAS DE ADMINISTRACIÓN ---
export const getAllChannelsAdmin = async (req, res, next) => {
  console.log("CTRL: getAllChannelsAdmin - Solicitud para listar todos los canales (admin).");
  try {
    const channels = await Channel.find({}).sort({ createdAt: -1 });
    console.log(`CTRL: getAllChannelsAdmin - Canales encontrados: ${channels.length}`);
    res.json(channels.map(c => ({
      id: c._id, _id: c._id, name: c.name, url: c.url, logo: c.logo,
      description: c.description, section: c.section, active: c.active,
      isFeatured: c.isFeatured, requiresPlan: c.requiresPlan,
      isPubliclyVisible: c.isPubliclyVisible, createdAt: c.createdAt, updatedAt: c.updatedAt
    })));
  } catch (error) {
    console.error("Error en CTRL:getAllChannelsAdmin:", error.message);
    next(error);
  }
};

export const createChannelAdmin = async (req, res, next) => {
  console.log("CTRL: createChannelAdmin - Datos recibidos:", req.body);
  try {
    const { name, url, logo, description, section, active, isFeatured, requiresPlan, isPubliclyVisible } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: "Nombre y URL del canal son obligatorios." });
    }
    if (requiresPlan && Array.isArray(requiresPlan)) {
      for (const plan of requiresPlan) {
        if (plan && !VALID_CHANNEL_PLANS.includes(plan)) {
          return res.status(400).json({ error: `Plan inválido en la lista: '${plan}'. Válidos: ${VALID_CHANNEL_PLANS.join(', ')}` });
        }
      }
    }
    const newChannel = new Channel({
      name, url, logo, description, section: section || "General",
      active: active !== undefined ? active : true,
      isFeatured: isFeatured || false,
      requiresPlan: requiresPlan || [],
      isPubliclyVisible: isPubliclyVisible !== undefined ? isPubliclyVisible : true,
      user: req.user.id
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

export const updateChannelAdmin = async (req, res, next) => {
  const channelId = req.params.id;
  console.log(`CTRL: updateChannelAdmin - ID: ${channelId}, Datos:`, req.body);
  try {
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ error: "ID de canal inválido." });
    }
    const { name, url, logo, description, section, active, isFeatured, requiresPlan, isPubliclyVisible } = req.body;
    
    if (requiresPlan && Array.isArray(requiresPlan)) {
      for (const plan of requiresPlan) {
        if (plan && !VALID_CHANNEL_PLANS.includes(plan)) {
          return res.status(400).json({ error: `Plan inválido en la lista: '${plan}'. Válidos: ${VALID_CHANNEL_PLANS.join(', ')}` });
        }
      }
    }

    const updateData = { name, url, logo, description, section, active, isFeatured, requiresPlan: requiresPlan || [], isPubliclyVisible };
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

export const processM3UAdmin = async (req, res, next) => {
  console.log("CTRL: processM3UAdmin - Archivo recibido:", req.file ? req.file.originalname : "No hay archivo");
  if (!req.file) {
    return res.status(400).json({ error: "No se proporcionó ningún archivo M3U." });
  }

  try {
    const fileContent = req.file.buffer.toString('utf8');
    const lines = fileContent.split(/\r?\n/);
    let channelsToAdd = [];
    let currentChannel = null; // Usar null para indicar que no hay canal en construcción

    // La cabecera #EXTM3U es recomendada, pero podemos ser flexibles si el contenido parece válido.
    if (!lines[0].startsWith('#EXTM3U')) {
      console.warn("CTRL: processM3UAdmin - Advertencia: El archivo no comienza con #EXTM3U. Se intentará procesar de todas formas.");
    }

    for (const line of lines) {
      if (line.startsWith('#EXTINF:')) {
        // Si había un canal anterior sin URL, se descarta.
        if (currentChannel) {
          console.log(`CTRL: processM3UAdmin - Se encontró un #EXTINF huérfano (sin URL), descartando canal anterior: ${currentChannel.name}`);
        }

        currentChannel = {
          user: req.user.id,
          active: true,
          isPubliclyVisible: true,
          requiresPlan: ['gplay'],
          section: 'General', // Valor por defecto
          logo: ''
        };

        // Regex mejorado para capturar el nombre del canal y atributos opcionales.
        // Acepta #EXTINF:-1, #EXTINF:0, etc.
        const infoMatch = line.match(/#EXTINF:[-0-9]+(?:.*?tvg-id="([^"]*)")?(?:.*?tvg-name="([^"]*)")?(?:.*?tvg-logo="([^"]*)")?(?:.*?group-title="([^"]*)")?,(.+)/);
        
        if (infoMatch) {
          // Formato completo: #EXTINF:-1 tvg-name="Nombre" group-title="Grupo",Nombre Visible
          currentChannel.name = (infoMatch[2] || infoMatch[5] || 'Canal Sin Nombre').trim();
          currentChannel.logo = infoMatch[3] || '';
          currentChannel.section = infoMatch[4] || 'General';
        } else {
          // Formato simple: #EXTINF:-1,Nombre del Canal
          const nameMatch = line.match(/#EXTINF:[-0-9]+,(.+)/);
          if (nameMatch) {
            currentChannel.name = nameMatch[1].trim();
          } else {
            console.warn(`CTRL: processM3UAdmin - Línea #EXTINF no reconocida, saltando: ${line}`);
            currentChannel = null; // Invalida el canal actual
            continue;
          }
        }
      } else if (line.startsWith('#EXTGRP:') && currentChannel) {
        // Maneja el tag #EXTGRP en una línea separada.
        const groupMatch = line.match(/#EXTGRP:(.+)/);
        if (groupMatch) {
          currentChannel.section = groupMatch[1].trim();
        }
      } else if (line.trim() && !line.startsWith('#') && currentChannel && currentChannel.name) {
        // Esta línea debería ser la URL.
        currentChannel.url = line.trim();
        if (currentChannel.name && currentChannel.url) {
          channelsToAdd.push(currentChannel);
        }
        currentChannel = null; // Resetea para el próximo canal
      }
    }

    if (channelsToAdd.length === 0) {
      return res.status(400).json({ message: "No se encontraron canales válidos en el archivo M3U. Verifique el formato." });
    }

    let channelsAddedCount = 0;
    let channelsSkippedCount = 0;
    for (const chData of channelsToAdd) {
      try {
        const existingChannel = await Channel.findOne({ url: chData.url });
        if (!existingChannel) {
          const newChannel = new Channel(chData);
          await newChannel.save();
          channelsAddedCount++;
        } else {
          channelsSkippedCount++;
        }
      } catch (saveError) {
        console.error(`CTRL: processM3UAdmin - Error guardando canal individual ${chData.name}: ${saveError.message}`);
      }
    }

    console.log(`CTRL: processM3UAdmin - Canales procesados: ${channelsToAdd.length}. Nuevos: ${channelsAddedCount}. Omitidos (URL duplicada): ${channelsSkippedCount}`);
    res.json({
      message: `M3U procesado. ${channelsAddedCount} canales nuevos añadidos de ${channelsToAdd.length} encontrados. ${channelsSkippedCount} canales fueron omitidos por tener URL duplicada.`,
      channelsAdded: channelsAddedCount,
      channelsSkipped: channelsSkippedCount,
      totalFound: channelsToAdd.length
    });

  } catch (error) {
    console.error("Error en CTRL:processM3UAdmin:", error.message, error.stack);
    next(error);
  }
};