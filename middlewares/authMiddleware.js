// middlewares/authMiddleware.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const authenticateToken = async (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) return res.status(401).json({ message: "Acceso denegado" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    console.log("🔍 [DEBUG] user.isActive =", user.isActive, "type:", typeof user.isActive);

    if (!user.isActive)
      return res.status(403).json({ message: "Cuenta pendiente de aprobación" });
    if (user.expiresAt && user.expiresAt < new Date()) {
      return res.status(403).json({ message: "Cuenta expirada" });
    }

    // Para usuarios admin, no verificar sesiones
    if (user.role !== 'admin') {
      // Limpiar sesiones expiradas
      if (user.activeSessions) {
        const validSessions = [];
        for (const session of user.activeSessions) {
          try {
            jwt.verify(session.token, process.env.JWT_SECRET);
            validSessions.push(session);
          } catch (err) {
            // Token expirado, no lo incluimos
            console.log(`Removiendo sesión expirada para ${user.username}`);
          }
        }
        user.activeSessions = validSessions;
        await user.save();
      }

      // Verificar si el token está en las sesiones activas
      const isValidSession = user.activeSessions?.some(session => session.token === token);
      if (!isValidSession) {
        return res.status(401).json({ 
          message: "Tu sesión ha expirado o ha sido cerrada en este dispositivo. Por favor, inicia sesión nuevamente."
        });
      }

      // Actualizar lastActivity de la sesión
      const sessionIndex = user.activeSessions.findIndex(session => session.token === token);
      if (sessionIndex !== -1) {
        user.activeSessions[sessionIndex].lastActivity = new Date();
        await user.save();
      }
    }

    // Agregar información del usuario decodificada a la request
    req.user = {
      id: user._id,
      username: user.username,
      role: user.role,
      plan: user.plan,
      isActive: user.isActive,
      activeSessions: user.activeSessions
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Tu sesión ha expirado. Por favor, inicia sesión nuevamente." });
    }
    res.status(401).json({ message: "Token inválido" });
  }
};

// Alias para mantener compatibilidad con otras rutas
export const authMiddleware = authenticateToken;
