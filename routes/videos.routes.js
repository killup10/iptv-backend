import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import Video from "../models/Video.js";
import getTMDBThumbnail from "../utils/getTMDBThumbnail.js";
// Asegúrate que la lógica en 'getContinueWatching' es la que corregimos en el controlador
import { getContinueWatching, createBatchVideosFromTextAdmin } from "../controllers/videos.controller.js";

const router = express.Router();

// Configuración de Multer
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

// === RUTAS PÚBLICAS Y DE SECCIONES ===
router.get("/public/featured-movies", async (req, res, next) => {
  try {
    const criteria = { tipo: "pelicula", isFeatured: true, active: true };
    const movies = await Video.find(criteria).sort({ createdAt: -1 }).limit(10);
   const mapVODToPublicFormat = (v) => ({
  id: v._id,
  _id: v._id,
  name: v.title,
  title: v.title,
  releaseYear: v.releaseYear || null, // 👈 NECESARIO
  description: v.description || "",
  genres: v.genres || [],
  thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || "/img/placeholder-default.png",
  trailerUrl: v.trailerUrl || ""
});
    res.json(movies.map(mapVODToPublicFormat));
  } catch (error) { 
    console.error("Error en BACKEND /public/featured-movies:", error);
    next(error); 
  }
});

router.get("/public/featured-series", async (req, res, next) => {
  try {
    const criteria = { tipo: "serie", isFeatured: true, active: true };
    const series = await Video.find(criteria).sort({ createdAt: -1 }).limit(10);
   const mapVODToPublicFormat = (v) => ({
  id: v._id,
  _id: v._id,
  name: v.title,
  title: v.title,
  releaseYear: v.releaseYear || null, // 👈 NECESARIO
  description: v.description || "",
  genres: v.genres || [],
  thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || "/img/placeholder-default.png",
  trailerUrl: v.trailerUrl || ""
});
    res.json(series.map(mapVODToPublicFormat));
  } catch (error) {
    console.error("Error en BACKEND /public/featured-series:", error.message);
        next(error);
  }
});

router.get("/public/featured-animes", async (req, res, next) => {
  try {
    const criteria = { tipo: "anime", isFeatured: true, active: true };
    const animes = await Video.find(criteria).sort({ createdAt: -1 }).limit(10);
    const mapVODToPublicFormat = (v) => ({
      id: v._id,
      _id: v._id,
      name: v.title,
      title: v.title,
      releaseYear: v.releaseYear || null,
      description: v.description || "",
      genres: v.genres || [],
      thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || "/img/placeholder-default.png",
      trailerUrl: v.trailerUrl || ""
    });
    res.json(animes.map(mapVODToPublicFormat));
  } catch (error) {
    console.error("Error en BACKEND /public/featured-animes:", error.message);
    next(error);
  }
});

router.get("/main-sections", verifyToken, async (req, res, next) => {
  try {
    const ALL_POSSIBLE_SECTIONS = [
      { key: "POR_GENERO", displayName: "POR GÉNEROS", thumbnailSample: "/img/placeholders/por_generos.jpg", requiresPlan: "gplay", order: 0 },
      { key: "ESPECIALES", displayName: "ESPECIALES (Festividades)", thumbnailSample: "/img/placeholders/especiales.jpg", requiresPlan: "gplay", order: 1 },
      { key: "CINE_2025", displayName: "CINE 2025 (Estrenos)", thumbnailSample: "/img/placeholders/cine_2025.jpg", requiresPlan: "premium", order: 2 },
      { key: "CINE_4K", displayName: "CINE 4K", thumbnailSample: "/img/placeholders/cine_4k.jpg", requiresPlan: "premium", order: 3 },
      { key: "CINE_60FPS", displayName: "CINE 60 FPS", thumbnailSample: "/img/placeholders/cine_60fps.jpg", requiresPlan: "premium", order: 4 },
    ];

    // Ahora devolvemos todas las secciones sin importar el plan
    const allSections = [...ALL_POSSIBLE_SECTIONS];

    // Opcional: Actualizar los thumbnails dinámicamente
    for (let section of allSections) {
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

    console.log(`BACKEND /main-sections - Mostrando todas las secciones (sin filtrar por plan): ${allSections.map(s => s.key).join(', ')}`);
    res.json(allSections.sort((a, b) => a.order - b.order));
  } catch (error) {
    console.error("Error en GET /api/videos/main-sections:", error);
    next(error);
  }
});


// === RUTAS DE PROGRESO (LA LÓGICA CLAVE) ===

// Llama al controlador corregido para obtener la lista "Continuar Viendo"
router.get("/user/continue-watching", verifyToken, getContinueWatching);

// Obtiene el progreso de un video específico para el usuario actual
router.get("/:id/progress", verifyToken, async (req, res, next) => {
  try {
    const videoId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(videoId)) {
      return res.status(400).json({ error: "ID de video con formato inválido." });
    }
    const userId = req.user.id;

    const video = await Video.findOne(
      { _id: new mongoose.Types.ObjectId(videoId) },
      { watchProgress: { $elemMatch: { userId: new mongoose.Types.ObjectId(userId) } } }
    ).select('watchProgress');

    if (!video || !video.watchProgress || video.watchProgress.length === 0) {
      return res.json({ 
        watchProgress: { userId, lastChapter: 0, lastTime: 0, lastWatched: null, completed: false }
      });
    }
    
    res.json({ watchProgress: video.watchProgress[0] });
  } catch (error) {
    console.error(`Error en GET /:id/progress para user ${req.user?.id}:`, error);
    next(error);
  }
});

// Guarda/Actualiza el progreso de un video específico para el usuario actual
router.put("/:id/progress", verifyToken, async (req, res, next) => {
  try {
    const videoId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(videoId)) {
      return res.status(400).json({ error: "ID de video con formato inválido." });
    }
    const userId = req.user.id;
    const { lastChapter, lastTime, completed } = req.body;

    if (typeof lastTime !== 'number' || lastTime < 0) {
      return res.status(400).json({ error: "lastTime debe ser un número positivo." });
    }

    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ error: "Video no encontrado." });

    const progressIndex = video.watchProgress.findIndex(p => p.userId.toString() === userId);
    let userProgressEntry;

    if (progressIndex > -1) {
      // Actualiza la entrada existente
      video.watchProgress[progressIndex].lastTime = lastTime;
      if (lastChapter !== undefined) video.watchProgress[progressIndex].lastChapter = lastChapter;
      if (completed !== undefined) video.watchProgress[progressIndex].completed = completed;
      video.watchProgress[progressIndex].lastWatched = new Date();
      userProgressEntry = video.watchProgress[progressIndex];
    } else {
      // Crea una nueva entrada de progreso para el usuario
      const newProgress = {
        userId: new mongoose.Types.ObjectId(userId),
        lastTime,
        lastChapter: lastChapter !== undefined ? lastChapter : 0,
        completed: completed !== undefined ? completed : false,
        lastWatched: new Date()
      };
      video.watchProgress.push(newProgress);
      userProgressEntry = newProgress;
    }

    await video.save();

    res.json({ message: "Progreso actualizado.", watchProgress: userProgressEntry });
  } catch (error) {
    console.error(`Error en PUT /:id/progress para user ${req.user?.id}:`, error);
    next(error);
  }
});


// === OTRAS RUTAS DE VÍDEO (CRUD, etc.) ===

// GET /api/videos (Listar VODs para usuarios y admin con PAGINACIÓN Y BÚSQUEDA)
router.get("/", verifyToken, async (req, res, next) => {
  try {
    const userPlan = req.user.plan || 'gplay';
    const isAdminView = req.user.role === 'admin' && req.query.view === 'admin';
    let query = {}; 

    if (isAdminView) {
      console.log("BACKEND GET /api/videos - Es AdminView.");
      if (req.query.active === 'true') query.active = true;
      if (req.query.active === 'false') query.active = false;
    } else {
      query.active = true; 
      const planHierarchy = { 'gplay': 1, 'estandar': 2, 'sports': 3, 'cinefilo': 4, 'premium': 5 };
      const userPlanLevel = planHierarchy[userPlan] || 0;
      const accessiblePlanKeys = Object.keys(planHierarchy).filter(
        planKey => planHierarchy[planKey] <= userPlanLevel
      );
      query.requiresPlan = { $in: accessiblePlanKeys };
    }

    if (req.query.mainSection && req.query.mainSection !== "POR_GENERO") query.mainSection = req.query.mainSection;
    if (req.query.genre && req.query.genre !== "Todas") query.genres = req.query.genre;
    
    // Handle excludeTipo parameter
    if (req.query.excludeTipo) {
      query.tipo = { $ne: req.query.excludeTipo };
    }
    
    // Handle tipo and subtipo for proper anime filtering
    if (req.query.tipo === 'serie' && req.query.subtipo === 'anime') {
      // If requesting anime series, look for either tipo: 'anime' or (tipo: 'serie' and subtipo: 'anime')
      query.$or = [
        { tipo: 'anime' },
        { tipo: 'serie', subtipo: 'anime' }
      ];
    } else if (req.query.tipo) {
      query.tipo = req.query.tipo;
    }
    
    // Aplicar filtro de búsqueda usando el índice de texto
    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }
    
    // Lógica de paginación
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15; // Límite por defecto
    const skip = (page - 1) * limit;

     // Determinar opción de ordenamiento
    let sortOption = { createdAt: -1 };
    if (req.query.search) {
      sortOption = { score: { $meta: "textScore" } };
    } else if (req.query.sort === 'alphabetical' || (req.query.tipo === 'pelicula' && !req.query.sort)) {
      // Por defecto ordenamos alfabéticamente las películas si no se especifica otro orden
      sortOption = { title: 1 };
    }


    // Ejecutar consulta para obtener videos de la página actual
    const videos = await Video.find(query)
  .sort(sortOption)
  .limit(limit)
  .skip(skip);
                                  
    // Ejecutar consulta para obtener la cantidad total de documentos que coinciden
    const total = await Video.countDocuments(query);
    
    const mapToUserFormat = (v) => ({ 
      id: v._id,
        _id: v._id,
        name: v.title,
        title: v.title,
      thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || "", 
      url: v.url, mainSection: v.mainSection, genres: v.genres, 
      description: v.description || "", trailerUrl: v.trailerUrl || "", 
      tipo: v.tipo,
      subcategoria: v.tipo === "serie" ? (v.subcategoria || "Netflix") : undefined,
      requiresPlan: v.requiresPlan 
    });
    
    const mapToFullAdminFormat = (v) => ({ 
      id: v._id, _id: v._id, title: v.title, name: v.title, 
      description: v.description, url: v.url, tipo: v.tipo, 
      mainSection: v.mainSection, genres: v.genres, 
      requiresPlan: v.requiresPlan, releaseYear: v.releaseYear, 
      isFeatured: v.isFeatured, logo: v.logo, thumbnail: v.logo, 
      customThumbnail: v.customThumbnail, tmdbThumbnail: v.tmdbThumbnail, 
      trailerUrl: v.trailerUrl, active: v.active,
      subcategoria: v.tipo === "serie" ? (v.subcategoria || "Netflix") : undefined,
      user: v.user, createdAt: v.createdAt, updatedAt: v.updatedAt 
    });

    // Devolver resultados paginados y el total
    res.json({
      videos: isAdminView ? videos.map(mapToFullAdminFormat) : videos.map(mapToUserFormat),
      total: total,
      page: page,
      pages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error("Error en BACKEND GET /api/videos:", error);
    next(error); 
  }
});


// POST /api/videos (Crear un VOD - usado por AdminPanel)
router.post("/", verifyToken, isAdmin, async (req, res, next) => {
  try {
    const { title, description, url, tipo, mainSection, requiresPlan, genres, trailerUrl, releaseYear, isFeatured, active, logo, customThumbnail, chapters } = req.body;

    if (!title) return res.status(400).json({ error: "Título es obligatorio." });
    const validTipos = ["pelicula", "serie", "anime", "dorama", "novela", "documental"];
    if (tipo && !validTipos.includes(tipo)) {
      return res.status(400).json({ error: `Tipo de VOD inválido: '${tipo}'. Tipos válidos: ${validTipos.join(', ')}` });
    }
    if (tipo === "pelicula" && !url) {
      return res.status(400).json({ error: "URL es obligatoria para películas." });
    }
    if (tipo !== "pelicula" && (!chapters || chapters.length === 0)) {
      return res.status(400).json({ error: "Capítulos son obligatorios para series/anime/dorama/novela/documental." });
    }
     if (tipo === "serie") {
      const validSubcategorias = ["Netflix", "Prime Video", "Disney", "Apple TV", "Hulu y Otros", "Retro", "Animadas"];
      if (!req.body.subcategoria || !validSubcategorias.includes(req.body.subcategoria)) {
        return res.status(400).json({ 
          error: `Subcategoría inválida para serie. Opciones válidas: ${validSubcategorias.join(', ')}`,
          validSubcategorias
        });
      }
    }
    if (chapters && chapters.length > 0) {
      const invalidChapters = chapters.filter(ch => !ch.title || !ch.url);
      if (invalidChapters.length > 0) {
        return res.status(400).json({ error: "Todos los capítulos deben tener título y URL." });
      }
    }
    if (mainSection && !Video.schema.path('mainSection').enumValues.includes(mainSection)) {
      return res.status(400).json({ error: `Sección principal inválida: '${mainSection}'.` });
    }
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
      watchProgress: [] // Correcto: Inicializar como array vacío para progreso multiusuario
    });
     if (!videoData.logo && !videoData.customThumbnail && videoData.title) {
      videoData.tmdbThumbnail = await getTMDBThumbnail(videoData.title);
    }

    const savedVideo = await videoData.save();
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
    
    const videoData = new Video({
      title, description, url, tipo,
      mainSection: mainSection || Video.schema.path('mainSection').defaultValue,
      genres: Array.isArray(genres) ? genres : (genres ? genres.split(',').map(g => g.trim()).filter(g => g) : []),
      requiresPlan: requiresPlan || [],
      releaseYear, isFeatured, active, logo, customThumbnail, trailerUrl,
      watchProgress: [] // Correcto: Inicializar como array vacío
    });

    const savedVideo = await videoData.save();
    res.status(201).json({ message: "Video VOD guardado exitosamente.", video: savedVideo });
  } catch (error) {
    console.error("Error en POST /api/videos/upload-link:", error);
    next(error); 
  }
});

// POST /api/videos/upload-text (Procesar archivo de texto/M3U para crear VODs en lote)
router.post("/upload-text", verifyToken, isAdmin, multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    fieldSize: 50 * 1024 * 1024
  }
}).single("file"), createBatchVideosFromTextAdmin);

// POST /api/videos/upload-m3u
router.post("/upload-m3u", verifyToken, isAdmin, upload.single("file"), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: "No se proporcionó ningún archivo M3U." });
  console.log(`BACKEND /api/videos/upload-m3u: Procesando archivo ${req.file.filename}`);
  try {
    res.json({ message: "M3U procesado (lógica de ejemplo para VODs).", entriesAdded: 0 });
  } catch (error) {
    console.error("Error procesando M3U para VODs:", error);
    next(error);
  }
});


// === Rutas Genéricas por ID (Definidas al final para evitar conflictos) ===

// GET /api/videos/:id
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
    res.json(response);
  } catch (err) { next(err); }
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
    if (tipo === "serie" || (await Video.findById(req.params.id)).tipo === "serie") {
      const validSubcategorias = ["Netflix", "Prime Video", "Disney", "Apple TV", "Hulu y Otros", "Retro", "Animadas"];
      if (req.body.subcategoria && !validSubcategorias.includes(req.body.subcategoria)) {
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
      chapters: Array.isArray(chapters) ? chapters : undefined,
      subcategoria: tipo === "serie" ? req.body.subcategoria : undefined
    };
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    const updatedVideo = await Video.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true });
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

export default router;