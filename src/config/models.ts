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
 *       "baseURL": "https://api.openai.com/v1",
 *       "temperature": 0.3,
 *       "maxTokens": 4096
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
import type { LLMConfig } from "../types.js";
import { CONFIG_DIR } from "./manager.js";

export const MODELS_FILE = join(CONFIG_DIR, "models.json");

/** The models.json shape */
export interface ModelsConfig {
  current: string;
  models: Record<string, LLMConfig>;
}

/** Default empty models config */
export const defaultModelsConfig: ModelsConfig = {
  current: "",
  models: {},
};

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
        return raw as ModelsConfig;
      }
    }
  } catch {
    // Corrupted, start fresh
  }
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
