/** 连接测试要求模型返回固定 JSON，顺带验证对局依赖的 JSON 输出模式可用 */
export const TEST_PROMPT = '这是一次连接测试。请只返回一个 JSON 对象：{"pong":true}';
/** 推理模型的上限同时包含推理与可见回复；探测也不超过管理员配置。 */
export const TEST_MAX_TOKENS = 512;
export const TEST_TIMEOUT_MS = 20_000;
