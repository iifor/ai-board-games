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
