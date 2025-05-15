// iptv-backend/models/Video.js
import mongoose from "mongoose";

const videoSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true },
  url: { type: String, required: true, trim: true },
  tipo: { // 'pelicula' o 'serie'. 'canal' no debería estar aquí si tienes un modelo Channel.
    type: String, 
    required: true, // Hacerlo requerido para una lógica clara
    enum: ["pelicula", "serie"] 
  },
  
  // NUEVOS CAMPOS PARA CATEGORIZACIÓN AVANZADA
  mainSection: { // Sección principal a la que pertenece (ej. "CINE_2025", "CINE_4K", "ESTRENOS")
    type: String,
    trim: true,
    // Podrías definir un enum si tienes un conjunto fijo de secciones principales
    // enum: ["CINE_2025", "CINE_4K", "ESTRENOS_GENERALES", "CLASICOS", "POR_GENERO"],
    default: "ESTRENOS_GENERALES", // Un default genérico
    index: true
  },
  genres: [{ // Array de géneros (ej. ["Acción", "Aventura", "Sci-Fi"])
    type: String,
    trim: true,
  }],
  // El campo 'category' existente podría usarse como un género principal si no quieres un array,
  // o puedes renombrarlo/reutilizarlo. Por ahora, 'genres' es más flexible.
  // category: { type: String, default: 'general', trim: true }, 

  requiresPlan: { // Plan mínimo requerido para ver este contenido
    type: String,
    enum: ['basico', 'premium', 'cinefilo'], // Ajusta según tus nombres de planes
    default: 'basico',
    index: true
  },
  // --- FIN NUEVOS CAMPOS ---

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

// Índices compuestos pueden ser útiles
videoSchema.index({ mainSection: 1, active: 1, requiresPlan: 1 });
videoSchema.index({ genres: 1, active: 1 }); // Para búsquedas por género
videoSchema.index({ title: 'text', description: 'text' }); // Para búsqueda de texto

export default mongoose.model("Video", videoSchema);