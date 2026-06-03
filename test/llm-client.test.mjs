import assert from "node:assert/strict";
import { createServer } from "node:http";

import { chatCompletion, testConnection } from "../dist/llm/client.js";

const { server, url, requests } = await startMockServer();

try {
  const anthropic = await testConnection({
    provider: "anthropic",
    model: "claude-test",
    apiKey: "anthropic-key",
    baseURL: url,
    request: { thinking: { type: "enabled" }, reasoning_effort: "high" },
  });
  assert.equal(anthropic.ok, true);
  assert.equal(requests[0].url, "/v1/messages");
  assert.equal(requests[0].headers["x-api-key"], "anthropic-key");
  assert.equal(requests[0].body.thinking?.type, "enabled");
  assert.equal(requests[0].body.reasoning_effort, "high");

  const anthropicOptionOverride = await testConnection({
    provider: "anthropic",
    model: "claude-test",
    apiKey: "anthropic-key",
    baseURL: url,
    request: { temperature: 0.9 },
  });
  assert.equal(anthropicOptionOverride.ok, true);
  assert.equal(requests[1].body.temperature, 0.9);

  const local = await testConnection({
    provider: "openai-compatible",
    model: "local-test",
    apiKey: "",
    baseURL: url,
  });
  assert.equal(local.ok, true);
  assert.equal(requests[2].url, "/chat/completions");
  assert.equal(requests[2].headers.authorization, undefined);
  assert.equal(requests[2].body.temperature, undefined);
  assert.equal(requests[2].body.thinking, undefined);

  const deepseek = await testConnection({
    provider: "openai-compatible",
    model: "deepseek-v4-pro",
    apiKey: "deepseek-key",
    baseURL: url,
  });
  assert.equal(deepseek.ok, true);
  assert.equal(requests[3].body.thinking?.type, "disabled");

  const deepseekConfiguredThinking = await testConnection({
    provider: "openai-compatible",
    model: "deepseek-v4-pro",
    apiKey: "deepseek-key",
    baseURL: url,
    request: { thinking: { type: "enabled" } },
  });
  assert.equal(deepseekConfiguredThinking.ok, true);
  assert.equal(requests[4].body.thinking?.type, "enabled");

  const customHeaders = await testConnection({
    provider: "openai-compatible",
    model: "wandb-test",
    apiKey: "wandb-key",
    baseURL: url,
    request: { headers: { "OpenAI-Project": "team/project" } },
  });
  assert.equal(customHeaders.ok, true);
  assert.equal(requests[5].headers.authorization, "Bearer wandb-key");
  assert.equal(requests[5].headers["openai-project"], "team/project");

  const configured = await testConnection({
    provider: "openai-compatible",
    model: "configured-model",
    apiKey: "configured-key",
    baseURL: url,
    request: { temperature: 0.8, max_tokens: 777 },
  });
  assert.equal(configured.ok, true);
  assert.equal(requests[6].body.temperature, 0.8);
  assert.equal(requests[6].body.max_tokens, 777);

  const moonshotMinimal = await testConnection({
    provider: "openai-compatible",
    model: "kimi-k2.5",
    apiKey: "moonshot-key",
    baseURL: `${url}/moonshot`,
  });
  assert.equal(moonshotMinimal.ok, true);
  assert.equal(requests[7].body.temperature, undefined);

  const moonshotConfigured = await testConnection({
    provider: "openai-compatible",
    model: "kimi-k2.5",
    apiKey: "moonshot-key",
    baseURL: `${url}/moonshot`,
    request: { temperature: 1 },
  });
  assert.equal(moonshotConfigured.ok, true);
  assert.equal(requests[8].body.temperature, 1);

  const beforeComplete = requests.length;
  const complete = await chatCompletion(
    {
      provider: "openai-compatible",
      model: "complete-test",
      apiKey: "test-key",
      baseURL: url,
    },
    {
      messages: [{ role: "user", content: "Need complete markdown" }],
      maxTokens: 128,
      requireComplete: true,
    },
  );
  assert.equal(complete, "complete after retry");
  assert.equal(requests[beforeComplete].body.max_tokens, 128);
  assert.equal(requests[beforeComplete + 1].body.max_tokens, 4224);

  const beforeConfiguredCompletion = requests.length;
  const configuredCompletion = await chatCompletion(
    {
      provider: "openai-compatible",
      model: "configured-model",
      apiKey: "configured-key",
      baseURL: url,
      request: { temperature: 0.8, max_tokens: 777 },
    },
    {
      messages: [{ role: "user", content: "Use configured temperature" }],
      temperature: 0.2,
      maxTokens: 128,
    },
  );
  assert.equal(configuredCompletion, "pong");
  assert.equal(requests[beforeConfiguredCompletion].body.temperature, 0.8);
  assert.equal(requests[beforeConfiguredCompletion].body.max_tokens, 777);

  const beforeFallbackCompletion = requests.length;
  const fallbackCompletion = await chatCompletion(
    {
      provider: "openai-compatible",
      model: "fallback-model",
      apiKey: "fallback-key",
      baseURL: url,
    },
    {
      messages: [{ role: "user", content: "Use phase fallback parameters" }],
      temperature: 0.2,
      maxTokens: 128,
    },
  );
  assert.equal(fallbackCompletion, "pong");
  assert.equal(requests[beforeFallbackCompletion].body.temperature, 0.2);
  assert.equal(requests[beforeFallbackCompletion].body.max_tokens, 128);

  const beforeRequestOverride = requests.length;
  const requestOverrideCompletion = await chatCompletion(
    {
      provider: "openai-compatible",
      model: "option-override-model",
      apiKey: "option-key",
      baseURL: url,
      request: {
        temperature: 0.95,
        top_p: 0.4,
        response_format: { type: "text" },
      },
    },
    {
      messages: [{ role: "user", content: "Request params win last" }],
      temperature: 0.2,
      maxTokens: 128,
      responseFormat: "json_object",
    },
  );
  assert.equal(requestOverrideCompletion, "pong");
  assert.equal(requests[beforeRequestOverride].body.temperature, 0.95);
  assert.equal(requests[beforeRequestOverride].body.top_p, 0.4);
  assert.equal(requests[beforeRequestOverride].body.response_format.type, "text");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("llm client tests passed");

async function startMockServer() {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      requests.push({
        url: req.url,
        headers: req.headers,
        body,
      });
      res.writeHead(200, { "content-type": "application/json" });
      if (req.url === "/v1/messages") {
        res.end(JSON.stringify({ content: [{ type: "text", text: "pong" }] }));
      } else if (
        body.model === "complete-test" &&
        body.max_tokens === 128
      ) {
        res.end(
          JSON.stringify({
            choices: [
              {
                finish_reason: "length",
                message: { content: "partial response" },
              },
            ],
          }),
        );
      } else if (body.model === "complete-test") {
        res.end(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: { content: "complete after retry" },
              },
            ],
          }),
        );
      } else {
        res.end(JSON.stringify({ choices: [{ message: { content: "pong" } }] }));
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    server,
    requests,
    url: `http://127.0.0.1:${address.port}`,
  };
}
