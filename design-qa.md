# Werewolf v2 Player Roster Design QA

- source visual truth path: `C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-1fb3e006-9512-4d77-8ff7-de94872eb3f7.png`
- implementation route: `http://localhost:5173/game/v2/werewolf`
- implementation screenshot path: `artifacts/werewolf-v2-roster-spaced.png`
- viewport: 1918 x 1249 desktop
- state: player perspective, day 1 night, debug playback

**Findings**

- No actionable P0/P1/P2 mismatch remains for the requested player-information treatment.
- Product-only differences are intentional: room, readiness, network and microphone indicators from the visual reference are omitted because no corresponding game state exists.

**Required fidelity surfaces**

- Fonts and typography: seat number, nickname and authorized identity use the reference's compact hierarchy without clipping.
- Spacing and layout rhythm: twelve transparent player nodes form two curved half-rings with larger vertical gaps and a narrower center-to-center span than the previous card columns.
- Colors and visual tokens: blue avatar/seat outlines remain neutral; the viewer receives the existing role accent only.
- Image quality and asset fidelity: existing player avatars remain sharp circular assets over the moonlit lake background.
- Copy and content: hidden identities render no label; permission explanations and AI-operation hints are absent.

**Full-view comparison evidence**

- The reference image and the browser-rendered implementation screenshot were opened together in one comparison input.
- Both show numbered circular avatars flanking a clear central game stage; the implementation adapts the reference into the requested curved arrangement.

**Focused region comparison evidence**

- Left roster: seats 1-6 show number, avatar and nickname; only the viewer's authorized role appears.
- Right roster: seats 7-12 use the same treatment with no card container or hidden-role placeholder.
- Top-left: the previous full-height perspective rail is replaced by the real mode name.
- Center and footer: both explanatory UI hints requested for removal are absent.

**Primary interactions tested**

- Open start configuration.
- Select Player perspective and debug playback.
- Start a 12-player match.
- Verify all 12 seat buttons remain selectable and Player perspective exposes only the viewer role.

**Console and build check**

- Vite production build passed.
- Four targeted v2 interaction/navigation tests passed.
- No new runtime console error was introduced by the roster change.

**Comparison history**

- Pass 1: player data used full-width cards, a persistent left perspective rail and hidden-role placeholders.
- Fix: remove the rail and card surfaces, add curved per-seat offsets, widen vertical gaps, move the mode label to the top-left and omit unauthorized role text.
- Pass 2: browser capture confirms the requested lightweight ring layout and clean game-only copy.
- Pass 3: increased desktop seat gaps to 36-52px (and 22-34px at the 1360px breakpoint); browser capture confirms the six seats now use the full vertical play area without overflow.

## Start Configuration Dialog QA

- implementation screenshot path: `artifacts/werewolf-v2-setup-dialog.png`
- state: start configuration open, 12 players selected, god perspective and debug playback selected
- The selected moonlit visual reference does not include an exact configuration-dialog state; this pass therefore checks visual-language consistency, information hierarchy and interaction density rather than pixel parity.
- Mode selection and player selection are arranged as a compact two-column workspace; twelve players use a scannable three-column grid.
- Perspective and debug settings are grouped in a single bottom row, with the primary start action isolated in the footer.
- Browser measurements report no horizontal or vertical overflow for the dialog or its setup grid at the 1918 x 1249 viewport.
- All expected configuration controls remain present and the browser console reports no runtime errors.
- The override is scoped to `.werewolf-shell--v2`, so the shared v1 dialog retains its existing presentation.

previous result: passed

## Thinking And Subtitle Responsibility QA

- source visual truth path: `C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-0ff860e9-8eef-4aac-81b6-b1f2e52bf8fe.png`
- implementation route: `http://localhost:5173/game/v2/werewolf`
- implementation screenshot path: `artifacts/werewolf-v2-thinking-subtitle-layout.png`
- viewport: 1280 x 720 desktop
- source state: wolf-team speech with both central and bottom subtitle copies
- implementation state: replay opened at the first night host announcement

**Findings**

- [P2] Active speech state could not be captured for pixel comparison.
  Evidence: the source shows an active wolf speech, while the local replay remains on its first ACK-backed host announcement. The browser-rendered implementation therefore cannot prove the final thinking panel and bottom subtitle together in the same state.
  Impact: component behavior and layout constraints are tested, but active-state visual fidelity remains unverified.
  Fix: capture the same speech event after replay ACK progression is available, then compare the central thinking panel and bottom subtitle at the same viewport.

**Required fidelity surfaces**

- Fonts and typography: the implementation keeps existing v2 sizes and weights; thinking copy is explicitly left aligned.
- Spacing and layout rhythm: the central narrative is capped at `min(24vh, 190px)` and scrolls internally, preserving the bottom subtitle safe area.
- Colors and visual tokens: the thinking panel reuses the existing blue moonlit border, background and text opacity.
- Image quality and asset fidelity: no image assets changed; existing background and player avatars are reused.
- Copy and content: the stage resolves `thinking -> fullText/text -> interaction detail`; the bottom bar remains the complete subtitle surface.

**Comparison history**

- Pass 1: source and browser capture were opened together; the active interaction states did not match.
- Fix implemented: remove direct `speech.text` rendering from the stage, add tested narrative priority, left alignment, maximum height and internal scrolling.
- Post-fix evidence: seven interaction-state tests pass; the active speech visual state remains blocked by replay progression.

final result: blocked

## Role Interaction Visuals QA

- source visual truth paths:
  - `C:\Users\Administrator\.codex\generated_images\019f4fd3-e845-7d42-98e0-10925c9b02b0\exec-e32b5367-be53-463d-beeb-ec01d19a4ba7.png` (wolf / seer)
  - `C:\Users\Administrator\.codex\generated_images\019f4fd3-e845-7d42-98e0-10925c9b02b0\exec-82e6d22d-a940-4e30-b609-16279ec055db.png` (witch / guard)
  - `C:\Users\Administrator\.codex\generated_images\019f4fd3-e845-7d42-98e0-10925c9b02b0\exec-1ee58d6a-a0f4-41c2-b665-ff07bc24122b.png` (hunter / white wolf king / knight)
  - `C:\Users\Administrator\.codex\generated_images\019f4fd3-e845-7d42-98e0-10925c9b02b0\exec-6bd5c1cf-15dd-4e14-884a-174e543195fd.png` (sheriff states)
- implementation route: `http://localhost:5173/game/v2/werewolf`
- implementation screenshot path: `artifacts/werewolf-v2-role-interactions.png`
- viewport: 1440 x 900 desktop

**Implemented fidelity surfaces**

- Core actions use distinct icon, color, transition and three-stage progress treatments for wolf, seer, witch, guard, hunter, self-destruct, knight, idiot and sheriff interactions.
- Result text is event-backed and appears only after a resolved event; no target or result is inferred on the client.
- Seat status is reduced to one prominent public badge with explicit speaking, sheriff, candidate, withdrawn, revealed and eliminated treatments.
- Host announcements and idle preparation events do not render the generic role-skill animation.
- The page has no horizontal or vertical overflow at the audited desktop viewport.

**Verification evidence**

- The browser rendered the updated v2 route at 1440 x 900 without layout overflow.
- Browser inspection caught an initial false-positive generic skill animation on the preparation announcement; the idle-template guard was added and the follow-up inspection reports zero role visuals for the idle state.
- Fifteen focused v2 interaction tests, the complete 193-test unit suite, the client TypeScript check and the production build pass.

**Remaining same-state visual limitation**

- [P2] A live role-action screenshot could not be captured in this run because the debug match did not advance from the host/preparation sequence into a role action before the audit ended. The event mapping and rendering boundary are covered by tests, but the exact wolf/seer/witch/guard same-state pixel comparison remains pending a replay or live event that reaches one of those actions.

final result: blocked

## Single Speech Outlet QA

- source visual truth path: `C:\Users\Administrator\.codex\generated_images\019f4fd3-e845-7d42-98e0-10925c9b02b0\exec-45caa87f-cfbb-4983-84d4-afe8b3f03d7f.png`
- implementation route: `http://localhost:5173/game/v2/werewolf`
- implementation screenshot path: `artifacts/werewolf-v2-speech-single-outlet-blocked.png`
- viewport: 1280 x 720 desktop
- source state: witch wake action with one host subtitle at the bottom
- implementation state: game preparation; server returned no enabled werewolf modes

**Findings**

- [P2] The matching witch speech state cannot be captured.
  Evidence: the current start dialog reports that no werewolf mode is enabled, so the browser cannot enter a speech or night-skill state.
  Impact: source-level responsibility checks, TypeScript and interaction tests pass, but pixel-level comparison of the final subtitle bar remains unavailable.
  Fix: enable an existing werewolf mode, start or replay the witch action, then capture the same 1280 x 720 state.

**Required fidelity surfaces**

- Fonts and typography: the bottom copy uses the existing v2 font stack at 14-18px with 1.45 line height; central speech typography was removed.
- Spacing and layout rhythm: the subtitle bar is reduced to a 78px minimum height and separates speaker identity from copy with one divider.
- Colors and visual tokens: the bar reuses the existing midnight-blue glass surface, cyan border and green speaking accent.
- Image quality and asset fidelity: existing player avatar assets are reused; host speech uses the existing microphone icon because no host avatar is exposed to this component.
- Copy and content: speech text now exists only in `WerewolfBottomSpeechBar`; the central stage retains phase, action status and target relations.

**Focused region comparison evidence**

- Source: bottom subtitle contains host identity, one sentence and one cursor; the center contains only the witch action.
- Implementation code: the central speaker/narrative blocks were removed and the bottom bar owns avatar, seat/name, split lines and cursor.
- Browser evidence: the updated idle stage loads without layout overflow, but the required active speech region is absent because game start is blocked.

**Comparison history**

- Pass 1: the original implementation rendered the same sentence in the central title, central narrative and bottom subtitle.
- Fix: remove central speaker/narrative rendering and move identity plus the sole subtitle into the compact bottom bar.
- Post-fix evidence: sixteen targeted tests pass and the relaxed client type check passes; same-state browser comparison remains blocked by missing enabled modes.

final result: blocked
