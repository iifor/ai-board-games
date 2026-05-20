import { getPlayerAvatar } from '../../utils/player';
import { sortReportPlayers, cleanPosterText } from './debateUtils';

const DEBATE_RESULT_POSTER_DESIGN = { width: 1672, height: 941 };
const DEBATE_RESULT_DEBATER_SLOTS = {
  pro: [
    { x: 98, avatarY: 355, nameY: 552, roleY: 590, radius: 58 },
    { x: 258, avatarY: 360, nameY: 557, roleY: 595, radius: 58 },
    { x: 410, avatarY: 365, nameY: 562, roleY: 600, radius: 58 },
    { x: 555, avatarY: 370, nameY: 567, roleY: 605, radius: 58 }
  ],
  con: [
    { x: 1130, avatarY: 370, nameY: 552, roleY: 590, radius: 58 },
    { x: 1285, avatarY: 360, nameY: 557, roleY: 595, radius: 58 },
    { x: 1435, avatarY: 360, nameY: 562, roleY: 600, radius: 58 },
    { x: 1580, avatarY: 355, nameY: 567, roleY: 605, radius: 58 }
  ]
};
const DEBATE_RESULT_JUDGE_SLOTS = [
  { x: 702, avatarY: 834, nameY: 910, radius: 42 },
  { x: 848, avatarY: 834, nameY: 910, radius: 42 },
  { x: 992, avatarY: 834, nameY: 910, radius: 42 }
];
const DEBATE_RESULT_ROLE_LABELS = ['一辩', '二辩', '三辩', '四辩'];

export async function createDebateResultPoster(report) {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = DEBATE_RESULT_POSTER_DESIGN.width;
  canvas.height = DEBATE_RESULT_POSTER_DESIGN.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await drawDebateResultPosterBackground(ctx, canvas.width, canvas.height);
  drawDebateResultPosterFrames(ctx);
  await drawDebateResultPosterAvatars(ctx, report);
  drawDebateResultPosterText(ctx, report);

  try {
    return canvas.toDataURL('image/png');
  } catch (error) {
    return '';
  }
}

async function drawDebateResultPosterBackground(ctx, width, height) {
  try {
    const image = await loadPosterImage('/resources/debate_result_poster_bg.png');
    ctx.drawImage(image, 0, 0, width, height);
  } catch (error) {
    // Background is optional; keep the poster information layer usable without it.
  }
}

function drawDebateResultPosterFrames(ctx) {
  DEBATE_RESULT_DEBATER_SLOTS.pro.forEach((slot) => drawPosterAvatarPlaceholder(ctx, slot, 'pro'));
  DEBATE_RESULT_DEBATER_SLOTS.con.forEach((slot) => drawPosterAvatarPlaceholder(ctx, slot, 'con'));
  DEBATE_RESULT_JUDGE_SLOTS.forEach((slot) => drawPosterAvatarPlaceholder(ctx, slot, 'judge'));
}

function drawPosterAvatarPlaceholder(ctx, slot, tone) {
  const color = tone === 'con' ? 'rgba(255, 96, 106, 0.78)' : tone === 'judge' ? 'rgba(240, 226, 255, 0.72)' : 'rgba(86, 168, 255, 0.78)';
  ctx.save();
  ctx.fillStyle = tone === 'con' ? 'rgba(55, 8, 12, 0.34)' : tone === 'judge' ? 'rgba(24, 18, 36, 0.34)' : 'rgba(8, 25, 58, 0.34)';
  ctx.beginPath();
  ctx.arc(slot.x, slot.avatarY, slot.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(slot.x, slot.avatarY, slot.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function loadPosterImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:/i.test(src)) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawDebateResultPosterText(ctx, report) {
  drawPosterBoxText(ctx, report.topic || 'AI 辩论赛', {
    x: 436,
    y: 105,
    width: 800,
    height: 155,
    maxLines: 2,
    maxSize: 60,
    minSize: 34,
    lineHeight: 72,
    color: '#ffffff',
    weight: '950',
    align: 'center',
    shadow: true
  });

  drawPosterSingleLine(ctx, '正方', 90, 718, 150, 46, 32, '#ffffff', '950', 'left');
  drawRotatedPosterBoxText(ctx, report.proPosition || '正方立场', {
    x: 90,
    y: 735,
    width: 520,
    height: 70,
    angle: -2.5,
    maxLines: 2,
    maxSize: 34,
    minSize: 22,
    lineHeight: 42,
    color: '#ffffff',
    weight: '800',
    align: 'left',
    shadow: true
  });
  drawPosterSingleLine(ctx, '反方', 1580, 718, 150, 46, 32, '#ffffff', '950', 'right');
  drawRotatedPosterBoxText(ctx, report.conPosition || '反方立场', {
    x: 1060,
    y: 735,
    width: 520,
    height: 70,
    angle: 2.5,
    maxLines: 2,
    maxSize: 34,
    minSize: 22,
    lineHeight: 42,
    color: '#ffffff',
    weight: '800',
    align: 'right',
    shadow: true
  });

  drawPosterLineup(ctx, 'pro', sortReportPlayers(report.proLineup || []), '#ffffff', '#dbeaff');
  drawPosterLineup(ctx, 'con', sortReportPlayers(report.conLineup || []), '#ffffff', '#ffb8b8');
  drawPosterJudges(ctx, sortReportPlayers(report.judges || []));
}

function drawPosterLineup(ctx, side, players, nameColor, roleColor) {
  const slots = DEBATE_RESULT_DEBATER_SLOTS[side] || [];
  slots.forEach((slot, index) => {
    const player = players[index];
    const name = getPosterPlayerName(player) || `${index + 1}号`;
    drawPosterSingleLine(ctx, name, slot.x, slot.nameY, 144, 23, 16, nameColor, '900', 'center');
    drawPosterSingleLine(ctx, DEBATE_RESULT_ROLE_LABELS[index], slot.x, slot.roleY, 96, 21, 16, roleColor, '850', 'center');
  });
}

function drawPosterJudges(ctx, judges) {
  DEBATE_RESULT_JUDGE_SLOTS.forEach((slot, index) => {
    const judge = judges[index];
    const name = judge ? getPosterPlayerName(judge) : '';
    if (!name) return;
    drawPosterSingleLine(ctx, name, slot.x, slot.nameY, 112, 19, 14, '#f6f0ff', '850', 'center');
  });
}

async function drawDebateResultPosterAvatars(ctx, report) {
  const proPlayers = sortReportPlayers(report.proLineup || []);
  const conPlayers = sortReportPlayers(report.conLineup || []);
  const judgePlayers = sortReportPlayers(report.judges || []).slice(0, 3);
  const tasks = [
    ...DEBATE_RESULT_DEBATER_SLOTS.pro.map((slot, index) => drawCircularAvatar(ctx, proPlayers[index], slot, 'pro')),
    ...DEBATE_RESULT_DEBATER_SLOTS.con.map((slot, index) => drawCircularAvatar(ctx, conPlayers[index], slot, 'con')),
    ...DEBATE_RESULT_JUDGE_SLOTS.map((slot, index) => drawCircularAvatar(ctx, judgePlayers[index], slot, 'judge'))
  ];
  await Promise.all(tasks);
}

async function drawCircularAvatar(ctx, player, slot, fallbackTone) {
  const src = formatAvatarUrl(player?.avatar);
  if (!src) return;
  try {
    const image = await loadPosterImage(src);
    const diameter = slot.radius * 2;
    const sourceSize = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
    const sourceX = ((image.naturalWidth || image.width) - sourceSize) / 2;
    const sourceY = ((image.naturalHeight || image.height) - sourceSize) / 2;
    const avatarCanvas = document.createElement('canvas');
    avatarCanvas.width = diameter;
    avatarCanvas.height = diameter;
    const avatarCtx = avatarCanvas.getContext('2d');
    if (!avatarCtx) return;
    avatarCtx.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, diameter, diameter);
    avatarCanvas.toDataURL('image/png');
    ctx.save();
    ctx.beginPath();
    ctx.arc(slot.x, slot.avatarY, slot.radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarCanvas, slot.x - slot.radius, slot.avatarY - slot.radius, diameter, diameter);
    ctx.restore();
    drawAvatarRing(ctx, slot, fallbackTone);
  } catch (error) {
    // Avatar drawing is best-effort; keep the poster usable if an image cannot load.
  }
}

function drawAvatarRing(ctx, slot, tone) {
  const color = tone === 'con' ? 'rgba(255, 88, 92, 0.82)' : tone === 'judge' ? 'rgba(232, 213, 255, 0.72)' : 'rgba(76, 159, 255, 0.82)';
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(slot.x, slot.avatarY, slot.radius + 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawRotatedPosterBoxText(ctx, text, options) {
  const { x, y, width, height, angle = 0 } = options;
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate((angle * Math.PI) / 180);
  drawPosterBoxText(ctx, text, {
    ...options,
    x: -width / 2,
    y: -height / 2
  });
  ctx.restore();
}

function drawPosterBoxText(ctx, text, options) {
  const {
    x,
    y,
    width,
    height,
    maxLines,
    maxSize,
    minSize,
    lineHeight,
    color,
    weight,
    align = 'left',
    shadow = false
  } = options;
  const clean = cleanPosterText(text);
  let size = maxSize;
  let lines = [];
  do {
    ctx.font = `${weight} ${size}px "Microsoft YaHei", "PingFang SC", Arial, sans-serif`;
    lines = wrapCanvasText(ctx, clean, width, maxLines);
    if (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= width)) break;
    size -= 2;
  } while (size > minSize);
  const actualLineHeight = Math.min(lineHeight, size + 14);
  const blockHeight = Math.min(height, lines.length * actualLineHeight);
  const startY = y + Math.max(0, (height - blockHeight) / 2) + size;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Microsoft YaHei", "PingFang SC", Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
  }
  const textX = align === 'center' ? x + width / 2 : align === 'right' ? x + width : x;
  lines.slice(0, maxLines).forEach((line, index) => {
    ctx.fillText(line, textX, startY + index * actualLineHeight);
  });
  ctx.restore();
}

function drawPosterSingleLine(ctx, text, x, y, width, maxSize, minSize, color, weight, align = 'center') {
  let size = maxSize;
  const clean = cleanPosterText(text);
  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.82)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  do {
    ctx.font = `${weight} ${size}px "Microsoft YaHei", "PingFang SC", Arial, sans-serif`;
    if (ctx.measureText(clean).width <= width || size <= minSize) break;
    size -= 1;
  } while (size > minSize);
  const display = truncateCanvasText(ctx, clean, width);
  ctx.fillText(display, x, y);
  ctx.restore();
}

function truncateCanvasText(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let next = text;
  while (next.length > 1 && ctx.measureText(`${next}...`).width > width) next = next.slice(0, -1);
  return `${next}...`;
}

function wrapCanvasText(ctx, text, width, maxLines) {
  const chars = String(text || '').split('');
  const lines = [];
  let line = '';
  chars.forEach((char) => {
    const next = `${line}${char}`;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = char;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const limited = lines.slice(0, maxLines);
    let last = limited[limited.length - 1];
    while (last.length > 1 && ctx.measureText(`${last}...`).width > width) last = last.slice(0, -1);
    limited[limited.length - 1] = `${last}...`;
    return limited;
  }
  return lines;
}

function getPosterPlayerName(player) {
  return player?.nickname || player?.name || (player?.id ? `${player.id}号` : '暂未产生');
}

export function downloadResultPoster(dataUrl, report) {
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `AI辩论赛赛后海报-${safePosterFileName(report.topic)}.png`;
  link.click();
}

function safePosterFileName(value) {
  return String(value || '未命名辩题').replace(/[\\/:*?"<>|]/g, '').slice(0, 18);
}

function formatAvatarUrl(value) {
  const src = String(value || '').trim();
  if (!src) return '';
  if (/^https?:\/\/|^data:|^blob:|\//i.test(src)) return src;
  return `/avatars/${src}`;
}
