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
    if (user.expirationDate && user.expirationDate < new Date()) {
      return res.status(403).json({ message: "Cuenta expirada" });
    }
    if (user.activeSession && user.activeSession !== token) {
      return res.status(403).json({ message: "Sesión activa en otro dispositivo" });
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: "Token inválido" });
  }
};

// Alias para mantener compatibilidad con otras rutas
export const authMiddleware = authenticateToken;
