import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const root = read("index.html");
const scenes = ["intro", "highlights", "modes", "debate", "admin", "finale"];

assert.match(root, /data-composition-id="consensus-promo"/);
assert.match(root, /data-duration="60"/);

for (const scene of scenes) {
  assert.match(root, new RegExp(`data-composition-src="compositions/${scene}\\.html"`));
  const html = read(`compositions/${scene}.html`);
  assert.match(html, new RegExp(`window\\.__timelines\\["promo-${scene}"\\]`));
  assert.match(html, /gsap\.timeline\(\{ paused: true/);
}

assert.match(read("compositions/highlights.html"), /演示对局片段/);
assert.match(read("compositions/finale.html"), /未来玩法/);
assert.match(read("compositions/admin.html"), /模型供应商/);

console.log("promo structure ok");
