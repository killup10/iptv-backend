import UserProgress from '../models/UserProgress.js';
import Video from '../models/Video.js';
import mongoose from 'mongoose';
import { recordTrialUsage } from '../middlewares/trialAccess.js';

export const getProgress = async (req, res) => {
  try {
    const progress = await UserProgress.find({ user: req.user.id })
      .populate('video')
      .sort({ lastWatched: -1 })
      .limit(100);
    res.json(progress);
  } catch (error) {
    res.status(500).json({ message: 'Error getting user progress', error });
  }
};

export const updateProgress = async (req, res) => {
  // Debug: log incoming payload so we can see what the frontend sends
  try {
    console.log(`[POST /api/progress] user=${req.user?.id} payload=`, JSON.stringify(req.body));
  } catch (l) {}

  // Support both old shape { videoId, progress } and new shape { videoId, lastTime, lastSeason, lastChapter, completed }
  const { videoId } = req.body;
  const bodyProgress = req.body.progress;
  const lastTime = req.body.lastTime !== undefined ? Number(req.body.lastTime) : (typeof bodyProgress === 'number' ? bodyProgress : undefined);
  const lastSeason = req.body.lastSeason !== undefined ? Number(req.body.lastSeason) : undefined;
  const lastChapter = req.body.lastChapter !== undefined ? Number(req.body.lastChapter) : undefined;
  const completed = req.body.completed !== undefined ? Boolean(req.body.completed) : undefined;

  if (!videoId) return res.status(400).json({ message: 'videoId is required' });

  try {
    // Registrar uso de prueba
    if (req.user && lastTime !== undefined) {
      const existingProgress = await UserProgress.findOne({ user: req.user.id, video: videoId }).lean();
      if (existingProgress && existingProgress.lastTime !== undefined && lastTime > existingProgress.lastTime) {
        const secondsWatched = lastTime - existingProgress.lastTime;
        // No registrar saltos grandes (más de 5 minutos), probablemente el usuario adelantó el video
        if (secondsWatched > 0 && secondsWatched < 300) {
          const minutesWatched = secondsWatched / 60;
          await recordTrialUsage(req.user.id, minutesWatched);
        }
      }
    }

    const updateFields = { lastWatched: Date.now() };
    if (lastTime !== undefined) updateFields.lastTime = lastTime;
    if (lastSeason !== undefined) updateFields.lastSeason = lastSeason;
    if (lastChapter !== undefined) updateFields.lastChapter = lastChapter;
    if (completed !== undefined) updateFields.completed = completed;
    // Keep numeric progress for backward compatibility
    if (bodyProgress !== undefined && typeof bodyProgress === 'number') {
      updateFields.progress = bodyProgress;
    } else if (lastTime !== undefined) {
      // If frontend only sends lastTime, mirror it into `progress` so older code that
      // queries `progress` (e.g. getContinueWatching) still works.
      updateFields.progress = Number(lastTime);
    }

    const updatedProgress = await UserProgress.findOneAndUpdate(
      { user: req.user.id, video: videoId },
      { $set: updateFields },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).populate('video');

    // --- SINCRONIZAR hacia Video.watchProgress para cubrir frontends que usan ese endpoint ---
    try {
      const video = await Video.findById(videoId);
      if (video) {
        const userObjId = new mongoose.Types.ObjectId(req.user.id);
        const progressIndex = video.watchProgress.findIndex(p => p.userId.toString() === req.user.id);
        const now = new Date();
        if (progressIndex > -1) {
          video.watchProgress[progressIndex].lastTime = updateFields.lastTime ?? video.watchProgress[progressIndex].lastTime;
          if (updateFields.lastChapter !== undefined) video.watchProgress[progressIndex].lastChapter = updateFields.lastChapter;
          if (updateFields.lastSeason !== undefined) video.watchProgress[progressIndex].lastSeason = updateFields.lastSeason;
          if (updateFields.progress !== undefined) video.watchProgress[progressIndex].progress = updateFields.progress;
          if (updateFields.completed !== undefined) video.watchProgress[progressIndex].completed = updateFields.completed;
          video.watchProgress[progressIndex].lastWatched = updateFields.lastWatched || now;
        } else {
          const newProgress = {
            userId: userObjId,
            lastTime: updateFields.lastTime || 0,
            lastChapter: updateFields.lastChapter !== undefined ? updateFields.lastChapter : 0,
            lastSeason: updateFields.lastSeason !== undefined ? updateFields.lastSeason : 0,
            progress: updateFields.progress !== undefined ? updateFields.progress : (updateFields.lastTime || 0),
            completed: !!updateFields.completed,
            lastWatched: updateFields.lastWatched || now
          };
          video.watchProgress.push(newProgress);
        }
        // Save but don't fail the request if video save errors
        await video.save();
      }
    } catch (vErr) {
      console.warn('Advertencia al sincronizar Video.watchProgress desde updateProgress:', vErr?.message || vErr);
    }

    res.json(updatedProgress);
  } catch (error) {
    res.status(500).json({ message: 'Error updating user progress', error });
  }
};