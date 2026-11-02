/** GameSpec 本身写错：在编译期或首次执行到该处时抛出，属于开发期错误 */
export class SpecError extends Error {
  readonly issues: readonly string[];

  constructor(gameKey: string, issues: readonly string[]) {
    super(`GameSpec "${gameKey}" 无效：\n- ${issues.join('\n- ')}`);
    this.name = 'SpecError';
    this.issues = issues;
  }
}

/** 调用方给引擎的输入不合法（重复开局、过期的 AI 结果、非调试局的调试指令等） */
export class EngineInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineInputError';
  }
}

/**
 * 快照由另一版本的游戏定义创建（部署后规则或模板变了）：这一局用当前代码永远无法推进。
 * 不继承 EngineInputError：调用方必须单独处理，不能把它当成可以忽略的过期输入。
 */
export class SpecMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpecMismatchError';
  }
}

/** 提示词模板语法错误或渲染时变量缺失 */
export class TemplateError extends Error {
  constructor(templateName: string, message: string) {
    super(`模板 "${templateName}"：${message}`);
    this.name = 'TemplateError';
  }
}
