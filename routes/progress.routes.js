import express from 'express';
import { getProgress, updateProgress } from '../controllers/progress.controller.js';
import { verifyToken } from '../middlewares/verifyToken.js';

const router = express.Router();

// Ruta para obtener el progreso del usuario
router.get('/', verifyToken, getProgress);

// Ruta para actualizar el progreso
router.post('/', verifyToken, updateProgress);

// Ruta para obtener el progreso específico
router.get('/:videoId', verifyToken, async (req, res) => {
  try {
    const progress = await UserProgress.findOne({ 
      user: req.user.id, 
      video: req.params.videoId 
    });
    res.json(progress || { progress: 0 });
  } catch (error) {
    res.status(500).json({ message: 'Error getting video progress', error });
  }
});

export default router;
