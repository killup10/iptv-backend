// models/Device.js
import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId: { type: String, required: true },
  userAgent: { type: String },
  ip: { type: String },
  lastSeen: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

deviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

export default mongoose.model('Device', deviceSchema);
