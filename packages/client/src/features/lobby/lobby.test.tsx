import type { GameCatalogItem } from '@battle/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { GameList } from './components/GameList';
import { PlayerPicker } from './components/PlayerPicker';
import { filterVariants, isSetupInitial, playerRange, selectionHint, toggleSelection } from './utils';

const werewolf: GameCatalogItem = {
  key: 'werewolf', title: 'AI 狼人杀', description: '12 人', players: { min: 12, max: 12 }, layout: 'circle',
  variants: [{
    key: 'standard-12', name: '预女猎白', description: '', players: { min: 12, max: 12 },
    roles: [{ name: '狼人', team: 'werewolf', count: 4 }, { name: '预言家', team: 'good', count: 1 }, { name: '村民', team: 'good', count: 7 }],
  }],
  defaultVariant: 'standard-12',
};

describe('lobby utils', () => {
  it('keeps selection order as seat order', () => {
    expect(toggleSelection([3, 1], 2)).toEqual([3, 1, 2]);
    expect(toggleSelection([3, 1, 2], 1)).toEqual([3, 2]);
  });

  it('explains what is missing', () => {
    expect(selectionHint(9, { min: 9, max: 12 })).toBeNull();
    expect(selectionHint(7, { min: 9, max: 12 })).toBe('还需选择 2 名玩家');
    expect(selectionHint(13, { min: 9, max: 12 })).toBe('最多 12 名玩家，请取消 1 名');
    expect(playerRange(werewolf, 'standard-12')).toEqual({ min: 12, max: 12 });
  });

  it('searches boards by name or role and recognises rematch state', () => {
    expect(filterVariants(werewolf.variants, '预言').map((variant) => variant.key)).toEqual(['standard-12']);
    expect(filterVariants(werewolf.variants, '猎魔人')).toEqual([]);
    expect(filterVariants(werewolf.variants, '  ')).toHaveLength(1);
    expect(isSetupInitial({ variant: 'standard-12', playerIds: [1, 2] })).toBe(true);
    expect(isSetupInitial({ playerIds: ['a'] })).toBe(false);
    expect(isSetupInitial('standard-12')).toBe(false);
    expect(isSetupInitial({})).toBe(false);
  });
});

describe('lobby components', () => {
  it('lists games with player counts and boards', () => {
    const html = renderToStaticMarkup(<MemoryRouter><GameList games={[werewolf]} /></MemoryRouter>);
    expect(html).toContain('12 人 · 1 个板子');
    expect(html).toContain('href="/play/werewolf"');
  });

  it('numbers selected players by seat', () => {
    const html = renderToStaticMarkup(
      <PlayerPicker players={[{ id: 5, name: '阿明', avatar: null, persona: '' }, { id: 6, name: '小红', avatar: null, persona: '冷静' }]} selected={[6, 5]} onToggle={() => {}} />,
    );
    expect(html.indexOf('>2<')).toBeLessThan(html.indexOf('阿明'));
    expect(html).toContain('冷静');
  });
});
