import mongoose from 'mongoose';

const { Schema } = mongoose;

const CapituloSchema = new Schema({
  titulo: { type: String, required: true },
  numero: { type: Number, required: true },
  video: { type: String, required: true },
  serie: { type: Schema.Types.ObjectId, ref: 'Serie', required: true },
}, {
  timestamps: true
});

const Capitulo = mongoose.model('Capitulo', CapituloSchema);
export default Capitulo;
