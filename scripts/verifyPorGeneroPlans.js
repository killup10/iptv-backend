import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Cargar variables de entorno desde .env
dotenv.config();

// Obtener la URI de MongoDB desde las variables de entorno
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

// Verificar que la URI de MongoDB esté presente
if (!MONGODB_URI) {
    console.error('Error: No se encontró la variable de entorno MONGODB_URI.');
    process.exit(1);
}

/**
 * Script para verificar los planes de algunas películas en la sección 'POR_GENERO'.
 */
async function verifyPlans() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Conectado a MongoDB para verificación.');

        const filter = {
            tipo: 'pelicula',
            mainSection: 'POR_GENERO'
        };

        // Encontrar 5 documentos para verificar
        const sampleVideos = await mongoose.connection.collection('videos').find(filter).limit(5).toArray();

        if (sampleVideos.length === 0) {
            console.log('No se encontraron películas en "POR_GENERO" para verificar.');
        } else {
            console.log('Verificando una muestra de 5 películas:');
            sampleVideos.forEach(video => {
                console.log(`- Título: ${video.title}`);
                console.log(`  Planes: ${JSON.stringify(video.requiresPlan)}`);
                // Comprobar si los planes son los esperados
                const expectedPlans = ['estandar', 'sports', 'cinefilo', 'premium'];
                const isCorrect = video.requiresPlan &&
                                  video.requiresPlan.length === expectedPlans.length &&
                                  expectedPlans.every(p => video.requiresPlan.includes(p));
                console.log(`  ¿Planes correctos?: ${isCorrect ? 'Sí' : 'No'}`);
            });
        }

    } catch (error) {
        console.error('Ocurrió un error durante la verificación:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Desconectado de MongoDB.');
    }
}

verifyPlans();
