// routes/device.routes.js COMPLETO CON RUTAS DE USUARIO Y ADMIN

import express from 'express';
import { verifyToken, isAdmin } from '../middlewares/verifyToken.js';
import Device from '../models/Device.js';

const router = express.Router();

// ✅ Usuario autenticado: ver sus propios dispositivos
router.get('/me/devices', verifyToken, async (req, res) => {
  try {
    const devices = await Device.find({ userId: req.user.id }).sort({ lastSeen: -1 });
    res.json(devices);
  } catch (error) {
    console.error("Error obteniendo dispositivos:", error);
    res.status(500).json({ error: "Error al obtener los dispositivos." });
  }
});

// ✅ Usuario autenticado: cerrar sesión en uno de sus dispositivos
router.delete('/me/devices/:deviceId', verifyToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    await Device.findOneAndUpdate({ userId: req.user.id, deviceId }, { isActive: false });
    res.json({ message: 'Dispositivo desactivado correctamente.' });
  } catch (error) {
    console.error("Error desactivando dispositivo:", error);
    res.status(500).json({ error: "No se pudo desactivar el dispositivo." });
  }
});

// ✅ Solo admin: ver todos los dispositivos de un usuario
router.get('/admin/:userId', verifyToken, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const devices = await Device.find({ userId }).sort({ lastSeen: -1 });
    res.json(devices);
  } catch (error) {
    console.error("Error obteniendo dispositivos para admin:", error);
    res.status(500).json({ error: "No se pudo obtener la información de dispositivos." });
  }
});

// ✅ Solo admin: desactivar dispositivo específico de un usuario
router.delete('/admin/:userId/:deviceId', verifyToken, isAdmin, async (req, res) => {
  try {
    const { userId, deviceId } = req.params;
    await Device.findOneAndUpdate({ userId, deviceId }, { isActive: false });
    res.json({ message: 'Dispositivo desactivado correctamente por admin.' });
  } catch (error) {
    console.error("Error desactivando dispositivo como admin:", error);
    res.status(500).json({ error: "No se pudo desactivar el dispositivo." });
  }
});

export default router;
