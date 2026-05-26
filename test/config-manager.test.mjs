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
} finally {
  rmSync(home, { recursive: true, force: true });
}

console.log("config manager tests passed");
