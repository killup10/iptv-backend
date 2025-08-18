import mongoose from 'mongoose';

const UserProgressSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  video: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video',
    required: true,
  },
  progress: {
    type: Number,
    required: true,
  },
  // lastTime keeps the raw seconds position reported by the player (frontend uses this)
  lastTime: {
    type: Number,
    default: 0,
  },
  lastSeason: {
    type: Number,
    default: 0,
  },
  lastChapter: {
    type: Number,
    default: 0,
  },
  completed: {
    type: Boolean,
    default: false,
  },
  lastWatched: {
    type: Date,
    default: Date.now,
  },
});

UserProgressSchema.index({ user: 1, video: 1 }, { unique: true });

export default mongoose.model('UserProgress', UserProgressSchema);
