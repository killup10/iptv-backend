// iptv-backend/routes/videos.routes.js
import express from "express";
import multer from "multer";
import fs from "fs";
import readline from "readline";
import mongoose from "mongoose";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import Video from "../models/Video.js";
import Channel from "../models/Channel.js"; 
import getTMDBThumbnail from "../utils/getTMDBThumbnail.js";

const router = express.Router();

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
  console.log("----------------------------------------------------------");
  console.log("BACKEND: Accediendo a /api/videos/public/featured-series");
  console.log("Headers de la petición:", JSON.stringify(req.headers, null, 2));
  console.log("----------------------------------------------------------");

  // ---- INICIO DE PRUEBA TEMPORAL ----
  // Descomenta la siguiente línea para probar una respuesta directa:
  // return res.status(200).json([{ id: 'test001', title: 'Serie de Prueba Pública', name: 'Serie de Prueba Pública', thumbnail: '/img/placeholder-default.png' }]);
  // ---- FIN DE PRUEBA TEMPORAL ----

  try {
    const criteria = { tipo: "serie", isFeatured: true, active: true };
    console.log("BACKEND /public/featured-series - Criterio:", criteria);
    const series = await Video.find(criteria).sort({ createdAt: -1 }).limit(10);
    console.log("BACKEND /public/featured-series - Series encontradas:", series.length);
    
    const mapVODToPublicFormat = (v) => ({
        id: v._id,
        _id: v._id,
        name: v.title,
        title: v.title,
        thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || "/img/placeholder-default.png",
        url: v.url,
        mainSection: v.mainSection,
        genres: v.genres,
        tipo: v.tipo,
        description: v.description || "",
        trailerUrl: v.trailerUrl || ""
    });
    res.json(series.map(mapVODToPublicFormat));
  } catch (error) { 
    console.error("Error en BACKEND /public/featured-series:", error.message); // Loguea solo el mensaje
    // También es útil loguear el error completo para más detalles si es necesario
    // console.error(error); 
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
    } else { // Es AdminView
      console.log("BACKEND GET /api/videos - Es AdminView.");
      // No aplicar filtros de plan o active por defecto para admin, a menos que se especifiquen en query
      if (req.query.active === 'true') query.active = true;
      if (req.query.active === 'false') query.active = false;
      // Aquí, si no hay filtro 'active', `query` podría quedar como `{}` o con otros filtros
    }

    // Aplicar otros filtros si vienen en la query
    if (req.query.mainSection && req.query.mainSection !== "POR_GENERO") query.mainSection = req.query.mainSection;
    if (req.query.genre && req.query.genre !== "Todas") query.genres = req.query.genre;
    if (req.query.tipo) query.tipo = req.query.tipo;
    if (req.query.search) query.$text = { $search: req.query.search };
    
    console.log(`BACKEND GET /api/videos - User: ${req.user.username}, Plan: ${userPlan}, AdminView: ${isAdminView}, Query a ejecutar:`, JSON.stringify(query));

    const videos = await Video.find(query)
                              .sort(req.query.sort || { createdAt: -1 })
                              .limit(parseInt(req.query.limit) || 50) // Poner un límite por defecto razonable
                              .skip(parseInt(req.query.skip) || 0);
    
    console.log(`BACKEND GET /api/videos - Películas/Series encontradas: ${videos.length}`);
    // Si videos.length es 0, aquí está el problema principal si esperabas datos.

    const mapToUserFormat = (v) => ({
        id: v._id, _id: v._id, name: v.title, title: v.title,
        thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || "",
        url: v.url, mainSection: v.mainSection, genres: v.genres,
        description: v.description || "", trailerUrl: v.trailerUrl || "", tipo: v.tipo,
    });
    const mapToFullAdminFormat = (v) => ({ // Este es el que usa AdminPanel.jsx
        id: v._id, _id: v._id, title: v.title, name: v.title, // 'name' para compatibilidad
        description: v.description, url: v.url, tipo: v.tipo,
        mainSection: v.mainSection, genres: v.genres, requiresPlan: v.requiresPlan,
        releaseYear: v.releaseYear, isFeatured: v.isFeatured,
        logo: v.logo, thumbnail: v.logo, // 'thumbnail' para compatibilidad
        customThumbnail: v.customThumbnail,
        tmdbThumbnail: v.tmdbThumbnail, trailerUrl: v.trailerUrl, active: v.active,
        user: v.user, createdAt: v.createdAt, updatedAt: v.updatedAt
    });

    if (isAdminView) {
        res.json(videos.map(mapToFullAdminFormat));
    } else {
        res.json(videos.map(mapToUserFormat));
    }

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
    
    res.json({ /* ... tu formato de video para Watch.jsx ... */ });
  } catch (err) { next(err); }
});

// POST /api/videos/upload-m3u (Procesa M3U y guarda como Canales)
router.post("/upload-m3u", verifyToken, isAdmin, upload.single("file"), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: "No se proporcionó ningún archivo M3U." });
  console.log(`BACKEND /upload-m3u: Procesando archivo ${req.file.filename}`);
  // ... (tu lógica completa de parseo y guardado en la colección Channel)
  res.json({ message: "M3U procesado (lógica de ejemplo).", entriesAdded: 0 });
});

// POST /api/videos/upload-link (Crear un VOD)
router.post("/upload-link", verifyToken, isAdmin, async (req, res, next) => {
  // ... (tu código existente, asegúrate de que los defaults y validaciones para mainSection, genres, requiresPlan estén bien)
  const { title, url, tipo, mainSection, requiresPlan /* ... otros ... */ } = req.body;
  if (mainSection && !Video.schema.path('mainSection').enumValues.includes(mainSection)) return res.status(400).json({ error: `Sección principal inválida` });
  if (requiresPlan && !Video.schema.path('requiresPlan').enumValues.includes(requiresPlan)) return res.status(400).json({ error: `Plan requerido inválido` });
  if (tipo && !Video.schema.path('tipo').enumValues.includes(tipo)) return res.status(400).json({ error: `Tipo inválido` });
  try {
    // ... tu lógica de creación de video ...
    const videoData = new Video({ /* ... */ });
    const savedVideo = await videoData.save();
    res.status(201).json({ message: "Video VOD guardado", video: savedVideo });
  } catch (error) { next(error); }
});

// PUT /api/videos/:id (Actualizar VOD)
router.put("/:id", verifyToken, isAdmin, async (req, res, next) => {
  // ... (tu código existente, asegúrate de que las validaciones para mainSection, etc., estén bien)
  const { mainSection, requiresPlan, tipo /* ... otros ... */ } = req.body;
  if (mainSection && !Video.schema.path('mainSection').enumValues.includes(mainSection)) return res.status(400).json({ error: `Sección inválida` });
  if (requiresPlan && !Video.schema.path('requiresPlan').enumValues.includes(requiresPlan)) return res.status(400).json({ error: `Plan inválido` });
  if (tipo && !Video.schema.path('tipo').enumValues.includes(tipo)) return res.status(400).json({ error: `Tipo inválido` });
  try {
    // ... tu lógica de actualización ...
    const updatedVideo = await Video.findByIdAndUpdate( /* ... */ );
    res.json({ message: "Video VOD actualizado", video: updatedVideo });
  } catch (error) { next(error); }
});

// DELETE /api/videos/:id
router.delete("/:id", verifyToken, isAdmin, async (req, res, next) => {
  // ... (tu código existente) ...
});

export default router;