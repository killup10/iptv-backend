// iptv-backend/models/Channel.js
import mongoose from "mongoose";

const channelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "El nombre del canal es requerido."],
    trim: true
  },
  url: {
    type: String,
    required: [true, "La URL del canal es requerida."],
    trim: true
  },
  category: {
    type: String,
    default: 'GENERAL',
    trim: true
  },
  logo: {
    type: String,
    default: '' // Puedes poner una URL a un logo placeholder por defecto
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  active: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  // CAMBIO: requiresPlan ahora es un array de strings
  requiresPlan: {
    type: [{
      type: String,
      enum: ['gplay', 'cinefilo', 'sports', 'premium', 'free_preview'], // Tus planes + posible 'free_preview'
    }],
    default: ['gplay'] // Por defecto, accesible por el plan más básico o el que definas como base
  },
  // NUEVO CAMPO: Para indicar si el canal es visible en listas para todos,
  // aunque el acceso para reproducir siga restringido por 'requiresPlan'
  isPubliclyVisible: {
    type: Boolean,
    default: false // Por defecto, un canal no es públicamente visible si requiere un plan específico
                   // Podrías cambiar el default a true si prefieres que todos los canales se listen
                   // y solo se restrinja el acceso al intentar verlos.
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Hook para actualizar 'updatedAt' antes de cualquier operación de guardado/actualización
channelSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Si usas findByIdAndUpdate, podrías necesitar un hook pre 'findOneAndUpdate'
// o simplemente asegurar que actualizas 'updatedAt' manualmente en la ruta como ya lo haces.

// Índice para búsquedas comunes (opcional pero recomendado)
channelSchema.index({ category: 1, active: 1 });
channelSchema.index({ name: 'text', description: 'text' }); // Para búsqueda de texto si la implementas

export default mongoose.model('Channel', channelSchema);