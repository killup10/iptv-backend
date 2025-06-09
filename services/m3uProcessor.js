import fs from 'fs';
import readline from 'readline';
import { promisify } from 'util';
import Content from '../models/content.model.js';

class M3UProcessor {
  constructor() {
    this.readFileAsync = promisify(fs.readFile);
  }

  /**
   * Procesa un archivo .m3u y extrae la información de los elementos
   * @param {string} filePath - Ruta del archivo .m3u
   * @returns {Promise<Array>} - Array de elementos encontrados
   */
  async parseM3UFile(filePath) {
    const items = [];
    let currentItem = null;

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (line.startsWith('#EXTINF:')) {
        // Extraer información del título y metadatos
        currentItem = this.parseExtInf(line);
      } else if (line.trim() && !line.startsWith('#') && currentItem) {
        // Esta es la URL del contenido
        currentItem.url = line.trim();
        items.push(currentItem);
        currentItem = null;
      }
    }

    return items;
  }

  /**
   * Parsea una línea #EXTINF y extrae la información
   * @param {string} line - Línea #EXTINF
   * @returns {Object} - Objeto con la información extraída
   */
  parseExtInf(line) {
    const item = {
      title: '',
      thumbnail: '',
      duration: 0,
      metadata: {}
    };

    // Extraer duración
    const durationMatch = line.match(/#EXTINF:(-?\d+)/);
    if (durationMatch) {
      item.duration = parseInt(durationMatch[1]);
    }

    // Extraer título y metadatos
    const metadataStr = line.substring(line.indexOf(',') + 1);
    item.title = metadataStr.trim();

    // Buscar thumbnail en tvg-logo si existe
    const logoMatch = line.match(/tvg-logo="([^"]+)"/);
    if (logoMatch) {
      item.thumbnail = logoMatch[1];
    }

    return item;
  }

  /**
   * Verifica si una URL ya existe en la base de datos
   * @param {string} url - URL a verificar
   * @returns {Promise<boolean>} - true si existe, false si no
   */
  async isDuplicate(url) {
    const count = await Content.countDocuments({ url });
    return count > 0;
  }

  /**
   * Procesa el archivo .m3u y añade los elementos a la base de datos
   * @param {string} filePath - Ruta del archivo .m3u
   * @param {string} section - Sección a la que pertenecen los elementos
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processFile(filePath, section) {
    const items = await this.parseM3UFile(filePath);
    const result = {
      added: 0,
      duplicates: 0,
      errors: 0
    };

    for (const item of items) {
      try {
        // Verificar si es un duplicado
        const isDuplicate = await this.isDuplicate(item.url);
        if (isDuplicate) {
          result.duplicates++;
          continue;
        }

        // Añadir a la base de datos
        await Content.create({
          ...item,
          section,
          createdAt: new Date(),
          updatedAt: new Date()
        });

        result.added++;
      } catch (error) {
        console.error('Error procesando item:', error);
        result.errors++;
      }
    }

    return result;
  }
}

export default new M3UProcessor();
