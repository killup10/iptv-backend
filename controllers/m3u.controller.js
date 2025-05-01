import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Subir archivo M3U
export const uploadM3U = async (req, res) => {
  try {
    const { fileName, content } = req.body;

    if (!fileName || !content) {
      return res.status(400).json({ error: 'Faltan datos: fileName o content' });
    }

    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const savePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(savePath, content, 'utf8');

    return res.status(200).json({ message: 'Archivo M3U subido correctamente' });
  } catch (error) {
    console.error('❌ Error al subir M3U:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Listar archivos M3U
export const listM3U = (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      return res.status(200).json({ files: [] });
    }

    const files = fs.readdirSync(uploadsDir).filter(file => file.endsWith('.m3u'));
    return res.status(200).json({ files });
  } catch (error) {
    console.error('❌ Error al listar M3U:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Ver contenido de un archivo M3U
export const getM3UContent = (req, res) => {
  try {
    const { fileName } = req.params;
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    const filePath = path.join(uploadsDir, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    return res.status(200).json({ fileName, content });
  } catch (error) {
    console.error('❌ Error al leer M3U:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
