import express from 'express';
import Capitulo from '../models/Capitulo.js';
import Serie from '../models/Serie.js';

const router = express.Router();

// Crear nuevo capítulo y asociarlo a una serie
router.post('/', async (req, res) => {
  try {
    const { titulo, numero, video, serieId } = req.body;

    if (!titulo || !numero || !video || !serieId) {
      return res.status(400).json({ message: 'Faltan campos obligatorios.' });
    }

    const capitulo = new Capitulo({ titulo, numero, video, serie: serieId });
    await capitulo.save();

    await Serie.findByIdAndUpdate(serieId, {
      $push: { capitulos: capitulo._id },
    });

    res.status(201).json(capitulo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear el capítulo.' });
  }
});

// Obtener capítulos por ID de serie (opcional)
router.get('/serie/:serieId', async (req, res) => {
  try {
    const { serieId } = req.params;
    const capitulos = await Capitulo.find({ serie: serieId }).sort({ numero: 1 });
    res.json(capitulos);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener capítulos.' });
  }
});

export default router;