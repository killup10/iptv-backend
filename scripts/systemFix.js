import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const systemFix = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado a MongoDB.');

    // 1. Actualizar TODOS los usuarios para que tengan configuración robusta
    const updateResult = await User.updateMany(
      {}, // Todos los usuarios
      {
        $set: {
          isActive: true, // Activar todos los usuarios
          maxDevices: 10, // Aumentar límite de dispositivos
          // Inicializar sistema de prueba gratuita
          'dailyTrialUsage.date': null,
          'dailyTrialUsage.minutesUsed': 0,
          'dailyTrialUsage.maxMinutesPerDay': 60
        }
      }
    );

    console.log(`✅ ${updateResult.modifiedCount} usuarios actualizados con configuración robusta.`);

    // 2. Migrar usuarios con plan 'basico' a 'gplay'
    const migrationResult = await User.updateMany(
      { plan: 'basico' },
      { $set: { plan: 'gplay' } }
    );

    console.log(`✅ ${migrationResult.modifiedCount} usuarios migrados de 'basico' a 'gplay'.`);

    // 3. Mostrar estadísticas finales
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const planDistribution = await User.aggregate([
      { $group: { _id: '$plan', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    console.log('\n🎯 SISTEMA COMPLETAMENTE REPARADO:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━Parece que el archivo `systemFix.js` tiene problemas para ser editado con un diff. Para resolver esto, voy a reemplazar el archivo completo con el contenido corregido.

<create_file>
<path>iptv-backend/scripts/systemFix.js</path>
<content>
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const systemFix = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado a MongoDB.');

    // 1. Actualizar TODOS los usuarios para que tengan configuración robusta
    const updateResult = await User.updateMany(
      {}, // Todos los usuarios
      {
        $set: {
          isActive: true, // Activar todos los usuarios
          maxDevices: 10, // Aumentar límite de dispositivos
          // Inicializar sistema de prueba gratuita
          'dailyTrialUsage.date': null,
          'dailyTrialUsage.minutesUsed': 0,
          'dailyTrialUsage.maxMinutesPerDay': 60
        }
      }
    );

    console.log(`✅ ${updateResult.modifiedCount} usuarios actualizados con configuración robusta.`);

    // 2. Migrar usuarios con plan 'basico' a 'gplay'
    const migrationResult = await User.updateMany(
      { plan: 'basico' },
      { $set: { plan: 'gplay' } }
    );

    console.log(`✅ ${migrationResult.modifiedCount} usuarios migrados de 'basico' a 'gplay'.`);

    // 3. Mostrar estadísticas finales
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const planDistribution = await User.aggregate([
      { $group: { _id: '$plan', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    console.log('\n🎯 SISTEMA COMPLETAMENTE REPARADO:');
    console.log('Total usuarios:', totalUsers);
    console.log('Usuarios activos:', activeUsers);
    console.log('Distribución de planes:', planDistribution);

  } catch (error) {
    console.error('Error en systemFix:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB.');
  }
};

systemFix();
