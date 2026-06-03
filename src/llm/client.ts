/**
 * LLM client for interacting with various AI providers.
 * Supports OpenAI-compatible API, Anthropic, and Ollama.
 */

import type { LLMConfig } from "../types.js";

const DEFAULT_MAX_TOKENS = 4096;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json_object";
  diagnostics?: ChatCompletionDiagnostics;
  /**
   * Reject responses that the provider explicitly reports as truncated.
   * This is useful for phases where partial markdown would become a bad artifact.
   */
  requireComplete?: boolean;
  /**
   * Return partial content when requireComplete detects truncation.
   * Callers can then repair/continue deterministically instead of replaying
   * the same large prompt.
   */
  allowIncomplete?: boolean;
}

export interface ChatCompletionDiagnostics {
  phase?: string;
  onEvent?: (event: ChatCompletionDiagnosticEvent) => void;
}

export interface ChatCompletionDiagnosticEvent {
  phase: string;
  provider: LLMConfig["provider"];
  model: string;
  attempt: number;
  maxTokens: number;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  requestChars: number;
  responseChars: number;
  ok: boolean;
  finishReason?: string;
  usage?: ChatCompletionUsage;
  emptyReason?: string;
  error?: string;
}

export interface ChatCompletionResult {
  content: string;
  finishReason?: string;
  usage?: ChatCompletionUsage;
  complete: boolean;
}

/**
 * Send a chat completion request to the configured LLM.
 */
export async function chatCompletion(
  config: LLMConfig,
  options: ChatCompletionOptions,
): Promise<string> {
  const result = await chatCompletionDetailed(config, options);
  return result.content;
}

/**
 * Send a chat completion request and return response metadata.
 */
export async function chatCompletionDetailed(
  config: LLMConfig,
  options: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const baseURL = config.baseURL || getProviderBaseURL(config.provider);

  // Special handling for Anthropic - use messages API
  if (config.provider === "anthropic") {
    return anthropicCompletionDetailed(config, options);
  }

  const url = joinApiPath(baseURL, "/chat/completions");
  let lastEmpty: ChatCompletionResponse | null = null;
  let lastTruncated: ChatCompletionResponse | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const body = buildChatBody(config, options, attempt);
    let data: ChatCompletionResponse;
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    try {
      data = await callWithRetry(url, config, body);
    } catch (err) {
      const finishedAt = new Date().toISOString();
      reportDiagnostic(config, options, body, attempt, {
        ok: false,
        responseChars: 0,
        startedAt,
        finishedAt,
        durationMs: Date.now() - startedMs,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startedMs;

    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    if (content) {
      if (options.requireComplete && isIncompleteFinishReason(choice?.finish_reason)) {
        lastTruncated = data;
        reportDiagnostic(config, options, body, attempt, {
          ok: false,
          responseChars: content.length,
          finishReason: choice?.finish_reason,
          usage: data.usage,
          startedAt,
          finishedAt,
          durationMs,
          emptyReason: describeTruncatedResponse(data, content.length),
        });
        if (options.allowIncomplete) {
          return {
            content,
            finishReason: choice?.finish_reason,
            usage: data.usage,
            complete: false,
          };
        }
        if (attempt < 2) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        break;
      }
      reportDiagnostic(config, options, body, attempt, {
        ok: true,
        responseChars: content.length,
        finishReason: choice?.finish_reason,
        usage: data.usage,
        startedAt,
        finishedAt,
        durationMs,
      });
      return {
        content,
        finishReason: choice?.finish_reason,
        usage: data.usage,
        complete: true,
      };
    }

    lastEmpty = data;
    reportDiagnostic(config, options, body, attempt, {
      ok: false,
      responseChars: 0,
      finishReason: data.choices?.[0]?.finish_reason,
      usage: data.usage,
      startedAt,
      finishedAt,
      durationMs,
      emptyReason: describeEmptyResponse(data),
    });
    if (!shouldRetryEmptyResponse(data, attempt)) break;
    await sleep(500 * (attempt + 1));
  }

  if (lastTruncated) {
    throw new Error(
      `LLM response was truncated (${describeTruncatedResponse(lastTruncated)}). ` +
        "Try increasing request.max_tokens or reducing thinking budget, then rerun or resume `coding-memory learn`.",
    );
  }

  throw new Error(
    `LLM returned empty response${lastEmpty ? ` (${describeEmptyResponse(lastEmpty)})` : ""}. ` +
      "Try increasing request.max_tokens or reducing thinking budget, then run `coding-memory test` to diagnose.",
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
  usage?: ChatCompletionUsage;
}

export interface ChatCompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  reasoning_tokens?: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

function reportDiagnostic(
  config: LLMConfig,
  options: ChatCompletionOptions,
  body: Record<string, unknown>,
  attempt: number,
  result: {
    ok: boolean;
    responseChars: number;
    startedAt?: string;
    finishedAt?: string;
    durationMs?: number;
    finishReason?: string;
    usage?: ChatCompletionUsage;
    emptyReason?: string;
    error?: string;
  },
): void {
  const onEvent = options.diagnostics?.onEvent;
  if (!onEvent) return;
  const maxTokens =
    typeof body.max_tokens === "number"
      ? body.max_tokens
      : resolveMaxTokens(config, options.maxTokens);
  try {
    onEvent({
      phase: options.diagnostics?.phase || "unknown",
      provider: config.provider,
      model: config.model,
      attempt: attempt + 1,
      maxTokens,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      durationMs: result.durationMs,
      requestChars: JSON.stringify(body.messages || []).length,
      responseChars: result.responseChars,
      ok: result.ok,
      finishReason: result.finishReason,
      usage: result.usage,
      emptyReason: result.emptyReason,
      error: result.error,
    });
  } catch {
    // Diagnostics must never affect LLM execution.
  }
}

function buildChatBody(
  config: LLMConfig,
  options: ChatCompletionOptions,
  retryAttempt: number,
): Record<string, unknown> {
  const requestedMax = resolveMaxTokens(config, options.maxTokens);
  const temperature = resolveTemperature(config, options.temperature);
  const requestBody = requestBodyParams(config);
  const body: Record<string, unknown> = {
    model: config.model,
    messages: options.messages,
    ...(temperature !== undefined ? { temperature } : {}),
    max_tokens:
      retryAttempt === 0 || requestMaxTokens(config) !== undefined
        ? requestedMax
        : growMaxTokens(requestedMax, retryAttempt),
    ...(options.responseFormat === "json_object"
      ? { response_format: { type: "json_object" } }
      : {}),
    // Merge user-managed advanced request params last.
    ...requestBody,
  };
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

function isIncompleteFinishReason(reason?: string): boolean {
  return reason === "length" || reason === "max_tokens" || reason === "content_filter";
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

function describeTruncatedResponse(
  data: ChatCompletionResponse,
  responseChars?: number,
): string {
  const base = describeEmptyResponse(data);
  return [
    base,
    responseChars !== undefined ? `response_chars=${responseChars}` : null,
  ]
    .filter(Boolean)
    .join(", ");
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
async function anthropicCompletionDetailed(
  config: LLMConfig,
  options: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const url = anthropicMessagesURL(
    config.baseURL || getProviderBaseURL(config.provider),
  );

  // Extract system message and convert to Anthropic format
  const systemMsg = options.messages.find((m) => m.role === "system");
  const chatMessages = options.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const temperature = resolveTemperature(config, options.temperature);
  const requestBody = requestBodyParams(config);
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: resolveMaxTokens(config, options.maxTokens),
    messages: chatMessages,
    ...(temperature !== undefined ? { temperature } : {}),
    // Merge user-managed advanced request params last.
    ...requestBody,
  };

  if (systemMsg) {
    body.system = systemMsg.content;
  }

  let response: Response;
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        ...requestHeaders(config),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const finishedAt = new Date().toISOString();
    reportDiagnostic(config, options, body, 0, {
      ok: false,
      responseChars: 0,
      startedAt,
      finishedAt,
      durationMs: Date.now() - startedMs,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startedMs;

  if (!response.ok) {
    const errorText = await response.text();
    reportDiagnostic(config, options, body, 0, {
      ok: false,
      responseChars: 0,
      startedAt,
      finishedAt,
      durationMs,
      error: `Anthropic API error (${response.status}): ${errorText.slice(0, 500)}`,
    });
    throw new Error(
      `Anthropic API error (${response.status}): ${errorText.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
    stop_reason?: string;
    usage?: ChatCompletionUsage;
  };

  const textContent = data.content?.find((c) => c.type === "text");
  if (!textContent?.text) {
    reportDiagnostic(config, options, body, 0, {
      ok: false,
      responseChars: 0,
      startedAt,
      finishedAt,
      durationMs,
      emptyReason: "Anthropic returned empty response",
    });
    throw new Error("Anthropic returned empty response");
  }

  if (options.requireComplete && isIncompleteFinishReason(data.stop_reason)) {
    reportDiagnostic(config, options, body, 0, {
      ok: false,
      responseChars: textContent.text.length,
      finishReason: data.stop_reason,
      usage: data.usage,
      startedAt,
      finishedAt,
      durationMs,
      emptyReason: `response truncated, response_chars=${textContent.text.length}`,
    });
    if (options.allowIncomplete) {
      return {
        content: textContent.text,
        finishReason: data.stop_reason,
        usage: data.usage,
        complete: false,
      };
    }
    throw new Error(
      `Anthropic response was truncated (finish_reason=${data.stop_reason}, response_chars=${textContent.text.length}). ` +
        "Try increasing request.max_tokens or reducing thinking budget, then rerun or resume `coding-memory learn`.",
    );
  }

  reportDiagnostic(config, options, body, 0, {
    ok: true,
    responseChars: textContent.text.length,
    finishReason: data.stop_reason,
    usage: data.usage,
    startedAt,
    finishedAt,
    durationMs,
  });
  return {
    content: textContent.text,
    finishReason: data.stop_reason,
    usage: data.usage,
    complete: true,
  };
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
    ...requestHeaders(config),
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
      const content = await chatCompletion(config, {
        messages: [{ role: "user", content: "Say just pong" }],
        maxTokens: 256,
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

    const temperature = resolveTemperature(config);
    const requestBody = requestBodyParams(config);
    const body: Record<string, unknown> = {
      model: config.model,
      messages: [{ role: "user", content: "Say just pong" }],
      max_tokens: resolveMaxTokens(config, 256),
      ...(temperature !== undefined ? { temperature } : {}),
      ...requestBody,
    };

    // Keep the ping tiny for DeepSeek reasoning models without changing learn-time options.
    if (isDeepSeekConfig(config) && !hasRequestParam(config, "thinking")) {
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

function resolveTemperature(
  config: LLMConfig,
  requested?: number,
  fallback?: number,
): number | undefined {
  const requestTemperature = numericRequestParam(config, "temperature");
  if (requestTemperature !== undefined) return requestTemperature;
  if (omitsTemperatureByDefault(config)) return undefined;
  return requested ?? fallback;
}

function resolveMaxTokens(
  config: LLMConfig,
  requested?: number,
  fallback: number = DEFAULT_MAX_TOKENS,
): number {
  return requestMaxTokens(config) ?? requested ?? fallback;
}

function hasRequestParam(config: LLMConfig, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(config.request || {}, key);
}

function omitsTemperatureByDefault(config: LLMConfig): boolean {
  return /moonshot/i.test(config.baseURL || "");
}

function requestMaxTokens(config: LLMConfig): number | undefined {
  return numericRequestParam(config, "max_tokens");
}

function numericRequestParam(config: LLMConfig, key: string): number | undefined {
  const value = config.request?.[key];
  return typeof value === "number" ? value : undefined;
}

function requestBodyParams(config: LLMConfig): Record<string, unknown> {
  const request = config.request || {};
  const { headers: _headers, ...body } = request;
  return body;
}

function requestHeaders(config: LLMConfig): Record<string, string> {
  const headers = config.request?.headers;
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {};
  return Object.fromEntries(
    Object.entries(headers).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}
