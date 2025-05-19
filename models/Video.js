// iptv-backend/models/Video.js
import mongoose from "mongoose";

const videoSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true },
  url: { type: String, required: true, trim: true },
  tipo: {
    type: String,
    required: true,
    enum: ["pelicula", "serie"]
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
    index: true
  },
  genres: [{
    type: String,
    trim: true,
  }],
  requiresPlan: [{ // <--- CAMBIO: Ahora es un array de Strings
    type: String,
    trim: true,
    enum: ["gplay", "estandar", "cinefilo", "sports", "premium"], // <--- CAMBIO: Todos tus 5 planes
  }],
  releaseYear: { type: Number },
  isFeatured: { type: Boolean, default: false },
  active: { type: Boolean, default: true },

  logo: { type: String, default: '' },
  customThumbnail: { type: String, default: '' },
  tmdbThumbnail: { type: String, default: '' },
  
  trailerUrl: { type: String, default: '', trim: true },
  // user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { 
  timestamps: true
});

// Índices (se pueden mantener como están, pero considera si requiresPlan necesita un índice diferente ahora que es un array)
// Mongoose puede indexar arrays. Si buscas VODs por un plan específico dentro del array, el índice actual podría seguir siendo útil.
videoSchema.index({ mainSection: 1, active: 1, requiresPlan: 1 });
videoSchema.index({ genres: 1, active: 1, requiresPlan: 1 });
videoSchema.index({ title: 'text', description: 'text' });
videoSchema.index({ tipo: 1, isFeatured: 1, active: 1, requiresPlan: 1 });

export default mongoose.model("Video", videoSchema);
