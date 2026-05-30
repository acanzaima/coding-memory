# coding-memory 实现说明

本文档说明 coding-memory 的实现原理与关键设计细节。它位于 `docs/dev/`，作为公开仓库中的设计说明保留；npm 发布包只包含 `dist`、`README.md`、`README-en.md` 和 `LICENSE`。

## 整体流水线

`coding-memory learn` 被拆成一条小而明确的流水线：

1. `scanProject(projectRoot, config)` 按配置扫描文件，并按语言分组。
2. `buildLearnContext()` 将多个语言组合并为项目级输入，检测项目类型，读取已有 L1-L8，并收集确定性 Evidence。
3. `runGeneration()` 调用 LLM 版 `generateSkill()`。Evidence 会被渲染为 prompt 文本，并注入全部生成阶段。
4. `validateAndGovernLayers()` 拆分 L1-L8，结构异常时重试一次，并运行产物治理。
5. `writeLearningArtifacts()` 写入 L1-L8、`OVERVIEW.md`、`EVIDENCE.md`、`EVIDENCE.json`，并更新 `lock.json`。
6. `updateMasterArtifacts()` 重新生成顶层 `SKILL.md` 和 `QUALITY.md`。

## Evidence 层

Evidence 层是确定性的，不调用 LLM。

- `src/memory/evidence.ts` 是公共入口。
- `src/memory/evidence/types.ts` 定义证据报告和规则契约。
- `src/memory/evidence/helpers.ts` 放置共享的逐行检测逻辑。
- `src/memory/evidence/rules/vue.ts` 放置 Vue 单文件组件通用规则。
- `src/memory/evidence/rules/vue2.ts` / `vue3.ts` 分别放置 Vue2 Options API/Vuex 与 Vue3 Composition API/Pinia 规则。
- `src/memory/evidence/rules/frontend.ts` 放置前端 API facade、路由守卫、权限与构建配置规则。
- `src/memory/evidence/rules/react.ts` 放置 React/Next 规则。
- `src/memory/evidence/rules/java.ts` 放置 Java / Spring 规则。
- `src/memory/evidence/rules/node.ts`、`python.ts`、`go.ts`、`rust.ts`、`csharp.ts`、`php.ts`、`ruby.ts` 放置常见后端栈规则。
- `src/memory/evidence/rules/common.ts` 放置测试、环境、CI、容器等跨技术栈规则。

每条规则都是纯谓词：

```ts
test: (file: ScannedFile) => boolean
```

规则输出 `EvidenceItem`，包含层级、类别、摘要、置信度、命中文件和命中数量。置信度来自命中数量，而不是 LLM 的主观判断。

Evidence 有三个消费者：

- `renderEvidenceMarkdown()` 写出给人看的 `EVIDENCE.md`。
- `renderEvidenceJson()` 写出给质量报告读取的 `EVIDENCE.json`。
- `renderEvidencePrompt()` 作为“事实地板”喂给 `generateSkill()`。

## LLM 生成

`generateSkill()` 运行五个阶段：

1. 规划 L1-L8 覆盖面。
2. 探索 L1-L4。
3. 提取 L5-L8。
4. 合成完整 SKILL 内容。当前实现不是一次性要求模型输出完整 L1-L8，而是按 L1 → L8 逐层生成，再由本地代码确定性拼装。
5. 校验生成结果。

Evidence 会注入每个阶段。这并不等于对 LLM 输出做形式化证明，但它给模型提供了强事实锚点，能显著减少无依据推断。

逐层生成还有三层上下文控制：

- 每层只注入与该层相关的代码样本，默认由本地路径启发式选择。
- 后续层会收到前序层的标题摘要，用于跨层一致性，但不会重复全文。
- update 时会把旧 L1-L8 解析成按层 map，生成 L2 只注入旧 L2，生成 L7 只注入旧 L7，避免整份历史文档在每层膨胀。

可选的 `CODING_MEMORY_LLM_FILE_SELECTION=1` 会启用 LLM 文件选择/逐层 refinement。默认关闭，以减少真实项目 learn 的调用次数和耗时。

## 产物语言

`config.json` 中的 `outputLanguage` 控制生成产物语言：

- `zh`：默认值，生成中文产物。
- `en`：生成英文产物。

用户可以通过 CLI 设置：

```bash
coding-memory config --lang zh
coding-memory config --lang en
coding-memory config --dir D:/AI/memories
```

该设置会影响 LLM prompt、`OVERVIEW.md`、`EVIDENCE.md`、`SKILL.md` 和 `QUALITY.md`。`EVIDENCE.json` 保持结构化数据，不做翻译。

## 模型提供商配置

模型配置由三层协作完成：

- `src/llm/providers.ts` 定义可在交互式 `coding-memory config` 中选择的 provider preset、默认模型、默认 Base URL 和环境变量名。
- `src/commands/config.ts` 负责配置向导：选择 provider、填写模型 ID、API key、必要 Base URL，以及少数 provider 需要的额外字段。
- `src/llm/client.ts` 负责实际请求。当前客户端直接支持 OpenAI-compatible Chat Completions、Anthropic Messages API、Ollama / 本地兼容接口。

提供商预设遵循保守原则：

- 只把当前客户端能按上述协议直接调用的服务作为一键预设。
- Azure OpenAI、AWS Bedrock、Google Vertex AI、Cohere 等需要专用路径、专用鉴权或非 OpenAI Chat Completions 兼容请求的服务，不作为一键预设；如用户通过代理网关、私有服务或第三方兼容接口暴露为 OpenAI-compatible endpoint，应选择“自定义兼容接口”。
- 默认模型优先选择官方文档、平台模型列表或稳定公开接口中能确认的模型 ID；容易过期的快照、已下线模型和账号强绑定 endpoint 不作为默认值。
- 豆包 Ark 保留默认 Base URL，但模型参数通常来自控制台 endpoint/model ID，因此预设不提供默认模型，配置时要求用户手填。
- W&B Inference 需要项目维度 header，配置向导会收集 entity/project，并通过 `headers.OpenAI-Project` 写入模型配置。

`LLMConfig` 中有两个扩展点：

- `options`：透传到请求 body，用于 `thinking`、`reasoning_effort` 等 provider-specific 参数。
- `headers`：透传到 HTTP 请求头，用于 W&B 这类需要额外 header 的兼容服务。

## 产物治理

LLM 生成后，`learn.ts` 会运行治理流程：

- 将输出拆分为规范的 L1-L8 文件。
- 检查必要层级是否存在。
- 确保每层有模板章节。
- 将推测性语句移动到结构化 Gaps。
- 将不安全或缺少证据的模板降级为“无现有模式”。
- 将建议性内容和已观察规则分开。

治理层是保守的：当系统无法证明某个模板或工具确实存在于扫描代码中时，就不应把它提升为可直接使用的规则。

## Overview 与 Quality

`src/memory/overview.ts` 只读取生成后的 reference 文件，不调用 LLM。

`SKILL.md` 是压缩后的 AI 入口，包含：

- 精选 Type Rules；
- 显式 Hard Rules；
- 模板索引；
- 反模式；
- 场景指南；
- 学习历史。

`QUALITY.md` 是本地审计报告，追踪：

- 展示规则数 / 原始规则数；
- 隐藏模板；
- 缺失模板；
- 不安全模板；
- Gaps 外残留推测内容；
- Evidence 数量；
- Evidence 覆盖层数；
- 低置信度 Evidence 数量。

## 测试

当前发布门禁是：

```bash
npm test
```

它包含：

- provider 预设与 Base URL 测试；
- provider-specific headers 透传测试；
- 确定性 Evidence 测试；
- Vue3 与 Spring Boot fixture 扫描；
- `QUALITY.md` Evidence 指标测试；
- 基于 mock OpenAI-compatible LLM server 的 `learnCommand()` 端到端测试。

mock LLM 测试不证明模型质量。它保护的是主链路：prompt 接线、文件写入、lock 更新、Evidence 产物、顶层 `SKILL.md` / `QUALITY.md` 生成不被后续重构破坏。
