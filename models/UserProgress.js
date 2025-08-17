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
  lastWatched: {
    type: Date,
    default: Date.now,
  },
});

UserProgressSchema.index({ user: 1, video: 1 }, { unique: true });

export default mongoose.model('UserProgress', UserProgressSchema);
