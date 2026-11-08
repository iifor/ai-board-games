import type { SignupChoice } from '../animation/sheriffSignup';
import './SheriffSignup.css';

export function SignupBadge() {
  return <span className="signup-badge" aria-label="上警" title="上警竞选中">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 1 3.2 5 5.9 1.3-2.5 5.5.6 6-6-1.2L8 21l-2.3-5.5L1 12l4.7-3.6L8 3z" /><path d="m12 7 1.5 3 3.3.5-2.4 2.3.6 3.2-3-1.5-3 1.5.6-3.2-2.4-2.3 3.3-.5z" /></svg>
    <span>上警</span>
  </span>;
}

/** 一次选择只在本人身上播放，静音、倍速和回放共用相同效果。 */
export function SignupEffect({ choice }: { readonly choice: SignupChoice }) {
  return <span className="signup-effect" data-joined={choice.joined} data-choice={choice.label} role="status"
    aria-label={`${choice.seat}号${choice.label}`}>
    <span className="signup-flash" aria-hidden="true" />
  </span>;
}
