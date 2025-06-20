// ✅ Versión ES Modules para Serie.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const SerieSchema = new Schema({
  nombre: { type: String, required: true },
  descripcion: String,
  imagen: String,
  capitulos: [{ type: Schema.Types.ObjectId, ref: 'Capitulo' }],
});

const Serie = mongoose.model('Serie', SerieSchema);
export default Serie;
