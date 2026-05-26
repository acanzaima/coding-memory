import { isProductionFile } from "../helpers.js";
import type { EvidenceRule } from "../types.js";

export const phpEvidenceRules: EvidenceRule[] = [
  {
    id: "php-mvc-routes",
    layer: "L2",
    category: "API",
    summary: "PHP 项目通过 routes/controller 或框架路由方法暴露 HTTP API。",
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".php" &&
      (/(^|\/)(routes|controllers?)\//i.test(f.path) ||
        /\bRoute::(get|post|put|patch|delete|resource)\s*\(/.test(
          f.content,
        ) ||
        /class\s+\w+Controller\b/.test(f.content)),
  },
  {
    id: "php-eloquent-models",
    layer: "L5",
    category: "Persistence",
    summary: "PHP 数据访问通过 Eloquent Model、migration 或 repository 层集中处理。",
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".php" &&
      (/(^|\/)(Models|migrations|Repositories)\//.test(f.path) ||
        /extends\s+Model\b|Schema::create|DB::table\s*\(/.test(f.content)),
  },
  {
    id: "php-request-validation",
    layer: "L7",
    category: "Security",
    summary: "PHP 输入校验通过 FormRequest、validate/rules 或中间件集中处理。",
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".php" &&
      (/(^|\/)(Requests|Middleware)\//.test(f.path) ||
        /function\s+rules\s*\(|->validate\s*\(|'required\|/.test(f.content)),
  },
];
