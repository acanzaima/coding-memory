/**
 * Learn command — scan project, generate/update global code memory skills.
 *
 * Output: ~/.coding-memory/<skillName>/reference/<projectType>/L1-*.md ... L8-*.md
 *
 * All detected languages are merged into a single generation pass —
 * L1-L8 describes the project as a whole, not per-language.
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  cpSync,
} from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { readConfig, getSkillsDir } from "../config/manager.js";
import { getCurrentModel } from "../config/models.js";
import { scanProject } from "../scanner/file-scanner.js";
import { getLanguageDisplayName } from "../scanner/language.js";
import { select } from "../cli/select.js";
import { generateSkill } from "../memory/generator.js";
import {
  collectEvidence,
  renderEvidenceMarkdown,
  renderEvidencePrompt,
  renderEvidenceJson,
} from "../memory/evidence.js";
import {
  readSkillsLock,
  writeSkillsLock,
  findExistingSkill,
  computeHash,
  upsertSkillEntry,
} from "../memory/merger.js";
import {
  generateMasterOverview,
  generateQualityReport,
} from "../memory/overview.js";
import {
  buildReferenceManifest,
  buildTrace,
  copyTraceSnapshot,
  verifyReferenceArtifacts,
  readStructuredArtifacts,
  type TraceFile,
} from "../memory/artifacts.js";
import {
  completeLearnRun,
  failLearnRun,
  openLearnRun,
  stableHash,
  type LearnRun,
} from "../memory/run.js";
import type {
  CodingMemoryConfig,
  LanguageGroup,
  LearnResult,
  LLMConfig,
  SkillEntry,
  SkillsLock,
} from "../types.js";
import type { EvidenceReport } from "../memory/evidence.js";

interface LearnContext {
  projectRoot: string;
  skillName: string;
  groups: LanguageGroup[];
  lock: SkillsLock;
  baseDir: string;
  skillDir: string;
  refDir: string;
  projType: string;
  typeDir: string;
  lockKey: string;
  existingEntry: SkillEntry | null;
  existingContent: string | null;
  allFiles: LanguageGroup["files"];
  combinedLanguages: string;
  combinedGroup: LanguageGroup;
  evidenceReport: EvidenceReport;
  evidencePrompt: string;
  outputLanguage: CodingMemoryConfig["outputLanguage"];
  run: LearnRun | null;
  previousTrace: TraceFile | null;
}

interface GovernedLayers {
  skillContent: string;
  layers: Record<string, string>;
}

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};
const icon = {
  ok: "\u2713",
  err: "\u2717",
  info: "\u2139",
  arrow: "\u2192",
  sparkles: "\u2728",
};

function spinner(msg: string) {
  const f = [
    "\u280b",
    "\u2819",
    "\u2839",
    "\u2838",
    "\u283c",
    "\u2834",
    "\u2826",
    "\u2827",
    "\u2807",
    "\u280f",
  ];
  let i = 0,
    a = true;
  let t: ReturnType<typeof setInterval>;
  const safeWrite = (text: string) => {
    try {
      process.stdout.write(text);
    } catch {
      a = false;
      clearInterval(t);
    }
  };
  const onStdoutError = () => {
    a = false;
    clearInterval(t);
  };
  process.stdout.on("error", onStdoutError);
  t = setInterval(() => {
    if (a)
      safeWrite(
        `\r  ${c.cyan}${f[i++ % f.length]}${c.reset} ${msg}`,
      );
  }, 80);
  return {
    update: (m: string) => {
      msg = m;
    },
    stop: (s?: string) => {
      a = false;
      clearInterval(t);
      process.stdout.off("error", onStdoutError);
      if (s) safeWrite(`\r  ${c.green}${icon.ok}${c.reset} ${s}\n`);
      else safeWrite("\r\x1b[K");
    },
  };
}

export async function learnCommand(
  projectRoot: string,
  skillNameArg?: string,
  options?: {
    dryRun?: boolean;
    focus?: string;
    projectType?: string;
    resume?: boolean | string;
  },
): Promise<void> {
  const config = readConfig();

  const llmConfig = getCurrentModel();
  if (!options?.dryRun && !llmConfig) {
    console.log(
      `\n  ${c.red}${icon.err}${c.reset} No LLM model configured. Run ${c.cyan}coding-memory config${c.reset}\n`,
    );
    return;
  }

  const sp = spinner("Scanning project files...");
  const groups = scanProject(projectRoot, config);
  sp.stop(`${groups.length} language group(s) found`);

  if (groups.length === 0) {
    console.log(
      `\n  ${c.yellow}${icon.info}${c.reset} No source files found.\n`,
    );
    return;
  }

  console.log(
    `\n  ${c.bold}Detected ${groups.length} language group(s):${c.reset}`,
  );
  for (const g of groups) {
    console.log(
      `    ${getLanguageDisplayName(g.language)}  ${c.dim}${g.files.length} files${c.reset}`,
    );
  }

  // Choose skill — existing or new
  const skillName = skillNameArg || (await chooseSkill());
  if (!skillName) return;

  const context = buildLearnContext(projectRoot, skillName, groups, config, {
    projectType: options?.projectType,
    resume: options?.resume,
    dryRun: options?.dryRun,
  });

  if (!options?.dryRun) {
    ensureLearningDirs(context);
    console.log(
      `\n  ${c.dim}Project type: ${c.cyan}${context.projType}${c.reset}`,
    );
  }

  const results: LearnResult[] = [];

  const tag = context.existingEntry
    ? `${c.yellow}${icon.arrow} updating${c.reset} ${c.dim}(x${context.existingEntry.learnCount})${c.reset}`
    : `${c.green}+ creating${c.reset}`;
  console.log(
    `\n  ${c.bold}${context.combinedLanguages}${c.reset}  ${c.dim}${context.allFiles.length} files${c.reset}  ${tag}`,
  );

  if (options?.dryRun) {
    results.push(createLearnResult(context));
  } else {
    const sp2 = spinner("Planning (0/5)...");
    try {
      const rawSkillContent = await runGeneration(
        context,
        llmConfig!,
        options,
        (msg: string) => sp2.update(msg),
      );
      sp2.stop("Generation complete");

      const governed = validateAndGovernLayers(
        rawSkillContent,
        context.outputLanguage,
        context.evidenceReport,
      );
      results.push(writeLearningArtifacts(context, governed));
      if (context.run) completeLearnRun(context.run);
    } catch (err) {
      sp2.stop();
      if (context.run) failLearnRun(context.run, err);
      throw err;
    }
  }

  // Master overview
  if (results.length > 0 && !options?.dryRun) {
    updateMasterArtifacts(context);
  }

  // Diff summary when updating
  if (context.existingEntry && !options?.dryRun) {
    printDiffSummary(
      context.allFiles.length,
      context.combinedLanguages,
      context.projType,
      context.existingEntry.learnCount + 1,
    );
  }

  const doneText = options?.dryRun
    ? "Preview complete (no files written)"
    : "Done";
  console.log(`\n  ${c.bold}${icon.sparkles}  ${doneText}${c.reset}\n`);
  for (const r of results) {
    const a = options?.dryRun
      ? `${c.dim}Preview${c.reset}`
      : r.newSkill
        ? `${c.green}+ Created${c.reset}`
        : `${c.yellow}${icon.arrow} Updated${c.reset}`;
    console.log(
      `  ${a}  ${c.cyan}${r.skillName}${c.reset}  ${c.dim}(${r.filesScanned} files)${c.reset}`,
    );
  }
  if (!options?.dryRun) {
    console.log(`\n  ${c.dim}Skill:  ${context.skillDir}${c.reset}\n`);
  } else {
    console.log(`\n  ${c.dim}No files written (--dry-run)${c.reset}\n`);
  }
}

// ── Helpers ────────────────────────────────────────────────

function buildLearnContext(
  projectRoot: string,
  skillName: string,
  groups: LanguageGroup[],
  config: CodingMemoryConfig,
  options?: { projectType?: string; resume?: boolean | string; dryRun?: boolean },
): LearnContext {
  const lock = readSkillsLock();
  const baseDir = getSkillsDir(config);
  const skillDir = join(baseDir, skillName);
  const refDir = join(skillDir, "reference");
  const projType = options?.projectType || detectProjectType(projectRoot);
  const typeDir = join(refDir, projType);

  const allFiles = groups.flatMap((g) => g.files);
  const combinedLanguages = groups
    .map((g) => getLanguageDisplayName(g.language))
    .join(", ");
  const combinedGroup: LanguageGroup = {
    language: groups.map((g) => g.language).join(", "),
    files: allFiles,
    totalSize: groups.reduce((sum, g) => sum + g.totalSize, 0),
  };
  const evidenceReport = collectEvidence(combinedGroup, projType);
  const evidencePrompt = renderEvidencePrompt(evidenceReport);
  const scanHash = stableHash(
    JSON.stringify(
      allFiles
        .map((file) => ({
          path: file.path,
          size: file.size,
          hash: stableHash(file.content),
        }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    ),
  );

  const lockKey = `${skillName}/${projType}`;
  const existingEntry = findExistingSkill(lock, lockKey);
  const existingContent = existingEntry ? readExistingLayers(typeDir) : null;
  const previousTrace = existingEntry
    ? copyTraceSnapshot(readStructuredArtifacts(typeDir).trace)
    : null;
  const run = options?.dryRun
    ? null
    : openLearnRun({
        projectRoot,
        skillName,
        projectType: projType,
        scanHash,
        evidenceReport,
        retryMode: false,
        resume: options?.resume,
      });

  return {
    projectRoot,
    skillName,
    groups,
    lock,
    baseDir,
    skillDir,
    refDir,
    projType,
    typeDir,
    lockKey,
    existingEntry,
    existingContent,
    allFiles,
    combinedLanguages,
    combinedGroup,
    evidenceReport,
    evidencePrompt,
    outputLanguage: config.outputLanguage,
    run,
    previousTrace,
  };
}

function ensureLearningDirs(context: LearnContext): void {
  if (!existsSync(context.refDir))
    mkdirSync(context.refDir, { recursive: true });
  if (!existsSync(context.typeDir)) {
    mkdirSync(context.typeDir, { recursive: true });
  }
}

async function runGeneration(
  context: LearnContext,
  llmConfig: LLMConfig,
  options: { focus?: string } | undefined,
  onProgress: (msg: string) => void,
): Promise<string> {
  let skillContent = await generateSkill(llmConfig, {
    group: context.combinedGroup,
    skillName: context.skillName,
    projectName: context.projectRoot,
    existingSkill: context.existingContent,
    onProgress,
    focus: options?.focus,
    retryMode: false,
    evidence: appendUpdateTracePolicy(context.evidencePrompt, context),
    outputLanguage: context.outputLanguage,
    run: context.run || undefined,
  });

  let { layers, missing } = splitLayers(skillContent);
  let validationErrors = validateLayers(layers);

  if (missing.length > 0 || validationErrors.length > 0) {
    printLayerValidationIssues(missing, validationErrors);
    onProgress("Retrying generation (2/2)...");
    skillContent = await generateSkill(llmConfig, {
      group: context.combinedGroup,
      skillName: context.skillName,
      projectName: context.projectRoot,
      existingSkill: context.existingContent,
      onProgress,
      focus: options?.focus,
      retryMode: true,
      evidence: appendUpdateTracePolicy(context.evidencePrompt, context),
      outputLanguage: context.outputLanguage,
      run: context.run || undefined,
    });
    const retry = splitLayers(skillContent);
    layers = retry.layers;
    missing = retry.missing;
    validationErrors = validateLayers(layers);

    if (missing.length > 0 || validationErrors.length > 0) {
      console.log(
        `\n  ${c.yellow}${icon.info}${c.reset} Retry still has issues — writing what we have:`,
      );
      for (const m of missing) {
        console.log(`    ${c.yellow}⚠${c.reset} ${m} still missing`);
      }
      for (const e of validationErrors) {
        console.log(`    ${c.yellow}⚠${c.reset} ${e}`);
      }
    }
  }

  return skillContent;
}

function appendUpdateTracePolicy(baseEvidence: string, context: LearnContext): string {
  if (!context.previousTrace) return baseEvidence;
  const currentFiles = new Set(context.allFiles.map((file) => file.path));
  const stale = context.previousTrace.rules.filter(
    (rule) => rule.files.length > 0 && rule.files.every((file) => !currentFiles.has(file)),
  );
  const active = context.previousTrace.rules.filter(
    (rule) => rule.files.length === 0 || rule.files.some((file) => currentFiles.has(file)),
  );
  return [
    baseEvidence,
    "",
    "## Update Trace Policy",
    "Previous structured rules are available as lifecycle hints.",
    `- Previously active/current rules still supported by files: ${active.length}`,
    `- Previously stale rules whose cited files disappeared: ${stale.length}`,
    "- Preserve active rules only when current code/evidence still supports them.",
    "- Downgrade or remove stale rules; do not copy stale examples into templates.",
    ...stale.slice(0, 20).map((rule) => `- STALE ${rule.layer}: ${rule.text}`),
  ].join("\n");
}

function validateAndGovernLayers(
  skillContent: string,
  outputLanguage: CodingMemoryConfig["outputLanguage"] = "zh",
  evidence?: EvidenceReport,
): GovernedLayers {
  const governedContent = governSkillContent(
    skillContent,
    outputLanguage,
    evidence,
  );
  const { layers } = splitLayers(governedContent);
  const postSanitizeErrors = validateLayers(layers, outputLanguage);
  if (postSanitizeErrors.length > 0) {
    console.log(
      `\n  ${c.yellow}${icon.info}${c.reset} Post-sanitize validation issues:`,
    );
    for (const e of postSanitizeErrors) {
      console.log(`    ${c.yellow}⚠${c.reset} ${e}`);
    }
  }

  return { skillContent: governedContent, layers };
}

function writeLearningArtifacts(
  context: LearnContext,
  governed: GovernedLayers,
): LearnResult {
  snapshotPreviousArtifacts(context);
  for (const [name, content] of Object.entries(governed.layers)) {
    writeFileSync(join(context.typeDir, `${name}.md`), content, "utf-8");
  }

  writeFileSync(
    join(context.typeDir, "OVERVIEW.md"),
    generateTypeOverview(
      context.projType,
      context.combinedGroup,
      context.outputLanguage,
    ),
    "utf-8",
  );
  writeFileSync(
    join(context.typeDir, "EVIDENCE.md"),
    renderEvidenceMarkdown(context.evidenceReport, context.outputLanguage),
    "utf-8",
  );
  writeFileSync(
    join(context.typeDir, "EVIDENCE.json"),
    renderEvidenceJson(context.evidenceReport),
    "utf-8",
  );
  const trace = buildTrace({
    skillName: context.skillName,
    projectType: context.projType,
    layers: governed.layers,
    evidence: context.evidenceReport,
  });
  const manifest = buildReferenceManifest({
    skillName: context.skillName,
    projectType: context.projType,
    outputLanguage: context.outputLanguage,
    layers: governed.layers,
    evidence: context.evidenceReport,
  });
  const verify = verifyReferenceArtifacts({
    skillName: context.skillName,
    projectType: context.projType,
    layers: governed.layers,
    trace,
    manifest,
  });
  writeFileSync(
    join(context.typeDir, "TRACE.json"),
    JSON.stringify(trace, null, 2) + "\n",
    "utf-8",
  );
  writeFileSync(
    join(context.typeDir, "MANIFEST.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8",
  );
  writeFileSync(
    join(context.typeDir, "VERIFY.json"),
    JSON.stringify(verify, null, 2) + "\n",
    "utf-8",
  );

  const contentHash = computeHash(governed.skillContent);
  const newLock = upsertSkillEntry(
    context.lock,
    context.lockKey,
    context.projType,
    context.combinedLanguages,
    context.groups.map((g) => g.language),
    `${context.skillName}/reference/${context.projType}/`,
    contentHash,
    context.allFiles.map((f) => `${context.projectRoot}/${f.path}`),
    context.projectRoot,
    context.existingEntry,
  );
  writeSkillsLock(newLock);
  Object.assign(context.lock, newLock);

  return createLearnResult(context);
}

function snapshotPreviousArtifacts(context: LearnContext): void {
  if (!context.existingEntry || !existsSync(context.typeDir)) return;
  const previousDir = join(context.typeDir, ".previous");
  if (!existsSync(previousDir)) mkdirSync(previousDir, { recursive: true });
  for (const file of ["TRACE.json", "MANIFEST.json", "VERIFY.json"]) {
    const from = join(context.typeDir, file);
    if (existsSync(from)) {
      cpSync(from, join(previousDir, file));
    }
  }
}

function updateMasterArtifacts(context: LearnContext): void {
  const ovSp = spinner("Updating master overview...");
  const overview = generateMasterOverview(
    context.lock,
    context.skillDir,
    context.refDir,
    context.skillName,
    context.outputLanguage,
  );
  writeFileSync(join(context.skillDir, "SKILL.md"), overview, "utf-8");
  writeFileSync(
    join(context.skillDir, "QUALITY.md"),
    generateQualityReport(
      context.lock,
      context.skillDir,
      context.refDir,
      context.skillName,
      context.outputLanguage,
    ),
    "utf-8",
  );
  ovSp.stop("Overview updated");
}

function createLearnResult(context: LearnContext): LearnResult {
  return {
    skillName: context.skillName,
    language: context.combinedLanguages,
    skillPath: join(context.refDir, context.projType),
    filesScanned: context.allFiles.length,
    newSkill: !context.existingEntry,
    merged: !!context.existingEntry,
  };
}

function printLayerValidationIssues(
  missing: string[],
  validationErrors: string[],
): void {
  console.log(
    `\n  ${c.yellow}${icon.info}${c.reset} Layer validation issues detected:`,
  );
  for (const m of missing) {
    console.log(`    ${c.red}✗${c.reset} ${m} missing`);
  }
  for (const e of validationErrors) {
    console.log(`    ${c.red}✗${c.reset} ${e}`);
  }
  console.log(
    `  ${c.dim}Retrying with stricter format requirements...${c.reset}`,
  );
}

export async function chooseSkill(baseDir = getSkillsDir(readConfig())): Promise<string | null> {
  // Scan configured skillsDir for existing skill directories.
  let existing: string[] = [];
  try {
    if (existsSync(baseDir)) {
      existing = readdirSync(baseDir, { withFileTypes: true })
        .filter(
          (e) =>
            e.isDirectory() &&
            !e.name.startsWith(".") &&
            e.name !== "reference",
        )
        .map((e) => e.name);
    }
  } catch {
    /* ok */
  }

  if (existing.length > 0) {
    console.log(`\n  ${c.bold}Choose a skill:${c.reset}`);
    const choices = [...existing, `${c.green}+ 新建 skill${c.reset}`];
    const idx = await select("Select:", choices);
    if (idx < 0) return null;
    if (idx < existing.length) return existing[idx];

    // New skill — prompt for name
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const name = await new Promise<string>((resolve) =>
      rl.question(`  ${c.yellow}Skill name:${c.reset} `, (a) => {
        rl.close();
        resolve(a.trim());
      }),
    );
    return name || null;
  }

  // No existing skills — prompt for name
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const name = await new Promise<string>((resolve) =>
    rl.question(`\n  ${c.yellow}Skill name:${c.reset} `, (a) => {
      rl.close();
      resolve(a.trim());
    }),
  );
  return name || null;
}

function detectProjectType(root: string): string {
  const pkg = join(root, "package.json");
  if (existsSync(pkg)) {
    try {
      const d = {
        ...JSON.parse(readFileSync(pkg, "utf-8")).dependencies,
        ...JSON.parse(readFileSync(pkg, "utf-8")).devDependencies,
      };
      const k = Object.keys(d || {});
      if (k.some((x) => x === "vue")) {
        const v = d["vue"] || "";
        return v.startsWith("^3") || v.startsWith("3") ? "vue3" : "vue2";
      }
      if (k.some((x) => x === "next")) return "nextjs";
      if (k.some((x) => x === "react")) return "react";
      if (k.some((x) => x === "@angular/core")) return "angular";
      if (k.some((x) => x === "svelte")) return "svelte";
      if (k.some((x) => x === "@nestjs/core")) return "nestjs";
      if (k.some((x) => x === "express")) return "express";
    } catch {
      /* ok */
    }
  }
  if (
    existsSync(join(root, "pom.xml")) ||
    existsSync(join(root, "build.gradle"))
  )
    return "spring-boot";
  if (existsSync(join(root, "go.mod"))) return "go";
  if (existsSync(join(root, "Cargo.toml"))) return "rust";
  if (
    existsSync(join(root, "pyproject.toml")) ||
    existsSync(join(root, "requirements.txt"))
  )
    return "python";
  return "unknown";
}

/**
 * Read all existing L1-L8 layer files from a type directory.
 * Returns concatenated content for LLM merge context, or null if none exist.
 */
function readExistingLayers(typeDir: string): string | null {
  if (!existsSync(typeDir)) return null;
  let allContent = "";
  try {
    const files = readdirSync(typeDir);
    for (let l = 1; l <= 8; l++) {
      const match = files.find((f) => f.startsWith(`L${l}-`));
      if (match) {
        allContent += readFileSync(join(typeDir, match), "utf-8") + "\n";
      }
    }
  } catch {
    return null;
  }
  return allContent.trim() || null;
}

/** Known L1-L8 layer names for validation and fuzzy matching */
const EXPECTED_LAYERS = [
  { id: "L1", cn: "项目骨架" },
  { id: "L2", cn: "模块与接口" },
  { id: "L3", cn: "命名与类型" },
  { id: "L4", cn: "实现模式" },
  { id: "L5", cn: "数据与状态" },
  { id: "L6", cn: "质量保障" },
  { id: "L7", cn: "横切关注点" },
  { id: "L8", cn: "工程化与启动" },
];

/**
 * Split LLM output into individual L1-L8 sections.
 * Robust against multiple format variants:
 *   ## L1 · 项目骨架
 *   ## L1 项目骨架
 *   ## L1：项目骨架
 *   ## L1: 项目骨架
 *   ### L1 · 项目骨架
 *
 * Returns a map of "L1-项目骨架" → content, and a list of missing layer IDs.
 */
function splitLayers(content: string): {
  layers: Record<string, string>;
  missing: string[];
} {
  const layers: Record<string, string> = {};

  // Try multiple split patterns, from most specific to least
  const patterns = [
    /\n(?=## L\d+[ ·：:]\s*.+)/,
    /\n(?=### L\d+[ ·：:]\s*.+)/,
    /\n(?=## L\d+[\s\n])/,
    /\n(?=### L\d+[\s\n])/,
  ];

  let sections: string[] = [];
  for (const pat of patterns) {
    sections = content.split(pat);
    if (sections.length >= 8) break;
  }

  // If still not enough sections, try matching each layer individually
  if (sections.length < 8) {
    sections = [content]; // fallback: single blob
  }

  for (const s of sections) {
    // Match various header formats
    const m =
      s.match(/^#{2,3}\s*(L\d+)\s*[·：:\s]+\s*(.+?)(?:\s*$|\n)/m) ||
      s.match(/^#{2,3}\s*(L\d+)\s*$/m);
    if (m) {
      const layerId = m[1];
      // Find the matching expected layer to get canonical name
      const expected = EXPECTED_LAYERS.find((e) => e.id === layerId);
      const canonicalName = expected
        ? `${layerId}-${expected.cn}`
        : `${layerId}-${m[2]?.trim() || "unknown"}`;
      layers[canonicalName] = s.trim();
    }
  }

  // Check for missing layers
  const missing = EXPECTED_LAYERS.filter(
    (e) => !Object.keys(layers).some((k) => k.startsWith(e.id)),
  ).map((e) => e.id);

  return { layers, missing };
}

/**
 * Validate that all 8 layers are present and have minimum content.
 * Returns a list of validation errors (empty = valid).
 */
function validateLayers(
  layers: Record<string, string>,
  outputLanguage: CodingMemoryConfig["outputLanguage"] = "zh",
): string[] {
  const errors: string[] = [];

  for (const expected of EXPECTED_LAYERS) {
    const key = Object.keys(layers).find((k) => k.startsWith(expected.id));
    if (!key) {
      errors.push(`${expected.id} (${expected.cn}) missing`);
      continue;
    }
    const content = layers[key];
    // Each layer should have at least convention + template + anti-pattern
    const hasConvention =
      /###\s+(?:约定|规范|规则|模式|组织|设计|使用|命名|管理|策略|工具|启动|配置|环境|Convention|Conventions|Rules|Pattern|Patterns|Organization|Design|Usage|Naming|Management|Strategy|Tooling|Bootstrap|Configuration|Environment)/i.test(
        content,
      );
    const hasTemplate =
      outputLanguage === "en"
        ? /###\s+Template[：:]/i.test(content) ||
          /###\s+模板[：:]/.test(content)
        : /###\s+模板[：:]/.test(content) ||
          /###\s+Template[：:]/i.test(content);
    const hasAntiPattern =
      outputLanguage === "en"
        ? /###\s+Anti-?patterns?/i.test(content) || /###\s+反模式/.test(content)
        : /###\s+反模式/.test(content) ||
          /###\s+Anti-?patterns?/i.test(content);

    if (!hasConvention && !hasTemplate && !hasAntiPattern) {
      errors.push(
        `${expected.id} (${expected.cn}) missing structure (convention/template/anti-pattern)`,
      );
      continue;
    }
    if (
      !hasTemplate &&
      !content.includes("无现有模式") &&
      !content.toLowerCase().includes("no existing pattern")
    ) {
      errors.push(
        `${expected.id} (${expected.cn}) missing template section (required; use "无现有模式" or "No existing pattern" if none)`,
      );
    }
  }

  return errors;
}

function printDiffSummary(
  filesScanned: number,
  languages: string,
  projType: string,
  learnCount: number,
): void {
  const lines: string[] = [];
  lines.push(`\n  ${c.bold}Change summary:${c.reset}`);
  lines.push(
    `    ${c.green}+${c.reset} Rescanned ${filesScanned} files in ${languages}`,
  );
  lines.push(
    `    ${c.yellow}${icon.arrow}${c.reset} Learn count: ${learnCount}`,
  );
  lines.push(
    `    ${c.dim}  Review changes in reference/${projType}/L1-*.md ... L8-*.md${c.reset}`,
  );
  console.log(lines.join("\n"));
}

/** Product governance pass for generated L1-L8 content. */
function governSkillContent(
  content: string,
  outputLanguage: CodingMemoryConfig["outputLanguage"] = "zh",
  evidence?: EvidenceReport,
): string {
  return sanitizeSkillContentStrict(content, outputLanguage, evidence);
}

function sanitizeSkillContentStrict(
  content: string,
  outputLanguage: CodingMemoryConfig["outputLanguage"] = "zh",
  evidence?: EvidenceReport,
): string {
  const parts = content.split(/\n(?=## L\d+[ ·：:])/);
  const out: string[] = [];

  for (const sec of parts) {
    if (!sec.match(/^## L\d+/)) {
      out.push(sec);
      continue;
    }

    const extractedGapLines: string[] = [];
    const cleanSec = sec.replace(
      /\n###\s+(?:待验证|To Verify|Unverified|⚠️\s*Gaps)\s*\n([\s\S]*?)(?=\n###|\n---|\n## |$)/gi,
      (_whole, body: string) => {
        extractedGapLines.push(
          ...body
            .split("\n")
            .map((l: string) => l.trim())
            .filter(Boolean),
        );
        return "";
      },
    );

    const lines = cleanSec.split("\n");
    const good: string[] = [];
    const bad: string[] = [];
    let block = false;
    for (const line of lines) {
      if (/^\s*`{3}/.test(line)) {
        block = !block;
        good.push(line);
        continue;
      }
      if (block || line.startsWith("#") || line.startsWith("|")) {
        good.push(line);
        continue;
      }
      if (isSpeculativeLine(line)) bad.push(line);
      else good.push(line);
    }

    let result = ensureTemplateSectionStrict(good.join("\n"), outputLanguage);
    const unsafeTemplate = findUnsafeTemplateIssue(result, evidence);
    if (unsafeTemplate) {
      result = replaceTemplateWithNoPattern(result);
      bad.push(
        outputLanguage === "en"
          ? `- [To Verify] ${unsafeTemplate}`
          : `- [待验证] ${unsafeTemplate}`,
      );
    }

    result = appendStructuredGaps(
      result,
      [...bad, ...extractedGapLines],
      outputLanguage,
    );
    out.push(result);
  }

  return out.join("\n");
}

function isSpeculativeLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (
    trimmed.includes("无现有模式") ||
    trimmed.toLowerCase().includes("no existing pattern")
  ) {
    return false;
  }
  return /\[待验证\]|\[To Verify\]|建议|推荐使用|建议采用|推测(?!的)|推断(?!的)|可能(?!是)|不代表现有|未展示|未发现|suggest|recommend|consider|might|maybe|not found|not shown|unverified|to verify/i.test(
    trimmed,
  );
}

function findUnsafeTemplateIssue(
  section: string,
  evidence?: EvidenceReport,
): string | null {
  const match = section.match(
    /\n###\s+模板[：:]\s*(.+)\n([\s\S]*?)(?=\n###|\n---|\n## |$)/,
  );
  if (!match) return null;
  const name = match[1].trim();
  const body = match[2] || "";
  if (
    /无现有模式/.test(name) ||
    /无现有模式/.test(body) ||
    /no existing pattern/i.test(name) ||
    /no existing pattern/i.test(body)
  ) {
    return null;
  }
  if (
    /\[待验证\]|\[To Verify\]|待验证|暂未实现|建议|推荐使用|可考虑|建议骨架|推测|可能|未发现|未展示|suggest|recommend|consider|might|maybe|not found|not shown|unverified|to verify/i.test(
      body,
    )
  ) {
    return `模板「${name}」包含建议性或未验证内容，已降级为"无现有模式"。`;
  }
  // Cross-reference tool names with evidence — if found in scanned files, it's legitimate
  const toolPattern =
    /\b(Vitest|Jest|Cypress|Playwright|Sentry|SonarQube|JaCoCo|Checkstyle|SpotBugs|commitlint|husky|GitHub Actions|vite-plugin-compression|vite-plugin-imagemin)\b/gi;
  const foundTools = body.match(toolPattern);
  if (foundTools) {
    // Check if these tools actually exist in the project
    const confirmedTools = evidence
      ? evidence.items.filter(
          (item) =>
            foundTools.some((t) =>
              item.summary.toLowerCase().includes(t.toLowerCase()),
            ) ||
            foundTools.some((t) =>
              item.files.some((f) => f.toLowerCase().includes(t.toLowerCase())),
            ),
        )
      : [];
    const unconfirmed = foundTools.filter(
      (t) =>
        !confirmedTools.some(
          (item) =>
            item.summary.toLowerCase().includes(t.toLowerCase()) ||
            item.files.some((f) => f.toLowerCase().includes(t.toLowerCase())),
        ),
    );
    if (unconfirmed.length > 0) {
      return `模板「${name}」引用了未确认工具 ${unconfirmed.join(", ")}，已降级为"无现有模式"。`;
    }
    // All tools confirmed in evidence — template is legitimate, keep it
    return null;
  }
  return null;
}

function replaceTemplateWithNoPattern(section: string): string {
  return section.replace(
    /\n###\s+(?:模板|Template)[：:]\s*.+\n[\s\S]*?(?=\n###|\n---|\n## |$)/i,
    "\n" + noPatternTemplateBlock().trimEnd() + "\n",
  );
}

function ensureTemplateSectionStrict(
  section: string,
  outputLanguage: CodingMemoryConfig["outputLanguage"] = "zh",
): string {
  if (/###\s+(?:模板|Template)[：:]/i.test(section)) return section;
  if (!/^##\s+L\d+/.test(section)) return section;

  const templateBlock = noPatternTemplateBlock(outputLanguage);
  const antiPatternIdx = section.search(/\n###\s+(?:反模式|Anti-?patterns?)/i);
  if (antiPatternIdx >= 0) {
    return (
      section.slice(0, antiPatternIdx).trimEnd() +
      "\n" +
      templateBlock +
      section.slice(antiPatternIdx)
    );
  }

  return (
    section.trimEnd() +
    templateBlock +
    (outputLanguage === "en"
      ? "\n### Anti-patterns\n- ⚠️ No existing pattern.\n"
      : "\n### 反模式\n- ⚠️ 无现有模式。\n")
  );
}

function noPatternTemplateBlock(
  outputLanguage: CodingMemoryConfig["outputLanguage"] = "zh",
): string {
  if (outputLanguage === "en") {
    return [
      "",
      "### Template: No existing pattern",
      "⚠️ No existing pattern. No reusable template was extracted from the current code.",
      "",
    ].join("\n");
  }
  return [
    "",
    "### 模板：无现有模式",
    "⚠️ 无现有模式。当前代码中未提取到可复用模板。",
    "",
  ].join("\n");
}

function appendStructuredGaps(
  section: string,
  rawLines: string[],
  outputLanguage: CodingMemoryConfig["outputLanguage"] = "zh",
): string {
  const lines = rawLines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith("-") ? l : `- ${l}`));
  if (lines.length === 0) return section;

  const observed: string[] = [];
  const suggested: string[] = [];
  for (const line of lines) {
    if (isSuggestionLine(line)) suggested.push(line);
    else observed.push(line);
  }

  const gap: string[] = [
    "",
    "---",
    "",
    "### ⚠️ Gaps",
    "",
    outputLanguage === "en" ? "#### Observed Risks" : "#### 已观察风险",
  ];
  gap.push(
    ...(observed.length
      ? dedupeLines(observed)
      : [outputLanguage === "en" ? "- None." : "- 无。"]),
  );
  gap.push(
    "",
    outputLanguage === "en" ? "#### Suggested Improvements" : "#### 建议改进",
  );
  gap.push(
    ...(suggested.length
      ? dedupeLines(suggested)
      : [outputLanguage === "en" ? "- None." : "- 无。"]),
  );

  return section.replace(/\n{3,}$/, "\n\n").trimEnd() + "\n" + gap.join("\n");
}

function isSuggestionLine(line: string): boolean {
  return /\[待验证\]|\[To Verify\]|建议|推荐|可考虑|引入|添加|配置|迁移|抽取|补充|统一|清理|suggest|recommend|consider|add|introduce|configure|migrate|extract|clean/i.test(
    line,
  );
}

function dedupeLines(lines: string[]): string[] {
  return [...new Map(lines.map((l) => [l.replace(/\s+/g, " "), l])).values()];
}

function generateTypeOverview(
  t: string,
  g: LanguageGroup,
  outputLanguage: CodingMemoryConfig["outputLanguage"] = "zh",
): string {
  const displayName = g.language
    .split(", ")
    .map((l) => getLanguageDisplayName(l))
    .join(" · ");
  if (outputLanguage === "en") {
    return [
      `# ${t} · ${displayName} Coding Style`,
      "",
      `> Extracted from ${g.files.length} file(s).`,
      "",
      "## Layer Index",
      "",
      "| File | Focus |",
      "|------|-------|",
      "| L1-项目骨架.md | Directory layout, file naming, module organization |",
      "| L2-模块与接口.md | Split granularity, dependency direction, API design |",
      "| L3-命名与类型.md | Naming conventions, type usage, constants |",
      "| L4-实现模式.md | Function design, error handling, async/concurrency |",
      "| L5-数据与状态.md | State management, persistence, caching |",
      "| L6-质量保障.md | Tests, lint, docs, logging |",
      "| L7-横切关注点.md | Security, performance, configuration |",
      "| L8-工程化与启动.md | Build, package management, bootstrap, CI/CD |",
      "",
      "> Generated by coding-memory.",
    ].join("\n");
  }
  return [
    `# ${t} · ${displayName} 编码风格`,
    "",
    `> ${g.files.length} 个文件中提炼。`,
    "",
    "## 层次索引",
    "",
    "| 文件 | 关注点 |",
    "|------|--------|",
    "| L1-项目骨架.md | 目录结构、文件命名、模块组织 |",
    "| L2-模块与接口.md | 拆分粒度、依赖方向、API 设计 |",
    "| L3-命名与类型.md | 命名约定、类型使用、常量管理 |",
    "| L4-实现模式.md | 函数设计、错误处理、异步/并发 |",
    "| L5-数据与状态.md | 状态管理、持久化、缓存 |",
    "| L6-质量保障.md | 测试、Lint、文档、日志 |",
    "| L7-横切关注点.md | 安全、性能、配置 |",
    "| L8-工程化与启动.md | 构建、包管理、启动、CI/CD |",
    "",
    "> 由 coding-memory 自动生成。",
  ].join("\n");
}
