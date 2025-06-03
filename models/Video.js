// iptv-backend/models/Video.js
import mongoose from "mongoose";

const videoSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true },
  url: { 
    type: String, 
    required: function() { return this.tipo === "pelicula"; },
    trim: true,
    default: ""
  },
  tipo: {
    type: String,
    required: true,
    enum: ["pelicula", "serie", "anime", "dorama", "novela", "documental"]
  },
  subtipo: {
    type: String,
    required: function() { return this.tipo !== "pelicula"; },
    enum: ["pelicula", "serie", "anime", "dorama", "novela", "documental"],
    default: function() { return this.tipo || "serie"; }
  },
  subcategoria: {
    type: String,
    required: function() { return this.tipo === "serie"; },
    enum: ["Netflix", "Prime Video", "Disney", "Apple TV", "Hulu y Otros", "Retro", "Animadas"],
    default: "Netflix"
  },
  watchProgress: {
    lastChapter: { type: Number, default: 0 },
    lastTime: { type: Number, default: 0 },
    lastWatched: { type: Date },
    completed: { type: Boolean, default: false }
  },
  chapters: {
    type: [{
      title: { type: String, required: true, trim: true },
      url: { type: String, required: true, trim: true },
      thumbnail: { type: String, default: '' },
      duration: { type: String, default: '0:00' },
      description: { type: String, default: '', trim: true }
    }],
    required: function() { return this.tipo !== "pelicula"; },
    default: []
  },
  mainSection: {
    type: String,
    trim: true,
    enum: [
        "POR_GENERO",
        "ESPECIALES",
        "CINE_2025",
        "CINE_4K",
        "CINE_60FPS"
    ],
    default: "POR_GENERO",
  },
  genres: [{ // Array de géneros
    type: String,
    trim: true,
  }],
  requiresPlan: [{ // Array de Strings para planes
    type: String,
    trim: true,
    enum: ["gplay", "estandar", "cinefilo", "sports", "premium"], // Tus 5 planes
  }],
  releaseYear: { type: Number },
  isFeatured: { type: Boolean, default: false },
  active: { type: Boolean, default: true },

  logo: { type: String, default: '' },
  customThumbnail: { type: String, default: '' },
  tmdbThumbnail: { type: String, default: '' },
  
  trailerUrl: { type: String, default: '', trim: true },
  // user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Descomenta si lo necesitas
}, { 
  timestamps: true
});

// --- ÍNDICES ---

// 1. Índice de texto para búsquedas
videoSchema.index({ title: 'text', description: 'text' });

// 2. Índices individuales para campos de array (MongoDB crea índices multikey)
videoSchema.index({ genres: 1 });
videoSchema.index({ requiresPlan: 1 });

// 3. Índices individuales para campos de filtro comunes (si no están en compuestos)
videoSchema.index({ mainSection: 1 });
videoSchema.index({ active: 1 });
videoSchema.index({ isFeatured: 1 });
videoSchema.index({ tipo: 1 });


// 4. Índices compuestos (con UN MÁXIMO de UN campo de array por índice)
// Para filtrar VODs por tipo, estado de activación y si son destacados (Home y listados)
videoSchema.index({ tipo: 1, active: 1, isFeatured: 1 });

// Para filtrar por sección principal, tipo y estado de activación
videoSchema.index({ mainSection: 1, tipo: 1, active: 1 });

// Si necesitas filtrar por 'requiresPlan' junto con 'active' y 'tipo':
videoSchema.index({ tipo: 1, active: 1, requiresPlan: 1 }); // Válido (tipo y active son escalares)

// Si necesitas filtrar por 'requiresPlan' junto con 'active' y 'mainSection':
videoSchema.index({ mainSection: 1, active: 1, requiresPlan: 1 }); // Válido

// EL ÍNDICE PROBLEMÁTICO QUE DEBE SER ELIMINADO (si aún existe en alguna versión):
// videoSchema.index({ genres: 1, active: 1, requiresPlan: 1 }); // <-- ASEGÚRATE QUE ESTO NO ESTÉ ACTIVO

export default mongoose.model("Video", videoSchema);
