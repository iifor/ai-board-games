const { drawQuestions, formatQuestion } = require('./questions');
const {
  checkWinCondition,
  countVotes,
  exileVote,
  getConsensusThreshold,
  includesForbiddenReveal,
  isConsensus
} = require('./utils');

async function runGame(players, options = {}) {
  const logger = options.logger || console;
  const revealExiledRole = options.revealExiledRole !== false;
  const roundsConsensus = [];
  const roundRecords = [];
  const publicHistory = [];
  const questions = drawQuestions(3);

  logger.line('====== 《共识迷雾》开始 ======');
  logger.line(`存活玩家：${players.map((p) => p.id).join('、')}`);
  logger.line('');

  for (let round = 1; round <= 3; round += 1) {
    const question = questions[round - 1];
    const alivePlayers = players.filter((player) => player.alive);
    const aliveIds = alivePlayers.map((player) => player.id);
    const threshold = getConsensusThreshold(alivePlayers.length);

    logger.line(`====== 第 ${round} 轮：${formatQuestion(question)} ======`);

    const votes = {};
    for (const player of alivePlayers) {
      votes[player.id] = await player.vote({
        round,
        question,
        publicHistory: publicHistory.join('\n')
      });
    }

    const tally = countVotes(votes);
    const consensus = isConsensus(votes, threshold);
    roundsConsensus.push(consensus);

    const stanceChanges = alivePlayers.filter((player) => player.stanceChangedThisRound).length;
    const publicLog = [
      `题目：${formatQuestion(question)}`,
      `投票结果：A ${tally.A} 票，B ${tally.B} 票`,
      `共识${consensus ? '达成' : '失败'}（阈值 ${threshold}）`,
      `立场变更声明人数：${stanceChanges}`,
      '个人真实票型隐藏'
    ].join('\n');

    logger.line(publicLog);
    logger.line('');

    const record = {
      round,
      question,
      votes,
      tally,
      threshold,
      consensus,
      speeches: [],
      exileVotes: {},
      eliminated: null
    };

    const winAfterVote = checkWinCondition(roundsConsensus, players);
    if (winAfterVote) {
      roundRecords.push(record);
      return finishGame({ winner: winAfterVote, roundsConsensus, roundRecords, logger });
    }

    const recentSpeeches = [];
    for (const player of alivePlayers) {
      if (!player.alive) continue;

      const speech = await player.speak({
        round,
        question,
        publicLog,
        recentSpeeches: recentSpeeches.join('\n')
      });

      logger.line(`玩家 ${player.id}：${speech}`);
      recentSpeeches.push(`玩家 ${player.id}：${speech}`);
      record.speeches.push({ playerId: player.id, speech });

      if (includesForbiddenReveal(speech)) {
        player.alive = false;
        record.eliminated = {
          playerId: player.id,
          reason: '违规暴露阵营',
          role: player.role
        };
        logger.line(`玩家 ${player.id} 违规暴露阵营，立即离场。`);
      }
    }

    logger.line('');

    const exileVoters = players.filter((player) => player.alive);
    const exileAliveIds = exileVoters.map((player) => player.id);

    if (exileVoters.length > 2) {
      for (const player of exileVoters) {
        const target = await player.voteExile({
          aliveIds: exileAliveIds,
          publicLog,
          allSpeeches: recentSpeeches.join('\n')
        });
        record.exileVotes[player.id] = target;
        logger.line(`玩家 ${player.id} 投票放逐 ${target}`);
      }

      const eliminatedId = exileVote(record.exileVotes);
      if (eliminatedId) {
        const target = players.find((player) => player.id === eliminatedId);
        target.alive = false;
        record.eliminated = {
          playerId: eliminatedId,
          reason: '放逐',
          role: target.role
        };
        const roleText = revealExiledRole ? `，身份是${target.revealRole()}` : '';
        logger.line(`玩家 ${eliminatedId} 被放逐${roleText}。`);
      } else {
        logger.line('放逐投票平票，无人离场。');
      }
    } else {
      logger.line('存活人数过少，跳过放逐投票。');
    }

    publicHistory.push(
      `第 ${round} 轮：${formatQuestion(question)}；A ${tally.A}/B ${tally.B}；共识${consensus ? '成功' : '失败'}；离场：${
        record.eliminated ? record.eliminated.playerId : '无'
      }`
    );
    roundRecords.push(record);
    logger.line('');

    const winAfterExile = checkWinCondition(roundsConsensus, players);
    if (winAfterExile) {
      return finishGame({ winner: winAfterExile, roundsConsensus, roundRecords, logger });
    }
  }

  const finalWinner = roundsConsensus.filter(Boolean).length >= 2 ? 'order' : 'chaos';
  return finishGame({ winner: finalWinner, roundsConsensus, roundRecords, logger });
}

function finishGame({ winner, roundsConsensus, roundRecords, logger }) {
  const winnerName = winner === 'order' ? '守序方' : '破坏者';
  logger.line(`====== 游戏结束：${winnerName}胜利 ======`);
  logger.line(`共识结果：${roundsConsensus.map((ok) => (ok ? '成功' : '失败')).join('、')}`);
  return {
    winner,
    roundsConsensus,
    roundRecords
  };
}

module.exports = {
  runGame
};
