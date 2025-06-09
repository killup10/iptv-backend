import path from 'path';
import fs from 'fs/promises';
import m3uProcessor from '../services/m3uProcessor.js';

class UploadController {
  /**
   * Maneja la subida masiva de archivos .m3u
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async handleBulkUpload(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          message: 'No se proporcionó ningún archivo' 
        });
      }

      if (!req.body.section) {
        return res.status(400).json({ 
          success: false, 
          message: 'No se especificó la sección' 
        });
      }

      // Validar la extensión del archivo
      const fileExt = path.extname(req.file.originalname).toLowerCase();
      if (fileExt !== '.m3u') {
        await fs.unlink(req.file.path); // Eliminar el archivo
        return res.status(400).json({ 
          success: false, 
          message: 'El archivo debe ser .m3u' 
        });
      }

      // Procesar el archivo
      const result = await m3uProcessor.processFile(req.file.path, req.body.section);

      // Eliminar el archivo temporal después de procesarlo
      await fs.unlink(req.file.path);

      // Enviar respuesta
      res.json({
        success: true,
        ...result,
        message: `Proceso completado: ${result.added} elementos añadidos, ${result.duplicates} duplicados encontrados, ${result.errors} errores`
      });

    } catch (error) {
      console.error('Error en handleBulkUpload:', error);

      // Intentar eliminar el archivo temporal si existe
      if (req.file && req.file.path) {
        try {
          await fs.unlink(req.file.path);
        } catch (unlinkError) {
          console.error('Error eliminando archivo temporal:', unlinkError);
        }
      }

      res.status(500).json({
        success: false,
        message: 'Error procesando el archivo',
        error: error.message
      });
    }
  }

  /**
   * Valida si una URL ya existe en la base de datos
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async checkDuplicate(req, res) {
    try {
      const { url } = req.query;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          message: 'No se proporcionó URL para verificar'
        });
      }

      const isDuplicate = await m3uProcessor.isDuplicate(url);
      
      res.json({
        success: true,
        isDuplicate
      });

    } catch (error) {
      console.error('Error en checkDuplicate:', error);
      res.status(500).json({
        success: false,
        message: 'Error verificando duplicado',
        error: error.message
      });
    }
  }
}

export const uploadController = new UploadController();
