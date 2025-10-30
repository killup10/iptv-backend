import { uploadM3U } from './m3u.controller.js';

class UploadController {
  /**
   * Maneja la subida masiva de archivos .m3u
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async handleBulkUpload(req, res) {
    // Redirigir la lógica al controlador m3u.controller.js que ya tiene la funcionalidad correcta
    return uploadM3U(req, res);
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

      // Esta parte puede necesitar ajustarse si el modelo de datos cambia, pero por ahora se mantiene
      // para no romper otras posibles funcionalidades.
      const Video = (await import('../models/Video.js')).default;
      const isDuplicate = await Video.findOne({ url: url });
      
      res.json({
        success: true,
        isDuplicate: !!isDuplicate
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
