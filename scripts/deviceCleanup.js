// scripts/deviceCleanup.js - Script para limpieza automática de dispositivos

import mongoose from 'mongoose';
import Device from '../models/Device.js';
import { cleanupInactiveDevices, forceLogoutStaleDevices } from '../controllers/auth.controller.js';

// Configuración de la base de datos
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/iptv-app';
    await mongoose.connect(mongoURI);
    console.log('✅ Conectado a MongoDB para limpieza de dispositivos');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error);
    process.exit(1);
  }
};

// Función principal de limpieza
const runDeviceCleanup = async () => {
  try {
    console.log('🧹 Iniciando limpieza de dispositivos...');
    
    // 1. Desactivar dispositivos obsoletos (más de 7 días sin actividad)
    console.log('📱 Desactivando dispositivos obsoletos...');
    const staleCount = await Device.deactivateStale(7);
    console.log(`✅ ${staleCount} dispositivos obsoletos desactivados`);
    
    // 2. Eliminar dispositivos inactivos antiguos (más de 30 días)
    console.log('🗑️ Eliminando dispositivos inactivos antiguos...');
    const cleanupResult = await Device.cleanupInactive(30);
    console.log(`✅ ${cleanupResult.deletedCount} dispositivos inactivos eliminados`);
    
    // 3. Estadísticas finales
    const totalDevices = await Device.countDocuments();
    const activeDevices = await Device.countDocuments({ isActive: true });
    const inactiveDevices = await Device.countDocuments({ isActive: false });
    
    console.log('\n📊 Estadísticas después de la limpieza:');
    console.log(`   Total de dispositivos: ${totalDevices}`);
    console.log(`   Dispositivos activos: ${activeDevices}`);
    console.log(`   Dispositivos inactivos: ${inactiveDevices}`);
    
    // 4. Dispositivos por usuario (top 5)
    const devicesByUser = await Device.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { username: '$user.username', count: 1 } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    
    if (devicesByUser.length > 0) {
      console.log('\n👥 Top usuarios con más dispositivos activos:');
      devicesByUser.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.username}: ${item.count} dispositivos`);
      });
    }
    
    console.log('\n✅ Limpieza de dispositivos completada exitosamente');
    
  } catch (error) {
    console.error('❌ Error durante la limpieza de dispositivos:', error);
    throw error;
  }
};

// Función para limpieza completa (usar con precaución)
const runFullCleanup = async () => {
  try {
    console.log('⚠️ INICIANDO LIMPIEZA COMPLETA DE DISPOSITIVOS...');
    console.log('⚠️ Esta operación eliminará TODOS los dispositivos inactivos');
    
    // Eliminar todos los dispositivos inactivos sin importar la fecha
    const result = await Device.deleteMany({ isActive: false });
    console.log(`✅ ${result.deletedCount} dispositivos inactivos eliminados`);
    
    // Desactivar dispositivos que no han sido vistos en 3 días
    const staleResult = await Device.deactivateStale(3);
    console.log(`✅ ${staleResult.modifiedCount} dispositivos obsoletos desactivados`);
    
    console.log('✅ Limpieza completa finalizada');
    
  } catch (error) {
    console.error('❌ Error durante la limpieza completa:', error);
    throw error;
  }
};

// Función para mostrar estadísticas sin limpiar
const showStats = async () => {
  try {
    console.log('📊 Estadísticas de dispositivos:');
    
    const totalDevices = await Device.countDocuments();
    const activeDevices = await Device.countDocuments({ isActive: true });
    const inactiveDevices = await Device.countDocuments({ isActive: false });
    
    // Dispositivos por fecha
    const last24h = new Date();
    last24h.setHours(last24h.getHours() - 24);
    const recent24h = await Device.countDocuments({ 
      isActive: true, 
      lastSeen: { $gte: last24h } 
    });
    
    const last7days = new Date();
    last7days.setDate(last7days.getDate() - 7);
    const recent7days = await Device.countDocuments({ 
      isActive: true, 
      lastSeen: { $gte: last7days } 
    });
    
    console.log(`\n📱 Total de dispositivos: ${totalDevices}`);
    console.log(`✅ Dispositivos activos: ${activeDevices}`);
    console.log(`❌ Dispositivos inactivos: ${inactiveDevices}`);
    console.log(`🕐 Activos en últimas 24h: ${recent24h}`);
    console.log(`📅 Activos en últimos 7 días: ${recent7days}`);
    
    // Dispositivos obsoletos (activos pero sin actividad reciente)
    const staleDevices = await Device.countDocuments({
      isActive: true,
      lastSeen: { $lt: last7days }
    });
    console.log(`⚠️ Dispositivos obsoletos (activos pero >7 días): ${staleDevices}`);
    
    // Dispositivos por tipo
    const deviceTypes = await Device.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$deviceType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    if (deviceTypes.length > 0) {
      console.log('\n📱 Dispositivos activos por tipo:');
      deviceTypes.forEach(type => {
        console.log(`   ${type._id || 'unknown'}: ${type.count}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas:', error);
    throw error;
  }
};

// Función principal
const main = async () => {
  await connectDB();
  
  const command = process.argv[2] || 'cleanup';
  
  try {
    switch (command) {
      case 'cleanup':
        await runDeviceCleanup();
        break;
      case 'full-cleanup':
        await runFullCleanup();
        break;
      case 'stats':
        await showStats();
        break;
      default:
        console.log('Comandos disponibles:');
        console.log('  cleanup      - Limpieza normal (por defecto)');
        console.log('  full-cleanup - Limpieza completa (¡CUIDADO!)');
        console.log('  stats        - Solo mostrar estadísticas');
        break;
    }
  } catch (error) {
    console.error('❌ Error ejecutando comando:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Conexión a MongoDB cerrada');
    process.exit(0);
  }
};

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { runDeviceCleanup, runFullCleanup, showStats };
