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

  // Asignar un valor `order` por defecto al crear: si se provee, usarlo, si no, usar el número
  const order = req.body.order != null ? req.body.order : numero;
  const capitulo = new Capitulo({ titulo, numero, video, serie: serieId, order });
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
    // Ordenar por campo `order` cuando exista, si no, por `numero`
    const capitulos = await Capitulo.find({ serie: serieId }).sort({ order: 1, numero: 1 });
    res.json(capitulos);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener capítulos.' });
  }
});

// Reordenar varios capítulos en una sola llamada
// Body: [{ chapterId: '...', order: 1 }, ...]
router.put('/reorder', async (req, res) => {
  try {
    const updates = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ message: 'Se requiere un arreglo de actualizaciones.' });

    const bulkOps = updates.map(u => ({
      updateOne: {
        filter: { _id: u.chapterId },
        update: { $set: { order: u.order } }
      }
    }));

    if (bulkOps.length === 0) return res.status(400).json({ message: 'No hay operaciones para ejecutar.' });

    await Capitulo.bulkWrite(bulkOps);
    res.json({ message: 'Orden actualizado.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al reordenar capítulos.' });
  }
});

export default router;