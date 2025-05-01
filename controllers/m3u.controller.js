// controllers/m3u.controller.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Para obtener la ruta del proyecto
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const uploadM3U = async (req, res) => {
  try {
    const { fileName, content } = req.body;

    if (!fileName || !content) {
      return res.status(400).json({ error: 'Faltan datos: fileName o content' });
    }

    // ① Asegurar que la carpeta uploads exista
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // ② Guardar el archivo dentro de uploads/
    const savePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(savePath, content, 'utf8');

    return res.status(200).json({ message: 'Archivo M3U subido correctamente' });
  } catch (error) {
    console.error('❌ Error al subir M3U:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
