// iptv-backend/models/User.js
import mongoose from "mongoose";
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  isActive: { type: Boolean, default: false },
  expiresAt: { type: Date, default: null },
  deviceId: { type: String, default: null },
  role: { type: String, enum: ["admin", "user"], default: "user" },
  plan: {
    type: String,
    enum: ['basico', 'estandar', 'premium', 'cinefilo', 'sports'], // 'basico' (antes gplay), 'estandar', 'premium', 'cinefilo', 'sports'
    default: 'basico' // 'basico' es el plan por defecto
  }
}, {
  timestamps: true
});

// Hook para hashear la contraseña antes de guardar
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Método para comparar contraseñas
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("User", userSchema);