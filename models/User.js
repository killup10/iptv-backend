// killup10/iptv-backend/iptv-backend-8c867e627d920161cf787c3ca5740e6d07de0a4f/models/User.js
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
  expiresAt: { type: Date, default: null }, // Ya tienes este campo para la fecha
  activeSessions: [{
    deviceId: { type: String, required: true },
    token: { type: String, required: true },
    lastActivity: { type: Date, default: Date.now }
  }],
  // --- CAMBIO CLAVE AQUÍ ---
  // Añadimos un campo para el límite de dispositivos por usuario.
  maxDevices: {
    type: Number,
    default: 2, // Por defecto, cada usuario podrá tener 2 dispositivos.
    min: 1      // Como mínimo, 1 dispositivo.
  },
  // Sistema de prueba gratuita diaria
  dailyTrialUsage: {
    date: { type: Date, default: null },
    minutesUsed: { type: Number, default: 0 },
    maxMinutesPerDay: { type: Number, default: 60 } // 1 hora por día
  },
  role: { type: String, enum: ["admin", "user"], default: "user" },
  plan: {
    type: String,
    // CORRECCIÓN: Se alinea el plan base a 'gplay' para que coincida con la lógica de acceso y el modelo de Video.
    // El plan 'basico' no existía en la jerarquía de planes, impidiendo el acceso a todo el contenido.
    enum: ['gplay', 'estandar', 'premium', 'cinefilo', 'sports'],
    default: 'gplay'
  },
  // Mi Lista - lista personal de cada usuario
  myList: [{
    itemId: { type: String, required: true },
    tipo: { type: String, default: 'movie' },
    title: { type: String },
    thumbnail: { type: String },
    description: { type: String },
    addedAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

// Hook para hashear la contraseña antes de guardar (sin cambios)
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

// Método para comparar contraseñas (sin cambios)
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("User", userSchema);
