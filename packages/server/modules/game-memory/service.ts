interface MemoryEntry {
  id?: string;
  text?: string;
  scope?: string;
  targetSide?: string;
  order?: number;
}

interface AgentWithMessages {
  messages?: ChatMessage[];
  playerAgent?: { messages?: ChatMessage[] };
  seenPublicMemoryIds?: Set<string> | string[];
  publicMemoryCursor?: number;
  side?: string;
  [key: string]: unknown;
}

interface ChatMessage {
  role: string;
  content: string;
}

function syncMissingPublicMemory(
  agent: AgentWithMessages,
  entries: MemoryEntry[] = [],
  options: { title?: string } = {}
): MemoryEntry[] {
  const messages = getAgentMessages(agent);
  if (!messages) return [];

  if (!agent.seenPublicMemoryIds) agent.seenPublicMemoryIds = new Set();
  if (!(agent.seenPublicMemoryIds instanceof Set)) {
    agent.seenPublicMemoryIds = new Set(agent.seenPublicMemoryIds || []);
  }

  const visibleEntries = entries
    .filter((entry) => canReadMemory(agent, entry))
    .filter((entry) => entry?.id && !(agent.seenPublicMemoryIds as Set<string>).has(entry.id))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  if (!visibleEntries.length) return [];

  messages.push({
    role: 'system',
    content: formatMemorySyncMessage(visibleEntries, options.title)
  });
  visibleEntries.forEach((entry) => (agent.seenPublicMemoryIds as Set<string>).add(entry.id!));
  agent.publicMemoryCursor = Math.max(
    Number(agent.publicMemoryCursor || 0),
    ...visibleEntries.map((entry) => Number(entry.order || 0))
  );
  return visibleEntries;
}

function getAgentMessages(agent: AgentWithMessages): ChatMessage[] | null {
  if (Array.isArray(agent?.messages)) return agent.messages;
  if (Array.isArray(agent?.playerAgent?.messages)) return agent.playerAgent.messages;
  return null;
}

function canReadMemory(agent: AgentWithMessages, entry: MemoryEntry): boolean {
  if (!entry) return false;
  if (entry.scope === 'team') return Boolean(agent?.side) && entry.targetSide === agent.side;
  return entry.scope === 'public' || !entry.scope;
}

function formatMemorySyncMessage(entries: MemoryEntry[], title: string = '公开信息同步'): string {
  const lines = entries.map((entry) => `- ${entry.text}`).filter(Boolean);
  return `【${title}】\n${lines.join('\n')}`;
}

export { syncMissingPublicMemory };
