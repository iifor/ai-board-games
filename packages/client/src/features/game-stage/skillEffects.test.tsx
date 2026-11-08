import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { StageEvent } from '@battle/shared';
import { skillCue } from './animation/skillCue';
import { SkillEffect } from './components/SkillEffect';
import { meta, view } from './stage.fixtures';

const action: StageEvent = { ...meta, view: { ...view, gameKey: 'werewolf' }, phaseId: 'knight_duel', kind: 'action', seat: 2, targets: [3], action: '决斗', text: '决斗3号' };
describe('技能表现', () => {
  it('用动作决定施法者和所有目标，放弃技能时不播放命中特效', () => {
    expect(skillCue(action)).toMatchObject({ kind: 'duel', actor: 2, targets: [3] });
    expect(skillCue({ ...action, targets: [] })).toBeNull();
    expect(skillCue({ ...action, phaseId: 'magician_swap', targets: [1,2] })?.targets).toEqual([1,2]);
    expect(skillCue({ ...action, phaseId: 'merchant_skill_gun', targets: [2] })).toMatchObject({ actor: 2, targets: [] });
  });
  it('行动和已生效的守护使用各自的文字', () => {
    expect(skillCue({ ...action, phaseId: 'guard_protect', action: '守护' })?.title).toBe('守护');
    const cue = skillCue({ ...meta, view: action.view, kind: 'revealed', text: '3号 · 守护成功', data: { effect: 'shield', title: '守护成功', target: 3 } });
    expect(cue).toMatchObject({ title: '守护成功', targets: [3] });
    expect(renderToStaticMarkup(<SkillEffect cue={cue!} />)).toContain('data-effect="shield"');
  });
});
