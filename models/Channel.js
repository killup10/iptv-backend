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
  section: { 
    type: String,
    default: 'General',
    trim: true,
    index: true
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
  isFeatured: { 
    type: Boolean,
    default: false
  },
    requiresPlan: {
      type: [{
      type: String,
 // Plan requerido para acceder al canal. 'gplay' es el plan básico.
      // Se acepta 'basico' únicamente para compatibilidad con datos antiguos.
      enum: ['gplay', 'estandar', 'cinefilo', 'sports', 'premium', 'free_preview'],    
    }],
    default: ['gplay']
  },
  isPubliclyVisible: { 
    type: Boolean,
    default: true
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