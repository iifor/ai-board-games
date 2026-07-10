# Werewolf Mode 29 Wolf Escape Design

## Goal

Add the 10-player `wolf-escape-10` mode as mode 29. Three Escape Hunters form a private team, discuss and vote for one shared night target, while the Seer, Witch, villagers, and protected wolves cooperate to eliminate all Escape Hunters.

Reference rules: <https://www.langrensha.net/strategy/2021081202.html>

## Scope

- Add mode `wolf-escape-10`, displayed as `狼狼大逃杀（10人）`.
- Add dedicated roles `escape_hunter`, `tamed_werewolf`, and `thick_wolf` so standard Hunter and Werewolf behavior remains unchanged.
- Reuse the existing action-window, AI/debug action, reducer, night-effect, death-resolution, presentation, playback, shared-event, and C-side state pipelines.
- Do not add database tables, REST routes, WebSocket start/control/ack fields, a separate game engine, or the `灯影预言家` mode.

## Lineup And Factions

- 3 `escape_hunter`: faction `hunters`; each has the shared night hunt action and the existing shoot-on-death ability. Witch poison disables the death shot.
- 2 `tamed_werewolf`: faction `good`; no night kill action. Their display name remains `狼人` and they count as protected wolves for the mode-specific win check.
- 1 `thick_wolf`: faction `good`; no night kill action. It counts as a protected wolf and has one layer of armor against the Escape Hunters' night hunt.
- 1 `seer`, 1 `witch`, and 2 `villager`: reuse their existing role definitions and actions.
- All living players retain the existing day speech, sheriff, exile vote, last-words, and postgame flow.

## Night Flow

1. Living Escape Hunters enter the private `escape_hunters` scope, see their teammates, and speak in seat order.
2. Every living Escape Hunter submits one vote for an alive non-hunter target.
3. The existing deterministic team-vote rule selects one target: highest tally wins, and a tie uses the same stable target ordering as the wolf vote flow.
4. The Seer checks one player. `escape_hunter` is reported as `狼人`; every other role in this mode is reported as `好人`.
5. The Witch sees the selected hunt target while antidote remains available, then uses the existing save-or-poison restrictions.
6. Night resolution applies the Escape Hunter target through the normal effect and death chain.

The mode stores dedicated night fields rather than overloading wolf-team state: hunter member/order data, speeches, choices, tally, target, and hunt reason. Private events use the existing scoped-channel policy and are visible only to the Escape Hunter team or god view before public resolution.

## Thick Wolf Armor

- `thick_wolf` starts with zero recorded night-hunt hits.
- The first unresolved `escape_hunter_hunt` hit increments the hit count, emits an armor-break event, and does not kill the Thick Wolf.
- A later unresolved night-hunt hit kills it through the normal death chain.
- Witch poison, exile, and daytime death shots ignore the armor and kill it immediately.
- An antidote prevents the hunt before armor is consumed.

## Death Shot

- A dead `escape_hunter` uses the existing death-resolution shot window and must choose one alive target when eligible.
- Death from Witch poison disables the shot, matching the current Hunter rule.
- A shot may kill any alive non-self player, including a protected wolf, and continues through the existing chained-death and win-check flow.

## Win Conditions

Mode 29 runs its mode-specific win check before standard side/parity checks:

- If no `tamed_werewolf` or `thick_wolf` remains alive, winner is `hunters`, displayed as `猎人阵营胜利`.
- Otherwise, if no `escape_hunter` remains alive, winner is `good`, displayed as `护狼阵营胜利`.
- If both conditions become true in the same chained-death resolution, `hunters` wins because the final hunt or death shot completed its elimination objective.
- Standard wolf parity, slaughter-side, and all-wolves-dead checks do not run for this mode.
- The winner is checked after every night death, exile, and death-shot resolution so chained deaths cannot leave the match running incorrectly.

## Debug Behavior

- Debug mode creates legal random speech and vote payloads for every living Escape Hunter.
- The night hunt is mandatory while at least one legal target exists; it does not use the optional special-skill probability.
- Existing random death-shot behavior is reused.
- Debug validation must cover a complete 10-player start, a shared hunt target, Thick Wolf armor breaking, both winner paths, and workflow completion.

## Client Surface

- Add labels and icons for the three dedicated roles and a winner label for `hunters`.
- Merge scoped hunt speech/vote events and the public hunt result into the current round snapshot.
- Reuse the existing actor/target highlight animation for the selected hunt target.
- Show a distinct Thick Wolf armor-break badge/animation when the first night hunt is absorbed.
- The client only renders server events and snapshots; it never calculates the vote winner, armor, deaths, or match winner.

## Expected Code Boundaries

- Server config/seed: mode, roles, executable action registration.
- Werewolf workflow: Escape Hunter team context, action windows, reducer state, target validation, night effect, death shot eligibility, mode-specific win check, debug actions, presentation, and view policy.
- Shared: scoped channel mapping and game event types.
- Client: serialized night/player fields, event merge, labels, badges, animation state, and winner copy.
- Docs: workflow, server, shared, client, and root mode backlog status.

No new production subsystem is required. One focused Escape Hunter team helper may be added if keeping the coordination logic in existing reducers would make that file less maintainable.

## Error Handling And Validation

- Ignore votes from dead actors, non-`escape_hunter` actors, duplicate actors, missing targets, dead targets, and hunter-team targets.
- If no legal vote survives validation, record no hunt target and continue the night without a death.
- Never consume Thick Wolf armor for an invalid target, a saved hunt, or a non-hunt death source.
- Keep private team details out of normal player views through the existing scope and view-policy filters.

## Tests

- Default config: exact 10-player lineup, dedicated role actions, and `wolf_escape` win condition.
- Reducer: only legal Hunter votes count and exactly one deterministic target is selected.
- Effects: first Thick Wolf hunt breaks armor, second hunt kills, antidote preserves armor, and other death sources bypass armor.
- Win check: all Hunters dead yields `good`; all protected wolves dead yields `hunters`; ordinary parity does not end the mode.
- Death resolution: Escape Hunter shoots unless poisoned.
- Debug: all living Hunters produce legal votes and the selected target is valid.
- Client: new events merge into round state and expose hunt/armor display state.
