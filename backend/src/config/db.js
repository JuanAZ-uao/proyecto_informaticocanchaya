const mongoose = require('mongoose');
const env = require('./env');

async function connectDB() {
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(env.mongodbUri);
    console.log(`[DB] Conectado a MongoDB (${mongoose.connection.name})`);
  } catch (error) {
    console.error('[DB] Error al conectar a MongoDB:', error.message);
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] Conexión a MongoDB perdida');
  });
}

module.exports = connectDB;
