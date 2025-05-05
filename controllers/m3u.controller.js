import fs from 'fs/promises';
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
    if (!(await fs.stat(uploadsDir).catch(() => null))) {
      await fs.mkdir(uploadsDir, { recursive: true });
    }

    const savePath = path.join(uploadsDir, fileName);
    await fs.writeFile(savePath, content, 'utf8');

    return res.status(200).json({ message: 'Archivo M3U subido correctamente' });
  } catch (error) {
    console.error('❌ Error al subir M3U:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Listar archivos M3U
export const listM3U = async (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!(await fs.stat(uploadsDir).catch(() => null))) {
      return res.status(200).json({ files: [] });
    }

    const files = await fs.readdir(uploadsDir);
    const m3uFiles = files.filter(file => file.endsWith('.m3u'));
    return res.status(200).json({ files: m3uFiles });
  } catch (error) {
    console.error('❌ Error al listar M3U:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Ver contenido de un archivo M3U
export const getM3UContent = async (req, res) => {
  try {
    const { fileName } = req.params;
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    const filePath = path.join(uploadsDir, fileName);

    if (!(await fs.stat(filePath).catch(() => null))) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    if (!fileName.endsWith('.m3u')) {
      return res.status(400).json({ error: 'El archivo no es un M3U' });
    }

    const content = await fs.readFile(filePath, 'utf8');
    return res.status(200).json({ fileName, content });
  } catch (error) {
    console.error('❌ Error al leer M3U:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};