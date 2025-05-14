// iptv-backend/routes/videos.routes.js
import express from "express";
import multer from "multer";
import fs from "fs";
import readline from "readline";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import Video from "../models/Video.js"; 
import Channel from "../models/Channel.js"; 
import getTMDBThumbnail from "../utils/getTMDBThumbnail.js";

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

/* ========================================================================== */
/* 1. SUBIR ARCHIVO .M3U y PROCESAR A CHANNELS                */
/* ========================================================================== */
router.post("/upload-m3u", verifyToken, isAdmin, upload.single("file"), async (req, res, next) => { // Añadido next
  if (!req.file) {
    return res.status(400).json({ error: "No se proporcionó ningún archivo M3U." });
  }
  const entriesSaved = [];
  const fileStream = fs.createReadStream(req.file.path);
  const rl = readline.createInterface({ input: fileStream });
  let currentName = "", currentLogo = "", currentCategory = "";
  try {
    for await (const line of rl) {
      if (line.startsWith("#EXTINF")) {
        const titleMatch = line.match(/,(.*)$/);
        const logoMatch = line.match(/tvg-logo="(.*?)"/);
        const groupMatch = line.match(/group-title="(.*?)"/);
        currentName = titleMatch ? titleMatch[1].trim() : "Sin nombre";
        currentLogo = logoMatch ? logoMatch[1] : "";
        currentCategory = groupMatch ? groupMatch[1].trim() : "General";
      } else if (line.startsWith("http")) {
        const streamUrl = line.trim();
        let finalLogo = currentLogo;
        if (!finalLogo && currentName !== "Sin nombre") {
          try { finalLogo = await getTMDBThumbnail(currentName, 'tv'); }
          catch (tmdbError) { console.warn(`TMDB: No logo for "${currentName}": ${tmdbError.message}`); finalLogo = ""; }
        }
        const newChannel = new Channel({
          name: currentName, url: streamUrl, category: currentCategory,
          logo: finalLogo || "", active: true,
          user: req.user.id, // ASOCIAR AL ADMIN QUE SUBE EL M3U
        });
        try {
          const existingChannel = await Channel.findOne({ url: streamUrl, user: req.user.id });
          if (existingChannel) { console.log(`Channel URL ${streamUrl} for user ${req.user.id} already exists. Skipping.`); }
          else { const savedChannel = await newChannel.save(); entriesSaved.push(savedChannel); }
        } catch (dbError) { console.error(`Error saving channel "${currentName}": ${dbError.message}`); }
        currentName = ""; currentLogo = ""; currentCategory = "";
      }
    }
    res.json({ message: "M3U processed. Channels saved to 'Channels' collection.", entriesAdded: entriesSaved.length });
  } catch (processingError) {
    console.error("Error processing M3U:", processingError);
    next(processingError); // Pasar al manejador de errores global
  } finally {
    try { await fs.promises.unlink(req.file.path); }
    catch (unlinkError) { console.error("Error deleting temp M3U file:", unlinkError); }
  }
});

/* ========================================================================== */
/* 2. CRUD para VOD (Películas y Series)                                    */
/* ========================================================================== */
router.post("/upload-link", verifyToken, isAdmin, async (req, res, next) => { // Añadido next
  const { 
    title, url, tipo = "pelicula", logo, category, description, 
    releaseYear, isFeatured, active, trailerUrl 
  } = req.body;
  if (!title || !url) return res.status(400).json({ error: "Título y URL requeridos" });
  try {
    let finalLogo = logo;
    if (!finalLogo && title) {
        try { finalLogo = await getTMDBThumbnail(title, tipo === 'serie' ? 'tv' : 'movie'); }
        catch (tmdbError) { console.warn(`TMDB: No logo for "${title}": ${tmdbError.message}`); finalLogo = ""; }
    }
    const video = new Video({
      title, url, tipo, logo: finalLogo || "", category: category || "General",
      description: description || "", releaseYear: releaseYear || null,
      isFeatured: isFeatured || false, active: active !== undefined ? active : true, 
      trailerUrl: trailerUrl || "", user: req.user.id,
    });
    await video.save();
    res.status(201).json({ message: "Video VOD guardado", video });
  } catch (error) {
     console.error("Error guardando Video VOD:", error);
     next(error);
  }
});

router.get("/", verifyToken, isAdmin, async (req, res, next) => { // Añadido next
  try {
    const videos = await Video.find().sort({ createdAt: -1 }); 
    const mapToFullAdminFormat = (v) => ({
      id: v._id, _id: v._id, title: v.title, name: v.title,
      description: v.description, url: v.url, tipo: v.tipo,
      category: v.category, releaseYear: v.releaseYear, isFeatured: v.isFeatured,
      logo: v.logo, thumbnail: v.logo, customThumbnail: v.customThumbnail,
      tmdbThumbnail: v.tmdbThumbnail, trailerUrl: v.trailerUrl, active: v.active,
      user: v.user, createdAt: v.createdAt, updatedAt: v.updatedAt
    });
    res.json(videos.map(mapToFullAdminFormat));
  } catch (error) {
    console.error("Error al listar todos los videos (admin):", error);
    next(error);
  }
});

router.get("/:id", verifyToken, async (req, res, next) => { // Añadido next
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ error: "Video no encontrado" });
    if (!video.active && (!req.user || (req.user.role !== 'admin' && video.user.toString() !== req.user.id))) {
        return res.status(403).json({ error: "Video no activo o acceso denegado" });
    }
    if (req.user.role === 'admin' || video.user.toString() === req.user.id || video.active) {
        res.json(video); 
    } else {
        return res.status(403).json({ error: "Acceso denegado a este video" });
    }
  } catch (err) {
    console.error("Error al obtener video por ID:", err);
    next(err);
  }
});

router.put("/:id", verifyToken, isAdmin, async (req, res, next) => { // Añadido next
  try {
    const { title, url, tipo, logo, category, description, releaseYear, isFeatured, active, trailerUrl } = req.body;
    const updateFields = { updatedAt: Date.now() };
    if (title !== undefined) updateFields.title = title;
    if (url !== undefined) updateFields.url = url;
    if (tipo !== undefined) updateFields.tipo = tipo;
    if (logo !== undefined) updateFields.logo = logo;
    if (category !== undefined) updateFields.category = category;
    if (description !== undefined) updateFields.description = description;
    if (releaseYear !== undefined) updateFields.releaseYear = releaseYear ? parseInt(releaseYear) : null;
    if (isFeatured !== undefined) updateFields.isFeatured = isFeatured;
    if (active !== undefined) updateFields.active = active;
    if (trailerUrl !== undefined) updateFields.trailerUrl = trailerUrl;
    const updatedVideo = await Video.findByIdAndUpdate( req.params.id, updateFields, { new: true });
    if (!updatedVideo) return res.status(404).json({ error: "Video no encontrado para actualizar" });
    res.json({ message: "Video VOD actualizado", video: updatedVideo });
  } catch (error) {
    console.error("Error al actualizar Video VOD:", error);
    next(error);
  }
});

router.delete("/:id", verifyToken, isAdmin, async (req, res, next) => { // Añadido next
  try {
    const deletedVideo = await Video.findByIdAndDelete(req.params.id);
    if (!deletedVideo) return res.status(404).json({ error: "Video no encontrado para eliminar" });
    res.json({ message: "Video VOD eliminado" });
  } catch (error) {
    console.error("Error al eliminar Video VOD:", error);
    next(error);
  }
});

/* ========================================================================== */
/* ENDPOINTS PÚBLICOS PARA CONTENIDO DESTACADO (HOME PAGE)        */
/* ========================================================================== */
const mapVODToPublicFormat = (v) => ({ // Renombrado para diferenciar del de Admin
  id: v._id,
  name: v.title,
  title: v.title,
  thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || v.thumbnail || "",
  url: v.url,
  category: v.category || "general",
  tipo: v.tipo,
  description: v.description || "", // Para el hover card
  trailerUrl: v.trailerUrl || ""   // Para el hover card
});

router.get("/public/featured-movies", async (req, res, next) => { // Añadido next
  try {
    // Asegúrate que tu modelo Video.js tenga 'active' y 'tipo'
    const movies = await Video.find({ tipo: "pelicula", active: true }) 
                                 .sort({ createdAt: -1 })
                                 .limit(10);
    res.json(movies.map(mapVODToPublicFormat));
  } catch (error) {
    console.error("Error al obtener películas destacadas:", error);
    next(error); // Pasar al manejador de errores global
  }
});

router.get("/public/featured-series", async (req, res, next) => { // Añadido next
  try {
    // Asegúrate que tu modelo Video.js tenga 'active', 'isFeatured' y 'tipo'
    const series = await Video.find({ tipo: "serie", isFeatured: true, active: true })
                                 .sort({ createdAt: -1 })
                                 .limit(5);
    res.json(series.map(mapVODToPublicFormat));
  } catch (error) {
    console.error("Error al obtener series destacadas:", error);
    next(error); // Pasar al manejador de errores global
  }
});

export default router;