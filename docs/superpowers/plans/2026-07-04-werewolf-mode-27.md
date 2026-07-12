# Werewolf Mode 27: Ghost Bride & Thief

## Scope

- Add `ghost-bride-thief-12` as a 12-player werewolf mode.
- Add `ghost_bride` first-night linking, private night chat, and late-game kill actions.
- Reuse the existing action-window, lover death chain, third-party win, debug action, and client snapshot pipelines.
- Do not add a generic private chat subsystem.

## Rules

- First night, Ghost Bride chooses a groom and a witness.
- Ghost Bride and groom become lovers and switch to `third_party`; the witness also switches to `third_party`.
- Each night after linking, living Ghost Bride group members get a private chat action.
- If no normal wolves are alive, the living bride/groom side can kill one non-third-party player at night.
- If bride and groom are both dead, the living witness inherits the kill.
- The third-party group wins when all alive players are from that group.

## Verification

- Reducer tests cover link, chat participants, kill actor, and kill target recording.
- Effect tests cover Ghost Bride kill death and witness-only third-party victory.
- Debug action tests cover legal link, chat, and kill payloads.
