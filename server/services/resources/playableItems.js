function collectPlayableItems(game) {
  const type = game.gameType || game.type;
  if (type === 'debate') {
    const phases = Array.isArray(game.phases) ? game.phases : game.rounds || [];
    return phases.flatMap((phase) => collectSpeeches(phase));
  }

  if (type === 'werewolf') {
    return (game.rounds || []).flatMap((round) => [
      ...collectSpeeches(round),
      ...collectWerewolfTestimonies(round)
    ]);
  }

  return (game.rounds || []).flatMap((round) => collectSpeeches(round));
}

function collectSpeeches(container = {}) {
  return []
    .concat(container.speeches || [])
    .concat(container.items || [])
    .concat(container.discussion || [])
    .filter(Boolean)
    .map((item) => ({
      playerId: item.playerId ?? item.player_id ?? item.id,
      text: String(item.text || item.content || item.message || '').trim()
    }))
    .filter((item) => item.playerId && item.text);
}

function collectWerewolfTestimonies(round = {}) {
  return []
    .concat(round.lastWords || [])
    .concat(round.testimonies || [])
    .filter(Boolean)
    .map((item) => ({
      playerId: item.playerId ?? item.id,
      text: String(item.text || item.testimony || item.content || '').trim()
    }))
    .filter((item) => item.playerId && item.text);
}

module.exports = {
  collectPlayableItems
};
