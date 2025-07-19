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
      // Limpiar dispositivos obsoletos automáticamente antes de verificar límites
      await Device.deactivateStale(7);
      
      const activeDevices = await Device.find({ userId: user._id, isActive: true });
      const maxDevices = user.maxDevices || 2;

      // Verificar si el dispositivo actual ya está registrado
      const existingDevice = activeDevices.find(d => d.deviceId === deviceId);
      
      if (!existingDevice && activeDevices.length >= maxDevices) {
        console.log(`Usuario ${username} alcanzó límite de dispositivos: ${activeDevices.length}/${maxDevices}`);
        return res.status(403).json({ 
          error: `Límite de dispositivos alcanzado. Solo puedes estar conectado en ${maxDevices} dispositivos.`,
          activeDevices: activeDevices.length,
          maxDevices: maxDevices,
          deviceList: activeDevices.map(d => ({
            deviceId: d.deviceId,
            lastSeen: d.lastSeen,
            deviceType: d.deviceType,
            browser: d.browser
          }))
        });
      }

      // Actualizar o crear dispositivo
      let device = await Device.findOne({ userId: user._id, deviceId });
      
      if (device) {
        // Actualizar dispositivo existente
        await device.updateInfo(userAgent, ip);
        device.isActive = true;
        await device.save();
        console.log(`Usuario ${username} actualizó dispositivo existente: ${deviceId}`);
      } else {
        // Crear nuevo dispositivo
        device = new Device({
          userId: user._id,
          deviceId,
          userAgent,
          ip,
          lastSeen: new Date(),
          isActive: true
        });
        await device.save();
        console.log(`Usuario ${username} registró nuevo dispositivo: ${deviceId}`);
      }
    }

    console.log(`Login exitoso para usuario ${username} desde dispositivo ${deviceId}`);
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
    const { deviceId, allDevices = false } = req.body;
    const userId = req.user.id;
    const username = req.user.username;

    if (allDevices || !deviceId) {
      // Cerrar todas las sesiones del usuario
      const result = await Device.updateMany({ userId }, { isActive: false });
      console.log(`Usuario ${username} cerró todas sus sesiones: ${result.modifiedCount} dispositivos desactivados`);
      return res.json({ 
        message: "Todas las sesiones han sido cerradas",
        devicesDeactivated: result.modifiedCount
      });
    }

    // Cerrar sesión en dispositivo específico
    const result = await Device.findOneAndUpdate(
      { userId, deviceId }, 
      { isActive: false },
      { new: true }
    );

    if (!result) {
      console.log(`Usuario ${username} intentó cerrar sesión en dispositivo inexistente: ${deviceId}`);
      return res.status(404).json({ error: "Dispositivo no encontrado." });
    }

    console.log(`Usuario ${username} cerró sesión en dispositivo: ${deviceId}`);
    res.json({ 
      message: "Sesión cerrada exitosamente",
      deviceId: result.deviceId
    });
  } catch (error) {
    console.error("Error en logout:", error);
    next(error);
  }
};

// Nueva función para limpiar dispositivos inactivos automáticamente
export const cleanupInactiveDevices = async () => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await Device.deleteMany({
      isActive: false,
      lastSeen: { $lt: thirtyDaysAgo }
    });

    console.log(`Limpieza automática: ${result.deletedCount} dispositivos inactivos eliminados`);
    return result.deletedCount;
  } catch (error) {
    console.error("Error en limpieza automática de dispositivos:", error);
    return 0;
  }
};

// Nueva función para forzar logout de dispositivos obsoletos
export const forceLogoutStaleDevices = async () => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const result = await Device.updateMany(
      {
        isActive: true,
        lastSeen: { $lt: sevenDaysAgo }
      },
      { isActive: false }
    );

    console.log(`Logout forzado: ${result.modifiedCount} dispositivos obsoletos desactivados`);
    return result.modifiedCount;
  } catch (error) {
    console.error("Error en logout forzado de dispositivos obsoletos:", error);
    return 0;
  }
};
