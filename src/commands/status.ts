/**
 * Status command — show learned skills grouped by skill name then project type.
 */

import { readSkillsLock, listSkills } from "../memory/merger.js";
import { getSkillsDir, readConfig } from "../config/manager.js";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
};
const icon = { arrow: "\u2192", bullet: "\u2022" };

export async function statusCommand(): Promise<void> {
  const lock = readSkillsLock();
  const skills = listSkills(lock);
  const skillsDir = getSkillsDir(readConfig());

  console.log(
    `\n${c.bold}${c.cyan}  coding-memory${c.reset} ${c.dim}\u2014 learned skills${c.reset}\n`,
  );

  if (skills.length === 0) {
    console.log(`  ${c.dim}No code memories learned yet.${c.reset}`);
    console.log(`  Run ${c.cyan}coding-memory learn${c.reset} to start.\n`);
    return;
  }

  // Group skills by skill name first, then by project type
  interface TypeGroup {
    type: string;
    languages: typeof skills;
    projects: Set<string>;
    files: number;
    updated: string;
  }
  interface SkillGroup {
    skillName: string;
    types: Map<string, TypeGroup>;
  }
  const skillGroups = new Map<string, SkillGroup>();

  for (const s of skills) {
    // skillPath like "starry-coding/reference/vue3/" → skillName="starry-coding", type="vue3"
    const parts = s.skillPath.split("/");
    const refIdx = parts.indexOf("reference");
    const skillName = refIdx > 0 ? parts[refIdx - 1] : "unknown";
    const projType = refIdx >= 0 ? parts[refIdx + 1] || s.language : s.language;

    if (!skillGroups.has(skillName)) {
      skillGroups.set(skillName, { skillName, types: new Map() });
    }
    const sg = skillGroups.get(skillName)!;

    if (!sg.types.has(projType)) {
      sg.types.set(projType, {
        type: projType,
        languages: [],
        projects: new Set(),
        files: 0,
        updated: s.updatedAt,
      });
    }
    const g = sg.types.get(projType)!;
    g.languages.push(s);
    s.sourceProjects?.forEach((p) => g.projects.add(p));
    g.files += s.sourceFiles.length;
    if (s.updatedAt > g.updated) g.updated = s.updatedAt;
  }

  // Summary table
  console.log(
    `  ${c.bold}${"Skill".padEnd(18)} ${"Proj Type".padEnd(14)} ${"Language".padEnd(16)} ${"Files".padEnd(8)} ${"Projects".padEnd(8)} Last Updated${c.reset}`,
  );
  console.log(
    `  ${c.dim}${"\u2500".repeat(18)} ${"\u2500".repeat(14)} ${"\u2500".repeat(16)} ${"\u2500".repeat(8)} ${"\u2500".repeat(8)} ${"\u2500".repeat(12)}${c.reset}`,
  );

  let totalTypes = 0;
  for (const [, sg] of skillGroups) {
    for (const [projType, g] of sg.types) {
      totalTypes++;
      const sn = `${sg.skillName}`.slice(0, 18).padEnd(18);
      const pt = `${c.cyan}${projType.padEnd(14)}${c.reset}`;
      const lang = g.languages
        .map((s) => s.language)
        .join(", ")
        .slice(0, 16)
        .padEnd(16);
      const files = `${g.files}`.padEnd(8);
      const projs = `${g.projects.size}`.padEnd(8);
      const date = new Date(g.updated).toLocaleDateString();
      console.log(
        `  ${sn} ${pt} ${lang} ${files} ${projs} ${c.dim}${date}${c.reset}`,
      );
    }
  }

  console.log(
    `\n  ${c.bold}Total:${c.reset} ${skillGroups.size} skill(s), ${totalTypes} project type(s), ${skills.length} language group(s)`,
  );
  console.log(
    `  ${c.dim}${skillsDir}/<skill>/reference/<type>/L1-*.md ... L8-*.md${c.reset}\n`,
  );

  // Per-skill details
  for (const [skillName, sg] of skillGroups) {
    console.log(`  ${c.bold}${skillName}${c.reset}`);
    for (const [projType, g] of sg.types) {
      const langs = g.languages.map((s) => s.language).join(", ");
      const detail = `${g.files} files, ${g.projects.size} projects`;
      console.log(
        `  ${c.dim}${icon.arrow} ${projType}:${c.reset} ${langs}  ${c.dim}(${detail})${c.reset}`,
      );
    }
    console.log();
  }
}
