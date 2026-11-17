import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VersusLayout } from './layouts/VersusLayout';
import { seat, view } from './stage.fixtures';

describe('辩论赛人物席位', () => {
  it.each([1, 2, 3, 4])('四名辩手按辩位排列，%i 位评委保留独立悬浮入口', (judges) => {
    const seats = [
      ...Array.from({ length: 4 }, (_, i) => ({ ...seat(i + 1, 'pro', i + 1), name: `${String(i + 1).padStart(2, '0')} 号模拟玩家`, alive: true })),
      ...Array.from({ length: 4 }, (_, i) => ({ ...seat(i + 5, 'con', i + 1), name: `${String(i + 5).padStart(2, '0')} 号模拟玩家`, alive: true })),
      ...Array.from({ length: judges }, (_, i) => ({ ...seat(i + 9, 'judge'), name: `评委${i + 1}`, avatar: '/judge.png', alive: true })),
    ].reverse();
    const html = renderToStaticMarkup(<VersusLayout view={{ ...view, seats }} speaking={6} center={<p>中央发言</p>}
      onSeatSelect={() => {}} selectedSeat={6} badges={{ 9: ['支持正方'] }} />);
    expect(html.match(/data-seat-trigger=/g)).toHaveLength(8 + judges);
    expect(html.match(/class="seat-card-compact"/g)).toHaveLength(8 + judges);
    expect(html.match(/class="seat-spotlight"/g)).toHaveLength(1);
    expect(html).toContain('/player-poster-cutouts/small/deepseek.webp');
    expect(html).toContain('反方二辩');
    expect(html).toContain('aria-label="6号 玩家6，正在发言"');
    expect(html).toContain('aria-details="seat-profile"');
    expect(html).toContain('支持正方');
    expect(html.indexOf('data-seat-trigger="1"')).toBeLessThan(html.indexOf('data-seat-trigger="4"'));
    expect(html.indexOf('data-seat-trigger="5"')).toBeLessThan(html.indexOf('data-seat-trigger="8"'));
  });
  it('主持播报收起席位灯光，没有立绘时保留公开头像和名字', () => {
    const html = renderToStaticMarkup(<VersusLayout view={{ ...view, seats: [{ ...seat(1, 'pro', 1), name: '自定义玩家', avatar: '/custom.png' }] }} speaking={null} center={null} />);
    expect(html).toContain('data-art="portrait" src="/custom.png"');
    expect(html).toContain('title="自定义玩家"');
    expect(html).not.toContain('class="seat-spotlight"');
  });
});
