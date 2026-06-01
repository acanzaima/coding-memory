import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig, getSkillsDir } from "../config/manager.js";
import {
  readStructuredArtifacts,
  verifyReferenceArtifacts,
} from "../memory/artifacts.js";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

export async function verifyCommand(
  skillName?: string,
  options?: { type?: string; strict?: boolean },
): Promise<void> {
  const skillsDir = getSkillsDir(readConfig());
  if (!skillName) {
    console.log(`${c.red}Usage: coding-memory verify <skill> [--type name] [--strict]${c.reset}`);
    return;
  }
  const refDir = join(skillsDir, skillName, "reference");
  if (!existsSync(refDir)) {
    console.log(`${c.red}Skill not found:${c.reset} ${skillName}`);
    return;
  }

  let failed = false;
  for (const type of options?.type ? [options.type] : listTypes(refDir)) {
    const typeDir = join(refDir, type);
    const artifacts = readStructuredArtifacts(typeDir);
    if (!artifacts.manifest || !artifacts.trace) {
      failed = true;
      console.log(`\n${c.red}FAIL${c.reset} ${type}: missing MANIFEST.json or TRACE.json`);
      continue;
    }
    const report = verifyReferenceArtifacts({
      skillName,
      projectType: type,
      layers: readLayers(typeDir),
      trace: artifacts.trace,
      manifest: artifacts.manifest,
    });
    writeFileSync(
      join(typeDir, "VERIFY.json"),
      JSON.stringify(report, null, 2) + "\n",
      "utf-8",
    );
    failed = failed || !report.ok || (!!options?.strict && report.warnings.length > 0);
    console.log(
      `\n${report.ok ? c.green + "PASS" : c.red + "FAIL"}${c.reset} ${c.cyan}${type}${c.reset}`,
    );
    console.log(
      `  ${c.dim}layers ${report.summary.layers}/8, rules ${report.summary.rules}, templates ${report.summary.templates}, stale ${report.summary.staleRules}, pending ${report.summary.pendingRules}${c.reset}`,
    );
    for (const error of report.errors) console.log(`  ${c.red}error${c.reset} ${error}`);
    for (const warning of report.warnings) console.log(`  ${c.yellow}warn${c.reset} ${warning}`);
  }
  console.log("");
  if (failed && options?.strict) process.exit(1);
}

function readLayers(typeDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of readdirSync(typeDir)) {
    if (/^L[1-8].*\.md$/.test(file)) {
      out[file.replace(/\.md$/, "")] = requireRead(join(typeDir, file));
    }
  }
  return out;
}

function requireRead(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function listTypes(refDir: string): string[] {
  return readdirSync(refDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
