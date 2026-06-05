import express from 'express';
import path from 'path';
import { getDb } from './db';
import { errorHandler } from './middlewares/errorHandler';
import { responseFormatter } from './middlewares/responseFormatter';
import * as upload from './modules/upload';

// Admin modules
import * as skins from './modules/skins';
import * as players from './modules/players';
import * as modelProviders from './modules/model-providers';
import * as models from './modules/models';
import * as voices from './modules/voices';
import * as werewolfConfig from './modules/werewolf-config';
import * as games from './modules/games';
import * as settings from './modules/settings';
import * as observability from './modules/observability';
import * as workflowEngine from './modules/workflow-engine';
import * as playerMemory from './modules/player-memory';
import { registerDebateWorkflow } from './modules/debate';

// Game module
import * as gameSocket from './modules/game-socket';

function seedData(): void {
  const db = getDb();
  if ((db.prepare('SELECT COUNT(*) AS count FROM skins').get() as { count: number }).count === 0) {
    skins.importMarkdownSkins();
  }
  if ((db.prepare('SELECT COUNT(*) AS count FROM players').get() as { count: number }).count === 0) {
    players.seedPlayers();
  }
  if ((db.prepare('SELECT COUNT(*) AS count FROM models').get() as { count: number }).count === 0) {
    const { DEFAULT_MODELS } = require('./db/seed');
    DEFAULT_MODELS.forEach((m: Record<string, unknown>) => models.createModel(m));
  }
  if ((db.prepare('SELECT COUNT(*) AS count FROM voice_packages').get() as { count: number }).count === 0) {
    voices.seedVoicePackages();
  }
  voices.seedMissingAzureVoices();
  voices.seedMissingMimoVoices();
  if ((db.prepare('SELECT COUNT(*) AS count FROM werewolf_roles').get() as { count: number }).count === 0) {
    const { DEFAULT_WEREWOLF_ROLES } = require('./db/seed');
    DEFAULT_WEREWOLF_ROLES.forEach((r: Record<string, unknown>) => werewolfConfig.upsertWerewolfRole(r));
  }
  if ((db.prepare('SELECT COUNT(*) AS count FROM werewolf_modes').get() as { count: number }).count === 0) {
    const { DEFAULT_WEREWOLF_MODES } = require('./db/seed');
    DEFAULT_WEREWOLF_MODES.forEach((m: Record<string, unknown>) => werewolfConfig.upsertWerewolfMode(m));
  }
}

function createApp(): express.Application {
  const app = express();
  const clientDistDir = path.join(__dirname, '..', '..', 'dist', 'client');
  const adminDistDir = path.join(__dirname, '..', '..', 'dist', 'admin');

  registerDebateWorkflow();
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
  app.use('/api/admin', workflowEngine.router);
  app.use('/api/admin', playerMemory.router);

  // Game API routes
  app.use('/api/toc', gameSocket.router);

  // Static files
  app.use('/avatars', express.static(path.join(__dirname, '..', '..', 'avatars')));
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

export { createApp };
