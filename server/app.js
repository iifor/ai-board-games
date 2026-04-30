const express = require('express');
const path = require('path');
const adminRoutes = require('./routes/adminRoutes');
const gameRoutes = require('./routes/gameRoutes');
const { initAdminData } = require('./adminStore');

function createApp() {
  const app = express();
  const clientDistDir = path.join(__dirname, '..', 'dist', 'client');
  const adminDistDir = path.join(__dirname, '..', 'dist', 'admin');

  initAdminData();

  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use('/api', gameRoutes);
  app.use('/admin', express.static(adminDistDir));
  app.use(express.static(clientDistDir));

  app.get('/admin/*', (request, response, next) => {
    response.sendFile(path.join(adminDistDir, 'index.html'), (error) => {
      if (error) next();
    });
  });

  app.get('*', (request, response, next) => {
    if (request.path.startsWith('/api')) {
      response.status(404).json({ error: 'API route not found' });
      return;
    }

    response.sendFile(path.join(clientDistDir, 'index.html'), (error) => {
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
