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

const router = express.Router();

// --- RUTAS PARA LA GESTIÓN DE USUARIOS (SOLO ADMIN) ---

// GET /api/admin/users - Obtener todos los usuarios para el panel de admin
router.get("/users", verifyToken, isAdmin, getAllUsersAdmin);

// PUT /api/admin/users/:userId/plan - Actualizar el plan de un usuario específico
router.put("/users/:userId/plan", verifyToken, isAdmin, updateUserPlanAdmin);

// PUT /api/admin/users/:userId/status - Activar/desactivar un usuario específico
router.put("/users/:userId/status", verifyToken, isAdmin, updateUserStatusAdmin);


// --- OTRAS RUTAS DE ADMINISTRACIÓN QUE PUEDAS TENER ---
// router.get("/dashboard-stats", verifyToken, isAdmin, getDashboardStats);
// router.post("/settings", verifyToken, isAdmin, updateGlobalSettings);

export default router;
