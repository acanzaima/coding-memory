# coding-memory

> Turn your codebase into AI-readable Skill memory. Scan project files, let an LLM learn coding patterns and conventions, and generate SKILL.md artifacts that AI coding agents can load directly.

Chinese documentation: [README.md](README.md)

Website: https://acanzaima.github.io/coding-memory/

coding-memory does not merely summarize code. It extracts cognitive patterns, architecture conventions, design decisions, templates, and anti-patterns from an existing codebase.

## Why

When an AI coding assistant enters your project, it usually has no memory of your architecture or taste. coding-memory creates a reusable project memory so agents can:

- understand project structure faster,
- follow local conventions,
- avoid repeated anti-patterns,
- reuse proven templates,
- carry design intent across sessions.

## Design Inspiration

Inspired by two excellent community Skill projects:

- **[Nuwa.skill](https://github.com/alchaincyf/nuwa-skill)**: distillation of thinking patterns, decision heuristics, expression DNA, and honest boundaries.
- **[Darwin.skill](https://github.com/alchaincyf/darwin-skill)**: iterative improvement, dual evaluation, and human-in-the-loop ratcheting.

coding-memory applies those ideas to codebase learning: scan, distill, generate, and keep evolving.

## How It Works

coding-memory uses an evidence-driven generation pipeline:

1. **Scan** source files and detect languages/project type.
2. **Extract Evidence** with deterministic rules across common stacks: Vue2/Vue3, React/Next, Node/NestJS, Java/Spring, Python, Go, Rust, .NET, PHP, Ruby, CI, containers, and environment config.
3. **Generate With LLM** using source snippets and deterministic Evidence as the factual floor. The SYNTHESIZE phase generates L1-L8 one layer at a time with layer-relevant code samples to reduce long-output truncation risk.
4. **Govern Artifacts** by splitting L1-L8, filtering speculative content, downgrading unsafe templates, and grouping unverified suggestions into Gaps.
5. **Report Quality** through `SKILL.md`, `QUALITY.md`, `EVIDENCE.md/json`, structured sidecars, and per-run metrics.

## Quick Start

```bash
npm install -g coding-memory

coding-memory config
coding-memory test
coding-memory learn -p .
```

Generated artifacts default to Chinese. To generate English artifacts:

```bash
coding-memory config --lang en
```

Switch back to Chinese:

```bash
coding-memory config --lang zh
```

## Commands

### `coding-memory config`

Configure LLM models and API keys interactively. API keys are optional for local/self-hosted providers such as Ollama, LM Studio, and vLLM.

```bash
coding-memory config
coding-memory config --list
coding-memory config --lang en
coding-memory config --dir D:/AI/memories
coding-memory config --rm deepseek-v3
```

Built-in provider presets are grouped by access mode rather than subjective model ranking:

| Category | Providers |
|----------|-----------|
| **Official Direct** | OpenAI, Anthropic Claude, Google Gemini, DeepSeek, xAI Grok, Mistral AI |
| **China Mainstream** | Zhipu GLM, Qwen, Moonshot Kimi, MiniMax, Doubao |
| **Aggregators And Fast Inference** | OpenRouter, Groq, Together AI, Fireworks AI, Cerebras, Weights & Biases |
| **Local/Self-hosted** | Ollama, LM Studio, vLLM / SGLang |
| **Custom Connection** | Proxy gateways, private services, or third-party compatible APIs; enter your own Base URL and model ID |

The default list focuses on common services that are easy to configure out of the box. Enterprise cloud deployments, private services, proxy gateways, and third-party compatible APIs often use their own address, model names, and account rules; choose Custom Connection and fill in the values from your provider.

### `coding-memory use <name>`

Switch the active model.

```bash
coding-memory use deepseek
```

### `coding-memory test`

Test the active model connection.

```bash
coding-memory test
```

### `coding-memory learn`

Scan project files and generate a structured coding memory.

```bash
coding-memory learn
coding-memory learn -p ./my-app ./my-lib
coding-memory learn starry-coding -p ./my-app
coding-memory learn -p ./my-app -f "Bootstrap flow"
coding-memory learn -p ./my-app --type react
coding-memory learn -p ./my-app --dry-run
coding-memory learn -p ./my-app --resume
```

`--focus` is an evidence-first inspection lens. It is useful when you want coding-memory to look more carefully at a topic such as bootstrap flow, auth, or error handling. It does not override deterministic evidence: if matching code exists, the output cites concrete files/snippets; if it does not, the topic is marked as no existing pattern or moved to verification.

Repeated `learn` runs update the same `skillName/projectType` entry. Existing L1-L8 content is injected by matching layer: generating L2 sees the previous L2, generating L7 sees the previous L7, and so on. The model is instructed to preserve still-supported content, add newly observed patterns, and remove or downgrade stale/speculative material.

`--resume` continues the latest compatible learn run from saved checkpoints. Each run records `manifest.json`, layer checkpoints, and `calls.jsonl` diagnostics under `~/.coding-memory/.runs/`. Generated `RUNS.md` summarizes per-learn duration, LLM request time, request count, conversation turns, retries, and token usage.

### `coding-memory inspect`

Inspect generated `MANIFEST.json`, `TRACE.json`, and verification status.

```bash
coding-memory inspect my-skill
coding-memory inspect my-skill --type vue3 --layer L4
```

### `coding-memory verify`

Run deterministic local verification over generated artifacts.

```bash
coding-memory verify my-skill
coding-memory verify my-skill --strict
```

### `coding-memory diff`

Compare the latest generated `TRACE.json` with the previous learn snapshot.

```bash
coding-memory diff my-skill
coding-memory diff my-skill --type vue3
```

### `coding-memory status`

Show learned skills.

```bash
coding-memory status
```

## Generated Structure

```text
~/.coding-memory/<skillName>/
├── SKILL.md
├── QUALITY.md
└── reference/
    └── <projectType>/
        ├── OVERVIEW.md
        ├── EVIDENCE.md
        ├── EVIDENCE.json
        ├── MANIFEST.json
        ├── TRACE.json
        ├── VERIFY.json
        ├── RUNS.md
        ├── L1-项目骨架.md
        ├── L2-模块与接口.md
        ├── L3-命名与类型.md
        ├── L4-实现模式.md
        ├── L5-数据与状态.md
        ├── L6-质量保障.md
        ├── L7-横切关注点.md
        └── L8-工程化与启动.md
```

`SKILL.md` is the compact AI entry point. The reference files keep detailed layer evidence and generated conventions.

Each L1-L8 layer follows a stable schema: `Scope`, `Rules`, `Templates`, `Anti-patterns`, `Evidence`, and `Gaps`. New structured sidecars are written beside the markdown: `MANIFEST.json` indexes layer topics and counts, `TRACE.json` maps extracted rules/templates to evidence where possible, and `VERIFY.json` stores the local audit result.

Human-facing Markdown reports such as `QUALITY.md` and `EVIDENCE.md` display generated times in local time. JSON sidecars and `.runs` diagnostics keep UTC ISO timestamps for stable sorting and machine audit.

## Configuration

All configuration lives under `~/.coding-memory/`.

Common settings can be updated from the CLI:

```bash
coding-memory config --lang zh
coding-memory config --lang en
coding-memory config --dir D:/AI/memories
```

```json
{
  "skillsDir": "~/.coding-memory",
  "outputLanguage": "zh",
  "include": ["**/*.ts", "**/*.vue", "**/*.py", "**/*.json", "**/*.yml"],
  "exclude": ["**/node_modules/**", "**/dist/**"],
  "maxFileSize": 204800,
  "respectGitignore": true
}
```

`options` is the advanced parameter area for fields such as `thinking` or `reasoning_effort`; coding-memory passes it through during `learn` and does not rewrite it. A few services require extra request headers; add them as `headers` in the same model entry.

Example `models.json` entry:

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

## Programmatic API

```ts
import {
  scanProject,
  generateSkill,
  readConfig,
  getCurrentModel,
  readSkillsLock,
  generateMasterOverview,
} from "coding-memory";

const config = readConfig();
const llm = getCurrentModel();
const groups = scanProject("/path/to/project", config);

const combinedGroup = {
  language: groups.map((g) => g.language).join(", "),
  files: groups.flatMap((g) => g.files),
  totalSize: groups.reduce((sum, g) => sum + g.totalSize, 0),
};

const skill = await generateSkill(llm!, {
  group: combinedGroup,
  skillName: "my-skill",
  projectName: "/path/to/project",
  existingSkill: null,
  outputLanguage: config.outputLanguage,
});

const lock = readSkillsLock();
const overview = generateMasterOverview(
  lock,
  "~/.coding-memory/my-skill",
  "~/.coding-memory/my-skill/reference",
  "my-skill",
  config.outputLanguage,
);
```

## License

[MIT](LICENSE)
