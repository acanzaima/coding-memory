/**
 * Master overview generator - creates SKILL.md as the AI agent's entry point.
 *
 * Pure extraction from L1-L8 files - no LLM call.
 * The top-level output is intentionally curated: detailed evidence stays in
 * reference/<type>/L*.md, while SKILL.md stays small enough to actually use.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { listSkills } from "./merger.js";
import type { SkillsLock } from "../types.js";
import type { EvidenceReport } from "./evidence.js";

type OutputLanguage = "zh" | "en";

const MAX_TYPE_RULES_PER_TYPE = 20;
const MAX_HARD_RULES_PER_TYPE = 12;
const MAX_TEMPLATES_PER_TYPE = 8;
const MAX_NEVER_DO = 20;

interface TemplateInfo {
  name: string;
  layer: string;
  unsafe: boolean;
  missing: boolean;
  hidden?: boolean;
}

interface GapStats {
  observed: number;
  suggested: number;
}

interface EvidenceStats {
  itemCount: number;
  coveredLayers: Set<string>;
  high: number;
  medium: number;
  low: number;
  missing: boolean;
}

interface TypeData {
  projType: string;
  languages: Set<string>;
  projects: Set<string>;
  hardRules: string[];
  typeRules: string[];
  rawTypeRuleCount: number;
  rawHardRuleCount: number;
  templates: TemplateInfo[];
  antiPatterns: string[];
  decisionTable: string;
  learnCount: number;
  gapStats: GapStats;
  speculativeResiduals: number;
  evidence: EvidenceStats;
}

interface CollectedData {
  skills: ReturnType<typeof listSkills>;
  typeMap: Map<string, TypeData>;
  totalProjects: number;
  crossPatterns: CrossPattern[];
}

export function generateMasterOverview(
  lock: SkillsLock,
  skillDir: string,
  refDir: string,
  skillName: string,
  outputLanguage: OutputLanguage = "zh",
): string {
  void skillDir;
  const data = collectOverviewData(lock, refDir);
  if (data.skills.length === 0) return "";

  const totalTemplates = sumTypes(data, (td) => visibleTemplates(td).length);
  const totalHardRules = sumTypes(data, (td) => td.hardRules.length);
  const totalTypeRules = sumTypes(data, (td) => td.typeRules.length);
  const totalRawTypeRules = sumTypes(data, (td) => td.rawTypeRuleCount);
  const totalAntiPatterns = sumTypes(data, (td) => td.antiPatterns.length);
  const hiddenTypeRules = Math.max(0, totalRawTypeRules - totalTypeRules);

  const lines: string[] = [];

  if (outputLanguage === "en") {
    lines.push(
      "---",
      `name: ${skillName}`,
      "description: |",
      `  Personal coding style from ${data.totalProjects} project(s), ${data.typeMap.size} project type(s).`,
      `  ${totalTypeRules} curated type rules, ${totalHardRules} explicit hard rules, ${totalTemplates} code templates, ${totalAntiPatterns} anti-patterns.`,
      "  AI agent: prioritize Type Rules, Hard Rules, Templates, then Scenario Guide.",
      "---",
      "",
      `# AI Agent Instructions · ${skillName}`,
      "",
      `> ${data.totalProjects} project(s) · ${data.typeMap.size} type(s) · ${totalTypeRules} curated type rules · ${totalHardRules} explicit hard rules`,
      "",
    );
  } else {
    lines.push(
      "---",
      `name: ${skillName}`,
      "description: |",
      `  来自 ${data.totalProjects} 个项目、${data.typeMap.size} 种项目类型的个人编码风格。`,
      `  ${totalTypeRules} 条精选类型规则、${totalHardRules} 条显式硬规则、${totalTemplates} 个代码模板、${totalAntiPatterns} 条反模式。`,
      "  AI agent: 优先读取 Type Rules、Hard Rules、Templates，再看 Scenario Guide。",
      "---",
      "",
      `# AI Agent Instructions · ${skillName}`,
      "",
      `> ${data.totalProjects} 个项目 · ${data.typeMap.size} 种类型 · ${totalTypeRules} 条精选类型规则 · ${totalHardRules} 条显式硬规则`,
      "",
    );
  }
  if (totalTypeRules > 0) {
    lines.push(outputLanguage === "en" ? "## 🏷️ Type Rules" : "## 🏷️ 类型规则", "");
    lines.push(
      outputLanguage === "en"
        ? "**Curated mandatory rules** for each project type."
        : "**按项目类型精选的强约束规则**。",
      outputLanguage === "en"
        ? `Only the top ${MAX_TYPE_RULES_PER_TYPE} rules per type are surfaced here; detailed evidence stays in \`reference/\`.`
        : `每种类型最多展示 ${MAX_TYPE_RULES_PER_TYPE} 条规则；完整证据保留在 \`reference/\` 中。`,
      "",
    );
    for (const [, td] of data.typeMap) {
      if (td.typeRules.length === 0) continue;
      lines.push(`### ${td.projType}`, "");
      for (const rule of td.typeRules) lines.push(`- ${rule}`);
      if (td.rawTypeRuleCount > td.typeRules.length) {
        lines.push(
          outputLanguage === "en"
            ? `- _(Governance: ${td.rawTypeRuleCount - td.typeRules.length} lower-priority rule(s) kept only in reference.)_`
            : `- _（治理：${td.rawTypeRuleCount - td.typeRules.length} 条低优先级规则仅保留在 reference 中。）_`,
        );
      }
      lines.push("");
    }
  }

  if (totalHardRules > 0 || data.crossPatterns.length > 0) {
    lines.push(outputLanguage === "en" ? "## 🔒 Hard Rules" : "## 🔒 硬规则", "");
    if (totalHardRules > 0) {
      lines.push(
        outputLanguage === "en"
          ? "Explicit patterns consistently tagged `[Personal Preference]` / `[个人偏好]`."
          : "明确标注为 `[个人偏好]` 的稳定模式。",
        outputLanguage === "en"
          ? "**Follow these unless explicitly told otherwise.**"
          : "**除非用户明确要求，否则优先遵循这些规则。**",
        "",
      );
      for (const [, td] of data.typeMap) {
        if (td.hardRules.length === 0) continue;
        lines.push(`### ${td.projType}`, "");
        for (const rule of td.hardRules) lines.push(`- ${rule}`);
        lines.push("");
      }
    }

    if (data.crossPatterns.length > 0) {
      lines.push(outputLanguage === "en" ? "### Cross-Type Rules" : "### 跨类型规则", "");
      lines.push(
        outputLanguage === "en"
          ? "Promoted from patterns observed across 2+ project types."
          : "从 2 种以上项目类型共同出现的模式中提升而来。",
        "",
      );
      for (const cp of data.crossPatterns) {
        lines.push(`- ${cp.pattern} _(${cp.types.join(" + ")})_`);
      }
      lines.push("");
    }
  }

  if (totalTemplates > 0) {
    lines.push(outputLanguage === "en" ? "## 📐 Code Templates" : "## 📐 代码模板", "");
    lines.push(
      outputLanguage === "en"
        ? "Complete file skeletons extracted from existing code."
        : "从现有代码中提取的完整代码骨架。",
      outputLanguage === "en"
        ? `Up to ${MAX_TEMPLATES_PER_TYPE} templates per type are surfaced here; missing, speculative, or lower-priority templates stay in reference.`
        : `每种类型最多展示 ${MAX_TEMPLATES_PER_TYPE} 个模板；缺失、推测性或低优先级模板留在 reference 中。`,
      "",
    );
    lines.push(
      outputLanguage === "en"
        ? "| Template | Type | Layer |"
        : "| 模板 | 类型 | 层级 |",
    );
    lines.push("|----------|------|-------|");
    for (const [, td] of data.typeMap) {
      for (const t of visibleTemplates(td)) {
        lines.push(
          `| ${t.name} | [${td.projType}](./reference/${td.projType}/) | ${t.layer} |`,
        );
      }
      const hidden = td.templates.filter(
        (t) => !t.unsafe && !t.missing && t.hidden,
      ).length;
      if (hidden > 0) {
        lines.push(
          outputLanguage === "en"
            ? `| _(Governance: ${hidden} lower-priority template(s) kept only in reference.)_ | [${td.projType}](./reference/${td.projType}/) | - |`
            : `| _（治理：${hidden} 个低优先级模板仅保留在 reference 中。）_ | [${td.projType}](./reference/${td.projType}/) | - |`,
        );
      }
    }
    lines.push("");
  }

  if (totalAntiPatterns > 0) {
    lines.push(outputLanguage === "en" ? "## 🚫 Never Do" : "## 🚫 不要这样做", "");
    lines.push(
      outputLanguage === "en"
        ? "Patterns that appear in the anti-pattern sections:"
        : "从反模式章节中提取的禁止做法：",
      "",
    );
    const unique = [
      ...new Set([...data.typeMap.values()].flatMap((td) => td.antiPatterns)),
    ];
    for (const ap of unique.slice(0, MAX_NEVER_DO)) lines.push(`- ${ap}`);
    if (unique.length > MAX_NEVER_DO) {
      lines.push(
        outputLanguage === "en"
          ? `- ... and ${unique.length - MAX_NEVER_DO} more -> reference/`
          : `- ... 以及另外 ${unique.length - MAX_NEVER_DO} 条，见 reference/`,
      );
    }
    lines.push("");
  }

  const fallbackScenarios = buildScenarioGuide([...data.typeMap.values()]);
  let hasDecision = false;
  for (const [, td] of data.typeMap) {
    if (!td.decisionTable) continue;
    if (!hasDecision) {
      lines.push(outputLanguage === "en" ? "## 🔀 Scenario Guide" : "## 🔀 场景指南", "");
      hasDecision = true;
    }
    lines.push(td.decisionTable, "");
  }
  if (!hasDecision && fallbackScenarios.length > 0) {
    lines.push(outputLanguage === "en" ? "## 🔀 Scenario Guide" : "## 🔀 场景指南", "");
    lines.push(
      outputLanguage === "en"
        ? "| Scenario | Action | Reference Layer |"
        : "| 场景 | 做法 | 参考层 |",
    );
    lines.push("|------|------|--------|");
    for (const row of fallbackScenarios) {
      lines.push(`| ${row.scene} | ${row.action} | ${row.layer} |`);
    }
    lines.push("");
  }

  lines.push(outputLanguage === "en" ? "## 📚 Project Type Index" : "## 📚 项目类型索引", "");
  lines.push(
    outputLanguage === "en"
      ? "| Type | Languages | Type Rules | Hidden Rules | Hard Rules | Templates | Projects |"
      : "| 类型 | 语言 | 类型规则 | 隐藏规则 | 硬规则 | 模板 | 项目数 |",
  );
  lines.push(
    "|------|-----------|------------|--------------|------------|-----------|----------|",
  );
  for (const [, td] of data.typeMap) {
    const langs = [...td.languages].join(", ");
    const visible = visibleTemplates(td).length;
    const hiddenTemplates = td.templates.filter(
      (t) => !t.unsafe && !t.missing && t.hidden,
    ).length;
    lines.push(
      `| [${td.projType}](./reference/${td.projType}/) | ${langs} | ${td.typeRules.length} | ${Math.max(0, td.rawTypeRuleCount - td.typeRules.length)} | ${td.hardRules.length} | ${visible}${hiddenTemplates > 0 ? ` (+${hiddenTemplates} hidden)` : ""} | ${td.projects.size} |`,
    );
  }
  lines.push("");

  lines.push(outputLanguage === "en" ? "## 🌐 Cross-Project Patterns" : "## 🌐 跨项目模式", "");
  if (data.crossPatterns.length > 0) {
    lines.push(
      outputLanguage === "en"
        ? "Patterns appearing in **2+ project types** (learned from different tech stacks):"
        : "出现在 **2 种以上项目类型** 中的模式：",
      "",
    );
    for (const cp of data.crossPatterns) {
      lines.push(`- **${cp.pattern}** _(${cp.types.join(" + ")})_`);
    }
  } else if (data.typeMap.size >= 2) {
    lines.push(
      outputLanguage === "en"
        ? "_(No cross-type patterns yet - learn more projects to reveal them.)_"
        : "_（暂未发现跨类型模式；继续学习更多项目后会逐步浮现。）_",
    );
  } else {
    lines.push(
      outputLanguage === "en"
        ? "_(Learn more project types to discover cross-stack commonalities.)_"
        : "_（学习更多项目类型后可发现跨技术栈共性。）_",
    );
  }
  lines.push("");

  const allProjects = [
    ...new Set(data.skills.flatMap((s) => s.sourceProjects || [])),
  ];
  if (allProjects.length > 0) {
    lines.push(outputLanguage === "en" ? "## 📊 Learning History" : "## 📊 学习历史", "");
    for (const s of data.skills) {
      const projects = (s.sourceProjects || [])
        .map((p) => p.split(/[/\\]/).pop())
        .join(", ");
      lines.push(`- **${s.language}** · ${s.learnCount}x · ${projects}`);
    }
    lines.push("");
  }

  if (hiddenTypeRules > 0) {
    lines.push(
      outputLanguage === "en"
        ? "> Governance: top-level Type Rules are compressed; lower-priority rules remain available in reference files."
        : "> 治理说明：顶层 Type Rules 已压缩；低优先级规则仍保留在 reference 文件中。",
    );
  }
  lines.push(
    "---",
    "",
    outputLanguage === "en"
      ? "> Generated by `coding-memory`. Run `coding-memory learn` to update."
      : "> 由 `coding-memory` 生成。运行 `coding-memory learn` 更新。",
    outputLanguage === "en"
      ? "> AI agent: read Type Rules -> Hard Rules -> Templates -> Scenario Guide."
      : "> AI agent：按 Type Rules -> Hard Rules -> Templates -> Scenario Guide 顺序阅读。",
  );

  return lines.join("\n");
}

export function generateQualityReport(
  lock: SkillsLock,
  skillDir: string,
  refDir: string,
  skillName: string,
  outputLanguage: OutputLanguage = "zh",
): string {
  if (outputLanguage === "en") {
    return generateQualityReportEn(lock, skillDir, refDir, skillName);
  }
  void skillDir;
  const data = collectOverviewData(lock, refDir);
  const generatedAt = new Date().toISOString();
  const totalRawRules = sumTypes(data, (td) => td.rawTypeRuleCount);
  const totalVisibleRules = sumTypes(data, (td) => td.typeRules.length);
  const totalMissingTemplates = sumTypes(
    data,
    (td) => td.templates.filter((t) => t.missing).length,
  );
  const totalHiddenTemplates = sumTypes(
    data,
    (td) => td.templates.filter((t) => !t.unsafe && !t.missing && t.hidden).length,
  );
  const totalUnsafeTemplates = sumTypes(
    data,
    (td) => td.templates.filter((t) => t.unsafe).length,
  );
  const totalResiduals = sumTypes(data, (td) => td.speculativeResiduals);
  const totalEvidenceItems = sumTypes(data, (td) => td.evidence.itemCount);
  const totalEvidenceLayers = sumTypes(data, (td) => td.evidence.coveredLayers.size);
  const totalLowConfidenceEvidence = sumTypes(data, (td) => td.evidence.low);
  const missingEvidenceReports = sumTypes(data, (td) =>
    td.evidence.missing ? 1 : 0,
  );

  const lines = [
    `# 质量报告 · ${skillName}`,
    "",
    `生成时间：${generatedAt}`,
    "",
    "## 摘要",
    "",
    `- 项目类型：${data.typeMap.size}`,
    `- 已学习项目：${data.totalProjects}`,
    `- 类型规则：展示 ${totalVisibleRules} 条 / 提取 ${totalRawRules} 条`,
    `- 缺失模板：${totalMissingTemplates}`,
    `- 隐藏模板：${totalHiddenTemplates}`,
    `- 已排除不安全模板：${totalUnsafeTemplates}`,
    `- Gaps 外推测性残留：${totalResiduals}`,
    `- Evidence 证据项：${totalEvidenceItems}，覆盖 ${totalEvidenceLayers} 个层级点`,
    `- 低置信度 Evidence：${totalLowConfidenceEvidence}`,
    "",
    "## 类型明细",
    "",
    "| 类型 | 项目数 | 原始规则 | 展示规则 | 隐藏规则 | 模板 | 隐藏模板 | 缺失模板 | 不安全模板 | 证据项 | 证据层级 | 低置信证据 | 已观察风险 | 建议改进 | 残留 |",
    "|------|----------|-----------|----------------|--------------|-----------|------------------|-------------------|------------------|----------------|-----------------|--------------|----------------|------------------------|-----------|",
  ];

  for (const [, td] of data.typeMap) {
    const visible = visibleTemplates(td).length;
    const hiddenTemplates = td.templates.filter(
      (t) => !t.unsafe && !t.missing && t.hidden,
    ).length;
    const missingTemplates = td.templates.filter((t) => t.missing).length;
    const unsafeTemplates = td.templates.filter((t) => t.unsafe).length;
    lines.push(
      `| ${td.projType} | ${td.projects.size} | ${td.rawTypeRuleCount} | ${td.typeRules.length} | ${Math.max(0, td.rawTypeRuleCount - td.typeRules.length)} | ${visible} | ${hiddenTemplates} | ${missingTemplates} | ${unsafeTemplates} | ${td.evidence.itemCount} | ${td.evidence.coveredLayers.size}/8 | ${td.evidence.low} | ${td.gapStats.observed} | ${td.gapStats.suggested} | ${td.speculativeResiduals} |`,
    );
  }

  lines.push("", "## 检查", "");
  lines.push(
    totalResiduals === 0
      ? "- PASS：Gaps 外未发现推测性表达。"
      : `- WARN：仍有 ${totalResiduals} 行推测性内容出现在 Gaps 外。`,
  );
  lines.push(
    totalUnsafeTemplates === 0
      ? "- PASS：未检测到不安全模板。"
      : `- WARN：${totalUnsafeTemplates} 个不安全模板已从 SKILL.md 排除。`,
  );
  lines.push(
    totalRawRules <= totalVisibleRules
      ? "- PASS：无需压缩规则。"
      : `- INFO：${totalRawRules - totalVisibleRules} 条低优先级规则仅保留在 reference 文件中。`,
  );
  lines.push(
    data.crossPatterns.length > 0
      ? `- PASS：已提升 ${data.crossPatterns.length} 条跨类型模式。`
      : "- INFO：暂未提升跨类型模式。",
  );
  lines.push(
    missingEvidenceReports === 0
      ? "- PASS：所有项目类型都存在 evidence 报告。"
      : `- WARN：${missingEvidenceReports} 个项目类型缺少 EVIDENCE.json。`,
  );
  lines.push(
    totalEvidenceItems > 0
      ? `- PASS：已提取确定性证据（${totalEvidenceItems} 项）。`
      : "- WARN：未提取到确定性证据。",
  );
  lines.push("", "> 本报告由本地 reference 文件生成，不调用 LLM。");

  return lines.join("\n");
}

function generateQualityReportEn(
  lock: SkillsLock,
  skillDir: string,
  refDir: string,
  skillName: string,
): string {
  void skillDir;
  const data = collectOverviewData(lock, refDir);
  const generatedAt = new Date().toISOString();
  const totalRawRules = sumTypes(data, (td) => td.rawTypeRuleCount);
  const totalVisibleRules = sumTypes(data, (td) => td.typeRules.length);
  const totalMissingTemplates = sumTypes(
    data,
    (td) => td.templates.filter((t) => t.missing).length,
  );
  const totalHiddenTemplates = sumTypes(
    data,
    (td) => td.templates.filter((t) => !t.unsafe && !t.missing && t.hidden).length,
  );
  const totalUnsafeTemplates = sumTypes(
    data,
    (td) => td.templates.filter((t) => t.unsafe).length,
  );
  const totalResiduals = sumTypes(data, (td) => td.speculativeResiduals);
  const totalEvidenceItems = sumTypes(data, (td) => td.evidence.itemCount);
  const totalEvidenceLayers = sumTypes(data, (td) => td.evidence.coveredLayers.size);
  const totalLowConfidenceEvidence = sumTypes(data, (td) => td.evidence.low);
  const missingEvidenceReports = sumTypes(data, (td) =>
    td.evidence.missing ? 1 : 0,
  );

  const lines = [
    `# Quality Report · ${skillName}`,
    "",
    `Generated at: ${generatedAt}`,
    "",
    "## Summary",
    "",
    `- Project types: ${data.typeMap.size}`,
    `- Projects learned: ${data.totalProjects}`,
    `- Type rules: ${totalVisibleRules} surfaced / ${totalRawRules} extracted`,
    `- Missing templates: ${totalMissingTemplates}`,
    `- Hidden templates: ${totalHiddenTemplates}`,
    `- Unsafe templates excluded: ${totalUnsafeTemplates}`,
    `- Speculative residuals outside Gaps: ${totalResiduals}`,
    `- Evidence items: ${totalEvidenceItems} across ${totalEvidenceLayers} layer coverage point(s)`,
    `- Low-confidence evidence items: ${totalLowConfidenceEvidence}`,
    "",
    "## Type Breakdown",
    "",
    "| Type | Projects | Raw Rules | Surfaced Rules | Hidden Rules | Templates | Hidden Templates | Missing Templates | Unsafe Templates | Evidence Items | Evidence Layers | Low Evidence | Observed Risks | Suggested Improvements | Residuals |",
    "|------|----------|-----------|----------------|--------------|-----------|------------------|-------------------|------------------|----------------|-----------------|--------------|----------------|------------------------|-----------|",
  ];

  for (const [, td] of data.typeMap) {
    const visible = visibleTemplates(td).length;
    const hiddenTemplates = td.templates.filter(
      (t) => !t.unsafe && !t.missing && t.hidden,
    ).length;
    const missingTemplates = td.templates.filter((t) => t.missing).length;
    const unsafeTemplates = td.templates.filter((t) => t.unsafe).length;
    lines.push(
      `| ${td.projType} | ${td.projects.size} | ${td.rawTypeRuleCount} | ${td.typeRules.length} | ${Math.max(0, td.rawTypeRuleCount - td.typeRules.length)} | ${visible} | ${hiddenTemplates} | ${missingTemplates} | ${unsafeTemplates} | ${td.evidence.itemCount} | ${td.evidence.coveredLayers.size}/8 | ${td.evidence.low} | ${td.gapStats.observed} | ${td.gapStats.suggested} | ${td.speculativeResiduals} |`,
    );
  }

  lines.push("", "## Checks", "");
  lines.push(
    totalResiduals === 0
      ? "- PASS: no speculative terms found outside Gaps."
      : `- WARN: ${totalResiduals} speculative line(s) still appear outside Gaps.`,
  );
  lines.push(
    totalUnsafeTemplates === 0
      ? "- PASS: no unsafe templates were detected."
      : `- WARN: ${totalUnsafeTemplates} unsafe template(s) were excluded from SKILL.md.`,
  );
  lines.push(
    totalRawRules <= totalVisibleRules
      ? "- PASS: no rule compression was needed."
      : `- INFO: ${totalRawRules - totalVisibleRules} lower-priority rule(s) were kept only in reference files.`,
  );
  lines.push(
    data.crossPatterns.length > 0
      ? `- PASS: ${data.crossPatterns.length} cross-type pattern(s) promoted.`
      : "- INFO: no cross-type patterns promoted yet.",
  );
  lines.push(
    missingEvidenceReports === 0
      ? "- PASS: evidence reports are present for all project types."
      : `- WARN: ${missingEvidenceReports} project type(s) are missing EVIDENCE.json.`,
  );
  lines.push(
    totalEvidenceItems > 0
      ? `- PASS: deterministic evidence is available (${totalEvidenceItems} item(s)).`
      : "- WARN: no deterministic evidence items were extracted.",
  );
  lines.push("", "> This report is generated locally from reference files; it does not call an LLM.");

  return lines.join("\n");
}

function collectOverviewData(lock: SkillsLock, refDir: string): CollectedData {
  const skills = listSkills(lock);
  const typeMap = new Map<string, TypeData>();

  for (const s of skills) {
    const projType = extractProjType(s.skillPath);
    if (!typeMap.has(projType)) {
      typeMap.set(projType, {
        projType,
        languages: new Set(),
        projects: new Set(),
        hardRules: [],
        typeRules: [],
        rawTypeRuleCount: 0,
        rawHardRuleCount: 0,
        templates: [],
        antiPatterns: [],
        decisionTable: "",
        learnCount: s.learnCount,
        gapStats: { observed: 0, suggested: 0 },
        speculativeResiduals: 0,
        evidence: emptyEvidenceStats(true),
      });
    }
    const td = typeMap.get(projType)!;
    s.language.split(", ").forEach((l) => td.languages.add(l));
    s.sourceProjects?.forEach((p) => td.projects.add(p));
    if (s.learnCount > td.learnCount) td.learnCount = s.learnCount;
  }

  for (const [, td] of typeMap) {
    const content = readTypeLayers(refDir, td.projType);
    if (!content) continue;
    const ruleLines = content.split("\n");

    for (let i = 0; i < ruleLines.length; i++) {
      const line = ruleLines[i];
      if (!line.includes("[个人偏好]") || isPendingLine(line)) continue;
      let cleaned = cleanRuleLine(line);
      if (!isActionableRule(cleaned)) continue;
      cleaned = mergeContinuationIfNeeded(cleaned, ruleLines, i);
      if (!td.hardRules.includes(cleaned)) td.hardRules.push(cleaned);
    }
    td.rawHardRuleCount = td.hardRules.length;
    td.hardRules = selectTopRules(td.hardRules, MAX_HARD_RULES_PER_TYPE);

    const rawTypeRules: string[] = [];
    for (let i = 0; i < ruleLines.length; i++) {
      const line = ruleLines[i];
      if (
        !line.includes("[项目特定]") ||
        !line.includes("[必须]") ||
        isPendingLine(line)
      ) {
        continue;
      }
      const cleaned = mergeContinuationIfNeeded(cleanRuleLine(line), ruleLines, i);
      if (!isActionableRule(cleaned)) continue;
      if (!rawTypeRules.includes(cleaned)) rawTypeRules.push(cleaned);
    }
    td.rawTypeRuleCount = rawTypeRules.length;
    td.typeRules = selectTopRules(rawTypeRules, MAX_TYPE_RULES_PER_TYPE);

    td.templates = selectTopTemplates(parseTemplateBlocks(content));
    td.antiPatterns = extractAntiPatterns(content);
    td.decisionTable = extractDecisionTable(content);
    td.gapStats = countGaps(content);
    td.speculativeResiduals = countSpeculativeResiduals(content);
    td.evidence = readEvidenceStats(refDir, td.projType);
  }

  const totalProjects = [
    ...new Set(skills.flatMap((s) => s.sourceProjects || [])),
  ].length;
  const crossPatterns = findCrossProjectPatterns([...typeMap.values()]);
  return { skills, typeMap, totalProjects, crossPatterns };
}

function readTypeLayers(refDir: string, projType: string): string {
  const typeDir = join(refDir, projType);
  let content = "";
  try {
    if (!existsSync(typeDir)) return "";
    const files = readdirSync(typeDir);
    for (let l = 1; l <= 8; l++) {
      const match = files.find((f) => f.startsWith(`L${l}-`));
      if (match) content += readFileSync(join(typeDir, match), "utf-8") + "\n";
    }
  } catch {
    return "";
  }
  return content;
}

function readEvidenceStats(refDir: string, projType: string): EvidenceStats {
  const evidencePath = join(refDir, projType, "EVIDENCE.json");
  try {
    if (!existsSync(evidencePath)) return emptyEvidenceStats(true);
    const report = JSON.parse(
      readFileSync(evidencePath, "utf-8"),
    ) as EvidenceReport;
    const stats = emptyEvidenceStats(false);
    for (const item of report.items || []) {
      stats.itemCount += 1;
      stats.coveredLayers.add(item.layer);
      if (item.confidence === "high") stats.high += 1;
      else if (item.confidence === "medium") stats.medium += 1;
      else stats.low += 1;
    }
    return stats;
  } catch {
    return emptyEvidenceStats(true);
  }
}

function emptyEvidenceStats(missing: boolean): EvidenceStats {
  return {
    itemCount: 0,
    coveredLayers: new Set(),
    high: 0,
    medium: 0,
    low: 0,
    missing,
  };
}

function sumTypes(data: CollectedData, pick: (td: TypeData) => number): number {
  return [...data.typeMap.values()].reduce((sum, td) => sum + pick(td), 0);
}

function extractProjType(skillPath: string): string {
  const parts = skillPath.split("/").filter(Boolean);
  const refIdx = parts.indexOf("reference");
  return refIdx >= 0 && refIdx + 1 < parts.length
    ? parts[refIdx + 1]
    : "unknown";
}

function cleanRuleLine(line: string): string {
  let cleaned = line
    .trim()
    .replace(/^[-*]\s*/, "")
    .replace(/\s*\[(?:个人偏好|项目特定|必须|推荐|可选)\]\s*/g, " ")
    .replace(/\*\*/g, " ")
    .trim();
  while (/^[-*]\s+/.test(cleaned)) {
    cleaned = cleaned.replace(/^[-*]\s+/, "").trim();
  }
  return cleaned
    .replace(/\s+([：:])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function isPendingLine(text: string): boolean {
  return text.includes("[待验证]") || text.includes("### 待验证");
}

function isActionableRule(text: string): boolean {
  if (text.length <= 5) return false;
  if (/[：:]$/.test(text.trim())) return false;
  if (
    /推测|可能|未发现|未展示|推断|无现有模式|⚠️|\[待验证\]/.test(text) ||
    /^如[：:]/.test(text)
  ) {
    return false;
  }
  return true;
}

function isActionableAntiPattern(text: string): boolean {
  if (!isActionableRule(text)) return false;
  if (/建议|推荐使用|可考虑|待验证/.test(text)) return false;
  return true;
}

function mergeContinuationIfNeeded(
  cleaned: string,
  lines: string[],
  idx: number,
): string {
  if (!/[：:]$/.test(cleaned) || cleaned.length >= 40) return cleaned;
  let merged = cleaned;
  for (let j = idx + 1; j < Math.min(idx + 3, lines.length); j++) {
    const next = lines[j].trim();
    if (!next || next.startsWith("#") || next.startsWith("-")) break;
    merged += " " + next.replace(/\*\*/g, "").trim();
    if (merged.length > 20 && !/[：:]$/.test(merged)) break;
  }
  return merged.length > cleaned.length + 3 ? merged : cleaned;
}

function selectTopRules(rules: string[], limit: number): string[] {
  const unique = [...new Map(rules.map((r) => [normalizeRule(r), r])).values()];
  const ranked = unique
    .map((rule, index) => ({
      rule,
      index,
      score: scoreRule(rule),
      category: categorizeRule(rule),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selected: typeof ranked = [];
  const categoryCount = new Map<string, number>();
  for (const item of ranked) {
    if (selected.length >= limit) break;
    const count = categoryCount.get(item.category) || 0;
    if (count >= 4 && ranked.length > limit) continue;
    selected.push(item);
    categoryCount.set(item.category, count + 1);
  }
  for (const item of ranked) {
    if (selected.length >= limit) break;
    if (!selected.includes(item)) selected.push(item);
  }

  return selected
    .sort((a, b) => a.index - b.index)
    .slice(0, limit)
    .map((x) => x.rule);
}

function scoreRule(rule: string): number {
  let score = 0;
  const weights: Array<[RegExp, number]> = [
    [/模块|分层|目录|包名|依赖方向|业务域|-api|-biz|src\/api|src\/views/i, 42],
    [/API|接口|Controller|request|DTO|VO|ReqVO|RespVO|参数|契约|@Valid/i, 38],
    [/权限|认证|授权|XSS|Security|token|脱敏|校验|v-has/i, 34],
    [/错误|异常|日志|拦截|CommonResult|ElMessage|ApiErrorLog/i, 30],
    [/状态|store|Pinia|缓存|Redis|数据|Mapper|DO|数据库|持久化/i, 28],
    [/配置|环境|常量|Properties|\.env|Maven|POM|版本/i, 24],
    [/测试|JUnit|Mockito|Lint|构建|启动|CI|Vite|pnpm|npm/i, 20],
    [/命名|后缀|PascalCase|camelCase|snake_case|枚举|Lombok/i, 18],
  ];
  for (const [rx, weight] of weights) {
    if (rx.test(rule)) score += weight;
  }
  if (rule.length <= 140) score += 12;
  if (rule.length > 220) score -= 15;
  if (rule.length > 320) score -= 30;
  if (/优先选择|主力|工具库|第三方库|插件/.test(rule)) score -= 8;
  return score;
}

function categorizeRule(rule: string): string {
  if (/模块|分层|目录|包名|依赖方向|业务域/i.test(rule)) return "architecture";
  if (/API|接口|Controller|request|DTO|VO|参数|契约/i.test(rule)) return "api";
  if (/权限|认证|授权|XSS|Security|token|脱敏|校验/i.test(rule)) return "security";
  if (/错误|异常|日志|拦截|CommonResult|ElMessage/i.test(rule)) return "errors";
  if (/状态|store|Pinia|缓存|Redis|数据|Mapper|数据库/i.test(rule)) return "data";
  if (/配置|环境|常量|Properties|\.env|Maven|POM/i.test(rule)) return "config";
  if (/测试|JUnit|Mockito|Lint|构建|启动|CI|Vite/i.test(rule)) return "quality";
  if (/命名|后缀|PascalCase|camelCase|snake_case|枚举/i.test(rule)) return "naming";
  return "other";
}

function normalizeRule(rule: string): string {
  return rule.toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

function parseTemplateBlocks(content: string): TemplateInfo[] {
  const templates: TemplateInfo[] = [];
  const rx = /###\s+模板[：:]\s*(.+)\n([\s\S]*?)(?=\n### |\n---|\n## |$)/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(content)) !== null) {
    const name = m[1].trim();
    const body = m[2] || "";
    const missing = /无现有模式/.test(name) || /无现有模式/.test(body);
    const unsafe = !missing && isUnsafeTemplate(body);
    templates.push({
      name,
      layer: findEnclosingLayer(m.index, content),
      unsafe,
      missing,
    });
  }
  return templates;
}

function selectTopTemplates(templates: TemplateInfo[]): TemplateInfo[] {
  const usable = templates.filter((t) => !t.unsafe && !t.missing);
  const usableKeys = new Set(
    usable
      .map((t, index) => ({ t, index, score: scoreTemplate(t) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, MAX_TEMPLATES_PER_TYPE)
      .map((x) => templateKey(x.t)),
  );

  return templates.map((t) =>
    !t.unsafe && !t.missing && !usableKeys.has(templateKey(t))
      ? { ...t, hidden: true }
      : t,
  );
}

function visibleTemplates(td: TypeData): TemplateInfo[] {
  return td.templates.filter((t) => !t.unsafe && !t.missing && !t.hidden);
}

function templateKey(t: TemplateInfo): string {
  return `${t.layer}:${t.name}`;
}

function scoreTemplate(t: TemplateInfo): number {
  let score = 0;
  const layer = Number(t.layer.replace(/^L/, "")) || 99;
  if (layer >= 1 && layer <= 8) score += 20 - layer;
  if (/新|骨架|结构|模块|API|Service|数据|启动/.test(t.name)) score += 10;
  if (/示例|命名/.test(t.name)) score += 4;
  if (/测试|质量|日志/.test(t.name)) score += 3;
  return score;
}

function isUnsafeTemplate(body: string): boolean {
  if (/\[待验证\]|待验证|暂未实现|推测|可能|未发现|未展示/.test(body)) {
    return true;
  }
  if (/建议|推荐使用|可考虑|建议骨架|建议引入|建议采用/.test(body)) {
    return true;
  }
  return /\b(Vitest|Jest|Cypress|Playwright|Sentry|SonarQube|JaCoCo|Checkstyle|SpotBugs|commitlint|husky|GitHub Actions|vite-plugin-compression|vite-plugin-imagemin)\b/i.test(
    body,
  );
}

function extractAntiPatterns(content: string): string[] {
  const out: string[] = [];
  const rx = /###\s+反模式\s*\n([\s\S]*?)(?=\n### |\n---|\n## [^#]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(content)) !== null) {
    const lines = m[1]
      .split("\n")
      .filter((l) => /^\s*-/.test(l))
      .map((l) => cleanRuleLine(l))
      .filter((l) => isActionableAntiPattern(l));
    for (const line of lines) {
      if (!out.includes(line)) out.push(line);
    }
  }
  return out;
}

function extractDecisionTable(content: string): string {
  const match = content.match(
    /##\s+决策启发式\s*\n([\s\S]*?)(?=\n## |\n---\n|$)/,
  );
  return match ? match[0].trim() : "";
}

function countGaps(content: string): GapStats {
  const stats: GapStats = { observed: 0, suggested: 0 };
  const rx = /###\s+⚠️\s*Gaps\s*\n([\s\S]*?)(?=\n## |\n---\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(content)) !== null) {
    for (const raw of m[1].split("\n")) {
      const line = raw.trim();
      if (!line.startsWith("-")) continue;
      if (/^-+\s*(无|None|N\/A)[。.]?$/.test(line)) continue;
      if (isSuggestionText(line)) stats.suggested += 1;
      else stats.observed += 1;
    }
  }
  return stats;
}

function countSpeculativeResiduals(content: string): number {
  const withoutGaps = content.replace(
    /###\s+⚠️\s*Gaps\s*\n[\s\S]*?(?=\n## |\n---\n|$)/g,
    "",
  );
  return withoutGaps
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .filter((line) => !/无现有模式/.test(line))
    .filter((line) => !/^\s*\|/.test(line))
    .filter((line) => !/^\s*[-*]\s*⚠️/.test(line))
    .filter((line) => /\[待验证\]|建议|推荐使用|推测|可能|未发现|未展示/.test(line))
    .length;
}

function isSuggestionText(text: string): boolean {
  return /\[待验证\]|建议|推荐|可考虑|引入|添加|配置|迁移|抽取|补充|统一|清理/.test(
    text,
  );
}

function findEnclosingLayer(idx: number, content: string): string {
  const prefix = content.slice(0, idx);
  const matches = prefix.match(/^## (L\d+)/gm);
  if (matches && matches.length > 0) {
    return matches[matches.length - 1].replace("## ", "");
  }
  return "?";
}

interface CrossPattern {
  pattern: string;
  types: string[];
}

function buildScenarioGuide(
  typeEntries: Pick<TypeData, "projType" | "typeRules" | "hardRules">[],
): Array<{ scene: string; action: string; layer: string }> {
  const rows: Array<{ scene: string; action: string; layer: string }> = [];
  const add = (scene: string, action: string, layer: string) => {
    if (!rows.some((r) => r.scene === scene && r.action === action)) {
      rows.push({ scene, action, layer });
    }
  };

  for (const td of typeEntries) {
    const rules = [...td.typeRules, ...td.hardRules].join("\n");
    if (td.projType === "vue3") {
      if (rules.includes("src/api") || rules.includes("API")) {
        add(
          "新增前端接口",
          "在 `src/api/{业务域}/{资源}/index.ts` 中导出命名函数和 VO 类型",
          "L2",
        );
      }
      if (rules.includes("Pinia") || rules.includes("store")) {
        add(
          "新增跨页面状态",
          "在 `src/store/modules/` 新增 Pinia 模块，并通过 action 管理持久化",
          "L5",
        );
      }
      if (rules.includes("v-hasRole") || rules.includes("权限")) {
        add("新增权限控制", "使用 `v-hasRole` / `v-hasPermi` 控制界面元素", "L7");
      }
    }

    if (td.projType === "spring-boot") {
      if (rules.includes("-api") || rules.includes("-biz")) {
        add(
          "新增后端业务模块",
          "按 `nezha-module-<domain>-api` / `nezha-module-<domain>-biz` 分层创建",
          "L1, L2",
        );
      }
      if (rules.includes("Mapper") || rules.includes("BaseMapper")) {
        add(
          "新增数据访问",
          "创建 DO 和 Mapper，Mapper 继承 `BaseMapperX<T>` 或 `BaseMapper<T>`",
          "L5",
        );
      }
      if (rules.includes("Flyway") || rules.includes("迁移")) {
        add(
          "新增数据库变更",
          "在受控迁移目录添加版本化 SQL，并避免业务代码内硬编码结构变更",
          "L1, L8",
        );
      }
    }
  }

  return rows.slice(0, 8);
}

function findCrossProjectPatterns(
  typeEntries: Pick<
    TypeData,
    "projType" | "hardRules" | "typeRules" | "antiPatterns"
  >[],
): CrossPattern[] {
  const catalog: Array<{
    id: string;
    summary: string;
    required: string[];
    optional?: string[];
  }> = [
    {
      id: "module-boundaries",
      summary: "按领域/模块分层组织代码，并保持依赖方向单向",
      required: ["模块"],
      optional: ["分层", "业务域", "src/views", "-api", "-biz", "Controller", "依赖"],
    },
    {
      id: "api-facade",
      summary: "对外调用先经过稳定 API/接口层，业务代码不直接穿透底层实现",
      required: ["API"],
      optional: ["接口", "request", "Controller", "Api", "端点", "Mapper"],
    },
    {
      id: "typed-contracts",
      summary: "用显式类型/DTO/VO 作为跨层数据契约",
      required: ["VO"],
      optional: ["DTO", "类型", "ReqVO", "RespVO", "参数", "校验", "@Valid"],
    },
    {
      id: "central-config",
      summary: "配置、常量和环境差异集中管理，业务层只引用命名入口",
      required: ["配置"],
      optional: [".env", "VITE_", "常量", "POM", "父 POM", "版本"],
    },
    {
      id: "security-gates",
      summary: "认证、授权和输入安全通过统一入口处理",
      required: ["权限"],
      optional: ["认证", "授权", "token", "Security", "@Valid", "v-has"],
    },
    {
      id: "observable-errors",
      summary: "错误和访问行为通过统一机制记录或反馈",
      required: ["日志"],
      optional: ["错误", "异常", "拦截", "ElMessage", "ApiErrorLog", "访问日志"],
    },
    {
      id: "migration-discipline",
      summary: "持久化结构变更要进入版本化脚本或受控迁移流程",
      required: ["迁移"],
      optional: ["Flyway", "SQL", "db/migration", "数据库"],
    },
    {
      id: "test-safety-net",
      summary: "核心逻辑需要自动化测试作为重构安全网",
      required: ["测试"],
      optional: ["JUnit", "Mockito", "spec", "单元测试"],
    },
    {
      id: "avoid-duplication",
      summary: "重复配置和重复实现应抽到共享层，避免多处漂移",
      required: ["重复"],
      optional: ["共享", "公共", "配置", "复用"],
    },
  ];

  const matches: Array<CrossPattern & { score: number; id: string }> = [];
  for (const item of catalog) {
    const covered = new Set<string>();
    let score = 0;
    for (const td of typeEntries) {
      const haystack = [
        ...td.typeRules,
        ...td.hardRules,
        ...td.antiPatterns.map((ap) => `反模式 ${ap}`),
      ].join("\n");
      if (matchesConcern(haystack, item.required, item.optional || [])) {
        covered.add(td.projType);
        score += concernScore(haystack, item.required, item.optional || []);
      }
    }
    if (covered.size >= 2) {
      matches.push({
        id: item.id,
        pattern: item.summary,
        types: [...covered],
        score,
      });
    }
  }

  return matches
    .sort((a, b) => b.score - a.score || a.pattern.localeCompare(b.pattern))
    .slice(0, 8)
    .map(({ pattern, types }) => ({ pattern, types }));
}

function matchesConcern(
  text: string,
  required: string[],
  optional: string[],
): boolean {
  const lower = text.toLowerCase();
  const hasRequired = required.every((kw) => lower.includes(kw.toLowerCase()));
  if (!hasRequired) return false;
  if (optional.length === 0) return true;
  return optional.some((kw) => lower.includes(kw.toLowerCase()));
}

function concernScore(
  text: string,
  required: string[],
  optional: string[],
): number {
  const lower = text.toLowerCase();
  let score = required.length * 3;
  for (const kw of optional) {
    if (lower.includes(kw.toLowerCase())) score += 1;
  }
  return score;
}
