import type { LanguageGroup } from "../types.js";
import { evidenceRules } from "./evidence/rules/index.js";
import type {
  EvidenceConfidence,
  EvidenceItem,
  EvidenceReport,
  EvidenceRule,
} from "./evidence/types.js";

type OutputLanguage = "zh" | "en";

export type {
  EvidenceConfidence,
  EvidenceItem,
  EvidenceLayer,
  EvidenceReport,
  EvidenceRule,
} from "./evidence/types.js";

export function collectEvidence(
  group: LanguageGroup,
  projectType: string,
): EvidenceReport {
  const items = evidenceRules.map((rule) => {
    const files = group.files.filter(rule.test).map((f) => f.path).sort();
    return {
      id: rule.id,
      layer: rule.layer,
      category: rule.category,
      summary: rule.summary,
      confidence: confidenceFor(files.length, rule),
      files: files.slice(0, 12),
      count: files.length,
    } satisfies EvidenceItem;
  }).filter((item) => item.count > 0);

  return {
    generatedAt: new Date().toISOString(),
    projectType,
    languages: group.language.split(", ").filter(Boolean),
    fileCount: group.files.length,
    totalSize: group.totalSize,
    items: items.sort(
      (a, b) =>
        a.layer.localeCompare(b.layer) ||
        confidenceRank(b.confidence) - confidenceRank(a.confidence) ||
        b.count - a.count ||
        a.id.localeCompare(b.id),
    ),
  };
}

export function renderEvidenceMarkdown(
  report: EvidenceReport,
  outputLanguage: OutputLanguage = "zh",
): string {
  if (outputLanguage === "en") return renderEvidenceMarkdownEn(report);
  const lines = [
    `# 证据 · ${report.projectType}`,
    "",
    `生成时间：${report.generatedAt}`,
    "",
    "## 摘要",
    "",
    `- 扫描文件数：${report.fileCount}`,
    `- 语言：${report.languages.join(", ") || "unknown"}`,
    `- 证据项：${report.items.length}`,
    "",
    "## 证据表",
    "",
    "| 层级 | 类别 | 置信度 | 数量 | 证据 | 文件 |",
    "|-------|----------|------------|-------|----------|-------|",
  ];

  for (const item of report.items) {
    lines.push(
      `| ${item.layer} | ${item.category} | ${item.confidence} | ${item.count} | ${escapeCell(item.summary)} | ${escapeCell(item.files.join("<br>"))} |`,
    );
  }

  lines.push(
    "",
    "> 本文件是在 LLM 合成前由确定性规则提取的证据。",
  );
  return lines.join("\n");
}

function renderEvidenceMarkdownEn(report: EvidenceReport): string {
  const lines = [
    `# Evidence · ${report.projectType}`,
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Files scanned: ${report.fileCount}`,
    `- Languages: ${report.languages.join(", ") || "unknown"}`,
    `- Evidence items: ${report.items.length}`,
    "",
    "## Evidence Table",
    "",
    "| Layer | Category | Confidence | Count | Evidence | Files |",
    "|-------|----------|------------|-------|----------|-------|",
  ];

  for (const item of report.items) {
    lines.push(
      `| ${item.layer} | ${item.category} | ${item.confidence} | ${item.count} | ${escapeCell(item.summary)} | ${escapeCell(item.files.join("<br>"))} |`,
    );
  }

  lines.push(
    "",
    "> This file is deterministic evidence extracted before the LLM synthesis step.",
  );
  return lines.join("\n");
}

export function renderEvidenceJson(report: EvidenceReport): string {
  return JSON.stringify(report, null, 2) + "\n";
}

export function renderEvidencePrompt(report: EvidenceReport): string {
  if (report.items.length === 0) {
    return "No deterministic evidence was extracted. Treat all style claims as low confidence unless supported by code snippets.";
  }

  return [
    "## Deterministic Evidence",
    "Use this as the factual floor. Prefer these observations over unsupported inference.",
    "",
    ...report.items.map(
      (item) =>
        `- ${item.layer}/${item.category} [${item.confidence}, ${item.count} file(s)]: ${item.summary} Evidence files: ${item.files.slice(0, 5).join(", ")}`,
    ),
  ].join("\n");
}

function confidenceFor(count: number, rule: EvidenceRule): EvidenceConfidence {
  if (count >= (rule.minHigh || 5)) return "high";
  if (count >= (rule.minMedium || 2)) return "medium";
  return "low";
}

function confidenceRank(confidence: EvidenceConfidence): number {
  return confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
