// models/Video.js
import mongoose from "mongoose";

const videoSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "" }, 
  url: { type: String, required: true, trim: true },
  tipo: { type: String, default: "pelicula", enum: ["pelicula", "serie", "canal"] },
  category: { type: String, default: 'general', trim: true }, // Buena práctica añadir trim
  releaseYear: { type: Number },
  isFeatured: { type: Boolean, default: false },
  
  logo: { type: String, default: '' }, 
  customThumbnail: { type: String, default: '' }, // Añadir default si es opcional
  tmdbThumbnail: { type: String, default: '' },   // Añadir default si es opcional
  
  trailerUrl: { type: String, default: '', trim: true }, // <--- NUEVO CAMPO AÑADIDO

  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

videoSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model("Video", videoSchema);