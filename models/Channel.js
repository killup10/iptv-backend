// models/Channel.js
import mongoose from "mongoose";

const channelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "El nombre del canal es requerido."], // Añadido mensaje de error
    trim: true
  },
  url: {
    type: String,
    required: [true, "La URL del canal es requerida."], // Añadido mensaje de error
    trim: true
    // Podrías añadir una validación de formato de URL si quieres
  },
  category: {
    type: String,
    default: 'GENERAL', // Considera usar mayúsculas para consistencia si tus CATEGORY_OPTIONS son así
    trim: true
  },
  logo: {
    type: String,
    default: '' // Puedes poner una URL a un logo placeholder por defecto si quieres
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  active: { // 'active' ya lo tenías, lo renombro a isActive para consistencia con VODs si prefieres, pero 'active' está bien
    type: Boolean,
    default: true
  },
  isFeatured: { // <--- CAMPO AÑADIDO
    type: Boolean,
    default: false
  },
  requiresPlan: { // <--- CAMPO AÑADIDO
    type: String,
    enum: ['gplay', 'cinefilo', 'sports', 'premium'], // Ajusta estos valores a tus planes exactos
    default: 'gplay', // O el plan más básico
    trim: true
  },
  // user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Si decides asociar canales a usuarios específicos (dueños)
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Hook para actualizar 'updatedAt' antes de guardar
channelSchema.pre('save', function(next) {
  if (this.isModified()) { // Solo actualiza si hay cambios, aunque Date.now() siempre es nuevo
    this.updatedAt = Date.now();
  }
  next();
});

// Opcional: Si quieres asegurar que la combinación de nombre y categoría sea única (o solo nombre)
// channelSchema.index({ name: 1, category: 1 }, { unique: true }); // Descomenta si necesitas unicidad

export default mongoose.model('Channel', channelSchema);