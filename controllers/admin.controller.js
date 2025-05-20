// iptv-backend/controllers/admin.controller.js
import User from "../models/User.js"; // Asegúrate que la ruta a tu modelo User sea correcta
import mongoose from "mongoose";

/**
 * @desc Obtener todos los usuarios para el panel de administración.
 * @route GET /api/admin/users
 * @access Private/Admin
 */
export const getAllUsersAdmin = async (req, res, next) => {
  console.log("CTRL: getAllUsersAdmin - Solicitud para listar todos los usuarios.");
  try {
    // Excluir contraseñas por seguridad al enviar la lista de usuarios
    // Ordenar por nombre de usuario o fecha de creación
    const users = await User.find({}).select("-password").sort({ createdAt: -1 });
    
    console.log(`CTRL: getAllUsersAdmin - Usuarios encontrados: ${users.length}`);
    res.json(users);
  } catch (error) {
    console.error("Error en CTRL:getAllUsersAdmin:", error.message);
    next(error); // Pasa el error al manejador de errores global
  }
};

/**
 * @desc Actualizar el plan de un usuario específico.
 * @route PUT /api/admin/users/:userId/plan
 * @access Private/Admin
 */
export const updateUserPlanAdmin = async (req, res, next) => {
  const { userId } = req.params;
  const { plan } = req.body; // El nuevo plan viene en el cuerpo de la petición

  console.log(`CTRL: updateUserPlanAdmin - ID Usuario: ${userId}, Nuevo Plan: ${plan}`);

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: "ID de usuario inválido." });
  }

  // Validar que el plan sea uno de los permitidos en el modelo User
  const allowedPlans = User.schema.path('plan').enumValues;
  if (!plan || !allowedPlans.includes(plan)) {
    return res.status(400).json({ error: `Plan inválido: '${plan}'. Planes válidos: ${allowedPlans.join(', ')}` });
  }

  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { plan: plan }, // Campo a actualizar
      { new: true, runValidators: true } // Opciones: devolver el doc actualizado y correr validaciones del schema
    ).select("-password"); // No devolver la contraseña

    if (!updatedUser) {
      return res.status(404).json({ error: "Usuario no encontrado para actualizar plan." });
    }
    console.log(`CTRL: updateUserPlanAdmin - Plan actualizado para usuario ${updatedUser.username}`);
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
 * @desc Actualizar el estado de activación (isActive) de un usuario.
 * También puede manejar expiresAt si se envía.
 * @route PUT /api/admin/users/:userId/status
 * @access Private/Admin
 */
export const updateUserStatusAdmin = async (req, res, next) => {
  const { userId } = req.params;
  const { isActive, expiresAt } = req.body; // Espera isActive (boolean) y opcionalmente expiresAt (Date string)

  console.log(`CTRL: updateUserStatusAdmin - ID Usuario: ${userId}, Nuevo isActive: ${isActive}, Nuevo expiresAt: ${expiresAt}`);

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: "ID de usuario inválido." });
  }

  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ error: "El estado 'isActive' debe ser un valor booleano (true o false)." });
  }

  try {
    const updateFields = { isActive };
    if (isActive === false) {
      // Si se desactiva, también limpiamos deviceId y podríamos limpiar expiresAt
      updateFields.deviceId = null; 
      updateFields.expiresAt = null; // Opcional: resetear fecha de expiración al desactivar
    } else if (isActive === true && expiresAt !== undefined) {
      // Si se activa y se provee una fecha de expiración
      const parsedExpiresAt = new Date(expiresAt);
      if (isNaN(parsedExpiresAt.getTime())) {
        return res.status(400).json({ error: "Formato de fecha 'expiresAt' inválido." });
      }
      updateFields.expiresAt = parsedExpiresAt;
    } else if (isActive === true && expiresAt === undefined) {
        // Si se activa y no se provee expiresAt, podríamos querer quitar la fecha de expiración
        // o dejarla como está. Por ahora, la quitamos para una activación "indefinida".
        updateFields.expiresAt = null;
    }


    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateFields,
      { new: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ error: "Usuario no encontrado para actualizar estado." });
    }
    console.log(`CTRL: updateUserStatusAdmin - Estado actualizado para usuario ${updatedUser.username}`);
    res.json({ message: `Usuario ${updatedUser.isActive ? 'activado' : 'desactivado'} exitosamente.`, user: updatedUser });
  } catch (error) {
    console.error("Error en CTRL:updateUserStatusAdmin:", error.message);
    next(error);
  }
};


// --- Tus funciones existentes (getPendingUsers, activateUser, deactivateUser) ---
// Puedes mantenerlas si las usas para otras rutas o integrarlas/reemplazarlas
// con la lógica de updateUserStatusAdmin si cumplen el mismo propósito.
// Por ahora, las dejo comentadas para evitar conflictos si no están siendo llamadas
// por las rutas definidas en admin.routes.js.

/*
export const getPendingUsers = async (req, res, next) => {
  console.log("CTRL: getPendingUsers - Obteniendo usuarios con isActive: false");
  try {
    const pendingUsers = await User.find({ isActive: false }).select("-password");
    res.json(pendingUsers);
  } catch (error) {
    console.error("Error en CTRL:getPendingUsers:", error.message);
    // res.status(500).json({ error: error.message }); // Es mejor usar next(error)
    next(error);
  }
};

// Esta función 'activateUser' es similar a 'updateUserStatusAdmin' con isActive: true
// Considera unificarla o llamarla desde una ruta diferente si es necesario.
export const activateUser = async (req, res, next) => {
  const { userId, expiresAt } = req.body;
  console.log(`CTRL: activateUser - ID Usuario: ${userId}, ExpiresAt: ${expiresAt}`);
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    user.isActive = true;
    if (expiresAt) { // Solo actualiza expiresAt si se proporciona
        const parsedExpiresAt = new Date(expiresAt);
        if (isNaN(parsedExpiresAt.getTime())) {
            return res.status(400).json({ error: "Formato de fecha 'expiresAt' inválido." });
        }
        user.expiresAt = parsedExpiresAt;
    } else {
        user.expiresAt = null; // Si no se provee, quitar la expiración
    }
    await user.save();

    res.json({ message: "Usuario activado exitosamente" });
  } catch (error) {
    console.error("Error en CTRL:activateUser:", error.message);
    next(error);
  }
};

// Esta función 'deactivateUser' es similar a 'updateUserStatusAdmin' con isActive: false
export const deactivateUser = async (req, res, next) => {
  const { userId } = req.body; // Asumiendo que el ID viene en el cuerpo
  // Si viene como parámetro de ruta, sería req.params.userId
  console.log(`CTRL: deactivateUser - ID Usuario: ${userId}`);
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    user.isActive = false;
    user.deviceId = null; // Limpiamos el dispositivo asociado
    user.expiresAt = null; // También limpiar fecha de expiración al desactivar
    await user.save();

    res.json({ message: "Usuario desactivado exitosamente" });
  } catch (error) {
    console.error("Error en CTRL:deactivateUser:", error.message);
    next(error);
  }
};
*/
