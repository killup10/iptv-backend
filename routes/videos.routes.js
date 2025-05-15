// iptv-backend/routes/videos.routes.js
import express from "express";
import multer from "multer";
import fs from "fs";
import readline from "readline";
import mongoose from "mongoose"; // Necesario para mongoose.Types.ObjectId.isValid
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import Video from "../models/Video.js"; // Asegúrate que el path sea correcto y que el modelo Video tenga los nuevos campos
import Channel from "../models/Channel.js"; 
import getTMDBThumbnail from "../utils/getTMDBThumbnail.js";

const router = express.Router();

// Configuración de Multer para la subida de M3U
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"), // Directorio de subida temporal
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
    limits: { fileSize: 10 * 1024 * 1024 } // Límite 10MB
});


// --- RUTAS ESPECÍFICAS PRIMERO ---

// GET /api/videos/main-sections (Para la nueva página de VOD categorizada)
router.get("/main-sections", verifyToken, async (req, res, next) => {
  try {
    const userPlan = req.user.plan || 'basico'; // Plan del usuario logueado
    
    const ALL_POSSIBLE_SECTIONS = [
      { key: "ESPECIALES", displayName: "ESPECIALES", thumbnailSample: "/img/placeholders/especiales.jpg", requiresPlan: "basico", order: 0 },
      { key: "CINE_2025", displayName: "CINE 2025", thumbnailSample: "/img/placeholders/cine_2025.jpg", requiresPlan: "premium", order: 1 }, // Cambiado a premium
      { key: "CINE_4K", displayName: "CINE 4K", thumbnailSample: "/img/placeholders/cine_4k.jpg", requiresPlan: "premium", order: 2 },
      { key: "CINE_60FPS", displayName: "CINE 60 FPS", thumbnailSample: "/img/placeholders/cine_60fps.jpg", requiresPlan: "premium", order: 3 },
      { key: "POR_GENERO", displayName: "POR GÉNEROS", thumbnailSample: "/img/placeholders/por_generos.jpg", requiresPlan: "basico", order: 4 },
      { key: "CLASICOS", displayName: "Clásicos del Cine", thumbnailSample: "/img/placeholders/clasicos.jpg", requiresPlan: "basico", order: 5 },
      // Puedes añadir más, como "SERIES", etc.
    ];

    let accessibleSections = [];
    ALL_POSSIBLE_SECTIONS.forEach(section => {
      if (section.requiresPlan === 'basico') {
        accessibleSections.push(section);
      } else if (section.requiresPlan === 'premium' && (userPlan === 'premium' || userPlan === 'cinefilo')) {
        accessibleSections.push(section);
      } else if (section.requiresPlan === 'cinefilo' && userPlan === 'cinefilo') {
        accessibleSections.push(section);
      }
    });
    
    // Opcional: Para cada sección accesible, buscar una película aleatoria para el thumbnailSample
    for (let section of accessibleSections) {
        if (section.key !== "POR_GENERO") { // "POR_GENERO" es especial, su thumbnail puede ser genérico
            const planQueryForThumb = ['basico'];
            if (section.requiresPlan === 'premium') planQueryForThumb.push('premium', 'cinefilo');
            if (section.requiresPlan === 'cinefilo') planQueryForThumb.push('cinefilo');
            
            // Busca una película activa de esa sección, accesible por el plan MÁS BAJO que da acceso a la sección, y que tenga logo
            const randomMovieForThumb = await Video.findOne({ 
                mainSection: section.key, 
                active: true, 
                requiresPlan: { $in: planQueryForThumb }, // Considerar el plan para la muestra
                logo: { $ne: null, $ne: "" } 
            }).sort({ createdAt: -1 }); // Podrías añadir .skip(Math.floor(Math.random() * count)) si haces un count previo

            if (randomMovieForThumb && randomMovieForThumb.logo) {
                section.thumbnailSample = randomMovieForThumb.logo;
            }
        }
    }
    res.json(accessibleSections.sort((a,b) => a.order - b.order));
  } catch (error) {
    console.error("Error en GET /api/videos/main-sections:", error);
    next(error);
  }
});

// Rutas para contenido público destacado (usadas en Home.jsx)
router.get("/public/featured-movies", async (req, res, next) => {
  try {
    const movies = await Video.find({ 
        tipo: "pelicula", 
        isFeatured: true, 
        active: true,
        requiresPlan: 'basico' // Asumiendo que lo destacado es accesible para básicos o todos
      })
      .sort({ createdAt: -1 })
      .limit(10);
      
    const mapVODToPublicFormat = (v) => ({
        id: v._id, _id: v._id, name: v.title, title: v.title,
        thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || "",
        url: v.url, 
        // category: v.category, // Ya no es el campo principal de agrupación aquí
        mainSection: v.mainSection, 
        genres: v.genres,
        tipo: v.tipo, description: v.description || "", trailerUrl: v.trailerUrl || ""
    });
    res.json(movies.map(mapVODToPublicFormat));
  } catch (error) {
    console.error("Error en GET /public/featured-movies:", error);
    next(error);
  }
});

router.get("/public/featured-series", async (req, res, next) => {
  try {
    const series = await Video.find({ 
        tipo: "serie", 
        isFeatured: true, 
        active: true,
        requiresPlan: 'basico'
    })
      .sort({ createdAt: -1 })
      .limit(10);
    const mapVODToPublicFormat = (v) => ({
        id: v._id, _id: v._id, name: v.title, title: v.title,
        thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || "",
        url: v.url, 
        // category: v.category,
        mainSection: v.mainSection, 
        genres: v.genres,
        tipo: v.tipo, description: v.description || "", trailerUrl: v.trailerUrl || ""
    });
    res.json(series.map(mapVODToPublicFormat));
  } catch (error) {
    console.error("Error en GET /public/featured-series:", error);
    next(error);
  }
});


// --- RUTA PRINCIPAL DE LISTADO /api/videos (ANTES DE /:id) ---
// Esta ruta es usada por fetchUserMovies y fetchUserSeries en api.js del frontend
router.get("/", verifyToken, async (req, res, next) => {
  try {
    const userPlan = req.user.plan || 'basico';
    const isAdminView = req.user.role === 'admin' && req.query.view === 'admin';

    let query = {};

    if (!isAdminView) {
      const accessiblePlans = ['basico'];
      if (userPlan === 'premium' || userPlan === 'cinefilo') accessiblePlans.push('premium');
      if (userPlan === 'cinefilo') accessiblePlans.push('cinefilo');
      
      query.requiresPlan = { $in: accessiblePlans };
      query.active = true;
    } else { // Si es Admin viendo todo o filtrando
      if (req.query.active === 'true') query.active = true;
      if (req.query.active === 'false') query.active = false;
      // Admin puede ver todos los planes por defecto, o podrías añadir filtro de plan para admin
    }

    // Filtros adicionales desde query params
    if (req.query.mainSection) query.mainSection = req.query.mainSection;
    if (req.query.genre) query.genres = req.query.genre; // Busca si el género está en el array 'genres'
    if (req.query.tipo) query.tipo = req.query.tipo; // Para filtrar por pelicula o serie
    if (req.query.search) {
        // Para búsqueda de texto, asegúrate de tener un índice de texto en tu modelo Video
        // ej: videoSchema.index({ title: 'text', description: 'text' });
        query.$text = { $search: req.query.search };
    }
    
    const videos = await Video.find(query)
                              .sort(req.query.sort || { createdAt: -1 }) // Permitir sort desde query
                              .limit(parseInt(req.query.limit) || 0) // 0 es sin límite para Mongoose .find()
                              .skip(parseInt(req.query.skip) || 0);

    // Formato para usuarios normales (usado por MoviesPage, SeriesPage vía api.js)
    const mapToUserFormat = (v) => ({
        id: v._id,
        _id: v._id, // A veces el frontend usa _id directamente
        name: v.title,
        title: v.title,
        thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || "",
        url: v.url,
        mainSection: v.mainSection,
        genres: v.genres,
        description: v.description || "",
        trailerUrl: v.trailerUrl || "",
        tipo: v.tipo, // Importante para que el frontend sepa si es pelicula o serie
    });

    // Formato para AdminPanel (frontend AdminPanel espera este formato más completo)
    const mapToFullAdminFormat = (v) => ({
        id: v._id, _id: v._id, title: v.title, name: v.title,
        description: v.description, url: v.url, tipo: v.tipo,
        mainSection: v.mainSection, genres: v.genres, requiresPlan: v.requiresPlan,
        releaseYear: v.releaseYear, isFeatured: v.isFeatured,
        logo: v.logo, thumbnail: v.logo, customThumbnail: v.customThumbnail,
        tmdbThumbnail: v.tmdbThumbnail, trailerUrl: v.trailerUrl, active: v.active,
        user: v.user, // Si tienes el campo user en el modelo Video
        createdAt: v.createdAt, updatedAt: v.updatedAt
    });

    if (isAdminView) {
        res.json(videos.map(mapToFullAdminFormat));
    } else {
        res.json(videos.map(mapToUserFormat));
    }

  } catch (error) {
    console.error("Error en GET /api/videos:", error);
    next(error);
  }
});


// --- RUTA DINÁMICA /:id DEBE IR DESPUÉS DE LAS MÁS ESPECÍFICAS ---
router.get("/:id", verifyToken, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "ID de video con formato inválido." });
    }

    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ error: "Video no encontrado" });
    }

    const userPlan = req.user.plan || 'basico';
    const isAdminUser = req.user.role === 'admin';
    
    let canAccess = false;
    if (isAdminUser) {
        canAccess = true;
    } else if (video.active) {
        const accessiblePlans = ['basico'];
        if (userPlan === 'premium' || userPlan === 'cinefilo') accessiblePlans.push('premium');
        if (userPlan === 'cinefilo') accessiblePlans.push('cinefilo');
        if (accessiblePlans.includes(video.requiresPlan)) {
            canAccess = true;
        }
    }

    if (!canAccess) {
      return res.status(403).json({ error: "Acceso denegado a este video." });
    }
    
    // Formato para Watch.jsx
    res.json({
        id: video._id,
        _id: video._id,
        name: video.title,
        title: video.title,
        url: video.url,
        description: video.description || "",
        logo: video.logo,
        thumbnail: video.logo || video.customThumbnail || video.tmdbThumbnail,
        // category: video.category, // Reemplazado por mainSection y genres
        mainSection: video.mainSection,
        genres: video.genres,
        tipo: video.tipo,
        trailerUrl: video.trailerUrl,
        active: video.active // Podría ser útil para el frontend saber si lo ve por ser admin
    });
  } catch (err) {
    console.error(`Error en GET /api/videos/${req.params.id}:`, err);
    next(err);
  }
});


// --- OTRAS RUTAS (POST, PUT, DELETE) ---

// POST /api/videos/upload-m3u (Procesa M3U y guarda como Canales)
router.post("/upload-m3u", verifyToken, isAdmin, upload.single("file"), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: "No se proporcionó ningún archivo M3U." });
  }
  const entriesSaved = [];
  const fileStream = fs.createReadStream(req.file.path);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  let currentName = "", currentLogo = "", currentCategory = ""; // 'category' aquí es del M3U, no 'mainSection' del Video
  try {
    for await (const line of rl) {
      if (line.startsWith("#EXTINF")) {
        const titleMatch = line.match(/,(.*)$/);
        const logoMatch = line.match(/tvg-logo="(.*?)"/);
        const groupMatch = line.match(/group-title="(.*?)"/);
        currentName = titleMatch ? titleMatch[1].trim() : "Sin nombre";
        currentLogo = logoMatch ? logoMatch[1].trim() : "";
        currentCategory = groupMatch ? groupMatch[1].trim() : "General";
      } else if (line.trim().startsWith("http")) {
        const streamUrl = line.trim();
        if (!currentName || currentName === "Sin nombre") {
            console.warn(`Omitiendo URL de M3U sin nombre de canal asociado: ${streamUrl}`);
            currentName = ""; currentLogo = ""; currentCategory = ""; // Reset para la próxima línea de URL
            continue; 
        }
        let finalLogo = currentLogo;
        if (!finalLogo && currentName !== "Sin nombre") {
            try { finalLogo = await getTMDBThumbnail(currentName, 'tv'); }
            catch (tmdbError) { console.warn(`TMDB (upload-m3u): No logo for "${currentName}": ${tmdbError.message}`); finalLogo = ""; }
        }
        const newChannel = new Channel({ // Guarda en la colección Channel
          name: currentName, url: streamUrl, category: currentCategory,
          logo: finalLogo || "", active: true,
          // user: req.user.id, // Si los canales creados por M3U deben asociarse al admin
        });
        try {
          const existingChannel = await Channel.findOne({ url: streamUrl }); // Chequeo global de duplicados
          if (existingChannel) { console.log(`Channel URL ${streamUrl} already exists globally. Skipping.`); }
          else { const savedChannel = await newChannel.save(); entriesSaved.push(savedChannel); }
        } catch (dbError) { console.error(`Error saving channel "${currentName}" from M3U: ${dbError.message}`); }
        currentName = ""; currentLogo = ""; currentCategory = ""; // Reset para la próxima entrada
      }
    }
    res.json({ message: "M3U procesado. Canales añadidos/omitidos en la colección 'Channels'.", entriesAdded: entriesSaved.length });
  } catch (processingError) {
    console.error("Error procesando M3U (/upload-m3u):", processingError);
    next(processingError);
  } finally {
    if (req.file && req.file.path) {
        try { await fs.promises.unlink(req.file.path); }
        catch (unlinkError) { console.error("Error deleting temp M3U file:", unlinkError); }
    }
  }
});

// POST /api/videos/upload-link (Crear un VOD - ADMIN)
router.post("/upload-link", verifyToken, isAdmin, async (req, res, next) => {
  const { 
    title, url, tipo = "pelicula", logo, description, 
    releaseYear, isFeatured, active, trailerUrl,
    mainSection, genres, requiresPlan // Nuevos campos
  } = req.body;

  if (!title || !url) return res.status(400).json({ error: "Título y URL son requeridos" });
  if (!Video.schema.path('tipo').enumValues.includes(tipo)) return res.status(400).json({ error: `Tipo de VOD inválido.` });
  if (mainSection && !Video.schema.path('mainSection').enumValues.includes(mainSection)) return res.status(400).json({ error: `Sección principal inválida.` });
  if (requiresPlan && !Video.schema.path('requiresPlan').enumValues.includes(requiresPlan)) return res.status(400).json({ error: `Plan requerido inválido.` });

  try {
    let finalLogo = logo;
    if ((!finalLogo || finalLogo.trim() === "") && title) {
        try { finalLogo = await getTMDBThumbnail(title, tipo === 'serie' ? 'tv' : 'movie'); }
        catch (tmdbError) { console.warn(`TMDB (upload-link): No logo for "${title}": ${tmdbError.message}`); finalLogo = ""; }
    }

    const videoData = new Video({
      title, url, tipo, logo: finalLogo || "", description: description || "", 
      releaseYear: releaseYear ? parseInt(releaseYear) : null,
      isFeatured: isFeatured || false, active: active !== undefined ? active : true, 
      trailerUrl: trailerUrl || "",
      mainSection: mainSection || Video.schema.path('mainSection').defaultValue,
      genres: Array.isArray(genres) ? genres : (genres ? genres.split(',').map(g=>g.trim()).filter(g=>g) : []),
      requiresPlan: requiresPlan || Video.schema.path('requiresPlan').defaultValue,
      // user: req.user.id, // Si quieres registrar quién lo creó
    });
    
    const savedVideo = await videoData.save();
    res.status(201).json({ message: "Video VOD guardado", video: savedVideo });
  } catch (error) {
     console.error("Error en POST /api/videos/upload-link:", error);
     next(error);
  }
});

// PUT /api/videos/:id (Actualizar VOD - ADMIN)
router.put("/:id", verifyToken, isAdmin, async (req, res, next) => {
  try {
    if (Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: "No se proporcionaron datos para actualizar." });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: "ID de video inválido." });
    }

    const updateFields = { ...req.body };
    // No es necesario 'updatedAt: Date.now()' si {timestamps: true} está en el schema
    
    if (updateFields.releaseYear !== undefined) {
        updateFields.releaseYear = updateFields.releaseYear ? parseInt(updateFields.releaseYear, 10) : null;
        if (isNaN(updateFields.releaseYear) && updateFields.releaseYear !== null) {
             return res.status(400).json({ error: "Año de lanzamiento inválido." });
        }
    }
    if (updateFields.genres && typeof updateFields.genres === 'string') {
        updateFields.genres = updateFields.genres.split(',').map(g => g.trim()).filter(g => g);
    } else if (updateFields.genres && !Array.isArray(updateFields.genres)) {
        // Si se envía algo que no es string ni array para genres (y no es undefined)
        delete updateFields.genres; // O devuelve error
    }


    const updatedVideo = await Video.findByIdAndUpdate( 
      req.params.id, 
      { $set: updateFields }, // Usar $set es más seguro para solo actualizar los campos provistos
      { new: true, runValidators: true }
    );

    if (!updatedVideo) {
      return res.status(404).json({ error: "Video no encontrado para actualizar" });
    }
    res.json({ message: "Video VOD actualizado", video: updatedVideo });
  } catch (error) {
    console.error(`Error en PUT /api/videos/${req.params.id}:`, error);
    next(error);
  }
});

// DELETE /api/videos/:id (Eliminar VOD - ADMIN)
router.delete("/:id", verifyToken, isAdmin, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: "ID de video inválido." });
    }
    const deletedVideo = await Video.findByIdAndDelete(req.params.id);
    if (!deletedVideo) {
      return res.status(404).json({ error: "Video no encontrado para eliminar" });
    }
    res.json({ message: "Video VOD eliminado" });
  } catch (error) {
    console.error(`Error en DELETE /api/videos/${req.params.id}:`, error);
    next(error);
  }
});

export default router;