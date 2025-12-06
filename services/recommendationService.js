// iptv-backend/services/recommendationService.js
// Servicio de recomendaciones basado en géneros, tipo de contenido y similitud
import Video from '../models/Video.js';

/**
 * Calcula la similitud entre dos arrays de géneros usando Jaccard Index
 * @param {Array} genres1 - Array de géneros del video 1
 * @param {Array} genres2 - Array de géneros del video 2
 * @returns {number} Valor entre 0 y 1 representando similitud
 */
function calculateGenreSimilarity(genres1, genres2) {
  if (!genres1?.length || !genres2?.length) return 0;
  
  const set1 = new Set(genres1.map(g => g.toLowerCase()));
  const set2 = new Set(genres2.map(g => g.toLowerCase()));
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Obtiene recomendaciones de videos similares
 * @param {string} videoId - ID del video para el cual buscar recomendaciones
 * @param {number} limit - Número máximo de recomendaciones (default: 6)
 * @returns {Promise<Array>} Array de videos recomendados
 */
export async function getRecommendations(videoId, limit = 6) {
  try {
    // Obtener el video actual
    const currentVideo = await Video.findById(videoId);
    
    if (!currentVideo) {
      throw new Error('Video no encontrado');
    }

    // Buscar videos similares del mismo tipo o tipo relacionado
    const query = {
      _id: { $ne: videoId },
      active: true,
      tipo: getTiposRelacionados(currentVideo.tipo),
    };

    const similarVideos = await Video.find(query).limit(100);

    // Calcular puntuación de similitud para cada video
    const videosWithScores = similarVideos.map(video => {
      let score = 0;

      // Similitud de géneros (peso: 40%)
      const genreSimilarity = calculateGenreSimilarity(
        currentVideo.genres || [],
        video.genres || []
      );
      score += genreSimilarity * 0.4;

      // Mismo tipo de subcategoría (peso: 20%)
      if (
        currentVideo.subcategoria === video.subcategoria &&
        currentVideo.tipo !== 'pelicula'
      ) {
        score += 0.2;
      }

      // Año de lanzamiento similar (weight: 15%) - dentro de 5 años
      if (currentVideo.releaseYear && video.releaseYear) {
        const yearDiff = Math.abs(currentVideo.releaseYear - video.releaseYear);
        if (yearDiff <= 5) {
          score += (1 - yearDiff / 5) * 0.15;
        }
      }

      // Mismo plan requerido (peso: 15%)
      const currentPlans = new Set(currentVideo.requiresPlan || []);
      const videoPlan = new Set(video.requiresPlan || []);
      const planIntersection = [...currentPlans].filter(p => videoPlan.has(p));
      if (planIntersection.length > 0) {
        score += 0.15;
      }

      // Bonus por contenido destacado (peso: 10%)
      if (video.isFeatured) {
        score += 0.1;
      }

      return {
        video,
        score,
      };
    });

    // Ordenar por puntuación descendente y tomar los top N
    const recommendations = videosWithScores
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.video);

    return recommendations;
  } catch (error) {
    console.error('Error en getRecommendations:', error);
    throw error;
  }
}

/**
 * Obtiene videos similares por género específico
 * @param {Array<string>} genres - Array de géneros
 * @param {string} tipo - Tipo de contenido (pelicula, serie, anime, etc.)
 * @param {number} limit - Número máximo de resultados
 * @returns {Promise<Array>} Array de videos con géneros similares
 */
export async function getVideosByGenres(genres, tipo, limit = 10) {
  try {
    const query = {
      active: true,
      tipo: tipo,
      genres: { $in: genres },
      _id: { $ne: null },
    };

    const videos = await Video.find(query)
      .limit(limit)
      .sort({ isFeatured: -1, releaseYear: -1 });

    return videos;
  } catch (error) {
    console.error('Error en getVideosByGenres:', error);
    throw error;
  }
}

/**
 * Obtiene tipos de contenido relacionados
 * Útil para expandir la búsqueda de recomendaciones
 */
function getTiposRelacionados(tipo) {
  const relacionados = {
    pelicula: ['pelicula'],
    serie: ['serie', 'dorama', 'novela'],
    anime: ['anime', 'serie'],
    dorama: ['dorama', 'serie', 'novela'],
    novela: ['novela', 'dorama', 'serie'],
    documental: ['documental'],
    'zona kids': ['zona kids', 'anime'],
  };

  return relacionados[tipo] || [tipo];
}

/**
 * Obtiene recomendaciones personalizadas basadas en historial del usuario
 * @param {string} userId - ID del usuario
 * @param {number} limit - Número máximo de recomendaciones
 * @returns {Promise<Array>} Array de videos recomendados
 */
export async function getPersonalizedRecommendations(userId, limit = 10) {
  try {
    // Obtener videos que el usuario ha visto
    const watchedVideos = await Video.find({
      'watchProgress.userId': userId,
    }).select('genres tipo releaseYear').limit(20);

    if (watchedVideos.length === 0) {
      // Si no hay historial, devolver contenido destacado
      return await Video.find({ active: true, isFeatured: true })
        .limit(limit)
        .sort({ releaseYear: -1 });
    }

    // Extraer géneros comunes del historial
    const genreFrequency = {};
    watchedVideos.forEach(video => {
      (video.genres || []).forEach(genre => {
        genreFrequency[genre] = (genreFrequency[genre] || 0) + 1;
      });
    });

    // Tomar los géneros más frecuentes
    const topGenres = Object.entries(genreFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => entry[0]);

    // Buscar videos con estos géneros que el usuario NO ha visto
    const watchedIds = new Set(watchedVideos.map(v => v._id.toString()));
    const recommendations = await Video.find({
      _id: { $nin: [...watchedIds] },
      active: true,
      genres: { $in: topGenres },
    })
      .limit(limit)
      .sort({ isFeatured: -1, releaseYear: -1 });

    return recommendations;
  } catch (error) {
    console.error('Error en getPersonalizedRecommendations:', error);
    throw error;
  }
}

/**
 * Busca videos similar por título (útil para "También te puede gustar")
 * @param {string} title - Título del video
 * @param {number} limit - Número máximo de resultados
 * @returns {Promise<Array>} Array de videos similares
 */
export async function getVideosByTitle(title, limit = 5) {
  try {
    const videos = await Video.find({
      active: true,
      title: { $regex: title, $options: 'i' },
    })
      .limit(limit)
      .sort({ isFeatured: -1, releaseYear: -1 });

    return videos;
  } catch (error) {
    console.error('Error en getVideosByTitle:', error);
    throw error;
  }
}

export default {
  getRecommendations,
  getVideosByGenres,
  getPersonalizedRecommendations,
  getVideosByTitle,
};
