// iptv-backend/models/User.js
import mongoose from "mongoose";
import bcrypt from 'bcryptjs'; // Asegúrate de importar bcryptjs

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true 
    // Se quita 'lowercase: true' para mantener la sensibilidad a mayúsculas/minúsculas
  },
  password: { 
    type: String, 
    required: true 
    // select: false // Considera añadir esto para no devolver la contraseña por defecto
  },
  isActive: { type: Boolean, default: false },
  expiresAt: { type: Date, default: null },
  deviceId: { type: String, default: null },
  role: { type: String, enum: ["admin", "user"], default: "user" },
  plan: {
    type: String,
    enum: ['basico', 'premium', 'cinefilo'],
    default: 'basico'
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
    const salt = await bcrypt.genSalt(10); // O 12 para más seguridad
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Método para comparar contraseñas (opcional, pero buena práctica)
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("User", userSchema);