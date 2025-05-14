// iptv-backend/routes/videos.routes.js
import express from "express";
import multer from "multer";
import fs from "fs";
import readline from "readline";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js"; // isAdmin será útil
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
router.post("/upload-m3u", verifyToken, isAdmin, upload.single("file"), async (req, res) => { // isAdmin para esta ruta sensible
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
          // user: req.user.id, // Si Channel model tiene 'user' y es relevante aquí
        });
        try {
          const existingChannel = await Channel.findOne({ url: streamUrl });
          if (existingChannel) { console.log(`Channel URL ${streamUrl} already exists. Skipping.`); }
          else { const savedChannel = await newChannel.save(); entriesSaved.push(savedChannel); }
        } catch (dbError) { console.error(`Error saving channel "${currentName}": ${dbError.message}`); }
        currentName = ""; currentLogo = ""; currentCategory = "";
      }
    }
    res.json({ message: "M3U processed. Channels saved to 'Channels' collection.", entriesAdded: entriesSaved.length });
  } catch (processingError) {
    console.error("Error processing M3U:", processingError);
    res.status(500).json({ error: "Error processing M3U content." });
  } finally {
    try { await fs.promises.unlink(req.file.path); }
    catch (unlinkError) { console.error("Error deleting temp M3U file:", unlinkError); }
  }
});

/* ========================================================================== */
/* 2. CRUD para VOD (Películas y Series)                                    */
/* ========================================================================== */

// CREAR NUEVO VOD (upload-link)
router.post("/upload-link", verifyToken, isAdmin, async (req, res) => { // isAdmin aquí también
  const { 
    title, url, tipo = "pelicula", logo, // 'logo' es el campo principal para thumbnail
    category, description, releaseYear, isFeatured, active 
  } = req.body;

  if (!title || !url) {
    return res.status(400).json({ error: "Título y URL son requeridos para VOD" });
  }
  try {
    let finalLogo = logo;
    if (!finalLogo && title) { // Solo busca en TMDB si no se provee logo y hay título
        try {
            finalLogo = await getTMDBThumbnail(title, tipo === 'serie' ? 'tv' : 'movie');
        } catch (tmdbError) {
            console.warn(`TMDB (crear VOD): No se pudo obtener logo para "${title}": ${tmdbError.message}`);
            finalLogo = "";
        }
    }

    const video = new Video({
      title, url, tipo, logo: finalLogo || "", category: category || "General",
      description: description || "", releaseYear: releaseYear || null,
      isFeatured: isFeatured || false, 
      active: active !== undefined ? active : true, 
      user: req.user.id, // Asocia VOD al admin que lo sube
    });
    await video.save();
    res.status(201).json({ message: "Video VOD guardado correctamente", video });
  } catch (error) {
     console.error("Error al guardar Video VOD:", error);
     if (error.name === 'ValidationError') {
        return res.status(400).json({ error: "Error de validación", details: error.errors });
     }
     res.status(400).json({ error: "Error al guardar el video VOD." });
  }
});

// LISTAR TODOS LOS VOD (PARA ADMIN PANEL - Protegido por Admin)
// El AdminPanel.jsx -> fetchVideos() llamará a este.
router.get("/", verifyToken, isAdmin, async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 }); // Admin ve todos los videos
    res.json(videos.map(v => ({ // Mapear para consistencia y seleccionar campos
        id: v._id,
        _id: v._id, // AdminPanel usa a veces uno u otro
        title: v.title,
        name: v.title, // Para consistencia con Card/Carousel
        url: v.url,
        tipo: v.tipo,
        logo: v.logo,
        thumbnail: v.logo, // Para consistencia con Card/Carousel
        category: v.category,
        description: v.description,
        releaseYear: v.releaseYear,
        isFeatured: v.isFeatured,
        active: v.active,
        trailerUrl: v.trailerUrl,
        // user: v.user // Opcional si el admin necesita ver quién lo subió
    })));
  } catch (error) {
    console.error("Error al listar todos los videos (admin):", error);
    res.status(500).json({ error: "Error al listar videos" });
  }
});

// OBTENER UN VOD ESPECÍFICO POR ID (Protegido)
// Watch.jsx y AdminPanel (para editar) llamarán a este
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    // Podrías añadir lógica aquí: si !video.active y el usuario no es admin, denegar.
    // Por ahora, si el usuario está logueado y el video existe, lo devuelve.
    if (!video) {
        return res.status(404).json({ error: "Video no encontrado" });
    }
    // Para AdminPanel, devolver todos los campos. Para Watch.jsx, normalizará.
    res.json(video); 
  } catch (err) {
    console.error("Error al obtener video por ID:", err);
    if (err.kind === 'ObjectId') return res.status(400).json({ error: "ID de video inválido" });
    res.status(500).json({ error: "Error al obtener video" });
  }
});

// ACTUALIZAR UN VOD (Admin)
router.put("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const { title, url, tipo, logo, category, description, releaseYear, isFeatured, active, trailerUrl } = req.body;
    
    // Construir objeto con los campos a actualizar (para no sobreescribir con undefined si no vienen)
    const updateFields = { updatedAt: Date.now() };
    if (title !== undefined) updateFields.title = title;
    if (url !== undefined) updateFields.url = url;
    if (tipo !== undefined) updateFields.tipo = tipo;
    if (logo !== undefined) updateFields.logo = logo; // Si se envía logo vacío, se actualiza a vacío
    if (category !== undefined) updateFields.category = category;
    if (description !== undefined) updateFields.description = description;
    if (releaseYear !== undefined) updateFields.releaseYear = releaseYear ? parseInt(releaseYear) : null;
    if (isFeatured !== undefined) updateFields.isFeatured = isFeatured;
    if (active !== undefined) updateFields.active = active;
    if (trailerUrl !== undefined) updateFields.trailerUrl = trailerUrl;

    const updatedVideo = await Video.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true } // Devuelve el documento actualizado
    );

    if (!updatedVideo) {
      return res.status(404).json({ error: "Video no encontrado para actualizar" });
    }
    res.json({ message: "Video VOD actualizado correctamente", video: updatedVideo });
  } catch (error) {
    console.error("Error al actualizar Video VOD:", error);
    if (error.name === 'ValidationError') {
        return res.status(400).json({ error: "Error de validación", details: error.errors });
    }
    if (error.kind === 'ObjectId') return res.status(400).json({ error: "ID de video inválido" });
    res.status(500).json({ error: "Error al actualizar el video VOD" });
  }
});

// ELIMINAR UN VOD (Admin)
router.delete("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const deletedVideo = await Video.findByIdAndDelete(req.params.id);
    if (!deletedVideo) {
      return res.status(404).json({ error: "Video no encontrado para eliminar" });
    }
    res.json({ message: "Video VOD eliminado correctamente" });
  } catch (error) {
    console.error("Error al eliminar Video VOD:", error);
    if (error.kind === 'ObjectId') return res.status(400).json({ error: "ID de video inválido" });
    res.status(500).json({ error: "Error al eliminar el video VOD" });
  }
});


/* ========================================================================== */
/* ENDPOINTS PÚBLICOS PARA CONTENIDO DESTACADO (HOME PAGE)        */
/* ========================================================================== */
router.get("/public/featured-movies", async (req, res) => {
  try {
    const movies = await Video.find({ tipo: "pelicula", active: true })
                                 .sort({ createdAt: -1 })
                                 .limit(10);
    res.json(movies.map(mapVODToFrontendFormat));
  } catch (error) {
    console.error("Error al obtener películas destacadas:", error);
    res.status(500).json({ error: "Error al obtener películas destacadas" });
  }
});

router.get("/public/featured-series", async (req, res) => {
  try {
    const series = await Video.find({ tipo: "serie", isFeatured: true, active: true })
                                 .sort({ createdAt: -1 })
                                 .limit(5);
    res.json(series.map(mapVODToFrontendFormat));
  } catch (error) {
    console.error("Error al obtener series destacadas:", error);
    res.status(500).json({ error: "Error al obtener series destacadas" });
  }
});

export default router;