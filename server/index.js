const { getAiConfig } = require('./aiConfig');
const { createApp } = require('./app');

const port = Number(process.env.PORT || 3001);
const app = createApp();

app.listen(port, () => {
  const config = getAiConfig();
  console.log(`Express API 已启动：http://localhost:${port}`);
  console.log('AI 玩法模式：由前端页面 Mock/真实 开关决定');
  console.log(`真实模式可用：${config.realReady ? '是' : '否'}`);
  console.log(`主持人：${config.host.provider}/${config.host.model}`);
  console.log(`玩家模型：${config.players.map((player) => `${player.id}:${player.provider}/${player.model}`).join('，')}`);
  console.log(`实际使用供应商：${config.usedProviderNames.join('，')}`);
  if (config.missingProviders.length) {
    console.log(`缺少 API Key：${config.missingProviders.map((item) => `${item.provider}(${item.apiKeyEnv})`).join('，')}`);
  }
  console.log('Vite 开发模式请运行：npm.cmd run dev');
});
