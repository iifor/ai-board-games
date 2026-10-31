import { EventEmitter } from 'node:events';

/** 进程内事件：对局有新事件、AI 任务入队、观众确认进度、状态变化 */
export interface BusEvents {
  'match:events': { readonly matchId: string; readonly lastSeq: number };
  'match:status': { readonly matchId: string; readonly status: string };
  'tasks:queued': { readonly matchId: string };
  'match:acked': { readonly matchId: string; readonly seq: number };
}

export interface EventBus {
  emit<K extends keyof BusEvents>(name: K, payload: BusEvents[K]): void;
  on<K extends keyof BusEvents>(name: K, listener: (payload: BusEvents[K]) => void): () => void;
}

export function createEventBus(): EventBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  return {
    emit: (name, payload) => {
      emitter.emit(name, payload);
    },
    on: (name, listener) => {
      emitter.on(name, listener);
      return () => emitter.off(name, listener);
    },
  };
}
