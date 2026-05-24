# Debate Agent + Skill Research

## Summary

This document evaluates changing AI debate from the current single-runner implementation into an Agent + Skill model, then evolving the project toward a shared agent core where games, players, and roles can all register skills.

Recommended path:

1. Fix small debate behavior issues independently.
2. Refactor debate into `DebateGameAgent + DebateAgent + DebateSkillRegistry`.
3. Extract a shared `agent-core` only after debate and werewolf converge on stable contracts.
4. Add runtime skill registration for players, roles, and games as a later capability.

## Current State

Debate currently lives mostly in `server/aiDebateRunner.js`. Players are plain objects with `messages`, `side`, `sideIndex`, and debate role metadata. Phase logic, prompt building, speech collection, serialization, memory sync, host calls, and result generation are all handled in one file.

Werewolf already has a partial Agent + Skill shape:

- `server/modules/werewolf/playerAgent.js` wraps LLM calls with `askText`, `askJson`, `askVoteTarget`, thinking support, and fallback reporting.
- `server/modules/werewolf/agents/hostAgent.js` wraps host announcements.
- `shared/schemas/skillRegistry.js` provides a small generic `SkillRegistry`.
- `server/modules/werewolf/roles.js` registers role actions such as `kill`, `inspectFaction`, `guard`, `save`, `poison`, and `shootOnDeath`.
- `server/modules/werewolf/service.js` owns game lifecycle as `WerewolfGameAgent`.

The existing shape proves the approach is feasible, but it is still domain-specific. The codebase does not yet have a shared abstraction for all games, players, and skills.

## Feasibility

Debate Agent + Skill conversion is feasible with low to medium risk. Debate has a linear phase flow, clear action names, and existing prompts that can be moved behind skills without changing WebSocket events or saved game shape.

Generalizing all games and players into a shared intelligent-agent system is feasible with medium to high risk. It should not be done in one large pass because it touches game lifecycle, player memory, skill execution, fallback policy, observability, and future admin registration.

The main design constraint is to keep game-specific rules in game modules. A shared agent core should define execution contracts, not debate or werewolf rules.

## Target Debate Structure

Proposed first-stage debate module layout:

```txt
server/modules/debate/
  service.js          # DebateGameAgent and runDebateGame entrypoint
  playerAgent.js      # DebateAgent wrapper for debaters and judges
  skillRegistry.js    # Debate-specific skill registration
  phases.js           # Phase orchestration
  prompts.js          # Role names and system/host prompts
  speech.js           # Speech collection and emission helpers
  utils.js            # Topic, team, serialization, report helpers
  constants.js        # PHASES, TOPICS, limits
  index.js            # Public exports
```

`server/aiDebateRunner.js` can then become a compatibility wrapper or be removed after `game-socket` imports the module entrypoint directly.

## Debate Skills

Initial debate skills should map to current phase actions:

| Skill | Actor | Output |
| --- | --- | --- |
| `strategize` | captain | team strategy speech |
| `opening_argue` | first debater | opening statement |
| `crossfire_question` | second/third debater | question text |
| `crossfire_answer` | second/third debater | answer text |
| `free_speech` | debater | free debate speech |
| `closing_summary` | fourth debater | closing statement |
| `judge_review` | judge | `{ winner, text }` |
| `vote_mvp` | debater | `{ target }` |
| `postgame_speech` | debater | postgame speech |

Each skill should use a context object:

```js
{
  actor,
  phase,
  gameState,
  memory,
  emit,
  fallback
}
```

This keeps prompts and fallback behavior near the action while preserving phase orchestration in `phases.js`.

## Future Shared Agent Core

After debate is modularized, introduce `server/modules/agent-core/` with small contracts:

```txt
server/modules/agent-core/
  gameAgent.js        # lifecycle base helpers: run, emit, serialize conventions
  playerAgent.js      # common LLM wrapper methods
  skillRegistry.js    # shared registry contract or re-export
  skillContext.js     # context normalization helpers
  fallback.js         # common fallback audit helpers
```

Suggested public contract:

- `GameAgent.run()`
- `GameAgent.emit(event)`
- `GameAgent.serialize(patch)`
- `PlayerAgent.askText(prompt, options)`
- `PlayerAgent.askJson(prompt, options)`
- `PlayerAgent.callWithThinking(prompt, maxTokens)`
- `SkillRegistry.register(skill)`
- `SkillRegistry.execute(action, context)`

The shared layer should not know debate phases, werewolf roles, win conditions, or visibility policies. Those remain in each game module.

## Migration Plan

### Phase 1: Debate Module Split

Move debate helper functions from `server/aiDebateRunner.js` into focused files under `server/modules/debate/` without changing runtime behavior. Keep event payloads, game serialization, observability, and saved data stable.

### Phase 2: Debate Agent + Skill

Add `DebateAgent` and `createDebateSkillRegistry()`. Convert phase logic from direct `collectSpeech()` calls to `skillRegistry.execute(action, context)`. Add fallback audit behavior aligned with werewolf.

### Phase 3: Shared Agent Core

Extract common player LLM calls, fallback handling, skill execution span hooks, and context normalization. Keep debate and werewolf-specific rule logic in their own modules.

### Phase 4: Registrable Skills

Allow players, roles, and games to register additional skills. Admin configuration can later bind skills to player profiles, game modes, or roles. This needs validation, versioning, and rollback rules before exposing it in UI.

## Risks

- Over-generalizing too early can make both games harder to reason about.
- Skill registration needs validation because bad skills can break game flow or expose private information.
- Shared memory and visibility rules differ by game; they should not be flattened into one generic policy too soon.
- Observability should be integrated at skill execution boundaries, but only after skill execution is stable.

## Acceptance Criteria

- Debate behavior remains stable after module split.
- Closing speech order is `con[3]` then `pro[3]`.
- Debate skills can be tested independently from WebSocket transport.
- Existing saved game records, trace records, and frontend event consumers continue to work.
- The shared agent core is introduced only after at least two game modules use compatible contracts.
