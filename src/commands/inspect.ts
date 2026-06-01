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

export async function inspectCommand(
  skillName?: string,
  options?: { type?: string; layer?: string },
): Promise<void> {
  const skillsDir = getSkillsDir(readConfig());
  if (!skillName) {
    console.log(`${c.red}Usage: coding-memory inspect <skill> [--type name] [--layer L4]${c.reset}`);
    return;
  }
  const refDir = join(skillsDir, skillName, "reference");
  if (!existsSync(refDir)) {
    console.log(`${c.red}Skill not found:${c.reset} ${skillName}`);
    return;
  }
  const types = options?.type ? [options.type] : listTypes(refDir);
  console.log(`\n${c.bold}${skillName}${c.reset}`);
  for (const type of types) {
    const typeDir = join(refDir, type);
    const { manifest, trace, verify } = readStructuredArtifacts(typeDir);
    if (!manifest || !trace) {
      console.log(`\n  ${c.yellow}${type}${c.reset} ${c.dim}(no MANIFEST/TRACE; run learn again)${c.reset}`);
      continue;
    }
    console.log(`\n  ${c.cyan}${type}${c.reset}`);
    console.log(
      `    layers ${manifest.layers.filter((l) => l.file).length}/8  rules ${trace.rules.length}  templates ${trace.templates.length}  evidence ${manifest.evidence.itemCount}`,
    );
    if (verify) {
      console.log(
        `    verify ${verify.ok ? c.green + "PASS" : c.red + "FAIL"}${c.reset}  warnings ${verify.warnings.length}  errors ${verify.errors.length}`,
      );
    }
    const layers = options?.layer
      ? manifest.layers.filter((layer) => layer.id.toLowerCase() === options.layer?.toLowerCase())
      : manifest.layers;
    for (const layer of layers) {
      console.log(
        `    ${c.bold}${layer.id}${c.reset} ${layer.title} ${c.dim}${layer.ruleCount} rules, ${layer.templateCount} templates, ${layer.evidenceIds.length} evidence refs${c.reset}`,
      );
      if (layer.scope.length > 0) {
        console.log(`      ${c.dim}${layer.scope.map((line) => line.replace(/^[-*]\s*/, "")).join(" | ")}${c.reset}`);
      }
    }
  }
  console.log("");
}

function listTypes(refDir: string): string[] {
  return readdirSync(refDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
