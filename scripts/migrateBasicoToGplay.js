import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js'; // Asegúrate de que la ruta al modelo User es correcta

// Cargar variables de entorno desde el archivo .env
dotenv.config();

const migrateUsers = async () => {
  const dbURI = process.env.MONGO_URI;
  if (!dbURI) {
    console.error('Error: La variable de entorno MONGO_URI no está definida.');
    process.exit(1);
  }

  try {
    // 1. Conectar a la base de datos
    await mongoose.connect(dbURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Conectado a MongoDB para la migración.');

    // 2. Definir el filtro y la actualización
    const filter = { plan: 'basico' };
    const update = { $set: { plan: 'gplay' } };

    // 3. Ejecutar la actualización masiva
    console.log("Buscando usuarios con el plan 'basico' para migrarlos a 'gplay'...");
    const result = await User.updateMany(filter, update);

    // 4. Mostrar resultados
    console.log('--- Resultados de la Migración ---');
    console.log(`🔎 Documentos encontrados que coincidían con el filtro: ${result.matchedCount}`);
    console.log(`🔄 Documentos modificados: ${result.modifiedCount}`);
    
    if (result.matchedCount === 0) {
      console.log('👍 No se encontraron usuarios con el plan "basico". No se necesita ninguna migración.');
    } else if (result.modifiedCount > 0) {
      console.log('🎉 ¡Migración completada exitosamente!');
    } else {
      console.log('🤔 Se encontraron usuarios, pero no se modificó ninguno. Puede que ya estuvieran correctos o hubo un problema.');
    }

  } catch (error) {
    console.error('❌ Error durante el proceso de migración:', error);
  } finally {
    // 5. Cerrar la conexión a la base de datos
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB.');
  }
};

// Ejecutar el script de migración
migrateUsers();
