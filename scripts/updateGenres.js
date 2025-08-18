import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
    console.error('No se encontró MONGODB_URI en las variables de entorno');
    process.exit(1);
}

async function updateMovies() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Conectado a MongoDB');

        // Actualizar todas las películas en POR_GENERO
        const result = await mongoose.connection.collection('videos').updateMany(
            { 
                mainSection: 'POR_GENERO',
                tipo: 'pelicula'
            },
            {
                $set: { requiresPlan: ['estandar', 'cinefilo', 'sports', 'premium'] },
                $map: {
                    input: "$genres",
                    as: "genre",
                    in: {
                        $switch: {
                            branches: [
                                { case: { $eq: ["$$genre", "ACCION"] }, then: "Acción" },
                                { case: { $eq: ["$$genre", "ACCIÓN"] }, then: "Acción" },
                                { case: { $eq: ["$$genre", "Accion"] }, then: "Acción" },
                                { case: { $eq: ["$$genre", "COMEDIA"] }, then: "Comedia" },
                                { case: { $eq: ["$$genre", "KIDS"] }, then: "Kids" },
                                { case: { $eq: ["$$genre", "FAMILIAR"] }, then: "Familiar" },
                                { case: { $eq: ["$$genre", "TERROR"] }, then: "Terror" },
                                { case: { $eq: ["$$genre", "SUSPENSO"] }, then: "Suspenso" },
                                { case: { $eq: ["$$genre", "Suspenso"] }, then: "Suspenso" }
                            ],
                            default: "$$genre"
                        }
                    }
                }
            }
        );

        console.log(`Documentos encontrados: ${result.matchedCount}`);
        console.log(`Documentos actualizados: ${result.modifiedCount}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Desconectado de MongoDB');
    }
}

updateMovies();
