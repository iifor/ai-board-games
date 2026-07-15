import { Bomb, Crown, Crosshair, Eye, FlaskConical, Shield, Sparkles, Swords, Target } from 'lucide-react';
import { classNames } from '../../../../utils/classNames';
import { getWerewolfInteractionVisualKind, type WerewolfInteractionState, type WerewolfInteractionVisualKind } from '../../utils/interactionState';
import './index.css';

type VisualConfig = {
  icon: typeof Target;
  steps: string[];
};

const VISUALS: Record<Exclude<WerewolfInteractionVisualKind, 'none'>, VisualConfig> = {
  wolf: { icon: Crosshair, steps: ['商议', '锁定目标', '等待天亮'] },
  seer: { icon: Eye, steps: ['选择目标', '星光聚焦', '结果揭示'] },
  witch: { icon: FlaskConical, steps: ['确认药剂', '药剂生效', '结果记录'] },
  guard: { icon: Shield, steps: ['选择目标', '护盾展开', '守护生效'] },
  hunter: { icon: Crosshair, steps: ['死亡触发', '锁定目标', '开枪发动'] },
  'self-destruct': { icon: Bomb, steps: ['发动自爆', '锁定目标', '带走目标'] },
  knight: { icon: Swords, steps: ['发起决斗', '身份判定', '结果公开'] },
  idiot: { icon: Sparkles, steps: ['触发放逐', '翻开身份', '保留发言'] },
  sheriff: { icon: Crown, steps: ['上警', '候选发言', '投票', '警长当选'] },
  generic: { icon: Target, steps: ['技能触发', '作用目标', '结果公布'] },
};

export function RoleInteractionVisual({ interaction }: { interaction: WerewolfInteractionState }) {
  const kind = getWerewolfInteractionVisualKind(interaction.action);
  if (kind === 'none' || interaction.template === 'idle' || interaction.template === 'speech') return null;

  const { icon: Icon, steps } = VISUALS[kind];
  const activeStep = interaction.status === 'resolved'
    ? steps.length - 1
    : interaction.status === 'submitted'
      ? Math.min(1, steps.length - 1)
      : interaction.status === 'acting'
        ? 0
        : -1;

  return <section className={classNames('role-interaction-visual', `is-${kind}`)} aria-label={`${interaction.title}技能展示`}>
    <div className="role-interaction-visual__core" aria-hidden="true"><Icon /></div>
    {interaction.resultLabel && <strong className="role-interaction-visual__result">{interaction.resultLabel}</strong>}
    <ol className="role-interaction-visual__steps">
      {steps.map((step, index) => <li className={classNames(index === activeStep && 'is-active', index < activeStep && 'is-complete')} key={step}>{step}</li>)}
    </ol>
  </section>;
}
