// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BUILTIN_TEMPLATE } = require('../skin-engine/constants') as { BUILTIN_TEMPLATE: Record<string, unknown> };

const SKIN_NAME_MAX_LENGTH = 200 as const;

export { BUILTIN_TEMPLATE, SKIN_NAME_MAX_LENGTH };
