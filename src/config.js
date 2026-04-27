const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath = path.join(process.cwd(), '.env')) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, '');

    if (!process.env[key]) process.env[key] = value;
  }
}

function getConfig(argv = process.argv.slice(2)) {
  loadEnvFile();

  const mockMode =
    argv.includes('--mock') ||
    process.env.MOCK_MODE === 'true' ||
    !process.env.OPENAI_API_KEY;

  return {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    mockMode,
    revealExiledRole: !argv.includes('--hide-role')
  };
}

module.exports = {
  getConfig,
  loadEnvFile
};
