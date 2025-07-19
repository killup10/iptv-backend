// routes/device.routes.js MEJORADO CON FUNCIONALIDAD COMPLETA

import express from 'express';
import { verifyToken, isAdmin } from '../middlewares/verifyToken.js';
import Device from '../models/Device.js';
import User from '../models/User.js';

const router = express.Router();

// ✅ Usuario autenticado: ver sus propios dispositivos
router.get('/me/devices', verifyToken, async (req, res) => {
  try {
    const devices = await Device.find({ userId: req.user.id }).sort({ lastSeen: -1 });
    console.log(`Usuario ${req.user.username} consultó sus dispositivos: ${devices.length} encontrados`);
    res.json(devices);
  } catch (error) {
    console.error("Error obteniendo dispositivos del usuario:", error);
    res.status(500).json({ error: "Error al obtener los dispositivos." });
  }
});

// ✅ Usuario autenticado: cerrar sesión en uno de sus dispositivos
router.delete('/me/devices/:deviceId', verifyToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const result = await Device.findOneAndUpdate(
      { userId: req.user.id, deviceId }, 
      { isActive: false },
      { new: true }
    );
    
    if (!result) {
      return res.status(404).json({ error: "Dispositivo no encontrado." });
    }
    
    console.log(`Usuario ${req.user.username} desactivó su dispositivo: ${deviceId}`);
    res.json({ message: 'Dispositivo desactivado correctamente.' });
  } catch (error) {
    console.error("Error desactivando dispositivo del usuario:", error);
    res.status(500).json({ error: "No se pudo desactivar el dispositivo." });
  }
});

// ✅ Usuario autenticado: cerrar sesión en todos sus dispositivos
router.delete('/me/devices', verifyToken, async (req, res) => {
  try {
    const result = await Device.updateMany(
      { userId: req.user.id }, 
      { isActive: false }
    );
    
    console.log(`Usuario ${req.user.username} desactivó todos sus dispositivos: ${result.modifiedCount} dispositivos`);
    res.json({ 
      message: `Se desactivaron ${result.modifiedCount} dispositivos correctamente.`,
      count: result.modifiedCount
    });
  } catch (error) {
    console.error("Error desactivando todos los dispositivos del usuario:", error);
    res.status(500).json({ error: "No se pudieron desactivar los dispositivos." });
  }
});

// ✅ Solo admin: ver todos los dispositivos de un usuario
router.get('/admin/:userId', verifyToken, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { includeInactive = 'false' } = req.query;
    
    // Verificar que el usuario existe
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }
    
    const filter = { userId };
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }
    
    const devices = await Device.find(filter).sort({ lastSeen: -1 });
    
    console.log(`Admin consultó dispositivos del usuario ${user.username}: ${devices.length} encontrados`);
    res.json({
      devices,
      user: {
        id: user._id,
        username: user.username,
        plan: user.plan
      },
      total: devices.length,
      active: devices.filter(d => d.isActive).length
    });
  } catch (error) {
    console.error("Error obteniendo dispositivos para admin:", error);
    res.status(500).json({ error: "No se pudo obtener la información de dispositivos." });
  }
});

// ✅ Solo admin: desactivar dispositivo específico de un usuario
router.delete('/admin/:userId/:deviceId', verifyToken, isAdmin, async (req, res) => {
  try {
    const { userId, deviceId } = req.params;
    
    // Verificar que el usuario existe
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }
    
    const result = await Device.findOneAndUpdate(
      { userId, deviceId }, 
      { isActive: false },
      { new: true }
    );
    
    if (!result) {
      console.log(`Admin intentó desactivar dispositivo inexistente: userId=${userId}, deviceId=${deviceId}`);
      return res.status(404).json({ error: "Dispositivo no encontrado." });
    }
    
    console.log(`Admin desactivó dispositivo del usuario ${user.username}: ${deviceId}`);
    res.json({ 
      message: 'Dispositivo desactivado correctamente por admin.',
      device: {
        deviceId: result.deviceId,
        lastSeen: result.lastSeen,
        isActive: result.isActive
      }
    });
  } catch (error) {
    console.error("Error desactivando dispositivo como admin:", error);
    res.status(500).json({ error: "No se pudo desactivar el dispositivo." });
  }
});

// ✅ Solo admin: desactivar todos los dispositivos de un usuario
router.delete('/admin/:userId/devices', verifyToken, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Verificar que el usuario existe
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }
    
    const result = await Device.updateMany(
      { userId }, 
      { isActive: false }
    );
    
    console.log(`Admin desactivó todos los dispositivos del usuario ${user.username}: ${result.modifiedCount} dispositivos`);
    res.json({ 
      message: `Se desactivaron ${result.modifiedCount} dispositivos del usuario ${user.username}.`,
      count: result.modifiedCount,
      username: user.username
    });
  } catch (error) {
    console.error("Error desactivando todos los dispositivos como admin:", error);
    res.status(500).json({ error: "No se pudieron desactivar los dispositivos." });
  }
});

// ✅ Solo admin: limpiar dispositivos inactivos antiguos
router.delete('/admin/cleanup/inactive', verifyToken, isAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
    
    const result = await Device.deleteMany({
      isActive: false,
      lastSeen: { $lt: cutoffDate }
    });
    
    console.log(`Admin ejecutó limpieza de dispositivos inactivos: ${result.deletedCount} dispositivos eliminados`);
    res.json({ 
      message: `Se eliminaron ${result.deletedCount} dispositivos inactivos de más de ${days} días.`,
      count: result.deletedCount,
      cutoffDate
    });
  } catch (error) {
    console.error("Error limpiando dispositivos inactivos:", error);
    res.status(500).json({ error: "No se pudo realizar la limpieza de dispositivos." });
  }
});

// ✅ Solo admin: obtener estadísticas de dispositivos
router.get('/admin/stats', verifyToken, isAdmin, async (req, res) => {
  try {
    const totalDevices = await Device.countDocuments();
    const activeDevices = await Device.countDocuments({ isActive: true });
    const inactiveDevices = await Device.countDocuments({ isActive: false });
    
    // Dispositivos por usuario (top 10)
    const devicesByUser = await Device.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { username: '$user.username', count: 1 } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Dispositivos conectados en las últimas 24 horas
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);
    const recentDevices = await Device.countDocuments({
      isActive: true,
      lastSeen: { $gte: last24Hours }
    });
    
    res.json({
      total: totalDevices,
      active: activeDevices,
      inactive: inactiveDevices,
      recent24h: recentDevices,
      topUsers: devicesByUser
    });
  } catch (error) {
    console.error("Error obteniendo estadísticas de dispositivos:", error);
    res.status(500).json({ error: "No se pudieron obtener las estadísticas." });
  }
});

export default router;
