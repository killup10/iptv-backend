// iptv-backend/routes/vodManagement.routes.js
// Este es un nuevo archivo que crea rutas dedicadas para la gestión de cada tipo de VOD.
// Esto simplifica las llamadas desde el panel de administración del frontend.

import express from "express";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";
import Video from "../models/Video.js";

const router = express.Router();

// Middleware para asegurar que todas las rutas en este archivo son para administradores
router.use(verifyToken, isAdmin);

/**
 * Función genérica para obtener VODs por tipo y subtipo.
 * Reutiliza la lógica de paginación y formato de respuesta que ya tienes.
 * @param {string} tipo - El valor del campo 'tipo' en el modelo Video.
 * @param {string|null} subtipo - El valor del campo 'subtipo' (usado para animes).
 */
const getVodsByType = (tipo, subtipo = null) => {
  return async (req, res, next) => {
    try {
      // Construye la consulta base
      const query = { tipo };
      if (subtipo) {
        query.subtipo = subtipo;
      }

      // Lógica de paginación (copiada de tu 'videos.routes.js' para consistencia)
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50; // Aumentado a 50 por defecto para paneles de gestión
      const skip = (page - 1) * limit;

      // Ordenar por fecha de creación descendente por defecto
      const sortOption = { createdAt: -1 };

      // Ejecutar consultas
      const videos = await Video.find(query)
                                .sort(sortOption)
                                .limit(limit)
                                .skip(skip);
                                
      const total = await Video.countDocuments(query);

      // Formato de respuesta para el panel de admin (copiado de tu 'videos.routes.js')
      const mapToFullAdminFormat = (v) => ({ 
        id: v._id, _id: v._id, title: v.title, name: v.title, 
        description: v.description, url: v.url, tipo: v.tipo, 
        mainSection: v.mainSection, genres: v.genres, 
        requiresPlan: v.requiresPlan, releaseYear: v.releaseYear, 
        isFeatured: v.isFeatured, logo: v.logo, thumbnail: v.logo, 
        customThumbnail: v.customThumbnail, tmdbThumbnail: v.tmdbThumbnail, 
        trailerUrl: v.trailerUrl, active: v.active,
        subcategoria: v.tipo === "serie" ? (v.subcategoria || "Netflix") : undefined,
        user: v.user, createdAt: v.createdAt, updatedAt: v.updatedAt 
      });

      // Devolver la respuesta paginada
      res.json({
        videos: videos.map(mapToFullAdminFormat),
        total: total,
        page: page,
        pages: Math.ceil(total / limit)
      });

    } catch (error) {
      console.error(`Error en GET /api/manage-vod/${tipo}:`, error);
      next(error); 
    }
  };
};

// --- Definición de las nuevas rutas de gestión ---

// GET /api/manage-vod/peliculas - Obtiene solo las películas
router.get("/peliculas", getVodsByType("pelicula"));

// GET /api/manage-vod/series - Obtiene solo las series
router.get("/series", getVodsByType("serie"));

// GET /api/manage-vod/animes - Obtiene solo los animes
router.get("/animes", getVodsByType("anime"));

// GET /api/manage-vod/doramas - Obtiene solo los doramas
router.get("/doramas", getVodsByType("dorama"));

// GET /api/manage-vod/novelas - Obtiene solo las novelas
router.get("/novelas", getVodsByType("novela"));

// GET /api/manage-vod/documentales - Obtiene solo los documentales
router.get("/documentales", getVodsByType("documental"));

export default router;
