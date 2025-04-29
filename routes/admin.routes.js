import express from "express";
import User from "../models/User.js";
import { verifyToken } from "../middlewares/verifyToken.js";

const router = express.Router();

// Obtener usuarios pendientes
router.get("/pending-users", verifyToken, async (req, res) => {
  const pendingUsers = await User.find({ isActive: false });
  res.json(pendingUsers);
});

// Aprobar usuario
router.post("/approve-user/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { expiresAt } = req.body; // Fecha de expiración que define el admin

  const user = await User.findById(id);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  user.isActive = true;
  user.expiresAt = expiresAt ? new Date(expiresAt) : null;
  await user.save();

  res.json({ message: "Usuario aprobado exitosamente." });
});

export default router;
