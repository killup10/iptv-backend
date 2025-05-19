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

    const isAdminUser = user.role === 'admin';
    if (!isAdminUser && user.deviceId && user.deviceId !== deviceId && deviceId) {
      return res.status(403).json({ 
        error: "Esta cuenta ya está activa en otro dispositivo. Cierra la sesión anterior para continuar." 
      });
    }
    if (!isAdminUser && deviceId && (!user.deviceId || user.deviceId !== deviceId)) {
      user.deviceId = deviceId;
      await user.save(); 
      console.log(`LOGIN CONTROLLER (Backend): DeviceId actualizado para ${user.username} a ${deviceId}`);
    }

    const payload = { 
        id: user._id, 
        role: user.role,
        username: user.username,
        plan: user.plan // El plan 'estandar' se incluirá aquí si está asignado al usuario
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
    
    res.json({ 
        token, 
        user: { 
            username: user.username, 
            role: user.role,
            plan: user.plan 
        }
    });

  } catch (error) {
    console.error("Error en el controlador de login (Backend):", error);
    next(error);
  }
};