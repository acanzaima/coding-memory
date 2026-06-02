import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "coding-memory-e2e-home-"));
const outputDir = join(home, "skills");
process.env.CODING_MEMORY_HOME = home;

const { learnCommand } = await import("../dist/commands/learn.js");
const { writeConfig } = await import("../dist/config/manager.js");
const { writeModels } = await import("../dist/config/models.js");

const { server, url, requests } = await startMockServer();

try {
  writeConfig({
    skillsDir: outputDir,
    outputLanguage: "zh",
    include: ["**/*.ts", "**/*.vue", "**/*.json"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    maxFileSize: 1024 * 1024,
    respectGitignore: false,
  });
  writeModels({
    current: "mock",
    models: {
      mock: {
        provider: "openai-compatible",
        model: "mock-model",
        apiKey: "test-key",
        baseURL: url,
        temperature: 0,
        maxTokens: 4096,
      },
    },
  });

  await learnCommand("test/fixtures/vue3", "e2e-skill", {
    projectType: "vue3",
    focus: "Bootstrap 启动流程",
  });

  const typeDir = join(outputDir, "e2e-skill", "reference", "vue3");
  const expectedFiles = [
    "L1-项目骨架.md",
    "L2-模块与接口.md",
    "L3-命名与类型.md",
    "L4-实现模式.md",
    "L5-数据与状态.md",
    "L6-质量保障.md",
    "L7-横切关注点.md",
    "L8-工程化与启动.md",
    "OVERVIEW.md",
    "EVIDENCE.md",
    "EVIDENCE.json",
    "MANIFEST.json",
    "TRACE.json",
    "VERIFY.json",
    "RUNS.md",
  ];
  for (const file of expectedFiles) {
    assert.doesNotThrow(() => readFileSync(join(typeDir, file), "utf8"), file);
  }

  const evidence = JSON.parse(
    readFileSync(join(typeDir, "EVIDENCE.json"), "utf8"),
  );
  assert.equal(evidence.projectType, "vue3");
  assert.ok(
    evidence.items.some((item) => item.id === "frontend-api-facade"),
    "expected deterministic API evidence",
  );

  const skill = readFileSync(join(outputDir, "e2e-skill", "SKILL.md"), "utf8");
  assert.match(skill, /AI Agent Instructions/);
  assert.match(skill, /## 🔀 场景指南/);
  assert.match(skill, /\| 新增前端接口 \|/);
  assert.doesNotMatch(skill, /VO 类型/);
  assert.match(skill, /src\/stores\/modules/);
  assert.doesNotMatch(skill, /src\/store\/modules/);
  assert.doesNotMatch(skill, /- ####/);
  assert.doesNotMatch(skill, /- \*异步/);
  assert.doesNotMatch(skill, /\| Template \|/);
  assert.match(skill, /目录结构与文件命名[：:\s]+来自 test\/fixtures\/vue3/);
  const quality = readFileSync(join(outputDir, "e2e-skill", "QUALITY.md"), "utf8");
  assert.match(quality, /Evidence 证据项/);
  assert.match(quality, /PASS：所有项目类型都存在 evidence 报告/);
  assert.match(quality, /PASS：Gaps 外未发现推测性表达/);

  const lock = JSON.parse(readFileSync(join(home, "lock.json"), "utf8"));
  assert.equal(lock.skills["e2e-skill/vue3"].learnCount, 1);
  assert.equal(lock.skills["e2e-skill/vue3"].skillPath, "e2e-skill/reference/vue3/");
  const manifest = JSON.parse(readFileSync(join(typeDir, "MANIFEST.json"), "utf8"));
  assert.equal(manifest.layers.length, 8);
  for (const layer of manifest.layers) {
    assert.ok(layer.scope.length > 0, `expected ${layer.id} scope index`);
  }
  for (const layer of manifest.layers) {
    const layerContent = readFileSync(join(typeDir, layer.file), "utf8");
    assert.equal(
      (layerContent.match(/^###\s+(?:缺口|⚠️\s*Gaps|Gaps)\s*$/gm) || []).length,
      1,
      `expected one gaps section in ${layer.file}`,
    );
    assert.doesNotMatch(
      layerContent,
      /^##\s+(?:决策启发式|更新记录|Decision Heuristics|Change Log)\s*$/m,
      `expected document-level sections to stay out of ${layer.file}`,
    );
  }
  const trace = JSON.parse(readFileSync(join(typeDir, "TRACE.json"), "utf8"));
  assert.ok(trace.rules.length > 0, "expected structured rules");
  assert.ok(
    trace.rules.every((rule) => !/^####/.test(rule.text)),
    "expected trace rules to exclude heading-only fragments",
  );
  assert.ok(
    trace.templates.every((template) => !/^####|\*\*|\[/.test(template.name)),
    "expected normalized template names",
  );
  const verify = JSON.parse(readFileSync(join(typeDir, "VERIFY.json"), "utf8"));
  assert.equal(verify.ok, true);
  const runRoots = readdirSync(join(home, ".runs", "e2e-skill", "vue3"));
  assert.ok(runRoots.length >= 1, "expected learn run checkpoint");
  const runDir = join(home, ".runs", "e2e-skill", "vue3", runRoots[0]);
  const runManifest = JSON.parse(readFileSync(join(runDir, "manifest.json"), "utf8"));
  assert.equal(runManifest.metrics.llmRequests, 12);
  assert.equal(runManifest.metrics.conversationTurns, 12);
  assert.ok(
    typeof runManifest.metrics.llmDurationMs === "number",
    "expected aggregate LLM duration",
  );
  assert.doesNotThrow(() => readFileSync(join(runDir, "METRICS.json"), "utf8"));
  assert.doesNotThrow(() => readFileSync(join(runDir, "calls.jsonl"), "utf8"));
  const runsDoc = readFileSync(join(typeDir, "RUNS.md"), "utf8");
  assert.match(runsDoc, /学习运行记录/);
  assert.match(runsDoc, /模型耗时/);
  assert.match(runsDoc, /\| 12 \| 12 \| 0 \|/);
  assert.match(readFileSync(join(typeDir, "OVERVIEW.md"), "utf8"), /RUNS\.md/);
  const calls = readFileSync(join(runDir, "calls.jsonl"), "utf8");
  assert.equal(
    (calls.match(/"phase":"P4-validate"/g) || []).length,
    0,
    "expected healthy output to use local-first P4 validation",
  );
  assert.match(calls, /"durationMs":\d+/);

  assert.equal(
    requests.length,
    12,
    "expected focus refinement plus P0-P2 and 8 layer generation calls",
  );
  assert.ok(
    requests.some((req) =>
      req.messages.some((msg) => msg.content?.includes("Deterministic Evidence")),
    ),
    "expected evidence prompt to reach the mock LLM",
  );
  assert.ok(
    requests.some((req) =>
      req.messages.some(
        (msg) =>
          msg.content?.includes("用户关注点（仅作为检查镜头）") &&
          msg.content?.includes("它本身不是证据"),
      ),
    ),
    "expected focus to be constrained as an inspection lens",
  );

  writeFileSync(
    join(typeDir, "L1-项目骨架.md"),
    [
      "## L1 · 项目骨架",
      "### 目录结构与文件命名",
      "- OLD_L1_SENTINEL",
      "### 模板：新项目结构",
      "```",
      "src/",
      "```",
      "### 反模式",
      "- 避免绕过已存在结构。",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(typeDir, "L2-模块与接口.md"),
    [
      "## L2 · 模块与接口",
      "### API/接口设计",
      "- OLD_L2_SENTINEL",
      "### 模板：新模块骨架",
      "```",
      "export const oldApi = true",
      "```",
      "### 反模式",
      "- 避免绕过已存在结构。",
    ].join("\n"),
    "utf8",
  );

  const updateRequestsStart = requests.length;
  await learnCommand("test/fixtures/vue3", "e2e-skill", {
    projectType: "vue3",
  });
  const updateRequests = requests.slice(updateRequestsStart);
  const updateLock = JSON.parse(readFileSync(join(home, "lock.json"), "utf8"));
  assert.equal(updateLock.skills["e2e-skill/vue3"].learnCount, 2);
  const l2UpdateRequest = updateRequests.find((req) =>
    req.messages.some((msg) => msg.content?.includes("Phase 3 — Generate L2")),
  );
  assert.ok(l2UpdateRequest, "expected update request for L2");
  const l2UpdatePrompt = l2UpdateRequest.messages.map((msg) => msg.content || "").join("\n");
  assert.match(l2UpdatePrompt, /OLD_L2_SENTINEL/);
  assert.doesNotMatch(l2UpdatePrompt, /OLD_L1_SENTINEL/);
  assert.doesNotThrow(() => readFileSync(join(typeDir, ".previous", "TRACE.json"), "utf8"));

  const englishHome = mkdtempSync(join(tmpdir(), "coding-memory-e2e-en-"));
  const englishOutputDir = join(englishHome, "skills");
  process.env.CODING_MEMORY_HOME = englishHome;
  const englishRequestsStart = requests.length;
  try {
    writeConfig({
      skillsDir: englishOutputDir,
      outputLanguage: "en",
      include: ["**/*.ts", "**/*.vue", "**/*.json"],
      exclude: ["**/node_modules/**", "**/dist/**"],
      maxFileSize: 1024 * 1024,
      respectGitignore: false,
    });
    writeModels({
      current: "mock",
      models: {
        mock: {
          provider: "openai-compatible",
          model: "mock-model",
          apiKey: "test-key",
          baseURL: url,
          temperature: 0,
          maxTokens: 4096,
        },
      },
    });

    await learnCommand("test/fixtures/vue3", "e2e-en-skill", {
      projectType: "vue3",
    });

    const englishSkillDir = join(englishOutputDir, "e2e-en-skill");
    const englishQuality = readFileSync(join(englishSkillDir, "QUALITY.md"), "utf8");
    assert.match(englishQuality, /# Quality Report/);
    assert.match(englishQuality, /Evidence items:/);
    const englishEvidence = readFileSync(
      join(englishSkillDir, "reference", "vue3", "EVIDENCE.md"),
      "utf8",
    );
    assert.match(englishEvidence, /## Evidence Table/);
    assert.ok(
      requests
        .slice(englishRequestsStart)
        .some((req) =>
          req.messages.some((msg) =>
            msg.content?.includes("Write all generated SKILL content"),
          ),
        ),
      "expected English output instruction to reach the mock LLM",
    );
  } finally {
    rmSync(englishHome, { recursive: true, force: true });
    process.env.CODING_MEMORY_HOME = home;
  }

  const failHome = mkdtempSync(join(tmpdir(), "coding-memory-e2e-fail-"));
  const failOutputDir = join(failHome, "skills");
  process.env.CODING_MEMORY_HOME = failHome;
  process.env.CODING_MEMORY_FORCE_LLM_VALIDATION = "1";
  try {
    writeConfig({
      skillsDir: failOutputDir,
      outputLanguage: "zh",
      include: ["**/*.ts", "**/*.vue", "**/*.json"],
      exclude: ["**/node_modules/**", "**/dist/**"],
      maxFileSize: 1024 * 1024,
      respectGitignore: false,
    });
    writeModels({
      current: "mock-fail",
      models: {
        "mock-fail": {
          provider: "openai-compatible",
          model: "mock-fail",
          apiKey: "test-key",
          baseURL: url,
          temperature: 0,
          maxTokens: 4096,
        },
      },
    });

    await learnCommand("test/fixtures/vue3", "e2e-fail-skill", {
      projectType: "vue3",
    });
    const failVerify = JSON.parse(
      readFileSync(
        join(failOutputDir, "e2e-fail-skill", "reference", "vue3", "VERIFY.json"),
        "utf8",
      ),
    );
    assert.equal(failVerify.ok, false);
    assert.match(failVerify.errors.join("\n"), /LLM validation failed/);
    assert.equal(failVerify.llmValidation.ok, false);
  } finally {
    delete process.env.CODING_MEMORY_FORCE_LLM_VALIDATION;
    rmSync(failHome, { recursive: true, force: true });
    process.env.CODING_MEMORY_HOME = home;
  }

  const truncatedHome = mkdtempSync(join(tmpdir(), "coding-memory-e2e-truncated-"));
  const truncatedOutputDir = join(truncatedHome, "skills");
  process.env.CODING_MEMORY_HOME = truncatedHome;
  const truncatedRequestsStart = requests.length;
  try {
    writeConfig({
      skillsDir: truncatedOutputDir,
      outputLanguage: "zh",
      include: ["**/*.ts", "**/*.vue", "**/*.json"],
      exclude: ["**/node_modules/**", "**/dist/**"],
      maxFileSize: 1024 * 1024,
      respectGitignore: false,
    });
    writeModels({
      current: "mock-p1-length",
      models: {
        "mock-p1-length": {
          provider: "openai-compatible",
          model: "mock-p1-length",
          apiKey: "test-key",
          baseURL: url,
          temperature: 0,
          maxTokens: 4096,
        },
      },
    });

    await learnCommand("test/fixtures/vue3", "e2e-truncated-skill", {
      projectType: "vue3",
    });

    const truncatedRequests = requests.slice(truncatedRequestsStart);
    const p1Requests = truncatedRequests.filter((req) =>
      req.messages.at(-1)?.content?.includes("Phase 1 — Layers 1-4"),
    );
    assert.equal(p1Requests.length, 2, "expected P1 length response to be retried");
    assert.equal(p1Requests[0].max_tokens, 8192);
    assert.equal(p1Requests[1].max_tokens, 24576);
    const truncatedRunRoot = join(home, ".runs", "e2e-truncated-skill", "vue3");
    const truncatedCalls = readFileSync(
      join(
        truncatedRunRoot,
        readdirSync(truncatedRunRoot)[0],
        "calls.jsonl",
      ),
      "utf8",
    );
    assert.match(truncatedCalls, /"phase":"P1-explore".*"finishReason":"length"/);
    assert.match(truncatedCalls, /"phase":"P1-explore".*"maxTokens":24576/);
  } finally {
    rmSync(truncatedHome, { recursive: true, force: true });
    process.env.CODING_MEMORY_HOME = home;
  }

  const l8Home = mkdtempSync(join(tmpdir(), "coding-memory-e2e-l8-continue-"));
  const l8OutputDir = join(l8Home, "skills");
  process.env.CODING_MEMORY_HOME = l8Home;
  const l8RequestsStart = requests.length;
  try {
    writeConfig({
      skillsDir: l8OutputDir,
      outputLanguage: "zh",
      include: ["**/*.ts", "**/*.vue", "**/*.json"],
      exclude: ["**/node_modules/**", "**/dist/**"],
      maxFileSize: 1024 * 1024,
      respectGitignore: false,
    });
    writeModels({
      current: "mock-l8-length",
      models: {
        "mock-l8-length": {
          provider: "openai-compatible",
          model: "mock-l8-length",
          apiKey: "test-key",
          baseURL: url,
          temperature: 0,
          maxTokens: 4096,
        },
      },
    });

    await learnCommand("test/fixtures/vue3", "e2e-l8-continue-skill", {
      projectType: "vue3",
    });

    const l8TypeDir = join(l8OutputDir, "e2e-l8-continue-skill", "reference", "vue3");
    const l8Layer = readFileSync(join(l8TypeDir, "L8-工程化与启动.md"), "utf8");
    assert.equal((l8Layer.match(/^## L8\b/gm) || []).length, 1);
    assert.match(l8Layer, /### 证据/);
    assert.match(l8Layer, /### 缺口/);
    const l8Requests = requests.slice(l8RequestsStart);
    const l8GenerateRequests = l8Requests.filter((req) =>
      req.messages.at(-1)?.content?.includes("Phase 3 — Generate L8"),
    );
    const l8ContinueRequests = l8Requests.filter((req) =>
      req.messages.at(-1)?.content?.includes("response was truncated"),
    );
    assert.equal(l8GenerateRequests.length, 1, "expected no full L8 replay");
    assert.equal(l8ContinueRequests.length, 1, "expected one L8 continuation call");
    const l8RunRoot = join(home, ".runs", "e2e-l8-continue-skill", "vue3");
    const l8Calls = readFileSync(
      join(l8RunRoot, readdirSync(l8RunRoot)[0], "calls.jsonl"),
      "utf8",
    );
    assert.match(l8Calls, /"phase":"P3-L8".*"finishReason":"length"/);
    assert.match(l8Calls, /"phase":"P3-L8-continue"/);
  } finally {
    rmSync(l8Home, { recursive: true, force: true });
    process.env.CODING_MEMORY_HOME = home;
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
  rmSync(home, { recursive: true, force: true });
}

console.log("learn e2e test passed");

async function startMockServer() {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      requests.push(body);
      const response = responseFor(body);
      const content =
        typeof response === "string" ? response : response.content;
      const finishReason =
        typeof response === "string" ? undefined : response.finishReason;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [{ finish_reason: finishReason, message: { content } }],
        }),
      );
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    server,
    requests,
    url: `http://127.0.0.1:${address.port}/v1`,
  };
}

function responseFor(body) {
  const last = body.messages.at(-1)?.content || "";
  if (
    body.model === "mock-p1-length" &&
    last.includes("Phase 1 — Layers 1-4") &&
    body.max_tokens === 8192
  ) {
    return {
      content: "Mock analysis was truncated before completion.",
      finishReason: "length",
    };
  }
  if (
    body.model === "mock-l8-length" &&
    last.includes("Phase 3 — Generate L8")
  ) {
    return {
      content: partialL8Layer(),
      finishReason: "length",
    };
  }
  if (
    body.model === "mock-l8-length" &&
    last.includes("response was truncated")
  ) {
    return l8Continuation();
  }
  if (body.model === "mock-fail" && last.includes("Phase 4")) {
    return "FAIL\nL1: mocked validation failure";
  }
  if (last.includes("Phase 4")) return "PASS";
  const layerMatch = last.match(/Generate (L[1-8])\b/);
  if (layerMatch) return generatedLayer(layerMatch[1]);
  return "Mock analysis acknowledged deterministic evidence and code samples.";
}

function generatedLayer(id) {
  const map = {
    L1: ["项目骨架", "目录结构与文件命名", "新项目结构", "src/"],
    L2: ["模块与接口", "API/接口设计", "新模块骨架", "export const getUser = () => request.get('/user')"],
    L3: ["命名与类型", "命名约定", "命名示例", "interface UserVO { id: number }"],
    L4: ["实现模式", "函数设计", "典型函数", "const id = ref(1)"],
    L5: ["数据与状态", "状态管理", "数据访问", "defineStore('user', {})"],
    L6: ["质量保障", "测试", "测试骨架", "⚠️ 无现有模式。"],
    L7: ["横切关注点", "配置管理", "无现有模式", "⚠️ 无现有模式。"],
    L8: ["工程化与启动", "应用启动", "项目启动命令", "npm run dev"],
  };
  return layer(id, ...map[id]);
}

function partialL8Layer() {
  return [
    "## L8 · 工程化与启动",
    "### 范围",
    "工程化与启动 的范围说明，用于测试 L8 续写。",
    "### 规则",
    "- [项目特定] [必须] 应用启动 来自 test/fixtures/vue3。",
    "### 模板",
    "#### 项目启动命令",
    "```",
    "npm run dev",
    "```",
    "### 反模式",
    "- 避免绕过 package scripts。",
    "### 证",
  ].join("\n");
}

function l8Continuation() {
  return [
    "据",
    "- test/fixtures/vue3/package.json",
    "",
    "### 缺口",
    "",
    "#### 已观察风险",
    "- 无。",
    "",
    "#### 建议改进",
    "- 无。",
  ].join("\n");
}

function layer(id, title, convention, templateName, templateBody) {
  return [
    `## ${id} · ${title}`,
    "### 范围",
    `${title} 的范围说明，用于测试 prose scope 能进入 MANIFEST。`,
    `### ${convention}`,
    `- [项目特定] [必须] ${convention} 来自 test/fixtures/vue3。`,
    "### 模板",
    `#### ${templateName}`,
    "```",
    templateBody,
    "```",
    "### 反模式",
    "- 避免绕过已存在结构。",
    "",
    "### 缺口",
    "",
    "#### 已观察风险",
    "- 无。",
    "",
    "#### 建议改进",
    "- 无。",
    "",
    "---",
    "",
  ].join("\n");
}
