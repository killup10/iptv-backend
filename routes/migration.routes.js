import express from 'express';
import { verifyToken, isAdmin } from '../middlewares/verifyToken.js';
import migrateMoviesToSeries from '../scripts/migrateMoviesToSeries.js';
import Video from '../models/Video.js';

const router = express.Router();

// Endpoint para obtener estadísticas de migración (cuántas entradas necesitan migración)
router.get('/migration/stats', verifyToken, isAdmin, async (req, res, next) => {
  try {
    // Buscar películas que parecen ser capítulos de series
    const movieChapters = await Video.find({
      tipo: 'pelicula',
      title: { $regex: /^\d+x\d+\s+/i }
    });

    // Agrupar por serie para obtener estadísticas
    const seriesMap = new Map();
    
    for (const movie of movieChapters) {
      const seriesName = movie.genres && movie.genres.length > 0 ? movie.genres[0] : 'Serie Desconocida';
      
      if (!seriesMap.has(seriesName)) {
        seriesMap.set(seriesName, {
          name: seriesName,
          chapters: [],
          seasons: new Set()
        });
      }
      
      const match = movie.title.match(/^(\d+)x(\d+)\s+(.+)$/i);
      if (match) {
        const seasonNumber = parseInt(match[1], 10);
        const episodeNumber = parseInt(match[2], 10);
        
        seriesMap.get(seriesName).chapters.push({
          season: seasonNumber,
          episode: episodeNumber,
          title: movie.title
        });
        seriesMap.get(seriesName).seasons.add(seasonNumber);
      }
    }

    const stats = {
      totalMovieChapters: movieChapters.length,
      totalSeries: seriesMap.size,
      seriesDetails: Array.from(seriesMap.values()).map(series => ({
        name: series.name,
        totalChapters: series.chapters.length,
        totalSeasons: series.seasons.size,
        seasons: Array.from(series.seasons).sort((a, b) => a - b)
      }))
    };

    res.json(stats);
  } catch (error) {
    console.error('Error obteniendo estadísticas de migración:', error);
    next(error);
  }
});

// Endpoint para ejecutar la migración
router.post('/migration/execute', verifyToken, isAdmin, async (req, res, next) => {
  try {
    console.log(`Admin ${req.user.username} iniciando migración de películas a series`);
    
    // Configurar timeout más largo para esta operación
    req.setTimeout(600000); // 10 minutos
    res.setTimeout(600000); // 10 minutos

    // Ejecutar la migración
    const result = await executeMigrationWithStats();
    
    console.log('Migración completada exitosamente');
    res.json({
      success: true,
      message: 'Migración completada exitosamente',
      ...result
    });
    
  } catch (error) {
    console.error('Error durante la migración:', error);
    res.status(500).json({
      success: false,
      message: 'Error durante la migración',
      error: error.message
    });
  }
});

// Función auxiliar para ejecutar migración con estadísticas
const executeMigrationWithStats = async () => {
  const movieChapters = await Video.find({
    tipo: 'pelicula',
    title: { $regex: /^\d+x\d+\s+/i }
  });

  if (movieChapters.length === 0) {
    return {
      totalProcessed: 0,
      seriesCreated: 0,
      moviesDeleted: 0,
      message: 'No se encontraron entradas para migrar'
    };
  }

  // Función para extraer información del título
  const parseChapterInfo = (title) => {
    const match = title.match(/^(\d+)x(\d+)\s+(.+)$/i);
    if (match) {
      return {
        seasonNumber: parseInt(match[1], 10),
        episodeNumber: parseInt(match[2], 10),
        episodeTitle: match[3].trim()
      };
    }
    return null;
  };

  // Agrupar por serie
  const seriesMap = new Map();

  for (const movie of movieChapters) {
    const chapterInfo = parseChapterInfo(movie.title);
    if (!chapterInfo) continue;

    const seriesName = movie.genres && movie.genres.length > 0 ? movie.genres[0] : 'Serie Desconocida';
    
    if (!seriesMap.has(seriesName)) {
      seriesMap.set(seriesName, {
        seriesData: {
          title: seriesName,
          tipo: 'anime',
          description: movie.description || '',
          releaseYear: movie.releaseYear,
          genres: movie.genres.slice(1),
          active: movie.active,
          isFeatured: movie.isFeatured,
          mainSection: 'POR_GENERO',
          requiresPlan: movie.requiresPlan || ['gplay'],
          user: movie.user,
          logo: movie.logo,
          customThumbnail: movie.customThumbnail,
          tmdbThumbnail: movie.tmdbThumbnail,
          trailerUrl: movie.trailerUrl,
          seasons: []
        },
        chapters: [],
        movieIds: []
      });
    }

    const seriesEntry = seriesMap.get(seriesName);
    seriesEntry.chapters.push({
      ...chapterInfo,
      title: movie.title,
      url: movie.url,
      thumbnail: movie.logo || movie.customThumbnail || movie.tmdbThumbnail || '',
      duration: '0:00',
      description: movie.description || ''
    });
    seriesEntry.movieIds.push(movie._id);
  }

  let seriesCreated = 0;
  let moviesDeleted = 0;

  // Procesar cada serie
  for (const [seriesName, seriesEntry] of seriesMap) {
    // Agrupar capítulos por temporada
    const seasonMap = new Map();
    
    for (const chapter of seriesEntry.chapters) {
      if (!seasonMap.has(chapter.seasonNumber)) {
        seasonMap.set(chapter.seasonNumber, {
          seasonNumber: chapter.seasonNumber,
          title: `Temporada ${chapter.seasonNumber}`,
          chapters: []
        });
      }
      
      seasonMap.get(chapter.seasonNumber).chapters.push({
        title: `Capítulo ${chapter.episodeNumber} - ${chapter.episodeTitle}`,
        url: chapter.url,
        thumbnail: chapter.thumbnail,
        duration: chapter.duration,
        description: chapter.description
      });
    }

    // Ordenar temporadas y capítulos
    const seasons = Array.from(seasonMap.values()).sort((a, b) => a.seasonNumber - b.seasonNumber);
    seasons.forEach(season => {
      season.chapters.sort((a, b) => {
        const numA = parseInt(a.title.match(/Capítulo (\d+)/)?.[1] || '0', 10);
        const numB = parseInt(b.title.match(/Capítulo (\d+)/)?.[1] || '0', 10);
        return numA - numB;
      });
    });

    seriesEntry.seriesData.seasons = seasons;

    // Verificar si la serie ya existe
    const existingSeries = await Video.findOne({
      title: seriesName,
      tipo: 'anime'
    });

    if (existingSeries) {
      // Actualizar serie existente
      for (const newSeason of seasons) {
        let existingSeason = existingSeries.seasons.find(s => s.seasonNumber === newSeason.seasonNumber);
        
        if (existingSeason) {
          const existingUrls = new Set(existingSeason.chapters.map(c => c.url));
          newSeason.chapters.forEach(newChapter => {
            if (!existingUrls.has(newChapter.url)) {
              existingSeason.chapters.push(newChapter);
            }
          });
        } else {
          existingSeries.seasons.push(newSeason);
        }
      }
      
      existingSeries.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
      existingSeries.seasons.forEach(season => {
        season.chapters.sort((a, b) => {
          const numA = parseInt(a.title.match(/Capítulo (\d+)/)?.[1] || '0', 10);
          const numB = parseInt(b.title.match(/Capítulo (\d+)/)?.[1] || '0', 10);
          return numA - numB;
        });
      });
      
      await existingSeries.save();
    } else {
      // Crear nueva serie
      const newSeries = new Video(seriesEntry.seriesData);
      await newSeries.save();
      seriesCreated++;
    }

    // Eliminar películas individuales
    const deleteResult = await Video.deleteMany({
      _id: { $in: seriesEntry.movieIds }
    });
    
    moviesDeleted += deleteResult.deletedCount;
  }

  return {
    totalProcessed: movieChapters.length,
    seriesCreated: seriesMap.size,
    moviesDeleted,
    seriesDetails: Array.from(seriesMap.keys())
  };
};

export default router;
