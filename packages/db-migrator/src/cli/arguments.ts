const COMMANDS = [
  'migrate', 'preflight', 'backup', 'verify-backup', 'restore-drill', 'validate', 'rehearse', 'prepare-signoff',
  'release-readiness',
  'cutover',
  'record-production-build', 'verify-production-build',
  'verify-freeze-receipt', 'verify-traffic-authorization', 'verify-observation-receipt',
] as const;

export interface ParsedCommand {
  command: typeof COMMANDS[number];
  values: ReadonlyMap<string, string>;
  execute: boolean;
}

export function parseCommandLine(argv: string[]): ParsedCommand {
  let command: ParsedCommand['command'] | undefined;
  let execute = false;
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (!argument.startsWith('--')) {
      if (command) throw new Error(`Unexpected positional argument: ${argument}`);
      if (!COMMANDS.includes(argument as ParsedCommand['command'])) throw new Error(`Unknown command: ${argument}`);
      command = argument as ParsedCommand['command'];
      continue;
    }

    const name = argument.slice(2);
    if (!name) throw new Error('Option name is required');
    if (name === 'execute') {
      if (execute) throw new Error('Duplicate option: --execute');
      execute = true;
      continue;
    }
    if (values.has(name)) throw new Error(`Duplicate option: --${name}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Option --${name} requires a value`);
    values.set(name, value);
    index += 1;
  }

  return { command: command || 'migrate', values, execute };
}
