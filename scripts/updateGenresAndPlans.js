import mongoose from 'mongoose';
import Video from '../models/Video.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const genreMapping = {
    'ACCION': 'Acción',
    'ACCIÓN': 'Acción',
    'Accion': 'Acción',
    'COMEDIA': 'Comedia',
    'KIDS': 'Kids',
    'FAMILIAR': 'Familiar',
    'TERROR': 'Terror',
    'SUSPENSO': 'Suspenso',
    'Suspenso': 'Suspenso'
};

async function updateGenresAndPlans() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error('MONGODB_URI no está definido en el archivo .env');
        }

        console.log('Conectando a MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('Conectado exitosamente a MongoDB');

        const videos = await Video.find({ 
            mainSection: 'POR_GENERO',
            tipo: 'pelicula'
        });

        console.log(`Encontradas ${videos.length} películas en POR_GENERO`);

        for (const video of videos) {
            const updatedGenres = video.genres.map(genre => {
                return genreMapping[genre] || genre;
            });

            const updatedPlans = ['estandar', 'cinefilo', 'sports', 'premium'];

            await Video.findByIdAndUpdate(video._id, {
                genres: updatedGenres,
                requiresPlan: updatedPlans
            });

            console.log(`Actualizado: ${video.title}`);
            console.log('Géneros antiguos:', video.genres);
            console.log('Géneros nuevos:', updatedGenres);
            console.log('Planes nuevos:', updatedPlans);
            console.log('---');
        }

        console.log('Actualización completada');
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

// Ejecutar la función
updateGenresAndPlans();
