import type { SegmentControl } from '../playback/segment';
import type { SkillCue } from './skillTypes';

export function skillDuration(cue: SkillCue): number {
  if (cue.kind === 'blast' || cue.route === 'reflect' || cue.targets.length > 2) return 2800;
  return cue.stage === 'result' ? 1800 : 2200;
}

/** 独立的最短展示时间，不写语音进度，避免字幕与音频时钟互相覆盖。 */
export function holdSkill(duration: number, control: SegmentControl): Promise<void> {
  if (control.signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    let remaining = duration;
    let started = Date.now();
    let rate = control.rate;
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => { clearTimeout(timer); unsubscribe(); control.signal.removeEventListener('abort', finish); resolve(); };
    const arm = () => { started = Date.now(); timer = setTimeout(finish, remaining / rate); };
    const unsubscribe = control.subscribe(() => {
      if (rate === control.rate) return;
      remaining = Math.max(0, remaining - (Date.now() - started) * rate);
      clearTimeout(timer); rate = control.rate; arm();
    });
    control.signal.addEventListener('abort', finish, { once: true });
    arm();
  });
}
