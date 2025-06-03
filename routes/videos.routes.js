// iptv-backend/routes/videos.routes.js
import express from "express";
import multer from "multer";
// fs y readline no parecen usarse, puedes eliminarlos si no los necesitas para otra cosa aquí.
// import fs from "fs";
// import readline from "readline";
import mongoose from "mongoose";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import Video from "../models/Video.js";
// Channel y getTMDBThumbnail no parecen usarse directamente en las funciones de este router.
// import Channel from "../models/Channel.js"; 
// import getTMDBThumbnail from "../utils/getTMDBThumbnail.js";

const router = express.Router();

// Configuración de Multer (si la usas para M3U en este archivo)
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
    const userPlan = req.user.plan || 'gplay';
    const isAdminUser = req.user.role === 'admin';
    
    const ALL_POSSIBLE_SECTIONS = [
      { key: "POR_GENERO", displayName: "POR GÉNEROS", thumbnailSample: "/img/placeholders/por_generos.jpg", requiresPlan: "gplay", order: 0 },
      { key: "ESPECIALES", displayName: "ESPECIALES (Festividades)", thumbnailSample: "/img/placeholders/especiales.jpg", requiresPlan: "gplay", order: 1 },
      { key: "CINE_2025", displayName: "CINE 2025 (Estrenos)", thumbnailSample: "/img/placeholders/cine_2025.jpg", requiresPlan: "premium", order: 2 },
      { key: "CINE_4K", displayName: "CINE 4K", thumbnailSample: "/img/placeholders/cine_4k.jpg", requiresPlan: "premium", order: 3 },
      { key: "CINE_60FPS", displayName: "CINE 60 FPS", thumbnailSample: "/img/placeholders/cine_60fps.jpg", requiresPlan: "premium", order: 4 },
    ];

    let accessibleSections = [];
    if (isAdminUser) {
        accessibleSections = ALL_POSSIBLE_SECTIONS;
    } else {
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

// GET /api/videos/public/featured-movies
router.get("/public/featured-movies", async (req, res, next) => {
  try {
    const criteria = { tipo: "pelicula", isFeatured: true, active: true };
    const movies = await Video.find(criteria).sort({ createdAt: -1 }).limit(10);
    const mapVODToPublicFormat = (v) => ({
        id: v._id, _id: v._id, name: v.title, title: v.title,
        thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || "/img/placeholder-default.png",
        trailerUrl: v.trailerUrl || ""
    });
    res.json(movies.map(mapVODToPublicFormat));
  } catch (error) { 
    console.error("Error en BACKEND /public/featured-movies:", error);
    next(error); 
  }
});

// GET /api/videos/public/featured-series
router.get("/public/featured-series", async (req, res, next) => {
  try {
    const criteria = { tipo: "serie", isFeatured: true, active: true };
    const series = await Video.find(criteria).sort({ createdAt: -1 }).limit(10);
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

// GET /api/videos (Listar VODs para usuarios y admin)
router.get("/", verifyToken, async (req, res, next) => {
  try {
    const userPlan = req.user.plan || 'gplay';
    const isAdminView = req.user.role === 'admin' && req.query.view === 'admin';
    let query = { active: true }; // Por defecto, solo activos para usuarios

    if (isAdminView) {
      console.log("BACKEND GET /api/videos - Es AdminView.");
      query = {}; // Admin ve todo por defecto, a menos que filtre
      if (req.query.active === 'true') query.active = true;
      if (req.query.active === 'false') query.active = false;
    } else {
      const planHierarchy = { 'gplay': 1, 'estandar': 2, 'sports': 3, 'cinefilo': 4, 'premium': 5 };
      const userPlanLevel = planHierarchy[userPlan] || 0;
      const accessiblePlanKeys = Object.keys(planHierarchy).filter(
        planKey => planHierarchy[planKey] <= userPlanLevel
      );
      query.requiresPlan = { $in: accessiblePlanKeys };
      // Si un video tiene requiresPlan: [], significa que es accesible por cualquier plan logueado.
      // Podríamos añadir: query.$or = [{ requiresPlan: { $size: 0 } }, { requiresPlan: { $in: accessiblePlanKeys } }];
    }

    if (req.query.mainSection && req.query.mainSection !== "POR_GENERO") query.mainSection = req.query.mainSection;
    if (req.query.genre && req.query.genre !== "Todas") query.genres = req.query.genre;
    if (req.query.tipo) query.tipo = req.query.tipo;
    if (req.query.search) query.$text = { $search: req.query.search };
    
    const videos = await Video.find(query)
                              .sort(req.query.sort || { createdAt: -1 })
                              .limit(parseInt(req.query.limit) || 50)
                              .skip(parseInt(req.query.skip) || 0);
    
    const mapToUserFormat = (v) => ({ 
      id: v._id, 
      _id: v._id, 
      name: v.title, 
      title: v.title, 
      thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || "", 
      url: v.url, 
      mainSection: v.mainSection, 
      genres: v.genres, 
      description: v.description || "", 
      trailerUrl: v.trailerUrl || "", 
      tipo: v.tipo,
      subcategoria: v.tipo === "serie" ? (v.subcategoria || "Netflix") : undefined,
      requiresPlan: v.requiresPlan 
    });
    
    const mapToFullAdminFormat = (v) => ({ 
      id: v._id, 
      _id: v._id, 
      title: v.title, 
      name: v.title, 
      description: v.description, 
      url: v.url, 
      tipo: v.tipo, 
      mainSection: v.mainSection, 
      genres: v.genres, 
      requiresPlan: v.requiresPlan, 
      releaseYear: v.releaseYear, 
      isFeatured: v.isFeatured, 
      logo: v.logo, 
      thumbnail: v.logo, 
      customThumbnail: v.customThumbnail, 
      tmdbThumbnail: v.tmdbThumbnail, 
      trailerUrl: v.trailerUrl, 
      active: v.active,
      subcategoria: v.tipo === "serie" ? (v.subcategoria || "Netflix") : undefined,
      user: v.user, 
      createdAt: v.createdAt, 
      updatedAt: v.updatedAt 
    });

    res.json(isAdminView ? videos.map(mapToFullAdminFormat) : videos.map(mapToUserFormat));
  } catch (error) { 
    console.error("Error en BACKEND GET /api/videos:", error);
    next(error); 
  }
});

// GET /api/videos/:id
router.get("/:id", verifyToken, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "ID de video con formato inválido." });
    }
    
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ error: "Video no encontrado" });

    console.log("[GET /api/videos/:id] Video encontrado:", {
      id: video._id,
      title: video.title,
      tipo: video.tipo,
      chaptersCount: video.chapters?.length || 0
    });

    const userPlan = req.user.plan || 'gplay';
    const isAdminUser = req.user.role === 'admin';
    let canAccess = false;

    if (isAdminUser) {
      canAccess = true;
    } else if (video.active) {
      const planHierarchy = { 'gplay': 1, 'estandar': 2, 'sports': 3, 'cinefilo': 4, 'premium': 5 };
      const userPlanLevel = planHierarchy[userPlan] || 0;
      
      if (!video.requiresPlan || video.requiresPlan.length === 0) {
        canAccess = true;
      } else {
        canAccess = video.requiresPlan.some(requiredPlanKey => {
            const requiredPlanLevel = planHierarchy[requiredPlanKey] || 0;
            return userPlanLevel >= requiredPlanLevel;
        });
      }
    }

    if (!canAccess) return res.status(403).json({ error: "Acceso denegado a este video según tu plan." });
    
    // Asegurarnos de que chapters sea un array incluso si es undefined
    const chapters = Array.isArray(video.chapters) ? video.chapters : [];
    
    const response = {
      id: video._id,
      name: video.title,
      title: video.title,
      url: video.url || "",
      description: video.description || "",
      tipo: video.tipo,
      subcategoria: video.subcategoria,
      chapters: chapters
    };

    console.log("[GET /api/videos/:id] Enviando respuesta:", {
      id: response.id,
      title: response.title,
      tipo: response.tipo,
      chaptersCount: response.chapters.length
    });

    res.json(response);
  } catch (err) { next(err); }
});

// POST /api/videos (Crear un VOD - usado por AdminPanel)
router.post("/", verifyToken, isAdmin, async (req, res, next) => {
  try {
    const { title, description, url, tipo, mainSection, requiresPlan, genres, trailerUrl, releaseYear, isFeatured, active, logo, customThumbnail, chapters } = req.body;

    console.log("POST /api/videos - Datos recibidos:", JSON.stringify(req.body, null, 2));
    console.log("POST /api/videos - Capítulos recibidos:", {
      chaptersExists: !!chapters,
      chaptersLength: chapters?.length || 0,
      chaptersData: chapters
    });

    if (!title) return res.status(400).json({ error: "Título es obligatorio." });
    
    // Validar tipo
    const validTipos = ["pelicula", "serie", "anime", "dorama", "novela", "documental"];
    if (tipo && !validTipos.includes(tipo)) {
      return res.status(400).json({ error: `Tipo de VOD inválido: '${tipo}'. Tipos válidos: ${validTipos.join(', ')}` });
    }

    // Para películas, URL es obligatoria
    if (tipo === "pelicula" && !url) {
      return res.status(400).json({ error: "URL es obligatoria para películas." });
    }

    // Para series/anime/dorama/novela/documental, capítulos son obligatorios
    if (tipo !== "pelicula" && (!chapters || chapters.length === 0)) {
      return res.status(400).json({ error: "Capítulos son obligatorios para series/anime/dorama/novela/documental." });
    }

    // Validar subcategoria para series
    if (tipo === "serie") {
      const validSubcategorias = ["Netflix", "Prime Video", "Disney", "Apple TV", "Hulu y Otros", "Retro", "Animadas"];
      if (!req.body.subcategoria || !validSubcategorias.includes(req.body.subcategoria)) {
        return res.status(400).json({ 
          error: `Subcategoría inválida para serie. Opciones válidas: ${validSubcategorias.join(', ')}`,
          validSubcategorias
        });
      }
    }

    // Validar capítulos si existen
    if (chapters && chapters.length > 0) {
      const invalidChapters = chapters.filter(ch => !ch.title || !ch.url);
      if (invalidChapters.length > 0) {
        return res.status(400).json({ error: "Todos los capítulos deben tener título y URL." });
      }
    }

    // Validar mainSection si se proporciona
    if (mainSection && !Video.schema.path('mainSection').enumValues.includes(mainSection)) {
      return res.status(400).json({ error: `Sección principal inválida: '${mainSection}'.` });
    }

    // Validar requiresPlan si se proporciona
    if (requiresPlan && requiresPlan.length > 0) {
      const validEnumPlans = Video.schema.path('requiresPlan').caster?.enumValues;
      if (!validEnumPlans) {
        console.error("Error de configuración del Schema: EnumValues para 'requiresPlan' no encontrados.");
        return res.status(500).json({ error: "Error de configuración del servidor al validar planes." });
      }
      
      for (const plan of requiresPlan) {
        if (plan && !validEnumPlans.includes(plan)) { 
          return res.status(400).json({ error: `Plan requerido inválido: '${plan}'. Opciones válidas: ${validEnumPlans.join(', ')}` });
        }
      }
    }

    const videoData = new Video({
      title,
      description: description || "",
      url: url || "",
      tipo: tipo || "pelicula",
      subtipo: (tipo !== "pelicula") ? tipo : undefined,
      subcategoria: tipo === "serie" ? req.body.subcategoria : undefined,
      mainSection: mainSection || "POR_GENERO",
      genres: Array.isArray(genres) ? genres : (genres ? genres.split(',').map(g => g.trim()).filter(g => g) : []),
      requiresPlan: requiresPlan || [],
      releaseYear,
      isFeatured: isFeatured || false,
      active: active !== undefined ? active : true,
      logo: logo || "",
      customThumbnail: customThumbnail || "",
      trailerUrl: trailerUrl || "",
      chapters: chapters || [],
      watchProgress: {
        lastChapter: 0,
        lastTime: 0,
        lastWatched: new Date(),
        completed: false
      }
    });

    const savedVideo = await videoData.save();
    console.log("Video guardado exitosamente:", {
      id: savedVideo._id,
      title: savedVideo.title,
      tipo: savedVideo.tipo,
      chaptersCount: savedVideo.chapters?.length || 0
    });
    console.log("Capítulos guardados:", savedVideo.chapters);
    res.status(201).json({ message: "Video VOD guardado exitosamente.", video: savedVideo });
  } catch (error) { 
    console.error("Error en POST /api/videos:", error);
    next(error); 
  }
});

// POST /api/videos/upload-link (Crear un VOD)
router.post("/upload-link", verifyToken, isAdmin, async (req, res, next) => {
  try {
    const { title, url, tipo, mainSection, requiresPlan, genres, description, trailerUrl, releaseYear, isFeatured, active, logo, customThumbnail } = req.body;

    if (!title || !url || !tipo) return res.status(400).json({ error: "Título, URL y Tipo son obligatorios." });
    if (tipo && !Video.schema.path('tipo').enumValues.includes(tipo)) return res.status(400).json({ error: `Tipo de VOD inválido: '${tipo}'.` });
    if (mainSection && !Video.schema.path('mainSection').enumValues.includes(mainSection)) return res.status(400).json({ error: `Sección principal inválida: '${mainSection}'.` });

    // --- VALIDACIÓN DE requiresPlan CORREGIDA ---
    if (requiresPlan) {
      const plansToCheck = Array.isArray(requiresPlan) ? requiresPlan : [requiresPlan];
      // Intenta acceder a los enumValues a través del 'caster' del SchemaArray
      const validEnumPlans = Video.schema.path('requiresPlan').caster?.enumValues;

      if (!validEnumPlans) {
          console.error("Error de configuración del Schema: EnumValues para 'requiresPlan' no encontrados en el caster. Verifica Video.model.js.");
          return res.status(500).json({ error: "Error de configuración del servidor al validar planes." });
      }
      
      for (const plan of plansToCheck) {
        if (plan && !validEnumPlans.includes(plan)) { 
          return res.status(400).json({ error: `Plan requerido inválido: '${plan}' no es una opción válida. Opciones válidas: ${validEnumPlans.join(', ')}` });
        }
      }
    }
    // --- FIN VALIDACIÓN ---

    const videoData = new Video({
      title, description, url, tipo,
      mainSection: mainSection || Video.schema.path('mainSection').defaultValue,
      genres: Array.isArray(genres) ? genres : (genres ? genres.split(',').map(g => g.trim()).filter(g => g) : []),
      requiresPlan: requiresPlan || [],
      releaseYear, isFeatured, active, logo, customThumbnail, trailerUrl,
      // user: req.user.id 
    });

    const savedVideo = await videoData.save();
    res.status(201).json({ message: "Video VOD guardado exitosamente.", video: savedVideo });
  } catch (error) { 
    console.error("Error en POST /api/videos/upload-link:", error);
    next(error); 
  }
});

// PUT /api/videos/:id (Actualizar VOD)
router.put("/:id", verifyToken, isAdmin, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "ID de video con formato inválido." });
    }
    const { title, url, tipo, mainSection, requiresPlan, genres, description, trailerUrl, releaseYear, isFeatured, active, logo, customThumbnail, chapters } = req.body;

    if (tipo && !Video.schema.path('tipo').enumValues.includes(tipo)) return res.status(400).json({ error: `Tipo de VOD inválido: '${tipo}'.` });
    if (mainSection && !Video.schema.path('mainSection').enumValues.includes(mainSection)) return res.status(400).json({ error: `Sección principal inválida: '${mainSection}'.` });
    
    // --- VALIDACIÓN DE requiresPlan CORREGIDA ---
    if (requiresPlan) {
      const plansToCheck = Array.isArray(requiresPlan) ? requiresPlan : [requiresPlan];
      const validEnumPlans = Video.schema.path('requiresPlan').caster?.enumValues;

      if (!validEnumPlans) {
          console.error("Error de configuración del Schema: EnumValues para 'requiresPlan' no encontrados en el caster. Verifica Video.model.js.");
          return res.status(500).json({ error: "Error de configuración del servidor al validar planes." });
      }
      
      for (const plan of plansToCheck) {
        if (plan && !validEnumPlans.includes(plan)) { 
          return res.status(400).json({ error: `Plan requerido inválido: '${plan}' no es una opción válida. Opciones válidas: ${validEnumPlans.join(', ')}` });
        }
      }
    }
    // --- FIN VALIDACIÓN ---

    // Validar subcategoria para series si se está actualizando el tipo a serie o si ya es serie
    if (tipo === "serie" || (await Video.findById(req.params.id)).tipo === "serie") {
      const validSubcategorias = ["Netflix", "Prime Video", "Disney", "Apple TV", "Hulu y Otros", "Retro", "Animadas"];
      if (!req.body.subcategoria || !validSubcategorias.includes(req.body.subcategoria)) {
        return res.status(400).json({ 
          error: `Subcategoría inválida para serie. Opciones válidas: ${validSubcategorias.join(', ')}`,
          validSubcategorias
        });
      }
    }

    const updateData = {
      title, url, tipo, mainSection, requiresPlan: requiresPlan || [],
      genres: Array.isArray(genres) ? genres : (genres ? genres.split(',').map(g => g.trim()).filter(g => g) : undefined),
      description, trailerUrl, releaseYear, isFeatured, active, logo, customThumbnail,
      chapters: chapters || [],
      subcategoria: tipo === "serie" ? req.body.subcategoria : undefined
    };
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    const updatedVideo = await Video.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updatedVideo) return res.status(404).json({ error: "Video no encontrado para actualizar." });

    res.json({ message: "Video VOD actualizado exitosamente.", video: updatedVideo });
  } catch (error) { 
    console.error(`Error en PUT /api/videos/${req.params.id}:`, error);
    next(error); 
  }
});

// DELETE /api/videos/:id
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

// POST /api/videos/upload-m3u (Si es para VODs, si no, mover a channels.routes.js)
router.post("/upload-m3u", verifyToken, isAdmin, upload.single("file"), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: "No se proporcionó ningún archivo M3U." });
  console.log(`BACKEND /api/videos/upload-m3u: Procesando archivo ${req.file.filename}`);
  try {
    // Implementa tu lógica para procesar el M3U y crear VODs si es necesario
    res.json({ message: "M3U procesado (lógica de ejemplo para VODs).", entriesAdded: 0 });
  } catch (error) {
    console.error("Error procesando M3U para VODs:", error);
    next(error);
  }
});

export default router;
