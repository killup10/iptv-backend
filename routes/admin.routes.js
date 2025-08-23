// iptv-backend/routes/admin.routes.js
import express from "express";
import { verifyToken, isAdmin } from "../middlewares/verifyToken.js";

// Importa las funciones del controlador de admin
// Asegúrate de que la ruta a admin.controller.js sea correcta
// y que admin.controller.js exporte estas funciones.
import {
  getAllUsersAdmin,
  updateUserPlanAdmin,
  updateUserStatusAdmin
  // Si tienes otras funciones de admin (ej. para dashboard, settings), impórtalas aquí
  // getDashboardStats,
  // updateGlobalSettings,
} from "../controllers/admin.controller.js";
import Serie from "../models/Serie.js";

const router = express.Router();

// --- RUTAS PARA LA GESTIÓN DE USUARIOS (SOLO ADMIN) ---

// GET /api/admin/users - Obtener todos los usuarios para el panel de admin
router.get("/users", verifyToken, isAdmin, getAllUsersAdmin);

// PUT /api/admin/users/:userId/plan - Actualizar el plan de un usuario específico
router.put("/users/:userId/plan", verifyToken, isAdmin, updateUserPlanAdmin);

// PUT /api/admin/users/:userId/status - Activar/desactivar un usuario específico
router.put("/users/:userId/status", verifyToken, isAdmin, updateUserStatusAdmin);

// PUT /api/admin/series/:id/thumbnail - Actualizar thumbnail personalizado de una serie
router.put('/series/:id/thumbnail', verifyToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { customThumbnail } = req.body; // puede ser URL o path en el servidor

    if (!customThumbnail) return res.status(400).json({ message: 'customThumbnail es requerido.' });

    const serie = await Serie.findByIdAndUpdate(id, { $set: { customThumbnail } }, { new: true });
    if (!serie) return res.status(404).json({ message: 'Serie no encontrada.' });

    res.json(serie);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar thumbnail.' });
  }
});


// --- OTRAS RUTAS DE ADMINISTRACIÓN QUE PUEDAS TENER ---
// router.get("/dashboard-stats", verifyToken, isAdmin, getDashboardStats);
// router.post("/settings", verifyToken, isAdmin, updateGlobalSettings);

export default router;
