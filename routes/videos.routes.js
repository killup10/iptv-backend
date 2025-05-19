// iptv-backend/routes/videos.routes.js
import express from "express";
import multer from "multer";
import fs from "fs";
import readline from "readline";
import mongoose from "mongoose";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import Video from "../models/Video.js"; // Asegúrate que la ruta al modelo Video sea correcta
// import Channel from "../models/Channel.js"; // No parece usarse en este archivo directamente
// import getTMDBThumbnail from "../utils/getTMDBThumbnail.js"; // No parece usarse en este archivo directamente

const router = express.Router();

// Configuración de Multer (si la usas para algo más en este archivo, si no, podría eliminarse de aquí)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, '_')),
});
const upload = multer({ 
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/vnd.apple.mpegurl' || 
            file.mimetype === 'audio/mpegurl' ||
            file.mimetype === 'application/x-mpegURL' ||
            file.originalname.endsWith('.m3u') || 
            file.originalname.endsWith('.m3u8')) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de archivo no permitido para M3U. Solo .m3u o .m3u8.'), false);
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 }
});

// GET /api/videos/main-sections
router.get("/main-sections", verifyToken, async (req, res, next) => {
  try {
    const userPlan = req.user.plan || 'gplay'; // Asumiendo 'gplay' como básico si no hay plan
    const isAdminUser = req.user.role === 'admin';
    
    const ALL_POSSIBLE_SECTIONS = [
      { key: "POR_GENERO", displayName: "POR GÉNEROS", thumbnailSample: "/img/placeholders/por_generos.jpg", requiresPlan: "gplay", order: 0 },
      { key: "ESPECIALES", displayName: "ESPECIALES (Festividades)", thumbnailSample: "/img/placeholders/especiales.jpg", requiresPlan: "gplay", order: 1 },
      { key: "CINE_2025", displayName: "CINE 2025 (Estrenos)", thumbnailSample: "/img/placeholders/cine_2025.jpg", requiresPlan: "premium", order: 2 }, // Premium y Cinefilo pueden ver
      { key: "CINE_4K", displayName: "CINE 4K", thumbnailSample: "/img/placeholders/cine_4k.jpg", requiresPlan: "premium", order: 3 },       // Premium y Cinefilo pueden ver
      { key: "CINE_60FPS", displayName: "CINE 60 FPS", thumbnailSample: "/img/placeholders/cine_60fps.jpg", requiresPlan: "premium", order: 4 }, // Premium y Cinefilo pueden ver
      // Considera si necesitas una sección para 'sports' o si se maneja por género
    ];

    let accessibleSections = [];
    if (isAdminUser) {
        accessibleSections = ALL_POSSIBLE_SECTIONS;
    } else {
        // Lógica de acceso a secciones basada en el plan del usuario
        // Asegúrate que las keys de plan (gplay, estandar, premium, cinefilo, sports) coincidan
        const planHierarchy = { 'gplay': 1, 'estandar': 2, 'sports': 3, 'cinefilo': 4, 'premium': 5 };
        const userPlanLevel = planHierarchy[userPlan] || 0;

        ALL_POSSIBLE_SECTIONS.forEach(section => {
            const requiredSectionPlanLevel = planHierarchy[section.requiresPlan] || 0;
            if (userPlanLevel >= requiredSectionPlanLevel) {
                accessibleSections.push(section);
            }
        });
    }
    
    for (let section of accessibleSections) {
        if (section.key !== "POR_GENERO") {
            // Para la miniatura, busca una película que CUALQUIERA de los planes del usuario pueda ver
            // y que pertenezca a la sección.
            // Esto es complejo si 'requiresPlan' en Video es un array.
            // Simplificación: busca una película activa en la sección con logo.
            const randomMovieForThumb = await Video.findOne({ 
                mainSection: section.key, 
                active: true, 
                logo: { $ne: null, $ne: "" } 
            }).sort({ createdAt: -1 });

            if (randomMovieForThumb && randomMovieForThumb.logo) {
                section.thumbnailSample = randomMovieForThumb.logo;
            }
        }
    }
    console.log(`BACKEND /main-sections - User: ${req.user.username}, Plan: ${userPlan}, EsAdmin: ${isAdminUser}, Secciones Enviadas: ${accessibleSections.map(s=>s.key).join(', ')}`);
    res.json(accessibleSections.sort((a,b) => a.order - b.order));
  } catch (error) {
    console.error("Error en GET /api/videos/main-sections:", error);
    next(error);
  }
});

// GET /api/videos/public/featured-movies (Ruta pública)
router.get("/public/featured-movies", async (req, res, next) => {
  try {
    const criteria = { tipo: "pelicula", isFeatured: true, active: true };
    console.log("BACKEND /public/featured-movies - Criterio:", criteria);
    const movies = await Video.find(criteria).sort({ createdAt: -1 }).limit(10);
    console.log("BACKEND /public/featured-movies - Películas encontradas:", movies.length);
    const mapVODToPublicFormat = (v) => ({
        id: v._id, _id: v._id, name: v.title, title: v.title,
        thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || "/img/placeholder-default.png",
        // No enviar url aquí si no es necesario para el carrusel de destacados
        // url: v.url, 
        mainSection: v.mainSection, genres: v.genres,
        tipo: v.tipo, description: v.description || "", trailerUrl: v.trailerUrl || ""
    });
    res.json(movies.map(mapVODToPublicFormat));
  } catch (error) { 
    console.error("Error en BACKEND /public/featured-movies:", error);
    next(error); 
  }
});

// GET /api/videos/public/featured-series (Ruta pública)
router.get("/public/featured-series", async (req, res, next) => {
  try {
    const criteria = { tipo: "serie", isFeatured: true, active: true };
    console.log("BACKEND /public/featured-series - Criterio:", criteria);
    const series = await Video.find(criteria).sort({ createdAt: -1 }).limit(10);
    console.log("BACKEND /public/featured-series - Series encontradas:", series.length);
    
    const mapVODToPublicFormat = (v) => ({
        id: v._id, _id: v._id, name: v.title, title: v.title,
        thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || "/img/placeholder-default.png",
        trailerUrl: v.trailerUrl || ""
    });
    res.json(series.map(mapVODToPublicFormat));
  } catch (error) { 
    console.error("Error en BACKEND /public/featured-series:", error.message);
    next(error); 
  }
});

// GET /api/videos (Listar VODs para usuarios y admin - Protegida)
router.get("/", verifyToken, async (req, res, next) => {
  try {
    const userPlan = req.user.plan || 'gplay'; // Asumiendo gplay como básico
    const isAdminView = req.user.role === 'admin' && req.query.view === 'admin';
    let query = {};

    if (!isAdminView) {
      // Lógica para usuarios normales: pueden ver contenido de su plan o inferior
      // y contenido que esté en el array 'requiresPlan' del video
      const planHierarchy = { 'gplay': 1, 'estandar': 2, 'sports': 3, 'cinefilo': 4, 'premium': 5 };
      const userPlanLevel = planHierarchy[userPlan] || 0;
      
      const accessiblePlanKeys = Object.keys(planHierarchy).filter(
        planKey => planHierarchy[planKey] <= userPlanLevel
      );

      query = {
        active: true,
        $or: [ // El video es accesible si:
          { requiresPlan: { $size: 0 } }, // No tiene planes definidos (accesible por todos los logueados)
          { requiresPlan: { $in: accessiblePlanKeys } }, // O alguno de sus planes requeridos está en los accesibles por el usuario
          { requiresPlan: { $elemMatch: { $in: accessiblePlanKeys } } } // Para asegurar que si es un array, al menos uno coincida
        ]
      };
      // Si tu modelo Video.requiresPlan es SIEMPRE un array (incluso vacío), la última condición es la más robusta.
      // Si puede ser un string o un array, necesitas manejar ambos o estandarizar el modelo.
      // Asumiendo que Video.requiresPlan es un array como definimos:
      query.requiresPlan = { $in: accessiblePlanKeys }; // Un video es accesible si CUALQUIERA de sus planes requeridos está en los planes accesibles del usuario.
                                                        // O si el video no tiene planes (requiresPlan es array vacío), ¿debería ser accesible?
                                                        // Si un video puede no tener planes y ser accesible por todos los logueados:
      // query.$or = [
      //    { requiresPlan: { $size: 0 } },
      //    { requiresPlan: { $in: accessiblePlanKeys } }
      // ];

    } else { // Es AdminView
      console.log("BACKEND GET /api/videos - Es AdminView.");
      if (req.query.active === 'true') query.active = true;
      if (req.query.active === 'false') query.active = false;
    }

    if (req.query.mainSection && req.query.mainSection !== "POR_GENERO") query.mainSection = req.query.mainSection;
    if (req.query.genre && req.query.genre !== "Todas") query.genres = req.query.genre; // Asume que genre es un string para filtrar por un solo género
    if (req.query.tipo) query.tipo = req.query.tipo;
    if (req.query.search) query.$text = { $search: req.query.search };
    
    console.log(`BACKEND GET /api/videos - User: ${req.user.username}, Plan: ${userPlan}, AdminView: ${isAdminView}, Query:`, JSON.stringify(query));

    const videos = await Video.find(query)
                              .sort(req.query.sort || { createdAt: -1 })
                              .limit(parseInt(req.query.limit) || 50)
                              .skip(parseInt(req.query.skip) || 0);
    
    console.log(`BACKEND GET /api/videos - Videos encontrados: ${videos.length}`);
    
    const mapToUserFormat = (v) => ({ /* ... (tu mapeo) ... */ id: v._id, _id: v._id, name: v.title, title: v.title, thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || "", url: v.url, mainSection: v.mainSection, genres: v.genres, description: v.description || "", trailerUrl: v.trailerUrl || "", tipo: v.tipo, requiresPlan: v.requiresPlan });
    const mapToFullAdminFormat = (v) => ({ /* ... (tu mapeo) ... */ id: v._id, _id: v._id, title: v.title, name: v.title, description: v.description, url: v.url, tipo: v.tipo, mainSection: v.mainSection, genres: v.genres, requiresPlan: v.requiresPlan, releaseYear: v.releaseYear, isFeatured: v.isFeatured, logo: v.logo, thumbnail: v.logo, customThumbnail: v.customThumbnail, tmdbThumbnail: v.tmdbThumbnail, trailerUrl: v.trailerUrl, active: v.active, user: v.user, createdAt: v.createdAt, updatedAt: v.updatedAt });

    res.json(isAdminView ? videos.map(mapToFullAdminFormat) : videos.map(mapToUserFormat));

  } catch (error) { 
    console.error("Error en BACKEND GET /api/videos:", error);
    next(error); 
  }
});

// GET /api/videos/:id (Obtener un VOD específico - Protegida)
router.get("/:id", verifyToken, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "ID de video con formato inválido." });
    }
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ error: "Video no encontrado" });

    const userPlan = req.user.plan || 'gplay';
    const isAdminUser = req.user.role === 'admin';
    let canAccess = false;

    if (isAdminUser) {
      canAccess = true;
    } else if (video.active) {
      const planHierarchy = { 'gplay': 1, 'estandar': 2, 'sports': 3, 'cinefilo': 4, 'premium': 5 };
      const userPlanLevel = planHierarchy[userPlan] || 0;
      
      // Si el video no tiene planes requeridos, es accesible por cualquier usuario logueado
      if (!video.requiresPlan || video.requiresPlan.length === 0) {
        canAccess = true;
      } else {
        // Si tiene planes, el usuario debe tener al menos uno de ellos o un plan superior
        canAccess = video.requiresPlan.some(requiredPlanKey => {
            const requiredPlanLevel = planHierarchy[requiredPlanKey] || 0;
            return userPlanLevel >= requiredPlanLevel;
        });
      }
    }

    if (!canAccess) return res.status(403).json({ error: "Acceso denegado a este video según tu plan." });
    
    // Devuelve el video completo o un formato específico para Watch.jsx
    res.json({ 
        id: video._id, 
        name: video.title, 
        url: video.url, 
        description: video.description,
        // ... otros campos que Watch.jsx necesite
    });
  } catch (err) { next(err); }
});


// POST /api/videos/upload-link (Crear un VOD - Protegida por Admin)
router.post("/upload-link", verifyToken, isAdmin, async (req, res, next) => {
  try {
    const { title, url, tipo, mainSection, requiresPlan, genres, description, trailerUrl, releaseYear, isFeatured, active, logo, customThumbnail } = req.body;

    // Validaciones básicas
    if (!title || !url || !tipo) {
      return res.status(400).json({ error: "Título, URL y Tipo son obligatorios." });
    }
    if (tipo && !Video.schema.path('tipo').enumValues.includes(tipo)) {
      return res.status(400).json({ error: `Tipo de VOD inválido: '${tipo}'. Válidos: ${Video.schema.path('tipo').enumValues.join(', ')}` });
    }
    if (mainSection && !Video.schema.path('mainSection').enumValues.includes(mainSection)) {
      return res.status(400).json({ error: `Sección principal inválida: '${mainSection}'. Válidas: ${Video.schema.path('mainSection').enumValues.join(', ')}` });
    }

    // --- INICIO: VALIDACIÓN DE requiresPlan CORREGIDA ---
    if (requiresPlan) {
      const plansToCheck = Array.isArray(requiresPlan) ? requiresPlan : [requiresPlan];
      const validEnumPlans = Video.schema.path('requiresPlan.0')?.caster?.enumValues;

      if (!validEnumPlans) {
          console.error("Error de configuración del Schema: EnumValues para 'requiresPlan' no encontrados. Verifica Video.model.js.");
          return res.status(500).json({ error: "Error de configuración del servidor al validar planes." });
      }
      
      for (const plan of plansToCheck) {
        if (plan && !validEnumPlans.includes(plan)) { 
          return res.status(400).json({ error: `Plan requerido inválido: '${plan}' no es una opción válida. Opciones válidas: ${validEnumPlans.join(', ')}` });
        }
      }
    }
    // --- FIN: VALIDACIÓN DE requiresPlan CORREGIDA ---

    const videoData = new Video({
      title,
      description,
      url,
      tipo,
      mainSection: mainSection || Video.schema.path('mainSection').defaultValue,
      genres: Array.isArray(genres) ? genres : (genres ? genres.split(',').map(g => g.trim()).filter(g => g) : []),
      requiresPlan: requiresPlan || [], // Asegura que sea un array, incluso si es vacío
      releaseYear,
      isFeatured,
      active,
      logo,
      customThumbnail,
      // tmdbThumbnail se podría obtener aquí si no se provee logo/customThumbnail
      trailerUrl,
      // user: req.user.id // Si quieres guardar quién lo creó
    });

    const savedVideo = await videoData.save();
    res.status(201).json({ message: "Video VOD guardado exitosamente.", video: savedVideo });
  } catch (error) { 
    console.error("Error en POST /api/videos/upload-link:", error);
    next(error); 
  }
});

// PUT /api/videos/:id (Actualizar VOD - Protegida por Admin)
router.put("/:id", verifyToken, isAdmin, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "ID de video con formato inválido." });
    }
    const { title, url, tipo, mainSection, requiresPlan, genres, description, trailerUrl, releaseYear, isFeatured, active, logo, customThumbnail } = req.body;

    // Validaciones (similares a la creación)
    if (tipo && !Video.schema.path('tipo').enumValues.includes(tipo)) {
      return res.status(400).json({ error: `Tipo de VOD inválido: '${tipo}'.` });
    }
    if (mainSection && !Video.schema.path('mainSection').enumValues.includes(mainSection)) {
      return res.status(400).json({ error: `Sección principal inválida: '${mainSection}'.` });
    }
    
    // --- INICIO: VALIDACIÓN DE requiresPlan CORREGIDA ---
    if (requiresPlan) {
      const plansToCheck = Array.isArray(requiresPlan) ? requiresPlan : [requiresPlan];
      const validEnumPlans = Video.schema.path('requiresPlan.0')?.caster?.enumValues;

      if (!validEnumPlans) {
          console.error("Error de configuración del Schema: EnumValues para 'requiresPlan' no encontrados. Verifica Video.model.js.");
          return res.status(500).json({ error: "Error de configuración del servidor al validar planes." });
      }
      
      for (const plan of plansToCheck) {
        if (plan && !validEnumPlans.includes(plan)) { 
          return res.status(400).json({ error: `Plan requerido inválido: '${plan}' no es una opción válida. Opciones válidas: ${validEnumPlans.join(', ')}` });
        }
      }
    }
    // --- FIN: VALIDACIÓN DE requiresPlan CORREGIDA ---

    const updateData = {
      title, url, tipo, mainSection, requiresPlan: requiresPlan || [],
      genres: Array.isArray(genres) ? genres : (genres ? genres.split(',').map(g => g.trim()).filter(g => g) : undefined), // undefined para no sobreescribir con array vacío si no se envía
      description, trailerUrl, releaseYear, isFeatured, active, logo, customThumbnail
    };

    // Remover campos undefined para que no se sobreescriban en la DB si no se envían
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    const updatedVideo = await Video.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updatedVideo) return res.status(404).json({ error: "Video no encontrado para actualizar." });

    res.json({ message: "Video VOD actualizado exitosamente.", video: updatedVideo });
  } catch (error) { 
    console.error(`Error en PUT /api/videos/${req.params.id}:`, error);
    next(error); 
  }
});

// DELETE /api/videos/:id (Eliminar VOD - Protegida por Admin)
router.delete("/:id", verifyToken, isAdmin, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "ID de video con formato inválido." });
    }
    const deletedVideo = await Video.findByIdAndDelete(req.params.id);
    if (!deletedVideo) return res.status(404).json({ error: "Video no encontrado para eliminar." });
    res.json({ message: "Video VOD eliminado exitosamente." });
  } catch (error) { 
    console.error(`Error en DELETE /api/videos/${req.params.id}:`, error);
    next(error); 
  }
});

// Ruta para procesar M3U (POST /api/videos/upload-m3u) - Ya la tenías, la dejo por si la usas para algo relacionado a videos.
// Si es solo para canales, debería estar en channels.routes.js
router.post("/upload-m3u", verifyToken, isAdmin, upload.single("file"), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: "No se proporcionó ningún archivo M3U." });
  console.log(`BACKEND /api/videos/upload-m3u: Procesando archivo ${req.file.filename}`);
  // Aquí iría tu lógica para parsear el M3U y, si es para VODs, guardarlos en la colección 'Video'.
  // Si es para canales, esta ruta podría estar mejor en channels.routes.js
  try {
    // Ejemplo: const entriesAdded = await processM3UFileAndSaveAsVideos(req.file.path, req.user.id);
    res.json({ message: "M3U procesado (lógica de ejemplo para VODs).", entriesAdded: 0 /* Reemplaza con el número real */ });
  } catch (error) {
    console.error("Error procesando M3U para VODs:", error);
    next(error);
  }
});


export default router;
