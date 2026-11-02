export interface RingSize {
  readonly width: number;
  readonly height: number;
}

export interface RingPoint {
  readonly x: number;
  readonly y: number;
}

export interface RingGeometry {
  /** 卡片缩放（1 = 原尺寸），小视口下为了不重叠按比例缩小 */
  readonly scale: number;
  /** 缩放后的卡片尺寸 */
  readonly card: RingSize;
  readonly radiusX: number;
  readonly radiusY: number;
  /** 各座位中心相对容器左上角的位置（px）：1 号在正上方，然后顺时针 */
  readonly seats: readonly RingPoint[];
}

export interface RingOptions {
  /** 相邻卡片之间至少留的间距 */
  readonly gap?: number | undefined;
  /** 卡片最小缩放 */
  readonly minScale?: number | undefined;
}

const SAMPLES = 720;
const SCALE_STEP = 0.05;
const TOP = -Math.PI / 2;

const point = (angle: number, radiusX: number, radiusY: number): RingPoint => ({ x: radiusX * Math.cos(angle), y: radiusY * Math.sin(angle) });

/** 椭圆上按弧长等分的角度（从正上方开始顺时针）：等角度会把两侧挤在一起，等弧长不会 */
export function equalArcAngles(count: number, radiusX: number, radiusY: number): number[] {
  if (count <= 0) return [];
  const lengths = [0];
  let prev = point(TOP, radiusX, radiusY);
  for (let i = 1; i <= SAMPLES; i += 1) {
    const next = point(TOP + (i / SAMPLES) * 2 * Math.PI, radiusX, radiusY);
    lengths.push((lengths[i - 1] ?? 0) + Math.hypot(next.x - prev.x, next.y - prev.y));
    prev = next;
  }
  const total = lengths[SAMPLES] ?? 0;
  const angles: number[] = [];
  let cursor = 0;
  for (let seat = 0; seat < count; seat += 1) {
    const target = (seat / count) * total;
    while (cursor < SAMPLES && (lengths[cursor + 1] ?? 0) < target) cursor += 1;
    angles.push(TOP + (cursor / SAMPLES) * 2 * Math.PI);
  }
  return angles;
}

function layout(count: number, box: RingSize, card: RingSize, scale: number): RingGeometry {
  const scaled = { width: card.width * scale, height: card.height * scale };
  const radiusX = Math.max(0, (box.width - scaled.width) / 2);
  const radiusY = Math.max(0, (box.height - scaled.height) / 2);
  const seats = equalArcAngles(count, radiusX, radiusY).map((angle) => {
    const offset = point(angle, radiusX, radiusY);
    return { x: box.width / 2 + offset.x, y: box.height / 2 + offset.y };
  });
  return { scale, card: scaled, radiusX, radiusY, seats };
}

const overlaps = (a: RingPoint, b: RingPoint, card: RingSize, gap: number) =>
  Math.abs(a.x - b.x) < card.width + gap && Math.abs(a.y - b.y) < card.height + gap;

function fits(geometry: RingGeometry, gap: number): boolean {
  const { seats, card } = geometry;
  return seats.every((seat, index) => {
    const next = seats[(index + 1) % seats.length];
    return !next || !overlaps(seat, next, card, gap);
  });
}

/**
 * 环形座位几何：卡片中心落在容器里尽量大的椭圆上（半径由容器与卡片尺寸决定），按弧长等分；
 * 相邻卡片放不下时逐级缩小卡片，直到 minScale（再小也放不下就接受重叠）。
 */
export function ringGeometry(count: number, box: RingSize, card: RingSize, options: RingOptions = {}): RingGeometry {
  const gap = options.gap ?? 6;
  const minScale = options.minScale ?? 0.6;
  if (count < 2) return layout(count, box, card, 1);
  const steps = Math.round((1 - minScale) / SCALE_STEP);
  let candidate = layout(count, box, card, 1);
  for (let step = 0; step <= steps; step += 1) {
    candidate = layout(count, box, card, 1 - step * SCALE_STEP);
    if (fits(candidate, gap)) return candidate;
  }
  return candidate;
}
