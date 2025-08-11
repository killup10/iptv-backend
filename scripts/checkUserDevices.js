import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Device from '../models/Device.js';

// Cargar variables de entorno
dotenv.config();

const checkUserDevices = async () => {
  const dbURI = process.env.MONGO_URI;
  if (!dbURI) {
    console.error('Error: La variable de entorno MONGO_URI no está definida.');
    process.exit(1);
  }

  try {
    // Conectar a la base de datos
    await mongoose.connect(dbURI);
    console.log('✅ Conectado a MongoDB para verificación.');

    // Obtener todos los usuarios
    const users = await User.find({}).select('username plan role isActive expiresAt');
    console.log('\n--- USUARIOS EN EL SISTEMA ---');
    console.log(`Total de usuarios: ${users.length}`);
    
    for (const user of users) {
      console.log(`\n👤 Usuario: ${user.username}`);
      console.log(`   - ID: ${user._id}`);
      console.log(`   - Plan: ${user.plan}`);
      console.log(`   - Rol: ${user.role}`);
      console.log(`   - Activo: ${user.isActive}`);
      console.log(`   - Expira: ${user.expiresAt || 'Sin expiración'}`);
      
      // Buscar dispositivos para este usuario
      const devices = await Device.find({ userId: user._id });
      console.log(`   - Dispositivos registrados: ${devices.length}`);
      
      if (devices.length > 0) {
        devices.forEach((device, index) => {
          console.log(`     📱 Dispositivo ${index + 1}:`);
          console.log(`        - ID: ${device.deviceId}`);
          console.log(`        - Activo: ${device.isActive}`);
          console.log(`        - Última conexión: ${device.lastSeen}`);
          console.log(`        - Tipo: ${device.deviceType}`);
          console.log(`        - Navegador: ${device.browser}`);
        });
      } else {
        console.log('     ⚠️  Sin dispositivos registrados');
      }
    }

    // Estadísticas generales
    const activeUsers = users.filter(u => u.isActive).length;
    const totalDevices = await Device.countDocuments();
    const activeDevices = await Device.countDocuments({ isActive: true });
    
    console.log('\n--- ESTADÍSTICAS ---');
    console.log(`Usuarios activos: ${activeUsers}/${users.length}`);
    console.log(`Dispositivos totales: ${totalDevices}`);
    console.log(`Dispositivos activos: ${activeDevices}`);

  } catch (error) {
    console.error('❌ Error durante la verificación:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB.');
  }
};

// Ejecutar el script
checkUserDevices();
