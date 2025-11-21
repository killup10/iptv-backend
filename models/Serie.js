// ✅ Versión ES Modules para Serie.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const SerieSchema = new Schema({
  nombre: { type: String, required: true },
  descripcion: String,
  imagen: String,
  // imagen personalizada subida por admin que debe sobreescribir la imagen TMDB
  customThumbnail: String,
  capitulos: [{ type: Schema.Types.ObjectId, ref: 'Capitulo' }],
  newEpisodes: { type: Boolean, default: false },
});

const Serie = mongoose.model('Serie', SerieSchema);
export default Serie;
