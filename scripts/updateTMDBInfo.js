import axios from 'axios';
import mongoose from 'mongoose';
import Video from '../models/Video.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

// Configurar __dirname en módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

async function searchTMDB(title) {
    if (!TMDB_API_KEY) {
        console.warn("⚠️ No hay TMDB_API_KEY definida en .env");
        return null;
    }

    try {
        const query = encodeURIComponent(title);
        const url = `${TMDB_BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&query=${query}&language=es-ES`;
        const response = await axios.get(url);
        const data = response.data;

        if (data?.results?.length) {
            const validItem = data.results.find(
                (item) =>
                    (item.media_type === "movie" || item.media_type === "tv") &&
                    (item.poster_path || item.backdrop_path)
            );

            return validItem || null;
        }
        return null;
    } catch (error) {
        console.error(`Error searching TMDB for ${title}:`, error.message);
        return null;
    }
}

async function updateVideoInfo() {
    try {
        // Usar MONGO_URI o MONGODB_URI
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error('No se encontró la URL de MongoDB en el archivo .env (buscar MONGO_URI o MONGODB_URI)');
        }
        if (!process.env.TMDB_API_KEY) {
            throw new Error('TMDB_API_KEY no está definido en el archivo .env');
        }

        console.log('Conectando a MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('Conectado exitosamente a MongoDB');

        const videos = await Video.find({ 
            $or: [
                { tmdbRating: { $exists: false } },
                { thumbnail: { $exists: false } },
                { thumbnail: '' }
            ]
        });

        console.log(`Found ${videos.length} videos to update`);

        for (const video of videos) {
            console.log(`Processing: ${video.title || video.name}`);
            
            const type = video.type === 'serie' ? 'tv' : 'movie';
            const tmdbData = await searchTMDB(video.title || video.name, type);

            if (tmdbData) {
                const updates = {};

                if (!video.thumbnail || video.thumbnail === '') {
                    updates.thumbnail = `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`;
                }

                if (!video.tmdbRating) {
                    updates.tmdbRating = tmdbData.vote_average;
                }

                if (!video.description || video.description === '') {
                    updates.description = tmdbData.overview;
                }

                if (Object.keys(updates).length > 0) {
                    await Video.findByIdAndUpdate(video._id, updates);
                    console.log(`Updated ${video.title || video.name} with:`, updates);
                }
            }
        }

        console.log('Update complete');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

// Ejecutar como una función async inmediatamente invocada
(async () => {
    try {
        await updateVideoInfo();
        console.log('Script finished successfully');
    } catch (error) {
        console.error('Script failed:', error);
        process.exit(1);
    }
    process.exit(0);
})();
