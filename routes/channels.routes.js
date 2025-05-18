// iptv-backend/routes/channels.routes.js
import express from "express";
import Channel from "../models/Channel.js";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import multer from "multer";
import mongoose from "mongoose";

const router = express.Router();

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
// Filtra por ?category=NOMBRE_CATEGORIA o ?featured=true
router.get("/list", async (req, res) => {
  console.log("BACKEND: /api/channels/list - Solicitud recibida. Query:", req.query);
  try {
    let query = { active: true };

    if (req.query.featured === "true") {
      query.isFeatured = true;
      console.log("BACKEND: /api/channels/list - Filtrando por canales destacados.");
    }
    if (req.query.category) {
      query.category = req.query.category; // Filtro por una categoría específica
      console.log(`BACKEND: /api/channels/list - Filtrando por categoría: ${req.query.category}`);
    }
    // Para el nuevo enfoque, si un canal es isPubliclyVisible:true, debería aparecer.
    // Si no, solo debería aparecer si el usuario tiene el plan (esto se maneja más en el acceso).
    // Para simplificar la lista inicial, podemos añadir una condición OR:
    // query.$or = [ { isPubliclyVisible: true }, { /* aquí iría el filtro de plan si el usuario está logueado */ } ];
    // Pero por ahora, dejemos que el frontend reciba todos los activos/filtrados por categoría y maneje la visibilidad de acceso.


    const channels = await Channel.find(query).sort({ name: 1 });
    console.log(`BACKEND: /api/channels/list - Canales encontrados con filtro actual: ${channels.length}`);

    const data = channels.map((c) => ({
      id: c._id,
      name: c.name,
      thumbnail: c.logo || "",
      url: c.url,
      category: c.category || "GENERAL",
      description: c.description || "",
      requiresPlan: c.requiresPlan || ["gplay"], // Devolver como array
      isFeatured: c.isFeatured || false,
      isPubliclyVisible: c.isPubliclyVisible || false // Enviar este flag
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
  console.log(`BACKEND: /api/channels/id/${req.params.id} - Solicitud recibida por usuario: ${req.user?.username}`);
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
    console.log(`BACKEND: /api/channels/id/${req.params.id} - Canal encontrado: ${channel.name}, RequiresPlan: ${channel.requiresPlan}`);

    const userPlan = req.user?.plan; // El plan del usuario actual
    const userRole = req.user?.role;

    if (!channel.active && userRole !== "admin") {
      console.log(`BACKEND: /api/channels/id/${req.params.id} - Acceso denegado: Canal inactivo.`);
      return res.status(403).json({ error: "Este canal no está activo actualmente." });
    }

    let canAccess = false;
    if (userRole === 'admin') {
        canAccess = true;
        console.log(`BACKEND: /api/channels/id/${req.params.id} - Acceso permitido: Usuario es admin.`);
    } else if (channel.requiresPlan && channel.requiresPlan.includes('free_preview')) {
        canAccess = true;
        console.log(`BACKEND: /api/channels/id/${req.params.id} - Acceso permitido: Canal es free_preview.`);
    } else if (userPlan && channel.requiresPlan && channel.requiresPlan.includes(userPlan)) {
        canAccess = true;
        console.log(`BACKEND: /api/channels/id/${req.params.id} - Acceso permitido: Plan de usuario '${userPlan}' coincide con uno de los planes requeridos [${channel.requiresPlan.join(', ')}].`);
    }
    // Puedes añadir lógica de jerarquía de planes si es necesario. Por ejemplo:
    // else if (userPlan === 'premium' && (channel.requiresPlan.includes('sports') || channel.requiresPlan.includes('cinefilo'))) canAccess = true;


    if (!canAccess) {
      console.log(`BACKEND: /api/channels/id/${req.params.id} - Acceso denegado. Plan de usuario: '${userPlan || 'ninguno'}', Planes requeridos por canal: [${channel.requiresPlan.join(', ')}].`);
      return res.status(403).json({
        error: `Acceso denegado. Se requiere uno de los siguientes planes: ${channel.requiresPlan.join(', ')}. Tu plan es '${userPlan || 'ninguno'}'.`
      });
    }

    console.log(`BACKEND: /api/channels/id/${req.params.id} - Acceso permitido. Enviando datos del canal.`);
    res.json({
      id: channel._id, _id: channel._id, name: channel.name, url: channel.url,
      logo: channel.logo, thumbnail: channel.logo, category: channel.category,
      description: channel.description || "", active: channel.active,
      isFeatured: channel.isFeatured, requiresPlan: channel.requiresPlan,
      isPubliclyVisible: channel.isPubliclyVisible
    });
  } catch (error) {
    console.error(`Error en GET /api/channels/id/${req.params.id}:`, error.name, error.message, error.stack);
    if (!res.headersSent) {
        res.status(500).json({ error: "Error interno al obtener el canal." });
    }
  }
});

// GET /api/channels/main-sections (LA DEJAMOS POR SI LA USAS EN OTRO LADO, PERO TV EN VIVO USARÁ /list?category=...)
router.get("/main-sections", verifyToken, async (req, res) => {
  console.log(`BACKEND: /api/channels/main-sections - INICIO DE RUTA. Usuario: ${req.user?.username}, Rol: ${req.user?.role}, Plan: ${req.user?.plan}`);
  try {
    const userPlan = req.user?.plan || "gplay";
    const userRole = req.user?.role;
    const planHierarchy = { gplay: 1, cinefilo: 2, sports: 3, premium: 4 };
    const currentLevel = planHierarchy[userPlan] || 0;
    console.log(`BACKEND: /api/channels/main-sections - UserPlan: ${userPlan}, UserRole: ${userRole}, CurrentLevel: ${currentLevel}`);

    const sections = [ /* ... Tu array de secciones como lo tenías ... */ ]; // Mantén tu definición de secciones aquí
    console.log("BACKEND: /api/channels/main-sections - ¿Array 'sections' definido?", Array.isArray(sections) ? `Sí, ${sections.length} elementos.` : "NO, ES UNDEFINED O NO ES UN ARRAY.");

    if (!Array.isArray(sections) || sections.length === 0) {
        console.error("BACKEND: /api/channels/main-sections - ¡EL ARRAY 'sections' NO ESTÁ DEFINIDO CORRECTAMENTE O ESTÁ VACÍO!");
        return res.status(500).json({ error: "Error interno del servidor: configuración de secciones de canales incorrecta." });
    }
    const filteredSections = userRole === "admin" ? sections : sections.filter((s) => (planHierarchy[s.requiresPlan] || 0) <= currentLevel);
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
        requiresPlan: c.requiresPlan, isPubliclyVisible: c.isPubliclyVisible, //Añadir para admin
        createdAt: c.createdAt, updatedAt: c.updatedAt,
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
    // requiresPlan ahora debe ser un array
    const { name, url, category, logo, description, active, isFeatured, requiresPlan, isPubliclyVisible } = req.body;
    if (!name || !url) {
      console.log("BACKEND: POST /api/channels/admin - Faltan nombre o URL.");
      return res.status(400).json({ error: "Nombre y URL son requeridos." });
    }
    const existingChannel = await Channel.findOne({ $or: [{ name }, { url }] });
    if (existingChannel) {
      console.log("BACKEND: POST /api/channels/admin - Canal ya existe:", name);
      return res.status(409).json({ error: "Ya existe un canal con ese nombre o URL." });
    }
    const newChannel = new Channel({
      name, url, category: category || "GENERAL", logo: logo || "", description: description || "",
      active: active !== undefined ? active : true,
      isFeatured: isFeatured || false,
      requiresPlan: Array.isArray(requiresPlan) && requiresPlan.length > 0 ? requiresPlan : ["gplay"], // Asegurar que sea un array
      isPubliclyVisible: isPubliclyVisible || false,
    });
    const savedChannel = await newChannel.save();
    console.log("BACKEND: POST /api/channels/admin - Canal creado:", savedChannel.name);
    res.status(201).json(savedChannel);
  } catch (error) {
    console.error("Error en POST /api/channels/admin:", error.name, error.message, error.stack);
    if (error.name === 'ValidationError') {
        return res.status(400).json({ error: "Error de validación al crear canal.", details: error.errors });
    }
    if (!res.headersSent) { next(error); }
  }
});

router.put("/admin/:id", verifyToken, isAdmin, async (req, res, next) => {
  const channelId = req.params.id;
  console.log(`BACKEND: PUT /api/channels/admin/${channelId} - Actualizar canal. Body:`, req.body);
  try {
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
        console.log(`BACKEND: PUT /api/channels/admin/${channelId} - ID inválido.`);
        return res.status(400).json({ error: "ID de canal inválido." });
    }
    const updateData = req.body;
    delete updateData._id;
    // Asegurar que requiresPlan sea un array si se envía
    if (updateData.requiresPlan && !Array.isArray(updateData.requiresPlan)) {
        // Podrías convertirlo o devolver un error si el formato es incorrecto
        console.warn(`BACKEND: PUT /api/channels/admin/${channelId} - requiresPlan no es un array, se usará default o se ignorará si el modelo lo permite.`);
        // Si quieres forzar que sea un array:
        // updateData.requiresPlan = [updateData.requiresPlan];
        // O si quieres que falle si no es un array:
        // return res.status(400).json({ error: "requiresPlan debe ser un array de strings."})
    } else if (updateData.requiresPlan && updateData.requiresPlan.length === 0) {
        updateData.requiresPlan = ["gplay"]; // Default si se envía vacío
    }


    const updatedChannel = await Channel.findByIdAndUpdate(
      channelId,
      { $set: updateData, updatedAt: Date.now() },
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
    if (!res.headersSent) { next(error); }
  }
});

router.delete("/admin/:id", verifyToken, isAdmin, async (req, res, next) => {
  // ... (tu código de DELETE con logs como lo tenías antes) ...
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
    if (!res.headersSent) { next(error); }
  }
});

router.post("/admin/process-m3u", verifyToken, isAdmin, upload.single('m3uFile'), async (req, res, next) => {
  // ... (tu código de process-m3u con logs como lo tenías antes) ...
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
            description: 'Importado de M3U', active: true, isFeatured: false, 
            requiresPlan: ['gplay'], // Default a array con gplay
            isPubliclyVisible: false
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
});

export default router;