// models/Channel.js
import mongoose from "mongoose";

const channelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  url: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    default: 'general',
    trim: true // Buena práctica añadir trim a strings
  },
  logo: {
    type: String,
    default: ''
  },
  description: { // <--- NUEVO CAMPO AÑADIDO
    type: String,
    default: '',
    trim: true
  },
  active: {
    type: Boolean,
    default: true
  },
  // user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Si decides asociar canales a usuarios
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

export default mongoose.model('Channel', channelSchema);