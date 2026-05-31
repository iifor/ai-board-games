import type { GameDefinition } from '@ai-presenter/shared/types/gameEngine';

class GameDefinitionRegistry {
  private definitions = new Map<string, GameDefinition>();
  private latestByGameType = new Map<string, string>();

  register(definition: GameDefinition): this {
    validateDefinition(definition);
    const key = definitionKey(definition.gameType, definition.version);
    if (this.definitions.has(key)) throw new Error(`GameDefinition already registered: ${key}`);
    this.definitions.set(key, definition);
    this.latestByGameType.set(definition.gameType, definition.version);
    return this;
  }

  get(gameType: string, version?: string): GameDefinition | null {
    const resolvedVersion = version || this.latestByGameType.get(gameType);
    if (!resolvedVersion) return null;
    return this.definitions.get(definitionKey(gameType, resolvedVersion)) || null;
  }

  list(): GameDefinition[] {
    return [...this.definitions.values()];
  }
}

function validateDefinition(definition: GameDefinition): void {
  if (!definition?.gameType) throw new Error('GameDefinition requires gameType.');
  if (!definition.version) throw new Error('GameDefinition requires version.');
  if (!definition.workflowId) throw new Error('GameDefinition requires workflowId.');
}

function definitionKey(gameType: string, version: string): string {
  return `${gameType}@${version}`;
}

export { GameDefinitionRegistry, definitionKey };
