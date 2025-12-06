// iptv-backend/routes/recommendations.routes.js
// Rutas dedicadas para el sistema de recomendaciones

import express from 'express';
import { verifyToken } from '../middlewares/verifyToken.js';
import {
  getRecommendationsController,
  getSimilarByGenreController,
  getPersonalizedRecommendationsController,
  getVideosByGenreController
} from '../controllers/recommendations.controller.js';

const router = express.Router();

/**
 * GET /api/recommendations/:videoId
 * Obtiene recomendaciones similares para un video
 */
router.get('/:videoId', getRecommendationsController);

/**
 * GET /api/recommendations/:videoId/by-genre
 * Obtiene videos similares filtrados por género
 */
router.get('/:videoId/by-genre', getSimilarByGenreController);

/**
 * GET /api/recommendations/personalized
 * Obtiene recomendaciones personalizadas para el usuario autenticado
 */
router.get('/personalized', verifyToken, getPersonalizedRecommendationsController);

/**
 * GET /api/recommendations/genre/:genre
 * Obtiene todos los videos de un género específico
 */
router.get('/genre/:genre', getVideosByGenreController);

export default router;
