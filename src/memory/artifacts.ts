/**
 * Structured artifacts generated beside L1-L8 markdown.
 *
 * MANIFEST.json is a compact index for humans/tools.
 * TRACE.json maps extracted rules/templates back to local evidence when possible.
 * VERIFY.json is a deterministic local audit report.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { EvidenceItem, EvidenceReport } from "./evidence.js";

export interface ReferenceManifest {
  version: 1;
  generatedAt: string;
  skillName: string;
  projectType: string;
  outputLanguage: "zh" | "en";
  layers: LayerManifest[];
  playbook: PlaybookEntry[];
  evidence: {
    itemCount: number;
    coveredLayers: string[];
  };
}

export interface LayerManifest {
  id: string;
  title: string;
  file: string;
  scope: string[];
  topics: string[];
  ruleCount: number;
  templateCount: number;
  antiPatternCount: number;
  gapCount: number;
  evidenceIds: string[];
}

export interface TraceFile {
  version: 1;
  generatedAt: string;
  skillName: string;
  projectType: string;
  rules: TraceRule[];
  templates: TraceTemplate[];
}

export interface TraceRule {
  id: string;
  layer: string;
  text: string;
  tags: string[];
  files: string[];
  evidenceIds: string[];
  status: "active" | "weak" | "pending" | "stale";
}

export interface TraceTemplate {
  id: string;
  layer: string;
  name: string;
  status: "active" | "missing" | "pending";
  files: string[];
  evidenceIds: string[];
}

export interface VerifyReport {
  version: 1;
  generatedAt: string;
  skillName: string;
  projectType: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    layers: number;
    rules: number;
    templates: number;
    staleRules: number;
    pendingRules: number;
  };
}

export interface PlaybookEntry {
  task: string;
  action: string;
  layers: string[];
}

const EXPECTED = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"];

export function buildReferenceManifest(opts: {
  skillName: string;
  projectType: string;
  outputLanguage: "zh" | "en";
  layers: Record<string, string>;
  evidence: EvidenceReport;
}): ReferenceManifest {
  const trace = buildTrace({
    skillName: opts.skillName,
    projectType: opts.projectType,
    layers: opts.layers,
    evidence: opts.evidence,
  });
  const layerById = new Map(
    Object.entries(opts.layers).map(([fileStem, content]) => [
      fileStem.slice(0, 2),
      { fileStem, content },
    ]),
  );
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    skillName: opts.skillName,
    projectType: opts.projectType,
    outputLanguage: opts.outputLanguage,
    layers: EXPECTED.map((id) => {
      const current = layerById.get(id);
      const content = current?.content || "";
      const rules = trace.rules.filter((rule) => rule.layer === id);
      const templates = trace.templates.filter((template) => template.layer === id);
      return {
        id,
        title: extractLayerTitle(content) || id,
        file: current ? `${current.fileStem}.md` : "",
        scope: extractSectionLines(content, "Scope"),
        topics: extractHeadings(content).slice(0, 10),
        ruleCount: rules.length,
        templateCount: templates.length,
        antiPatternCount: extractSectionLines(content, "Anti-patterns").length,
        gapCount: extractSectionLines(content, "Gaps").length,
        evidenceIds: [...new Set(rules.flatMap((rule) => rule.evidenceIds))],
      };
    }),
    playbook: buildPlaybook(opts.outputLanguage),
    evidence: {
      itemCount: opts.evidence.items.length,
      coveredLayers: [...new Set(opts.evidence.items.map((item) => item.layer))].sort(),
    },
  };
}

export function buildTrace(opts: {
  skillName: string;
  projectType: string;
  layers: Record<string, string>;
  evidence: EvidenceReport;
}): TraceFile {
  const evidenceByLayer = groupEvidenceByLayer(opts.evidence.items);
  const rules: TraceRule[] = [];
  const templates: TraceTemplate[] = [];
  for (const [, content] of Object.entries(opts.layers)) {
    const layer = extractLayerId(content);
    if (!layer) continue;
    const evidence = evidenceByLayer.get(layer) || [];
    const fallbackFiles = [...new Set(evidence.flatMap((item) => item.files))];
    const fallbackIds = evidence.map((item) => item.id);
    const ruleLines = [
      ...extractSectionLines(content, "Rules"),
      ...extractLegacyRuleLines(content),
    ];
    for (const text of dedupe(ruleLines)) {
      const tags = extractTags(text);
      const files = extractFileRefs(text);
      rules.push({
        id: `${opts.projectType}-${layer}-r${String(rules.length + 1).padStart(3, "0")}`,
        layer,
        text: cleanBullet(text),
        tags,
        files: files.length ? files : fallbackFiles.slice(0, 5),
        evidenceIds: fallbackIds,
        status: classifyRuleStatus(text, files, fallbackFiles),
      });
    }
    for (const template of extractTemplates(content)) {
      templates.push({
        id: `${opts.projectType}-${layer}-t${String(templates.length + 1).padStart(3, "0")}`,
        layer,
        name: template.name,
        status: classifyTemplateStatus(template.body),
        files: extractFileRefs(template.body).slice(0, 5),
        evidenceIds: fallbackIds,
      });
    }
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    skillName: opts.skillName,
    projectType: opts.projectType,
    rules,
    templates,
  };
}

export function verifyReferenceArtifacts(opts: {
  skillName: string;
  projectType: string;
  layers: Record<string, string>;
  trace: TraceFile;
  manifest: ReferenceManifest;
}): VerifyReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const id of EXPECTED) {
    const content = Object.entries(opts.layers).find(([name]) =>
      name.startsWith(id),
    )?.[1];
    if (!content) {
      errors.push(`${id} missing`);
      continue;
    }
    for (const section of ["Scope", "Rules", "Templates", "Anti-patterns", "Evidence", "Gaps"]) {
      if (!hasSection(content, section)) {
        warnings.push(`${id} missing ${section} section`);
      }
    }
  }
  const staleRules = opts.trace.rules.filter((rule) => rule.status === "stale").length;
  const pendingRules = opts.trace.rules.filter((rule) => rule.status === "pending").length;
  const missingTemplates = opts.trace.templates.filter(
    (template) => template.status === "missing",
  ).length;
  if (opts.trace.rules.length === 0) warnings.push("No structured rules extracted");
  if (missingTemplates > 0) warnings.push(`${missingTemplates} missing template(s)`);
  if (staleRules > 0) warnings.push(`${staleRules} stale rule(s)`);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    skillName: opts.skillName,
    projectType: opts.projectType,
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      layers: opts.manifest.layers.filter((layer) => layer.file).length,
      rules: opts.trace.rules.length,
      templates: opts.trace.templates.length,
      staleRules,
      pendingRules,
    },
  };
}

export function readStructuredArtifacts(typeDir: string): {
  manifest: ReferenceManifest | null;
  trace: TraceFile | null;
  verify: VerifyReport | null;
} {
  return {
    manifest: readJsonIfExists<ReferenceManifest>(join(typeDir, "MANIFEST.json")),
    trace: readJsonIfExists<TraceFile>(join(typeDir, "TRACE.json")),
    verify: readJsonIfExists<VerifyReport>(join(typeDir, "VERIFY.json")),
  };
}

export function copyTraceSnapshot(trace: TraceFile | null): TraceFile | null {
  if (!trace) return null;
  return JSON.parse(JSON.stringify(trace)) as TraceFile;
}

function buildPlaybook(outputLanguage: "zh" | "en"): PlaybookEntry[] {
  if (outputLanguage === "en") {
    return [
      { task: "Add page/component", action: "Follow project map, module contracts, naming, execution and cross-cutting policy.", layers: ["L1", "L2", "L3", "L4", "L7"] },
      { task: "Add API/data flow", action: "Start from module contracts, then data/state and security/performance policy.", layers: ["L2", "L5", "L7"] },
      { task: "Add tests or logging", action: "Use the quality system first, then execution patterns.", layers: ["L6", "L4"] },
      { task: "Change bootstrap/build", action: "Use operations/bootstrap and cross-cutting configuration policy.", layers: ["L8", "L7"] },
    ];
  }
  return [
    { task: "新增页面/组件", action: "先看项目地图、模块契约、命名、执行模式和横切策略。", layers: ["L1", "L2", "L3", "L4", "L7"] },
    { task: "新增 API/数据流", action: "先看模块契约，再看数据状态与安全/性能策略。", layers: ["L2", "L5", "L7"] },
    { task: "新增测试或日志", action: "优先遵守质量体系，再参考执行模式。", layers: ["L6", "L4"] },
    { task: "修改启动/构建", action: "优先参考工程运行与横切配置策略。", layers: ["L8", "L7"] },
  ];
}

function groupEvidenceByLayer(items: EvidenceItem[]): Map<string, EvidenceItem[]> {
  const out = new Map<string, EvidenceItem[]>();
  for (const item of items) {
    const arr = out.get(item.layer) || [];
    arr.push(item);
    out.set(item.layer, arr);
  }
  return out;
}

function extractLayerId(content: string): string | null {
  return content.match(/^##\s+(L[1-8])\b/m)?.[1] || null;
}

function extractLayerTitle(content: string): string | null {
  return content.match(/^##\s+(.+)$/m)?.[1]?.trim() || null;
}

function extractHeadings(content: string): string[] {
  return [...content.matchAll(/^###\s+(.+)$/gm)].map((m) => m[1].trim());
}

function hasSection(content: string, section: string): boolean {
  const aliases = sectionAliases(section);
  return aliases.some((alias) =>
    new RegExp(`^###\\s+${escapeRegExp(alias)}(?:\\s|[：:]|$)`, "im").test(
      content,
    ),
  );
}

function extractSectionLines(content: string, section: string): string[] {
  const aliases = sectionAliases(section);
  for (const alias of aliases) {
    const rx = new RegExp(
      `^###\\s+${escapeRegExp(alias)}(?:\\s|[：:]|$)[^\\n]*\\n([\\s\\S]*?)(?=^###\\s+|^##\\s+|\\n---\\n|\\s*$)`,
      "im",
    );
    const match = content.match(rx);
    if (!match) continue;
    return match[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[-*]\s+/.test(line));
  }
  return [];
}

function extractLegacyRuleLines(content: string): string[] {
  const out: string[] = [];
  let inFence = false;
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !/^[-*]\s+/.test(line)) continue;
    if (/^\s*[-*]\s*(无|None|N\/A|⚠️)/i.test(line)) continue;
    if (/待验证|To Verify|建议|suggest|recommend/i.test(line)) continue;
    out.push(line);
  }
  return out;
}

function extractTemplates(content: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const rx = /^###\s+(?:Templates?|模板|Template)[：:]?\s*(.*?)\n([\s\S]*?)(?=^###\s+|^##\s+|\n---\n|\s*$)/gim;
  let match: RegExpExecArray | null;
  while ((match = rx.exec(content)) !== null) {
    out.push({ name: (match[1] || "Template").trim() || "Template", body: match[2] || "" });
  }
  return out;
}

function sectionAliases(section: string): string[] {
  switch (section) {
    case "Scope":
      return ["Scope", "范围", "边界"];
    case "Rules":
      return ["Rules", "规则", "约定", "Conventions"];
    case "Templates":
      return ["Templates", "Template", "模板"];
    case "Anti-patterns":
      return ["Anti-patterns", "Anti-pattern", "反模式"];
    case "Evidence":
      return ["Evidence", "证据"];
    case "Gaps":
      return ["Gaps", "缺口", "待验证", "To Verify"];
    default:
      return [section];
  }
}

function classifyRuleStatus(
  text: string,
  directFiles: string[],
  fallbackFiles: string[],
): TraceRule["status"] {
  if (/待验证|To Verify|suggest|recommend|建议|考虑|maybe|可能/i.test(text)) {
    return "pending";
  }
  if (directFiles.length > 0 || fallbackFiles.length > 0) return "active";
  return "stale";
}

function classifyTemplateStatus(body: string): TraceTemplate["status"] {
  if (/无现有模式|No existing pattern/i.test(body)) return "missing";
  if (/待验证|To Verify|suggest|recommend|建议|可能|maybe/i.test(body)) return "pending";
  return "active";
}

function extractTags(text: string): string[] {
  return [...text.matchAll(/\[[^\]]+\]/g)].map((m) => m[0]);
}

function extractFileRefs(text: string): string[] {
  const refs = new Set<string>();
  const rx = /(?:^|[\s(`])([A-Za-z0-9_.@/-]+\.(?:ts|tsx|js|jsx|vue|java|go|rs|py|rb|php|cs|json|yml|yaml|toml|xml|md|sql|css|scss|html))(?:[:)`\s.,;]|$)/g;
  let match: RegExpExecArray | null;
  while ((match = rx.exec(text)) !== null) refs.add(match[1]);
  return [...refs];
}

function cleanBullet(text: string): string {
  return text.replace(/^[-*]\s*/, "").trim();
}

function dedupe(lines: string[]): string[] {
  return [...new Map(lines.map((line) => [cleanBullet(line), line])).values()];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readJsonIfExists<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}
