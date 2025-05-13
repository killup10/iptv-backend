// iptv-backend/routes/videos.routes.js
import express from "express";
import multer from "multer";
import fs from "fs";
import readline from "readline";
import { verifyToken } from "../middlewares/verifyToken.js";
import Video from "../models/Video.js"; // Tu modelo Video actualizado
import Channel from "../models/Channel.js"; // Para guardar M3U en Channels
import getTMDBThumbnail from "../utils/getTMDBThumbnail.js";

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"), // Carpeta para M3U temporales
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

/* ========================================================================== */
/* 1. SUBIR ARCHIVO .M3U y PROCESAR A CHANNELS                */
/* ========================================================================== */
router.post("/upload-m3u", verifyToken, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No se proporcionó ningún archivo M3U." });
  }

  const entriesSaved = [];
  const fileStream = fs.createReadStream(req.file.path);
  const rl = readline.createInterface({ input: fileStream });

  let currentName = "";
  let currentLogo = "";
  let currentCategory = "";

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
        
        const newChannel = new Channel({ // Guardando en la colección Channel
          name: currentName,
          url: streamUrl,
          category: currentCategory,
          logo: finalLogo || "",
          active: true,
          // user: req.user.id, // Descomenta si tu modelo Channel tiene 'user'
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

/* ========================================================================== */
/* 2. SUBIR VIDEO MANUAL (Película o Serie VOD)             */
/* ========================================================================== */
router.post("/upload-link", verifyToken, async (req, res) => {
  const { 
    title, url, tipo = "pelicula", 
    thumbnail, // Este podría ser el 'logo' de tu modelo Video
    category, description, releaseYear, isFeatured 
  } = req.body;

  if (!title || !url) {
    return res.status(400).json({ error: "Título y URL son requeridos para VOD" });
  }
  try {
    const finalThumbnail = thumbnail || (await getTMDBThumbnail(title, tipo === 'serie' ? 'tv' : 'movie')) || "";
    const video = new Video({
      title,
      url,
      tipo,
      logo: finalThumbnail, // Usando el campo 'logo' de tu modelo Video
      category: category || "General",
      description: description || "",
      releaseYear: releaseYear || null,
      isFeatured: isFeatured || false,
      active: true, // Asegúrate de que tu modelo Video.js tenga el campo 'active'
      user: req.user.id,
    });
    await video.save();
    res.status(201).json({ message: "Video VOD guardado correctamente", video });
  } catch (error) {
     console.error("Error al guardar Video VOD:", error);
     res.status(400).json({ error: "Error al guardar el video VOD." });
  }
});

/* ========================================================================== */
/* 3. LISTAR VIDEOS (Películas Y Series - Protegido)              */
/* ========================================================================== */
router.get("/", verifyToken, async (req, res) => {
  try {
    const videos = await Video.find({ user: req.user.id, active: true }) // Solo del usuario y activos
                           .sort({ createdAt: -1 }); 
    res.json(videos);
  } catch (error) {
    console.error("Error al listar videos (protegido):", error);
    res.status(500).json({ error: "Error al listar videos" });
  }
});

/* ========================================================================== */
/* 4. ENDPOINTS PÚBLICOS PARA CONTENIDO DESTACADO                 */
/* ========================================================================== */

// Función helper para mapear formato de VOD para el frontend
const mapVODToFrontendFormat = (v) => ({
  id: v._id,
  name: v.title, // Frontend usa 'name' en Carousels
  title: v.title,
  thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || v.thumbnail || "", // Lógica para el mejor thumbnail
  url: v.url,
  category: v.category || "general",
  tipo: v.tipo,
  description: v.description || "",
  trailerUrl: v.trailerUrl || ""
});

// Endpoint público para películas destacadas
router.get("/public/featured-movies", async (req, res) => {
  try {
    const movies = await Video.find({ tipo: "pelicula", active: true }) // Asume que Video model tiene 'active'
                                 .sort({ createdAt: -1 })
                                 .limit(10);
    res.json(movies.map(mapVODToFrontendFormat));
  } catch (error) {
    console.error("Error al obtener películas destacadas:", error);
    res.status(500).json({ error: "Error al obtener películas destacadas" });
  }
});

// Endpoint público para series destacadas
router.get("/public/featured-series", async (req, res) => {
  try {
    const series = await Video.find({ tipo: "serie", isFeatured: true, active: true }) // Asume que Video model tiene 'active' e 'isFeatured'
                                 .sort({ createdAt: -1 })
                                 .limit(5);
    res.json(series.map(mapVODToFrontendFormat));
  } catch (error) {
    console.error("Error al obtener series destacadas:", error);
    res.status(500).json({ error: "Error al obtener series destacadas" });
  }
});


/* ========================================================================== */
/* 5. OBTENER VIDEO POR ID (Protegido)                        */
/* ========================================================================== */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    // Asegúrate que solo el usuario dueño o un admin puedan ver videos no activos si implementas eso
    const vid = await Video.findOne({ _id: req.params.id, user: req.user.id, active: true });
    // O si son globales para usuarios logueados y activos:
    // const vid = await Video.findOne({ _id: req.params.id, active: true });
    if (!vid) return res.status(404).json({ error: "Video no encontrado, no activo, o acceso denegado" });
    res.json(vid); // Devuelve el documento completo, Watch.jsx lo normalizará
  } catch (err) {
    console.error("Error al obtener video por ID:", err);
    if (err.kind === 'ObjectId') return res.status(400).json({ error: "ID de video inválido" });
    res.status(500).json({ error: "Error al obtener video" });
  }
});

export default router;