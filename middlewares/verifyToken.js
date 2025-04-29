import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]; // Authorization: Bearer token
    if (!token) return res.status(401).json({ error: "No hay token, acceso denegado." });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) return res.status(404).json({ error: "Usuario no encontrado." });
    if (!user.isActive) return res.status(403).json({ error: "Usuario no activado." });
    if (user.expiresAt && user.expiresAt < new Date()) return res.status(403).json({ error: "Tu suscripción ha expirado." });

    req.user = user; // Guardamos el usuario para el siguiente middleware o controlador
    next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido." });
  }
};
