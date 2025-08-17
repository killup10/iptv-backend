import UserProgress from '../models/UserProgress.js';

export const getProgress = async (req, res) => {
  try {
    const progress = await UserProgress.find({ user: req.user.id }).populate('video');
    res.json(progress);
  } catch (error) {
    res.status(500).json({ message: 'Error getting user progress', error });
  }
};

export const updateProgress = async (req, res) => {
  const { videoId, progress } = req.body;

  try {
    const updatedProgress = await UserProgress.findOneAndUpdate(
      { user: req.user.id, video: videoId },
      { progress, lastWatched: Date.now() },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json(updatedProgress);
  } catch (error) {
    res.status(500).json({ message: 'Error updating user progress', error });
  }
};
