const app = require('./app');
const env = require('./config/env');
require('./config/db');

app.listen(env.port, () => {
  console.log(`[SERVER] CanchaYa API escuchando en http://localhost:${env.port}`);
});
