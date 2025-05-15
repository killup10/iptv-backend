// iptv-backend/models/User.js
import mongoose from "mongoose";
// import bcrypt from 'bcryptjs'; // Asegúrate de tener esto para el hasheo

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true /*, select: false */ }, // Recuerda hashear
  isActive: { type: Boolean, default: false }, // Admin aprueba, o default: true si no hay aprobación
  expiresAt: { type: Date, default: null },
  deviceId: { type: String, default: null },
  role: { type: String, enum: ["admin", "user"], default: "user" },

  // NUEVO CAMPO PARA PLAN DE USUARIO
  plan: {
    type: String,
    enum: ['basico', 'premium', 'cinefilo'], // Tus niveles de plan
    default: 'basico'
  }
  // --- FIN NUEVO CAMPO ---

}, {
  timestamps: true
});

// userSchema.pre('save', async function(next) { ... tu hook de hasheo de contraseña ... });
// userSchema.methods.comparePassword = async function(candidatePassword) { ... };

export default mongoose.model("User", userSchema);