import type { VoiceProfile } from '../types';

export const HOST_VOICE_PROFILE: VoiceProfile = { role: 'host', rate: 0.95, pitch: 1, volume: 1 };

export const PLAYER_VOICE_PROFILES: Record<string, VoiceProfile> = {
  1: { role: 'child', rate: 1.18, pitch: 1.72, volume: 1 },
  2: { role: 'male', rate: 0.94, pitch: 0.62, volume: 1 },
  3: { role: 'male', rate: 0.86, pitch: 0.72, volume: 0.98 },
  4: { role: 'male', rate: 0.9, pitch: 0.58, volume: 0.96 },
  5: { role: 'male', rate: 1.06, pitch: 0.82, volume: 1 },
  6: { role: 'male', rate: 0.88, pitch: 0.54, volume: 0.96 },
  7: { role: 'female', rate: 0.96, pitch: 1.34, volume: 1 },
  8: { role: 'child', rate: 1.2, pitch: 1.82, volume: 1 },
  9: { role: 'female', rate: 1.12, pitch: 1.5, volume: 0.98 },
  10: { role: 'female', rate: 0.92, pitch: 1.18, volume: 0.96 },
  11: { role: 'male', rate: 1, pitch: 0.74, volume: 1 },
  12: { role: 'female', rate: 0.88, pitch: 1.28, volume: 0.98 }
};

export const VOICE_KEYWORDS = {
  child: ['child', 'kid', 'girl', 'boy', '儿童', '童声', '孩', 'yaoyao', 'xiaobei'],
  female: ['female', 'woman', 'girl', '女', 'xiaoxiao', 'xiaoyi', 'xiaobei', 'xiaoni', 'xiaomo', 'xiaoqiu', 'xiaorui', 'ting-ting', 'tingting', 'mei-jia', 'meijia', 'sin-ji', 'sinji', 'hanhan', 'huihui'],
  male: ['male', 'man', 'boy', '男', 'yunxi', 'yunyang', 'yunjian', 'yunhao', 'kang-kang', 'kangkang', 'li-mu', 'limu'],
  host: [] as string[]
} as const;
