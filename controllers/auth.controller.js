// auth.controller.js COMPLETO CON CONTROL DE DISPOSITIVOS

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Device from "../models/Device.js";
import { v4 as uuidv4 } from 'uuid';

export const register = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Nombre de usuario y contraseña son requeridos." });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: "El nombre de usuario ya está en uso." });
    }

    const user = new User({ username, password });
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
    const { username, password } = req.body;
    const deviceId = req.headers['x-device-id'] || uuidv4();
    const userAgent = req.headers['user-agent'];
    const ip = req.ip;

    if (!username || !password) {
      return res.status(400).json({ error: "Nombre de usuario y contraseña son requeridos." });
    }

    const user = await User.findOne({ username }).select('+password');
    if (!user) return res.status(401).json({ error: "Credenciales inválidas." });

    if (!user.isActive) return res.status(403).json({ error: "Tu cuenta está inactiva o pendiente de aprobación." });
    if (user.expiresAt && user.expiresAt < new Date()) return res.status(403).json({ error: "Tu suscripción ha expirado." });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: "Credenciales inválidas." });

    const payload = { id: user._id, role: user.role, username: user.username, plan: user.plan };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

    const isAdmin = user.role === 'admin';
    if (!isAdmin) {
      const activeDevices = await Device.find({ userId: user._id, isActive: true });

      if (activeDevices.length >= 2 && !activeDevices.some(d => d.deviceId === deviceId)) {
        return res.status(403).json({ error: "Límite de dispositivos alcanzado. Solo puedes estar conectado en 2 dispositivos." });
      }

      await Device.findOneAndUpdate(
        { userId: user._id, deviceId },
        { userAgent, ip, lastSeen: new Date(), isActive: true },
        { upsert: true, new: true }
      );
    }

    res.json({
      token,
      user: {
        username: user.username,
        role: user.role,
        plan: user.plan
      }
    });
  } catch (error) {
    console.error("Error en login:", error);
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const { deviceId } = req.body;
    const userId = req.user.id;

    if (!deviceId) {
      await Device.updateMany({ userId }, { isActive: false });
      return res.json({ message: "Todas las sesiones han sido cerradas" });
    }

    await Device.findOneAndUpdate({ userId, deviceId }, { isActive: false });

    res.json({ message: "Sesión cerrada exitosamente" });
  } catch (error) {
    console.error("Error en logout:", error);
    next(error);
  }
};
