import mongoose from "mongoose";

const videoSchema = new mongoose.Schema({
  titulo: { type: String },
  descripcion: { type: String },
  url: { type: String },
  tipo: { type: String, default: "movie" }, // canal, movie, serie
  thumbnail: { type: String },              // imagen de respaldo
  customThumbnail: { type: String },        // subida manual
  tmdbThumbnail: { type: String },          // generada con la API
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Video", videoSchema);
