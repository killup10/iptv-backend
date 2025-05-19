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
    index: true // Índice individual para mainSection
  },
  genres: [{ // Array de géneros
    type: String,
    trim: true,
  }],
  requiresPlan: [{ // Array de Strings para planes
    type: String,
    trim: true,
    enum: ["gplay", "estandar", "cinefilo", "sports", "premium"],
  }],
  releaseYear: { type: Number },
  isFeatured: { type: Boolean, default: false, index: true }, // Índice individual para isFeatured
  active: { type: Boolean, default: true, index: true },     // Índice individual para active

  logo: { type: String, default: '' },
  customThumbnail: { type: String, default: '' },
  tmdbThumbnail: { type: String, default: '' },
  
  trailerUrl: { type: String, default: '', trim: true },
  // user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { 
  timestamps: true
});

// --- Índices Corregidos ---
// Índice de texto para búsquedas
videoSchema.index({ title: 'text', description: 'text' });

// Índices para consultas comunes, evitando "parallel arrays"

// Si necesitas buscar por 'requiresPlan' frecuentemente (MongoDB puede indexar arrays)
videoSchema.index({ requiresPlan: 1 }); 

// Si necesitas buscar por 'genres' frecuentemente (MongoDB puede indexar arrays)
videoSchema.index({ genres: 1 });

// Índice para VODs activos de un tipo específico (útil para listados de usuarios)
videoSchema.index({ tipo: 1, active: 1 });

// Índice para contenido destacado (ya tienes índices individuales en isFeatured y active)
// Podrías tener uno compuesto si filtras por tipo Y destacado Y activo frecuentemente:
videoSchema.index({ tipo: 1, isFeatured: 1, active: 1 });

// Considera qué combinaciones son más frecuentes en tus consultas.
// El índice original que causaba problemas era:
// videoSchema.index({ genres: 1, active: 1, requiresPlan: 1 }); // <--- ELIMINADO O MODIFICADO
// Si necesitas esta combinación, podrías hacer dos índices separados o elegir uno de los arrays:
// videoSchema.index({ genres: 1, active: 1 });
// videoSchema.index({ requiresPlan: 1, active: 1 });

// El otro índice que podría ser problemático si otros campos fueran arrays:
// videoSchema.index({ tipo: 1, isFeatured: 1, active: 1, requiresPlan: 1 });
// Lo mantenemos como está arriba (tipo, isFeatured, active) y tenemos un índice separado para requiresPlan.

export default mongoose.model("Video", videoSchema);
