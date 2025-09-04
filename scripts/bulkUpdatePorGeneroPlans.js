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
 * Script para actualizar masivamente los planes de las películas en la sección 'POR_GENERO'.
 * Asigna los planes ['estandar', 'sports', 'cinefilo', 'premium'] a todas las películas
 * que cumplan con los criterios.
 */
async function bulkUpdatePlans() {
    try {
        // Conectar a la base de datos
        await mongoose.connect(MONGODB_URI);
        console.log('Conectado exitosamente a MongoDB.');

        // Definir el filtro para los documentos a actualizar
        const filter = {
            tipo: 'pelicula',
            mainSection: 'POR_GENERO'
        };

        // Definir la actualización a realizar
        const update = {
            $set: { requiresPlan: ['estandar', 'sports', 'cinefilo', 'premium'] }
        };

        console.log('Buscando películas en "POR_GENERO" para actualizar planes...');

        // Ejecutar la actualización masiva
        const result = await mongoose.connection.collection('videos').updateMany(filter, update);

        // Informar los resultados
        console.log(`Operación completada.`);
        console.log(`- Documentos que coinciden con el filtro: ${result.matchedCount}`);
        console.log(`- Documentos actualizados exitosamente: ${result.modifiedCount}`);

        if (result.upsertedCount > 0) {
            console.log(`- Documentos insertados: ${result.upsertedCount}`);
        }

    } catch (error) {
        console.error('Ocurrió un error durante el proceso:', error);
    } finally {
        // Asegurarse de que la conexión se cierre
        await mongoose.disconnect();
        console.log('Desconectado de MongoDB.');
    }
}

// Ejecutar la función principal del script
bulkUpdatePlans();
