import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'server',
    environment: 'node',
    // 集成测试连接真实 PostgreSQL（TEST_DATABASE_URL，默认本机开发库），每个文件使用独立 schema
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // 各文件会各自建库与连接池，串行执行避免并行时占满数据库连接
    fileParallelism: false,
  },
});
