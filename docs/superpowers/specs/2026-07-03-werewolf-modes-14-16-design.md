# Werewolf Modes 14-16 Design

Goal: add modes 14-16 from `狼人杀玩法.md` using the existing werewolf workflow, event, debug, and playback pipeline.

Scope:
- Add `big-bad-wolf-fortune-teller-12`, `hidden-wolf-crow-12`, and `bear-tamer-hidden-wolf-12`.
- Add roles: `big_bad_wolf`, `fortune_teller`, `hidden_wolf`, `crow`, `bear_tamer`.
- Reuse current `werewolf.action_window`, reducer/effects, death chain, presentation, shared event payloads, and C-side merge/display utilities.
- Do not add database tables, REST APIs, or WebSocket start/control/ack fields.

Rules:
- Fortune teller can mark one player once per game. The wolf team kill is constrained to the marked player and the two adjacent seats for that night.
- Big bad wolf is wolf-side, separate from the wolf team night action, and may make one extra night kill when it acts.
- Hidden wolf is wolf-side but is checked as good by seer. In mode 15 it can inherit kill ability after normal wolves are gone. In mode 16 it dies when all normal wolves are dead.
- Crow curses one player each night, cannot repeat the previous target, and the cursed player receives one extra exile vote the next day.
- Bear tamer announces roar at day start when alive and either adjacent seat is a wolf-side player.

Testing:
- Add reducer/effects tests for each new rule before implementation.
- Add default config tests for the three modes.
- Add debug action tests for the new skills.
- Run workflow tests after implementation.
