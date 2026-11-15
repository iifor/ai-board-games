import type { GameCatalogItem, PublicPlayerDto } from '@battle/shared';
import { Link, useNavigate } from 'react-router';
import { GAMES_WITH_TOPIC } from '../constants';
import { useMatchSetup, type SetupInitial } from '../hooks/useMatchSetup';
import { useSeatFlights } from '../hooks/useSeatFlights';
import { BoardPicker } from './BoardPicker';
import { PlayerPicker } from './PlayerPicker';
import { SeatGrid } from './SeatGrid';
import { SetupActionBar } from './SetupActionBar';
import { TopicFields } from './TopicFields';
import './SetupForm.css';

interface SetupFormProps {
  readonly game: GameCatalogItem;
  readonly players: readonly PublicPlayerDto[];
  readonly initial?: SetupInitial | undefined;
}

/** 开局共享同一份选人状态；在更新座位前量取飞行动效的起点与落点。 */
export function SetupForm({ game, players, initial }: SetupFormProps) {
  const setup = useMatchSetup(game, players, initial);
  const flights = useSeatFlights();
  const navigate = useNavigate();
  const start = async (mode: 'players' | 'generated') => {
    const id = await setup.submit(mode);
    if (id) navigate(`/matches/${id}`);
  };
  const board = game.variants.find((variant) => variant.key === setup.variant) ?? null;
  const seated = setup.selected.flatMap((id) => players.filter((player) => player.id === id));

  const toggle = (id: number) => {
    const seatIndex = setup.selected.indexOf(id);
    if (seatIndex >= 0) flights.leave([{ playerId: id, seatIndex }]);
    else flights.arrive([id], setup.selected.length);
    setup.toggle(id);
  };
  const fillSeats = () => {
    const startIndex = setup.selected.length;
    flights.arrive(setup.fill(), startIndex);
  };
  const clear = () => {
    flights.leave(setup.selected.map((playerId, seatIndex) => ({ playerId, seatIndex })));
    setup.clear();
  };

  return (
    <form className="setup-form" data-game={game.key} onSubmit={(event) => { event.preventDefault(); void start('players'); }}>
      <header className="setup-header">
        <Link to="/" className="setup-back">← 返回大厅</Link>
        <div className="setup-title">
          <h1>{game.title}</h1>
          <span>{setup.range.min === setup.range.max ? setup.range.min : `${setup.range.min}–${setup.range.max}`} 人</span>
        </div>
      </header>
      {game.variants.length > 0 && <BoardPicker variants={game.variants} value={setup.variant} onChange={setup.setVariant} />}
      <div className={players.length ? 'setup-columns' : 'setup-columns setup-empty'}>
        <aside className="setup-side">
          {GAMES_WITH_TOPIC.has(game.key) && (
            <details className="setup-settings">
              <summary>自定义辩题 <small>{setup.topicPartial ? '待补全' : '可选'}</small></summary>
              <TopicFields topic={setup.topic} onChange={setup.setTopic} incomplete={setup.topicPartial} />
            </details>
          )}
          {players.length > 0 && (
            <section className="setup-lineup" aria-label="本局阵容">
              <div className="setup-lineup-head"><h2>{game.seatGroups?.length ? '阵营座次' : '座位顺序'}</h2><span>{seated.length} / {setup.range.max}</span></div>
              <SeatGrid seated={seated} groups={game.seatGroups} max={setup.range.max} onUnseat={toggle} registerSlot={flights.registerSlot} arrivalDelay={flights.arrivalDelay} />
            </section>
          )}
          {import.meta.env.DEV && (
            <details className="setup-settings setup-debug-settings" open={players.length === 0 || undefined}>
              <summary>模拟开局 <small>本地调试</small></summary>
              <div className="setup-debug">
                <p>{board ? `${board.name} · ` : ''}{players.length ? '使用当局临时玩家，由脚本执行行动。' : '暂无可用的模型玩家，可以用临时玩家开局。'}</p>
                <button type="button" className={players.length ? 'button' : 'button button-primary'} disabled={setup.submitting || setup.topicPartial}
                  onClick={() => void start('generated')}>{setup.submitting ? '正在创建对局…' : `生成 ${setup.range.min} 名模拟玩家并开局`}</button>
              </div>
            </details>
          )}
        </aside>
        {players.length > 0 && (
          <section className="setup-players" aria-labelledby="setup-picker-title">
            <div className="setup-players-head">
              <div><h2 id="setup-picker-title">选择玩家</h2><p>{setup.randomFill ? '依次入座正方、反方和评委席' : '按点击顺序，从 1 号起依次入座'}</p></div>
              <div className="setup-tools">
                <button type="button" className="button" disabled={seated.length >= Math.min(players.length, setup.range.max)} onClick={fillSeats}>{setup.randomFill ? '随机补满' : '按序补满'}</button>
                <button type="button" className="button" disabled={!seated.length} onClick={clear}>清空</button>
              </div>
            </div>
            <PlayerPicker players={players} selected={setup.selected} groups={game.seatGroups} onToggle={toggle} registerSource={flights.registerSource} />
          </section>
        )}
      </div>
      {setup.error ? <p className="setup-error" role="alert">{setup.error}</p> : null}
      {players.length > 0 && <SetupActionBar
        boardName={board?.name ?? game.title}
        count={setup.selected.length}
        range={setup.range}
        hint={setup.hint}
        topicPartial={setup.topicPartial}
        submitting={setup.submitting}
      />}
    </form>
  );
}
