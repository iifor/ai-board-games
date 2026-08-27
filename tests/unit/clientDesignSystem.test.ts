import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

function readHexToken(source: string, token: string): string {
  const match = source.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(match, `missing fixed hex token ${token}`);
  return match[1];
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const linear = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test('defines platform primitives and semantic interaction tokens', () => {
  const globals = read('packages/client/src/styles/globals.css');

  for (const token of [
    '--ui-bg-canvas',
    '--ui-bg-surface',
    '--ui-text',
    '--ui-text-muted',
    '--ui-brand',
    '--ui-on-brand',
    '--ui-info',
    '--ui-success',
    '--ui-warning',
    '--ui-danger',
    '--ui-focus-ring',
    '--ui-radius-pill',
    '--ui-motion-fast',
  ]) {
    assert.match(globals, new RegExp(`${token}:`));
  }

  assert.match(globals, /:focus-visible/);
  assert.match(globals, /prefers-reduced-motion:\s*reduce/);
});

test('core text and primary action colors meet WCAG AA contrast', () => {
  const globals = read('packages/client/src/styles/globals.css');
  const canvas = readHexToken(globals, '--ui-bg-canvas');

  assert.ok(contrastRatio(readHexToken(globals, '--ui-text'), canvas) >= 7, 'body text should meet AAA contrast');
  assert.ok(contrastRatio(readHexToken(globals, '--ui-brand'), readHexToken(globals, '--ui-on-brand')) >= 4.5, 'primary action label should meet AA contrast');
  assert.ok(contrastRatio(readHexToken(globals, '--ui-danger'), canvas) >= 4.5, 'danger text should meet AA contrast');
});

test('px conversion keeps layouts fluid without shrinking readable or physical affordances', async () => {
  const importModule = new Function('specifier', 'return import(specifier)') as (
    specifier: string
  ) => Promise<{
    px2vwPlugin(options?: { viewportWidth?: number }): {
      transform(code: string, id: string): { code: string } | null;
    };
  }>;
  const pluginUrl = pathToFileURL(path.join(process.cwd(), 'packages/shared/vite-plugins/px2vw.mjs')).href;
  const { px2vwPlugin } = await importModule(pluginUrl);
  const plugin = px2vwPlugin({ viewportWidth: 1000 });
  const transformed = plugin.transform(
    '.card{font-size:16px;line-height:24px;padding:20px;border:1px solid red;border-radius:8px;outline-offset:3px}'
      + '@media (max-width:720px){.card{gap:10px}}'
      + '@container panel (min-width:400px){.card{margin:5px}}',
    'contract.css',
  );

  assert.ok(transformed);
  assert.match(transformed.code, /font-size:clamp\(0\.75rem, 1\.6vw, 1rem\)/);
  assert.match(transformed.code, /line-height:clamp\(1\.125rem, 2\.4vw, 1\.5rem\)/);
  assert.match(transformed.code, /padding:2vw/);
  assert.match(transformed.code, /border:1px solid red/);
  assert.match(transformed.code, /border-radius:8px/);
  assert.match(transformed.code, /outline-offset:3px/);
  assert.match(transformed.code, /@media \(max-width:720px\)/);
  assert.match(transformed.code, /@container panel \(min-width:400px\)/);
  assert.match(transformed.code, /gap:1vw/);
  assert.match(transformed.code, /margin:0\.5vw/);

  const repeated = plugin.transform(transformed.code, 'contract.css');
  assert.equal(repeated?.code, transformed.code, 'conversion must be idempotent across transform and bundle hooks');
});

test('keeps one shared system with distinct game identities', () => {
  const theme = read('packages/client/src/styles/game-theme.css');

  for (const game of ['debate', 'werewolf', 'undercover', 'avalon']) {
    assert.match(theme, new RegExp(`\\[data-game=["']${game}["']\\]`));
  }

  assert.match(theme, /--game-primary:\s*var\(--ui-brand\)/);
  assert.match(theme, /\.game-control-rail/);
  assert.match(theme, /\.game-primary-button/);
  assert.match(theme, /--game-blue:\s*var\(--ui-info\)/);
});

test('all game roots and control rails opt into the design-system contract', () => {
  const gameRoots = {
    debate: 'packages/client/src/features/debate/DebateGame/index.tsx',
    werewolf: 'packages/client/src/features/werewolf/WerewolfGame/index.tsx',
    undercover: 'packages/client/src/features/undercover/UndercoverGame/index.tsx',
    avalon: 'packages/client/src/features/avalon/AvalonGame/index.tsx',
  } as const;

  for (const [game, file] of Object.entries(gameRoots)) {
    const source = read(file);
    assert.match(source, new RegExp(`data-game=["']${game}["']`));
    assert.match(source, /data-variant=\{variant\}/);
  }

  for (const file of [
    'packages/client/src/features/debate/components/DebateControls/index.tsx',
    'packages/client/src/features/werewolf/components/WerewolfControls/index.tsx',
    'packages/client/src/features/undercover/components/UndercoverControls.tsx',
    'packages/client/src/features/avalon/components/AvalonControls.tsx',
  ]) {
    assert.match(read(file), /game-control-rail/);
    assert.match(read(file), /game-primary-button/);
  }
});

test('shared overlays, subtitles and feedback use semantic component classes', () => {
  const theme = read('packages/client/src/styles/game-theme.css');
  for (const className of [
    'game-dialog-backdrop',
    'game-dialog-panel',
    'game-dialog-close',
    'game-state-card',
    'game-feedback',
    'game-subtitle-panel',
  ]) {
    assert.match(theme, new RegExp(`\\.${className}\\b`));
  }

  const componentContracts = [
    ['packages/client/src/components/common/BaseModal/index.tsx', /game-dialog-backdrop[\s\S]*game-dialog-panel[\s\S]*game-dialog-close/],
    ['packages/client/src/components/common/ThinkingModal/index.tsx', /game-dialog-backdrop[\s\S]*game-dialog-panel/],
    ['packages/client/src/components/SpeechSubtitle/index.tsx', /game-subtitle-panel/],
    ['packages/client/src/components/StateViews/index.tsx', /game-state-card[\s\S]*data-tone="error"/],
    ['packages/client/src/features/debate/components/DebateTopicDialog/index.tsx', /game-dialog-backdrop[\s\S]*game-dialog-panel[\s\S]*game-feedback/],
    ['packages/client/src/features/werewolf/components/WerewolfModeDialog/index.tsx', /game-dialog-backdrop[\s\S]*game-dialog-panel[\s\S]*game-feedback/],
  ] as const;

  for (const [file, contract] of componentContracts) {
    assert.match(read(file), contract);
  }

  for (const file of [
    'packages/client/src/features/debate/DebateGame/index.tsx',
    'packages/client/src/features/werewolf/WerewolfGame/index.tsx',
    'packages/client/src/features/undercover/UndercoverGame/index.tsx',
    'packages/client/src/features/avalon/AvalonGame/index.tsx',
  ]) {
    assert.match(read(file), /game-feedback/);
    assert.match(read(file), /data-tone="error"/);
  }
});

test('setup forms and selectable controls use the shared interaction contract', () => {
  const theme = read('packages/client/src/styles/game-theme.css');
  for (const className of [
    'game-form-section',
    'game-field',
    'game-input',
    'game-secondary-button',
    'game-select-card',
    'game-toggle-control',
    'game-switch-track',
    'game-native-switch',
  ]) {
    assert.match(theme, new RegExp(`\\.${className}\\b`));
  }

  assert.match(read('packages/client/src/features/debate/components/DebateTopicFields/index.tsx'), /game-form-section[\s\S]*game-field[\s\S]*game-input/);
  assert.match(read('packages/client/src/features/debate/components/DebateDialogFooter/index.tsx'), /game-toggle-control[\s\S]*role="switch"[\s\S]*aria-checked[\s\S]*game-primary-button/);
  assert.match(read('packages/client/src/features/debate/components/DebateTopicDialog/index.tsx'), /game-secondary-button[\s\S]*game-dialog-close/);
  assert.match(read('packages/client/src/features/werewolf/components/WerewolfModeDialog/index.tsx'), /game-secondary-button[\s\S]*game-select-card[\s\S]*aria-pressed[\s\S]*game-toggle-control[\s\S]*game-primary-button/);

  for (const file of [
    'packages/client/src/features/undercover/UndercoverGame/index.tsx',
    'packages/client/src/features/avalon/AvalonGame/index.tsx',
  ]) {
    const source = read(file);
    assert.match(source, /game-toggle-control/);
    assert.match(source, /game-native-switch/);
    assert.match(source, /role="switch"/);
  }

  assert.doesNotMatch(read('packages/client/src/features/debate/components/DebateTopicDialog/index.css'), /outline\s*:\s*none/);
});

test('game selection uses a readable two-column phone layout', () => {
  const styles = read('packages/client/src/pages/GameSelectPage/index.css');

  assert.match(styles, /@media \(max-width:\s*720px\)/);
  assert.match(styles, /\.game-entry-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.game-select-page\s*\{[\s\S]*overflow-y:\s*auto/);
  assert.match(styles, /\.game-entry-card strong\s*\{[\s\S]*font-size:\s*1\.35rem/);
});
