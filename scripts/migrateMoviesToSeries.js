import mongoose from 'mongoose';
import Video from '../models/Video.js';

// Script para migrar películas individuales que son en realidad capítulos de series/animes
// a series agrupadas con temporadas y capítulos

const migrateMoviesToSeries = async () => {
  try {
    console.log('🚀 Iniciando migración de películas a series...');
    
    // Conectar a la base de datos
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/iptv-app');
    console.log('✅ Conectado a MongoDB');

    // Buscar todas las películas que parecen ser capítulos de series
    const movieChapters = await Video.find({
      tipo: 'pelicula',
      title: { $regex: /^\d+x\d+\s+/i } // Títulos que empiecen con formato "1x11 "
    });

    console.log(`📊 Encontradas ${movieChapters.length} entradas que parecen ser capítulos de series`);

    if (movieChapters.length === 0) {
      console.log('ℹ️ No se encontraron entradas para migrar');
      return;
    }

    // Función para extraer información del título
    const parseChapterInfo = (title) => {
      const match = title.match(/^(\d+)x(\d+)\s+(.+)$/i);
      if (match) {
        return {
          seasonNumber: parseInt(match[1], 10),
          episodeNumber: parseInt(match[2], 10),
          episodeTitle: match[3].trim()
        };
      }
      return null;
    };

    // Agrupar por serie (usando el primer género como nombre de serie)
    const seriesMap = new Map();

    for (const movie of movieChapters) {
      const chapterInfo = parseChapterInfo(movie.title);
      if (!chapterInfo) continue;

      // El nombre de la serie viene del primer género
      const seriesName = movie.genres && movie.genres.length > 0 ? movie.genres[0] : 'Serie Desconocida';
      
      if (!seriesMap.has(seriesName)) {
        seriesMap.set(seriesName, {
        seriesData: {
          title: seriesName,
          tipo: 'anime', // Clasificar como anime
          description: movie.description || '',
          releaseYear: movie.releaseYear,
          genres: movie.genres.slice(1), // Remover el nombre de la serie de los géneros
          active: movie.active,
          isFeatured: movie.isFeatured,
          mainSection: 'POR_GENERO',
          requiresPlan: movie.requiresPlan || ['gplay'],
          user: movie.user,
          logo: movie.logo,
          customThumbnail: movie.customThumbnail,
          tmdbThumbnail: movie.tmdbThumbnail,
          trailerUrl: movie.trailerUrl,
          seasons: []
        },
          chapters: [],
          movieIds: []
        });
      }

      const seriesEntry = seriesMap.get(seriesName);
      seriesEntry.chapters.push({
        ...chapterInfo,
        title: movie.title,
        url: movie.url,
        thumbnail: movie.logo || movie.customThumbnail || movie.tmdbThumbnail || '',
        duration: '0:00',
        description: movie.description || ''
      });
      seriesEntry.movieIds.push(movie._id);
    }

    console.log(`📺 Se crearán ${seriesMap.size} series a partir de los capítulos encontrados`);

    let migratedCount = 0;
    let deletedCount = 0;

    // Procesar cada serie
    for (const [seriesName, seriesEntry] of seriesMap) {
      console.log(`\n🔄 Procesando serie: "${seriesName}" con ${seriesEntry.chapters.length} capítulos`);

      // Agrupar capítulos por temporada
      const seasonMap = new Map();
      
      for (const chapter of seriesEntry.chapters) {
        if (!seasonMap.has(chapter.seasonNumber)) {
          seasonMap.set(chapter.seasonNumber, {
            seasonNumber: chapter.seasonNumber,
            title: `Temporada ${chapter.seasonNumber}`,
            chapters: []
          });
        }
        
        seasonMap.get(chapter.seasonNumber).chapters.push({
          title: `Capítulo ${chapter.episodeNumber} - ${chapter.episodeTitle}`,
          url: chapter.url,
          thumbnail: chapter.thumbnail,
          duration: chapter.duration,
          description: chapter.description
        });
      }

      // Ordenar temporadas y capítulos
      const seasons = Array.from(seasonMap.values()).sort((a, b) => a.seasonNumber - b.seasonNumber);
      seasons.forEach(season => {
        season.chapters.sort((a, b) => {
          const numA = parseInt(a.title.match(/Capítulo (\d+)/)?.[1] || '0', 10);
          const numB = parseInt(b.title.match(/Capítulo (\d+)/)?.[1] || '0', 10);
          return numA - numB;
        });
      });

      seriesEntry.seriesData.seasons = seasons;

      // Verificar si la serie ya existe
      const existingSeries = await Video.findOne({
        title: seriesName,
        tipo: 'anime'
      });

      if (existingSeries) {
        console.log(`⚠️ La serie "${seriesName}" ya existe. Actualizando capítulos...`);
        
        // Actualizar la serie existente con nuevos capítulos
        for (const newSeason of seasons) {
          let existingSeason = existingSeries.seasons.find(s => s.seasonNumber === newSeason.seasonNumber);
          
          if (existingSeason) {
            // Agregar capítulos que no existan
            const existingUrls = new Set(existingSeason.chapters.map(c => c.url));
            newSeason.chapters.forEach(newChapter => {
              if (!existingUrls.has(newChapter.url)) {
                existingSeason.chapters.push(newChapter);
              }
            });
          } else {
            // Agregar nueva temporada
            existingSeries.seasons.push(newSeason);
          }
        }
        
        // Ordenar temporadas y capítulos
        existingSeries.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
        existingSeries.seasons.forEach(season => {
          season.chapters.sort((a, b) => {
            const numA = parseInt(a.title.match(/Capítulo (\d+)/)?.[1] || '0', 10);
            const numB = parseInt(b.title.match(/Capítulo (\d+)/)?.[1] || '0', 10);
            return numA - numB;
          });
        });
        
        await existingSeries.save();
        console.log(`✅ Serie "${seriesName}" actualizada`);
      } else {
        // Crear nueva serie
        const newSeries = new Video(seriesEntry.seriesData);
        await newSeries.save();
        console.log(`✅ Nueva serie "${seriesName}" creada con ${seasons.length} temporadas`);
      }

      // Eliminar las películas individuales originales
      const deleteResult = await Video.deleteMany({
        _id: { $in: seriesEntry.movieIds }
      });
      
      deletedCount += deleteResult.deletedCount;
      migratedCount++;
      
      console.log(`🗑️ Eliminadas ${deleteResult.deletedCount} entradas de películas individuales`);
    }

    console.log('\n🎉 Migración completada!');
    console.log(`📊 Estadísticas:`);
    console.log(`   - Series creadas/actualizadas: ${migratedCount}`);
    console.log(`   - Películas individuales eliminadas: ${deletedCount}`);
    console.log(`   - Total de capítulos migrados: ${movieChapters.length}`);

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
  }
};

// Ejecutar el script si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateMoviesToSeries();
}

export default migrateMoviesToSeries;
