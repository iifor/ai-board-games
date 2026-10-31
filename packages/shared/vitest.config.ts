import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'shared',
    environment: 'node',
    // shared 目前只有协议类型，没有运行时代码可测
    passWithNoTests: true,
  },
});
