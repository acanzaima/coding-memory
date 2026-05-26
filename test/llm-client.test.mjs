import assert from "node:assert/strict";
import { createServer } from "node:http";

import { testConnection } from "../dist/llm/client.js";

const { server, url, requests } = await startMockServer();

try {
  const anthropic = await testConnection({
    provider: "anthropic",
    model: "claude-test",
    apiKey: "anthropic-key",
    baseURL: url,
    options: { thinking: { type: "enabled" }, reasoning_effort: "high" },
  });
  assert.equal(anthropic.ok, true);
  assert.equal(requests[0].url, "/v1/messages");
  assert.equal(requests[0].headers["x-api-key"], "anthropic-key");
  assert.equal(requests[0].body.thinking, undefined);
  assert.equal(requests[0].body.reasoning_effort, undefined);

  const local = await testConnection({
    provider: "openai-compatible",
    model: "local-test",
    apiKey: "",
    baseURL: url,
  });
  assert.equal(local.ok, true);
  assert.equal(requests[1].url, "/chat/completions");
  assert.equal(requests[1].headers.authorization, undefined);
  assert.equal(requests[1].body.thinking, undefined);

  const deepseek = await testConnection({
    provider: "openai-compatible",
    model: "deepseek-v4-pro",
    apiKey: "deepseek-key",
    baseURL: url,
  });
  assert.equal(deepseek.ok, true);
  assert.equal(requests[2].body.thinking?.type, "disabled");
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
