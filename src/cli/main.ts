#!/usr/bin/env node

/**
 * coding-memory CLI — turn your codebase into AI-readable skills.
 */

import { resolve } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};
const icon = {
  ok: "\u2713",
  err: "\u2717",
  info: "\u2139",
  star: "\u2605",
  arrow: "\u2192",
};

function asString(
  v: string | boolean | string[] | undefined,
): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0) return v[v.length - 1];
  return undefined;
}

function asArray(v: string | boolean | string[] | undefined): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string")
    return v.includes(",")
      ? v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [v];
  return [];
}

/**
 * Auto-discover sub-projects within a directory.
 * A sub-project is a directory with a recognized project marker file.
 */
function discoverProjects(root: string): string[] {
  const markers = [
    "package.json",
    "Cargo.toml",
    "go.mod",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "Makefile",
    "CMakeLists.txt",
    "pyproject.toml",
    "setup.py",
    "setup.cfg",
    "Gemfile",
    "mix.exs",
    "pubspec.yaml",
  ];
  const results: string[] = [];

  // If root itself has a marker, it's a single project
  for (const m of markers) {
    if (existsSync(join(root, m))) return [root];
  }

  // Otherwise, scan one level deep for sub-projects
  try {
    const entries = readdirSync(root, { withFileTypes: true });
    for (const e of entries) {
      if (
        !e.isDirectory() ||
        e.name.startsWith(".") ||
        e.name === "node_modules"
      )
        continue;
      const sub = join(root, e.name);
      for (const m of markers) {
        if (existsSync(join(sub, m))) {
          results.push(sub);
          break;
        }
      }
    }
  } catch {
    /* permission errors, etc. */
  }

  // If no sub-projects found, return root as-is (might be a project without markers)
  return results.length > 0 ? results : [root];
}

function resolveProjectRoots(
  flags: Record<string, string | boolean | string[]>,
): string[] {
  const rawProject = asArray(flags.project);
  const rawP = asArray(flags.p);
  const rawPaths = [...rawProject, ...rawP];

  if (rawPaths.length > 0) {
    return rawPaths.flatMap((p) => discoverProjects(resolve(p)));
  }

  return discoverProjects(resolve(process.cwd()));
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Parse flags. Supports: repeated flags (-p a -p b), comma-separated (-p a,b)
  const flags: Record<string, string | boolean | string[]> = {};
  const positional: string[] = [];

  function setFlag(key: string, value: string | boolean | string[]) {
    const existing = flags[key];
    if (existing === undefined) {
      flags[key] = value;
    } else if (typeof value === "string") {
      const arr = asArray(existing);
      arr.push(value);
      flags[key] = arr;
    } else if (Array.isArray(value)) {
      // Merge arrays for multi-value flags
      const arr = asArray(existing);
      arr.push(...value);
      flags[key] = arr;
    }
  }

  /** Consume consecutive non-flag arguments starting at index `pos` */
  function consumeMultiValue(argv: string[], pos: number): string[] {
    const result: string[] = [];
    let j = pos + 1;
    while (j < argv.length && !argv[j].startsWith("-")) {
      result.push(argv[j]);
      j++;
    }
    return result;
  }

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > -1) {
        setFlag(a.slice(2, eq), a.slice(eq + 1));
      } else {
        const key = a.slice(2);
        if (key === "project") {
          // --project consumes all subsequent non-flag args
          const paths = consumeMultiValue(args, i);
          if (paths.length > 0) {
            setFlag(key, paths);
            i += paths.length;
          } else setFlag(key, true);
        } else {
          const next = args[i + 1];
          if (next && !next.startsWith("-")) {
            setFlag(key, next);
            i++;
          } else setFlag(key, true);
        }
      }
    } else if (a.startsWith("-") && a.length > 1) {
      const key = a.slice(1);
      if (key === "p" || key === "project") {
        // -p consumes all subsequent non-flag args
        const paths = consumeMultiValue(args, i);
        if (paths.length > 0) {
          setFlag(key, paths);
          i += paths.length;
        } else setFlag(key, true);
      } else {
        const next = args[i + 1];
        if (next && !next.startsWith("-")) {
          setFlag(key, next);
          i++;
        } else setFlag(key, true);
      }
    } else {
      positional.push(a);
    }
  }

  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  )
    return showHelp();
  if (command === "--version" || command === "-v" || command === "version") {
    const pkg = await import("../../package.json", { with: { type: "json" } });
    console.log(pkg.default.version);
    return;
  }

  try {
    switch (command) {
      case "config": {
        const { configCommand } = await import("../commands/config.js");
        await configCommand({
          list: !!(flags.list || flags.ls),
          remove: asString(flags.remove) || asString(flags.rm),
          outputLanguage: asString(flags.lang) || asString(flags.language),
          skillsDir: asString(flags.dir),
        });
        break;
      }

      case "use": {
        if (!positional[0]) {
          console.log(`${c.red}Usage: coding-memory use <name>${c.reset}`);
          const { listModels, readModels } =
            await import("../config/models.js");
          const models = listModels();
          if (models.length > 0) {
            const cur = readModels().current;
            console.log(`\n  Available models:`);
            for (const m of models) {
              const mark =
                m.name === cur
                  ? ` ${c.yellow}${icon.star} active${c.reset}`
                  : "";
              console.log(
                `    ${c.cyan}${m.name}${c.reset}${mark} ${c.dim}\u2192 ${m.provider} / ${m.model}${c.reset}`,
              );
            }
          } else {
            console.log(
              `\n  No models configured. Run ${c.cyan}coding-memory config${c.reset} to add one.`,
            );
          }
          process.exit(1);
        }
        const { switchModel, getCurrentModel } =
          await import("../config/models.js");
        if (switchModel(positional[0])) {
          const cfg = getCurrentModel();
          console.log(
            `${c.green}${icon.ok}${c.reset} Using ${c.cyan}${positional[0]}${c.reset}`,
          );
          if (cfg)
            console.log(
              `  ${c.dim}${icon.arrow} ${cfg.provider} / ${cfg.model}${c.reset}`,
            );
        } else {
          console.log(
            `${c.red}${icon.err}${c.reset} Model "${positional[0]}" not found.`,
          );
          console.log(
            `Run ${c.cyan}coding-memory config --list${c.reset} to see configured models.`,
          );
          process.exit(1);
        }
        break;
      }

      case "test": {
        const { getCurrentModel } = await import("../config/models.js");
        const cfg = getCurrentModel();
        if (!cfg) {
          console.log(
            `${c.red}${icon.err}${c.reset} No active model configured.`,
          );
          console.log(
            `Run ${c.cyan}coding-memory config${c.reset} to set one up.`,
          );
          process.exit(1);
        }
        const { testConnection } = await import("../llm/client.js");
        console.log(
          `${c.dim}Testing ${c.cyan}${cfg.model}${c.reset}${c.dim} (${cfg.provider})...${c.reset}`,
        );
        const result = await testConnection(cfg);
        if (result.ok) {
          console.log(`${c.green}${icon.ok} Connected${c.reset}`);
          console.log(
            `  ${c.dim}${icon.arrow} ${cfg.provider} / ${cfg.model}${c.reset}`,
          );
          console.log(`  ${c.dim}${result.message}${c.reset}`);
        } else {
          console.log(`${c.red}${icon.err} Failed${c.reset}`);
          console.log(`  ${c.dim}${result.message.slice(0, 200)}${c.reset}`);
          process.exit(1);
        }
        break;
      }

      case "learn": {
        const { learnCommand, chooseSkill } =
          await import("../commands/learn.js");
        // Resolve skill name once for all projects
        let skillName = positional[0] || undefined;
        if (!skillName) {
          const chosen = await chooseSkill();
          if (!chosen) return; // user cancelled
          skillName = chosen;
        }
        const projectRoots = resolveProjectRoots(flags);
        // Support multiple projects
        for (const projRoot of projectRoots) {
          if (projectRoots.length > 1) {
            console.log(`\n${c.bold}${c.cyan}  ${projRoot}${c.reset}`);
          }
          await learnCommand(projRoot, skillName, {
            dryRun: !!(flags["dry-run"] || flags.d),
            focus: asString(flags.focus) || asString(flags.f),
            projectType: asString(flags.type),
          });
        }
        break;
      }

      case "status":
      case "ls": {
        const { statusCommand } = await import("../commands/status.js");
        await statusCommand();
        break;
      }

      default:
        console.log(`${c.red}Unknown command: ${command}${c.reset}`);
        console.log(`Run ${c.bold}coding-memory --help${c.reset} for usage.`);
        process.exit(1);
    }
  } catch (err) {
    console.log(
      `\n${c.red}${icon.err} Error:${c.reset} ${err instanceof Error ? err.message : String(err)}`,
    );
    if (flags.debug || flags.verbose) console.error(err);
    process.exit(1);
  }
}

async function showHelp() {
  const r = c.reset;
  const state = await readHelpState();
  const languageLabel = state.outputLanguage === "en" ? "English" : "中文";
  const modelLabel = state.activeModel
    ? `${c.cyan}${state.activeModel}${r}`
    : `${c.yellow}未配置${r} ${c.dim}(先运行 coding-memory config)${r}`;

  console.log(`
${c.bold}${c.cyan}  coding-memory${r}
${c.dim}  把代码库学习成 AI 可读、证据驱动的工程记忆。${r}

${c.bold}当前状态${r}
  模型      ${modelLabel}
  产物目录  ${c.cyan}${state.skillsDir}${r}
  产物语言  ${c.cyan}${languageLabel}${r}

${c.bold}常用流程${r}
  ${c.green}coding-memory config${r}                         ${c.dim}交互式配置模型和 API Key${r}
  ${c.green}coding-memory config --dir D:/AI/memories${r}     ${c.dim}设置生成产物目录${r}
  ${c.green}coding-memory config --lang en${r}                ${c.dim}切换产物语言，默认 zh${r}
  ${c.green}coding-memory test${r}                           ${c.dim}测试当前模型连接${r}
  ${c.green}coding-memory learn <skill> -p <project>${r}      ${c.dim}学习指定项目${r}
  ${c.green}coding-memory status${r}                         ${c.dim}查看已学习的 skill${r}

${c.bold}命令${r}
  ${c.cyan}config${r}              配置模型、产物目录、产物语言
  ${c.cyan}use${r}  <name>         切换当前激活模型
  ${c.cyan}test${r}                测试当前模型连接
  ${c.cyan}learn${r} [name]        扫描项目并生成/更新 coding memory
  ${c.cyan}status${r}              查看所有已学习的 skill

${c.bold}config 选项${r}
  ${c.yellow}--list, --ls${r}          列出所有模型
  ${c.yellow}--remove${r}, ${c.yellow}--rm${r} ${c.dim}<name>${r}  删除模型
  ${c.yellow}--lang${r} ${c.dim}<zh|en>${r}        设置生成产物语言
  ${c.yellow}--dir${r} ${c.dim}<path>${r}          设置生成产物目录

${c.bold}learn 选项${r}
  ${c.yellow}--project${r}, ${c.yellow}-p${r} ${c.dim}<path...>${r} 指定项目路径；支持多路径并自动发现子项目
  ${c.yellow}--focus${r}, ${c.yellow}-f${r} ${c.dim}<text>${r}   证据优先的关注提示；只强化检查，不凭空生成规则
  ${c.yellow}--type${r} ${c.dim}<name>${r}          覆盖自动检测的项目类型，如 vue3、react、spring-boot
  ${c.yellow}--dry-run${r}, ${c.yellow}-d${r}       只预览扫描结果，不调用 LLM

${c.bold}示例${r}
  ${c.green}$ coding-memory learn${r}                          ${c.dim}交互选择 skill，学习当前目录${r}
  ${c.green}$ coding-memory learn starry -p ./app ./api${r}    ${c.dim}把多个项目学习到同一个 skill${r}
  ${c.green}$ coding-memory learn -p ./app -f "权限与启动流程"${r} ${c.dim}重点检查某个方向，仍以代码证据为准${r}
  ${c.green}$ coding-memory learn -p ./app --type vue3${r}     ${c.dim}手动指定项目类型${r}

${c.bold}文件位置${r}
  ${c.dim}~/.coding-memory/config.json${r}   ${c.dim}全局扫描设置、产物目录、产物语言${r}
  ${c.dim}~/.coding-memory/models.json${r}   ${c.dim}模型和 API Key 配置${r}
  ${c.dim}${state.skillsDir}/<skill>/SKILL.md${r}         ${c.dim}AI 入口说明${r}
  ${c.dim}${state.skillsDir}/<skill>/reference/${r}       ${c.dim}分层证据、规则和质量报告${r}
${c.dim}  环境变量 CODING_MEMORY_HOME 可覆盖默认 ~/.coding-memory 目录${r}
`);
}

async function readHelpState(): Promise<{
  skillsDir: string;
  outputLanguage: "zh" | "en";
  activeModel: string | null;
}> {
  try {
    const [{ readConfig, getSkillsDir }, { getCurrentModel, readModels }] =
      await Promise.all([
        import("../config/manager.js"),
        import("../config/models.js"),
      ]);
    const config = readConfig();
    const model = getCurrentModel();
    const models = readModels();
    return {
      skillsDir: getSkillsDir(config),
      outputLanguage: config.outputLanguage,
      activeModel: model
        ? `${models.current} (${model.provider} / ${model.model})`
        : null,
    };
  } catch {
    return {
      skillsDir: "~/.coding-memory",
      outputLanguage: "zh",
      activeModel: null,
    };
  }
}

main();
