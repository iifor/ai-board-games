import { parseTemplate, renderTemplate, type AiRequest } from '@battle/engine';

export const ORIGINAL_TASK = '{{originalTask}}';

export function renderTask(source: string, request: AiRequest) {
  const template = request.taskTemplate;
  return renderTemplate(parseTemplate(template?.name ?? '历史任务', source), {
    ...template?.context, originalTask: template?.originalTask ?? request.prompt.instruction,
  }, 32000);
}

export function identityParts(identity: string, persona: string) {
  const suffix = '\n\n你的人设：' + persona;
  if (persona && identity.endsWith(suffix)) return { fixedIdentity: identity.slice(0, -suffix.length), persona };
  return { fixedIdentity: identity, persona: '' };
}

export function withPersona(fixed: string, persona: string) {
  return persona ? fixed + '\n\n你的人设：' + persona : fixed;
}
