import React from 'react';
import { MessageSquareText } from 'lucide-react';
import { classNames } from '../../../utils/classNames';

export function DebatePhaseTimeline({ steps, activeStepIndex }) {
  const displaySteps = steps.length ? steps : [{ id: 'pending', label: '等待开局', Icon: MessageSquareText }];
  return (
    <ol className="debate-phase-timeline" aria-label="比赛流程">
      {displaySteps.map((step, index) => {
        const Icon = step.Icon;
        return (
          <li
            className={classNames(index === activeStepIndex && 'active', index < activeStepIndex && 'past')}
            key={step.id || step.label}
          >
            <span className="phase-number">{index + 1}</span>
            <span className="phase-icon"><Icon size={38} strokeWidth={2.5} /></span>
            <strong>{step.label}</strong>
            {index < displaySteps.length - 1 && <span className="phase-arrow" />}
          </li>
        );
      })}
    </ol>
  );
}
