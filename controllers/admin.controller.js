// iptv-backend/controllers/admin.controller.js
import User from "../models/User.js";
import mongoose from "mongoose";

/**
 * @desc Obtener todos los usuarios para el panel de administración.
 * @route GET /api/admin/users
 * @access Private/Admin
 */
export const getAllUsersAdmin = async (req, res, next) => {
  console.log("CTRL: getAllUsersAdmin - Solicitud para listar todos los usuarios.");
  try {
    const users = await User.find({}).select("-password").sort({ createdAt: -1 });
    console.log(`CTRL: getAllUsersAdmin - Usuarios encontrados: ${users.length}`);
    res.json(users);
  } catch (error) {
    console.error("Error en CTRL:getAllUsersAdmin:", error.message);
    next(error);
  }
};

/**
 * @desc Actualizar el plan de un usuario específico.
 * @route PUT /api/admin/users/:userId/plan
 * @access Private/Admin
 */
export const updateUserPlanAdmin = async (req, res, next) => {
  const { userId } = req.params;
  const { plan } = req.body;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: "ID de usuario inválido." });
  }

  const allowedPlans = User.schema.path('plan').enumValues;
  if (!plan || !allowedPlans.includes(plan)) {
    return res.status(400).json({ error: `Plan inválido: '${plan}'. Planes válidos: ${allowedPlans.join(', ')}` });
  }

  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { plan: plan },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ error: "Usuario no encontrado para actualizar plan." });
    }
    res.json({ message: "Plan de usuario actualizado exitosamente.", user: updatedUser });
  } catch (error) {
    console.error("Error en CTRL:updateUserPlanAdmin:", error.message);
    if (error.name === 'ValidationError') {
        return res.status(400).json({ error: error.message });
    }
    next(error);
  }
};

/**
 * @desc Actualizar el estado (activo/inactivo) y la fecha de expiración de un usuario.
 * @route PUT /api/admin/users/:userId/status
 * @access Private/Admin
 */
export const updateUserStatusAdmin = async (req, res, next) => {
  const { userId } = req.params;
  const { isActive, expiresAt } = req.body;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: "ID de usuario inválido." });
  }

  try {
    // Usamos un objeto para construir los campos a actualizar dinámicamente
    const updateFields = {};

    // Solo añadimos los campos si fueron proporcionados en la petición
    if (typeof isActive === 'boolean') {
        updateFields.isActive = isActive;
    }

    if (expiresAt !== undefined) {
        // Si se envía null o una cadena vacía, se borrará la fecha.
        if (expiresAt === null || expiresAt === '') {
            updateFields.expiresAt = null;
        } else {
            const parsedExpiresAt = new Date(expiresAt);
            if (isNaN(parsedExpiresAt.getTime())) {
                return res.status(400).json({ error: "Formato de fecha 'expiresAt' inválido." });
            }
            updateFields.expiresAt = parsedExpiresAt;
        }
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { new: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ error: "Usuario no encontrado para actualizar estado." });
    }
    res.json({ message: "Estado del usuario actualizado exitosamente.", user: updatedUser });
  } catch (error) {
    console.error("Error en CTRL:updateUserStatusAdmin:", error.message);
    next(error);
  }
};


// --- NUEVA FUNCIÓN: Limpiar/Cerrar todas las sesiones de un usuario ---
/**
 * @desc Cierra todas las sesiones activas de un usuario, forzando el logout en todos sus dispositivos.
 * @route PUT /api/admin/users/:userId/clear-sessions
 * @access Private/Admin
 */
export const clearUserSessionsAdmin = async (req, res, next) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: "ID de usuario inválido." });
  }

  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { activeSessions: [] }, // Clave: establece el array de sesiones a vacío
      { new: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }
    res.json({ message: "Todas las sesiones del usuario han sido cerradas.", user: updatedUser });
  } catch (error) {
    console.error("Error en CTRL:clearUserSessionsAdmin:", error.message);
    next(error);
  }
};

// --- NUEVA FUNCIÓN: Actualizar el máximo de dispositivos de un usuario ---
/**
 * @desc Actualiza el número máximo de dispositivos permitidos para un usuario.
 * @route PUT /api/admin/users/:userId/max-devices
 * @access Private/Admin
 */
export const updateUserMaxDevicesAdmin = async (req, res, next) => {
    const { userId } = req.params;
    const { maxDevices } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ error: "ID de usuario inválido." });
    }

    const numDevices = parseInt(maxDevices, 10);
    if (isNaN(numDevices) || numDevices < 1) {
        return res.status(400).json({ error: "El número de dispositivos debe ser al menos 1." });
    }

    try {
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { maxDevices: numDevices },
            { new: true, runValidators: true }
        ).select("-password");

        if (!updatedUser) {
            return res.status(404).json({ error: "Usuario no encontrado." });
        }
        res.json({ message: `Límite de dispositivos actualizado a ${numDevices}.`, user: updatedUser });
    } catch (error) {
        console.error("Error en CTRL:updateUserMaxDevicesAdmin:", error.message);
        next(error);
    }
};