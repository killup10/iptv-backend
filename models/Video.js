// iptv-backend/models/Video.js
import mongoose from "mongoose";

// --- NUEVO SUB-SCHEMA PARA CAPÍTULOS DENTRO DE UNA TEMPORADA ---
const chapterSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  url: { type: String, required: true, trim: true },
  thumbnail: { type: String, default: '' },
  duration: { type: String, default: '0:00' }, // Puedes almacenar la duración si la obtienes
  description: { type: String, default: '', trim: true }
}, {_id: false}); // _id: false es buena práctica para subdocumentos si no necesitan IDs propios en MongoDB

// --- NUEVO SUB-SCHEMA PARA TEMPORADAS ---
const seasonSchema = new mongoose.Schema({
  seasonNumber: { type: Number, required: true, min: 1 }, // Número de la temporada (ej. 1, 2, 3)
  title: { type: String, default: '', trim: true }, // Título de la temporada (opcional, ej. "La temporada de la venganza")
  chapters: { // Array de capítulos dentro de esta temporada
    type: [chapterSchema],
    default: []
  }
}, {_id: false});

// Se actualiza el sub-schema para las entradas de progreso individuales
const watchProgressEntrySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  lastSeason: { type: Number, default: 0 }, // Nuevo campo: índice de la última temporada vista
  lastChapter: { type: Number, default: 0 }, // Índice del último capítulo visto dentro de esa temporada
  lastTime: { type: Number, default: 0 },
  progress: { type: Number, default: 0 }, // Progreso del capítulo actual (0.0 a 1.0)
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
    required: function() { return this.tipo !== "pelicula"; }, // La subcategoría aplica a todo lo que no sea película, ya que ahora 'serie' engloba todo
    enum: [
      "Netflix", "Prime Video", "Disney", "Apple TV",
      "Hulu y Otros", "Retro", "Animadas", "ZONA KIDS"
    ],
    default: "Netflix"
  },
  // --- CAMBIO CLAVE: 'chapters' es reemplazado por 'seasons' ---
  seasons: {
    type: [seasonSchema],
    // 'required' si el tipo no es película, ya que las series tienen temporadas
    required: function() { return this.tipo !== "pelicula"; },
    default: []
  },
  // --- watchProgress actualizado para incluir lastSeason ---
  watchProgress: {
    type: [watchProgressEntrySchema],
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
// Se ha adaptado para la nueva estructura de watchProgress con lastSeason
videoSchema.index({ "watchProgress.userId": 1, "watchProgress.lastWatched": -1 });

// Índices compuestos
videoSchema.index({ tipo: 1, active: 1, isFeatured: 1 });
videoSchema.index({ mainSection: 1, tipo: 1, active: 1 });
videoSchema.index({ tipo: 1, active: 1, requiresPlan: 1 }); 
videoSchema.index({ mainSection: 1, active: 1, requiresPlan: 1 }); 

export default mongoose.model("Video", videoSchema);