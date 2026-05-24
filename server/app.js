const express = require('express');
const path = require('path');
const { getDb } = require('./db');
const { errorHandler } = require('./middlewares/errorHandler');
const { responseFormatter } = require('./middlewares/responseFormatter');
const upload = require('./modules/upload');

// Admin modules
const skins = require('./modules/skins');
const players = require('./modules/players');
const modelProviders = require('./modules/model-providers');
const models = require('./modules/models');
const voices = require('./modules/voices');
const werewolfConfig = require('./modules/werewolf-config');
const games = require('./modules/games');
const settings = require('./modules/settings');
const observability = require('./modules/observability');

// Game module
const gameSocket = require('./modules/game-socket');

function seedData() {
  const db = getDb();
  if (db.prepare('SELECT COUNT(*) AS count FROM skins').get().count === 0) {
    skins.importMarkdownSkins();
  }
  if (db.prepare('SELECT COUNT(*) AS count FROM players').get().count === 0) {
    players.seedPlayers();
  }
  if (db.prepare('SELECT COUNT(*) AS count FROM models').get().count === 0) {
    require('./db/seed').DEFAULT_MODELS.forEach((m) => models.createModel(m));
  }
  if (db.prepare('SELECT COUNT(*) AS count FROM voice_packages').get().count === 0) {
    voices.seedVoicePackages();
  }
  voices.seedMissingAzureVoices();
  if (db.prepare('SELECT COUNT(*) AS count FROM werewolf_roles').get().count === 0) {
    require('./db/seed').DEFAULT_WEREWOLF_ROLES.forEach((r) => werewolfConfig.upsertWerewolfRole(r));
  }
  if (db.prepare('SELECT COUNT(*) AS count FROM werewolf_modes').get().count === 0) {
    require('./db/seed').DEFAULT_WEREWOLF_MODES.forEach((m) => werewolfConfig.upsertWerewolfMode(m));
  }
}

function createApp() {
  const app = express();
  const clientDistDir = path.join(__dirname, '..', 'dist', 'client');
  const adminDistDir = path.join(__dirname, '..', 'dist', 'admin');

  seedData();

  app.use(express.json({ limit: '8mb' }));
  app.use(responseFormatter);

  // Admin API routes
  app.use('/api/admin', upload.router);
  app.use('/api/admin', skins.router);
  app.use('/api/admin', players.router);
  app.use('/api/admin', modelProviders.router);
  app.use('/api/admin', models.router);
  app.use('/api/admin', voices.router);
  app.use('/api/admin', werewolfConfig.router);
  app.use('/api/admin', games.router);
  app.use('/api/admin', settings.router);
  app.use('/api/admin', observability.router);

  // Game API routes
  app.use('/api/toc', gameSocket.router);

  // Static files
  app.use('/avatars', express.static(path.join(__dirname, '..', 'avatars')));
  app.use('/resources', express.static(upload.getResourceRoot()));
  app.use('/admin', express.static(adminDistDir));
  app.use(express.static(clientDistDir));

  // SPA fallback
  app.get('/admin/*', (request, response, next) => {
    response.sendFile(path.join(adminDistDir, 'index.html'), (error) => {
      if (error) next();
    });
  });

  app.get('*', (request, response, next) => {
    if (request.path.startsWith('/api')) {
      response.status(404).json({ code: 'NOT_FOUND', message: 'API 路由不存在' });
      return;
    }
    response.sendFile(path.join(clientDistDir, 'index.html'), (error) => {
      if (error) next();
    });
  });

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
