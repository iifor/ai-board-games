import type { AudienceSeat } from '@battle/shared';
import type { SeatSpeech, StreamItem } from '../../types';
import { latestRecordLine } from '../../utils';
import { EventFeed } from '../EventFeed';
import { SeatProfile } from '../SeatProfile';
import './MobileSheet.css';

export type SheetTab = 'speech' | 'overview' | 'seat';

const TABS: readonly { readonly key: SheetTab; readonly label: string }[] = [
  { key: 'speech', label: '发言' }, { key: 'overview', label: '对局' }, { key: 'seat', label: '座位' },
];

interface MobileSheetProps {
  readonly open: boolean;
  readonly tab: SheetTab;
  /** 已播放的事件（含正在播的这段） */
  readonly items: readonly StreamItem[];
  /** 收起时露出的最新一条从这里取：不含正在播的这段，它已经在发言卡里 */
  readonly history: readonly StreamItem[];
  readonly seat: AudienceSeat | null;
  readonly seatSpeeches: readonly SeatSpeech[];
  readonly onTab: (tab: SheetTab) => void;
  readonly onToggle: () => void;
}

/** 记录抽屉：收起时露出标签与最新一条，展开后是发言记录、对局记录或所选座位的资料 */
export function MobileSheet({ open, tab, items, history, seat, seatSpeeches, onTab, onToggle }: MobileSheetProps) {
  const peek = tab === 'seat' ? (seat ? `${seat.seat}号 · ${seat.name}` : '点座位查看资料') : latestRecordLine(history, tab === 'speech') ?? '还没有内容';
  return (
    <section className={`mobile-sheet ${open ? 'is-open' : ''}`} aria-label="记录">
      <button type="button" className="mobile-sheet-handle" aria-expanded={open} aria-label={open ? '收起记录' : '展开记录'} onClick={onToggle} />
      <div className="mobile-sheet-tabs" role="tablist">
        {TABS.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} onClick={() => onTab(item.key)}>{item.label}</button>
        ))}
      </div>
      {open ? (
        <div className="mobile-sheet-body" role="tabpanel">
          {tab === 'seat'
            ? seat ? <SeatProfile seat={seat} speeches={seatSpeeches} nameId="mobile-seat-name" /> : <p className="mobile-sheet-hint">点座位查看资料</p>
            : <EventFeed items={items} filter={tab === 'speech' ? 'speech' : 'overview'} />}
        </div>
      ) : <button type="button" className="mobile-sheet-peek" onClick={onToggle}>{peek}</button>}
    </section>
  );
}
