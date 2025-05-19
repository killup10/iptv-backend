// iptv-backend/controllers/channel.controller.js
import Channel from "../models/Channel.js";
import mongoose from "mongoose";

// Para la ruta GET /api/channels/list
export const getPublicChannels = async (req, res, next) => {
  console.log("CTRL: getPublicChannels - Query:", JSON.stringify(req.query));
  try {
    let queryConditions = { active: true, isPubliclyVisible: true };

    if (req.query.featured === "true") {
      queryConditions.isFeatured = true;
      delete queryConditions.isPubliclyVisible; 
    }

    if (req.query.section && req.query.section.toLowerCase() !== 'todos') {
      queryConditions.section = req.query.section;
    }

    const channels = await Channel.find(queryConditions).sort({ name: 1 });
    console.log(`CTRL: getPublicChannels - Canales encontrados para query ${JSON.stringify(queryConditions)}: ${channels.length}`);
    
    const data = channels.map((c) => ({
      id: c._id,
      name: c.name,
      thumbnail: c.logo || "",
      // No enviaremos la URL aquí, solo al solicitar el canal individualmente
      section: c.section || "General",
      description: c.description || "",
      requiresPlan: c.requiresPlan || ["basico"], // Para referencia en frontend si es necesario
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
      .sort((a,b) => a.localeCompare(b));
    
    console.log(`CTRL: getChannelFilterSections - Secciones encontradas: ${validSections.length}`, validSections);
    res.json(["Todos", ...validSections]);
  } catch (error) {
    console.error("Error en CTRL:getChannelFilterSections:", error.message);
    next(error);
  }
};

// Para la ruta GET /api/channels/id/:id (reproducción y verificación de plan)
export const getChannelByIdForUser = async (req, res, next) => {
  console.log(`CTRL: getChannelByIdForUser - ID: ${req.params.id}, Usuario: ${req.user?.username}, Plan Usuario: ${req.user?.plan}`);
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "ID de canal inválido." });
    }
    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: "Canal no encontrado" });
    }

    console.log(`CTRL: getChannelByIdForUser - Canal encontrado: ${channel.name}, Planes Requeridos: ${channel.requiresPlan.join(', ')}`);

    const userPlan = req.user?.plan || 'basico'; 
    const userRole = req.user?.role;

    if (!channel.active && userRole !== "admin") {
      return res.status(403).json({ error: "Este canal no está activo." });
    }

    let canAccess = false;
    if (userRole === 'admin') {
      canAccess = true;
    } else if (channel.requiresPlan && channel.requiresPlan.includes('free_preview')) {
      canAccess = true;
    } else if (channel.requiresPlan && Array.isArray(channel.requiresPlan) && channel.requiresPlan.length > 0) {
        const planHierarchy = { 'basico': 1, 'estandar': 2, 'sports': 3, 'cinefilo': 3, 'premium': 4 };
        const userLevel = planHierarchy[userPlan] || 0;
        canAccess = channel.requiresPlan.some(reqPlan => {
            const requiredLevel = planHierarchy[reqPlan] || 5; // Plan desconocido es restrictivo
            return userLevel >= requiredLevel;
        });
    } else if (!channel.requiresPlan || channel.requiresPlan.length === 0) { 
        // Si un canal no tiene planes requeridos definidos, permitir acceso si tiene al menos el plan más básico.
        const planHierarchy = { 'basico': 1, 'estandar': 2, 'sports': 3, 'cinefilo': 3, 'premium': 4 };
        const userLevel = planHierarchy[userPlan] || 0;
        if (userLevel >= 1) { // Asumiendo que 1 es el nivel de 'basico'
            canAccess = true;
            console.log(`CTRL: getChannelByIdForUser - Acceso permitido a canal sin plan explícito por tener plan nivel ${userLevel}`);
        }
    }

    if (!canAccess) {
      console.log(`CTRL: getChannelByIdForUser - Acceso DENEGADO para ${req.user.username} (plan: ${userPlan}) al canal ${channel.name}`);
      return res.status(403).json({
        error: `Acceso denegado. Tu plan '${userPlan || 'ninguno'}' no permite acceder a este canal.`
      });
    }
    
    console.log(`CTRL: getChannelByIdForUser - Acceso PERMITIDO para ${req.user.username} al canal ${channel.name}`);
    res.json({ // Enviar URL real aquí
      id: channel._id, name: channel.name, url: channel.url, logo: channel.logo,
      section: channel.section, description: channel.description || "", active: channel.active,
      isFeatured: channel.isFeatured, requiresPlan: channel.requiresPlan,
    });
  } catch (error) {
    console.error(`Error en CTRL:getChannelByIdForUser para ID ${req.params.id}:`, error.message);
    next(error);
  }
};

// --- CONTROLADORES PARA RUTAS DE ADMINISTRACIÓN ---
// (Mantén tus funciones de admin: getAllChannelsAdmin, createChannelAdmin, updateAdminChannel, deleteAdminChannel, processM3UAdmin)
// Asegúrate que estén exportadas con `export const`
export const getAllChannelsAdmin = async (req, res, next) => { /* ...tu lógica completa... */ try { /* ... */ res.json(/*...*/); } catch(e) { next(e); } };
export const createChannelAdmin = async (req, res, next) => { /* ...tu lógica completa... */ try { /* ... */ res.status(201).json(/*...*/); } catch(e) { next(e); } };
export const updateChannelAdmin = async (req, res, next) => { /* ...tu lógica completa... */ try { /* ... */ res.json(/*...*/); } catch(e) { next(e); } };
export const deleteChannelAdmin = async (req, res, next) => { /* ...tu lógica completa... */ try { /* ... */ res.json(/*...*/); } catch(e) { next(e); } };
export const processM3UAdmin = async (req, res, next) => { /* ...tu lógica completa... */ try { /* ... */ res.json(/*...*/); } catch(e) { next(e); } };