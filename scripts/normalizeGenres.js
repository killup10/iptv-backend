import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

// --- CONFIGURACIÓN ---
// Mapeo mejorado para corregir acentos y unificar géneros en español.
const correctionMap = {
    'accion': 'Acción',
    'action': 'Acción', // Unificar inglés y español
    'adventure': 'Aventura', // Unificar inglés y español
    'aventura': 'Aventura',
    'animacion': 'Animación',
    'animation': 'Animación', // Unificar
    'ciencia ficcion': 'Ciencia Ficción',
    'science fiction': 'Ciencia Ficción', // Unificar
    'comedia': 'Comedia',
    'comedy': 'Comedia', // Unificar
    'crimen': 'Crimen',
    'crime': 'Crimen', // Unificar
    'documental': 'Documental',
    'documentary': 'Documental', // Unificar
    'drama': 'Drama',
    'familia': 'Familia',
    'family': 'Familia', // Unificar
    'fantasia': 'Fantasía',
    'fantasy': 'Fantasía', // Unificar
    'historia': 'Historia',
    'history': 'Historia', // Unificar
    'terror': 'Terror',
    'horror': 'Terror', // Unificar
    'musica': 'Música',
    'music': 'Música', // Unificar
    'misterio': 'Misterio',
    'mystery': 'Misterio', // Unificar
    'romance': 'Romance',
    'suspenso': 'Suspenso',
    'suspense': 'Suspenso', // Unificar
    'thriller': 'Thriller',
    'guerra': 'Guerra',
    'war': 'Guerra', // Unificar
    'belico': 'Bélico',
    'pelicula de tv': 'Película de TV',
    'tv movie': 'Película de TV', // Unificar
    'western': 'Western', // Estandarizar
};

// --- FUNCIÓN DE NORMALIZACIÓN ---
function normalizeGenre(genre) {
    if (typeof genre !== 'string' || !genre.trim()) {
        return null;
    }
    // 1. Limpiar y convertir a minúsculas
    let cleanedGenre = genre.trim().toLowerCase();

    // 2. Aplicar correcciones del mapa
    if (correctionMap[cleanedGenre]) {
        return correctionMap[cleanedGenre];
    }

    // 3. Si no está en el mapa, simplemente capitalizar la primera letra
    return cleanedGenre.charAt(0).toUpperCase() + cleanedGenre.slice(1);
}

// --- SCRIPT PRINCIPAL ---
async function runNormalization() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error("Error: La variable de entorno MONGODB_URI no está definida.");
        return;
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const database = client.db('teamg_db'); 
        const videos = database.collection('videos');

        console.log("✅ Conectado a la base de datos. Obteniendo videos...");

        const allVideos = await videos.find({}).toArray();
        console.log(`🔎 Encontrados ${allVideos.length} documentos para procesar.`);

        const bulkOperations = [];

        for (const video of allVideos) {
            let needsUpdate = false;
            const updateFields = {};

            // Normalizar el campo 'categoria' (si existe y es un string)
            if (video.categoria && typeof video.categoria === 'string') {
                const normalizedCategoria = normalizeGenre(video.categoria);
                if (normalizedCategoria && normalizedCategoria !== video.categoria) {
                    updateFields.categoria = normalizedCategoria;
                    needsUpdate = true;
                }
            }
            
            // Normalizar el array 'genres' (si existe y es un array)
            if (Array.isArray(video.genres) && video.genres.length > 0) {
                const normalizedGenres = video.genres
                    .map(normalizeGenre) // Normaliza cada género
                    .filter(g => g !== null); // Elimina nulos o vacíos

                // Eliminar duplicados
                const uniqueNormalizedGenres = [...new Set(normalizedGenres)];

                // Comprobar si hubo cambios reales en el array
                if (JSON.stringify(uniqueNormalizedGenres) !== JSON.stringify(video.genres)) {
                    updateFields.genres = uniqueNormalizedGenres;
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                bulkOperations.push({
                    updateOne: {
                        filter: { _id: video._id },
                        update: { $set: updateFields }
                    }
                });
            }
        }

        if (bulkOperations.length > 0) {
            console.log(`🚀 Preparando para actualizar ${bulkOperations.length} documentos...`);
            const result = await videos.bulkWrite(bulkOperations);
            console.log(`✅ ¡Éxito! Documentos actualizados: ${result.modifiedCount}`);
        } else {
            console.log("👍 No se encontraron documentos que necesiten actualización. ¡Tus géneros ya están limpios!");
        }

    } catch (err) {
        console.error("❌ Ocurrió un error durante el proceso:", err);
    } finally {
        await client.close();
        console.log("🚪 Conexión a la base de datos cerrada.");
    }
}

runNormalization();

