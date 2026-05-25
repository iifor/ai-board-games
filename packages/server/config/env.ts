import fs from 'fs';
import path from 'path';

function loadEnvFile(): void {
  const envPaths = [
    path.join(__dirname, '..', '..', '..', '.env'),
    path.join(__dirname, '..', '..', '.env')
  ];
  const envPath = envPaths.find((item) => fs.existsSync(item));
  if (!envPath) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

export { loadEnvFile };
