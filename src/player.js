const {
  getExilePrompt,
  getPlayerSystemPrompt,
  getSpeechPrompt,
  getVotePrompt
} = require('./prompts');
const { clampText, parseJsonObject } = require('./utils');

class Player {
  constructor({ id, role, allies = [], personality, apiKey, model, mockMode = false }) {
    this.id = id;
    this.role = role;
    this.allies = allies;
    this.personality = personality;
    this.apiKey = apiKey;
    this.model = model;
    this.mockMode = mockMode;
    this.alive = true;
    this.stanceHistory = [];
    this.declaredVotes = [];
    this.totalStanceChanges = 0;
    this.stanceChangedThisRound = false;
    this.messages = [{ role: 'system', content: getPlayerSystemPrompt(this) }];
  }

  getStateSummary() {
    const lastVote = this.stanceHistory.at(-1) || '暂无';
    return [
      `你的编号：${this.id}`,
      `你的历史真实投票：${this.stanceHistory.join('、') || '暂无'}`,
      `你上一轮真实投票：${lastVote}`,
      `你已使用真实立场变更次数：${this.totalStanceChanges}`,
      `你的公开声明历史：${this.declaredVotes.join('、') || '暂无'}`
    ].join('\n');
  }

  async vote({ round, question, publicHistory }) {
    const previousVote = this.stanceHistory.at(-1);
    const prompt = getVotePrompt({
      round,
      question,
      publicHistory,
      playerState: this.getStateSummary()
    });

    const response = await this.callAI(prompt, 'vote', { question, round });
    const parsed = parseJsonObject(response);
    let vote = parsed && (parsed.vote === 'A' || parsed.vote === 'B') ? parsed.vote : null;

    if (!vote) vote = this.getFallbackVote(question, round);
    if (this.role === 'order' && previousVote && previousVote !== vote && this.totalStanceChanges >= 1) {
      vote = previousVote;
    }

    this.stanceChangedThisRound = Boolean(previousVote && previousVote !== vote);
    if (this.stanceChangedThisRound) this.totalStanceChanges += 1;
    this.stanceHistory.push(vote);
    return vote;
  }

  async speak({ round, question, publicLog, recentSpeeches }) {
    const realVote = this.stanceHistory.at(-1);
    const previousVote = this.stanceHistory.at(-2);
    const prompt = getSpeechPrompt({
      round,
      question,
      publicLog,
      recentSpeeches,
      playerState: this.getStateSummary()
    });

    let speech = await this.callAI(prompt, 'speech', { question, round });
    speech = clampText(speech, 120);

    if (!/我投了\s*[AB]/.test(speech)) {
      speech = `我投了${realVote}。${speech}`;
    }

    if (this.role === 'order' && this.stanceChangedThisRound) {
      const marker = `[变更] 我从 ${previousVote} 改为 ${realVote}`;
      if (!speech.includes('[变更]')) speech = `${marker}。${speech}`;
    }

    const declared = speech.match(/我投了\s*([AB])/);
    this.declaredVotes.push(declared ? declared[1] : realVote);
    return clampText(speech, 150);
  }

  async voteExile({ aliveIds, publicLog, allSpeeches }) {
    const prompt = getExilePrompt({
      aliveIds,
      publicLog,
      allSpeeches,
      playerState: this.getStateSummary()
    });
    const response = await this.callAI(prompt, 'exile', { aliveIds });
    const parsed = parseJsonObject(response);
    const target = Number(parsed && parsed.target);
    const validTargets = aliveIds.filter((id) => id !== this.id);

    if (validTargets.includes(target)) return target;
    return validTargets[Math.floor(Math.random() * validTargets.length)];
  }

  async callAI(prompt, action, context) {
    if (this.mockMode) return this.mockResponse(action, context);

    this.messages.push({ role: 'user', content: prompt });

    try {
      const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: this.messages,
          temperature: 0.85,
          max_tokens: 220
        })
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`${response.status} ${body}`);
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || '';
      this.messages.push({ role: 'assistant', content: reply });
      return reply;
    } catch (error) {
      const cause = error.cause ? `；原因：${error.cause.code || error.cause.message}` : '';
      console.error(`玩家 ${this.id} API 调用失败，改用本地策略：${error.message}${cause}`);
      return this.mockResponse(action, context);
    }
  }

  mockResponse(action, context) {
    if (action === 'vote') {
      const previous = this.stanceHistory.at(-1);
      if (this.role === 'order') {
        const vote = previous || (this.id % 2 === 0 ? 'B' : 'A');
        return JSON.stringify({ vote, reason: '保持稳定立场，便于追踪矛盾。' });
      }

      const vote = context.round % 2 === this.id % 2 ? 'A' : 'B';
      return JSON.stringify({ vote, reason: '制造票型分流。' });
    }

    if (action === 'speech') {
      const vote = this.stanceHistory.at(-1) || 'A';
      const lines = {
        recorder: `我投了${vote}。我更在意票数和声明能否对上，刚才如果有人回避理由，下一轮要重点看。`,
        skeptic: `我投了${vote}。现在不能只看谁站哪边，更要看谁在票数失败后急着甩锅。`,
        mediator: `我投了${vote}。这一轮先把理由说清楚，别让分歧扩大成误放逐。`,
        principled: `我投了${vote}。我的选择延续前面的原则，突然摇摆的人需要解释清楚。`,
        opportunist: `我投了${vote}。我会跟着更能形成共识的一边走，但谁借机带节奏也很可疑。`
      };
      return lines[this.personality] || lines.recorder;
    }

    const targets = context.aliveIds.filter((id) => id !== this.id);
    const target = targets[(this.id + this.stanceHistory.length) % targets.length];
    return JSON.stringify({ target, reason: '发言和局势不够一致。' });
  }

  revealRole() {
    return this.role === 'order' ? '守序方' : '破坏者';
  }
}

module.exports = Player;
