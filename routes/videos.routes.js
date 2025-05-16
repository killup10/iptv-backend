// iptv-backend/routes/videos.routes.js
import express from "express";
import multer from "multer";
import fs from "fs";
import readline from "readline";
import mongoose from "mongoose"; // Para mongoose.Types.ObjectId.isValid
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import Video from "../models/Video.js"; // Asegúrate que el path sea correcto
import Channel from "../models/Channel.js"; 
import getTMDBThumbnail from "../utils/getTMDBThumbnail.js";

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
    limits: { fileSize: 10 * 1024 * 1024 } // Límite 10MB
});

// --- RUTAS ESPECÍFICAS PRIMERO ---

// GET /api/videos/main-sections
router.get("/main-sections", verifyToken, async (req, res, next) => {
  try {
    const userPlan = req.user.plan || 'basico';
    const isAdminUser = req.user.role === 'admin';
    
    const ALL_POSSIBLE_SECTIONS = [
      { key: "POR_GENERO", displayName: "POR GÉNEROS", thumbnailSample: "/img/placeholders/por_generos.jpg", requiresPlan: "basico", order: 0 },
      { key: "ESPECIALES", displayName: "ESPECIALES (Festividades)", thumbnailSample: "/img/placeholders/especiales.jpg", requiresPlan: "basico", order: 1 },
      { key: "CINE_2025", displayName: "CINE 2025 (Estrenos)", thumbnailSample: "/img/placeholders/cine_2025.jpg", requiresPlan: "premium", order: 2 },
      { key: "CINE_4K", displayName: "CINE 4K", thumbnailSample: "/img/placeholders/cine_4k.jpg", requiresPlan: "premium", order: 3 },
      { key: "CINE_60FPS", displayName: "CINE 60 FPS", thumbnailSample: "/img/placeholders/cine_60fps.jpg", requiresPlan: "premium", order: 4 },
    ];

    let accessibleSections = [];
    if (isAdminUser) {
        accessibleSections = ALL_POSSIBLE_SECTIONS;
    } else {
        ALL_POSSIBLE_SECTIONS.forEach(section => {
            if (section.requiresPlan === 'basico') accessibleSections.push(section);
            else if (section.requiresPlan === 'premium' && (userPlan === 'premium' || userPlan === 'cinefilo')) accessibleSections.push(section);
            else if (section.requiresPlan === 'cinefilo' && userPlan === 'cinefilo') accessibleSections.push(section);
        });
    }
    
    for (let section of accessibleSections) {
        if (section.key !== "POR_GENERO") {
            const planQueryForThumb = ['basico'];
            if (section.requiresPlan === 'premium') planQueryForThumb.push('premium', 'cinefilo');
            if (section.requiresPlan === 'cinefilo') planQueryForThumb.push('cinefilo');
            
            const randomMovieForThumb = await Video.findOne({ 
                mainSection: section.key, active: true, 
                requiresPlan: { $in: planQueryForThumb },
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
    console.log("BACKEND /public/featured-movies - Criterio:", criteria);
    const movies = await Video.find(criteria).sort({ createdAt: -1 }).limit(10);
    console.log("BACKEND /public/featured-movies - Películas encontradas:", movies.length);
    const mapVODToPublicFormat = (v) => ({
        id: v._id, _id: v._id, name: v.title, title: v.title,
        thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || "",
        url: v.url, mainSection: v.mainSection, genres: v.genres,
        tipo: v.tipo, description: v.description || "", trailerUrl: v.trailerUrl || ""
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
    console.log("BACKEND /public/featured-series - Criterio:", criteria);
    const series = await Video.find(criteria).sort({ createdAt: -1 }).limit(10);
    console.log("BACKEND /public/featured-series - Series encontradas:", series.length);
    const mapVODToPublicFormat = (v) => ({
        id: v._id, _id: v._id, name: v.title, title: v.title,
        thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || "",
        url: v.url, mainSection: v.mainSection, genres: v.genres,
        tipo: v.tipo, description: v.description || "", trailerUrl: v.trailerUrl || ""
    });
    res.json(series.map(mapVODToPublicFormat));
  } catch (error) { 
    console.error("Error en BACKEND /public/featured-series:", error);
    next(error); 
  }
});

// GET /api/videos (Listar VODs para usuarios y admin)
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
    } else {
      if (req.query.active === 'true') query.active = true;
      if (req.query.active === 'false') query.active = false;
    }

    if (req.query.mainSection && req.query.mainSection !== "POR_GENERO") {
        query.mainSection = req.query.mainSection;
    }
    if (req.query.genre && req.query.genre !== "Todas") {
        query.genres = req.query.genre;
    }
    if (req.query.tipo) query.tipo = req.query.tipo;
    if (req.query.search) query.$text = { $search: req.query.search };
    
    console.log(`BACKEND GET /api/videos - User: ${req.user.username}, Plan: ${userPlan}, AdminView: ${isAdminView}, Query:`, JSON.stringify(query));
    const videos = await Video.find(query)
                              .sort(req.query.sort || { createdAt: -1 })
                              .limit(parseInt(req.query.limit) || 50)
                              .skip(parseInt(req.query.skip) || 0);
    console.log(`BACKEND GET /api/videos - Encontrados: ${videos.length}`);

    const mapToUserFormat = (v) => ({
        id: v._id, _id: v._id, name: v.title, title: v.title,
        thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || "",
        url: v.url, mainSection: v.mainSection, genres: v.genres,
        description: v.description || "", trailerUrl: v.trailerUrl || "", tipo: v.tipo,
    });
    const mapToFullAdminFormat = (v) => ({
        id: v._id, _id: v._id, title: v.title, name: v.title,
        description: v.description, url: v.url, tipo: v.tipo,
        mainSection: v.mainSection, genres: v.genres, requiresPlan: v.requiresPlan,
        releaseYear: v.releaseYear, isFeatured: v.isFeatured,
        logo: v.logo, thumbnail: v.logo, customThumbnail: v.customThumbnail,
        tmdbThumbnail: v.tmdbThumbnail, trailerUrl: v.trailerUrl, active: v.active,
        user: v.user, createdAt: v.createdAt, updatedAt: v.updatedAt
    });

    if (isAdminView) res.json(videos.map(mapToFullAdminFormat));
    else res.json(videos.map(mapToUserFormat));
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

    const userPlan = req.user.plan || 'basico';
    const isAdminUser = req.user.role === 'admin';
    let canAccess = false;
    if (isAdminUser) canAccess = true;
    else if (video.active) {
        const accessiblePlans = ['basico'];
        if (userPlan === 'premium' || userPlan === 'cinefilo') accessiblePlans.push('premium');
        if (userPlan === 'cinefilo') accessiblePlans.push('cinefilo');
        if (accessiblePlans.includes(video.requiresPlan)) canAccess = true;
    }
    if (!canAccess) return res.status(403).json({ error: "Acceso denegado a este video." });
    
    res.json({
        id: video._id, _id: video._id, name: video.title, title: video.title,
        url: video.url, description: video.description || "",
        logo: video.logo, thumbnail: video.logo || video.customThumbnail || video.tmdbThumbnail,
        mainSection: video.mainSection, genres: video.genres,
        tipo: video.tipo, trailerUrl: video.trailerUrl, active: video.active
    });
  } catch (err) { 
    console.error(`Error en BACKEND GET /api/videos/${req.params.id}:`, err);
    next(err); 
  }
});

// POST /api/videos/upload-m3u
router.post("/upload-m3u", verifyToken, isAdmin, upload.single("file"), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: "No se proporcionó ningún archivo M3U." });
  console.log(`BACKEND /upload-m3u: Procesando archivo ${req.file.filename}`);
  const entriesSaved = [];
  const fileStream = fs.createReadStream(req.file.path);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  let currentName = "", currentLogo = "", currentCategory = "";
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
            currentName = ""; currentLogo = ""; currentCategory = "";
            continue; 
        }
        let finalLogo = currentLogo;
        if (!finalLogo && currentName !== "Sin nombre") {
            try { finalLogo = await getTMDBThumbnail(currentName, 'tv'); }
            catch (tmdbError) { console.warn(`TMDB (upload-m3u): No logo for "${currentName}": ${tmdbError.message}`); finalLogo = ""; }
        }
        const newChannel = new Channel({
          name: currentName, url: streamUrl, category: currentCategory,
          logo: finalLogo || "", active: true,
        });
        try {
          const existingChannel = await Channel.findOne({ url: streamUrl });
          if (existingChannel) { console.log(`Channel URL ${streamUrl} already exists. Skipping.`); }
          else { const savedChannel = await newChannel.save(); entriesSaved.push(savedChannel); }
        } catch (dbError) { console.error(`Error saving channel "${currentName}" from M3U: ${dbError.message}`); }
        currentName = ""; currentLogo = ""; currentCategory = "";
      }
    }
    res.json({ message: "M3U procesado. Canales añadidos/omitidos.", entriesAdded: entriesSaved.length });
  } catch (processingError) { 
    console.error("Error procesando M3U (/upload-m3u):", processingError);
    next(processingError); 
  }
  finally { 
    if (req.file && req.file.path) {
        try { await fs.promises.unlink(req.file.path); }
        catch (unlinkError) { console.error("Error deleting temp M3U file:", unlinkError); }
    }
  }
});

// POST /api/videos/upload-link (Crear un VOD)
router.post("/upload-link", verifyToken, isAdmin, async (req, res, next) => {
  const { 
    title, url, tipo = "pelicula", logo, description, releaseYear, isFeatured, active, trailerUrl,
    mainSection, genres, requiresPlan
  } = req.body;

  if (!title || !url) return res.status(400).json({ error: "Título y URL son requeridos" });
  if (mainSection && !Video.schema.path('mainSection').enumValues.includes(mainSection)) return res.status(400).json({ error: `Sección principal inválida: ${mainSection}` });
  if (requiresPlan && !Video.schema.path('requiresPlan').enumValues.includes(requiresPlan)) return res.status(400).json({ error: `Plan requerido inválido: ${requiresPlan}` });
  if (tipo && !Video.schema.path('tipo').enumValues.includes(tipo)) return res.status(400).json({ error: `Tipo inválido: ${tipo}` });

  try {
    let finalLogo = logo;
    if ((!finalLogo || String(finalLogo).trim() === "") && title) {
        try { finalLogo = await getTMDBThumbnail(title, tipo === 'serie' ? 'tv' : 'movie'); }
        catch (tmdbError) { 
            console.warn(`TMDB (upload-link): No logo for "${title}": ${tmdbError.message}`);
            finalLogo = ""; 
        }
    }
    const videoData = new Video({
      title, url, tipo, logo: finalLogo || "", description: description || "", 
      releaseYear: releaseYear ? parseInt(releaseYear) : null,
      isFeatured: isFeatured || false, active: active !== undefined ? active : true, 
      trailerUrl: trailerUrl || "",
      mainSection: mainSection || Video.schema.path('mainSection').defaultValue,
      genres: Array.isArray(genres) ? genres.filter(g => g && g.trim() !== "") : (genres ? String(genres).split(',').map(g=>g.trim()).filter(g=>g) : []),
      requiresPlan: requiresPlan || Video.schema.path('requiresPlan').defaultValue,
    });
    const savedVideo = await videoData.save();
    console.log("BACKEND /upload-link: Video guardado:", savedVideo._id);
    res.status(201).json({ message: "Video VOD guardado", video: savedVideo });
  } catch (error) { 
    console.error("Error en BACKEND POST /api/videos/upload-link:", error);
    next(error); 
  }
});

// PUT /api/videos/:id (Actualizar VOD)
router.put("/:id", verifyToken, isAdmin, async (req, res, next) => {
  try {
    if (Object.keys(req.body).length === 0) return res.status(400).json({ error: "No hay datos para actualizar." });
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "ID de video inválido." });
    
    const updateFields = { ...req.body };
    if (updateFields.hasOwnProperty('releaseYear')) {
        updateFields.releaseYear = updateFields.releaseYear ? parseInt(updateFields.releaseYear, 10) : null;
        if (isNaN(updateFields.releaseYear) && updateFields.releaseYear !== null) return res.status(400).json({ error: "Año inválido." });
    }
    if (updateFields.genres && typeof updateFields.genres === 'string') {
        updateFields.genres = updateFields.genres.split(',').map(g => g.trim()).filter(g => g);
    } else if (updateFields.hasOwnProperty('genres') && !Array.isArray(updateFields.genres)) {
        delete updateFields.genres; 
    }
    if (updateFields.mainSection && !Video.schema.path('mainSection').enumValues.includes(updateFields.mainSection)) return res.status(400).json({ error: `Sección inválida` });
    if (updateFields.requiresPlan && !Video.schema.path('requiresPlan').enumValues.includes(updateFields.requiresPlan)) return res.status(400).json({ error: `Plan inválido` });
    if (updateFields.tipo && !Video.schema.path('tipo').enumValues.includes(updateFields.tipo)) return res.status(400).json({ error: `Tipo inválido` });

    const updatedVideo = await Video.findByIdAndUpdate( 
      req.params.id, { $set: updateFields }, { new: true, runValidators: true }
    );
    if (!updatedVideo) return res.status(404).json({ error: "Video no encontrado" });
    console.log(`BACKEND PUT /api/videos/${req.params.id}: Video actualizado.`);
    res.json({ message: "Video VOD actualizado", video: updatedVideo });
  } catch (error) { 
    console.error(`Error en BACKEND PUT /api/videos/${req.params.id}:`, error);
    next(error); 
  }
});

// DELETE /api/videos/:id
router.delete("/:id", verifyToken, isAdmin, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "ID inválido." });
    const deletedVideo = await Video.findByIdAndDelete(req.params.id);
    if (!deletedVideo) return res.status(404).json({ error: "Video no encontrado" });
    console.log(`BACKEND DELETE /api/videos/${req.params.id}: Video eliminado.`);
    res.json({ message: "Video VOD eliminado" });
  } catch (error) { 
    console.error(`Error en BACKEND DELETE /api/videos/${req.params.id}:`, error);
    next(error); 
  }
});

export default router;
