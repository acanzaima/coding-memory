import assert from "node:assert/strict";

import {
  providerPresets,
  getBaseURL,
  getEnvVarName,
} from "../dist/llm/providers.js";

const ids = providerPresets.map((provider) => provider.id);
const byId = Object.fromEntries(
  providerPresets.map((provider) => [provider.id, provider]),
);

for (const removed of ["azure", "bedrock", "vertex", "cohere", "cn-relay"]) {
  assert.equal(
    ids.includes(removed),
    false,
    `${removed} should not be offered as a one-click preset`,
  );
}

const custom = byId.custom;
assert.ok(custom, "expected custom compatible endpoint preset");
assert.match(custom.name, /OpenAI-compatible/);
assert.equal(custom.provider, "custom");
assert.deepEqual(custom.models, []);
assert.equal(getBaseURL("custom", custom.provider), "");
assert.equal(getEnvVarName("custom"), "CUSTOM_API_KEY");

const expectedBaseURLs = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  deepseek: "https://api.deepseek.com",
  xai: "https://api.x.ai/v1",
  mistral: "https://api.mistral.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  together: "https://api.together.xyz/v1",
  fireworks: "https://api.fireworks.ai/inference/v1",
  cerebras: "https://api.cerebras.ai/v1",
  wandb: "https://api.inference.wandb.ai/v1",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  moonshot: "https://api.moonshot.cn/v1",
  minimax: "https://api.minimax.io/v1",
  doubao: "https://ark.cn-beijing.volces.com/api/v3",
  ollama: "http://localhost:11434/v1",
  lmstudio: "http://localhost:1234/v1",
  vllm: "http://localhost:8000/v1",
};

for (const [id, baseURL] of Object.entries(expectedBaseURLs)) {
  assert.ok(byId[id], `expected ${id} preset`);
  assert.equal(getBaseURL(id, byId[id].provider), baseURL, `${id} base URL`);
}

const expectedDefaults = {
  openai: "gpt-5.5",
  anthropic: "claude-sonnet-4-6",
  google: "gemini-2.5-pro",
  deepseek: "deepseek-v4-pro",
  xai: "grok-4.3",
  mistral: "mistral-large-latest",
  openrouter: "anthropic/claude-sonnet-4.6",
  groq: "openai/gpt-oss-120b",
  together: "zai-org/GLM-5.1",
  fireworks: "accounts/fireworks/models/kimi-k2p5",
  cerebras: "gpt-oss-120b",
  wandb: "meta-llama/Llama-3.3-70B-Instruct",
  zhipu: "glm-5.1",
  qwen: "qwen3-coder-plus",
  moonshot: "kimi-k2.5",
  minimax: "MiniMax-M2.7",
};

for (const [id, model] of Object.entries(expectedDefaults)) {
  assert.equal(byId[id].models[0]?.id, model, `${id} default model`);
}

const disallowedModels = [
  "moonshotai/kimi-k2-instruct-0905",
  "groq/moonshotai/kimi-k2-instruct-0905",
  "codestral-2501",
  "grok-code-fast-1",
  "accounts/fireworks/models/glm-5",
  "zai-glm-4.7",
  "doubao-1-5-pro-256k-250115",
  "doubao-seed-2-0-pro-260215",
  "gemini-3.5-flash",
  "google/gemini-3.5-flash",
  "claude-opus-4-7",
  "claude-opus-4-8",
];
const allModelIds = providerPresets.flatMap((provider) =>
  provider.models.map((model) => model.id),
);
for (const model of disallowedModels) {
  assert.equal(allModelIds.includes(model), false, `${model} should not be preset`);
}

assert.deepEqual(byId.doubao.models, [], "Doubao requires an Ark endpoint/model ID");
assert.equal(byId.wandb.models[0]?.id, "meta-llama/Llama-3.3-70B-Instruct");

console.log("provider preset tests passed");
