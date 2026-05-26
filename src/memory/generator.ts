/**
 * Memory generator — 5-phase agent pipeline to distill code patterns
 * into an 8-layer language-agnostic SKILL.md.
 *
 * L1 项目骨架  L2 模块与接口  L3 命名与类型  L4 实现模式
 * L5 数据与状态  L6 质量保障  L7 横切关注点  L8 工程化与启动
 *
 * P0 PLAN → P1 EXPLORE (L1-L4) → P2 EXTRACT (L5-L8) → P3 SYNTHESIZE → P4 VALIDATE
 */

import { chatCompletion } from "../llm/client.js";
import { getLanguageDisplayName } from "../scanner/language.js";
import { prepareCodeSample } from "../scanner/file-scanner.js";
import type { CodingMemoryConfig, LLMConfig, LanguageGroup } from "../types.js";

const FILE_LISTING_CHAR_LIMIT = 20000;
const LAYER_SAMPLE_BUDGET = 30000;
const LAYER_MAX_FILES = 12;
const LAYER_FILE_CHAR_LIMIT = 4000;
const LAYER_IMPORTANT_FILE_CHAR_LIMIT = 8000;

export interface GenerateSkillOptions {
  group: LanguageGroup;
  skillName: string;
  projectName: string;
  existingSkill?: string | null;
  onProgress?: (msg: string) => void;
  focus?: string;
  retryMode?: boolean;
  evidence?: string;
  outputLanguage?: CodingMemoryConfig["outputLanguage"];
}

export async function generateSkill(
  config: LLMConfig,
  opts: GenerateSkillOptions,
): Promise<string> {
  const {
    group,
    skillName,
    projectName,
    existingSkill = null,
    onProgress,
    focus,
    retryMode = false,
    evidence,
    outputLanguage = "zh",
  } = opts;
  const samples = prepareCodeSample(group, 80000);
  const langDisplay = getLanguageDisplayName(group.language);
  const isUpdate = existingSkill !== null;
  const ctx = samples
    .map(
      (s) => `### ${s.filePath}\n\`\`\`\n${s.content.slice(0, 5000)}\n\`\`\``,
    )
    .join("\n\n");

  const evidenceBlock = evidence
    ? `\n\n${evidence}\n\nEvidence policy: treat the deterministic evidence above as the factual floor. Do not promote unsupported claims to rules; mark them ${pendingTag(outputLanguage)} or omit them.`
    : "";
  const langInstruction =
    outputLanguage === "en"
      ? "Write all generated SKILL content, section prose, rules, templates, gaps, and validation output in English. Keep code identifiers and file paths unchanged."
      : "Write all generated SKILL content, section prose, rules, templates, gaps, and validation output in Simplified Chinese. Keep code identifiers and file paths unchanged.";
  const labels = layerLabels(outputLanguage);
  const tags = tagLabels(outputLanguage);
  const existingLayers = isUpdate
    ? splitExistingSkillByLayer(existingSkill!)
    : new Map<string, string>();

  const sys = {
    role: "system" as const,
    content: `You are an expert software architect analyzing a ${langDisplay} codebase.
Distill the developer's coding style into an 8-layer SKILL.md.
Each layer: conventions → template → anti-patterns.
${langInstruction}

Tagging rules:
- ${tags.personal} = pattern seen across MULTIPLE projects OR 5+ files (developer habit). Use SPARINGLY.
- ${tags.project} = pattern seen only in this ONE project (DEFAULT tag for single-project learning).
- ${tags.pending} = improvement suggestion or unconfirmed tool. Tag ALL suggestions with this. Never mix ${tags.pending} with ${tags.must}/${tags.recommended}.
- Confidence: ${tags.must} if 2+ projects or 5+ files, ${tags.recommended} if 3-4 files, ${tags.optional} if 1-2 files.
- NEVER tag single-project patterns as ${tags.personal} — they are ${tags.project} by definition.
- Improvement suggestions MUST be tagged ${tags.pending} and placed in a separate "### ${labels.pendingSection}" section per layer, NOT in conventions/templates.

CRITICAL RULES:
- Only report patterns that EXIST in the code. If absent → "${noPatternText(outputLanguage)}".
- Never suggest tools/frameworks not found in the codebase.
- Never write "推测" (speculate), "可能" (maybe), "未发现" (not found) as a rule.
- Templates must be extracted from actual code, NOT invented.
- Be CONCRETE with file paths and code snippets.
${retryMode ? `- STRICT FORMAT: Use EXACTLY '${labels.l1Header}' headers. Each layer MUST have ### ${labels.templatePrefix} section. No markdown code fences around the entire output.` : ""}`,
  };

  const msgs: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [sys];

  // ── Focus ──
  let fi = "";
  if (focus) {
    onProgress?.("Interpreting focus...");
    fi = await refineFocus(config, focus, langDisplay, outputLanguage);
  }
  const focusBlock = fi
    ? renderFocusBlock(fi, outputLanguage, tags.pending)
    : "";

  // ═══════════ Phase 0 ═══════════
  onProgress?.("Planning...");
  msgs.push({
    role: "user",
    content: `## Phase 0 — Plan
Analyze ${group.files.length} ${langDisplay} files from "${projectName}".
Write a brief plan (5-8 items) for the 8 layers.
${langInstruction}
${focusBlock}
${evidenceBlock}
${isUpdate ? `\nExisting:\n\`\`\`\n${existingSkill!.slice(0, 1500)}\n\`\`\`` : ""}`,
  });
  msgs.push({
    role: "assistant",
    content: await chatCompletion(config, {
      messages: [...msgs],
      temperature: 0.3,
      maxTokens: 8192,
    }),
  });

  // ═══════════ Phase 1 (L1-L4) ═══════════
  onProgress?.("Exploring L1-L4...");
  msgs.push({
    role: "user",
    content: `## Phase 1 — Layers 1-4

### ${labels.l1Title}
1. Directory layout — feature/layer/domain? File naming patterns?
2. Module/package organization — grouping logic, dependency direction
3. Key files — entry points, config hubs

### ${labels.l2Title}
4. Module granularity — typical size? When to split? Public vs internal?
5. API/interface patterns — signatures, parameters, returns
6. Dependency rules — import conventions, circular prevention

### ${labels.l3Title}
7. Naming conventions — case style, prefixes for all identifiers
8. Type usage — static/dynamic typing, interface vs type, generics, null
9. Constants & config — enum patterns, magic number rules

### ${labels.l4Title}
10. Function/method design — size, parameters, pure vs side-effect
11. Error handling — propagation, messages, retry/fallback
12. Async/concurrency — patterns, cancellation, event loop
13. Resource management — connections, files, memory, cleanup
Tag conventions as ${tags.personal} or ${tags.project}. Add confidence: ${tags.must}/${tags.recommended}/${tags.optional}.
If a topic has no data in the code, note "${noPatternText(outputLanguage)}" — do NOT invent.

${isUpdate ? `\nExisting:\n\`\`\`\n${existingSkill!.slice(0, 2000)}\n\`\`\`` : ""}
${focusBlock}
${evidenceBlock}
Code:\n${ctx.slice(0, 70000)}`,
  });
  msgs.push({
    role: "assistant",
    content: await chatCompletion(config, {
      messages: [...msgs],
      temperature: 0.3,
      maxTokens: 8192,
    }),
  });

  // ═══════════ Phase 2 (L5-L8) ═══════════
  onProgress?.("Extracting L5-L8...");
  msgs.push({
    role: "user",
    content: `## Phase 2 — Layers 5-8

### ${labels.l5Title}
1. State management — location, flow, immutability
2. Data persistence — DB/ORM, transactions, migrations
3. Caching — what, when, invalidation

### ${labels.l6Title}
4. Testing — framework, organization, mock style, coverage
5. Lint/formatting — config, pre-commit hooks
6. Documentation — README, API docs, inline comments
7. Logging — levels, structured, error reporting

### ${labels.l7Title}
8. Security — validation, injection, auth, secrets
9. Performance — lazy loading, memoization, pooling

### ${labels.l8Title}
10. Build tooling — bundler config, tsconfig strictness
11. Package management — pnpm/npm/yarn, workspaces, lock files
12. App bootstrap — entry structure, plugin order, middleware
13. Environment — .env patterns, config separation
14. Common dependencies — always-installed libraries
15. Git conventions — commit messages, branch naming
16. CI/CD — pipeline structure, deploy scripts

${focusBlock}
${evidenceBlock}
Every point needs a code example and file path.
If no data exists (e.g. no CI/CD), write "${noPatternText(outputLanguage)}" — do NOT invent.
Tag with confidence: ${tags.must}/${tags.recommended}/${tags.optional}.`,
  });
  msgs.push({
    role: "assistant",
    content: await chatCompletion(config, {
      messages: [...msgs],
      temperature: 0.3,
      maxTokens: 8192,
    }),
  });

  // ═══════════ Phase 3 ═══════════
  onProgress?.("Generating SKILL.md...");
  const es = isUpdate
    ? `\nExisting:\n\`\`\`\n${existingSkill!.slice(0, 4000)}\n\`\`\``
    : "";
  msgs.push({
    role: "user",
    content: `## Phase 3 — Generate SKILL.md

Synthesize Phase 1 & 2 into this EXACT 8-layer structure. Each layer MUST have:
convention section → template → anti-pattern section.

---
name: ${skillName}
description: ${langDisplay} coding style from ${projectName}.
---

# ${skillName} · ${langDisplay} ${outputLanguage === "en" ? "Coding Style" : "编码风格"}
> ${group.files.length} files

## ${labels.projectOverview}
[Brief]

## ${labels.techStack}
| Tech | Use |
|------|-----|

---

${labels.l1Header}
### ${outputLanguage === "en" ? "Directory Layout And File Naming" : "目录结构与文件命名"}
### ${outputLanguage === "en" ? "Module Organization" : "模块组织方式"}
### ${labels.templatePrefix}${outputLanguage === "en" ? "New Project Structure" : "新项目结构"}
\`\`\`
[Minimal directory tree]
\`\`\`
### ${labels.antiPatterns}

### ${labels.pendingSection}
[Improvement suggestions or unconfirmed patterns — tag with ${tags.pending}]

---

${labels.l2Header}
### ${outputLanguage === "en" ? "Module Split Granularity" : "模块拆分粒度"}
### ${outputLanguage === "en" ? "API/Interface Design" : "API/接口设计"}
### ${outputLanguage === "en" ? "Dependency Organization" : "依赖组织"}
### ${labels.templatePrefix}${outputLanguage === "en" ? "New Module Skeleton" : "新模块骨架"}
\`\`\`${langDisplay}
[Module skeleton]
\`\`\`
### ${labels.antiPatterns}

### ${labels.pendingSection}
[Improvement suggestions or unconfirmed patterns — tag with ${tags.pending}]

---

${labels.l3Header}
### ${outputLanguage === "en" ? "Naming Conventions" : "命名约定"}
### ${outputLanguage === "en" ? "Type Usage" : "类型使用"}
### ${outputLanguage === "en" ? "Constant Management" : "常量管理"}
### ${labels.templatePrefix}${outputLanguage === "en" ? "Naming Example" : "命名示例"}
\`\`\`${langDisplay}
[Naming example]
\`\`\`
### ${labels.antiPatterns}

### ${labels.pendingSection}
[Improvement suggestions or unconfirmed patterns — tag with ${tags.pending}]

---

${labels.l4Header}
### ${outputLanguage === "en" ? "Function Design" : "函数设计"}
### ${outputLanguage === "en" ? "Error Handling" : "错误处理"}
### ${outputLanguage === "en" ? "Async/Concurrency" : "异步/并发"}
### ${outputLanguage === "en" ? "Resource Management" : "资源管理"}
### ${labels.templatePrefix}${outputLanguage === "en" ? "Typical Function" : "典型函数"}
\`\`\`${langDisplay}
[Input→validate→process→error→output]
\`\`\`
### ${labels.antiPatterns}

### ${labels.pendingSection}
[Improvement suggestions or unconfirmed patterns — tag with ${tags.pending}]

---

${labels.l5Header}
### ${outputLanguage === "en" ? "State Management" : "状态管理"}
### ${outputLanguage === "en" ? "Data Persistence" : "数据持久化"}
### ${outputLanguage === "en" ? "Caching Strategy" : "缓存策略"}
### ${labels.templatePrefix}${outputLanguage === "en" ? "Data Access" : "数据访问"}
\`\`\`${langDisplay}
[Data fetch + state + cache]
\`\`\`
### ${labels.antiPatterns}

### ${labels.pendingSection}
[Improvement suggestions or unconfirmed patterns — tag with ${tags.pending}]

---

${labels.l6Header}
### ${outputLanguage === "en" ? "Testing" : "测试"}
### ${outputLanguage === "en" ? "Lint/Formatting" : "Lint/格式化"}
### ${outputLanguage === "en" ? "Docs And Comments" : "文档与注释"}
### ${outputLanguage === "en" ? "Logging" : "日志"}
### ${labels.templatePrefix}${outputLanguage === "en" ? "Test Skeleton" : "测试骨架"}
\`\`\`${langDisplay}
[Test skeleton]
\`\`\`
### ${labels.antiPatterns}

### ${labels.pendingSection}
[Improvement suggestions or unconfirmed patterns — tag with ${tags.pending}]

---

${labels.l7Header}
### ${outputLanguage === "en" ? "Security" : "安全"}
### ${outputLanguage === "en" ? "Performance" : "性能"}
### ${outputLanguage === "en" ? "Configuration Management" : "配置管理"}
### ${labels.antiPatterns}

### ${labels.pendingSection}
[Improvement suggestions or unconfirmed patterns — tag with ${tags.pending}]

---

${labels.l8Header}
### ${outputLanguage === "en" ? "Build Tooling" : "构建工具"}
### ${outputLanguage === "en" ? "Package Management" : "包管理"}
### ${outputLanguage === "en" ? "Application Bootstrap" : "应用启动"}
### ${outputLanguage === "en" ? "Environment Management" : "环境管理"}
### ${outputLanguage === "en" ? "Common Dependencies" : "常用依赖"}
### ${outputLanguage === "en" ? "Git Conventions" : "Git 约定"}
### CI/CD
### ${labels.templatePrefix}${outputLanguage === "en" ? "Project Startup Commands" : "项目启动命令"}
\`\`\`bash
[Scaffold commands]
\`\`\`
### ${labels.antiPatterns}

### ${labels.pendingSection}
[Improvement suggestions or unconfirmed patterns — tag with ${tags.pending}]

---

## ${outputLanguage === "en" ? "Decision Heuristics" : "决策启发式"}
| ${outputLanguage === "en" ? "Scenario" : "场景"} | ${outputLanguage === "en" ? "Action" : "做法"} | ${outputLanguage === "en" ? "Reference Layer" : "参考层"} |
|------|------|--------|

## ${outputLanguage === "en" ? "Change Log" : "更新记录"}
${isUpdate ? "| [date] | merge | Updated |" : "| [date] | create | Initial |"}

${es}
${isUpdate ? "PRESERVE + ADD + REMOVE outdated. Do NOT preserve content marked as speculative/maybe/not found." : ""}
${focusBlock}
${evidenceBlock}
CRITICAL: Templates from real code only. If no pattern exists → "${noPatternText(outputLanguage)}".
Tag each convention with ${tags.personal}/${tags.project} AND confidence ${tags.must}/${tags.recommended}/${tags.optional}.
Tag ALL suggestions/improvements with ${tags.pending} and place in ### ${labels.pendingSection} section.
${retryMode ? `STRICT: Output the SKILL.md DIRECTLY. Do NOT wrap in \`\`\`markdown fences. Use EXACTLY '${labels.l1Header}' format for each layer header. Every layer MUST contain ### ${labels.templatePrefix} subsection.` : "Output ONLY the SKILL.md. No code fences."}`,
  });

  const layerMessages = compactAnalysisMessages(msgs.slice(0, -1));
  const specs = layerSpecs(outputLanguage);
  const useLlmFileSelection = shouldUseLlmFileSelection();
  const layerFilePlan = useLlmFileSelection
    ? await selectLayerFiles(config, {
        group,
        specs,
        evidence: evidenceBlock,
      })
    : fallbackLayerFilePlan(group, specs);
  const generatedLayers: string[] = [];
  for (const spec of specs) {
    onProgress?.(`Generating ${spec.id}...`);
    const selectedForLayer = useLlmFileSelection
      ? await refineLayerFiles(config, {
          group,
          spec,
          initialPaths: layerFilePlan[spec.id] || [],
          previousLayers: generatedLayers,
          evidence: evidenceBlock,
        })
      : layerFilePlan[spec.id] || [];
    const samplesForLayer = prepareLayerSamples(
      group,
      spec,
      selectedForLayer,
    );
    const layerContent = await generateSingleLayer(config, {
      messages: layerMessages,
      spec,
      labels,
      tags,
      outputLanguage,
      existingLayer: existingLayers.get(spec.id) || null,
      previousLayers: generatedLayers,
      samples: samplesForLayer,
    });
    generatedLayers.push(layerContent);
  }

  let c = assembleSkillDocument({
    skillName,
    langDisplay,
    projectName,
    fileCount: group.files.length,
    projectOverviewLabel: labels.projectOverview,
    techStackLabel: labels.techStack,
    decisionHeuristicsLabel:
      outputLanguage === "en" ? "Decision Heuristics" : "决策启发式",
    changeLogLabel: outputLanguage === "en" ? "Change Log" : "更新记录",
    outputLanguage,
    isUpdate,
    layers: generatedLayers,
  });
  msgs.push({ role: "assistant", content: c });

  // ═══════════ Phase 4 ═══════════
  onProgress?.("Validating...");
  msgs.push({
    role: "user",
    content: `## Phase 4 — Validate
Check EVERY layer:
1. [ ] All 8 layers (L1-L8) present with EXACT '## Lx · name' format?
2. [ ] Each layer has: conventions → ### ${labels.templatePrefix}xxx → ### ${labels.antiPatterns}?
3. [ ] Templates are complete code skeletons from real code (NOT invented suggestions)?
4. [ ] ${tags.personal} ONLY on patterns seen in 5+ files or cross-project?
5. [ ] Single-project patterns tagged ${tags.project} (NOT ${tags.personal})?
6. [ ] Confidence tags ${tags.must}/${tags.recommended}/${tags.optional} present on each convention?
7. [ ] Every code example has a real file path?
8. [ ] Missing patterns marked "${noPatternText(outputLanguage)}" (NOT suggested frameworks)?
9. [ ] NO "推测" (speculate), "可能" (maybe), "未发现" (not found) used as rules?
10. [ ] No invented tool/framework names that don't appear in the code?
11. [ ] All improvement suggestions tagged ${tags.pending} and placed in ### ${labels.pendingSection} sections (not mixed with conventions)?
12. [ ] Deterministic evidence was used as the factual floor and unsupported claims were omitted or marked ${tags.pending}?
${fi ? `13. [ ] The user focus was used only as an inspection lens, not as evidence by itself?` : ""}
${retryMode ? `${fi ? "14" : "13"}. [ ] NO markdown code fences wrapping the entire output?` : ""}
${evidenceBlock}
All ${fi ? "13" : "12"}${retryMode ? `-${fi ? "14" : "13"}` : ""} pass: respond ONLY "PASS". Any failure: output only a concise list of failed layer IDs and reasons. Do not output a corrected SKILL.md.`,
  });
  let v = (
    await chatCompletion(config, {
      messages: compactValidationMessages(
        msgs[0],
        c,
        msgs[msgs.length - 1],
      ),
      temperature: 0.2,
      maxTokens: 8192,
    })
  ).trim();
  if (v.startsWith("PASS") || v.startsWith("pass")) return c.trim();
  if (v.startsWith("```markdown")) v = v.slice(11);
  else if (v.startsWith("```md")) v = v.slice(6);
  else if (v.startsWith("```")) v = v.slice(3);
  if (v.endsWith("```")) v = v.slice(0, -3);
  return c.trim();
}

interface LayerSpec {
  id: string;
  header: string;
  sections: string[];
  templateName: string;
  templateLanguage: string;
  templateHint: string;
}

async function generateSingleLayer(
  config: LLMConfig,
  opts: {
    messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }>;
    spec: LayerSpec;
    labels: ReturnType<typeof layerLabels>;
    tags: ReturnType<typeof tagLabels>;
    outputLanguage: CodingMemoryConfig["outputLanguage"];
    existingLayer?: string | null;
    previousLayers?: string[];
    samples?: { filePath: string; content: string }[];
  },
): Promise<string> {
  const {
    spec,
    labels,
    tags,
    outputLanguage,
    existingLayer,
    previousLayers,
    samples,
  } = opts;

  // Build cross-layer awareness: summarize what prior layers cover
  const priorContext =
    previousLayers && previousLayers.length > 0
      ? `\nPreviously generated layers (reference them, do NOT repeat their content):\n${previousLayers
          .map(
            (l, i) =>
              `Layer ${i + 1} (already written):\n${extractKeyPoints(l)}`,
          )
          .join("\n")}`
      : "";
  const existingLayerContext = existingLayer
    ? `\n## Existing ${spec.id} From Previous Learn\nUse this as merge context for this layer only:\n\`\`\`markdown\n${truncateMiddle(existingLayer, 6000)}\n\`\`\`\n\nUpdate policy:\n- Preserve existing conventions/templates that are still supported by current code evidence.\n- Add new current-code patterns.\n- Remove or downgrade outdated, speculative, or unsupported content.\n- Do not copy stale examples unless the referenced files/patterns still appear in current evidence.\n`
    : "";

  let content = (
    await chatCompletion(config, {
      messages: [
        ...opts.messages,
        {
          role: "user",
          content: `## Phase 3 — Generate ${spec.id}

Generate ONLY this one layer from the previous analysis. Do not output other layers.${priorContext}
${existingLayerContext}

${renderLayerSamples(samples || [])}

Required exact header:
${spec.header}

Required subsections:
${spec.sections.map((section) => `- ### ${section}`).join("\n")}
- ### ${labels.templatePrefix}${spec.templateName}
- ### ${labels.antiPatterns}
- ### ${labels.pendingSection}

Template requirements:
- Use a real code pattern from scanned files when available.
- If no reusable pattern exists, write "${noPatternText(outputLanguage)}".
- Keep code examples short and cite real file paths.
- Prefer the layer-relevant code evidence above when writing rules/templates.

Governance requirements:
- Tag conventions with ${tags.personal}/${tags.project} and confidence ${tags.must}/${tags.recommended}/${tags.optional}.
- Tag all suggestions with ${tags.pending} and keep them only under ### ${labels.pendingSection}.
- Do not invent tools/frameworks.
- Output ONLY markdown for ${spec.id}. No surrounding code fence.

Template hint:
\`\`\`${spec.templateLanguage}
${spec.templateHint}
\`\`\``,
        },
      ],
      temperature: 0.3,
      maxTokens: 4096,
    })
  ).trim();

  content = unwrapMarkdownFence(content);
  if (!content.startsWith(`## ${spec.id}`)) {
    content = `${spec.header}\n\n${content}`;
  }
  return content.trim();
}

function assembleSkillDocument(opts: {
  skillName: string;
  langDisplay: string;
  projectName: string;
  fileCount: number;
  projectOverviewLabel: string;
  techStackLabel: string;
  decisionHeuristicsLabel: string;
  changeLogLabel: string;
  outputLanguage: CodingMemoryConfig["outputLanguage"];
  isUpdate: boolean;
  layers: string[];
}): string {
  const isEnglish = opts.outputLanguage === "en";
  const layersText = opts.layers.join("\n\n---\n\n");

  // If any layer already contains a decision heuristics table, skip the placeholder
  const heuristicsHeader =
    opts.outputLanguage === "en" ? "Decision Heuristics" : "决策启发式";
  const hasHeuristics = new RegExp(
    `##\\s+${heuristicsHeader.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    "i",
  ).test(layersText);

  const heuristicsSection = hasHeuristics
    ? []
    : [
        "",
        `## ${opts.decisionHeuristicsLabel}`,
        isEnglish
          ? "| Scenario | Action | Reference Layer |"
          : "| 场景 | 做法 | 参考层 |",
        "|------|------|--------|",
        "",
      ];

  return [
    "---",
    `name: ${opts.skillName}`,
    `description: ${opts.langDisplay} coding style from ${opts.projectName}.`,
    "---",
    "",
    `# ${opts.skillName} · ${opts.langDisplay} ${isEnglish ? "Coding Style" : "编码风格"}`,
    `> ${opts.fileCount} files`,
    "",
    `## ${opts.projectOverviewLabel}`,
    "Generated from phased code analysis.",
    "",
    `## ${opts.techStackLabel}`,
    "| Tech | Use |",
    "|------|-----|",
    "",
    "---",
    "",
    layersText,
    "",
    "---",
    ...heuristicsSection,
    `## ${opts.changeLogLabel}`,
    opts.isUpdate
      ? "| [date] | merge | Updated |"
      : "| [date] | create | Initial |",
  ].join("\n");
}

function unwrapMarkdownFence(content: string): string {
  let out = content.trim();
  if (out.startsWith("```markdown")) out = out.slice(11);
  else if (out.startsWith("```md")) out = out.slice(6);
  else if (out.startsWith("```")) out = out.slice(3);
  if (out.endsWith("```")) out = out.slice(0, -3);
  return out.trim();
}

function splitExistingSkillByLayer(content: string): Map<string, string> {
  const out = new Map<string, string>();
  const matches = [...content.matchAll(/^##\s+(L[1-8])\b.*$/gm)];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const start = match.index ?? 0;
    const end =
      i + 1 < matches.length ? matches[i + 1].index ?? content.length : content.length;
    out.set(match[1], content.slice(start, end).trim());
  }
  return out;
}

function compactAnalysisMessages(
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>,
): Array<{
  role: "system" | "user" | "assistant";
  content: string;
}> {
  const system = messages[0];
  const assistants = messages.filter((m) => m.role === "assistant");
  const compactUser = {
    role: "user" as const,
    content: [
      "Use the prior analysis outputs below as the source for layer generation.",
      "Do not request or rely on the raw code listing; concrete file paths and evidence should already appear in the analysis.",
    ].join("\n"),
  };
  return [system, compactUser, ...assistants];
}

function compactValidationMessages(
  system: {
    role: "system" | "user" | "assistant";
    content: string;
  },
  skillContent: string,
  validationPrompt: {
    role: "system" | "user" | "assistant";
    content: string;
  },
): Array<{
  role: "system" | "user" | "assistant";
  content: string;
}> {
  return [
    system,
    {
      role: "assistant",
      content: skillContent,
    },
    validationPrompt,
  ];
}

function shouldUseLlmFileSelection(): boolean {
  return process.env.CODING_MEMORY_LLM_FILE_SELECTION === "1";
}

async function selectLayerFiles(
  config: LLMConfig,
  opts: {
    group: LanguageGroup;
    specs: LayerSpec[];
    evidence: string;
  },
): Promise<Record<string, string[]>> {
  const listing = renderFileListing(opts.group);
  const fallback = fallbackLayerFilePlan(opts.group, opts.specs);
  if (!listing.trim()) return fallback;

  try {
    const raw = await chatCompletion(config, {
      messages: [
        {
          role: "system",
          content:
            "Select source files for code evidence. Return only strict JSON. Do not invent paths.",
        },
        {
          role: "user",
          content: `For each L1-L8 layer, choose up to ${LAYER_MAX_FILES} files from this scanned file list that should be read as detailed evidence.

Rules:
- Return JSON object only, shape: {"L1":["path"],"L2":["path"],...,"L8":["path"]}.
- Use only exact paths from the file list.
- Prefer files that are likely to contain concrete implementation patterns.
- Include evidence-relevant files when useful.

${opts.evidence}

Scanned files:
${listing}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 8192,
      responseFormat: "json_object",
    });
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return mergeLayerFilePlans(
      fallback,
      sanitizeLayerFilePlan(parsed, opts.group),
      opts.specs,
    );
  } catch {
    return fallback;
  }
}

async function refineLayerFiles(
  config: LLMConfig,
  opts: {
    group: LanguageGroup;
    spec: LayerSpec;
    initialPaths: string[];
    previousLayers: string[];
    evidence: string;
  },
): Promise<string[]> {
  const fallback = opts.initialPaths.length
    ? opts.initialPaths
    : fallbackLayerFilePlan(opts.group, [opts.spec])[opts.spec.id] || [];
  const listing = renderFileListing(opts.group);
  const priorContext = opts.previousLayers.length
    ? opts.previousLayers
        .map(
          (layer, i) =>
            `Layer ${i + 1} (already written):\n${extractKeyPoints(layer)}`,
        )
        .join("\n")
    : "No previous layers yet.";

  try {
    const raw = await chatCompletion(config, {
      messages: [
        {
          role: "system",
          content:
            "Refine source file selection for one documentation layer. Return only strict JSON. Do not invent paths.",
        },
        {
          role: "user",
          content: `Layer to generate:
${opts.spec.header}

Initial selected files:
${fallback.length ? fallback.join("\n") : "(none)"}

Previously generated layer context:
${priorContext}

Task:
- Decide whether the initial selected files should change now that previous layer context is known.
- Return up to ${LAYER_MAX_FILES} exact paths from the scanned file list.
- Keep files that are still useful; add or replace files if they better support this layer.

Return JSON only, shape: {"files":["path"]}.

${opts.evidence}

Scanned files:
${listing}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 4096,
      responseFormat: "json_object",
    });
    const parsed = JSON.parse(raw) as { files?: unknown };
    const known = new Set(opts.group.files.map((file) => file.path));
    const refined = Array.isArray(parsed.files)
      ? parsed.files
          .filter((item): item is string => typeof item === "string")
          .filter((path) => known.has(path))
          .slice(0, LAYER_MAX_FILES)
      : [];
    return refined.length ? refined : fallback;
  } catch {
    return fallback;
  }
}

function renderFileListing(group: LanguageGroup): string {
  const lines = group.files
    .map((file) => `${file.path} (${file.language}, ${file.size} bytes)`)
    .sort();
  const out: string[] = [];
  let total = 0;
  for (const line of lines) {
    if (total + line.length + 1 > FILE_LISTING_CHAR_LIMIT) {
      out.push(`... ${lines.length - out.length} more file(s) omitted`);
      break;
    }
    out.push(line);
    total += line.length + 1;
  }
  return out.join("\n");
}

function sanitizeLayerFilePlan(
  parsed: Record<string, unknown>,
  group: LanguageGroup,
): Record<string, string[]> {
  const known = new Set(group.files.map((file) => file.path));
  const out: Record<string, string[]> = {};
  for (let i = 1; i <= 8; i++) {
    const layer = `L${i}`;
    const value = parsed[layer];
    if (!Array.isArray(value)) continue;
    out[layer] = value
      .filter((item): item is string => typeof item === "string")
      .filter((path) => known.has(path))
      .slice(0, LAYER_MAX_FILES);
  }
  return out;
}

function mergeLayerFilePlans(
  fallback: Record<string, string[]>,
  selected: Record<string, string[]>,
  specs: LayerSpec[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const spec of specs) {
    out[spec.id] = [
      ...new Set([...(selected[spec.id] || []), ...(fallback[spec.id] || [])]),
    ].slice(0, LAYER_MAX_FILES);
  }
  return out;
}

function fallbackLayerFilePlan(
  group: LanguageGroup,
  specs: LayerSpec[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const spec of specs) {
    out[spec.id] = group.files
      .filter((file) => layerFileScore(spec.id, file.path) > 0)
      .sort(
        (a, b) =>
          layerFileScore(spec.id, b.path) - layerFileScore(spec.id, a.path) ||
          a.size - b.size,
      )
      .slice(0, LAYER_MAX_FILES)
      .map((file) => file.path);
  }
  return out;
}

function prepareLayerSamples(
  group: LanguageGroup,
  spec: LayerSpec,
  selectedPaths: string[],
): { filePath: string; content: string }[] {
  const byPath = new Map(group.files.map((file) => [file.path, file]));
  const selected = selectedPaths
    .map((path) => byPath.get(path))
    .filter((file): file is LanguageGroup["files"][number] => !!file)
    .sort(
      (a, b) =>
        layerFileScore(spec.id, b.path) - layerFileScore(spec.id, a.path) ||
        a.size - b.size,
    );

  const samples: { filePath: string; content: string }[] = [];
  let total = 0;
  for (const file of selected) {
    if (samples.length >= LAYER_MAX_FILES || total >= LAYER_SAMPLE_BUDGET) {
      break;
    }
    const limit = isImportantLayerFile(spec.id, file.path)
      ? LAYER_IMPORTANT_FILE_CHAR_LIMIT
      : LAYER_FILE_CHAR_LIMIT;
    const remaining = LAYER_SAMPLE_BUDGET - total;
    const content = truncateMiddle(file.content, Math.min(limit, remaining));
    if (!content.trim()) continue;
    samples.push({ filePath: file.path, content });
    total += content.length;
  }
  return samples;
}

function renderLayerSamples(
  samples: { filePath: string; content: string }[],
): string {
  if (samples.length === 0) {
    return "## Layer-Relevant Code Evidence\nNo additional layer-specific source snippets were selected.";
  }
  return [
    "## Layer-Relevant Code Evidence",
    ...samples.map(
      (sample) =>
        `### ${sample.filePath}\n\`\`\`\n${sample.content}\n\`\`\``,
    ),
  ].join("\n\n");
}

function truncateMiddle(content: string, limit: number): string {
  if (content.length <= limit) return content;
  if (limit <= 1000) return content.slice(0, limit);
  const head = Math.floor(limit * 0.6);
  const tail = Math.max(0, limit - head - 38);
  return `${content.slice(0, head)}\n\n... (truncated) ...\n\n${content.slice(-tail)}`;
}

function layerFileScore(layerId: string, path: string): number {
  const p = path.toLowerCase();
  let score = 0;
  if (/package\.json|tsconfig|vite\.config|webpack|rollup|pom\.xml|build\.gradle|go\.mod|cargo\.toml/.test(p)) {
    score += layerId === "L1" || layerId === "L8" ? 8 : 2;
  }
  if (/(^|\/)(main|app|bootstrap|index)\.(ts|tsx|js|jsx|vue|java|go|rs)$/.test(p)) {
    score += layerId === "L1" || layerId === "L8" ? 8 : 3;
  }
  if (/(^|\/)(router|routes|pages|views|components)\//.test(p)) {
    score += layerId === "L1" ? 6 : layerId === "L4" ? 3 : 1;
  }
  if (/(^|\/)(api|apis|controller|controllers|service|services|facade|client|request)\//.test(p)) {
    score += layerId === "L2" ? 8 : layerId === "L4" ? 3 : 1;
  }
  if (/(type|types|interface|interfaces|dto|vo|do|entity|model|models|schema|enum)/.test(p)) {
    score += layerId === "L3" ? 8 : layerId === "L2" ? 3 : 1;
  }
  if (/(utils?|hooks?|composables?|middleware|interceptor|handler|factory|manager)/.test(p)) {
    score += layerId === "L4" || layerId === "L7" ? 6 : 1;
  }
  if (/(store|stores|pinia|redux|zustand|repository|repositories|mapper|dao|database|db|cache|redis)/.test(p)) {
    score += layerId === "L5" ? 8 : 1;
  }
  if (/(test|tests|__tests__|spec|mock|mocks|vitest|jest|playwright|cypress)/.test(p)) {
    score += layerId === "L6" ? 8 : 1;
  }
  if (/(\.env|application-|bootstrap|security|auth|permission|guard|config|configs|logger|logging)/.test(p)) {
    score += layerId === "L7" || layerId === "L8" ? 7 : 1;
  }
  return score;
}

function isImportantLayerFile(layerId: string, path: string): boolean {
  return layerFileScore(layerId, path) >= 8;
}

/** Extract ## and ### headers from a layer to give context to subsequent layers */
function extractKeyPoints(layer: string): string {
  const headers = layer.match(/^#{2,3}\s+.+/gm);
  if (!headers || headers.length === 0) return "(no headers)";
  return headers.slice(0, 8).join("\n");
}

function layerSpecs(
  outputLanguage: CodingMemoryConfig["outputLanguage"],
): LayerSpec[] {
  const labels = layerLabels(outputLanguage);
  if (outputLanguage === "en") {
    return [
      {
        id: "L1",
        header: labels.l1Header,
        sections: ["Directory Layout And File Naming", "Module Organization"],
        templateName: "New Project Structure",
        templateLanguage: "",
        templateHint: "[Minimal directory tree]",
      },
      {
        id: "L2",
        header: labels.l2Header,
        sections: [
          "Module Split Granularity",
          "API/Interface Design",
          "Dependency Organization",
        ],
        templateName: "New Module Skeleton",
        templateLanguage: "",
        templateHint: "[Module skeleton]",
      },
      {
        id: "L3",
        header: labels.l3Header,
        sections: ["Naming Conventions", "Type Usage", "Constant Management"],
        templateName: "Naming Example",
        templateLanguage: "",
        templateHint: "[Naming example]",
      },
      {
        id: "L4",
        header: labels.l4Header,
        sections: [
          "Function Design",
          "Error Handling",
          "Async/Concurrency",
          "Resource Management",
        ],
        templateName: "Typical Function",
        templateLanguage: "",
        templateHint: "[Input -> validate -> process -> error -> output]",
      },
      {
        id: "L5",
        header: labels.l5Header,
        sections: ["State Management", "Data Persistence", "Caching Strategy"],
        templateName: "Data Access",
        templateLanguage: "",
        templateHint: "[Data fetch + state + cache]",
      },
      {
        id: "L6",
        header: labels.l6Header,
        sections: [
          "Testing",
          "Lint/Formatting",
          "Docs And Comments",
          "Logging",
        ],
        templateName: "Test Skeleton",
        templateLanguage: "",
        templateHint: "[Test skeleton]",
      },
      {
        id: "L7",
        header: labels.l7Header,
        sections: ["Security", "Performance", "Configuration Management"],
        templateName: "No existing pattern",
        templateLanguage: "",
        templateHint: noPatternText(outputLanguage),
      },
      {
        id: "L8",
        header: labels.l8Header,
        sections: [
          "Build Tooling",
          "Package Management",
          "Application Bootstrap",
          "Environment Management",
          "Common Dependencies",
          "Git Conventions",
          "CI/CD",
        ],
        templateName: "Project Startup Commands",
        templateLanguage: "bash",
        templateHint: "[Scaffold commands]",
      },
    ];
  }

  return [
    {
      id: "L1",
      header: labels.l1Header,
      sections: ["目录结构与文件命名", "模块组织方式"],
      templateName: "新项目结构",
      templateLanguage: "",
      templateHint: "[最小目录树]",
    },
    {
      id: "L2",
      header: labels.l2Header,
      sections: ["模块拆分粒度", "API/接口设计", "依赖组织"],
      templateName: "新模块骨架",
      templateLanguage: "",
      templateHint: "[模块骨架]",
    },
    {
      id: "L3",
      header: labels.l3Header,
      sections: ["命名约定", "类型使用", "常量管理"],
      templateName: "命名示例",
      templateLanguage: "",
      templateHint: "[命名示例]",
    },
    {
      id: "L4",
      header: labels.l4Header,
      sections: ["函数设计", "错误处理", "异步/并发", "资源管理"],
      templateName: "典型函数",
      templateLanguage: "",
      templateHint: "[输入 -> 校验 -> 处理 -> 错误 -> 输出]",
    },
    {
      id: "L5",
      header: labels.l5Header,
      sections: ["状态管理", "数据持久化", "缓存策略"],
      templateName: "数据访问",
      templateLanguage: "",
      templateHint: "[数据请求 + 状态 + 缓存]",
    },
    {
      id: "L6",
      header: labels.l6Header,
      sections: ["测试", "Lint/格式化", "文档与注释", "日志"],
      templateName: "测试骨架",
      templateLanguage: "",
      templateHint: "[测试骨架]",
    },
    {
      id: "L7",
      header: labels.l7Header,
      sections: ["安全", "性能", "配置管理"],
      templateName: "无现有模式",
      templateLanguage: "",
      templateHint: noPatternText(outputLanguage),
    },
    {
      id: "L8",
      header: labels.l8Header,
      sections: [
        "构建工具",
        "包管理",
        "应用启动",
        "环境管理",
        "常用依赖",
        "Git 约定",
        "CI/CD",
      ],
      templateName: "项目启动命令",
      templateLanguage: "bash",
      templateHint: "[脚手架命令]",
    },
  ];
}

async function refineFocus(
  config: LLMConfig,
  raw: string,
  lang: string,
  outputLanguage: CodingMemoryConfig["outputLanguage"] = "zh",
): Promise<string> {
  return (
    await chatCompletion(config, {
      messages: [
        {
          role: "system",
          content:
            outputLanguage === "en"
              ? `Distill a free-text focus into 3-5 analysis points for ${lang} code. Output ONLY numbered English points.`
              : `Distill a free-text focus into 3-5 analysis points for ${lang} code. Output ONLY numbered Chinese points.`,
        },
        {
          role: "user",
          content:
            outputLanguage === "en"
              ? `The user wants to analyze: "${raw}". Distill it into 3-5 points.`
              : `用户想分析："${raw}"。提炼为 3-5 个要点。`,
        },
      ],
      temperature: 0.3,
      maxTokens: 4096,
    })
  ).trim();
}

function renderFocusBlock(
  focus: string,
  outputLanguage: CodingMemoryConfig["outputLanguage"],
  pending: string,
): string {
  if (outputLanguage === "en") {
    return `\n### User Focus (Inspection Lens Only)
${focus}

Focus policy:
- Use this focus only to inspect the scanned code more carefully.
- It is not evidence by itself and must not override deterministic evidence.
- If focused content is present in code, cite concrete files/snippets.
- If focused content is absent, write "${noPatternText(outputLanguage)}" or place a ${pending} item in the verification section.`;
  }

  return `\n### 用户关注点（仅作为检查镜头）
${focus}

关注点策略：
- 只用它来更仔细地检查已扫描代码。
- 它本身不是证据，不能覆盖确定性 evidence。
- 如果代码中存在相关模式，必须引用具体文件或片段。
- 如果代码中不存在相关模式，写"${noPatternText(outputLanguage)}"，或放入 ${pending} 待验证区。`;
}

function layerLabels(outputLanguage: CodingMemoryConfig["outputLanguage"]) {
  if (outputLanguage === "en") {
    return {
      l1Header: "## L1 · Project Skeleton",
      l2Header: "## L2 · Modules And Interfaces",
      l3Header: "## L3 · Naming And Types",
      l4Header: "## L4 · Implementation Patterns",
      l5Header: "## L5 · Data And State",
      l6Header: "## L6 · Quality Assurance",
      l7Header: "## L7 · Cross-Cutting Concerns",
      l8Header: "## L8 · Engineering And Bootstrap",
      l1Title: "L1 Project Skeleton",
      l2Title: "L2 Modules And Interfaces",
      l3Title: "L3 Naming And Types",
      l4Title: "L4 Implementation Patterns",
      l5Title: "L5 Data And State",
      l6Title: "L6 Quality Assurance",
      l7Title: "L7 Cross-Cutting Concerns",
      l8Title: "L8 Engineering And Bootstrap",
      templatePrefix: "Template: ",
      antiPatterns: "Anti-patterns",
      pendingSection: "To Verify",
      projectOverview: "Project Overview",
      techStack: "Tech Stack",
    };
  }
  return {
    l1Header: "## L1 · 项目骨架",
    l2Header: "## L2 · 模块与接口",
    l3Header: "## L3 · 命名与类型",
    l4Header: "## L4 · 实现模式",
    l5Header: "## L5 · 数据与状态",
    l6Header: "## L6 · 质量保障",
    l7Header: "## L7 · 横切关注点",
    l8Header: "## L8 · 工程化与启动",
    l1Title: "L1 项目骨架",
    l2Title: "L2 模块与接口",
    l3Title: "L3 命名与类型",
    l4Title: "L4 实现模式",
    l5Title: "L5 数据与状态",
    l6Title: "L6 质量保障",
    l7Title: "L7 横切关注点",
    l8Title: "L8 工程化与启动",
    templatePrefix: "模板：",
    antiPatterns: "反模式",
    pendingSection: "待验证",
    projectOverview: "项目概览",
    techStack: "技术栈",
  };
}

function tagLabels(outputLanguage: CodingMemoryConfig["outputLanguage"]) {
  if (outputLanguage === "en") {
    return {
      personal: "[Personal Preference]",
      project: "[Project-Specific]",
      pending: "[To Verify]",
      must: "[Must]",
      recommended: "[Recommended]",
      optional: "[Optional]",
    };
  }
  return {
    personal: "[个人偏好]",
    project: "[项目特定]",
    pending: "[待验证]",
    must: "[必须]",
    recommended: "[推荐]",
    optional: "[可选]",
  };
}

function pendingTag(
  outputLanguage: CodingMemoryConfig["outputLanguage"],
): string {
  return outputLanguage === "en" ? "[To Verify]" : "[待验证]";
}

function noPatternText(
  outputLanguage: CodingMemoryConfig["outputLanguage"],
): string {
  return outputLanguage === "en" ? "⚠️ No existing pattern" : "⚠️ 无现有模式";
}
