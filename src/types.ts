/**
 * Core types for coding-memory
 */

/** LLM provider configuration */
export interface LLMRequestConfig {
  /** Provider-specific extra HTTP headers */
  headers?: Record<string, string>;
  /** Provider-specific request body params (temperature, max_tokens, thinking, etc.) */
  [key: string]: unknown;
}

export interface LLMConfig {
  provider: "openai" | "openai-compatible" | "anthropic" | "ollama" | "custom";
  model: string;
  apiKey: string;
  baseURL?: string;
  /** Advanced request params. `headers` goes to HTTP headers; other keys go to the request body. */
  request?: LLMRequestConfig;
}

/** A single learned skill entry */
export interface SkillEntry {
  name: string;
  /** Display name — comma-separated human-readable languages (e.g. "Vue, JavaScript, CSS") */
  language: string;
  /** Raw language codes from scanner (e.g. ["vue", "javascript", "css"]) */
  rawLanguages?: string[];
  createdAt: string;
  updatedAt: string;
  learnCount: number;
  /** Projects that contributed to this skill */
  sourceProjects?: string[];
  sourceFiles: string[];
  skillPath: string;
  contentHash: string;
}

/** The skills lockfile shape */
export interface SkillsLock {
  version: number;
  skills: Record<string, SkillEntry>;
}

/** Coding memory configuration */
export interface CodingMemoryConfig {
  /** Skills output directory. Absolute paths and leading ~ are supported. */
  skillsDir: string;
  /** Output language for generated artifacts */
  outputLanguage: "zh" | "en";
  /** File patterns to include when scanning */
  include: string[];
  /** File patterns to exclude when scanning */
  exclude: string[];
  /** Maximum file size in bytes to scan */
  maxFileSize: number;
  /** Whether to respect .gitignore */
  respectGitignore: boolean;
}

/** A scanned file with its metadata */
export interface ScannedFile {
  /** Relative path from project root */
  path: string;
  /** Detected language */
  language: string;
  /** File content */
  content: string;
  /** File size in bytes */
  size: number;
  /** File extension */
  extension: string;
}

/** Language grouping of scanned files */
export interface LanguageGroup {
  language: string;
  files: ScannedFile[];
  /** Total size of all files */
  totalSize: number;
}

/** Result of a single learn operation */
export interface LearnResult {
  skillName: string;
  language: string;
  skillPath: string;
  filesScanned: number;
  newSkill: boolean;
  merged: boolean;
}
