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
    // index: true // Se puede definir un índice compuesto más específico abajo si es necesario
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

// --- ÍNDICES CORREGIDOS Y OPTIMIZADOS ---

// 1. Índice de texto para búsquedas por título y descripción
videoSchema.index({ title: 'text', description: 'text' });

// 2. Índices para campos de array (MongoDB crea índices multikey para estos)
videoSchema.index({ genres: 1 });        // Para buscar/filtrar por género
videoSchema.index({ requiresPlan: 1 }); // Para buscar/filtrar por plan requerido

// 3. Índices compuestos para consultas comunes (solo campos escalares o UN campo de array)

// Para filtrar VODs por tipo, estado de activación y si son destacados (Home y listados)
videoSchema.index({ tipo: 1, active: 1, isFeatured: 1 });

// Para filtrar por sección principal, tipo y estado de activación (útil para MoviesPage/SeriesPage)
videoSchema.index({ mainSection: 1, tipo: 1, active: 1 });

// El índice que causaba el error "cannot index parallel arrays [requiresPlan] [genres]"
// DEBE SER ELIMINADO o REEMPLAZADO por índices individuales o compuestos que no violen la regla.
// videoSchema.index({ genres: 1, active: 1, requiresPlan: 1 }); // <-- ELIMINADO

// El siguiente índice también podría ser problemático si se considera `requiresPlan` junto con otros arrays (aunque aquí no hay otro array explícito)
// MongoDB permite un solo campo de array en un índice compuesto.
// Si necesitas filtrar por `requiresPlan` junto con `active` y `tipo`:
videoSchema.index({ tipo: 1, active: 1, requiresPlan: 1 }); // Este debería ser válido (tipo y active son escalares)

// Si necesitas filtrar por `requiresPlan` junto con `active` y `mainSection`:
videoSchema.index({ mainSection: 1, active: 1, requiresPlan: 1 }); // Este debería ser válido

// Asegúrate de que no haya otros índices compuestos que intenten usar 'genres' y 'requiresPlan' juntos.

export default mongoose.model("Video", videoSchema);
