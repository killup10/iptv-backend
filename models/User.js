// models/User.js
import mongoose from "mongoose";

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
  isActive: {
    type: Boolean,
    default: false // Por defecto, el admin debe activar
  },
  expiresAt: {
    type: Date,
    default: null // Fecha de expiración de la cuenta
  },
  deviceId: {
    type: String,
    default: null // Para controlar el dispositivo único
  }
}, {
  timestamps: true // Añade automáticamente createdAt y updatedAt
});

export default mongoose.model("User", userSchema);
