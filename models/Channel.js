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
  // CAMBIO: 'category' ahora es 'section' y es un string simple que define el admin.
  section: { // Anteriormente 'category'
    type: String,
    default: 'General', // Default section
    trim: true,
    index: true // Bueno para filtrar
  },
  logo: {
    type: String,
    default: ''
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
  isFeatured: { // Para la sección "Destacados"
    type: Boolean,
    default: false
  },
  requiresPlan: { // Se mantiene como array para multiplan
    type: [{
      type: String,
      enum: ['gplay', 'cinefilo', 'sports', 'premium', 'free_preview'],
    }],
    default: ['gplay']
  },
  isPubliclyVisible: { // Se mantiene
    type: Boolean,
    default: true // Cambiado a true para que por defecto todos se listen, el acceso se controla al ver
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

channelSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

channelSchema.index({ section: 1, active: 1 });

export default mongoose.model('Channel', channelSchema);