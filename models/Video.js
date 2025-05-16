// iptv-backend/models/Video.js
import mongoose from "mongoose";

const videoSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true },
  url: { type: String, required: true, trim: true },
  tipo: { // 'pelicula' o 'serie'.
    type: String, 
    required: true,
    enum: ["pelicula", "serie"] 
  },
  mainSection: { // Sección principal a la que pertenece
    type: String,
    trim: true,
    enum: [ // Valores actualizados según tus últimas indicaciones
        "POR_GENERO",       // Usado como agrupador principal o default
        "ESPECIALES",       // Para contenido temático, plan básico
        "CINE_2025",        // Estrenos recientes, plan premium/cinéfilo
        "CINE_4K",          // Plan premium/cinéfilo
        "CINE_60FPS"        // Plan premium/cinéfilo
    ],
    default: "POR_GENERO", // Default si no se especifica o para contenido general por género
    index: true
  },
  genres: [{ // Array de géneros (ej. ["Acción", "Aventura", "Sci-Fi"])
    type: String,
    trim: true,
  }],
  requiresPlan: { // Plan mínimo requerido para ver este contenido
    type: String,
    enum: ['basico', 'premium', 'cinefilo'], // Tus niveles de plan
    default: 'basico', // Por defecto, el contenido es básico a menos que se especifique lo contrario
    index: true
  },
  releaseYear: { type: Number },
  isFeatured: { type: Boolean, default: false }, // Para la sección "Destacados" en Home
  active: { type: Boolean, default: true }, // Para activar/desactivar VOD

  logo: { type: String, default: '' }, // Thumbnail/poster principal
  customThumbnail: { type: String, default: '' },
  tmdbThumbnail: { type: String, default: '' },
  
  trailerUrl: { type: String, default: '', trim: true },

  // user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Quién lo subió (admin)
}, { 
  timestamps: true // Maneja createdAt y updatedAt automáticamente
});

// Índices
videoSchema.index({ mainSection: 1, active: 1, requiresPlan: 1 });
videoSchema.index({ genres: 1, active: 1, requiresPlan: 1 }); // Añadido requiresPlan aquí también
videoSchema.index({ title: 'text', description: 'text' }); // Para búsqueda de texto
videoSchema.index({ tipo: 1, isFeatured: 1, active: 1, requiresPlan: 1 }); // Para destacados

export default mongoose.model("Video", videoSchema);
