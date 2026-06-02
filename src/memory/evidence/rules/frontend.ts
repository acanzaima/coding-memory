import { hasSecurityEvidence, isProductionFile } from "../helpers.js";
import type { EvidenceRule } from "../types.js";

const scriptExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".vue"]);

function isScriptLike(extension: string): boolean {
  return scriptExtensions.has(extension);
}

function isApiFacadePath(path: string): boolean {
  return (
    /(^|\/)(api|apis|services?)\//i.test(path) ||
    /(^|\/)(request|http|axios|client)\.(ts|tsx|js|jsx)$/.test(path)
  );
}

export const frontendEvidenceRules: EvidenceRule[] = [
  {
    id: "frontend-api-facade",
    layer: "L2",
    category: "API",
    summary: "前端接口调用集中通过 API/facade 文件封装，而不是在组件中散落请求细节。",
    appliesTo: ["frontend", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      isScriptLike(f.extension) &&
      isApiFacadePath(f.path) &&
      (/from\s+['"]@\/config\/axios['"]|request\.(get|post|put|patch|delete)|axios\.(get|post|put|patch|delete)|fetch\s*\(/.test(
          f.content,
        ) ||
        /(^|\/)(api|apis|services?)\//i.test(f.path)),
  },
  {
    id: "frontend-route-guards",
    layer: "L7",
    category: "Routing",
    summary: "前端路由层包含导航守卫、鉴权跳转或权限元信息处理。",
    appliesTo: ["frontend", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      isScriptLike(f.extension) &&
      (/(^|\/)(router|routes|permission)\//i.test(f.path) ||
        /\b(beforeEach|beforeResolve|loader|redirect|Navigate)\b/.test(
          f.content,
        )) &&
      /\b(auth|token|permission|role|requiresAuth|meta)\b/i.test(f.content),
  },
  {
    id: "frontend-permission-controls",
    layer: "L7",
    category: "Security",
    summary: "前端权限控制通过指令、权限组件或统一工具收敛在横切层。",
    appliesTo: ["frontend", "mixed"],
    test: (f) => isProductionFile(f) && hasSecurityEvidence(f),
  },
  {
    id: "frontend-build-config",
    layer: "L8",
    category: "Build",
    summary: "前端工程通过 Vite/Webpack/Next/Nuxt 等配置文件集中管理构建与别名。",
    appliesTo: ["frontend", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      /(^|\/)(vite|webpack|next|nuxt|svelte|astro)\.config\.(ts|js|mjs|cjs)$/.test(
        f.path,
      ),
  },
];
