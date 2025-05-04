import mongoose from "mongoose";

const m3uListSchema = new mongoose.Schema({
  fileName: String,
  content: String,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("M3UList", m3uListSchema);
