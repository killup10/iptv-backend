// iptv-backend/models/Collection.js
import mongoose from "mongoose";

const collectionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "El nombre de la colección es requerido."],
    trim: true,
    unique: true
  },
  items: [{
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'itemsModel'
  }],
  itemsModel: {
    type: String,
    required: true,
    enum: ['Video', 'Serie']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

collectionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

collectionSchema.index({ name: 1 });

export default mongoose.model('Collection', collectionSchema);
