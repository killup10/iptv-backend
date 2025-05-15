// iptv-backend/controllers/auth.controller.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Registro de nuevos usuarios
export const register = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Nombre de usuario y contraseña son requeridos." });
    }
    if (password.length < 6) { // Mantén tus validaciones de contraseña
        return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    }

    // Verificar si el usuario ya existe (sensible a mayúsculas/minúsculas)
    const existingUser = await User.findOne({ username: username }); // Sin .toLowerCase()
    if (existingUser) {
      return res.status(409).json({ error: "El nombre de usuario ya está en uso." });
    }
    
    const user = new User({ 
        username: username, // Guardar el username tal como se envió
        password: password, // El hook pre-save en el modelo se encargará del hash
        // isActive por defecto en el modelo será false, o como lo tengas configurado
        // role por defecto en el modelo será 'user'
    });
    await user.save();
    
    res.status(201).json({ message: "Registro exitoso. Tu cuenta está pendiente de aprobación por un administrador." });

  } catch (error) {
    if (error.code === 11000) {
        return res.status(409).json({ error: "El nombre de usuario ya está en uso (error de base de datos)." });
    }
    console.error("Error en el controlador de registro:", error);
    next(error);
  }
};

// Login de usuarios
export const login = async (req, res, next) => {
  try {
    const { username, password, deviceId } = req.body;

    console.log(`LOGIN CONTROLLER (Backend): Intento de login para username (raw): '${username}'`);

    if (!username || !password) {
        return res.status(400).json({ error: "Nombre de usuario y contraseña son requeridos." });
    }

    // Busca al usuario (sensible a mayúsculas/minúsculas)
    // y trae la contraseña explícitamente si está con select:false en el modelo
    const user = await User.findOne({ username: username }).select('+password'); 

    if (!user) {
      console.log(`LOGIN CONTROLLER (Backend): Usuario '${username}' NO ENCONTRADO en la BD.`);
      return res.status(401).json({ error: "Credenciales inválidas." }); 
    }
    
    console.log("LOGIN CONTROLLER (Backend): Usuario encontrado:", user.username, "Role:", user.role, "isActive:", user.isActive, "expiresAt:", user.expiresAt);

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

    // Lógica de deviceId (asumiendo que el admin no tiene esta restricción o se maneja por rol)
    const isAdminUser = user.role === 'admin';
    if (!isAdminUser && user.deviceId && user.deviceId !== deviceId && deviceId) {
      return res.status(403).json({ 
        error: "Esta cuenta ya está activa en otro dispositivo. Cierra la sesión anterior para continuar." 
      });
    }
    if (!isAdminUser && deviceId && (!user.deviceId || user.deviceId !== deviceId)) {
      user.deviceId = deviceId;
      // Solo guardar si es necesario, el hook pre-save de password no se disparará si no se modifica password
      await user.save(); 
      console.log(`LOGIN CONTROLLER (Backend): DeviceId actualizado para ${user.username} a ${deviceId}`);
    }

    const payload = { 
        id: user._id, 
        role: user.role,
        username: user.username 
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

    console.log("LOGIN BACKEND: Login exitoso para:", user.username, "Rol:", user.role);
    res.json({ 
        token, 
        user: {
            username: user.username, 
            role: user.role 
        }
    });

  } catch (error) {
    console.error("Error en el controlador de login (Backend):", error);
    next(error);
  }
};