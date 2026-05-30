/**
 * LLM client for interacting with various AI providers.
 * Supports OpenAI-compatible API, Anthropic, and Ollama.
 */

import type { LLMConfig } from "../types.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json_object";
}

/**
 * Send a chat completion request to the configured LLM.
 */
export async function chatCompletion(
  config: LLMConfig,
  options: ChatCompletionOptions,
): Promise<string> {
  const baseURL = config.baseURL || getProviderBaseURL(config.provider);

  // Special handling for Anthropic - use messages API
  if (config.provider === "anthropic") {
    return anthropicCompletion(config, options);
  }

  const url = joinApiPath(baseURL, "/chat/completions");
  let lastEmpty: ChatCompletionResponse | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const body = buildChatBody(config, options, attempt);
    const data = await callWithRetry(url, config, body);

    const content = data.choices?.[0]?.message?.content;
    if (content) return content;

    lastEmpty = data;
    if (!shouldRetryEmptyResponse(data, attempt)) break;
    await sleep(500 * (attempt + 1));
  }

  throw new Error(
    `LLM returned empty response${lastEmpty ? ` (${describeEmptyResponse(lastEmpty)})` : ""}. ` +
      "Try increasing model maxTokens or reducing thinking budget, then run `coding-memory test` to diagnose.",
  );
}

interface ChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    reasoning_tokens?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}

function buildChatBody(
  config: LLMConfig,
  options: ChatCompletionOptions,
  retryAttempt: number,
): Record<string, unknown> {
  const requestedMax = options.maxTokens ?? config.maxTokens ?? 4096;
  const body: Record<string, unknown> = {
    model: config.model,
    messages: options.messages,
    temperature: options.temperature ?? config.temperature ?? 0.3,
    max_tokens: retryAttempt === 0 ? requestedMax : growMaxTokens(requestedMax, retryAttempt),
    // Merge provider-specific options (thinking, reasoning_effort, etc.)
    ...(config.options || {}),
  };

  if (options.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }
  return body;
}

function growMaxTokens(base: number, retryAttempt: number): number {
  return Math.min(Math.max(base * (retryAttempt + 2), base + 4096), 32768);
}

function shouldRetryEmptyResponse(
  data: ChatCompletionResponse,
  attempt: number,
): boolean {
  if (attempt >= 2) return false;
  const choice = data.choices?.[0];
  const hasReasoning = !!(
    choice?.message?.reasoning_content || choice?.message?.reasoning
  );
  const finishReason = choice?.finish_reason || "";
  return (
    hasReasoning ||
    finishReason === "length" ||
    finishReason === "content_filter" ||
    !!data.usage?.completion_tokens
  );
}

function describeEmptyResponse(data: ChatCompletionResponse): string {
  const choice = data.choices?.[0];
  const details = data.usage?.completion_tokens_details;
  const parts = [
    choice?.finish_reason ? `finish_reason=${choice.finish_reason}` : null,
    choice?.message?.reasoning_content || choice?.message?.reasoning
      ? "reasoning_present=true"
      : null,
    data.usage?.prompt_tokens !== undefined
      ? `prompt_tokens=${data.usage.prompt_tokens}`
      : null,
    data.usage?.completion_tokens !== undefined
      ? `completion_tokens=${data.usage.completion_tokens}`
      : null,
    details?.reasoning_tokens !== undefined
      ? `reasoning_tokens=${details.reasoning_tokens}`
      : data.usage?.reasoning_tokens !== undefined
        ? `reasoning_tokens=${data.usage.reasoning_tokens}`
        : null,
  ].filter(Boolean);
  return parts.join(", ") || "no diagnostic fields";
}

async function callWithRetry(
  url: string,
  config: LLMConfig,
  body: Record<string, unknown>,
): Promise<ChatCompletionResponse> {
  const payload = JSON.stringify(body);
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: openAICompatibleHeaders(config),
        body: payload,
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (attempt < 3 && (response.status === 429 || response.status >= 500)) {
          await sleep(500 * attempt);
          continue;
        }
        throw new Error(
          `LLM API error (${response.status}): ${errorText.slice(0, 500)}`,
        );
      }

      return (await response.json()) as ChatCompletionResponse;
    } catch (err) {
      lastError = err;
      if (attempt >= 3 || !isRetryableNetworkError(err)) break;
      await sleep(500 * attempt);
    }
  }

  throw lastError;
}

function isRetryableNetworkError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? String(err.cause || "") : "";
  return /terminated|fetch failed|ECONNRESET|EPIPE|ETIMEDOUT|UND_ERR|socket|network/i.test(
    `${message} ${cause}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Anthropic-specific completion using Messages API.
 */
async function anthropicCompletion(
  config: LLMConfig,
  options: ChatCompletionOptions,
): Promise<string> {
  const url = anthropicMessagesURL(
    config.baseURL || getProviderBaseURL(config.provider),
  );

  // Extract system message and convert to Anthropic format
  const systemMsg = options.messages.find((m) => m.role === "system");
  const chatMessages = options.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: options.maxTokens ?? config.maxTokens ?? 4096,
    messages: chatMessages,
    // Merge provider-specific options
    ...(config.options || {}),
  };

  if (systemMsg) {
    body.system = systemMsg.content;
  }

  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      ...(config.headers || {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Anthropic API error (${response.status}): ${errorText.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const textContent = data.content?.find((c) => c.type === "text");
  if (!textContent?.text) {
    throw new Error("Anthropic returned empty response");
  }

  return textContent.text;
}

/**
 * Get the base URL for a provider type.
 */
function getProviderBaseURL(provider: string): string {
  switch (provider) {
    case "openai":
      return "https://api.openai.com/v1";
    case "anthropic":
      return "https://api.anthropic.com";
    case "ollama":
      return "http://localhost:11434/v1";
    default:
      return "https://api.openai.com/v1";
  }
}

function joinApiPath(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function anthropicMessagesURL(baseURL: string): string {
  const trimmed = baseURL.replace(/\/+$/, "");
  if (/\/v1\/messages$/.test(trimmed)) return trimmed;
  if (/\/v1$/.test(trimmed)) return `${trimmed}/messages`;
  return `${trimmed}/v1/messages`;
}

function openAICompatibleHeaders(config: LLMConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    ...(config.headers || {}),
  };
}

function withoutThinkingOptions(config: LLMConfig): LLMConfig {
  const options = { ...(config.options || {}) };
  delete options.thinking;
  delete options.reasoning_effort;
  return {
    ...config,
    options: Object.keys(options).length > 0 ? options : undefined,
  };
}

function allowsMissingApiKey(config: LLMConfig): boolean {
  const baseURL = config.baseURL || "";
  return (
    config.provider === "ollama" ||
    /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(baseURL)
  );
}

/**
 * Test the LLM connection with a simple ping.
 */
export async function testConnection(
  config: LLMConfig,
): Promise<{ ok: boolean; message: string }> {
  if (!config.apiKey && !allowsMissingApiKey(config)) {
    return {
      ok: false,
      message: "No API key configured. Run coding-memory config to set one.",
    };
  }

  try {
    if (config.provider === "anthropic") {
      const content = await chatCompletion(withoutThinkingOptions(config), {
        messages: [{ role: "user", content: "Say just pong" }],
        maxTokens: 256,
        temperature: 0,
      });
      if (content.toLowerCase().includes("pong")) {
        return {
          ok: true,
          message: `Connected — ${config.model} responded correctly`,
        };
      }
      return {
        ok: true,
        message: `Connected, unexpected response: ${content.slice(0, 80)}`,
      };
    }

    // Send a direct ping (not via chatCompletion) so we can control
    // thinking mode — DeepSeek V4 / o-series default to thinking=on
    const baseURL = config.baseURL || getProviderBaseURL(config.provider);
    const url = joinApiPath(baseURL, "/chat/completions");

    const body: Record<string, unknown> = {
      model: config.model,
      messages: [{ role: "user", content: "Say just pong" }],
      max_tokens: 256,
      temperature: 0,
    };

    // Keep the ping tiny for DeepSeek reasoning models without changing learn-time options.
    if (isDeepSeekConfig(config)) {
      body.thinking = { type: "disabled" };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: openAICompatibleHeaders(config),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          message: `Authentication failed (${response.status}) — check your API key`,
        };
      }
      if (response.status === 429) {
        return { ok: false, message: "Rate limited — wait and try again" };
      }
      return {
        ok: false,
        message: `API error ${response.status}: ${errText.slice(0, 150)}`,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;

    if (content && content.toLowerCase().includes("pong")) {
      return {
        ok: true,
        message: `Connected — ${config.model} responded correctly`,
      };
    }
    if (content) {
      return {
        ok: true,
        message: `Connected, unexpected response: ${content.slice(0, 80)}`,
      };
    }
    return {
      ok: false,
      message: `Model returned empty content — verify model ID "${config.model}" is correct for ${config.provider}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
      return {
        ok: false,
        message: `Cannot reach server — check network or base URL`,
      };
    }
    if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
      return {
        ok: false,
        message: "Connection timed out — server may be down",
      };
    }
    return { ok: false, message: msg };
  }
}

function isDeepSeekConfig(config: LLMConfig): boolean {
  return /deepseek/i.test(`${config.model} ${config.baseURL || ""}`);
}
