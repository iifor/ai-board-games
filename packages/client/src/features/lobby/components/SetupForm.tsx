import type { GameCatalogItem, PublicPlayerDto } from '@battle/shared';
import { useNavigate } from 'react-router';
import { GAMES_WITH_TOPIC } from '../constants';
import { useMatchSetup } from '../hooks/useMatchSetup';
import { PlayerPicker } from './PlayerPicker';
import { TopicFields } from './TopicFields';
import './SetupForm.css';

interface SetupFormProps {
  readonly game: GameCatalogItem;
  readonly players: readonly PublicPlayerDto[];
}

export function SetupForm({ game, players }: SetupFormProps) {
  const setup = useMatchSetup(game, players);
  const navigate = useNavigate();
  const start = async () => {
    const id = await setup.submit();
    if (id) navigate(`/matches/${id}`);
  };

  return (
    <form className="setup-form" onSubmit={(event) => { event.preventDefault(); void start(); }}>
      {game.variants.length ? (
        <label className="setup-variant glass-panel">
          板子
          <select value={setup.variant ?? ''} onChange={(event) => setup.setVariant(event.target.value)}>
            {game.variants.map((variant) => <option key={variant.key} value={variant.key}>{variant.name}</option>)}
          </select>
          <span>{game.variants.find((variant) => variant.key === setup.variant)?.description}</span>
        </label>
      ) : null}
      <section className="setup-players glass-panel">
        <div className="setup-players-head">
          <h2>选择玩家（{setup.selected.length} / {setup.range.min === setup.range.max ? setup.range.max : `${setup.range.min}–${setup.range.max}`}）</h2>
          <button type="button" className="button" onClick={setup.fillRandom}>随机补满</button>
          <button type="button" className="button" onClick={setup.clear}>清空</button>
        </div>
        <PlayerPicker players={players} selected={setup.selected} onToggle={setup.toggle} />
        {setup.hint ? <p className="setup-hint">{setup.hint}</p> : null}
      </section>
      {GAMES_WITH_TOPIC.has(game.key) ? <TopicFields topic={setup.topic} onChange={setup.setTopic} incomplete={setup.topicPartial} /> : null}
      {setup.error ? <p className="setup-error" role="alert">{setup.error}</p> : null}
      <button type="submit" className="button button-primary" disabled={Boolean(setup.hint) || setup.topicPartial || setup.submitting}>
        {setup.submitting ? '正在开局…' : '开始对局'}
      </button>
    </form>
  );
}
