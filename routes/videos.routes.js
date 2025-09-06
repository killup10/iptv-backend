// killup10/iptv-backend/iptv-backend-103b293ee910f99c02b8b8655c6b8fcaa32c7440/routes/videos.routes.js
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import Video from "../models/Video.js";
import UserProgress from "../models/UserProgress.js";
import getTMDBThumbnail from "../utils/getTMDBThumbnail.js";
// Asegúrate que la lógica en 'getContinueWatching' es la que corregimos en el controlador
import { getContinueWatching, createBatchVideosFromTextAdmin, deleteBatchVideosAdmin, updateVideoAdmin } from "../controllers/videos.controller.js";



const router = express.Router();

// Helper: compute a displayable rating from multiple possible fields.
// Compute a normalized display value and optional textual label for ratings.
function computeRating(v) {
  const candidates = {
    tmdb: typeof v.tmdbRating === 'number' ? v.tmdbRating : null,
    rating: v.rating ?? null,
    vote_average: v.vote_average ?? null,
    ranking: v.ranking ?? null,
    rankingLabel: v.rankingLabel ?? null,
    ratingText: v.ratingText ?? null,
    displayRating: v.displayRating ?? null,
    rating_tmdb: v.rating_tmdb ?? null,
  };

  // Prefer explicit string labels when present (e.g. 'tbdt', '16+')
  const textual = [candidates.rankingLabel, candidates.ratingText, candidates.displayRating].find(x => typeof x === 'string' && x.trim() !== '' && x.toLowerCase() !== 'null');
  if (textual) return { display: textual, label: textual };

  // Prefer tmdb numeric when available
  const numeric = candidates.tmdb ?? candidates.rating ?? candidates.vote_average ?? candidates.ranking ?? candidates.rating_tmdb;
  if (numeric !== undefined && numeric !== null && numeric !== '') {
    const num = Number(numeric);
    if (!Number.isNaN(num)) {
      return { display: Number(num).toFixed(1), label: null };
    }
    // numeric-like string
    if (!isNaN(Number(String(numeric)))) return { display: Number(String(numeric)).toFixed(1), label: null };
  }

  return { display: null, label: null };
}

// Normaliza y prioriza el valor que mostramos como 'ratingDisplay' en las respuestas.
function computeRatingDisplay(v) {
  try {
    const computed = computeRating(v || {});
    const persistedDisplay = v?.ratingDisplay ?? null;
    const persistedLabel = v?.ratingLabel ?? null;
    // Prioriza: valor persistido > valor computado numérico > label persistido
    return persistedDisplay || computed.display || persistedLabel || null;
  } catch (e) {
    return null;
  }
}

// Helper: build absolute URL for uploaded or static assets so frontend can load images
function makeFullUrl(req, p) {
  if (!p) return '';
  if (typeof p !== 'string') return '';
  if (p.startsWith('http')) return p;
  const host = req?.get ? `${req.protocol}://${req.get('host')}` : '';
  if (!host) return p;
  if (p.startsWith('/')) return host + p;
  return host + '/' + p;
}

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
      const mapVODToPublicFormat = (v) => {
        const computed = computeRating(v);
        const persistedDisplay = v.ratingDisplay ?? null;
        const persistedLabel = v.ratingLabel ?? null;
        const finalDisplay = persistedDisplay || computed.display;
        const finalLabel = persistedLabel || computed.label;
        return ({
      id: v._id,
      _id: v._id,
      name: v.title,
      title: v.title,
      releaseYear: v.releaseYear || null, 
      description: v.description || "",
      genres: v.genres || [],
      mainSection: v.mainSection || "",
  // Provide absolute URLs and include alternate image fields for the frontend
  // Priorizar la miniatura personalizada (customThumbnail) sobre logo (TMDB)
  thumbnail: v.customThumbnail || v.logo || v.tmdbThumbnail || makeFullUrl(req, "/img/placeholder-default.png"),
  logo: makeFullUrl(req, v.logo || ''),
  customThumbnail: makeFullUrl(req, v.customThumbnail || ''),
  tmdbThumbnail: makeFullUrl(req, v.tmdbThumbnail || ''),
      tmdbRating: (typeof v.tmdbRating === 'number' ? v.tmdbRating : (v.rating ?? v.vote_average ?? null)),
      ratingDisplay: finalDisplay,
      ratingLabel: finalLabel,
      trailerUrl: v.trailerUrl || ""
    });
    };
    res.json(movies.map(mapVODToPublicFormat));
  } catch (error) { 
    console.error("Error en BACKEND /public/featured-movies:", error);
    next(error); 
  }
});

router.get("/public/featured-series", async (req, res, next) => {
  try {
    // CORRECCIÓN: Busca series que no sean animes.
    const criteria = { 
      tipo: { $in: ["serie", "dorama", "novela", "documental"] }, 
      isFeatured: true, 
      active: true 
    };
    const series = await Video.find(criteria).sort({ createdAt: -1 }).limit(10);
    const mapVODToPublicFormat = (v) => {
      const computed = computeRating(v);
      const persistedDisplay = v.ratingDisplay ?? null;
      const persistedLabel = v.ratingLabel ?? null;
      const finalDisplay = persistedDisplay || computed.display;
      const finalLabel = persistedLabel || computed.label;
      return ({
      id: v._id,
      _id: v._id,
      name: v.title,
      title: v.title,
      releaseYear: v.releaseYear || null,
      description: v.description || "",
      genres: v.genres || [],
      mainSection: v.mainSection || "",
  // Priorizar customThumbnail para que la imagen pegada en Admin se muestre primero
  thumbnail: v.customThumbnail || v.logo || v.tmdbThumbnail || makeFullUrl(req, "/img/placeholder-default.png"),
      logo: makeFullUrl(req, v.logo || ''),
      customThumbnail: makeFullUrl(req, v.customThumbnail || ''),
      tmdbThumbnail: makeFullUrl(req, v.tmdbThumbnail || ''),
      tmdbRating: (typeof v.tmdbRating === 'number' ? v.tmdbRating : (v.rating ?? v.vote_average ?? null)),
      ratingDisplay: finalDisplay,
      ratingLabel: finalLabel,
      trailerUrl: v.trailerUrl || ""
    });
    };
    res.json(series.map(mapVODToPublicFormat));
  } catch (error) {
    console.error("Error en BACKEND /public/featured-series:", error.message);
    next(error);
  }
});

router.get("/public/featured-animes", async (req, res, next) => {
  try {
    // CORRECCIÓN: Unifica la búsqueda de animes, sin importar si su tipo es 'anime' o 'serie' con subtipo 'anime'.
    const criteria = { 
      $or: [{ tipo: "anime" }, { tipo: "serie", subtipo: "anime" }], 
      isFeatured: true, 
      active: true 
    };
    const animes = await Video.find(criteria).sort({ createdAt: -1 }).limit(10);
    const mapVODToPublicFormat = (v) => {
      const computed = computeRating(v);
      const persistedDisplay = v.ratingDisplay ?? null;
      const persistedLabel = v.ratingLabel ?? null;
      const finalDisplay = persistedDisplay || computed.display;
      const finalLabel = persistedLabel || computed.label;
      return ({
      id: v._id,
      _id: v._id,
      name: v.title,
      title: v.title,
      releaseYear: v.releaseYear || null,
      description: v.description || "",
      genres: v.genres || [],
      mainSection: v.mainSection || "",
  // Priorizar customThumbnail aquí también
  thumbnail: v.customThumbnail || v.logo || v.tmdbThumbnail || makeFullUrl(req, "/img/placeholder-default.png"),
  tmdbRating: (typeof v.tmdbRating === 'number' ? v.tmdbRating : (v.rating ?? v.vote_average ?? null)),
  ratingDisplay: finalDisplay,
  ratingLabel: finalLabel,
      trailerUrl: v.trailerUrl || ""
    });
    };
    res.json(animes.map(mapVODToPublicFormat));
  } catch (error) {
    console.error("Error en BACKEND /public/featured-animes:", error.message);
    next(error);
  }
});

router.get("/public/featured-doramas", async (req, res, next) => {
  try {
    const criteria = { 
      tipo: "dorama", 
      isFeatured: true, 
      active: true 
    };
    const doramas = await Video.find(criteria).sort({ createdAt: -1 }).limit(10);
    const mapVODToPublicFormat = (v) => ({
      id: v._id,
      _id: v._id,
      name: v.title,
      title: v.title,
      releaseYear: v.releaseYear || null,
      description: v.description || "",
      genres: v.genres || [],
      mainSection: v.mainSection || "",
  thumbnail: v.customThumbnail || v.logo || v.tmdbThumbnail || makeFullUrl(req, "/img/placeholder-default.png"),
      trailerUrl: v.trailerUrl || ""
    });
    res.json(doramas.map(mapVODToPublicFormat));
  } catch (error) {
    console.error("Error en BACKEND /public/featured-doramas:", error.message);
    next(error);
  }
});

router.get("/public/featured-novelas", async (req, res, next) => {
  try {
    const criteria = { 
      tipo: "novela", 
      isFeatured: true, 
      active: true 
    };
    const novelas = await Video.find(criteria).sort({ createdAt: -1 }).limit(10);
    const mapVODToPublicFormat = (v) => ({
      id: v._id,
      _id: v._id,
      name: v.title,
      title: v.title,
      releaseYear: v.releaseYear || null,
      description: v.description || "",
      genres: v.genres || [],
      mainSection: v.mainSection || "",
  thumbnail: v.customThumbnail || v.logo || v.tmdbThumbnail || makeFullUrl(req, "/img/placeholder-default.png"),
      trailerUrl: v.trailerUrl || ""
    });
    res.json(novelas.map(mapVODToPublicFormat));
  } catch (error) {
    console.error("Error en BACKEND /public/featured-novelas:", error.message);
    next(error);
  }
});

router.get("/public/featured-documentales", async (req, res, next) => {
  try {
    const criteria = { 
      tipo: "documental", 
      isFeatured: true, 
      active: true 
    };
    const documentales = await Video.find(criteria).sort({ createdAt: -1 }).limit(10);
    const mapVODToPublicFormat = (v) => ({
      id: v._id,
      _id: v._id,
      name: v.title,
      title: v.title,
      releaseYear: v.releaseYear || null,
      description: v.description || "",
      genres: v.genres || [],
      mainSection: v.mainSection || "",
  thumbnail: v.customThumbnail || v.logo || v.tmdbThumbnail || makeFullUrl(req, "/img/placeholder-default.png"),
      trailerUrl: v.trailerUrl || ""
    });
    res.json(documentales.map(mapVODToPublicFormat));
  } catch (error) {
    console.error("Error en BACKEND /public/featured-documentales:", error.message);
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
    ].filter(section => section.key !== "ESPECIALES"); // Ocultar la sección "ESPECIALES" temporalmente

    const sectionKeys = ALL_POSSIBLE_SECTIONS
      .map(s => s.key)
      .filter(key => key !== "POR_GENERO");

    const thumbnails = await Video.aggregate([
      {
        $match: {
          mainSection: { $in: sectionKeys },
          active: true,
          logo: { $ne: null, $ne: "" }
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: "$mainSection",
          latestLogo: { $first: "$logo" }
        }
      }
    ]);

    const thumbnailMap = thumbnails.reduce((acc, thumb) => {
      acc[thumb._id] = thumb.latestLogo;
      return acc;
    }, {});

    const allSections = ALL_POSSIBLE_SECTIONS.map(section => {
      if (thumbnailMap[section.key]) {
        return { ...section, thumbnailSample: thumbnailMap[section.key] };
      }
      return section;
    });

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
      // CAMBIO: Inicializar lastSeason a 0 en la respuesta por defecto
      return res.json({ 
        watchProgress: { userId, lastSeason: 0, lastChapter: 0, lastTime: 0, lastWatched: null, completed: false }
      });
    }
    
    // CAMBIO: Asegurarse de que lastSeason exista en la entrada de progreso si no está
    const userProgress = video.watchProgress[0];
    if (userProgress.lastSeason === undefined) {
      userProgress.lastSeason = 0;
    }
    
    res.json({ watchProgress: userProgress });
  } catch (error) {
    console.error(`Error en GET /:id/progress para user ${req.user?.id}:`, error);
    next(error);
  }
});

// Guarda/Actualiza el progreso de un video específico para el usuario actual
router.put("/:id/progress", verifyToken, async (req, res, next) => {
  try {
  try { console.log(`[PUT /api/videos/:id/progress] user=${req.user?.id} video=${req.params.id} body=`, JSON.stringify(req.body)); } catch(e) {}
    const videoId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(videoId)) {
      return res.status(400).json({ error: "ID de video con formato inválido." });
    }
    const userId = req.user.id;
    // CAMBIO: Recibir lastSeason del body
    const { lastSeason, lastChapter, lastTime, completed, progress } = req.body; 

    if (typeof lastTime !== 'number' || lastTime < 0) {
      return res.status(400).json({ error: "lastTime debe ser un número positivo." });
    }
    // CAMBIO: Validar lastSeason si se proporciona
    if (lastSeason !== undefined && typeof lastSeason !== 'number' || lastSeason < 0) {
        return res.status(400).json({ error: "lastSeason debe ser un número positivo o cero." });
    }
    // CAMBIO: Validar progress si se proporciona
    if (progress !== undefined && typeof progress !== 'number' || progress < 0 || progress > 1) {
      return res.status(400).json({ error: "progress debe ser un número entre 0 y 1." });
    }

    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ error: "Video no encontrado." });

    const progressIndex = video.watchProgress.findIndex(p => p.userId.toString() === userId);
    let userProgressEntry;
    const prevLastTime = progressIndex > -1 ? (video.watchProgress[progressIndex].lastTime || 0) : 0;

    if (progressIndex > -1) {
      // Actualiza la entrada existente
      video.watchProgress[progressIndex].lastTime = lastTime;
      if (lastChapter !== undefined) video.watchProgress[progressIndex].lastChapter = lastChapter;
      // CAMBIO: Actualizar lastSeason y progress
      if (lastSeason !== undefined) video.watchProgress[progressIndex].lastSeason = lastSeason;
      if (progress !== undefined) video.watchProgress[progressIndex].progress = progress;

      if (completed !== undefined) video.watchProgress[progressIndex].completed = completed;
      video.watchProgress[progressIndex].lastWatched = new Date();
      userProgressEntry = video.watchProgress[progressIndex];
    } else {
      // Crea una nueva entrada de progreso para el usuario
      const newProgress = {
        userId: new mongoose.Types.ObjectId(userId),
        lastTime,
        lastChapter: lastChapter !== undefined ? lastChapter : 0,
        // CAMBIO: Incluir lastSeason y progress
        lastSeason: lastSeason !== undefined ? lastSeason : 0,
        progress: progress !== undefined ? progress : 0,
        completed: completed !== undefined ? completed : false,
        lastWatched: new Date()
      };
      video.watchProgress.push(newProgress);
      userProgressEntry = newProgress;
    }

    // CAMBIO: Registrar consumo de minutos de prueba si aplica (películas premium sin plan suficiente)
    try {
      // Reutilizar la misma lógica de planes que en GET
      const userPlan = req.user.plan || 'gplay';
      const planHierarchy = { 'gplay': 1, 'estandar': 2, 'sports': 3, 'cinefilo': 4, 'premium': 5 };
      const userPlanLevel = planHierarchy[userPlan] || 0;
      const requires = video.requiresPlan || [];
      let hasDirectAccess = false;
      if (requires.length > 0) {
        hasDirectAccess = requires.some(r => (planHierarchy[r] || 0) <= userPlanLevel);
      }
      const isMovie = video.tipo === 'pelicula';

      if (isMovie && !hasDirectAccess) {
        const deltaSeconds = Math.max(0, (lastTime || 0) - prevLastTime);
        if (deltaSeconds > 0) {
          const deltaMinutes = deltaSeconds / 60; // mantener precisión decimal
          const User = (await import('../models/User.js')).default;
          const user = await User.findById(userId);
          if (user) {
            // Normalizar día
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (!user.dailyTrialUsage.date || user.dailyTrialUsage.date < today) {
              user.dailyTrialUsage.date = today;
              user.dailyTrialUsage.minutesUsed = 0;
            }
            // Asegurar objeto de prueba y normalizar día actual
            if (!user.dailyTrialUsage) {
              user.dailyTrialUsage = {
                date: today,
                minutesUsed: 0,
                maxMinutesPerDay: 60
              };
            } else if (!user.dailyTrialUsage.date || user.dailyTrialUsage.date < today) {
              user.dailyTrialUsage.date = today;
              user.dailyTrialUsage.minutesUsed = 0;
            }
            const maxPerDay = user.dailyTrialUsage.maxMinutesPerDay || 60;
            const usedSoFar = user.dailyTrialUsage.minutesUsed || 0;
            const newUsed = Math.min(maxPerDay, usedSoFar + deltaMinutes);
            user.dailyTrialUsage.minutesUsed = newUsed;
            await user.save();
            try {
              console.log(`[TRIAL] User ${user.username || user._id}: +${deltaMinutes.toFixed(2)} min, used=${newUsed.toFixed(2)}/${maxPerDay}, video=${video._id}`);
            } catch {}
          }
        }
      }
    } catch (tErr) {
      console.warn('Advertencia al registrar consumo de prueba:', tErr?.message || tErr);
    }

    await video.save();

    // --- SINCRONIZAR con colección UserProgress (por-usuario) para que "Continuar viendo" lo detecte ---
    try {
      const updateFields = {
        lastTime: userProgressEntry.lastTime || 0,
        lastSeason: userProgressEntry.lastSeason || 0,
        lastChapter: userProgressEntry.lastChapter || 0,
        completed: !!userProgressEntry.completed,
        lastWatched: userProgressEntry.lastWatched || new Date(),
       
        // CORRECCIÓN: 'progress' en UserProgress SIEMPRE debe ser segundos para que `getContinueWatching` funcione.
        progress: typeof userProgressEntry.lastTime === 'number' ? userProgressEntry.lastTime : 0
      };
    

      const userProgressDoc = await UserProgress.findOneAndUpdate(
        { user: userId, video: video._id },
        { $set: updateFields, $setOnInsert: { user: userId, video: video._id } },
        { upsert: true, new: true }
      ).lean();

      return res.json({ message: "Progreso actualizado.", watchProgress: userProgressEntry, userProgress: userProgressDoc });
    } catch (uErr) {
      console.warn('Advertencia al sincronizar UserProgress:', uErr?.message || uErr);
      return res.json({ message: "Progreso actualizado (video).", watchProgress: userProgressEntry });
    }
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
    }

        if (req.query.mainSection && req.query.mainSection !== "POR_GENERO") {
      query.mainSection = req.query.mainSection;
    } else {
      // If mainSection is not provided or is "POR_GENERO", exclude specific mainSections
      query.mainSection = { $nin: ["CINE_2025", "CINE_4K", "CINE_60FPS"] };
    }
    if (req.query.genre && req.query.genre !== "Todas") query.genres = req.query.genre;
    if (req.query.subcategoria && req.query.subcategoria !== "TODOS") query.subcategoria = req.query.subcategoria;
    
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
      const searchRegex = new RegExp(req.query.search, 'i');
      query.title = searchRegex;
    }
    
    // Lógica de paginación
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; // Límite por defecto
    const skip = (page - 1) * limit;

    // Determinar opción de ordenamiento
    let sortOption = { createdAt: -1 };
    if (req.query.search) {
      sortOption = { title: 1 };
    } else if (req.query.sort === 'alphabetical' || (req.query.tipo === 'pelicula' && !req.query.sort)) {
      // Por defecto ordenamos alfabéticamente las películas si no se especifica otro orden
      sortOption = { title: 1 };
    }


    // Ejecutar consulta para obtener videos de la página actual
    const videos = await Video.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(limit);
                                
    // Ejecutar consulta para obtener la cantidad total de documentos que coinciden
    const total = await Video.countDocuments(query);
    
    const mapToUserFormat = (v) => ({ 
      id: v._id,
      _id: v._id,
      name: v.title,
      title: v.title,
  // Priorizar logo (si es un path/url vertical), luego customThumbnail (URL pegada por admin), luego tmdbThumbnail
  // Priorizar customThumbnail al mapear para usuarios
  thumbnail: v.customThumbnail || v.logo || v.tmdbThumbnail || makeFullUrl(req, "/img/placeholder-default.png"),
  customThumbnail: makeFullUrl(req, v.customThumbnail || ''),
  tmdbThumbnail: makeFullUrl(req, v.tmdbThumbnail || ''),
  tmdbRating: (typeof v.tmdbRating === 'number' ? v.tmdbRating : (v.rating ?? v.vote_average ?? null)),
  ratingDisplay: computeRatingDisplay(v),
      url: v.url, mainSection: v.mainSection, genres: v.genres, 
      description: v.description || "", trailerUrl: v.trailerUrl || "", 
      tipo: v.tipo,
      releaseYear: v.releaseYear || null,
      subcategoria: v.tipo !== "pelicula" ? (v.subcategoria || "Netflix") : undefined, // CAMBIO: subcategoria para tipos que no sean pelicula
      requiresPlan: v.requiresPlan 
    });
    
  const mapToFullAdminFormat = (v) => {
      // CAMBIO: Mapear 'seasons' en lugar de 'chapters'
      return { 
        id: v._id, _id: v._id, title: v.title, name: v.title, 
        description: v.description, url: v.url, tipo: v.tipo, 
        mainSection: v.mainSection, genres: v.genres, 
        requiresPlan: v.requiresPlan, releaseYear: v.releaseYear, 
        isFeatured: v.isFeatured, logo: v.logo, thumbnail: v.logo, 
    customThumbnail: v.customThumbnail, tmdbThumbnail: v.tmdbThumbnail, 
    // Preferimos `thumbnail` (campo nuevo) si existe, luego logo, customTMDB
  // En el formato admin preferimos mostrar la miniatura personalizada si existe
  thumbnail: v.customThumbnail || v.thumbnail || v.logo || v.tmdbThumbnail || '',
        trailerUrl: v.trailerUrl, active: v.active,
  ratingDisplay: computeRatingDisplay(v),
        subcategoria: v.tipo !== "pelicula" ? (v.subcategoria || "Netflix") : undefined, // CAMBIO: subcategoria para tipos que no sean pelicula
        seasons: v.tipo !== "pelicula" ? (v.seasons || []).map(s => ({
            seasonNumber: s.seasonNumber,
            title: s.title,
            chapters: (s.chapters || []).map(ch => ({
                title: ch.title,
                url: ch.url,
                thumbnail: ch.thumbnail || "",
                duration: ch.duration || "0:00",
                description: ch.description || ""
            }))
        })) : [],
        user: v.user, createdAt: v.createdAt, updatedAt: v.updatedAt 
      };
    };

    // Devolver resultados paginados y el total
    res.json({
      videos: isAdminView ? videos.map(mapToFullAdminFormat) : videos.map(mapToUserFormat),
      total: total,
      page: page,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error("Error en BACKEND GET /api/videos:", error);
    next(error); 
  }
});


// POST /api/videos (Crear un VOD - usado por AdminPanel)
router.post("/", verifyToken, isAdmin, async (req, res, next) => {
  try {
    // CAMBIO: Recibir 'seasons' en lugar de 'chapters'
    const { title, description, url, tipo, subtipo, subcategoria, mainSection, requiresPlan, genres, trailerUrl, releaseYear, isFeatured, active, logo, customThumbnail, seasons } = req.body; 

    if (!title) return res.status(400).json({ error: "Título es obligatorio." });
    const validTipos = ["pelicula", "serie", "anime", "dorama", "novela", "documental"];
    if (tipo && !validTipos.includes(tipo)) {
      return res.status(400).json({ error: `Tipo de VOD inválido: '${tipo}'. Tipos válidos: ${validTipos.join(', ')}` });
    }
    if (tipo === "pelicula" && !url) {
      return res.status(400).json({ error: "URL es obligatoria para películas." });
    }
    // CAMBIO: Validar 'seasons' en lugar de 'chapters'
    if (tipo !== "pelicula" && (!seasons || seasons.length === 0)) {
      return res.status(400).json({ error: "Temporadas son obligatorias para series/anime/dorama/novela/documental." });
    }
    if (tipo !== "pelicula") { // La subcategoría aplica a todo lo que no sea película
      const validSubcategorias = ["Netflix", "Prime Video", "Disney", "Apple TV", "Hulu y Otros", "HBO Max", "Retro", "Animadas", "ZONA KIDS"]; // Añadir ZONA KIDS y HBO Max
      // Aceptar coincidencias sin considerar mayúsculas/minúsculas
      const normalized = (subcategoria || '').toString().trim().toLowerCase();
      const matches = validSubcategorias.some(s => s.toString().trim().toLowerCase() === normalized);
      if (!subcategoria || !matches) {
        return res.status(400).json({ 
          error: `Subcategoría inválida para series/anime/dorama/novela/documental. Opciones válidas: ${validSubcategorias.join(', ')}`,
          validSubcategorias
        });
      }
    }
    // CAMBIO: Validar capítulos dentro de las temporadas
    if (seasons && seasons.length > 0) {
      for (const season of seasons) {
        if (!season.seasonNumber || typeof season.seasonNumber !== 'number' || season.seasonNumber < 1) {
          return res.status(400).json({ error: "Todas las temporadas deben tener un número de temporada válido (>= 1)." });
        }
        if (!season.chapters || season.chapters.length === 0) {
          return res.status(400).json({ error: `La Temporada ${season.seasonNumber} debe tener al menos un capítulo.` });
        }
        const invalidChapters = season.chapters.filter(ch => !ch.title || !ch.url);
        if (invalidChapters.length > 0) {
          return res.status(400).json({ error: `Todos los capítulos en la Temporada ${season.seasonNumber} deben tener título y URL.` });
        }
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
      subtipo: (tipo !== "pelicula") ? (subtipo || tipo) : undefined, // Asegurarse de que subtipo se establezca si no es película
      subcategoria: tipo !== "pelicula" ? subcategoria : undefined, // Asegurarse de que subcategoria se establezca si no es película
      mainSection: mainSection || "POR_GENERO",
      genres: Array.isArray(genres) ? genres : (genres ? genres.split(',').map(g => g.trim()).filter(g => g) : []),
      requiresPlan: requiresPlan || [],
      releaseYear,
      isFeatured: isFeatured || false,
      active: active !== undefined ? active : true,
      logo: logo || "",
      customThumbnail: customThumbnail || "",
      trailerUrl: trailerUrl || "",
      // CAMBIO: Guardar 'seasons' en lugar de 'chapters'
      seasons: seasons || [], 
      watchProgress: [] 
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

    // Aquí las validaciones son más simples, ya que no se espera una serie con capítulos desde esta ruta
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
      watchProgress: [] 
    });

    // --- Normalización de requiresPlan: forzar planes para secciones CINE y fallback seguro ---
    try {
      const mainSec = videoData.mainSection || "";
      if (typeof mainSec === 'string' && mainSec.startsWith('CINE') && videoData.tipo === 'pelicula') {
        // Para películas en secciones CINE, forzar todos los planes excepto 'gplay'
        videoData.requiresPlan = ['estandar', 'sports', 'cinefilo', 'premium'];
        try { console.log(`BACKEND /api/videos/upload-link - Forzando requiresPlan para CINE: ${videoData.title}`); } catch(e) {}
      } else if (!videoData.requiresPlan || videoData.requiresPlan.length === 0) {
        // Fallback seguro: si queda vacío, asignar 'gplay' para evitar comportamientos inesperados
        videoData.requiresPlan = ['gplay'];
      }
    } catch (normErr) {
      console.warn('Advertencia al normalizar requiresPlan en /upload-link:', normErr?.message || normErr);
    }

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
    // CAMBIO: Esta ruta podría ser un alias o una versión más específica
    // de createBatchVideosFromTextAdmin si se procesan M3U con un formato específico.
    // Por ahora, se mantiene como un placeholder.
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
      // --- CORRECCIÓN: Contenido sin plan asignado se bloquea por defecto ---
      if (!video.requiresPlan || video.requiresPlan.length === 0) {
        // Si un video no tiene un plan asignado, se bloquea por defecto para usuarios normales.
        // Para que sea visible, debe tener asignado al menos el plan 'gplay'.
        canAccess = false; 
      } else {
        canAccess = video.requiresPlan.some(requiredPlanKey => {
            const requiredPlanLevel = planHierarchy[requiredPlanKey] || 0;
            return userPlanLevel >= requiredPlanLevel;
        });
      }
    }
    
    if (!canAccess) {
      // Permitir acceso bajo "prueba gratuita" cuando el cliente lo solicita explícitamente (?useTrial=true)
      // Aplica solo para películas y si el usuario aún tiene minutos de prueba disponibles hoy.
      const isMovieForTrial = video.tipo === 'pelicula';
      if (req.query.useTrial === 'true' && isMovieForTrial) {
        let minutesRemaining = 0;
        let maxMinutes = 60;
        try {
          const User = (await import('../models/User.js')).default;
          const user = await User.findById(req.user.id);
          if (user) {
            // Normalizar día
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (!user.dailyTrialUsage.date || user.dailyTrialUsage.date < today) {
              user.dailyTrialUsage.date = today;
              user.dailyTrialUsage.minutesUsed = 0;
              await user.save();
            }
            maxMinutes = user.dailyTrialUsage.maxMinutesPerDay || 60;
            const used = user.dailyTrialUsage.minutesUsed || 0;
            minutesRemaining = Math.max(0, maxMinutes - used);
          }
        } catch (e) {
          console.warn('Advertencia al evaluar prueba gratuita:', e?.message || e);
        }

        if (minutesRemaining <= 0) {
          // Sin minutos disponibles: bloquear uso de prueba
          return res.status(403).json({
            error: "⏱️ Prueba gratuita agotada",
            message: `Ya has usado tus ${maxMinutes} minutos de prueba gratuita hoy. ¡Vuelve mañana para más contenido gratis!`,
            currentPlan: req.user.plan,
            requiredPlans: (video.requiresPlan || []).join(' o '),
            trialMessage: `Tu prueba gratuita diaria de ${maxMinutes} minutos ya fue consumida hoy.`,
            trialMinutesRemaining: 0,
            trialUsedToday: maxMinutes
          });
        }

        // Conceder acceso bajo prueba gratuita
        const response = {
          id: video._id,
          name: video.title,
          title: video.title,
          url: video.url || "",
          description: video.description || "",
          tipo: video.tipo,
          subtipo: video.subtipo,
          subcategoria: video.subcategoria,
          mainSection: video.mainSection,
          genres: video.genres,
          requiresPlan: video.requiresPlan,
          releaseYear: video.releaseYear,
          isFeatured: video.isFeatured,
          active: video.active,
  logo: makeFullUrl(req, video.logo || ''),
  customThumbnail: makeFullUrl(req, video.customThumbnail || ''),
  tmdbThumbnail: makeFullUrl(req, video.tmdbThumbnail || ''),
  // Computed thumbnail that the frontend should use (custom > logo > tmdb)
  thumbnail: video.customThumbnail || video.logo || video.tmdbThumbnail || makeFullUrl(req, "/img/placeholder-default.png"),
          trailerUrl: video.trailerUrl,
          seasons: video.tipo !== "pelicula" ? (video.seasons || []).map(s => ({
            seasonNumber: s.seasonNumber,
            title: s.title,
            chapters: (s.chapters || []).map(ch => ({
              title: ch.title,
              url: ch.url,
              thumbnail: ch.thumbnail || "",
              duration: ch.duration || "0:00",
              description: ch.description || ""
            }))
          })) : [],
          trialAccess: true
        };
        return res.json(response);
      }
      // Determinar el plan mínimo requerido para acceder al video
      const requiredPlans = video.requiresPlan || [];
      const planNames = {
        'gplay': 'G-Play',
        'estandar': 'Estándar', 
        'sports': 'Sports',
        'cinefilo': 'Cinéfilo',
        'premium': 'Premium'
      };
      
      const currentPlanName = planNames[userPlan] || userPlan;
      const requiredPlanNames = requiredPlans.map(plan => planNames[plan] || plan).join(' o ');
      
      // Calcular información de prueba gratuita
      const User = (await import('../models/User.js')).default;
      const user = await User.findById(req.user.id);
      let trialInfo = {};
      
      // Determinar si es película para mostrar opción de prueba
      const isMovie = video.tipo === 'pelicula';
      
      if (isMovie && user) {
        // Asegurar que el usuario tenga el objeto de prueba inicializado y normalizado al día
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (!user.dailyTrialUsage) {
          user.dailyTrialUsage = {
            date: today,
            minutesUsed: 0,
            maxMinutesPerDay: 60
          };
          await user.save();
        } else if (!user.dailyTrialUsage.date || user.dailyTrialUsage.date < today) {
          user.dailyTrialUsage.date = today;
          user.dailyTrialUsage.minutesUsed = 0;
          await user.save();
        }

        const maxMinutes = user.dailyTrialUsage.maxMinutesPerDay || 60;
        const minutesUsed = user.dailyTrialUsage.minutesUsed || 0;
        const remainingMinutes = Math.max(0, maxMinutes - minutesUsed);

        if (remainingMinutes > 0) {
          trialInfo = {
            trialMessage: `¡Perfecto! Puedes usar tu prueba gratuita diaria para ver esta película. Te quedan ${remainingMinutes} minutos disponibles hoy.`,
            trialMinutesRemaining: remainingMinutes,
            trialUsedToday: minutesUsed
          };
        } else {
          trialInfo = {
            trialMessage: `Ya has usado tus ${maxMinutes} minutos de prueba gratuita hoy. ¡Vuelve mañana para más contenido gratis!`,
            trialMinutesRemaining: 0,
            trialUsedToday: minutesUsed
          };
        }
      } else if (isMovie) {
        // Usuario sin documento (caso excepcional), usar fallback
        trialInfo = {
          trialMessage: "¡Excelente! Puedes usar tu prueba gratuita diaria de 60 minutos para ver esta película. ¡Disfrútala!",
          trialMinutesRemaining: 60,
          trialUsedToday: 0
        };
      }
      try {
        const used = user?.dailyTrialUsage?.minutesUsed ?? 0;
        const max = user?.dailyTrialUsage?.maxMinutesPerDay ?? 60;
        console.log(`[TRIAL] GET /api/videos/:id → user=${user?.username || user?._id} used=${used} / ${max} min, remaining=${trialInfo.trialMinutesRemaining}`);
      } catch {}
      
      // Mensajes personalizados según el tipo de contenido
      let errorMessage, mainMessage, upgradeMessage;
      
      if (isMovie) {
        errorMessage = `🎬 ¡Esta película es contenido premium!`;
        mainMessage = `Esta película requiere el plan ${requiredPlanNames}. Tu plan actual (${currentPlanName}) no incluye acceso a este contenido.`;
        upgradeMessage = trialInfo.trialMinutesRemaining > 0 
          ? "¡Pero puedes usar tu prueba gratuita diaria para verla ahora mismo! O actualiza tu plan para acceso ilimitado."
          : "Actualiza tu plan para disfrutar de todas nuestras películas premium sin límites.";
      } else {
        errorMessage = `📺 ¡Este contenido es premium!`;
        mainMessage = `Este ${video.tipo} requiere el plan ${requiredPlanNames}. Tu plan actual (${currentPlanName}) no incluye acceso a este contenido.`;
        upgradeMessage = "Actualiza tu plan para acceder a todo nuestro catálogo premium de series, animes y documentales.";
      }
      
      return res.status(403).json({
        error: errorMessage,
        message: mainMessage,
        currentPlan: currentPlanName,
        requiredPlans: requiredPlanNames,
        upgradeMessage: upgradeMessage,
        ...trialInfo
      });
    }
    const response = {
      id: video._id,
      name: video.title,
      title: video.title,
      url: video.url || "",
      description: video.description || "",
  tmdbRating: (typeof video.tmdbRating === 'number' ? video.tmdbRating : (video.rating ?? video.vote_average ?? null)),
  ratingDisplay: computeRatingDisplay(video),
      tipo: video.tipo,
      subtipo: video.subtipo, // Añadir subtipo
      subcategoria: video.subcategoria,
      mainSection: video.mainSection, // Añadir mainSection
      genres: video.genres, // Añadir genres
      requiresPlan: video.requiresPlan, // Añadir requiresPlan
      releaseYear: video.releaseYear, // Añadir releaseYear
      isFeatured: video.isFeatured, // Añadir isFeatured
      active: video.active, // Añadir active
      logo: video.logo, // Añadir logo
      customThumbnail: video.customThumbnail, // Añadir customThumbnail
      tmdbThumbnail: video.tmdbThumbnail, // Añadir tmdbThumbnail
      trailerUrl: video.trailerUrl, // Añadir trailerUrl
      seasons: video.tipo !== "pelicula" ? (video.seasons || []).map(s => ({
          seasonNumber: s.seasonNumber,
          title: s.title,
          chapters: (s.chapters || []).map(ch => ({
              title: ch.title,
              url: ch.url,
              thumbnail: ch.thumbnail || "",
              duration: ch.duration || "0:00",
              description: ch.description || ""
          }))
      })) : [],
    };
    res.json(response);
  } catch (err) { next(err); }
});

// PUT /api/videos/:id (Actualizar VOD) - Ahora usa el controlador dedicado
router.put("/:id", verifyToken, isAdmin, updateVideoAdmin);


// DELETE /api/videos/batch (Eliminar VODs en lote)
router.delete("/batch", verifyToken, isAdmin, deleteBatchVideosAdmin);

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