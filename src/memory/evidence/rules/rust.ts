import { isProductionFile } from "../helpers.js";
import type { EvidenceRule } from "../types.js";

export const rustEvidenceRules: EvidenceRule[] = [
  {
    id: "rust-crate-modules",
    layer: "L1",
    category: "Architecture",
    summary: "Rust crate 通过 lib/main、mod 声明和 src 子模块组织边界。",
    appliesTo: ["rust", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".rs" &&
      (/^src\/(lib|main)\.rs$/.test(f.path) || /^\s*(pub\s+)?mod\s+\w+;/m.test(f.content)),
    minHigh: 5,
    minMedium: 2,
  },
  {
    id: "rust-web-routes",
    layer: "L2",
    category: "API",
    summary: "Rust Web 服务通过 axum/actix/rocket 路由或 handler 函数暴露 HTTP API。",
    appliesTo: ["rust", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".rs" &&
      (/\b(Router::new|route\s*\(|get\s*\(|post\s*\(|HttpServer::new|App::new)\b/.test(
        f.content,
      ) ||
        /#\[(get|post|put|patch|delete|route)\(/.test(f.content)),
  },
  {
    id: "rust-result-error-flow",
    layer: "L7",
    category: "Reliability",
    summary: "Rust 实现通过 Result、? 操作符或 thiserror/anyhow 形成显式错误流。",
    appliesTo: ["rust", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".rs" &&
      (/\bResult<[^>]+>/.test(f.content) || /\banyhow::Result\b|\bthiserror\b/.test(f.content)) &&
      /\?;|\?\)/.test(f.content),
    minHigh: 8,
    minMedium: 3,
  },
  {
    id: "rust-serde-types",
    layer: "L3",
    category: "Typing",
    summary: "Rust 数据契约通过 struct/enum 与 serde 派生显式建模。",
    appliesTo: ["rust", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".rs" &&
      /#\[derive\([^)]*(Serialize|Deserialize)/.test(f.content) &&
      /\b(pub\s+)?(struct|enum)\s+\w+/.test(f.content),
  },
];
