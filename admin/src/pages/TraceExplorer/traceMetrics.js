export function getTraceTokenSummary(llmCalls = []) {
  return llmCalls.reduce(
    (summary, call) => {
      const promptTokens = Number(call?.prompt_tokens) || 0;
      const completionTokens = Number(call?.completion_tokens) || 0;

      return {
        promptTokens: summary.promptTokens + promptTokens,
        completionTokens: summary.completionTokens + completionTokens,
        totalTokens: summary.totalTokens + promptTokens + completionTokens
      };
    },
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  );
}

export function formatTokenCount(value) {
  return Number(value || 0).toLocaleString();
}
