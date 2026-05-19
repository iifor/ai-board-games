import { getPlayerAvatar } from '../../utils/player';
import { sortReportPlayers, formatReportNames, cleanPosterText, compactPosterText } from './debateUtils';

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

export function createDebatePoster(report, variant) {
  if (typeof document === 'undefined') return '';
  const vertical = variant === 'vertical';
  const canvas = document.createElement('canvas');
  canvas.width = vertical ? 1080 : 1600;
  canvas.height = vertical ? 1920 : 900;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  drawPosterBackground(ctx, canvas.width, canvas.height, report.winner);
  if (vertical) drawVerticalPoster(ctx, report, canvas.width, canvas.height);
  else drawWidePoster(ctx, report, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

function drawPosterBackground(ctx, width, height, winner) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#071225');
  bg.addColorStop(0.5, '#132442');
  bg.addColorStop(1, '#1b1029');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = winner === 'pro' ? 'rgba(37, 128, 255, 0.28)' : 'rgba(255, 77, 128, 0.22)';
  ctx.beginPath();
  ctx.arc(width * 0.18, height * 0.12, width * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = winner === 'con' ? 'rgba(255, 77, 128, 0.26)' : 'rgba(69, 219, 255, 0.18)';
  ctx.beginPath();
  ctx.arc(width * 0.86, height * 0.86, width * 0.34, 0, Math.PI * 2);
  ctx.fill();
}

function drawVerticalPoster(ctx, report, width, height) {
  let y = 110;
  drawPosterKicker(ctx, 'AI 辩论赛战报', 72, y);
  y += 92;
  y = drawWrappedPosterText(ctx, report.topic || 'AI 辩论赛', 72, y, width - 144, 64, '#ffffff', 3, 78);
  y += 28;
  drawWinnerPill(ctx, report.winnerLabel, 72, y, report.winner);
  drawPosterText(ctx, `最佳辩手 ${getPosterPlayerName(report.mvp)}`, 420, y + 34, 36, '#f6dc85', '900');
  y += 120;
  y = drawPosterPositions(ctx, report, 72, y, width - 144);
  y += 36;
  y = drawLineupBlock(ctx, '正方阵容', report.proLineup, 72, y, width - 144, '#5db8ff');
  y = drawLineupBlock(ctx, '反方阵容', report.conLineup, 72, y + 20, width - 144, '#ff7aa7');
  y = drawLineupBlock(ctx, '评委阵容', report.judges, 72, y + 20, width - 144, '#d6b4ff');
  y += 28;
  y = drawPosterSection(ctx, '胜负理由', report.winReason || '评委综合双方论证质量、反驳力度和团队协作给出结果。', 72, y, width - 144, 44, 3);
  y += 22;
  y = drawPosterList(ctx, '精彩金句', report.highlights.map((item) => item.text), 72, y, width - 144, 2);
  y += 22;
  drawPosterList(ctx, '评委短评', report.judgeComments.map((item) => item.text), 72, y, width - 144, 2);
  drawPosterFooter(ctx, width, height);
}

function drawWidePoster(ctx, report, width, height) {
  drawPosterKicker(ctx, 'AI 辩论赛战报', 72, 80);
  drawWrappedPosterText(ctx, report.topic || 'AI 辩论赛', 72, 150, 740, 54, '#ffffff', 3, 64);
  drawWinnerPill(ctx, report.winnerLabel, 72, 365, report.winner);
  drawPosterText(ctx, `最佳辩手 ${getPosterPlayerName(report.mvp)}`, 350, 399, 36, '#f6dc85', '900');
  drawPosterSection(ctx, '胜负理由', report.winReason || '评委综合双方论证质量、反驳力度和团队协作给出结果。', 72, 470, 690, 34, 3);
  drawPosterPositions(ctx, report, 850, 95, 670);
  drawLineupBlock(ctx, '正方阵容', report.proLineup, 850, 300, 670, '#5db8ff');
  drawLineupBlock(ctx, '反方阵容', report.conLineup, 850, 400, 670, '#ff7aa7');
  drawLineupBlock(ctx, '评委阵容', report.judges, 850, 500, 670, '#d6b4ff');
  drawPosterList(ctx, '精彩金句', report.highlights.map((item) => item.text), 850, 610, 670, 2);
  drawPosterList(ctx, '评委短评', report.judgeComments.map((item) => item.text), 72, 640, 690, 2);
  drawPosterFooter(ctx, width, height);
}

function drawPosterPositions(ctx, report, x, y, width) {
  const gap = 20;
  const cardWidth = (width - gap) / 2;
  drawPosterCard(ctx, x, y, cardWidth, 150, '正方立场', report.proPosition, '#5db8ff');
  drawPosterCard(ctx, x + cardWidth + gap, y, cardWidth, 150, '反方立场', report.conPosition, '#ff7aa7');
  return y + 150;
}

function drawLineupBlock(ctx, title, players, x, y, width, color) {
  drawPosterText(ctx, title, x, y, 28, color, '900');
  drawWrappedPosterText(ctx, formatReportNames(players) || '暂无', x, y + 38, width, 30, '#edf6ff', 2, 34);
  return y + 92;
}

function drawPosterSection(ctx, title, text, x, y, width, fontSize, maxLines) {
  drawPosterText(ctx, title, x, y, 28, '#9edcff', '900');
  return drawWrappedPosterText(ctx, text, x, y + 42, width, fontSize, '#edf6ff', maxLines, fontSize + 10);
}

function drawPosterList(ctx, title, items, x, y, width, maxItems) {
  drawPosterText(ctx, title, x, y, 28, '#9edcff', '900');
  let nextY = y + 42;
  const list = items.length ? items : ['双方围绕核心标准持续交锋，完整呈现了一场 AI 辩论。'];
  list.slice(0, maxItems).forEach((item) => {
    nextY = drawWrappedPosterText(ctx, `"${item}"`, x, nextY, width, 32, '#ffffff', 2, 40) + 10;
  });
  return nextY;
}

function drawPosterCard(ctx, x, y, width, height, title, text, color) {
  ctx.fillStyle = 'rgba(8, 20, 42, 0.72)';
  roundRect(ctx, x, y, width, height, 18);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  drawPosterText(ctx, title, x + 24, y + 40, 26, color, '900');
  drawWrappedPosterText(ctx, text, x + 24, y + 82, width - 48, 30, '#ffffff', 2, 38);
}

function drawWinnerPill(ctx, text, x, y, winner) {
  const color = winner === 'con' ? '#ff5f97' : winner === 'pro' ? '#3fa2ff' : '#d6b4ff';
  ctx.fillStyle = color;
  roundRect(ctx, x, y, 260, 68, 34);
  ctx.fill();
  drawPosterText(ctx, text || '待公布', x + 34, y + 45, 34, '#ffffff', '950');
}

function drawPosterKicker(ctx, text, x, y) {
  drawPosterText(ctx, text, x, y, 30, '#9edcff', '900');
}

function drawPosterFooter(ctx, width, height) {
  ctx.globalAlpha = 0.72;
  drawPosterText(ctx, 'CONSENSUS · AI Debate Arena', 72, height - 70, 26, '#b8d9ff', '800');
  ctx.textAlign = 'right';
  drawPosterText(ctx, new Date().toLocaleDateString('zh-CN'), width - 72, height - 70, 26, '#b8d9ff', '800');
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

function drawPosterText(ctx, text, x, y, size, color, weight = '700') {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Microsoft YaHei", "PingFang SC", Arial, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(text || ''), x, y);
}

function drawWrappedPosterText(ctx, text, x, y, width, size, color, maxLines = 2, lineHeight = size + 8) {
  ctx.fillStyle = color;
  ctx.font = `800 ${size}px "Microsoft YaHei", "PingFang SC", Arial, sans-serif`;
  const lines = wrapCanvasText(ctx, cleanPosterText(text), width, maxLines);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
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

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function getPosterPlayerName(player) {
  return player?.nickname || player?.name || (player?.id ? `${player.id}号` : '暂未产生');
}

export function downloadPoster(dataUrl, report, ratio) {
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `AI辩论赛战报-${safePosterFileName(report.topic)}-${ratio}.png`;
  link.click();
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
