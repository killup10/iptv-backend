// iptv-backend/controllers/recommendations.controller.js
// Controlador para manejar recomendaciones con análisis opcional de Gemini

import { 
  getRecommendations, 
  getVideosByGenres, 
  getPersonalizedRecommendations 
} from '../services/recommendationService.js';
import { enrichRecommendationsWithGemini } from '../services/geminiRecommendationService.js';
import Video from '../models/Video.js';

/**
 * GET /api/videos/:id/recommendations
 * Obtiene recomendaciones similares, opcionalmente enriquecidas con Gemini
 */
export async function getRecommendationsController(req, res, next) {
  try {
    const { id } = req.params;
    const { limit = 6, useGemini = false } = req.query;

    const video = await Video.findById(id);
    if (!video) {
      return res.status(404).json({ error: 'Video no encontrado' });
    }

    let recommendations = await getRecommendations(id, parseInt(limit));

    // Opcionalmente enriquecer con Gemini
    if (useGemini && process.env.GEMINI_API_KEY) {
      const enriched = await enrichRecommendationsWithGemini(
        video.title,
        video.genres || [],
        recommendations
      );
      recommendations = enriched.recommendations;
    }

    res.json({
      success: true,
      recommendations,
      count: recommendations.length,
      geminiEnhanced: useGemini && !!process.env.GEMINI_API_KEY
    });
  } catch (error) {
    console.error('Error en getRecommendationsController:', error);
    next(error);
  }
}

/**
 * GET /api/videos/:id/similar-by-genre
 * Obtiene videos similares por género
 */
export async function getSimilarByGenreController(req, res, next) {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;

    const video = await Video.findById(id);
    if (!video) {
      return res.status(404).json({ error: 'Video no encontrado' });
    }

    const similarVideos = await getVideosByGenres(
      video.genres || [],
      video.tipo,
      parseInt(limit)
    );

    res.json({
      success: true,
      similarVideos,
      count: similarVideos.length
    });
  } catch (error) {
    console.error('Error en getSimilarByGenreController:', error);
    next(error);
  }
}

/**
 * GET /api/videos/recommendations/personalized
 * Obtiene recomendaciones personalizadas para el usuario autenticado
 */
export async function getPersonalizedRecommendationsController(req, res, next) {
  try {
    const userId = req.user.id;
    const { limit = 10 } = req.query;

    const recommendations = await getPersonalizedRecommendations(
      userId,
      parseInt(limit)
    );

    res.json({
      success: true,
      recommendations,
      count: recommendations.length
    });
  } catch (error) {
    console.error('Error en getPersonalizedRecommendationsController:', error);
    next(error);
  }
}

/**
 * GET /api/videos/genre/:genre
 * Obtiene todos los videos de un género específico
 */
export async function getVideosByGenreController(req, res, next) {
  try {
    const { genre } = req.params;
    const { tipo, limit = 20, page = 1 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {
      active: true,
      genres: { $elemMatch: { $regex: genre, $options: 'i' } }
    };

    if (tipo) {
      query.tipo = tipo;
    }

    const [videos, total] = await Promise.all([
      Video.find(query)
        .sort({ isFeatured: -1, releaseYear: -1 })
        .limit(parseInt(limit))
        .skip(skip),
      Video.countDocuments(query)
    ]);

    res.json({
      success: true,
      videos,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error en getVideosByGenreController:', error);
    next(error);
  }
}

export default {
  getRecommendationsController,
  getSimilarByGenreController,
  getPersonalizedRecommendationsController,
  getVideosByGenreController
};
