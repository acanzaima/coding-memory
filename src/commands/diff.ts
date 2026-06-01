import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readConfig, getSkillsDir } from "../config/manager.js";
import { readStructuredArtifacts } from "../memory/artifacts.js";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

export async function diffCommand(
  skillName?: string,
  options?: { type?: string },
): Promise<void> {
  const skillsDir = getSkillsDir(readConfig());
  if (!skillName) {
    console.log(`${c.red}Usage: coding-memory diff <skill> [--type name]${c.reset}`);
    return;
  }
  const refDir = join(skillsDir, skillName, "reference");
  if (!existsSync(refDir)) {
    console.log(`${c.red}Skill not found:${c.reset} ${skillName}`);
    return;
  }
  for (const type of options?.type ? [options.type] : listTypes(refDir)) {
    const typeDir = join(refDir, type);
    const current = readStructuredArtifacts(typeDir).trace;
    const previous = readStructuredArtifacts(join(typeDir, ".previous")).trace;
    console.log(`\n${c.bold}${skillName}${c.reset} ${c.cyan}${type}${c.reset}`);
    if (!current) {
      console.log(`  ${c.yellow}No current TRACE.json. Run learn again.${c.reset}`);
      continue;
    }
    if (!previous) {
      console.log(`  ${c.dim}No previous TRACE snapshot yet. Future learn runs will show diffs.${c.reset}`);
      console.log(`  current rules ${current.rules.length}, templates ${current.templates.length}`);
      continue;
    }
    const before = new Set(previous.rules.map((rule) => normalize(rule.text)));
    const after = new Set(current.rules.map((rule) => normalize(rule.text)));
    const added = current.rules.filter((rule) => !before.has(normalize(rule.text)));
    const removed = previous.rules.filter((rule) => !after.has(normalize(rule.text)));
    console.log(
      `  ${c.green}+${added.length}${c.reset} rules  ${c.red}-${removed.length}${c.reset} rules  ${c.dim}${current.templates.length} templates${c.reset}`,
    );
    for (const rule of added.slice(0, 12)) {
      console.log(`  ${c.green}+${c.reset} [${rule.layer}] ${rule.text}`);
    }
    for (const rule of removed.slice(0, 12)) {
      console.log(`  ${c.red}-${c.reset} [${rule.layer}] ${rule.text}`);
    }
  }
  console.log("");
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").slice(0, 180);
}

function listTypes(refDir: string): string[] {
  return readdirSync(refDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("."))
    .sort();
}
