// killup10/iptv-backend/middlewares/verifyToken.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const verifyToken = async (req, res, next) => {
  console.log(`verifyToken: Iniciando para la ruta ${req.originalUrl} - Método: ${req.method}`);
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("verifyToken: No hay token tipo Bearer en la cabecera.");
      return res.status(401).json({ error: "No hay token, acceso denegado." });
    }

    const token = authHeader.split(" ")[1];
    console.log("verifyToken: Token extraído:", token ? "Sí" : "No");

    if (!process.env.JWT_SECRET) {
        console.error("verifyToken: ¡ERROR CRÍTICO! JWT_SECRET no está definido en las variables de entorno.");
        return res.status(500).json({ error: "Error de configuración del servidor (JWT Secret)." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("verifyToken: Token decodificado exitosamente. Payload:", decoded);

    const user = await User.findById(decoded.id).select('-password'); // Excluir contraseña por seguridad
    if (!user) {
      console.log(`verifyToken: Usuario no encontrado para ID: ${decoded.id}`);
      return res.status(404).json({ error: "Usuario no encontrado asociado al token." });
    }
    console.log(`verifyToken: Usuario encontrado: ${user.username}, Rol: ${user.role}, Activo: ${user.isActive}`);

    if (!user.isActive) {
      console.log(`verifyToken: Usuario ${user.username} no está activo.`);
      return res.status(403).json({ error: "Usuario no activado." });
    }

    if (user.expiresAt && user.expiresAt < new Date()) {
      console.log(`verifyToken: Suscripción del usuario ${user.username} ha expirado en ${user.expiresAt}.`);
      return res.status(403).json({ error: "Tu suscripción ha expirado." });
    }

    req.user = user; // Adjuntar el usuario a la request
    console.log(`verifyToken: Verificación exitosa para ${user.username}. Llamando a next().`);
    next(); // Pasa el control al siguiente middleware o a la ruta.

  } catch (error) {
    console.error("verifyToken: Error capturado durante la verificación del token:", error.name, "-", error.message);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: "Token inválido (error de formato o firma)." });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: "El token ha expirado." });
    }
    // Para otros errores inesperados dentro del try (ej. error de base de datos al buscar usuario)
    return res.status(500).json({ error: "Error interno al procesar el token." });
  }
};

export const isAdmin = (req, res, next) => {
  console.log(`isAdmin: Verificando rol para el usuario ${req.user?.username}. Rol actual: ${req.user?.role}`);
  // Asegúrate de que req.user exista, lo cual debería si verifyToken se ejecutó antes y exitosamente.
  if (req.user && req.user.role === "admin") {
    console.log(`isAdmin: El usuario ${req.user.username} ES administrador. Llamando a next().`);
    return next(); // El usuario es admin, continuar.
  }
  console.log(`isAdmin: El usuario ${req.user?.username} NO es administrador o req.user no está definido.`);
  return res.status(403).json({ error: "Acceso restringido. Se requiere rol de administrador." });
};