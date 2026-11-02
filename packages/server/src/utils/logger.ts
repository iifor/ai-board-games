type Level = 'info' | 'warn' | 'error';

/** 结构化单行日志；调用方负责不传入密钥等敏感字段 */
function write(level: Level, message: string, fields: Readonly<Record<string, unknown>> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, fields?: Readonly<Record<string, unknown>>) => write('info', message, fields),
  warn: (message: string, fields?: Readonly<Record<string, unknown>>) => write('warn', message, fields),
  error: (message: string, fields?: Readonly<Record<string, unknown>>) => write('error', message, fields),
};

/** 可注入的日志接口（测试里替换为静默或收集实现） */
export type Logger = typeof logger;
