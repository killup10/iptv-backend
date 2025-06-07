// iptv-backend/controllers/auth.controller.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const register = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Nombre de usuario y contraseña son requeridos." });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    }

    const existingUser = await User.findOne({ username: username }); 
    if (existingUser) {
      return res.status(409).json({ error: "El nombre de usuario ya está en uso." });
    }
    
    // El plan por defecto 'basico' se asignará desde el modelo User.js
    const user = new User({ 
        username: username,
        password: password,
    });
    await user.save();
    
    res.status(201).json({ message: "Registro exitoso. Tu cuenta está pendiente de aprobación." });

  } catch (error) {
    if (error.code === 11000) {
        return res.status(409).json({ error: "El nombre de usuario ya está en uso (error de base de datos)." });
    }
    console.error("Error en el controlador de registro (Backend):", error);
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { username, password, deviceId } = req.body;

    console.log(`LOGIN CONTROLLER (Backend): Intento de login para username (raw): '${username}'`);

    if (!username || !password) {
        return res.status(400).json({ error: "Nombre de usuario y contraseña son requeridos." });
    }

    const user = await User.findOne({ username: username }).select('+password'); 

    if (!user) {
      console.log(`LOGIN CONTROLLER (Backend): Usuario '${username}' NO ENCONTRADO en la BD.`);
      return res.status(401).json({ error: "Credenciales inválidas." }); 
    }
    
    console.log("LOGIN CONTROLLER (Backend): Usuario encontrado:", user.username, "Role:", user.role, "Plan:", user.plan, "isActive:", user.isActive, "expiresAt:", user.expiresAt);

    if (!user.isActive) {
      return res.status(403).json({ error: "Tu cuenta está inactiva o pendiente de aprobación." });
    }
    if (user.expiresAt && user.expiresAt < new Date()) {
      return res.status(403).json({ error: "Tu suscripción ha expirado." });
    }

    const isMatch = await user.comparePassword(password); 
    
    if (!isMatch) {
      return res.status(401).json({ error: "Credenciales inválidas." });
    }

    // Generar token antes de verificar sesiones
    const payload = { 
        id: user._id, 
        role: user.role,
        username: user.username,
        plan: user.plan,
        deviceId: deviceId || 'unknown'
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

    const isAdminUser = user.role === 'admin';
    
    // Solo aplicar restricción de sesiones para usuarios no admin
    if (!isAdminUser && deviceId) {
      // Inicializar activeSessions si no existe
      if (!user.activeSessions) {
        user.activeSessions = [];
      }

      // Limpiar sesiones expiradas (tokens que ya no son válidos) y sesiones inactivas > 7 días
      const validSessions = [];
      const now = new Date();
      const maxInactivityMs = 7 * 24 * 60 * 60 * 1000; // 7 días en ms
      for (const session of user.activeSessions) {
        try {
          jwt.verify(session.token, process.env.JWT_SECRET);
          // Verificar inactividad
          if (session.lastActivity && (now - new Date(session.lastActivity)) > maxInactivityMs) {
            console.log(`LOGIN CONTROLLER: Removiendo sesión inactiva > 7 días para ${user.username}`);
            continue; // No incluir esta sesión
          }
          validSessions.push(session);
        } catch (err) {
          // Token expirado o inválido, no lo incluimos
          console.log(`LOGIN CONTROLLER: Removiendo sesión expirada para ${user.username}`);
        }
      }
      user.activeSessions = validSessions;

      // Verificar si ya existe una sesión para este dispositivo
      const existingSessionIndex = user.activeSessions.findIndex(session => session.deviceId === deviceId);
      
      if (existingSessionIndex !== -1) {
        // Actualizar token para el dispositivo existente
        user.activeSessions[existingSessionIndex].token = token;
        user.activeSessions[existingSessionIndex].lastActivity = new Date();
      } else {
        // Verificar límite de sesiones simultáneas (máximo 2)
        if (user.activeSessions.length >= 2) {
          return res.status(403).json({ 
            error: "Límite de dispositivos alcanzado. Solo puedes estar conectado en 2 dispositivos simultáneamente. Cierra sesión en otro dispositivo para continuar." 
          });
        }
        
        // Agregar nueva sesión
        user.activeSessions.push({
          deviceId: deviceId,
          token: token,
          lastActivity: new Date()
        });
      }

      await user.save();
      console.log(`LOGIN CONTROLLER (Backend): Sesiones activas para ${user.username}: ${user.activeSessions.length}`);
    }
    
    res.json({ 
        token, 
        user: { 
            username: user.username, 
            role: user.role,
            plan: user.plan,
            activeSessions: user.activeSessions?.length || 0
        }
    });

  } catch (error) {
    console.error("Error en el controlador de login (Backend):", error);
    next(error);
  }
};

// Nuevo endpoint para cerrar sesión en un dispositivo específico
export const logout = async (req, res, next) => {
  try {
    const { deviceId } = req.body;
    const userId = req.user.id; // Obtenido del middleware de autenticación

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // Si no se proporciona deviceId, cerrar todas las sesiones
    if (!deviceId) {
      user.activeSessions = [];
      await user.save();
      return res.json({ message: "Todas las sesiones han sido cerradas" });
    }

    // Filtrar la sesión del dispositivo específico
    user.activeSessions = user.activeSessions.filter(session => session.deviceId !== deviceId);
    await user.save();

    res.json({ 
      message: "Sesión cerrada exitosamente",
      activeSessions: user.activeSessions.length
    });

  } catch (error) {
    console.error("Error en el controlador de logout:", error);
    next(error);
  }
};
