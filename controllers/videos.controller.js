// iptv-backend/controllers/videos.controller.js
import Video from "../models/Video.js"; // Asegúrate que la ruta sea correcta
import mongoose from "mongoose";
// import getTMDBThumbnail from "../utils/getTMDBThumbnail.js"; // Descomenta si lo usas para obtener thumbnails

// ... (tus otras funciones de controlador: getPublicFeaturedMovies, getPublicFeaturedSeries, etc.) ...

// --- FUNCIÓN PARA PROCESAR ARCHIVO DE TEXTO/M3U PARA VODS (PELÍCULAS/SERIES) ---
export const createBatchVideosFromTextAdmin = async (req, res, next) => {
  console.log("CTRL: createBatchVideosFromTextAdmin - Archivo recibido:", req.file ? req.file.originalname : "No hay archivo");
  if (!req.file) {
    return res.status(400).json({ error: "No se proporcionó ningún archivo." });
  }

  try {
    const fileContent = req.file.buffer.toString("utf8");
    const lines = fileContent.split(/\r?\n/);

    let videosToAdd = [];
    let currentVideoData = {}; // Usar un nombre diferente para evitar confusión con el modelo Video
    let itemsFoundInFile = 0;

    // La cabecera #EXTM3U es opcional para este parser si el formato es consistente
    if (lines[0]?.startsWith('#EXTM3U')) {
        console.log("CTRL: createBatchVideosFromTextAdmin - Archivo M3U detectado.");
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      if (line.startsWith("#EXTINF:")) {
        itemsFoundInFile++;
        currentVideoData = { // Valores por defecto para cada VOD
          tipo: "pelicula", // Por defecto, o podrías intentar inferirlo
          active: true,
          isFeatured: false,
          mainSection: "POR_GENERO", // Sección por defecto
          requiresPlan: ["gplay"],   // Plan básico por defecto
          user: req.user.id,         // Admin que sube
          genres: [],
        };

        // Extraer título (lo que viene después de la coma)
        let titlePart = line.substring(line.lastIndexOf(",") + 1).trim();
        
        // Intentar extraer año del título (ej. "Mi Pelicula (2023)" o "Mi Pelicula 2023")
        const yearMatch = titlePart.match(/\(?(\d{4})\)?$/); // Busca (YYYY) o YYYY al final
        if (yearMatch && yearMatch[1]) {
          currentVideoData.releaseYear = parseInt(yearMatch[1], 10);
          // Quitar el año y los paréntesis del título
          titlePart = titlePart.replace(/\s*\(\d{4}\)$/, '').trim();
          titlePart = titlePart.replace(/\s+\d{4}$/, '').trim(); // Para el caso sin paréntesis
        }
        currentVideoData.title = titlePart;

        // Intentar extraer géneros de la línea #EXTGRP: que debería estar DESPUÉS de #EXTINF
        // y ANTES de la URL.
        let nextLineIndex = i + 1;
        if (lines[nextLineIndex]?.startsWith("#EXTGRP:")) {
          const genreString = lines[nextLineIndex].substring("#EXTGRP:".length).trim();
          currentVideoData.genres = genreString.split(/[,|]/).map(g => g.trim()).filter(g => g);
          i = nextLineIndex; // Avanzar el índice principal ya que hemos procesado esta línea
        }
        
        // Si no se encontraron géneros en #EXTGRP, y hay group-title en #EXTINF
        if ((!currentVideoData.genres || currentVideoData.genres.length === 0)) {
            const groupMatch = line.match(/group-title="([^"]*)"/i);
            if (groupMatch && groupMatch[1]) {
                currentVideoData.genres = groupMatch[1].split(/[,|]/).map(g => g.trim()).filter(g => g);
            }
        }
        
        // Fallback si no hay géneros
        if (!currentVideoData.genres || currentVideoData.genres.length === 0) {
            currentVideoData.genres = ["Indefinido"];
        }

      } else if (currentVideoData.title && !line.startsWith("#")) {
        // Esta línea es la URL, y ya tenemos un título para asociarla
        currentVideoData.url = line;
        if (currentVideoData.title && currentVideoData.url) {
          videosToAdd.push({ ...currentVideoData }); // Copiar el objeto
        }
        currentVideoData = {}; // Reset para el siguiente VOD
      }
    }

    if (videosToAdd.length === 0) {
      return res.status(400).json({ message: `No se encontraron VODs válidos (título/URL) en el archivo. Items parseados: ${itemsFoundInFile}` });
    }

    let vodsAddedCount = 0;
    let vodsSkippedCount = 0;
    const errors = [];

    for (const vodData of videosToAdd) {
      try {
        const existingVideo = await Video.findOne({ url: vodData.url });
        if (!existingVideo) {
          // Aquí podrías añadir lógica para obtener thumbnail de TMDB si no se provee logo
          // if (!vodData.logo && vodData.title) {
          //   vodData.logo = await getTMDBThumbnail(vodData.title, vodData.releaseYear);
          // }
          const newVideo = new Video(vodData);
          await newVideo.save();
          vodsAddedCount++;
        } else {
          console.log(`CTRL: createBatchVideosFromTextAdmin - VOD ya existente (misma URL): ${vodData.url}, omitiendo.`);
          vodsSkippedCount++;
        }
      } catch (saveError) {
        console.error(`CTRL: createBatchVideosFromTextAdmin - Error guardando VOD ${vodData.title}: ${saveError.message}`);
        errors.push(`Error con '${vodData.title}': ${saveError.message}`);
      }
    }
    
    const summaryMessage = `Proceso completado. VODs encontrados en archivo: ${itemsFoundInFile}. Nuevos añadidos: ${vodsAddedCount}. Omitidos (duplicados por URL): ${vodsSkippedCount}.`;
    console.log(`CTRL: createBatchVideosFromTextAdmin - ${summaryMessage}`);
    
    if (errors.length > 0) {
        return res.status(207).json({ // 207 Multi-Status si hubo algunos errores
            message: `${summaryMessage} Se encontraron algunos errores.`, 
            added: vodsAddedCount,
            skipped: vodsSkippedCount,
            errors: errors 
        });
    }

    res.json({ message: summaryMessage, added: vodsAddedCount, skipped: vodsSkippedCount });

  } catch (error) {
    console.error("Error en CTRL:createBatchVideosFromTextAdmin:", error.message, error.stack);
    next(error);
  }
};
