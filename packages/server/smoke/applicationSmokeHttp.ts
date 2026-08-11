import crypto from 'node:crypto';
import http from 'node:http';
import type { ApplicationSmokeOwnership } from './applicationSmokeOwnership';

interface SmokeHttpResponse {
  status: number;
  body: Record<string, unknown>;
}

interface SkinCrudHooks {
  afterSkinCreate?(): void | Promise<void>;
  afterSkinResponse?(): void | Promise<void>;
  afterSkinUpdate?(): void | Promise<void>;
}

function md5(value: string): string {
  return crypto.createHash('md5').update(value).digest('hex');
}

async function requestJson(
  baseUrl: string,
  requestPath: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<SmokeHttpResponse> {
  const url = new URL(requestPath, baseUrl);
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const request = http.request(url, {
      method: options.method || 'GET',
      headers: {
        accept: 'application/json',
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer | string) => {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += value.length;
        if (size > 1024 * 1024) request.destroy(new Error('Smoke HTTP response exceeded limit'));
        else chunks.push(value);
      });
      response.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: response.statusCode || 0,
            body: raw ? JSON.parse(raw) as Record<string, unknown> : {},
          });
        } catch {
          reject(new Error(`Smoke HTTP response was not JSON for ${requestPath}`));
        }
      });
    });
    request.on('error', reject);
    request.end(payload);
  });
}

function requireStatus(response: SmokeHttpResponse, expected: number, step: string): void {
  if (response.status !== expected) {
    throw new Error(`${step} returned HTTP ${response.status}; expected ${expected}`);
  }
}

async function loginAndChangeInitialPassword(
  baseUrl: string,
  username: string,
  password: string,
): Promise<string> {
  const login = await requestJson(baseUrl, '/api/admin/auth/login', {
    method: 'POST', body: { username, password: md5(password) },
  });
  requireStatus(login, 200, 'Initial admin login');
  const loginData = login.body.data as Record<string, unknown> | undefined;
  if (loginData?.mustChangePassword !== true || typeof loginData.token !== 'string') {
    throw new Error('Initial admin login did not require a password change');
  }
  const blocked = await requestJson(baseUrl, '/api/admin/skins', { token: loginData.token });
  requireStatus(blocked, 403, 'Forced-change management guard');
  const changed = await requestJson(baseUrl, '/api/admin/auth/change-password', {
    method: 'POST', token: loginData.token, body: { password: md5(`${password}-changed`) },
  });
  requireStatus(changed, 200, 'Initial admin password change');
  const changedData = changed.body.data as Record<string, unknown> | undefined;
  if (changedData?.mustChangePassword !== false || typeof changedData.token !== 'string') {
    throw new Error('Initial admin password change did not return an unrestricted token');
  }
  return changedData.token;
}

async function verifyConfigurationRoutesAndSkinCrud(
  baseUrl: string,
  token: string,
  ownership: ApplicationSmokeOwnership,
  hooks: SkinCrudHooks = {},
): Promise<void> {
  for (const route of [
    '/api/admin/skins',
    '/api/admin/model-providers',
    '/api/admin/models',
    '/api/admin/voice-packages',
    '/api/admin/players',
    '/api/admin/werewolf-roles',
    '/api/admin/werewolf-modes',
  ]) {
    requireStatus(await requestJson(baseUrl, route, { token }), 200, `Configuration read ${route}`);
  }
  const skin = {
    name: ownership.skinName,
    source: ownership.skinMarker,
    background: 'Application smoke background',
    truth: 'Application smoke truth',
    clues: [{ title: 'Smoke clue', text: 'Smoke clue text' }],
    enabled: true,
  };
  const created = await requestJson(baseUrl, '/api/admin/skins', { method: 'POST', token, body: skin });
  await hooks.afterSkinResponse?.();
  requireStatus(created, 201, 'Skin create');
  const skinId = ((created.body.data as Record<string, unknown> | undefined)?.id);
  if (typeof skinId !== 'string' || !skinId) throw new Error('Skin create did not return an id');
  ownership.skinId = skinId;
  await hooks.afterSkinCreate?.();
  requireStatus(await requestJson(baseUrl, `/api/admin/skins/${encodeURIComponent(skinId)}`, {
    method: 'PUT', token, body: { ...skin, background: 'Application smoke updated background' },
  }), 200, 'Skin update');
  await hooks.afterSkinUpdate?.();
  requireStatus(await requestJson(baseUrl, `/api/admin/skins/${encodeURIComponent(skinId)}`, {
    method: 'DELETE', token,
  }), 200, 'Skin delete');
}

export {
  loginAndChangeInitialPassword,
  requestJson,
  requireStatus,
  verifyConfigurationRoutesAndSkinCrud,
};
export type { SkinCrudHooks, SmokeHttpResponse };
