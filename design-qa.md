# Werewolf v2 Transparent Speaker Design QA

- source visual truth path:
  - `C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-a1ac2d1c-c0bb-4a04-8311-4b355780ea68.png`
  - `C:\Users\Administrator\Desktop\AI项目\CONSENSUS\.superpowers\brainstorm\1865-1784904306\content\transparent-layout-preview.png`
- implementation route: `http://127.0.0.1:5173/game/v2/werewolf`
- implementation screenshot paths:
  - `.superpowers/qa/werewolf-speaker-2048x1059.png`
  - `.superpowers/qa/werewolf-speaker-1920x1080.png`
  - `.superpowers/qa/werewolf-speaker-1440x810.png`
  - `.superpowers/qa/compare-before-after.png`
- source pixels: original problem `3840 x 1984`; confirmed transparent-layout preview `703 x 1032`
- viewport and implementation pixels:
  - CSS viewport/root `2048 x 1059`; IAB non-fullPage output `1966 x 1059`
  - CSS viewport/root `1920 x 1080`; output `1920 x 1080`
  - CSS viewport/root `1440 x 810`; output `1440 x 810`
- density normalization: no density resampling; screenshots were compared at their native IAB output size. The `2048 x 1059` backend capture omitted 82 px on the right, while DOM root and geometry remained `2048 x 1059`; this capture-backend crop is not a product layout defect.
- state: standard 12-player board, god view, debug mode, real workflow player-attributed speech; day and night states.

**Findings**

- No actionable P0/P1/P2 mismatch remains.
- The `2048 x 1059` screenshot backend cropped 82 px from the right edge. DOM measurements, the complete `1920 x 1080` and `1440 x 810` captures, and successful right-seat interaction confirm that the application itself did not clip the viewport.

**Required fidelity surfaces**

- Fonts and typography: the phase title, seat metadata, speaker identity, and subtitle keep a readable hierarchy without clipping, awkward wrapping, or density drift at all three viewports.
- Spacing and layout rhythm: at the `2048 x 1059` DOM viewport, left seats occupy x `203..454`, right seats x `1594..1845`, the cutout y `106..826`, and the subtitle y `853..964`; the 27 px cutout-to-subtitle gap preserves the intended safe area. The head remains below the phase bar.
- Colors and visual tokens: day captures retain the warm mountain/lake palette and night retains the dark moonlit palette; speaker and sheriff accents remain legible in both states.
- Image quality and asset fidelity: transparent cutouts show only the characters, with no source background rectangle, poster card, black border, or visible framing halo. Pale/dark hair and different clothing silhouettes remain natural against day and night scenes.
- Copy and content: the selected speaker identity, seat number, and workflow subtitle agree; the central legacy “正在发言” title is absent.
- Icons and controls: all 12 seats remain visible with consistent icon treatment; active speaker and sheriff badges remain distinguishable.
- Accessibility and reduced motion: seats remain real interactive controls. Left and right seat clicks opened the correct player details; no new motion or focus-blocking overlay was observed.

**Full-view comparison evidence**

- `.superpowers/qa/compare-before-after.png` places the original problem state and browser-rendered implementation in the same comparison input.
- Before: the character carried the source poster background, was enlarged under the phase bar, and was pressed into the subtitle region.
- After: the isolated character stands within the center safe area, the background/card framing is absent, and the phase bar, both seat columns, and subtitle remain unobstructed.
- Responsive captures confirm the same composition at `2048 x 1059`, `1920 x 1080`, and `1440 x 810`.

**Focused region comparison evidence**

- Center character: 文心一言 and 讯飞星火 covered day speech; 智谱清言 covered night speech. The session included at least three speakers with pale/dark hair and distinct clothing edges.
- Top and bottom safe areas: the character head clears the phase bar, the body clears the subtitle, and the measured `2048 x 1059` layout retains 27 px between them.
- Side seats: all 12 seats remain visible. Clicking left-side 豆包 and right-side Claude Code opened the corresponding player-detail panel.
- Focused inspection found no background rectangle, poster border, black edge, head clipping, or subtitle overlap.

**Console and interaction checks**

- Browser console: `error=[]`, `warn=[]`.
- Primary interactions:
  - entered `/game/v2/werewolf`
  - selected standard 12-player mode, god view, and debug mode
  - reached real workflow player speech
  - observed day and night states
  - observed at least three different speakers
  - clicked one left seat and one right seat; both opened the correct details

**Comparison history**

- Pass 0: the original implementation used a framed poster/background treatment and let the oversized character compete with the phase bar and subtitle.
- Fixes made in Tasks 1–4: add 13 transparent cutouts, select the cutout variant only for Werewolf v2 player speech, remove backdrop/card/caption framing, hide the center interaction layer during speech, and constrain the character to the safe area.
- Pass 1: IAB browser captures and the combined before/after comparison confirm that the earlier P1 framing/overlap mismatch is resolved. No actionable P0/P1/P2 issue remains.

**Implementation Checklist**

- [x] Verify 13 transparent cutouts.
- [x] Verify day and night speech states.
- [x] Verify three required desktop viewports.
- [x] Verify at least three speakers and varied hair/clothing edges.
- [x] Verify top/subtitle safe areas.
- [x] Verify left/right seat interaction.
- [x] Verify browser console.
- [x] Compare source and implementation in one combined input.

**Follow-up Polish**

- None required for acceptance.

final result: passed
