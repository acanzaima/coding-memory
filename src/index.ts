/**
 * coding-memory - Turn your codebase into AI-readable skills.
 *
 * Main library exports for programmatic usage.
 */

export type {
  LLMConfig,
  SkillEntry,
  SkillsLock,
  CodingMemoryConfig,
  ScannedFile,
  LanguageGroup,
  LearnResult,
} from "./types.js";

export {
  readConfig,
  writeConfig,
  updateConfig,
  defaultConfig,
  CONFIG_DIR,
  CONFIG_FILE,
  getSkillsDir,
  LOCK_FILE,
} from "./config/manager.js";

export {
  readModels,
  writeModels,
  getCurrentModel,
  upsertModel,
  switchModel,
  removeModel,
  listModels,
  listModelNames,
} from "./config/models.js";
export type { ModelsConfig } from "./config/models.js";

export { scanProject, prepareCodeSample } from "./scanner/file-scanner.js";
export {
  detectLanguage,
  getLanguageDisplayName,
  getLanguageCategory,
  isCodeLanguage,
} from "./scanner/language.js";

export { chatCompletion, testConnection } from "./llm/client.js";
export { providerPresets, getBaseURL, getEnvVarName } from "./llm/providers.js";
export type { ChatMessage, ChatCompletionOptions } from "./llm/client.js";
export type { ProviderPreset, ModelPreset } from "./llm/providers.js";

export { generateSkill } from "./memory/generator.js";
export type { GenerateSkillOptions } from "./memory/generator.js";
export {
  collectEvidence,
  renderEvidenceJson,
  renderEvidenceMarkdown,
  renderEvidencePrompt,
} from "./memory/evidence.js";
export type {
  EvidenceConfidence,
  EvidenceItem,
  EvidenceLayer,
  EvidenceReport,
  EvidenceRule,
} from "./memory/evidence.js";
export {
  readSkillsLock,
  writeSkillsLock,
  computeHash,
  findExistingSkill,
  mergeSourceFiles,
  mergeSourceProjects,
  upsertSkillEntry,
  listSkills,
} from "./memory/merger.js";
export {
  generateMasterOverview,
  generateQualityReport,
} from "./memory/overview.js";
