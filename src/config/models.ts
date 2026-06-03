/**
 * Models configuration - manages LLM models and API keys.
 *
 * Stored at ~/.coding-memory/models.json
 * Supports multiple named model configs with one marked as "current".
 *
 * Example models.json:
 * {
 *   "current": "openai-gpt4o",
 *   "models": {
 *     "openai-gpt4o": {
 *       "provider": "openai",
 *       "model": "gpt-4o",
 *       "apiKey": "sk-...",
 *       "baseURL": "https://api.openai.com/v1"
 *     },
 *     "deepseek-v3": {
 *       "provider": "openai-compatible",
 *       "model": "deepseek-v4-pro",
 *       "apiKey": "sk-...",
 *       "baseURL": "https://api.deepseek.com"
 *     }
 *   }
 * }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { LLMConfig, LLMRequestConfig } from "../types.js";
import { CONFIG_DIR } from "./manager.js";

export const MODELS_FILE = join(CONFIG_DIR, "models.json");

/** The models.json shape */
export interface ModelsConfig {
  current: string;
  models: Record<string, LLMConfig>;
}

export interface ModelsMigrationResult {
  migrated: boolean;
  modelNames: string[];
}

/** Default empty models config */
export const defaultModelsConfig: ModelsConfig = {
  current: "",
  models: {},
};

let lastMigration: ModelsMigrationResult = { migrated: false, modelNames: [] };

/**
 * Ensure the config directory exists.
 */
function ensureDir(): void {
  if (!existsSync(dirname(MODELS_FILE))) {
    mkdirSync(dirname(MODELS_FILE), { recursive: true });
  }
}

/**
 * Read models configuration from disk.
 */
export function readModels(): ModelsConfig {
  try {
    if (existsSync(MODELS_FILE)) {
      const raw = JSON.parse(readFileSync(MODELS_FILE, "utf-8"));
      if (raw && raw.models && typeof raw.models === "object") {
        const migrated = migrateModelsConfig(raw as ModelsConfig);
        if (migrated.migrated) {
          writeModels(raw as ModelsConfig);
          lastMigration = migrated;
        }
        return raw as ModelsConfig;
      }
    }
  } catch {
    // Corrupted, start fresh
  }
  lastMigration = { migrated: false, modelNames: [] };
  return { ...defaultModelsConfig };
}

/**
 * Write models configuration to disk.
 */
export function writeModels(config: ModelsConfig): void {
  ensureDir();
  writeFileSync(MODELS_FILE, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Get the currently active LLM configuration.
 * Returns null if no model is configured.
 */
export function getCurrentModel(): LLMConfig | null {
  const config = readModels();
  if (!config.current || !config.models[config.current]) {
    return null;
  }
  return config.models[config.current];
}

/**
 * Add or update a model configuration.
 */
export function upsertModel(name: string, llmConfig: LLMConfig): void {
  const config = readModels();
  config.models[name] = llmConfig;

  // If this is the first model or no current is set, make it current
  if (!config.current || !config.models[config.current]) {
    config.current = name;
  }

  writeModels(config);
}

/**
 * Switch the active model.
 */
export function switchModel(name: string): boolean {
  const config = readModels();
  if (!config.models[name]) {
    return false;
  }
  config.current = name;
  writeModels(config);
  return true;
}

/**
 * Remove a model configuration.
 */
export function removeModel(name: string): boolean {
  const config = readModels();
  if (!config.models[name]) {
    return false;
  }

  delete config.models[name];

  // If we removed the current model, pick another
  if (config.current === name) {
    const remaining = Object.keys(config.models);
    config.current = remaining.length > 0 ? remaining[0] : "";
  }

  writeModels(config);
  return true;
}

/**
 * List all configured model names.
 */
export function listModelNames(): string[] {
  return Object.keys(readModels().models);
}

/**
 * Get all configured models with their metadata.
 */
export function listModels(): Array<{
  name: string;
  provider: string;
  model: string;
}> {
  const config = readModels();
  return Object.entries(config.models).map(([name, cfg]) => ({
    name,
    provider: cfg.provider,
    model: cfg.model,
  }));
}

export function consumeModelsMigrationNotice(): ModelsMigrationResult {
  const result = lastMigration;
  lastMigration = { migrated: false, modelNames: [] };
  return result;
}

type LegacyLLMConfig = LLMConfig & {
  temperature?: number;
  maxTokens?: number;
  options?: Record<string, unknown>;
  headers?: Record<string, string>;
};

function migrateModelsConfig(config: ModelsConfig): ModelsMigrationResult {
  const modelNames: string[] = [];
  for (const [name, model] of Object.entries(config.models)) {
    const legacy = model as LegacyLLMConfig;
    const request = normalizeRequest(legacy.request);
    let changed = false;

    if (legacy.temperature !== undefined && request.temperature === undefined) {
      request.temperature = legacy.temperature;
      changed = true;
    }
    if (legacy.maxTokens !== undefined && request.max_tokens === undefined) {
      request.max_tokens = legacy.maxTokens;
      changed = true;
    }
    if (legacy.options && typeof legacy.options === "object") {
      for (const [key, value] of Object.entries(legacy.options)) {
        if (request[key] === undefined) request[key] = value;
      }
      changed = true;
    }
    if (legacy.headers && typeof legacy.headers === "object") {
      const headers = normalizeHeaders(request.headers);
      for (const [key, value] of Object.entries(legacy.headers)) {
        if (headers[key] === undefined) headers[key] = value;
      }
      request.headers = headers;
      changed = true;
    }

    if ("temperature" in legacy) {
      delete legacy.temperature;
      changed = true;
    }
    if ("maxTokens" in legacy) {
      delete legacy.maxTokens;
      changed = true;
    }
    if ("options" in legacy) {
      delete legacy.options;
      changed = true;
    }
    if ("headers" in legacy) {
      delete legacy.headers;
      changed = true;
    }

    if (changed) {
      model.request = request;
      modelNames.push(name);
    }
  }
  return { migrated: modelNames.length > 0, modelNames };
}

function normalizeRequest(value: unknown): LLMRequestConfig {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as LLMRequestConfig) };
  }
  return {};
}

function normalizeHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}
