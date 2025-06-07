// iptv-backend/models/Video.js
import mongoose from "mongoose";

// Se crea un sub-schema para las entradas de progreso individuales
const watchProgressEntrySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  lastChapter: { type: Number, default: 0 },
  lastTime: { type: Number, default: 0 },
  lastWatched: { type: Date, default: Date.now },
  completed: { type: Boolean, default: false }
}, {_id: false}); // _id: false es una buena práctica para subdocumentos si no necesitas IDs únicos para cada entrada de progreso

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
  // --- CAMBIO CLAVE ---
  // watchProgress ahora es un array que usa el sub-schema definido arriba.
  watchProgress: {
    type: [watchProgressEntrySchema],
    default: [] 
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
  genres: [{ 
    type: String,
    trim: true,
  }],
  requiresPlan: [{ 
    type: String,
    trim: true,
    enum: ["gplay", "estandar", "cinefilo", "sports", "premium"], 
  }],
  releaseYear: { type: Number },
  isFeatured: { type: Boolean, default: false },
  active: { type: Boolean, default: true },

  logo: { type: String, default: '' },
  customThumbnail: { type: String, default: '' },
  tmdbThumbnail: { type: String, default: '' },
  
  trailerUrl: { type: String, default: '', trim: true },
}, { 
  timestamps: true
});

// --- ÍNDICES ---
videoSchema.index({ title: 'text', description: 'text' });
videoSchema.index({ genres: 1 });
videoSchema.index({ requiresPlan: 1 });
videoSchema.index({ mainSection: 1 });
videoSchema.index({ active: 1 });
videoSchema.index({ isFeatured: 1 });
videoSchema.index({ tipo: 1 });

// Este nuevo índice es CRUCIAL para que las búsquedas de "Continuar Viendo" sean rápidas.
// Ayuda a encontrar videos donde un usuario específico tiene progreso.
videoSchema.index({ "watchProgress.userId": 1, "watchProgress.lastWatched": -1 });

// Índices compuestos
videoSchema.index({ tipo: 1, active: 1, isFeatured: 1 });
videoSchema.index({ mainSection: 1, tipo: 1, active: 1 });
videoSchema.index({ tipo: 1, active: 1, requiresPlan: 1 }); 
videoSchema.index({ mainSection: 1, active: 1, requiresPlan: 1 }); 

export default mongoose.model("Video", videoSchema);
