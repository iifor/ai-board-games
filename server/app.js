const express = require('express');
const path = require('path');
const gameRoutes = require('./routes/gameRoutes');

function createApp() {
  const app = express();
  const distDir = path.join(__dirname, '..', 'dist');

  app.use(express.json());
  app.use('/api', gameRoutes);
  app.use(express.static(distDir));

  app.get('*', (request, response, next) => {
    if (request.path.startsWith('/api')) {
      response.status(404).json({ error: 'API route not found' });
      return;
    }

    response.sendFile(path.join(distDir, 'index.html'), (error) => {
      if (error) next();
    });
  });

  app.use((error, request, response, next) => {
    console.error(error);
    response.status(500).json({
      error: 'GAME_RUN_FAILED',
      message: error.message
    });
  });

  return app;
}

module.exports = {
  createApp
};
