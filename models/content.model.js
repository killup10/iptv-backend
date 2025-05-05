import mongoose from "mongoose";

const contentSchema = new mongoose.Schema({
  title: String,
  url: String,
  type: { type: String, enum: ["movie", "series", "channel"], required: true }
}, { timestamps: true });

export default mongoose.model("Content", contentSchema);