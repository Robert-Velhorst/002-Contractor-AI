function configureLocalAi(env = process.env, { requested = false } = {}) {
  if (!requested) return null;
  if (env.CONTRACTOR_AI_RUNTIME_MODE === 'hosted') {
    throw new Error('The local-AI launcher is only available in local runtime mode.');
  }
  const model = String(env.CONTRACTOR_AI_LOCAL_MODEL || 'qwen3:4b').trim();
  if (!/^[A-Za-z0-9._:/-]{1,120}$/.test(model) || /cloud/i.test(model)) {
    throw new Error('Select a valid installed local model with CONTRACTOR_AI_LOCAL_MODEL.');
  }
  const rawContextTokens = env.CONTRACTOR_AI_LOCAL_CONTEXT_TOKENS || '4096';
  const contextTokens = Number(rawContextTokens);
  if (!Number.isSafeInteger(contextTokens) || contextTokens < 4096 || contextTokens > 32768) {
    throw new Error('Local model context must be between 4096 and 32768 tokens.');
  }
  Object.assign(env, {
    CONTRACTOR_AI_CHAT_AI_ENABLED: 'true',
    CONTRACTOR_AI_CHAT_AI_URL: 'http://127.0.0.1:11434',
    CONTRACTOR_AI_CHAT_AI_MODEL: model,
    CONTRACTOR_AI_CHAT_AI_CONTEXT_TOKENS: String(contextTokens),
    CONTRACTOR_AI_CHAT_AI_VISION_ENABLED: 'false',
    CONTRACTOR_AI_CHAT_AI_AUTO_ANALYZE: 'false'
  });
  return { model, url: 'http://127.0.0.1:11434', contextTokens, automaticAnalysis: false, imageAnalysis: false };
}

module.exports = { configureLocalAi };
