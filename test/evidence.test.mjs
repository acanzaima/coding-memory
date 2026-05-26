import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectEvidence,
  renderEvidenceJson,
  renderEvidenceMarkdown,
  renderEvidencePrompt,
} from "../dist/memory/evidence.js";
import { generateQualityReport } from "../dist/memory/overview.js";
import { scanProject } from "../dist/scanner/file-scanner.js";

const scanConfig = {
  skillsDir: ".coding-memory",
  include: [
    "**/*.ts",
    "**/*.vue",
    "**/*.java",
    "**/*.xml",
    "**/*.yml",
    "**/.env*",
  ],
  exclude: ["**/node_modules/**", "**/dist/**", "**/target/**"],
  maxFileSize: 1024 * 1024,
  respectGitignore: false,
};

const group = {
  language: "typescript, vue, java",
  totalSize: 1000,
  files: [
    {
      path: "src/api/user/index.ts",
      language: "typescript",
      extension: ".ts",
      size: 120,
      content: "import request from '@/config/axios'; export const getUser = () => request.get('/user')",
    },
    {
      path: "src/views/User.vue",
      language: "vue",
      extension: ".vue",
      size: 120,
      content: "<template><div /></template><script setup lang=\"ts\">import { ref, computed } from 'vue'; const id = ref(1)</script>",
    },
    {
      path: "src/store/modules/user.ts",
      language: "typescript",
      extension: ".ts",
      size: 120,
      content: "import { defineStore } from 'pinia'; export const useUserStore = defineStore('user', {})",
    },
    {
      path: "legacy/components/User.vue",
      language: "vue",
      extension: ".vue",
      size: 120,
      content: "<template><div /></template><script>export default { data() { return {} }, methods: { save() {} } }</script>",
    },
    {
      path: "legacy/store/index.js",
      language: "javascript",
      extension: ".js",
      size: 120,
      content: "import Vuex from 'vuex'; export default new Vuex.Store({ state: {}, mutations: {} })",
    },
    {
      path: "pom.xml",
      language: "xml",
      extension: ".xml",
      size: 120,
      content: "<project><modules><module>app</module></modules></project>",
    },
    {
      path: "src/main/java/demo/UserController.java",
      language: "java",
      extension: ".java",
      size: 120,
      content: "@RestController class UserController { @GetMapping String get() { return \"ok\"; } }",
    },
    {
      path: "src/main/java/demo/UserDO.java",
      language: "java",
      extension: ".java",
      size: 120,
      content: "@Data class UserDO { private Long id; }",
    },
    {
      path: "src/app.module.ts",
      language: "typescript",
      extension: ".ts",
      size: 120,
      content: "@Module({ controllers: [UserController], providers: [UserService] }) export class AppModule {}",
    },
    {
      path: "src/users/user.controller.ts",
      language: "typescript",
      extension: ".ts",
      size: 120,
      content: "@Controller('users') export class UserController { @Get() list() {} }",
    },
    {
      path: "src/users/dto/create-user.dto.ts",
      language: "typescript",
      extension: ".ts",
      size: 120,
      content: "import { IsString } from 'class-validator'; export class CreateUserDto { @IsString() name!: string }",
    },
    {
      path: "src/prisma/schema.prisma",
      language: "other",
      extension: ".prisma",
      size: 120,
      content: "model User { id Int @id }",
    },
    {
      path: "app/routers/users.py",
      language: "python",
      extension: ".py",
      size: 120,
      content: "from fastapi import APIRouter\nrouter = APIRouter()\n@router.get('/users')\ndef list_users(): return []",
    },
    {
      path: "app/schemas.py",
      language: "python",
      extension: ".py",
      size: 120,
      content: "from pydantic import BaseModel\nclass User(BaseModel):\n    id: int",
    },
    {
      path: "internal/handlers/user.go",
      language: "go",
      extension: ".go",
      size: 120,
      content: "package handlers\nimport \"net/http\"\nfunc Register() { http.HandleFunc(\"/users\", func(w http.ResponseWriter, r *http.Request) {}) }",
    },
    {
      path: "internal/store/user.go",
      language: "go",
      extension: ".go",
      size: 120,
      content: "package store\nimport \"database/sql\"\ntype Store struct { db *sql.DB }",
    },
    {
      path: "src/lib.rs",
      language: "rust",
      extension: ".rs",
      size: 120,
      content: "pub mod users;\n#[derive(serde::Serialize, serde::Deserialize)] pub struct User { id: i64 }",
    },
    {
      path: "src/routes.rs",
      language: "rust",
      extension: ".rs",
      size: 120,
      content: "use axum::{Router, routing::get}; pub fn app() -> Router { Router::new().route(\"/users\", get(list)) } async fn list() {}",
    },
    {
      path: "Program.cs",
      language: "csharp",
      extension: ".cs",
      size: 120,
      content: "builder.Services.AddScoped<IUserService, UserService>(); app.MapGet(\"/users\", () => new [] {}); app.UseAuthorization();",
    },
    {
      path: "routes/api.php",
      language: "php",
      extension: ".php",
      size: 120,
      content: "<?php Route::get('/users', [UserController::class, 'index']);",
    },
    {
      path: "app/Models/User.php",
      language: "php",
      extension: ".php",
      size: 120,
      content: "<?php class User extends Model {}",
    },
    {
      path: "config/routes.rb",
      language: "ruby",
      extension: ".rb",
      size: 120,
      content: "Rails.application.routes.draw do\n  resources :users\nend",
    },
    {
      path: "app/models/user.rb",
      language: "ruby",
      extension: ".rb",
      size: 120,
      content: "class User < ApplicationRecord\nend",
    },
    {
      path: ".github/workflows/ci.yml",
      language: "config",
      extension: ".yml",
      size: 120,
      content: "steps:\n  - uses: actions/checkout@v4\n  - run: npm test",
    },
  ],
};

const report = collectEvidence(group, "mixed-fixture");
const ids = report.items.map((item) => item.id);

assert.equal(report.projectType, "mixed-fixture");
assert.ok(ids.includes("frontend-api-facade"));
assert.ok(ids.includes("vue-single-file-components"));
assert.ok(ids.includes("vue2-options-api"));
assert.ok(ids.includes("vue2-vuex-state"));
assert.ok(ids.includes("vue3-composition-api"));
assert.ok(ids.includes("vue3-pinia-state"));
assert.ok(ids.includes("spring-module-boundaries"));
assert.ok(ids.includes("spring-controller-contract"));
assert.ok(ids.includes("java-dto-vo-do-naming"));
assert.ok(ids.includes("lombok-models"));
assert.ok(ids.includes("nestjs-module-boundaries"));
assert.ok(ids.includes("node-dto-validation"));
assert.ok(ids.includes("node-orm-repository"));
assert.ok(ids.includes("python-api-routes"));
assert.ok(ids.includes("python-schema-models"));
assert.ok(ids.includes("go-http-handlers"));
assert.ok(ids.includes("go-persistence-layer"));
assert.ok(ids.includes("rust-crate-modules"));
assert.ok(ids.includes("rust-web-routes"));
assert.ok(ids.includes("rust-serde-types"));
assert.ok(ids.includes("dotnet-controller-contract"));
assert.ok(ids.includes("dotnet-service-di"));
assert.ok(ids.includes("dotnet-validation-auth"));
assert.ok(ids.includes("php-mvc-routes"));
assert.ok(ids.includes("php-eloquent-models"));
assert.ok(ids.includes("ruby-rails-routes"));
assert.ok(ids.includes("ruby-active-record-models"));
assert.ok(ids.includes("ci-workflows"));

const markdown = renderEvidenceMarkdown(report);
assert.match(markdown, /证据表/);
assert.match(markdown, /src\/api\/user\/index\.ts/);
assert.match(markdown, /前端接口调用集中通过 API\/facade 文件封装/);

const prompt = renderEvidencePrompt(report);
assert.match(prompt, /Deterministic Evidence/);
assert.match(prompt, /factual floor/);

const vueGroups = scanProject("test/fixtures/vue3", scanConfig);
const vueReport = collectEvidence(combineGroups(vueGroups), "vue3");
const vueIds = vueReport.items.map((item) => item.id);
assert.deepEqual(
  pick(vueIds, [
    "frontend-api-facade",
    "vue-single-file-components",
    "vue3-pinia-state",
    "vue3-composition-api",
    "vue3-router-bootstrap",
    "env-config",
  ]),
  [
    "env-config",
    "frontend-api-facade",
    "vue-single-file-components",
    "vue3-composition-api",
    "vue3-pinia-state",
    "vue3-router-bootstrap",
  ],
);

const springGroups = scanProject("test/fixtures/spring-boot", scanConfig);
const springReport = collectEvidence(combineGroups(springGroups), "spring-boot");
const springIds = springReport.items.map((item) => item.id);
assert.deepEqual(
  pick(springIds, [
    "spring-module-boundaries",
    "spring-controller-contract",
    "java-dto-vo-do-naming",
    "lombok-models",
    "mapper-persistence",
    "validation-security",
    "env-config",
  ]),
  [
    "env-config",
    "java-dto-vo-do-naming",
    "lombok-models",
    "mapper-persistence",
    "spring-controller-contract",
    "spring-module-boundaries",
    "validation-security",
  ],
);
assert.ok(
  springGroups
    .flatMap((g) => g.files)
    .some((f) => f.path === "src/test/java/demo/UserControllerTest.java"),
);

const tempRoot = mkdtempSync(join(tmpdir(), "coding-memory-quality-"));
try {
  const refDir = join(tempRoot, "reference");
  const vueDir = join(refDir, "vue3");
  mkdirSync(vueDir, { recursive: true });
  writeFileSync(join(vueDir, "EVIDENCE.json"), renderEvidenceJson(vueReport), "utf8");
  writeFileSync(
    join(vueDir, "L1-项目骨架.md"),
    [
      "## L1 · 项目骨架",
      "### 目录结构与文件命名",
      "- [项目特定] [必须] src/api 集中 API 调用。",
      "### 模板：无现有模式",
      "⚠️ 无现有模式。",
      "### 反模式",
      "- 避免在组件中散落 request 调用。",
    ].join("\n"),
    "utf8",
  );

  const quality = generateQualityReport(
    {
      version: 2,
      skills: {
        "fixture/vue3": {
          name: "vue3",
          language: "Vue, TypeScript",
          rawLanguages: ["vue", "typescript"],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          learnCount: 1,
          sourceProjects: ["fixture-vue3"],
          sourceFiles: [],
          skillPath: "fixture/reference/vue3/",
          contentHash: "fixture",
        },
      },
    },
    tempRoot,
    refDir,
    "fixture",
  );

  assert.match(quality, /Evidence 证据项/);
  assert.match(quality, /\| vue3 \| 1 \|/);
  assert.match(quality, /PASS：所有项目类型都存在 evidence 报告/);
  assert.match(quality, /已提取确定性证据/);

  const qualityEn = generateQualityReport(
    {
      version: 2,
      skills: {
        "fixture/vue3": {
          name: "vue3",
          language: "Vue, TypeScript",
          rawLanguages: ["vue", "typescript"],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          learnCount: 1,
          sourceProjects: ["fixture-vue3"],
          sourceFiles: [],
          skillPath: "fixture/reference/vue3/",
          contentHash: "fixture",
        },
      },
    },
    tempRoot,
    refDir,
    "fixture",
    "en",
  );
  assert.match(qualityEn, /Evidence items:/);
  assert.match(qualityEn, /PASS: evidence reports are present/);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log("evidence and quality tests passed");

function combineGroups(groups) {
  return {
    language: groups.map((g) => g.language).join(", "),
    files: groups.flatMap((g) => g.files),
    totalSize: groups.reduce((sum, g) => sum + g.totalSize, 0),
  };
}

function pick(values, allowlist) {
  return values.filter((value) => allowlist.includes(value)).sort();
}
