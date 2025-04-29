// controllers/admin.controller.js
import User from "../models/User.js";

export const getPendingUsers = async (req, res) => {
  try {
    const pendingUsers = await User.find({ isActive: false });
    res.json(pendingUsers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const activateUser = async (req, res) => {
  try {
    const { userId, expiresAt } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    user.isActive = true;
    user.expiresAt = expiresAt;
    await user.save();

    res.json({ message: "Usuario activado exitosamente" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deactivateUser = async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    user.isActive = false;
    user.deviceId = null; // Limpiamos el dispositivo asociado
    await user.save();

    res.json({ message: "Usuario desactivado exitosamente" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
