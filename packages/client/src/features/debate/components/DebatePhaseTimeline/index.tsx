import { MessageSquareText } from 'lucide-react';
import { classNames } from '../../../../utils/classNames';
import './index.css';
import type { DebateStageStep } from '../../../../types';

interface DebatePhaseTimelineProps {
  steps: DebateStageStep[];
  activeStepIndex: number;
}

export function DebatePhaseTimeline({ steps, activeStepIndex }: DebatePhaseTimelineProps) {
  const displaySteps = steps.length ? steps : [{ ids: ['pending'], label: '等待开局', Icon: MessageSquareText }];
  return (
    <ol className="debate-phase-timeline" aria-label="比赛流程">
      {displaySteps.map((step, index) => {
        const Icon = step.Icon;
        return (
          <li
            className={classNames(index === activeStepIndex && 'active', index < activeStepIndex && 'past')}
            key={step.ids[0] || step.label}
          >
            <span className="phase-number">{index + 1}</span>
            <span className="phase-icon"><Icon size={38} /></span>
            <strong>{step.label}</strong>
            {index < displaySteps.length - 1 && <span className="phase-arrow" />}
          </li>
        );
      })}
    </ol>
  );
}
