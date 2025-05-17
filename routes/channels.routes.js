// iptv-backend/routes/channels.routes.js
import express from "express";
import Channel from "../models/Channel.js"; // Asegúrate que el modelo esté bien importado
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import multer from "multer";
import mongoose from "mongoose"; // Importa mongoose si no lo has hecho, para isValidObjectId

const router = express.Router();

// Configuración de Multer (ya la tienes y parece correcta)
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

// --- RUTAS PARA USUARIOS (ya las tienes) ---
router.get("/list", async (req, res) => { /* ... tu código ... */ });
router.get("/id/:id", verifyToken, async (req, res) => { /* ... tu código ... */ });
router.get("/main-sections", verifyToken, async (req, res) => { /* ... tu código ... */ });

// --- RUTAS SOLO PARA ADMINISTRADORES (prefijo /api/channels/admin/...) ---

// GET /api/channels/admin/list (Para AdminPanel - Listar todos los canales para admin)
router.get("/admin/list", verifyToken, isAdmin, async (req, res) => {
  try {
    const channels = await Channel.find({}).sort({ name: 1 });
    res.json(
      channels.map((c) => ({
        id: c._id,
        _id: c._id,
        name: c.name,
        url: c.url,
        logo: c.logo,
        category: c.category,
        description: c.description,
        active: c.active, // Asegúrate que tu modelo tenga 'active' y no 'isActive' si usas 'active' aquí
        isFeatured: c.isFeatured,
        requiresPlan: c.requiresPlan,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }))
    );
  } catch (err) {
    console.error("Error al obtener todos los canales (admin):", err);
    res.status(500).json({ error: "Error al obtener lista completa de canales" });
  }
});

// POST /api/channels/admin (Para AdminPanel - Crear Canal individualmente)
router.post("/admin", verifyToken, isAdmin, async (req, res, next) => {
  try {
    const { name, url, category, logo, description, active, isFeatured, requiresPlan } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: "Nombre y URL son requeridos." });
    }
    // Aquí podrías añadir validación para 'category' y 'requiresPlan' contra enums del modelo si es necesario
    const existingChannel = await Channel.findOne({ $or: [{ name }, { url }] });
    if (existingChannel) {
      return res.status(409).json({ error: "Ya existe un canal con ese nombre o URL." });
    }
    const newChannel = new Channel({
      name, url, category: category || "GENERAL", logo: logo || "", description: description || "",
      active: active !== undefined ? active : true,
      isFeatured: isFeatured || false,
      requiresPlan: requiresPlan || "gplay", // O el default de tu modelo
    });
    const savedChannel = await newChannel.save();
    res.status(201).json(savedChannel);
  } catch (error) {
    console.error("Error creando canal (admin):", error);
    if (error.name === 'ValidationError') {
        return res.status(400).json({ error: "Error de validación", details: error.errors });
    }
    next(error);
  }
});

// PUT /api/channels/admin/:id (Para AdminPanel - Actualizar Canal)
router.put("/admin/:id", verifyToken, isAdmin, async (req, res, next) => {
  try {
    const channelId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
        return res.status(400).json({ error: "ID de canal inválido." });
    }
    const updateData = req.body; // { name, url, category, logo, description, active, isFeatured, requiresPlan }
    
    // Prevenir que se actualice _id o se envíen campos vacíos que no deberían estar
    delete updateData._id; 
    Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined || updateData[key] === null || updateData[key] === '') {
            // Podrías querer permitir string vacío para descripción o logo
            if (key !== 'description' && key !== 'logo') {
                 // delete updateData[key]; // O manejarlo de otra forma
            }
        }
    });


    const updatedChannel = await Channel.findByIdAndUpdate(
      channelId,
      { $set: updateData, updatedAt: Date.now() }, // Asegurar que updatedAt se actualice
      { new: true, runValidators: true }
    );
    if (!updatedChannel) {
      return res.status(404).json({ error: "Canal no encontrado para actualizar." });
    }
    res.json(updatedChannel);
  } catch (error) {
    console.error(`Error actualizando canal ID ${req.params.id} (admin):`, error);
    if (error.name === 'ValidationError') {
        return res.status(400).json({ error: "Error de validación", details: error.errors });
    }
    next(error);
  }
});

// DELETE /api/channels/admin/:id (Para AdminPanel - Eliminar Canal)
router.delete("/admin/:id", verifyToken, isAdmin, async (req, res, next) => {
  try {
    const channelId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
        return res.status(400).json({ error: "ID de canal inválido." });
    }
    const deletedChannel = await Channel.findByIdAndDelete(channelId);
    if (!deletedChannel) {
      return res.status(404).json({ error: "Canal no encontrado para eliminar." });
    }
    res.json({ message: "Canal eliminado correctamente.", id: channelId });
  } catch (error) {
    console.error(`Error eliminando canal ID ${req.params.id} (admin):`, error);
    next(error);
  }
});


// POST /api/channels/admin/process-m3u (Ruta que faltaba)
router.post(
  "/admin/process-m3u",
  verifyToken,
  isAdmin,
  upload.single('m3uFile'), // 'm3uFile' debe coincidir con el nombre del campo en FormData
  async (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({ error: "No se subió ningún archivo M3U." });
    }
    try {
      const m3uContent = req.file.buffer.toString('utf8');
      console.log(`BACKEND: AdminPanel - Procesando M3U: ${req.file.originalname}`);
      
      let channelsFoundInFile = 0; // Renombrado para claridad
      let channelsAdded = 0;
      let channelsUpdated = 0;
      let currentChannelInfo = {}; // Para almacenar datos del canal actual mientras se parsea
      const lines = m3uContent.split('\n');

      for (const line of lines) {
        if (line.startsWith('#EXTINF:')) {
          channelsFoundInFile++; // Contar cada entrada EXTINF
          // Reset para nuevo canal
          currentChannelInfo = { 
            name: '', 
            logo: '', 
            category: 'M3U Import', // Default category
            url: '',
            description: 'Importado de M3U', // Default description
            active: true, // Default active state
            isFeatured: false, // Default featured state
            requiresPlan: 'gplay' // Default plan
          };
          
          const infoMatch = line.match(/#EXTINF:-?\d+([^,]*),(.*)/);
          if (infoMatch && infoMatch[2]) {
            currentChannelInfo.name = infoMatch[2].trim();
          }

          const logoMatch = line.match(/tvg-logo="([^"]+)"/);
          if (logoMatch && logoMatch[1]) {
            currentChannelInfo.logo = logoMatch[1];
          }
          
          const groupMatch = line.match(/group-title="([^"]+)"/);
          if (groupMatch && groupMatch[1]) {
            currentChannelInfo.category = groupMatch[1].trim() || "M3U Import";
          }

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
                // Podrías añadir más campos para actualizar si los parseas del M3U
                
                if (isChanged) {
                  existingChannel.updatedAt = Date.now();
                  await existingChannel.save();
                  channelsUpdated++;
                }
              } else {
                const newChannel = new Channel(currentChannelInfo); // Usar los defaults definidos arriba
                await newChannel.save();
                channelsAdded++;
              }
            } catch (dbError) {
              console.error("Error guardando canal de M3U:", currentChannelInfo.name, dbError.message);
              // Decide si quieres continuar con los demás o parar y devolver error.
            }
          }
          currentChannelInfo = {}; // Reset para el siguiente
        }
      }

      res.json({ 
        message: `Archivo M3U "${req.file.originalname}" procesado.`,
        channelsFoundInFile: channelsFoundInFile,
        channelsAdded: channelsAdded,
        channelsUpdated: channelsUpdated
      });

    } catch (error) {
      console.error("Error procesando M3U en /admin/process-m3u:", error);
      // El error handler global se encargará si next(error) se llama
      // o si no se ha enviado respuesta.
      if (!res.headersSent) {
          res.status(500).json({ error: "Error interno al procesar el archivo M3U." });
      } else {
          next(error); // Si ya se envió algo (improbable aquí), delegar.
      }
    }
  }
);

export default router;