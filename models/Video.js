// models/Video.js
import mongoose from "mongoose";

const videoSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true }, // Cambiado de titulo y hecho requerido
  description: { type: String, default: "" },      // Cambiado de descripcion
  url: { type: String, required: true, trim: true },  // Hecho requerido
  tipo: { type: String, default: "pelicula", enum: ["pelicula", "serie", "canal"] }, // canal aquí si aún lo usas temporalmente
  category: { type: String, default: 'general' }, // Usaremos 'category' consistentemente en lugar de 'group'
  releaseYear: { type: Number },                 // Para filtrar por año
  isFeatured: { type: Boolean, default: false },  // Para marcar como destacado
  
  // Opciones de Thumbnail
  logo: { type: String, default: '' }, // Campo unificado para el logo/thumbnail principal que usará el frontend
  // Puedes mantener tus otros campos de thumbnail si tu lógica de backend los llena
  customThumbnail: { type: String }, 
  tmdbThumbnail: { type: String },   

  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Cambiado de 'usuario' a 'user' por consistencia
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Actualiza la fecha de modificación antes de guardar
videoSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model("Video", videoSchema);