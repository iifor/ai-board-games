import assert from 'node:assert/strict';
import test from 'node:test';

const Module = require('node:module') as {
  _extensions: Record<string, (module: unknown, filename: string) => void>;
};
Module._extensions['.css'] = () => {};

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { PlayerDetailModal } = require(
  '../../packages/client/src/components/common/PlayerDetailModal',
) as typeof import('../../packages/client/src/components/common/PlayerDetailModal');
const { WerewolfPlayerDetailModal } = require(
  '../../packages/client/src/features/werewolf/components/WerewolfPlayerDetailModal',
) as typeof import('../../packages/client/src/features/werewolf/components/WerewolfPlayerDetailModal');

test('player detail modal renders the shared profile and only populated match fields', () => {
  const html = renderToStaticMarkup(React.createElement(PlayerDetailModal, {
    player: {
      id: 1,
      nickname: 'ChatGPT',
      sex: '女',
      personality: '冷静、善于分析',
    },
    fields: [
      { label: '本局身份', value: '正方一辩' },
      { label: '空字段', value: '' },
    ],
  }));

  assert.match(html, /player-detail-cutout/);
  assert.match(html, /\/player-poster-cutouts\/chatgpt\.webp/);
  assert.match(html, />性别</);
  assert.match(html, />女</);
  assert.match(html, />性格</);
  assert.match(html, /冷静、善于分析/);
  assert.match(html, />本局信息</);
  assert.match(html, /正方一辩/);
  assert.doesNotMatch(html, /空字段/);
});

test('player detail modal hides an empty match section and supplies base fallbacks', () => {
  const html = renderToStaticMarkup(React.createElement(PlayerDetailModal, {
    player: { id: 99, nickname: '自定义玩家' },
    fields: [{ label: '本局身份', value: '   ' }],
  }));

  assert.match(html, /未设置/);
  assert.doesNotMatch(html, />本局信息</);
  assert.match(html, /player-detail-avatar/);
});

test('Werewolf adapter reuses the shared profile and shows only authorized match fields', () => {
  const player = {
    id: 2,
    nickname: 'Claude Code',
    sex: '男',
    personality: '谨慎',
    role: 'werewolf',
    roleLabel: '狼人',
    faction: 'wolves',
    alive: false,
    deathDay: 2,
    deathReason: '放逐',
  };
  const hidden = renderToStaticMarkup(React.createElement(WerewolfPlayerDetailModal, {
    player,
    roleVisible: false,
    onClose: () => {},
  }));
  const visible = renderToStaticMarkup(React.createElement(WerewolfPlayerDetailModal, {
    player,
    roleVisible: true,
    onClose: () => {},
  }));

  assert.match(hidden, /player-detail-layout/);
  assert.match(hidden, />男</);
  assert.doesNotMatch(hidden, />本局身份</);
  assert.doesNotMatch(hidden, />身份说明</);
  assert.match(hidden, /第 2 天/);
  assert.match(visible, />本局身份</);
  assert.match(visible, /狼人/);
  assert.match(visible, />身份说明</);
});

test('Werewolf adapter omits status when the snapshot has no alive field', () => {
  const html = renderToStaticMarkup(React.createElement(WerewolfPlayerDetailModal, {
    player: { id: 3, nickname: 'Kimi' },
    roleVisible: false,
    onClose: () => {},
  }));

  assert.doesNotMatch(html, />状态</);
  assert.doesNotMatch(html, />本局信息</);
});
