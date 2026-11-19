import { AZURE_STYLE_LABELS, azureStyleCandidates, azureStyleTag, controlTags, speechControl, speechTagStyle, type AzureVoiceCatalogEntry } from '@battle/shared';
import type { AiRequest } from '@battle/engine';
import type { MatchRepository } from '../matches/repository';
import { azureControlSupport } from '../tts/azureControlCapabilities';
import { logger } from '../../utils/logger';
import type { ClaimedTask } from './repository';

export interface SpeechDelivery {
  readonly prompt: AiRequest['prompt'];
  cleanOutput(output: unknown): unknown;
}

interface Deps {
  readonly matches: Pick<MatchRepository, 'seatVoice'>;
  readonly catalog: () => Promise<AzureVoiceCatalogEntry[]>;
  readonly region: string;
}

export function createSpeechDelivery(deps: Deps) {
  return async (task: ClaimedTask): Promise<SpeechDelivery> => {
    if (task.request.action !== 'speak' && task.request.action !== 'judge') {
      return { prompt: task.request.prompt, cleanOutput: output => output };
    }
    const voice = await deps.matches.seatVoice(task.matchId, task.seat);
    const tags: string[] = [];
    if (voice?.provider === 'azure') {
      tags.push('自然', ...controlTags(azureControlSupport(voice.voiceName, deps.region)));
      try {
        if (!deps.region) return deliveryFor(task, tags);
        const styles = (await deps.catalog()).find(item => item.voiceName === voice.voiceName)?.styles ?? [];
        tags.push(...styles.flatMap(style => { const label = azureStyleTag(style); return label ? [label] : []; }));
      } catch (error) {
        logger.warn('玩家朗读风格目录不可用，本次只提供已实测的控制标签', { error: error instanceof Error ? error.message : '目录不可用' });
      }
    }
    return deliveryFor(task, tags);
  };
}

function deliveryFor(task: ClaimedTask, tags: readonly string[]): SpeechDelivery {
  const allowed = [...new Set(tags)];
  const instructions = [
    '【本次朗读标记约束】',
    allowed.length ? `当前音色只可使用：${allowed.map(tag => `[${tag}]`).join('')}。` : '当前没有可用的朗读标记，请直接输出台词。',
    '朗读标记的完整清单以上述列表为准。方括号只用于这些标记，普通引用使用引号，座号如 [3号] 可以保留。',
    '正文表达优先，在语气转折处少量标注，允许整段不使用标记。',
    task.request.taskTemplate?.name === 'freeSpeech' ? '本次自由辩论只计算发言正文，朗读标记不计入字数。' : '标记计入本次输出字数，请为标记预留字数。',
    '停顿只发生在标记位置；语速、音调和风格作用至下一个同类标记，且不会延续到下一次发言。',
    ...(allowed.includes('恢复') ? ['[恢复]回到音色默认设置。'] : []),
  ].join('\n');
  return {
    prompt: { ...task.request.prompt, identity: `${task.request.prompt.identity}\n\n${instructions}` },
    cleanOutput: output => cleanSpeechOutput(output, task.request.action, allowed),
  };
}

export function cleanSpeechOutput(output: unknown, action: AiRequest['action'], allowed: readonly string[]): unknown {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return output;
  const key = action === 'speak' ? 'speech' : 'comment';
  if (!(key in output)) return output;
  const record = output as Record<string, unknown>;
  const value = record[key];
  if (typeof value !== 'string') return output;
  const accepted = new Set(allowed);
  const cleaned = value.replace(/\[([^\[\]\r\n]{1,24})\]|【([^【】\r\n]{1,24})】/gu, (whole: string, square: string | undefined, wide: string | undefined) => {
    const label = (square ?? wide ?? '').trim();
    if (accepted.has(label)) return `[${label}]`;
    const style = speechTagStyle(label) ?? (Object.hasOwn(AZURE_STYLE_LABELS, label) ? label : undefined);
    if (style !== undefined) {
      if (style === '') return accepted.has('自然') ? '[自然]' : '';
      const canonical = azureStyleCandidates(style).map(azureStyleTag).find(tag => tag && accepted.has(tag));
      return canonical ? `[${canonical}]` : '';
    }
    if (speechControl(label)) return '';
    // 未登记的方括号内容是正文（[查杀]、[金水]、[3号]），与共享解析器同一口径；删掉会改变发言含义，也会从其他玩家的历史里消失
    return whole;
  });
  return { ...record, [key]: cleaned };
}
