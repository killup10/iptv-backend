import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  isActive: { type: Boolean, default: false },
  expiresAt: { type: Date, default: null },
  deviceId: { type: String, default: null },
  role: { type: String, enum: ["admin", "user"], default: "user" }
}, {
  timestamps: true
});

export default mongoose.model("User", userSchema);