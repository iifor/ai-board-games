import express from 'express';
import path from 'path';
import { getDb, initializeDb } from './db';
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
import { authRouter, authMiddleware, seedAdminUser } from './modules/auth';
import { readAuthConfig } from './modules/auth/config';
import type { AdminBootstrapConfig } from './modules/auth/config';

// Game module
import * as gameSocket from './modules/game-socket';

async function seedData(admin: AdminBootstrapConfig | null): Promise<void> {
  const db = getDb();
  if (await tableIsEmpty(db, 'skins')) {
    await skins.importMarkdownSkins();
  }
  if (await tableIsEmpty(db, 'players')) {
    await players.seedPlayers();
  }
  if (await tableIsEmpty(db, 'models')) {
    const { DEFAULT_MODELS } = require('./db/seed');
    for (const model of DEFAULT_MODELS) await models.createModel(model);
  }
  if (await tableIsEmpty(db, 'voice_packages')) {
    await voices.seedVoicePackages();
  }
  await voices.seedMissingAzureVoices();
  await voices.seedMissingMimoVoices();
  const { DEFAULT_WEREWOLF_ROLES, DEFAULT_WEREWOLF_MODES } = require('./db/seed');
  for (const role of DEFAULT_WEREWOLF_ROLES) await werewolfConfig.upsertWerewolfRole(role);
  for (const mode of DEFAULT_WEREWOLF_MODES) await werewolfConfig.upsertWerewolfMode(mode);
  await seedAdminUser(admin);
}

async function tableIsEmpty(db: ReturnType<typeof getDb>, table: string): Promise<boolean> {
  const row = await db.queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
  return Number(row?.count || 0) === 0;
}

async function createApp(): Promise<express.Application> {
  await initializeDb();
  const authConfig = readAuthConfig();
  const app = express();
  app.set('trust proxy', 1);
  const clientDistDir = path.join(__dirname, '..', '..', 'dist', 'client');
  const adminDistDir = path.join(__dirname, '..', '..', 'dist', 'admin');

  registerDebateWorkflow();
  await seedData(authConfig.admin);
  workflowEngine.initializeWorkflowMaintenance();

  app.use(express.json({ limit: '8mb' }));
  app.use(responseFormatter);

  // Auth routes (public — no auth required)
  app.use('/api/admin/auth', authRouter);

  // Admin API routes (protected by JWT auth)
  app.use('/api/admin', authMiddleware, upload.router);
  app.use('/api/admin', authMiddleware, skins.router);
  app.use('/api/admin', authMiddleware, players.router);
  app.use('/api/admin', authMiddleware, modelProviders.router);
  app.use('/api/admin', authMiddleware, models.router);
  app.use('/api/admin', authMiddleware, voices.router);
  app.use('/api/admin', authMiddleware, werewolfConfig.router);
  app.use('/api/admin', authMiddleware, games.router);
  app.use('/api/admin', authMiddleware, settings.router);
  app.use('/api/admin', authMiddleware, observability.router);
  app.use('/api/admin', authMiddleware, workflowEngine.router);
  app.use('/api/admin', authMiddleware, playerMemory.router);

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
