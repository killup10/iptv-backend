// routes/videos.routes.js
import express from "express";
import multer from "multer";
import fs from "fs";
import readline from "readline";
import { verifyToken } from "../middlewares/verifyToken.js";
import Video from "../models/Video.js"; // Tu modelo Video
import Channel from "../models/Channel.js"; // <--- IMPORTANTE: Importa el modelo Channel
import getTMDBThumbnail from "../utils/getTMDBThumbnail.js";

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

/* ---------------------- 1. SUBIR ARCHIVO .M3U y PROCESAR A CHANNELS ----------------------- */
router.post("/upload-m3u", verifyToken, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No se proporcionó ningún archivo M3U." });
  }

  const entriesSaved = [];
  const fileStream = fs.createReadStream(req.file.path);
  const rl = readline.createInterface({ input: fileStream });

  let currentName = ""; // Para Channel model
  let currentLogo = "";
  let currentCategory = ""; // Para Channel model

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
          try {
            finalLogo = await getTMDBThumbnail(currentName, 'tv');
          } catch (tmdbError) {
            console.warn(`TMDB: No se pudo obtener logo para "${currentName}": ${tmdbError.message}`);
            finalLogo = "";
          }
        }
        
        // GUARDAR EN LA COLECCIÓN Channel
        const newChannel = new Channel({
          name: currentName,
          url: streamUrl,
          category: currentCategory,
          logo: finalLogo || "",
          active: true,
          // user: req.user.id, // Descomenta si Channel model tiene 'user' y quieres asociarlo
        });
        
        try {
          const existingChannel = await Channel.findOne({ url: streamUrl });
          if (existingChannel) {
            console.log(`Canal con URL ${streamUrl} ya existe en 'Channels'. Omitiendo.`);
          } else {
            const savedChannel = await newChannel.save();
            entriesSaved.push(savedChannel);
          }
        } catch (dbError) {
            console.error(`Error guardando canal "${currentName}" a la colección 'Channels': ${dbError.message}`);
        }
        currentName = ""; currentLogo = ""; currentCategory = "";
      }
    }
    res.json({ 
      message: "Archivo M3U procesado. Canales guardados en la colección 'Channels'.", 
      entriesAdded: entriesSaved.length,
    });
  } catch (processingError) {
    console.error("Error procesando el archivo M3U:", processingError);
    res.status(500).json({ error: "Error al procesar el contenido del M3U." });
  } finally {
    try {
      await fs.promises.unlink(req.file.path);
    } catch (unlinkError) {
      console.error("Error al borrar el archivo M3U temporal:", unlinkError);
    }
  }
});

/* -------------------- 2. SUBIR VIDEO MANUAL (VOD) ------------------ */
router.post("/upload-link", verifyToken, async (req, res) => {
  // Asumiendo que Video model tiene: title, url, tipo, logo, category, description, releaseYear, isFeatured
  const { title, url, tipo = "pelicula", thumbnail, category, description, releaseYear, isFeatured } = req.body;
  if (!title || !url) {
    return res.status(400).json({ error: "Título y URL son requeridos para VOD" });
  }
  try {
    const finalThumbnail = thumbnail || (await getTMDBThumbnail(title, tipo === 'serie' ? 'tv' : 'movie')) || "";
    const video = new Video({
      title,
      url,
      tipo,
      logo: finalThumbnail,
      category: category || "General",
      description: description || "",
      releaseYear: releaseYear || null,
      isFeatured: isFeatured || false,
      user: req.user.id, // Asocia VOD al usuario que lo sube
    });
    await video.save();
    res.status(201).json({ message: "Video VOD guardado correctamente", video });
  } catch (error) {
     console.error("Error al guardar Video VOD:", error);
     res.status(400).json({ error: "Error al guardar el video VOD." });
  }
});

/* ------------- 3. LISTAR VIDEOS (Películas Y Series - Protegido) --------------- */
router.get("/", verifyToken, async (req, res) => {
  try {
    // Aquí podrías filtrar por req.user.id si los VOD son específicos del usuario
    // o si los planes de usuario restringen el acceso.
    // Por ahora, devuelve todos.
    const videos = await Video.find({ user: req.user.id }) // Ejemplo: solo videos del usuario
                           .sort({ createdAt: -1 }); 
    // O si los VOD son globales para todos los usuarios logueados:
    // const videos = await Video.find().sort({ createdAt: -1 });
    res.json(videos);
  } catch (error) {
    console.error("Error al listar videos (protegido):", error);
    res.status(500).json({ error: "Error al listar videos" });
  }
});

/* ------------------- 4. NUEVO: Listar Videos/Series Destacados (Público) -------------------- */
router.get("/public/featured", async (req, res) => {
  try {
    const commonQueryOptions = { active: true }; // Asumiendo que tienes 'active' en Channel y Video

    // Películas Destacadas:
    const featuredMovies = await Video.find({ tipo: "pelicula", ...commonQueryOptions })
                                     .sort({ createdAt: -1 })
                                     .limit(10); 

    // Series Destacadas:
    const featuredSeries = await Video.find({ tipo: "serie", isFeatured: true, ...commonQueryOptions })
                                     .sort({ createdAt: -1 }) 
                                     .limit(5); 

    const mapToFrontendFormat = (v) => ({
      id: v._id,
      name: v.title,
      title: v.title,
      thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || v.thumbnail || "",
      url: v.url,
      category: v.category || "general",
      tipo: v.tipo,
    });

    res.json({
      movies: featuredMovies.map(mapToFrontendFormat),
      series: featuredSeries.map(mapToFrontendFormat)
    });
  } catch (error) {
    console.error("Error al obtener contenido destacado público:", error);
    res.status(500).json({ error: "Error al obtener contenido destacado" });
  }
});

/* ------------------------ 5. OBTENER VIDEO POR ID (Protegido) ----------------------- */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const vid = await Video.findOne({ _id: req.params.id, user: req.user.id }); // Ejemplo: asegurar que el video pertenezca al usuario
    // O si los VOD son globales para todos los usuarios logueados:
    // const vid = await Video.findById(req.params.id);
    if (!vid) return res.status(404).json({ error: "Video no encontrado o acceso denegado" });
    res.json(vid);
  } catch (err) {
    console.error("Error al obtener video por ID:", err);
    if (err.kind === 'ObjectId') return res.status(400).json({ error: "ID de video inválido" });
    res.status(500).json({ error: "Error al obtener video" });
  }
});

export default router;