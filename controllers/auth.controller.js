// controllers/auth.controller.js

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

/**
 * Registro de nuevos usuarios.
 * Crea un usuario con contraseña hasheada y queda pending hasta aprobación.
 */
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

/**
 * Login de usuarios.
 * Valida credenciales, estado de la cuenta y controla sesión única,
 * excepto para el usuario administrador "Adminkillup".
 */
export const login = async (req, res) => {
  try {
    const { username, password, deviceId } = req.body;
    const user = await User.findOne({ username });

    if (!user) 
      return res.status(404).json({ error: "Usuario no encontrado" });

    if (!user.isActive) 
      return res.status(403).json({ error: "Tu cuenta aún no está activa." });

    if (user.expiresAt && user.expiresAt < new Date()) 
      return res.status(403).json({ error: "Tu suscripción ha expirado." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) 
      return res.status(400).json({ error: "Contraseña incorrecta" });

    // ← Validación de sesión única para usuarios que NO sean Adminkillup
    if (
      user.username !== "Adminkillup" &&
      user.deviceId &&
      user.deviceId !== deviceId
    ) {
      return res
        .status(403)
        .json({ error: "Esta cuenta ya está activa en otro dispositivo." });
    }

    // ← Registrar deviceId la primera vez (solo para no-admin)
    if (user.username !== "Adminkillup" && !user.deviceId) {
      user.deviceId = deviceId;
      await user.save();
    }
    // Si es Adminkillup, nunca bloqueamos por deviceId

    // Generar JWT
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({ token });

    // Generar JWT incluyendo el role
+   const payload = { id: user._id, role: user.role };
+   const token = jwt.sign(payload, process.env.JWT_SECRET, {
+     expiresIn: "7d",
+   });
+
+   // Devuelvo token, usuario y role
+   res.json({
+     token,
+     username: user.username,
+     role: user.role
+   });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
