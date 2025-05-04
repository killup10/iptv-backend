// models/Video.js
import mongoose from "mongoose";

const videoSchema = new mongoose.Schema({
  title: { type: String },
  logo: { type: String },
  group: { type: String },
  url: { type: String },
  tipo: { type: String, default: "canal" }, // canal, pelicula, serie
  thumbnail: { type: String }, // Para VODs o placeholder
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Video", videoSchema);
