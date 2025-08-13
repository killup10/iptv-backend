import Video from "../models/Video.js";
import mongoose from "mongoose";
import getTMDBThumbnail from "../utils/getTMDBThumbnail.js";

// --- FUNCIÓN getContinueWatching CORREGIDA para manejar temporadas ---
// Obtiene la lista de "Continuar Viendo" específica para el usuario actual.
export const getContinueWatching = async (req, res, next) => {
  try {
    // 1. Obtener el ID del usuario desde el token verificado
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({ error: "No se pudo identificar al usuario." });
    }

    const userPlanFromToken = req.user.plan || 'gplay';
    // Normalizar el plan en caso de que algunos usuarios sigan teniendo
    // el valor antiguo 'basico' guardado
    const normalizedUserPlanKey = userPlanFromToken === 'basico' ? 'gplay' : userPlanFromToken;
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
      const userPlanLevel = planHierarchy[normalizedUserPlanKey] || 0;
      const accessiblePlanKeys = Object.keys(planHierarchy).filter(
        planKey => planHierarchy[planKey] <= userPlanLevel
      );
      query.requiresPlan = { $in: accessiblePlanKeys };
    }

    // 4. Ejecutar la consulta en la base de datos
    console.log('QUERY BACKEND:', query);
    const videos = await Video.find(query)
      // No podemos ordenar por el campo del array aquí, lo haremos después
      .limit(20) // Obtenemos un poco más para ordenar y luego limitar
      // CAMBIO: Seleccionar 'seasons' en lugar de 'chapters'
      .select('title url tipo mainSection genres logo customThumbnail tmdbThumbnail trailerUrl watchProgress seasons')
      .lean(); // .lean() es más rápido para objetos JS planos

    // 5. Mapear y formatear la respuesta
    const continueWatchingItems = videos.map(video => {
      // Encontrar la entrada de progreso específica del usuario que coincidió con $elemMatch
      const userProgress = video.watchProgress.find(p => p.userId.toString() === userId);

      // Si por alguna razón no se encuentra (aunque $elemMatch debería garantizarlo), se omite
      if (!userProgress) return null;

      let currentChapter = null;
      let currentSeasonChapters = [];

      // Si es una serie, encontrar el capítulo y la temporada correctos
      if (video.tipo !== 'pelicula' && video.seasons && video.seasons.length > userProgress.lastSeason) {
        const season = video.seasons[userProgress.lastSeason];
        currentSeasonChapters = season.chapters || []; // Capítulos de la temporada actual
        if (currentSeasonChapters.length > userProgress.lastChapter) {
          currentChapter = currentSeasonChapters[userProgress.lastChapter];
        }
      }
      
      // Asegurarse de que el watchProgress incluye lastSeason
      // Si el campo no existe en el documento, se inicializa a 0
      if (userProgress.lastSeason === undefined) {
          userProgress.lastSeason = 0;
      }

      return {
        id: video._id,
        _id: video._id,
        name: video.title,
        title: video.title,
        thumbnail: video.logo || video.customThumbnail || video.tmdbThumbnail || "",
        url: video.url, // Para películas, será la URL de la película. Para series, es la URL de la serie (que no se usa para la reproducción de capítulos).
        tipo: video.tipo,
        mainSection: video.mainSection,
        genres: video.genres,
        trailerUrl: video.trailerUrl || "",
        watchProgress: userProgress, // ¡Importante! Devolvemos solo el progreso del usuario
        // CAMBIO: Pasar las temporadas completas para que el frontend maneje la visualización
        seasons: video.seasons || [], 
        // CAMBIO: Añadir el capítulo actual específico que se está viendo, si es una serie
        currentPlayingChapter: currentChapter, 
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


// --- FUNCIÓN createBatchVideosFromTextAdmin MODIFICADA para manejar temporadas ---
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

    // CAMBIO CLAVE: seriesMap ahora agrupará por nombre de serie y luego por temporada
    // Estructura: Map<SeriesName, { seriesData, Map<SeasonNumber, { chapters: [] }> }>
    let seriesMap = new Map(); 
    let videosToAdd = [];
    let currentVideoData = {};
    let itemsFoundInFile = 0;

    // Función para detectar y extraer información de serie y temporada
    const parseSeriesInfo = (title) => {
      // Patrones para detectar Temporada y Episodio
      // Ejemplo: "Serie - S01E01", "Serie T1 E1", "Serie Temporada 1 Capitulo 1", "1x11 Fin del servicio"
      const patterns = [
        // Patrón para formato "1x11 Título del episodio" (muy común)
        /^(\d+)x(\d+)\s+(.+)$/i,
        // Patrón para formato "Serie - S01E01"
        /^(.*?)\s*[-–\s]*S(?:eason)?\s*(\d+)\s*E(?:pisode)?\s*(\d+)/i,
        // Patrón para formato "Serie S1E1" o "Serie S01E01"
        /^(.*?)\s+S(\d+)E(\d+)/i,
        // Patrón para formato "Serie - 1x01 - Título"
        /^(.*?)\s*[-–\s]*(\d+)x(\d+)(?:\s*[-–\s]*(.+))?/i,
        // Patrón para formato "Serie Capitulo 1"
        /^(.*?)\s*(?:Capitulo|Cap)\s*(\d+)(?:\s+T(?:emporada)?\s*(\d+))?/i,
        // Patrón para formato "Serie Temporada 1 - Capitulo 1"
        /^(.*?)\s*(?:Temporada|T)\s*(\d+)\s*(?:-\s*(?:Capitulo|Cap)\s*(\d+))?/i
      ];

      for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];
        const match = title.match(pattern);
        if (match) {
          let seriesName, seasonNumber, episodeNumber, episodeTitle;
          
          if (i === 0) {
            // Formato "1x11 Título del episodio" - necesitamos obtener el nombre de la serie de los géneros
            seasonNumber = parseInt(match[1], 10);
            episodeNumber = parseInt(match[2], 10);
            episodeTitle = match[3].trim();
            // En este caso, el nombre de la serie vendrá de los géneros
            seriesName = null; // Se asignará después
          } else if (i === 1 || i === 2) {
            // Formatos "Serie - S01E01" o "Serie S1E1"
            seriesName = match[1].trim();
            seasonNumber = parseInt(match[2], 10);
            episodeNumber = parseInt(match[3], 10);
          } else if (i === 3) {
            // Formato "Serie - 1x01 - Título"
            seriesName = match[1].trim();
            seasonNumber = parseInt(match[2], 10);
            episodeNumber = parseInt(match[3], 10);
            episodeTitle = match[4] ? match[4].trim() : '';
          } else {
            // Otros formatos
            seriesName = match[1].trim();
            seasonNumber = parseInt(match[3] || match[2] || '1', 10);
            episodeNumber = parseInt(match[2] || match[4], 10);
          }
          
          if (episodeNumber) {
            return { 
              seriesName, 
              seasonNumber: seasonNumber || 1, 
              episodeNumber,
              episodeTitle: episodeTitle || ''
            };
          }
        }
      }
      return null;
    };

    // Función para detectar subtipo (sin cambios)
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
        
        // Detectar si es un episodio de serie/temporada
        const seriesInfo = parseSeriesInfo(titlePart);
        
        if (seriesInfo) {
          // Es un episodio de serie con temporada
          currentVideoData.tipo = "serie";
          let { seriesName, seasonNumber, episodeNumber, episodeTitle } = seriesInfo;
          
          // Si seriesName es null (formato "1x11 Título"), necesitamos obtenerlo de los géneros
          if (!seriesName) {
            // Primero intentamos extraer géneros para obtener el nombre de la serie
            let nextLineIndex = i + 1;
            if (lines[nextLineIndex]?.startsWith("#EXTGRP:")) {
              const genreString = lines[nextLineIndex].substring("#EXTGRP:".length).trim();
              currentVideoData.genres = genreString.split(/[,|]/).map(g => g.trim()).filter(g => g);
              // El primer género suele ser el nombre de la serie
              if (currentVideoData.genres.length > 0) {
                seriesName = currentVideoData.genres[0];
                // Remover el nombre de la serie de los géneros para evitar duplicación
                currentVideoData.genres = currentVideoData.genres.slice(1);
              }
              i = nextLineIndex; 
            }
            
            // Si no se encontraron géneros en #EXTGRP, intentar con group-title en #EXTINF
            if (!seriesName) {
              const groupMatch = line.match(/group-title="([^"]*)"/i);
              if (groupMatch && groupMatch[1]) {
                const groupGenres = groupMatch[1].split(/[,|]/).map(g => g.trim()).filter(g => g);
                if (groupGenres.length > 0) {
                  seriesName = groupGenres[0];
                  currentVideoData.genres = groupGenres.slice(1);
                }
              }
            }
            
            // Fallback: usar un nombre genérico si no se puede determinar
            if (!seriesName) {
              seriesName = "Serie Desconocida";
              currentVideoData.genres = ["Indefinido"];
            }
          }
          
          // Extraer año si existe en el nombre de la serie
          if (seriesName) {
            const yearMatch = seriesName.match(/\(?(\d{4})\)?$/);
            if (yearMatch) {
              currentVideoData.releaseYear = parseInt(yearMatch[1], 10);
              currentVideoData.seriesName = seriesName.replace(/\s*\(\d{4}\)\s*$/, '').trim();
            } else {
              currentVideoData.seriesName = seriesName;
            }
          }
          
          currentVideoData.seasonNumber = seasonNumber;
          currentVideoData.episodeNumber = episodeNumber;
          currentVideoData.episodeTitle = episodeTitle;
          currentVideoData.title = titlePart; // Guardamos el título original del episodio
        } else {
          // Es una película (o una serie sin formato de episodio detectado, que se tratará como película o serie de un solo capítulo)
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

        // Intentar extraer géneros de la línea #EXTGRP:
        let nextLineIndex = i + 1;
        if (lines[nextLineIndex]?.startsWith("#EXTGRP:")) {
          const genreString = lines[nextLineIndex].substring("#EXTGRP:".length).trim();
          currentVideoData.genres = genreString.split(/[,|]/).map(g => g.trim()).filter(g => g);
          i = nextLineIndex; 
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
          const seriesKey = currentVideoData.seriesName;
          
          // Inicializar la entrada de la serie en el mapa si no existe
          if (!seriesMap.has(seriesKey)) {
            const detectedSubtipo = detectSubtipo(currentVideoData.seriesName, currentVideoData.genres);
            seriesMap.set(seriesKey, {
              title: currentVideoData.seriesName,
              tipo: "serie",
              subtipo: detectedSubtipo,
              description: "",
              releaseYear: currentVideoData.releaseYear,
              genres: [...currentVideoData.genres],
              active: true,
              isFeatured: false,
              mainSection: detectedSubtipo === 'anime' ? 'ANIMES' : 'POR_GENERO',
              requiresPlan: ["gplay"],
              user: req.user.id,
              seasons: [] // CAMBIO: Ahora almacenamos un array de temporadas
            });

            if (detectedSubtipo === 'anime' && !seriesMap.get(seriesKey).genres.includes('Anime')) {
              seriesMap.get(seriesKey).genres.push('Anime');
            }
          }

          // Obtener la serie del mapa
          const seriesDataInMap = seriesMap.get(seriesKey);

          // Buscar o crear la temporada para este capítulo
          let targetSeason = seriesDataInMap.seasons.find(s => s.seasonNumber === currentVideoData.seasonNumber);
          if (!targetSeason) {
            targetSeason = { 
                seasonNumber: currentVideoData.seasonNumber, 
                title: `Temporada ${currentVideoData.seasonNumber}`, // Puedes personalizar esto
                chapters: [] 
            };
            seriesDataInMap.seasons.push(targetSeason);
            // Opcional: Ordenar las temporadas después de añadir una nueva
            seriesDataInMap.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
          }
          
          // Agregar capítulo a la temporada
          targetSeason.chapters.push({
            title: `Capítulo ${currentVideoData.episodeNumber} - ${currentVideoData.title.split(/s\d+e\d+/i)[1] || currentVideoData.title}`, // Intenta limpiar el título
            url: currentVideoData.url
          });

        } else if (currentVideoData.tipo === "pelicula") {
          // Agregar película directamente
          if (currentVideoData.title && currentVideoData.url) {
            videosToAdd.push({ ...currentVideoData });
          }
        }
        
        currentVideoData = {}; // Limpiar para el siguiente video/episodio
      }
    }

    // Agregar series agrupadas a videosToAdd
    for (const [_, seriesData] of seriesMap) {
        if (seriesData.seasons.length > 0) {
            // Ordenar capítulos dentro de cada temporada
            seriesData.seasons.forEach(season => {
                // Asumiendo que el título del capítulo tiene un número, lo ordenamos
                season.chapters.sort((a, b) => {
                    const numA = parseInt(a.title.match(/\d+/)?.[0] || '0', 10);
                    const numB = parseInt(b.title.match(/\d+/)?.[0] || '0', 10);
                    return numA - numB;
                });
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
            // Para series, la URL no es el campo único principal, podría ser el título
            // Para películas, la URL sí lo es
            let existingVideo;
            if (vodData.tipo === 'pelicula') {
                existingVideo = await Video.findOne({ url: vodData.url });
            } else { // Es una serie
                // Intentamos encontrar la serie por título (o un identificador único de serie si lo tuvieras)
                existingVideo = await Video.findOne({ title: vodData.title, tipo: vodData.tipo });
            }
            
            if (!existingVideo) {
                if (!vodData.logo && !vodData.customThumbnail && vodData.title) {
                    vodData.tmdbThumbnail = await getTMDBThumbnail(vodData.title);
                }
                const newVideo = new Video(vodData);
                await newVideo.save();
                vodsAddedCount++;
            } else {
                // CAMBIO: Si la serie ya existe, intentar actualizar sus temporadas y capítulos
                if (vodData.tipo !== 'pelicula') {
                    let updated = false;
                    for (const newSeason of vodData.seasons) {
                        let existingSeason = existingVideo.seasons.find(s => s.seasonNumber === newSeason.seasonNumber);
                        if (existingSeason) {
                            // Si la temporada existe, agregar nuevos capítulos si no están ya
                            const existingChapterUrls = new Set(existingSeason.chapters.map(c => c.url));
                            newSeason.chapters.forEach(newChapter => {
                                if (!existingChapterUrls.has(newChapter.url)) {
                                    existingSeason.chapters.push(newChapter);
                                    updated = true;
                                }
                            });
                            // Reordenar capítulos dentro de la temporada si se añadió alguno nuevo
                            if (updated) {
                                existingSeason.chapters.sort((a, b) => {
                                    const numA = parseInt(a.title.match(/\d+/)?.[0] || '0', 10);
                                    const numB = parseInt(b.title.match(/\d+/)?.[0] || '0', 10);
                                    return numA - numB;
                                });
                            }
                        } else {
                            // Si la temporada no existe, la añadimos completa
                            existingVideo.seasons.push(newSeason);
                            updated = true;
                        }
                    }
                    if (updated) {
                        // Opcional: Reordenar las temporadas si se añadió alguna nueva
                        existingVideo.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
                        await existingVideo.save();
                        vodsAddedCount++; // Contar como actualizado/añadido
                    } else {
                        vodsSkippedCount++; // No hubo cambios
                    }
                } else {
                    // Si es película y ya existe, la saltamos
                    console.log(`CTRL: createBatchVideosFromTextAdmin - VOD ya existente (misma URL): ${vodData.url}, omitiendo.`);
                    vodsSkippedCount++;
                }
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
    
    const summaryMessage = `Proceso completado. VODs encontrados en archivo: ${itemsFoundInFile}. Nuevos/Actualizados: ${vodsAddedCount}. Omitidos (duplicados por URL/sin cambios): ${vodsSkippedCount}.`;
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

// --- FUNCIÓN deleteBatchVideosAdmin ---
export const deleteBatchVideosAdmin = async (req, res, next) => {
  try {
    const { videoIds } = req.body;

    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return res.status(400).json({ error: "Se requiere un array de videoIds." });
    }

    // Validar que todos los IDs sean ObjectIds válidos de MongoDB
    const validObjectIds = [];
    const invalidIds = [];

    for (const id of videoIds) {
      if (mongoose.Types.ObjectId.isValid(id)) {
        validObjectIds.push(new mongoose.Types.ObjectId(id));
      } else {
        invalidIds.push(id);
      }
    }

    if (invalidIds.length > 0) {
      return res.status(400).json({ 
        error: "IDs de video con formato inválido", 
        invalidIds: invalidIds 
      });
    }

    if (validObjectIds.length === 0) {
      return res.status(400).json({ error: "No se proporcionaron IDs válidos." });
    }

    console.log(`Eliminando ${validObjectIds.length} videos con IDs:`, validObjectIds.map(id => id.toString()));

    const result = await Video.deleteMany({ _id: { $in: validObjectIds } });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "No se encontraron videos para eliminar." });
    }

    res.json({ message: `${result.deletedCount} videos eliminados exitosamente.` });
  } catch (error) {
    console.error("Error en deleteBatchVideosAdmin:", error);
    next(error);
  }
};

export const updateVideoAdmin = async (req, res, next) => {
  const { id } = req.params;
  const updateData = req.body;

  // Log para depuración para ver exactamente qué se recibe
  console.log(`[updateVideoAdmin] Cuerpo recibido para ID ${id}:`, JSON.stringify(updateData, null, 2));

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "ID de video inválido." });
  }

  try {
    const videoToUpdate = await Video.findById(id);

    if (!videoToUpdate) {
      return res.status(404).json({ error: "Video no encontrado." });
    }

    // Lista de campos que se pueden actualizar directamente
    const allowedFields = [
      'title', 'description', 'releaseYear', 'genres', 'active', 
      'isFeatured', 'mainSection', 'requiresPlan', 'logo', 
      'customThumbnail', 'trailerUrl', 'tipo', 'subcategoria'
    ];

    allowedFields.forEach(field => {
      // Se comprueba que el campo exista en el body para no sobreescribir con undefined
      if (Object.prototype.hasOwnProperty.call(updateData, field)) {
        videoToUpdate[field] = updateData[field];
      }
    });

    // Determinar el tipo final del VOD para la lógica condicional
    const finalTipo = updateData.tipo || videoToUpdate.tipo;

    // Si el tipo final es anime o serie con subtipo anime, limpiar la subcategoría para evitar confusión
    if (finalTipo === 'anime' || (finalTipo === 'serie' && (updateData.subtipo === 'anime' || videoToUpdate.subtipo === 'anime'))) {
      videoToUpdate.subcategoria = undefined;
    }

    if (finalTipo !== 'pelicula') {
      // Es una serie, anime, etc.
      // Si se envía un array de 'seasons', se actualiza.
      // Esto permite al frontend gestionar la lista completa de capítulos.
      if (Array.isArray(updateData.seasons)) {
        console.log(`[updateVideoAdmin] Actualizando seasons para la serie ${id}.`);
        videoToUpdate.seasons = updateData.seasons;
      }
      // Para series, la URL principal no es relevante, se puede limpiar.
      videoToUpdate.url = ''; 
    } else {
      // Es una película
      if (updateData.url !== undefined) {
        videoToUpdate.url = updateData.url;
      }
      // Las películas no tienen temporadas.
      videoToUpdate.seasons = [];
    }
    
    const updatedVideo = await videoToUpdate.save();
    console.log(`[updateVideoAdmin] Video ${id} actualizado exitosamente.`);
    res.json(updatedVideo);

  } catch (error) {
    console.error(`Error actualizando video ${id}:`, error);
    if (error.name === 'ValidationError') {
        return res.status(400).json({ error: "Error de validación del backend.", details: error.errors });
    }
    next(error);
  }
};
