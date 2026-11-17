import type { StreamItem } from '../types';
import type { SegmentControl } from './segment';

export type Presenter = (item: StreamItem, control: SegmentControl) => Promise<void>;

/**
 * 播放一段，结束后（未被中止时）调用 onDone 推进与 ack。
 * 播放出错（同步抛出或 Promise 拒绝）记日志后照常推进：一段坏掉不能让舞台停住，
 * ack 节奏的对局也不能因为少一次 ack 而不再生成。中止（卸载 / 换局）时不推进。
 */
export async function playSegment(item: StreamItem, control: SegmentControl, present: Presenter, onDone: () => void): Promise<void> {
  try {
    await present(item, control);
  } catch (error) {
    console.error(`[playback] 第 ${item.event.seq} 号事件播放失败，已跳过`, error);
  }
  if (!control.signal.aborted) onDone();
}
