/** 阵营 key → 展示名；没有登记的阵营直接显示 key */
export const TEAM_LABELS: Readonly<Record<string, string>> = {
  werewolf: '狼人',
  good: '好人',
  lone_wolf: '独狼',
  third: '第三方',
  lovers: '情侣',
  pro: '正方',
  con: '反方',
  judge: '评委',
};

/** 窗口至少这么宽时，对局记录侧栏默认展开 */
export const DRAWER_OPEN_MIN_WIDTH = 1440;

/** 发言顺序条最多显示的座位数，更早的折叠成省略号 */
export const SPEECH_ORDER_LIMIT = 6;

/** 断线重连：首次等 1 秒，之后翻倍，封顶 15 秒（1、2、4、8、15 秒） */
export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_MS = 15_000;
/** 连续失败这么多次（含首次连接）后不再自动重连，改为报错并提供手动重试；五次重连约 30 秒 */
export const MAX_CONNECT_FAILURES = 6;
export const CONNECTION_LOST_MESSAGE = '连接中断，请刷新重试';
