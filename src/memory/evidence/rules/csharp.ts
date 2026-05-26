import { isProductionFile } from "../helpers.js";
import type { EvidenceRule } from "../types.js";

export const csharpEvidenceRules: EvidenceRule[] = [
  {
    id: "dotnet-controller-contract",
    layer: "L2",
    category: "API",
    summary: ".NET 服务通过 Controller、Minimal API 或路由特性暴露 HTTP API。",
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".cs" &&
      (/\[(ApiController|Route|HttpGet|HttpPost|HttpPut|HttpDelete)\]/.test(
        f.content,
      ) ||
        /\bapp\.Map(Get|Post|Put|Patch|Delete)\s*\(/.test(f.content) ||
        /Controller\s*:\s*ControllerBase/.test(f.content)),
  },
  {
    id: "dotnet-service-di",
    layer: "L1",
    category: "Architecture",
    summary: ".NET 项目通过 Program/Startup 的依赖注入注册组织服务边界。",
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".cs" &&
      /(^|\/)(Program|Startup)\.cs$/.test(f.path) &&
      /\bservices\.Add(Scoped|Singleton|Transient)|builder\.Services\.Add/.test(
        f.content,
      ),
  },
  {
    id: "dotnet-efcore-persistence",
    layer: "L5",
    category: "Persistence",
    summary: ".NET 数据访问通过 DbContext、DbSet 或 repository 层集中处理。",
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".cs" &&
      (/\bDbContext\b|\bDbSet<|UseSql(Server|ite)|UseNpgsql/.test(f.content) ||
        /(^|\/)(Repositories?|Data|Entities|Models)\//i.test(f.path)),
  },
  {
    id: "dotnet-validation-auth",
    layer: "L7",
    category: "Security",
    summary: ".NET 横切关注点通过授权特性、认证中间件或数据校验特性集中处理。",
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".cs" &&
      (/\[(Authorize|AllowAnonymous|Required|StringLength|MaxLength)\]/.test(
        f.content,
      ) ||
        /\bUseAuthentication\s*\(|\bUseAuthorization\s*\(/.test(f.content)),
  },
];
