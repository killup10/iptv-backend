// controllers/auth.controller.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const register = async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: "Registro exitoso, espera aprobación." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { username, password, deviceId } = req.body;
    const user = await User.findOne({ username });

    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    if (!user.isActive) return res.status(403).json({ error: "Tu cuenta aún no está activa." });
    if (user.expiresAt && user.expiresAt < new Date()) return res.status(403).json({ error: "Tu suscripción ha expirado." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Contraseña incorrecta" });

    // Validar un solo dispositivo
    if (user.deviceId && user.deviceId !== deviceId) {
      return res.status(403).json({ error: "Esta cuenta ya está activa en otro dispositivo." });
    }

    // Si no hay deviceId registrado aún, guardar el nuevo
    if (!user.deviceId) {
      user.deviceId = deviceId;
      await user.save();
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
