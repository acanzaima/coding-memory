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
  const quality = readFileSync(join(outputDir, "e2e-skill", "QUALITY.md"), "utf8");
  assert.match(quality, /Evidence 证据项/);
  assert.match(quality, /PASS：所有项目类型都存在 evidence 报告/);

  const lock = JSON.parse(readFileSync(join(home, "lock.json"), "utf8"));
  assert.equal(lock.skills["e2e-skill/vue3"].learnCount, 1);
  assert.equal(lock.skills["e2e-skill/vue3"].skillPath, "e2e-skill/reference/vue3/");
  const manifest = JSON.parse(readFileSync(join(typeDir, "MANIFEST.json"), "utf8"));
  assert.equal(manifest.layers.length, 8);
  assert.ok(manifest.layers[0].scope.length > 0, "expected L1 scope index");
  const trace = JSON.parse(readFileSync(join(typeDir, "TRACE.json"), "utf8"));
  assert.ok(trace.rules.length > 0, "expected structured rules");
  const verify = JSON.parse(readFileSync(join(typeDir, "VERIFY.json"), "utf8"));
  assert.equal(verify.ok, true);
  const runRoots = readdirSync(join(home, ".runs", "e2e-skill", "vue3"));
  assert.ok(runRoots.length >= 1, "expected learn run checkpoint");
  const runDir = join(home, ".runs", "e2e-skill", "vue3", runRoots[0]);
  assert.doesNotThrow(() => readFileSync(join(runDir, "manifest.json"), "utf8"));
  assert.doesNotThrow(() => readFileSync(join(runDir, "calls.jsonl"), "utf8"));

  assert.equal(
    requests.length,
    13,
    "expected focus refinement plus P0-P2, 8 layer generation calls, and validation",
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
      const content = responseFor(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
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

function layer(id, title, convention, templateName, templateBody) {
  return [
    `## ${id} · ${title}`,
    `### ${convention}`,
    `- [项目特定] [必须] ${convention} 来自 test/fixtures/vue3。`,
    `### 模板：${templateName}`,
    "```",
    templateBody,
    "```",
    "### 反模式",
    "- 避免绕过已存在结构。",
    "",
    "### 待验证",
    "- 无。",
    "",
    "---",
    "",
  ].join("\n");
}
