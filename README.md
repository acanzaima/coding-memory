<div align="center">

<img src="https://img.shields.io/badge/npm-coding--memory-blue?style=flat-square&logo=npm" alt="npm">
<img src="https://img.shields.io/badge/Node.js-%3E%3D18-green?style=flat-square&logo=node.js" alt="Node.js">
<img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT">
<img src="https://img.shields.io/badge/skills.sh-Compatible-green?style=flat-square" alt="Skills.sh Compatible">

</div>

# 🧠 coding-memory

> **把代码库变成 AI 可读的 Skill 记忆。** 扫描项目文件，让大模型学习代码中的模式与约定，生成可直接被 AI 编码助手调用的 SKILL.md。

English documentation: [README-en.md](README-en.md)

项目主页（GitHub Pages）：https://acanzaima.github.io/coding-memory/

不是复读代码，而是提炼代码中的**认知模式**、**架构约定**、**设计决策**和**反模式**。生成的 Skill 是一个**可运行的认知框架**。

---

## ✨ 为什么需要？

当 AI 编码助手（Claude Code、Cursor、Codex 等）进入你的项目时，它对你精心构建的架构一无所知：

| 没有 coding-memory | 有 coding-memory |
|---|---|
| AI 每次都要重新理解项目 | AI 加载 SKILL.md 即懂架构 |
| 生成的代码风格不一致 | 严格遵循项目约定 |
| 反复踩同样的坑 | 反模式已记录在案 |
| 无法利用深层设计意图 | 心智模型被提炼为可调用框架 |

---

## 🎯 设计灵感

参考社区中的两个优秀 Skill 项目：

- **[女娲.skill](https://github.com/alchaincyf/nuwa-skill)**：蒸馏思维 — 提炼心智模型、决策启发式、表达 DNA 和诚实边界
- **[达尔文.skill](https://github.com/alchaincyf/darwin-skill)**：棘轮机制 — 只保留改进、双重评估（结构+效果）、人在回路

coding-memory 将这些思路应用到代码库学习：扫描 → 提炼 → 生成 → 持续进化。

---

## 🧠 实现原理

coding-memory 不是简单把代码拼进 prompt，而是一条“确定性证据 + LLM 提炼 + 产物治理”的流水线：

1. **扫描代码库**：按配置读取源文件，识别语言、项目类型和关键文件。
2. **抽取 Evidence**：用可测试的规则先提取确定性事实，覆盖 Vue2/Vue3、React/Next、Node/NestJS、Java/Spring、Python、Go、Rust、.NET、PHP、Ruby、CI、容器与环境配置等常见模式。
3. **注入 LLM 生成**：把代码片段和 Evidence 一起交给 5 阶段生成流程；SYNTHESIZE 阶段按 L1-L8 逐层生成，并为每层注入相关代码样本，降低长输出截断风险。
4. **产物治理**：拆分 L1-L8，过滤推测性内容，降级不安全模板，把待验证内容归入 Gaps。
5. **质量报告**：生成 `SKILL.md`、`QUALITY.md`、`EVIDENCE.md/json`，让 AI 能读，也让人能审计。

---

## 📦 快速开始

```bash
npm install -g coding-memory

# 1. 交互式配置 LLM 模型（箭头键选择提供商，自由输入模型名）
coding-memory config

# 2. 测试连接
coding-memory test

# 3. 学习当前目录的项目
coding-memory learn -p .
```

`config` 和 `learn` 会自动初始化所需目录。

默认生成中文产物。如需生成英文产物：

```bash
coding-memory config --lang en
```

切回中文：

```bash
coding-memory config --lang zh
```

---

## 🔧 命令详解

### `coding-memory config`

交互式管理 LLM 模型和 API Key。支持 31+ 个预置提供商，可配置多个模型并快速切换；Ollama、LM Studio、vLLM 等本地/自托管提供商的 API Key 可留空。

```bash
# 交互式添加模型（箭头键选择提供商 → 输入模型名 → API Key/本地可留空 → 命名）
coding-memory config

# 查看所有已配置的模型
coding-memory config --list

# 设置生成产物语言（默认 zh）
coding-memory config --lang en

# 设置生成产物目录
coding-memory config --dir D:/AI/memories

# 删除指定模型
coding-memory config --rm deepseek-v3
```

内置预置提供商（持续从社区同步）：

| 分类 | 提供商 |
|------|--------|
| **官方直连** | OpenAI, Anthropic Claude, Google Gemini, DeepSeek, xAI Grok, Mistral AI, Cohere |
| **中国主流** | 智谱 GLM, 通义千问 Qwen, 月之暗面 Kimi, MiniMax, 豆包 |
| **聚合与高速推理** | OpenRouter, Groq, Together AI, Fireworks AI, Cerebras, Weights & Biases |
| **云平台** | Azure OpenAI, AWS Bedrock, Google Vertex AI |
| **本地/自托管** | Ollama, LM Studio, vLLM / SGLang |
| **自定义** | 任意 OpenAI 兼容接口 |

### `coding-memory use <name>`

切换当前激活的模型。

```bash
coding-memory use deepseek    # 切换到 deepseek 模型
coding-memory use             # 不带参数显示可选模型列表
```

### `coding-memory test`

测试当前激活模型的连接。

```bash
coding-memory test
# ✓ Connected — deepseek-v4-pro responded correctly
```

### `coding-memory learn`

扫描项目文件，调用 LLM 提炼编码风格，生成 8 层结构化 SKILL.md。

```bash
# 学习当前目录的项目（交互式选择已有 skill 或新建）
coding-memory learn

# 指定项目路径（支持多路径，空格或重复 -p 均可）
coding-memory learn -p ./my-app ./my-lib

# 指定 skill 名称（跳过交互式选择）
coding-memory learn starry-coding -p ./my-app

# 重点检查特定方向。--focus 只是“关注镜头”，不会绕过代码证据生成规则
coding-memory learn -p ./my-app -f "Bootstrap 启动流程"

# 指定项目类型（跳过自动检测）
coding-memory learn -p ./my-app --type react

# 预览模式 — 只扫描，不调 LLM
coding-memory learn -p ./my-app --dry-run
```

**学习流程**：5 阶段 Agent 流水线（PLAN → EXPLORE → EXTRACT → SYNTHESIZE → VALIDATE），合并所有检测到的语言生成一套项目维度的 L1-L8。SYNTHESIZE 会逐层生成，并把已生成的前序层摘要传给后续层，减少重复和截断。

`--focus` 适合在你觉得某类内容被遗漏时使用，例如“权限校验”“Bootstrap 启动流程”“异常处理”。它只会提高这些方向的检查优先级：如果代码中有证据，会进入对应规则或模板；如果没有证据，只会标记为“无现有模式”或进入“待验证”，不会凭空生成实践建议。

### `coding-memory status`

查看所有已学习的 skill，按 Skill 名称 → 项目类型 → 语言层级展示。

```bash
coding-memory status
```

输出示例：

```
  Skill              Proj Type      Language              Files   Projects  Last Updated
  ────────────────── ────────────── ──────────────────── ─────── ──────── ────────────
  starry-coding      vue3           Vue, JavaScript, CSS  81      2         2026-05-22

  Total: 1 skill(s), 1 project type(s), 1 language group(s)

  starry-coding
  → vue3: Vue, JavaScript, CSS, Markdown, HTML  (81 files, 2 projects)
```

---

## 🔄 增量学习与合并进化

重复执行 `learn` 会自动检测已有 skill 并合并进化：

```bash
coding-memory learn starry-coding -p ./project-a    # 第 1 次：创建
coding-memory learn starry-coding -p ./project-b    # 第 2 次：合并，learnCount: 2
```

每次合并时 LLM 会读取已有 L1-L8 与新代码。旧内容会按层注入：生成 L2 时只参考旧 L2，生成 L7 时只参考旧 L7。这样可以**保留仍被当前证据支持的内容** + **补充新发现** + **移除或降级过时模式**，同时避免把整份历史文档塞进每一层。

重新学习时终端会显示变更摘要：

```
  Change summary:
    + Rescanned 81 files in Vue, JavaScript, CSS, Markdown, HTML
    → Learn count: 2
      Review changes in reference/vue3/L1-*.md ... L8-*.md
```

---

## 📝 生成的 Skill 格式

采用 **8 层多文件架构**，按项目类型组织：

```
~/.coding-memory/<skillName>/
├── SKILL.md                       # AI 指令入口（🔒 硬规则 + 📐 模板索引 + 🚫 反模式）
├── QUALITY.md                     # 本地质量审计报告
└── reference/
    └── <projectType>/             # 自动检测（vue3, react, spring-boot...）
        ├── OVERVIEW.md            # 项目类型总述
        ├── EVIDENCE.md            # 确定性证据表
        ├── EVIDENCE.json          # 结构化证据，供 QUALITY.md 使用
        ├── L1-项目骨架.md         # 目录结构、文件命名、模块组织
        ├── L2-模块与接口.md       # 拆分粒度、依赖方向、API 设计
        ├── L3-命名与类型.md       # 命名约定、类型使用、常量管理
        ├── L4-实现模式.md         # 函数设计、错误处理、异步/并发
        ├── L5-数据与状态.md       # 状态管理、持久化、缓存
        ├── L6-质量保障.md         # 测试、Lint、文档、日志
        ├── L7-横切关注点.md       # 安全、性能、配置
        └── L8-工程化与启动.md     # 构建、包管理、启动、CI/CD
```

**SKILL.md 顶层**采用指令式格式，AI agent 可一次性读入：

```markdown
# AI Agent Instructions · starry-coding

## 🔒 Hard Rules
These patterns consistently appear across projects:
- 入口文件：每个模块必须有 index.ts 作为出口 [个人偏好]
- 组件内逻辑：通过 function useXxx() 内部 composable 抽离 [个人偏好]
...

## 📐 Code Templates
| Template | Type | Layer |
|----------|------|-------|
| 新项目结构 | vue3 | L1 |
...

## 🚫 Never Do
- 在 src/ 外创建顶级代码目录
- 组件缺少桶文件
...

## 🔀 Scenario Guide
| 场景 | 做法 | 参考层 |
|------|------|--------|
| 新建业务页面 | 在 views/ 创建，静态路由添加至 routingTable.js | L1, L2 |
...
```

每个 L1-L8 层文件包含：**约定 → 模板（从真实代码模式提取；无证据则标记“无现有模式”） → 反模式**。
约定标注了 `[个人偏好]` / `[项目特定]` 以及置信度 `[必须]` / `[推荐]` / `[可选]`。

---

## ⚙️ 配置文件

所有配置统一存储在 `~/.coding-memory/`（可通过环境变量 `CODING_MEMORY_HOME` 自定义路径）。

常用配置可以通过 CLI 修改：

```bash
coding-memory config --lang zh
coding-memory config --lang en
coding-memory config --dir D:/AI/memories
```

### `config.json` — 扫描设置

```json
{
  "skillsDir": "~/.coding-memory",
  "outputLanguage": "zh",
  "include": ["**/*.ts", "**/*.vue", "**/*.py", "**/*.json", "**/*.yml", "..."],
  "exclude": ["**/node_modules/**", "**/dist/**", "..."],
  "maxFileSize": 204800,
  "respectGitignore": true
}
```

### `models.json` — LLM 模型配置

```json
{
  "current": "deepseek",
  "models": {
    "deepseek": {
      "provider": "openai-compatible",
      "model": "deepseek-v4-pro",
      "apiKey": "sk-...",
      "baseURL": "https://api.deepseek.com",
      "temperature": 0.3,
      "maxTokens": 4096,
      "options": {
        "thinking": { "type": "enabled" },
        "reasoning_effort": "high"
      }
    }
  }
}
```

`options` 是 provider-specific 扩展区，例如 `thinking`、`reasoning_effort` 等；coding-memory 只会透传，不会在 `learn` 中替你改写。

### `lock.json` — Skill 追踪

```json
{
  "version": 2,
  "skills": {
    "starry-coding/vue3": {
      "name": "vue3",
      "language": "Vue, JavaScript, CSS, Markdown, HTML",
      "rawLanguages": ["vue", "javascript", "css", "markdown", "html"],
      "learnCount": 2,
      "sourceProjects": ["/path/to/project-a", "/path/to/project-b"],
      "sourceFiles": ["src/main.js", "src/App.vue", "..."],
      "skillPath": "starry-coding/reference/vue3/",
      "contentHash": "sha256-..."
    }
  }
}
```

---

## 🧩 编程式 API

```typescript
import {
  scanProject,
  generateSkill,
  readConfig,
  getCurrentModel,
  listSkills,
  readSkillsLock,
  generateMasterOverview,
} from 'coding-memory'

const config = readConfig()
const llm = getCurrentModel()

// 扫描项目，自动检测语言分组
const groups = scanProject('/path/to/project', config)

// 合并所有语言组，生成一次 L1-L8
const combinedGroup = {
  language: groups.map(g => g.language).join(', '),
  files: groups.flatMap(g => g.files),
  totalSize: groups.reduce((sum, g) => sum + g.totalSize, 0),
}
const skill = await generateSkill(llm!, {
  group: combinedGroup,
  skillName: 'my-skill',
  projectName: '/path/to/project',
  existingSkill: null,
  outputLanguage: config.outputLanguage,
})

// 生成顶层 AI 指令 SKILL.md（纯解析，无 LLM 调用）
const lock = readSkillsLock()
const overview = generateMasterOverview(
  lock,
  '~/.coding-memory/my-skill',
  '~/.coding-memory/my-skill/reference',
  'my-skill',
  config.outputLanguage,
)
```

---

## 🌍 语言检测

自动识别 TypeScript、JavaScript、Vue、Svelte、Python、Java、Kotlin、Go、Rust、C/C++、C#、Ruby、PHP、Swift、Shell、CSS/SCSS、HTML、Markdown、SQL、Docker、GraphQL 等 30+ 种语言/框架。

---

## 🏗️ 与 AI 编码助手配合

生成的 skill 可直接被 AI 编码助手加载：

```bash
# Claude Code
cp -r ~/.coding-memory/starry-coding ~/.claude/skills/

# 或通过 skills.sh
npx skills add ~/.coding-memory/starry-coding
```

兼容 Claude Code、Cursor、Codex、Aider、Continue 等标准 SKILL.md 格式。

---

## 📄 许可证

[MIT](LICENSE)
