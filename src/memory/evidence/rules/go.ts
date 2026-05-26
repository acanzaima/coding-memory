import { isProductionFile } from "../helpers.js";
import type { EvidenceRule } from "../types.js";

export const goEvidenceRules: EvidenceRule[] = [
  {
    id: "go-package-boundaries",
    layer: "L1",
    category: "Architecture",
    summary: "Go 项目通过 cmd/internal/pkg 等目录约定表达可执行入口和内部包边界。",
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".go" &&
      /(^|\/)(cmd|internal|pkg)\//.test(f.path),
    minHigh: 8,
    minMedium: 3,
  },
  {
    id: "go-http-handlers",
    layer: "L2",
    category: "API",
    summary: "Go 服务通过 handler/router 目录、net/http 或常见 Web 框架暴露 HTTP API。",
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".go" &&
      (/(^|\/)(handlers?|routers?|api)\//i.test(f.path) ||
        /\b(http\.HandleFunc|http\.NewServeMux|gin\.Default|echo\.New|fiber\.New|chi\.NewRouter)\b/.test(
          f.content,
        )),
  },
  {
    id: "go-error-context",
    layer: "L7",
    category: "Reliability",
    summary: "Go 实现中显式传递 context 并对错误进行早返回处理。",
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".go" &&
      /\bcontext\.Context\b/.test(f.content) &&
      /if\s+err\s*!=\s*nil\s*\{/.test(f.content),
    minHigh: 8,
    minMedium: 3,
  },
  {
    id: "go-persistence-layer",
    layer: "L5",
    category: "Persistence",
    summary: "Go 数据访问通过 repository/store/model 或 database/sql、gorm、sqlc 等层收敛。",
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".go" &&
      (/(^|\/)(repositories?|stores?|models?)\//i.test(f.path) ||
        /\b(sql\.DB|gorm\.DB|sqlc|QueryContext|ExecContext)\b/.test(
          f.content,
        )),
  },
];
