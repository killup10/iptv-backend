// middlewares/verifyDevice.js

import Device from "../models/Device.js";

/**
 * Middleware para validar si el dispositivo está autorizado.
 * Requiere que el header 'x-device-id' esté presente y coincida
 * con un dispositivo activo del usuario autenticado.
 */
export const verifyDevice = async (req, res, next) => {
  try {
    const deviceId = req.headers['x-device-id'];

    if (!deviceId) {
      return res.status(400).json({ error: "Falta el header 'x-device-id'." });
    }

    const userId = req.user.id; // Obtenido del middleware de verifyToken

    const device = await Device.findOne({ userId, deviceId, isActive: true });

    if (!device) {
      return res.status(403).json({
        error: "Este dispositivo no está autorizado o fue desactivado. Cierra sesión en otro dispositivo para continuar."
      });
    }

    // Actualiza la última vez visto
    device.lastSeen = new Date();
    await device.save();

    // Continuar con la solicitud
    next();
  } catch (error) {
    console.error("Error en verifyDevice middleware:", error);
    res.status(500).json({ error: "Error interno en la verificación del dispositivo." });
  }
};
