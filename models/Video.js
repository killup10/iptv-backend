import mongoose from "mongoose";

const videoSchema = new mongoose.Schema({
  title: { type: String },
  logo: { type: String },
  group: { type: String },
  url: { type: String },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Video", videoSchema);
