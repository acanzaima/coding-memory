/**
 * Configuration manager for coding-memory.
 *
 * Config:        ~/.coding-memory/config.json  (scan settings, skills output path)
 * Models:        ~/.coding-memory/models.json  (LLM config)
 * Lock:          ~/.coding-memory/lock.json    (skill tracking across projects)
 * Skills output: ~/.coding-memory/             (default, configurable via skillsDir)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { homedir } from "node:os";
import type { CodingMemoryConfig } from "../types.js";

export const CONFIG_DIR =
  process.env.CODING_MEMORY_HOME || join(homedir(), ".coding-memory");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/** Global lock file path */
export const LOCK_FILE = join(CONFIG_DIR, "lock.json");

/** Default skills output directory (skill dirs go directly under ~/.coding-memory/) */
const DEFAULT_SKILLS_DIR = CONFIG_DIR;

export const defaultConfig: CodingMemoryConfig = {
  skillsDir: DEFAULT_SKILLS_DIR,
  outputLanguage: "zh",
  include: [
    "**/*.ts",
    "**/*.tsx",
    "**/*.js",
    "**/*.jsx",
    "**/*.vue",
    "**/*.py",
    "**/*.java",
    "**/*.go",
    "**/*.rs",
    "**/*.rb",
    "**/*.php",
    "**/*.swift",
    "**/*.kt",
    "**/*.cs",
    "**/*.cpp",
    "**/*.c",
    "**/*.h",
    "**/*.sql",
    "**/*.svelte",
    "**/*.css",
    "**/*.scss",
    "**/*.less",
    "**/*.html",
    "**/*.md",
    "**/*.mdx",
    "**/*.json",
    "**/*.yaml",
    "**/*.yml",
    "**/*.toml",
    "**/*.xml",
    "**/*.gradle",
    "**/*.kts",
    "**/*.prisma",
    "**/*.graphql",
    "**/*.gql",
    "**/.env*",
    "**/Dockerfile",
    "**/docker-compose.yaml",
    "**/docker-compose.yml",
    "**/Jenkinsfile",
  ],
  exclude: [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.git/**",
    "**/coverage/**",
    "**/.next/**",
    "**/.nuxt/**",
    "**/target/**",
    "**/__pycache__/**",
    "**/*.min.js",
    "**/*.min.css",
    "**/package-lock.json",
    "**/pnpm-lock.yaml",
    "**/yarn.lock",
  ],
  maxFileSize: 200 * 1024,
  respectGitignore: true,
};

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

export function readConfig(): CodingMemoryConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(raw) as Partial<CodingMemoryConfig>;
      return mergeConfig(defaultConfig, parsed);
    }
    writeConfig(defaultConfig);
  } catch (err) {
    console.warn(
      `Warning: Failed to read config from ${CONFIG_FILE}, using defaults.`,
    );
  }
  return { ...defaultConfig };
}

export function writeConfig(config: CodingMemoryConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export function updateConfig(partial: Partial<CodingMemoryConfig>): void {
  const config = readConfig();
  writeConfig({ ...config, ...partial });
}

/** Expand a leading ~ in user-configured paths. */
export function expandHomePath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

function mergeConfig(
  base: CodingMemoryConfig,
  override: Partial<CodingMemoryConfig>,
): CodingMemoryConfig {
  return {
    skillsDir: override.skillsDir || base.skillsDir,
    maxFileSize: override.maxFileSize ?? base.maxFileSize,
    respectGitignore: override.respectGitignore ?? base.respectGitignore,
    outputLanguage: normalizeOutputLanguage(override.outputLanguage),
    include: override.include || base.include,
    exclude: override.exclude || base.exclude,
  };
}

function normalizeOutputLanguage(
  value: CodingMemoryConfig["outputLanguage"] | undefined,
): CodingMemoryConfig["outputLanguage"] {
  return value === "en" ? "en" : "zh";
}

/** Get the skills output directory (resolved to absolute path) */
export function getSkillsDir(config: CodingMemoryConfig): string {
  const expanded = expandHomePath(config.skillsDir);
  if (isAbsolute(expanded)) return expanded;
  return join(homedir(), expanded);
}
