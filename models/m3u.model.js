// models/m3u.model.js
import mongoose from "mongoose";

const m3uSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  type: { type: String, enum: ['tv', 'movies', 'series'], required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isSpecialEvent: { type: Boolean, default: false },
  specialEventName: { type: String },
  specialEventActive: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model("M3u", m3uSchema);