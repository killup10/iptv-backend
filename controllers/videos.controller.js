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

    let seriesMap = new Map(); // Para agrupar capítulos por serie
    let videosToAdd = [];
    let currentVideoData = {};
    let itemsFoundInFile = 0;

    // Función para detectar y extraer información de serie
    const parseSeriesInfo = (title) => {
      // Patrones comunes para detectar episodios
      const patterns = [
        /^(.*?)\s*[-–]\s*(?:S\d+E(\d+)|Ep(?:isodio)?\s*(\d+))/i,  // "Serie - S01E01" o "Serie - Ep 1"
        /^(.*?)\s*(?:Capitulo|Cap)\s*(\d+)/i,                      // "Serie Capitulo 1"
        /^(.*?)\s*(\d+)\s*(?:END)?$/i                              // "Serie 01" o "Serie 01 END"
      ];

      for (const pattern of patterns) {
        const match = title.match(pattern);
        if (match) {
          const seriesName = match[1].trim();
          const episodeNumber = match[2] || match[3];
          return { seriesName, episodeNumber: parseInt(episodeNumber, 10) };
        }
      }
      return null;
    };

    // Función para detectar subtipo
    const detectSubtipo = (title, genres = []) => {
      title = title.toLowerCase();
      const keywords = {
        anime: ['anime', 'sub esp', 'japanese', '(jp)', 'temporada'],
        dorama: ['dorama', 'kdrama', 'korean', '(kr)'],
        novela: ['novela', 'telenovela'],
        documental: ['documental', 'documentary', 'national geographic', 'discovery']
      };

      for (const [tipo, palabras] of Object.entries(keywords)) {
        if (palabras.some(word => title.includes(word)) || 
            genres.some(genre => palabras.includes(genre.toLowerCase()))) {
          return tipo;
        }
      }
      return 'serie';
    };

    // La cabecera #EXTM3U es opcional para este parser si el formato es consistente
    if (lines[0]?.startsWith('#EXTM3U')) {
        console.log("CTRL: createBatchVideosFromTextAdmin - Archivo M3U detectado.");
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      if (line.startsWith("#EXTINF:")) {
        itemsFoundInFile++;
        currentVideoData = {
          active: true,
          isFeatured: false,
          mainSection: "POR_GENERO",
          requiresPlan: ["gplay"],
          user: req.user.id,
          genres: [],
        };

        // Extraer título
        let titlePart = line.substring(line.lastIndexOf(",") + 1).trim();
        
        // Detectar si es un episodio de serie
        const seriesInfo = parseSeriesInfo(titlePart);
        
        if (seriesInfo) {
          // Es un episodio de serie
          currentVideoData.tipo = "serie";
          const { seriesName, episodeNumber } = seriesInfo;
          
          // Extraer año si existe
          const yearMatch = seriesName.match(/\(?(\d{4})\)?$/);
          if (yearMatch) {
            currentVideoData.releaseYear = parseInt(yearMatch[1], 10);
            currentVideoData.seriesName = seriesName.replace(/\s*\(\d{4}\)\s*$/, '').trim();
          } else {
            currentVideoData.seriesName = seriesName;
          }
          
          currentVideoData.episodeNumber = episodeNumber;
          currentVideoData.title = titlePart; // Guardamos el título original del episodio
        } else {
          // Es una película
          currentVideoData.tipo = "pelicula";
          
          // Extraer año
          const yearMatch = titlePart.match(/\(?(\d{4})\)?$/);
          if (yearMatch) {
            currentVideoData.releaseYear = parseInt(yearMatch[1], 10);
            titlePart = titlePart.replace(/\s*\(\d{4}\)$/, '').trim();
            titlePart = titlePart.replace(/\s+\d{4}$/, '').trim();
          }
          currentVideoData.title = titlePart;
        }

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
        // Esta línea es la URL
        currentVideoData.url = line;
        
        if (currentVideoData.tipo === "serie" && currentVideoData.seriesName) {
          // Agrupar capítulos por serie
          const seriesKey = currentVideoData.seriesName;
          if (!seriesMap.has(seriesKey)) {
            seriesMap.set(seriesKey, {
              title: currentVideoData.seriesName,
              tipo: "serie",
              subtipo: detectSubtipo(currentVideoData.seriesName, currentVideoData.genres),
              description: "",
              releaseYear: currentVideoData.releaseYear,
              genres: currentVideoData.genres,
              active: true,
              isFeatured: false,
              mainSection: "POR_GENERO",
              requiresPlan: ["gplay"],
              user: req.user.id,
              chapters: []
            });
          }
          
          // Agregar capítulo a la serie
          seriesMap.get(seriesKey).chapters.push({
            title: `Capítulo ${currentVideoData.episodeNumber}`,
            url: currentVideoData.url
          });
        } else if (currentVideoData.tipo === "pelicula") {
          // Agregar película directamente
          if (currentVideoData.title && currentVideoData.url) {
            videosToAdd.push({ ...currentVideoData });
          }
        }
        
        currentVideoData = {};
      }
    }

    // Agregar series agrupadas a videosToAdd
    for (const [_, seriesData] of seriesMap) {
      if (seriesData.chapters.length > 0) {
        // Ordenar capítulos por número
        seriesData.chapters.sort((a, b) => {
          const numA = parseInt(a.title.match(/\d+/)[0], 10);
          const numB = parseInt(b.title.match(/\d+/)[0], 10);
          return numA - numB;
        });
        videosToAdd.push(seriesData);
      }
    }

    if (videosToAdd.length === 0) {
      return res.status(400).json({ message: `No se encontraron VODs válidos en el archivo. Items parseados: ${itemsFoundInFile}` });
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
