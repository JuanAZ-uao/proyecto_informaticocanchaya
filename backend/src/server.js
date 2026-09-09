const app = require('./app');
const env = require('./config/env');
const connectDB = require('./config/db');

async function bootstrap() {
  await connectDB();

  app.listen(env.port, () => {
    console.log(`[SERVER] CanchaYa API escuchando en http://localhost:${env.port}`);
  });
}

bootstrap();
