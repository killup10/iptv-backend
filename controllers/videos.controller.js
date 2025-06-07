import Video from "../models/Video.js";
import mongoose from "mongoose";

// --- FUNCIÓN CORREGIDA ---
// Obtiene la lista de "Continuar Viendo" específica para el usuario actual.
export const getContinueWatching = async (req, res, next) => {
  try {
    // 1. Obtener el ID del usuario desde el token verificado
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({ error: "No se pudo identificar al usuario." });
    }

    const userPlan = req.user.plan || 'gplay';
    const isAdminUser = req.user.role === 'admin';

    // 2. Construir la consulta para encontrar el progreso del usuario específico
    let query = {
      active: true,
      // $elemMatch busca un elemento en el array 'watchProgress' que cumpla TODAS estas condiciones
      watchProgress: {
        $elemMatch: {
          userId: new mongoose.Types.ObjectId(userId),
          lastTime: { $gt: 5 }, // Progreso de más de 5 segundos
          completed: { $ne: true } // Y no esté completado
        }
      }
    };

    // 3. Aplicar filtro de plan si el usuario no es admin
    if (!isAdminUser) {
      const planHierarchy = { 'gplay': 1, 'estandar': 2, 'sports': 3, 'cinefilo': 4, 'premium': 5 };
      const userPlanLevel = planHierarchy[userPlan] || 0;
      const accessiblePlanKeys = Object.keys(planHierarchy).filter(
        planKey => planHierarchy[planKey] <= userPlanLevel
      );
      query.requiresPlan = { $in: accessiblePlanKeys };
    }

    // 4. Ejecutar la consulta en la base de datos
    const videos = await Video.find(query)
      // No podemos ordenar por el campo del array aquí, lo haremos después
      .limit(20) // Obtenemos un poco más para ordenar y luego limitar
      .select('title url tipo mainSection genres logo customThumbnail tmdbThumbnail trailerUrl watchProgress chapters')
      .lean(); // .lean() es más rápido para objetos JS planos

    // 5. Mapear y formatear la respuesta
    const continueWatchingItems = videos.map(video => {
        // Encontrar la entrada de progreso específica del usuario que coincidió con $elemMatch
        const userProgress = video.watchProgress.find(p => p.userId.toString() === userId);

        // Si por alguna razón no se encuentra (aunque $elemMatch debería garantizarlo), se omite
        if (!userProgress) return null;

        return {
          id: video._id,
          _id: video._id,
          name: video.title,
          title: video.title,
          thumbnail: video.logo || video.customThumbnail || video.tmdbThumbnail || "",
          url: video.url,
          tipo: video.tipo,
          mainSection: video.mainSection,
          genres: video.genres,
          trailerUrl: video.trailerUrl || "",
          watchProgress: userProgress, // ¡Importante! Devolvemos solo el progreso del usuario
          chapters: video.chapters || [],
          itemType: video.tipo === 'pelicula' ? 'movie' : 'serie'
        };
      })
      .filter(item => item !== null) // Limpiar cualquier nulo
      .sort((a, b) => new Date(b.watchProgress.lastWatched) - new Date(a.watchProgress.lastWatched)) // Ordenar por fecha de visualización
      .slice(0, 10); // Limitar a los 10 más recientes

    console.log(`[GET /api/videos/user/continue-watching] User ${userId} | Enviando ${continueWatchingItems.length} items.`);
    res.json(continueWatchingItems);

  } catch (error) {
    console.error(`Error en GET /api/videos/user/continue-watching para user ${req.user?.id}:`, error);
    next(error);
  }
};


// --- FUNCIÓN PARA PROCESAR ARCHIVO DE TEXTO/M3U PARA VODS (PELÍCULAS/SERIES) ---
// (Esta función no se ha modificado, se incluye para mantener el archivo completo)
export const createBatchVideosFromTextAdmin = async (req, res, next) => {
  console.log("CTRL: createBatchVideosFromTextAdmin - Archivo recibido:", req.file ? req.file.originalname : "No hay archivo");
  if (!req.file) {
    return res.status(400).json({ error: "No se proporcionó ningún archivo." });
  }

  // Configurar timeout más largo para esta operación
  req.setTimeout(300000); // 5 minutos
  res.setTimeout(300000); // 5 minutos

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
        /^(.*?)\s*[-–]\s*(?:S\d+E(\d+)|Ep(?:isodio)?\s*(\d+))/i,  // "Serie - S01E01" o "Serie - Ep 1"
        /^(.*?)\s*(?:Capitulo|Cap)\s*(\d+)/i,                      // "Serie Capitulo 1"
        /^(.*?)\s*(\d+)\s*(?:END)?$/i                              // "Serie 01" o "Serie 01 END"
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
    const BATCH_SIZE = 50; // Procesar en lotes de 50 para evitar sobrecarga

    // Procesar en lotes para mejorar el rendimiento
    for (let i = 0; i < videosToAdd.length; i += BATCH_SIZE) {
      const batch = videosToAdd.slice(i, i + BATCH_SIZE);
      const batchPromises = [];

      for (const vodData of batch) {
        const processVideo = async () => {
          try {
            const existingVideo = await Video.findOne({ url: vodData.url });
            if (!existingVideo) {
              // Aquí podrías añadir lógica para obtener thumbnail de TMDB si no se provee logo
              // if (!vodData.logo && vodData.title) {
              //   vodData.logo = await getTMDBThumbnail(vodData.title, vodData.releaseYear);
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
        };
        
        batchPromises.push(processVideo());
      }

      // Esperar a que se complete el lote actual antes de continuar con el siguiente
      await Promise.all(batchPromises);
      
      // Log de progreso
      console.log(`CTRL: createBatchVideosFromTextAdmin - Procesados ${Math.min(i + BATCH_SIZE, videosToAdd.length)} de ${videosToAdd.length} VODs`);
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
