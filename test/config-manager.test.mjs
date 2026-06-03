import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "coding-memory-config-home-"));
process.env.CODING_MEMORY_HOME = home;

const {
  defaultConfig,
  CONFIG_FILE,
  expandHomePath,
  getSkillsDir,
  readConfig,
  writeConfig,
} = await import("../dist/config/manager.js");

const {
  MODELS_FILE,
  consumeModelsMigrationNotice,
  readModels,
  writeModels,
} = await import("../dist/config/models.js");
const { createModelConfigDefaults } = await import("../dist/commands/config.js");

const openaiDefaults = createModelConfigDefaults({
  providerId: "openai",
  provider: "openai",
  model: "gpt-5.5",
  apiKey: "sk-test",
  baseURL: "https://api.openai.com/v1",
});
assert.equal(openaiDefaults.temperature, undefined);
assert.equal(openaiDefaults.maxTokens, undefined);
assert.deepEqual(openaiDefaults.request, {});

const moonshotDefaults = createModelConfigDefaults({
  providerId: "moonshot",
  provider: "openai-compatible",
  model: "kimi-k2.5",
  apiKey: "sk-test",
  baseURL: "https://api.moonshot.cn/v1",
});
assert.equal(moonshotDefaults.temperature, undefined);
assert.equal(moonshotDefaults.maxTokens, undefined);
assert.deepEqual(moonshotDefaults.request, {});

try {
  assert.equal(expandHomePath("~"), homedir());
  assert.equal(expandHomePath("~/coding-memory"), join(homedir(), "coding-memory"));
  assert.equal(
    getSkillsDir({ ...defaultConfig, skillsDir: "~/.coding-memory" }),
    join(homedir(), ".coding-memory"),
  );
  assert.equal(existsSync(CONFIG_FILE), false);
  const initial = readConfig();
  assert.equal(initial.outputLanguage, "zh");
  assert.equal(existsSync(CONFIG_FILE), true);
  const persisted = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  assert.equal(persisted.outputLanguage, "zh");

  writeModels({
    current: "legacy",
    models: {
      legacy: {
        provider: "openai-compatible",
        model: "legacy-model",
        apiKey: "sk-test",
        baseURL: "https://example.test/v1",
        temperature: 0.7,
        maxTokens: 1234,
        options: { thinking: { type: "enabled" }, top_p: 0.5 },
        headers: { "OpenAI-Project": "team/project" },
      },
    },
  });
  const migrated = readModels();
  const legacy = migrated.models.legacy;
  assert.equal(legacy.temperature, undefined);
  assert.equal(legacy.maxTokens, undefined);
  assert.equal(legacy.options, undefined);
  assert.equal(legacy.headers, undefined);
  assert.equal(legacy.request.temperature, 0.7);
  assert.equal(legacy.request.max_tokens, 1234);
  assert.equal(legacy.request.thinking.type, "enabled");
  assert.equal(legacy.request.top_p, 0.5);
  assert.equal(legacy.request.headers["OpenAI-Project"], "team/project");
  const persistedModels = JSON.parse(readFileSync(MODELS_FILE, "utf8"));
  assert.equal(persistedModels.models.legacy.temperature, undefined);
  assert.equal(persistedModels.models.legacy.request.max_tokens, 1234);
  const notice = consumeModelsMigrationNotice();
  assert.equal(notice.migrated, true);
  assert.deepEqual(notice.modelNames, ["legacy"]);
} finally {
  rmSync(home, { recursive: true, force: true });
}

console.log("config manager tests passed");
