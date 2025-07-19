import dotenv from 'dotenv';
import migrateMoviesToSeries from './migrateMoviesToSeries.js';

// Cargar variables de entorno
dotenv.config();

console.log('🔧 Script de migración de películas a series');
console.log('==========================================');
console.log('Este script convertirá automáticamente las películas individuales');
console.log('que siguen el formato "1x11 Título" en series agrupadas con capítulos.');
console.log('');

// Función para confirmar la ejecución
const confirmExecution = () => {
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('¿Estás seguro de que quieres ejecutar la migración? (sí/no): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'sí' || answer.toLowerCase() === 'si' || answer.toLowerCase() === 'yes');
    });
  });
};

const runMigration = async () => {
  try {
    console.log('⚠️  ADVERTENCIA: Esta operación modificará la base de datos');
    console.log('⚠️  Se recomienda hacer un backup antes de continuar');
    console.log('');
    
    const confirmed = await confirmExecution();
    
    if (!confirmed) {
      console.log('❌ Migración cancelada por el usuario');
      process.exit(0);
    }

    console.log('🚀 Iniciando migración...');
    await migrateMoviesToSeries();
    
    console.log('✅ Migración completada exitosamente');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    process.exit(1);
  }
};

runMigration();
