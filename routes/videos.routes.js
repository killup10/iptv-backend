// En tu archivo videos.routes.js (o donde tengas este endpoint)

import express from "express";
import multer from "multer";
import fs from "fs";
import readline from "readline";
import { verifyToken } from "../middlewares/verifyToken.js"; // verifyToken o el middleware que uses
// import Video from "../models/Video.js"; // Ya no guardaremos como Video
import Channel from "../models/Channel.js"; // <--- IMPORTANTE: Importa el modelo Channel
import getTMDBThumbnail from "../utils/getTMDBThumbnail.js";

const router = express.Router();

// Configuración de Multer (sin cambios)
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

  const entriesSaved = []; // Para llevar cuenta de lo que se guarda
  const fileStream = fs.createReadStream(req.file.path);
  const rl = readline.createInterface({ input: fileStream });

  let currentTitle = "";
  let currentLogo = "";
  let currentGroup = ""; // Esto será 'category' en el modelo Channel

  try {
    for await (const line of rl) {
      if (line.startsWith("#EXTINF")) {
        const titleMatch = line.match(/,(.*)$/);
        const logoMatch = line.match(/tvg-logo="(.*?)"/);
        const groupMatch = line.match(/group-title="(.*?)"/);

        currentTitle = titleMatch ? titleMatch[1].trim() : "Sin título";
        currentLogo = logoMatch ? logoMatch[1] : "";
        currentGroup = groupMatch ? groupMatch[1].trim() : "General"; // Cae a 'General' si no hay grupo
      } else if (line.startsWith("http")) {
        const streamUrl = line.trim();

        // Lógica para el logo/thumbnail
        let finalLogo = currentLogo;
        if (!finalLogo && currentTitle !== "Sin título") { // Solo busca en TMDB si no hay logo y hay un título válido
          try {
            finalLogo = await getTMDBThumbnail(currentTitle, 'tv'); // Asumimos que getTMDBThumbnail puede buscar para 'tv' o 'movie'
          } catch (tmdbError) {
            console.warn(`TMDB: No se pudo obtener logo para "${currentTitle}": ${tmdbError.message}`);
            finalLogo = ""; // Fallback a sin logo
          }
        }
        
        // Crear y guardar en la colección Channel
        const newChannel = new Channel({
          name: currentTitle,
          url: streamUrl,
          category: currentGroup, // Mapea group-title a category
          logo: finalLogo || "", // Usa el logo encontrado o un string vacío
          active: true,
          // Si tus canales deben estar asociados a un usuario:
          // user: req.user.id, // Necesitarías añadir 'user' al channelSchema
        });
        
        try {
          // Opcional: Evitar duplicados por URL
          const existingChannel = await Channel.findOne({ url: streamUrl });
          if (existingChannel) {
            console.log(`Canal con URL ${streamUrl} ya existe. Omitiendo.`);
            // Podrías querer actualizarlo en lugar de omitirlo
            // entriesSaved.push(existingChannel); // O añadir el existente si lo actualizas
          } else {
            const savedChannel = await newChannel.save();
            entriesSaved.push(savedChannel);
          }
        } catch (dbError) {
            console.error(`Error guardando canal "${currentTitle}" a la BD: ${dbError.message}`);
            // Decide si quieres continuar con otros canales o parar todo el proceso
        }

        // Resetear para la siguiente entrada
        currentTitle = "";
        currentLogo = "";
        currentGroup = "";
      }
    }

    res.json({ 
      message: "Archivo M3U procesado y canales guardados en la colección 'Channels'.", 
      entriesAdded: entriesSaved.length,
      // entries: entriesSaved // Opcional: devolver los canales guardados
    });

  } catch (processingError) {
    console.error("Error procesando el archivo M3U línea por línea:", processingError);
    res.status(500).json({ error: "Error al procesar el contenido del archivo M3U." });
  } finally {
    // Borrar el archivo M3U temporal subido del servidor
    try {
      await fs.promises.unlink(req.file.path); // Usar fs.promises.unlink
    } catch (unlinkError) {
      console.error("Error al borrar el archivo M3U temporal:", unlinkError);
    }
  }
});

// ... (tus otras rutas en videos.routes.js como /upload-link, GET /, GET /:id) ...
// ¡AHORA AÑADIREMOS EL NUEVO ENDPOINT PÚBLICO!

/* ------------------- NUEVO: Listar Videos/Series Destacados (Público) -------------------- */
router.get("/public/featured", async (req, res) => {
  try {
    const commonQueryOptions = { active: true }; // Asumiendo que tienes 'active' en tu modelo Video

    // Películas Destacadas: las 10 más recientes (que sean del "año 2025" si tienes ese filtro)
    // Si tienes un campo 'releaseYear' en tu modelo Video:
    // const featuredMovies = await Video.find({ tipo: "pelicula", releaseYear: 2025, ...commonQueryOptions })
    // Si "Cine 2025 FHD" es una categoría (group):
    // const featuredMovies = await Video.find({ tipo: "pelicula", category: "Cine 2025 FHD", ...commonQueryOptions })
    // Por ahora, tomaremos las 10 más recientes en general:
    const featuredMovies = await Video.find({ tipo: "pelicula", ...commonQueryOptions })
                                     .sort({ createdAt: -1 }) // Más recientes primero
                                     .limit(10); 

    // Series Destacadas: las 2-3 marcadas con isFeatured: true
    // Asegúrate de haber añadido 'isFeatured' a tu videoSchema
    const featuredSeries = await Video.find({ tipo: "serie", isFeatured: true, ...commonQueryOptions })
                                     .sort({ createdAt: -1 }) // O por algún otro criterio
                                     .limit(5); // Mostrar hasta 5 series destacadas

    // Mapear al formato que el frontend podría esperar (ajusta según necesidad)
    const mapToFrontendFormat = (v) => ({
      id: v._id,
      name: v.title, // Asumiendo que usas 'title' en el modelo Video
      title: v.title,
      thumbnail: v.logo || v.customThumbnail || v.tmdbThumbnail || v.thumbnail || "", // Lógica para el mejor thumbnail
      url: v.url,
      category: v.category || "general", // Asumiendo que usas 'category' en el modelo Video
      tipo: v.tipo,
      // description: v.description // si quieres enviar descripción
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


export default router;