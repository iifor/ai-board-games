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
