import { runToEnd } from '@battle/engine/testing';
import { gameRegistry } from '@battle/games';
import { speechOf, type StageEvent } from '@battle/shared';
import { describe, expect, it } from 'vitest';
import { forPlayerSeat } from '../src/modules/realtime/perspective';

describe('狼人杀玩家视角的主持语音', () => {
  const game = gameRegistry.get('werewolf')!;
  const { stageEvents } = runToEnd(game, { seed: 12, variant: 'nightmare-guard-12', playerCount: 12 });
  const night = stageEvents.filter((e) => e.round === 1 && e.view.extra.period === 'night');

  it.each(['animal-zoo-12', 'bear-tamer-hidden-wolf-12'])('在 %s 的实际晨报中只朗读一次熊的结果', variant => {
    const { stageEvents } = runToEnd(game, { seed: 11, variant, playerCount: 12 });
    const morning = stageEvents.filter(e => e.round === 1);
    const cue = morning.find(e => e.kind === 'revealed' && e.channel === 'spectator' && e.data.effect === 'inspect');
    if (cue?.kind !== 'revealed') throw Error('缺少熊的动效');
    expect(speechOf(cue)).toBeNull();
    const { announcement, ...legacy } = cue.data;
    expect(announcement).toBe('dawn');
    expect(speechOf({ ...cue, data: legacy })).toBeNull();
    expect(morning.filter(e => speechOf(e)?.text.includes(String(cue.data.title)))).toHaveLength(1);
  });

  it('命中只展示，天亮时按名单朗读出局座位', () => {
    const hit = stageEvents.find(e => e.kind === 'revealed' && e.data.title === '狼刀命中');
    if (hit?.kind !== 'revealed') throw Error('缺少狼刀命中事件');
    expect(speechOf(hit)).toBeNull();
    const dawn = stageEvents.find(e => e.round === hit.round && e.phaseId === 'dawn' && e.kind === 'narration');
    expect(dawn && speechOf(dawn)?.text).toContain(hit.data.target + '号');
  });
  const expected = ['天黑请闭眼。', '梦魇请睁眼，选择恐惧目标。', '守卫请睁眼行动。', '狼人请睁眼，选择目标。', '预言家请睁眼，查验身份。', '女巫请睁眼行动。'];

  it('所有座位听到相同叫号，字幕、音频和快照不带其他座位的暗牌或夜间动作', () => {
    expect(night.some((e) => e.channel !== 'public' && e.kind === 'action')).toBe(true);
    for (let viewer = 1; viewer <= 12; viewer++) {
      const projected = night.map((e) => forPlayerSeat(e, viewer)).filter((e): e is StageEvent => e !== null);
      const privateEvents = projected.filter((e) => e.channel !== 'public');
      expect(privateEvents.every((e) => e.channel === `private:${viewer}` &&
        (e.kind === 'narration' || e.kind === 'action' && e.seat === viewer))).toBe(true);
      expect(projected.filter((e) => e.channel === 'public').flatMap((e) => speechOf(e) ?? []))
        .toEqual(expected.map((text) => ({ text, seat: null })));
      for (const event of projected) {
        expect(event.view.seats.filter((s) => s.role !== null).map((s) => s.seat)).toEqual([viewer]);
        expect(event.view.seats.filter((s) => s.seat !== viewer).every((s) => s.team === null && s.roleName === null)).toBe(true);
      }
    }
  });

  it('只有当事座位能收到法官的用药询问；观战专用和狼队事件不外发', () => {
    const witch = night[0]!.view.seats.find((s) => s.role === 'witch')!.seat;
    const villager = night[0]!.view.seats.find((s) => s.role === 'villager')!.seat;
    const notice = night.find((e) => e.kind === 'narration' && e.purpose === 'decision')!;
    expect(forPlayerSeat(notice, witch)).toMatchObject({ kind: 'narration', purpose: 'decision', channel: `private:${witch}` });
    expect(forPlayerSeat(notice, villager)).toBeNull();
    for (const e of night.filter((e) => e.channel === 'spectator' || e.channel.startsWith('team:'))) {
      expect(forPlayerSeat(e, witch)).toBeNull();
    }
  });

  it('旧狼人杀回放缺少公开清单时，同样遮住其他座位的身份', () => {
    const wake = night.find((e) => e.kind === 'phase_started' && e.phaseId === 'wolf_chat')!;
    const { publicRoles: _publicRoles, ...oldView } = wake.view;
    const player = forPlayerSeat({ ...wake, view: oldView }, 2)!;
    expect(player.view.seats.filter((s) => s.role !== null).map((s) => s.seat)).toEqual([2]);
    expect(speechOf(player)?.text).toBe('狼人请睁眼，选择目标。');
  });
});
