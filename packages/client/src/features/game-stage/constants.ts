/** 阵营 key → 展示名；没有登记的阵营直接显示 key */
export const TEAM_LABELS: Readonly<Record<string, string>> = {
  werewolf: '狼人',
  good: '好人',
  lone_wolf: '独狼',
  third: '第三方',
  lovers: '情侣',
  ghost_bride: '鬼魂新娘',
  requester: '祈求者',
  pro: '正方',
  con: '反方',
  judge: '评委',
};

/** 发言顺序条最多显示的座位数，更早的折叠成省略号 */
export const SPEECH_ORDER_LIMIT = 6;

/** 断线重连：首次等 1 秒，之后翻倍，封顶 15 秒（1、2、4、8、15 秒） */
export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_MS = 15_000;
/** 连续失败这么多次（含首次连接）后不再自动重连，改为报错并提供手动重试；五次重连约 30 秒 */
export const MAX_CONNECT_FAILURES = 6;
export const CONNECTION_LOST_MESSAGE = '连接中断，请刷新重试';

/** 控制条按钮上的快捷键提示：title 给鼠标悬停，aria-keyshortcuts 给辅助技术 */
export const SHORTCUT_HINTS = {
  pause: { title: '暂停 / 继续（空格）', keys: 'Space' },
  speed: { title: '倍速（← 减慢 / → 加快）', keys: 'ArrowLeft ArrowRight' },
  mute: { title: '静音（M）', keys: 'M' },
  feed: { title: '对局记录（L）', keys: 'L' },
  result: { title: '查看结果（R）', keys: 'R' },
} as const;

/**
 * 播放看门狗：播放没有结束，客户端就不会 ack，ack 节奏的对局随之停住。
 * 浏览器朗读超过预计时长的 2 倍再加 5 秒仍未结束（Chrome 偶发不触发 onend）按已播完处理；
 * 服务端音频连续这么久没有播放进度（网络卡住却不报 error）改为按字数停留走完剩余部分。
 */
export const SPEECH_WATCHDOG_FACTOR = 2;
export const SPEECH_WATCHDOG_GRACE_MS = 5000;
export const AUDIO_STALL_MS = 8000;

/** 与 CSS 的窄屏断点一致：此宽度及以下整页换成手机舞台（hooks/useNarrowStage） */
export const NARROW_STAGE_MAX_WIDTH = 860;
/**
 * 记录面板默认展开所需的视口宽度：面板展开时舞台会让出两侧位置，
 * 圆桌在这个宽度以上仍放得下一圈座位，辩论赛还要放下左右各两列辩手，更宽才默认展开。
 */
export const RECORD_PANELS_MIN_WIDTH = { circle: 1280, versus: 1700 } as const;

/** 座位弹层与卡片之间的间距（px） */
export const POPOVER_GAP = 12;
/** 侧边资料离席位较远，给指针横移进入资料区留出时间。 */
export const POPOVER_DOCK_LEAVE_DELAY = 450;
