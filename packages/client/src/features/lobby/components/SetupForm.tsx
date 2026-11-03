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

/** 开局：左侧选板子（或辩题），右侧座位带 + 选玩家，底部操作条；选人 / 离席的动效在状态更新前触发（此时还能量到起点与落点） */
export function SetupForm({ game, players, initial }: SetupFormProps) {
  const setup = useMatchSetup(game, players, initial);
  const flights = useSeatFlights();
  const navigate = useNavigate();
  const start = async () => {
    const id = await setup.submit();
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
  const fillRandom = () => {
    const startIndex = setup.selected.length;
    flights.arrive(setup.fillRandom(), startIndex);
  };
  const clear = () => {
    flights.leave(setup.selected.map((playerId, seatIndex) => ({ playerId, seatIndex })));
    setup.clear();
  };

  return (
    <form className="setup-form" data-game={game.key} onSubmit={(event) => { event.preventDefault(); void start(); }}>
      <div className="setup-columns">
        <aside className="setup-side">
          <Link to="/" className="setup-back">← 返回大厅</Link>
          <h1>{game.title}</h1>
          {game.variants.length ? <BoardPicker variants={game.variants} value={setup.variant} onChange={setup.setVariant} /> : null}
          {GAMES_WITH_TOPIC.has(game.key) ? <TopicFields topic={setup.topic} onChange={setup.setTopic} incomplete={setup.topicPartial} /> : null}
        </aside>
        <section className="setup-players glass-panel">
          <div className="setup-players-head">
            <h2>选择玩家 <span>点击顺序即座位顺序 · {setup.selected.length} / {setup.range.max}</span></h2>
            <button type="button" className="button" onClick={fillRandom}>随机补满</button>
            <button type="button" className="button" onClick={clear}>清空</button>
          </div>
          <SeatGrid seated={seated} max={setup.range.max} onUnseat={toggle} registerSlot={flights.registerSlot} arrivalDelay={flights.arrivalDelay} />
          <PlayerPicker players={players} selected={setup.selected} onToggle={toggle} registerSource={flights.registerSource} />
        </section>
      </div>
      {setup.error ? <p className="setup-error" role="alert">{setup.error}</p> : null}
      <SetupActionBar
        boardName={board?.name ?? game.title}
        count={setup.selected.length}
        range={setup.range}
        hint={setup.hint}
        topicPartial={setup.topicPartial}
        submitting={setup.submitting}
      />
    </form>
  );
}
