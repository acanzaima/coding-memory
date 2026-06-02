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
  llmValidation?: {
    ok: boolean;
    output: string;
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
      const rules = trace.rules.filter(
        (rule) => rule.layer === id && rule.status === "active",
      );
      const templates = trace.templates.filter(
        (template) => template.layer === id && template.status === "active",
      );
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
        status: classifyTemplateStatus(template.name, template.body),
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
  llmValidation?: {
    ok: boolean;
    output: string;
  };
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
    const truncation = detectLikelyTruncation(content);
    if (truncation) errors.push(`${id} appears truncated: ${truncation}`);
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
  const pendingTemplates = opts.trace.templates.filter(
    (template) => template.status === "pending",
  ).length;
  if (opts.trace.rules.length === 0) warnings.push("No structured rules extracted");
  if (pendingTemplates > 0) warnings.push(`${pendingTemplates} pending template(s)`);
  if (staleRules > 0) warnings.push(`${staleRules} stale rule(s)`);
  if (opts.llmValidation && !opts.llmValidation.ok) {
    errors.push(`LLM validation failed: ${compactValidationOutput(opts.llmValidation.output)}`);
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    skillName: opts.skillName,
    projectType: opts.projectType,
    ok: errors.length === 0,
    errors,
    warnings,
    llmValidation: opts.llmValidation,
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
    new RegExp(`^###\\s+${escapeRegExp(alias)}(?:[ \\t]|[：:]|$)`, "im").test(
      content,
    ),
  );
}

function extractSectionLines(content: string, section: string): string[] {
  if (section === "Rules") return extractRuleLines(content);
  const aliases = sectionAliases(section);
  for (const alias of aliases) {
    const body = extractSectionBody(content, alias);
    if (body === null) continue;
    const bullets = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[-*]\s+/.test(line));
    if (bullets.length > 0) return bullets;
    if (section === "Scope") {
      const prose = body
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("```"))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return prose ? [prose] : [];
    }
    return [];
  }
  return [];
}

function extractSectionBody(content: string, alias: string): string | null {
  const header = new RegExp(
    `^###\\s+${escapeRegExp(alias)}(?:[ \\t]|[：:]|$)[^\\n]*(?:\\n|$)`,
    "im",
  );
  const match = header.exec(content);
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = content.slice(start);
  const boundary = rest.match(/^(?:###(?!#)\s+|##\s+|---\s*$)/m);
  const end = boundary?.index === undefined ? content.length : start + boundary.index;
  return content.slice(start, end);
}

function detectLikelyTruncation(content: string): string | null {
  if (/```/.test(content)) {
    const fenceCount = (content.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) return "unclosed code fence";
  }
  const tail = content.trimEnd().split("\n").pop()?.trim() || "";
  const inlineBackticks = tail.match(/`/g)?.length || 0;
  if (inlineBackticks % 2 !== 0) {
    return `dangling inline code "${tail.slice(0, 80)}"`;
  }
  return null;
}

function compactValidationOutput(output: string): string {
  return output.replace(/\s+/g, " ").trim().slice(0, 500) || "no details";
}

function extractLegacyRuleLines(content: string): string[] {
  const out: string[] = [];
  for (const section of extractLevel3Sections(content)) {
    if (isReservedSectionTitle(section.title)) continue;
    out.push(...parseRuleBody(section.body, section.title));
  }
  return out;
}

function extractRuleLines(content: string): string[] {
  const explicit: string[] = [];
  for (const alias of sectionAliases("Rules")) {
    const body = extractSectionBody(content, alias);
    if (body !== null) explicit.push(...parseRuleBody(body));
  }
  return explicit.length > 0 ? dedupe(explicit) : dedupe(extractLegacyRuleLines(content));
}

function parseRuleBody(body: string, fallbackTitle = ""): string[] {
  const out: string[] = [];
  const lines = body.split("\n");
  let group: ParsedRuleHeading | null = fallbackTitle
    ? parseRuleHeading(fallbackTitle)
    : null;
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !trimmed) continue;
    const heading = parseRuleHeadingLine(trimmed);
    if (heading) {
      group = heading;
      continue;
    }
    if (!isTopLevelListItem(raw)) continue;
    const block = collectRuleBlock(lines, i);
    i = block.nextIndex - 1;
    const rule = composeRuleText(block.lines, group);
    if (rule) out.push(rule);
  }
  return out;
}

interface ParsedRuleHeading {
  title: string;
  tags: string[];
}

function parseRuleHeadingLine(trimmed: string): ParsedRuleHeading | null {
  if (/^#{1,3}\s+/.test(trimmed)) return null;
  if (/^(?:\*\*)?(?:证据|Evidence)(?:\*\*)?[：:]/i.test(trimmed)) return null;
  if (/^(?:\[(?:个人偏好|项目特定|必须|推荐|可选)\]\s*)+$/.test(trimmed)) {
    return parseRuleHeading(trimmed);
  }
  if (/^####\s+/.test(trimmed)) {
    return parseRuleHeading(trimmed.replace(/^####\s+/, ""));
  }
  if (/^\*\*.+\*\*/.test(trimmed) && !/^[-*]\s+/.test(trimmed)) {
    return parseRuleHeading(trimmed);
  }
  return null;
}

function parseRuleHeading(text: string): ParsedRuleHeading {
  const tags = extractTags(text);
  return {
    title: cleanInlineTitle(text),
    tags,
  };
}

function isTopLevelListItem(raw: string): boolean {
  return /^\s{0,1}(?:[-*]|\d+\.)\s+/.test(raw);
}

function collectRuleBlock(
  lines: string[],
  startIndex: number,
): { lines: string[]; nextIndex: number } {
  const collected = [lines[startIndex]];
  let inFence = false;
  for (let i = startIndex + 1; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      collected.push(raw);
      continue;
    }
    if (!inFence) {
      if (/^###\s+/.test(trimmed) || /^---\s*$/.test(trimmed)) {
        return { lines: collected, nextIndex: i };
      }
      if (parseRuleHeadingLine(trimmed) || isTopLevelListItem(raw)) {
        return { lines: collected, nextIndex: i };
      }
    }
    collected.push(raw);
  }
  return { lines: collected, nextIndex: lines.length };
}

function composeRuleText(
  blockLines: string[],
  group: ParsedRuleHeading | null,
): string | null {
  const first = blockLines[0]?.trim() || "";
  const item = parseRuleItem(first.replace(/^(?:[-*]|\d+\.)\s+/, ""));
  const tags = normalizeRuleTags([
    ...(group?.tags || []),
    ...blockLines.flatMap((line) => extractTags(line)),
    ...item.tags,
  ]);
  const groupTitle = group?.title || "";
  const itemTitle = item.title;
  const bodyParts = [
    item.inlineBody,
    ...blockLines.slice(1).map((line) => cleanRuleBodyLine(line, false)),
  ]
    .filter((line) => line && !isNonRuleObservation(line));
  const firstBody = bodyParts[0] || "";
  const titleOnly =
    bodyParts.length > 1 &&
    itemTitle &&
    normalizeText(firstBody) === normalizeText(itemTitle);
  const body = (titleOnly ? bodyParts.slice(1) : bodyParts)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const title = [groupTitle, itemTitle]
    .filter(Boolean)
    .filter((part, index, arr) => index === 0 || normalizeText(part) !== normalizeText(arr[0]))
    .join(" / ");
  const tagText = [...new Set(tags)].join(" ");
  if (!body && (!title || looksLikeHeadingOnly(title))) return null;
  if (!body && title) return null;
  const dedupedBody = removeRepeatedRulePrefix(body, title);
  const prefix = title ? `${title}${tagText ? ` ${tagText}` : ""}` : tagText;
  const text = prefix ? `${prefix}：${dedupedBody}` : dedupedBody;
  return isUsableRuleText(text) ? cleanRuleTextForTrace(text) : null;
}

interface ParsedRuleItem extends ParsedRuleHeading {
  inlineBody: string;
}

function parseRuleItem(text: string): ParsedRuleItem {
  const raw = text.trim();
  const tags = extractTags(raw);
  const boldWithBody = raw.match(/^\*\*(.+?)\*\*\s*[：:]\s*(.+)$/);
  if (boldWithBody) {
    return {
      title: cleanInlineTitle(boldWithBody[1]),
      tags,
      inlineBody: cleanRuleBodyText(boldWithBody[2]),
    };
  }
  const boldOnly = raw.match(/^\*\*(.+?)\*\*\s*$/);
  if (boldOnly) {
    return {
      title: cleanInlineTitle(boldOnly[1]),
      tags,
      inlineBody: "",
    };
  }
  const withoutTags = cleanRuleBodyText(raw);
  const colon = withoutTags.match(/^([^：:]{2,32})[：:]\s*(.+)$/);
  if (colon && !/`/.test(colon[1])) {
    return {
      title: cleanInlineTitle(colon[1]),
      tags,
      inlineBody: cleanRuleBodyText(colon[2]),
    };
  }
  return { title: "", tags, inlineBody: withoutTags };
}

function cleanRuleBodyLine(line: string, firstLine: boolean): string {
  let cleaned = line.trim();
  if (!cleaned || cleaned.startsWith("```")) return "";
  cleaned = cleaned.replace(/^\*\*(.+?)\*\*$/, "$1");
  cleaned = cleaned.replace(/^(?:[-*]|\d+\.)\s+/, "").trim();
  if (!firstLine) cleaned = cleaned.replace(/^[-*]\s+/, "").trim();
  return cleanRuleBodyText(cleaned);
}

function cleanRuleBodyText(text: string): string {
  return stripMarkdownStrongMarkers(text)
    .replace(/\s*\[(?:个人偏好|项目特定|必须|推荐|可选)\]\s*/g, " ")
    .replace(/[【】]/g, " ")
    .replace(/\*?\s*(?:证据|Evidence)[：:][^*]*\*?/gi, " ")
    .replace(/[（(]\s*(?:证据|Evidence)[：:][^）)]*[）)]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanInlineTitle(text: string): string {
  return stripMarkdownStrongMarkers(text)
    .replace(/^\*\*(.+?)\*\*$/, "$1")
    .replace(/^(?:[-*]|\d+\.)\s+/, "")
    .replace(/\s*\[[^\]]+\]\s*/g, " ")
    .replace(/^#+\s+/, "")
    .trim()
    .replace(/\s+/g, " ");
}

function stripMarkdownStrongMarkers(text: string): string {
  return text.replace(/(^|[^/])\*\*/g, "$1");
}

function isNonRuleObservation(text: string): boolean {
  return (
    /^⚠️/.test(text) ||
    /\[待验证\]|To Verify/i.test(text) ||
    /^(?:证据|Evidence)[：:]/i.test(text) ||
    /^\*?\s*(?:证据|Evidence)[：:]/i.test(text) ||
    /^（?证据[：:]/.test(text) ||
    /未发现|未展示|未出现|未启用|未见|无显式|当前无|不存在|通过文件片段推断|早期分析|L8\s*中提及/.test(text)
  );
}

function looksLikeHeadingOnly(text: string): boolean {
  return text.length <= 24 && !/[。.!?；;]/.test(text);
}

function isUsableRuleText(text: string): boolean {
  if (text.length < 12) return false;
  if (/^#{1,6}\s+/.test(text)) return false;
  if (/^(?:证据|Evidence)[：:]/i.test(text.trim())) return false;
  if (/无现有模式|No existing pattern/i.test(text)) return false;
  return true;
}

function removeRepeatedRulePrefix(body: string, title: string): string {
  if (!title) return body;
  const normalizedTitle = normalizeText(title);
  const normalizedBody = normalizeText(body);
  if (!normalizedBody.startsWith(normalizedTitle)) return body;
  const stripped = body
    .replace(new RegExp(`^${escapeRegExp(title)}\\s*[：:，,。-]*\\s*`, "i"), "")
    .trim();
  return stripped || body;
}

function cleanRuleTextForTrace(text: string): string {
  let cleaned = text
    .replace(/\s*\[(?:个人偏好|项目特定|必须|推荐|可选|Personal Preference|Project-Specific|Must|Recommended|Optional)\]\s*/gi, " ")
    .replace(/\*?\s*(?:证据|Evidence)[：:][^*]*\*?/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/([：:])\s*\1+/g, "$1")
    .replace(/^[\s：:]+/, "")
    .replace(/^\[['"][^\]]+\][：:]\s*/, "")
    .trim();
  cleaned = cleaned.replace(/^(.{2,80})[：:]\s*\1[：:]/, "$1:");
  return cleaned;
}

function extractTemplates(content: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  for (const section of extractLevel3Sections(content)) {
    const parsed = parseTemplateSectionTitle(section.title);
    if (!parsed) continue;
    out.push(selectRepresentativeTemplate(parsed.headingName, section.body));
  }
  return out;
}

function parseTemplateSectionTitle(title: string): { headingName: string } | null {
  const match = title.match(/^(?:Templates?|模板|Template)(?:[：:]\s*(.*?))?$/i);
  if (!match) return null;
  return { headingName: (match[1] || "").trim() };
}

function selectRepresentativeTemplate(
  headingName: string,
  body: string,
): { name: string; body: string } {
  if (headingName.trim()) {
    return { name: normalizeTemplateName(headingName), body };
  }
  const candidates = extractTemplateCandidates(body);
  const active = candidates.find((candidate) => !isMissingOnlyTemplateBody(candidate.body));
  return active || candidates[0] || {
    name: normalizeTemplateName(extractTemplateTitle(body) || "Template"),
    body,
  };
}

function extractTemplateCandidates(body: string): Array<{ name: string; body: string }> {
  const lines = body.split("\n");
  const candidates: Array<{ name: string; body: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const heading = parseTemplateHeading(lines[i].trim());
    if (!heading) continue;
    const subBody = collectTemplateSubBody(lines, i + 1);
    candidates.push({
      name: normalizeTemplateName(heading),
      body: subBody,
    });
  }
  return candidates;
}

function extractTemplateTitle(body: string): string | null {
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("```")) continue;
    const heading = parseTemplateHeading(line);
    if (heading) {
      const subBody = collectTemplateSubBody(lines, i + 1);
      if (isMissingOnlyTemplateBody(subBody)) continue;
      return heading.trim();
    }
    if (!/^[-*]\s+/.test(line) && !/^`[^`]+`[：:]/.test(line)) return line;
  }
  return null;
}

function parseTemplateHeading(line: string): string | null {
  return (
    line.match(/^####\s+(.+)$/)?.[1] ||
    line.match(/^\*\*(.+?)\*\*\s*$/)?.[1] ||
    null
  );
}

function collectTemplateSubBody(lines: string[], start: number): string {
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    if (parseTemplateHeading(lines[i].trim())) break;
    out.push(lines[i]);
  }
  return out.join("\n");
}

function isMissingOnlyTemplateBody(body: string): boolean {
  if (!/无现有模式|No existing pattern/i.test(body)) return false;
  if (/```/.test(body)) return false;
  const meaningful = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^#{1,6}\s+/.test(line))
    .map((line) => line.replace(/^[\u26a0\ufe0f\s]+/, "").trim())
    .filter((line) => !/^(无现有模式|No existing pattern)/i.test(line));
  return meaningful.length === 0;
}

function normalizeTemplateName(name: string): string {
  const cleaned = name
    .replace(/^#+\s+/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^\[(.+)\]$/, "$1")
    .trim();
  return cleaned || "Template";
}

function extractLevel3Sections(content: string): Array<{ title: string; body: string }> {
  const sections: Array<{ title: string; body: string }> = [];
  const rx = /^###\s+(.+?)\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = rx.exec(content)) !== null) {
    const start = match.index + match[0].length;
    const rest = content.slice(start);
    const boundary = rest.match(/^(?:###(?!#)\s+|##\s+|---\s*$)/m);
    const end = boundary?.index === undefined ? content.length : start + boundary.index;
    sections.push({ title: match[1].trim(), body: content.slice(start, end) });
  }
  return sections;
}

function isReservedSectionTitle(title: string): boolean {
  const normalized = title.replace(/[：:].*$/, "").trim().toLowerCase();
  return sectionAliases("Scope")
    .concat(sectionAliases("Rules"))
    .concat(sectionAliases("Templates"))
    .concat(sectionAliases("Anti-patterns"))
    .concat(sectionAliases("Evidence"))
    .concat(sectionAliases("Gaps"))
    .some((alias) => normalized === alias.toLowerCase());
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
  return "weak";
}

function classifyTemplateStatus(name: string, body: string): TraceTemplate["status"] {
  if (/无现有模式|No existing pattern/i.test(name)) return "missing";
  if (isMissingOnlyTemplateBody(body)) return "missing";
  if (
    /待验证|To Verify|suggest|recommend|建议|建议引入|建议采用|推荐使用|可考虑|可能|maybe|无现有模式|No existing pattern|example\.com|Vitest|Jest|Cypress|Playwright|Sentry/i.test(
      body,
    )
  ) {
    return "pending";
  }
  return "active";
}

function extractTags(text: string): string[] {
  return [...text.matchAll(/\[[^\]]+\]/g)].map((m) => m[0]);
}

function normalizeRuleTags(tags: string[]): string[] {
  const unique = [...new Set(tags)];
  const hasScope = unique.some((tag) => /\[?(?:个人偏好|项目特定|Personal Preference|Project-Specific)\]?/i.test(tag));
  const hasConfidence = unique.some((tag) => /\[?(?:必须|推荐|可选|Must|Recommended|Optional)\]?/i.test(tag));
  if (!hasScope && hasConfidence) unique.unshift("[项目特定]");
  return unique;
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

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
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
