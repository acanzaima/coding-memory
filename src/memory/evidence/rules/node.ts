import { hasSecurityEvidence, isProductionFile } from "../helpers.js";
import type { EvidenceRule } from "../types.js";

export const nodeEvidenceRules: EvidenceRule[] = [
  {
    id: "express-route-handlers",
    layer: "L2",
    category: "API",
    summary: "Node 服务通过 Express/Koa/Fastify 路由或 controller 入口暴露 HTTP API。",
    test: (f) =>
      isProductionFile(f) &&
      /\.(ts|js|mts|mjs|cts|cjs)$/.test(f.path) &&
      (/\b(router|app)\.(get|post|put|patch|delete)\s*\(/.test(f.content) ||
        /\bfastify\.(get|post|put|patch|delete)\s*\(/.test(f.content) ||
        /(^|\/)(routes?|controllers?)\//i.test(f.path)),
  },
  {
    id: "nestjs-module-boundaries",
    layer: "L1",
    category: "Architecture",
    summary: "NestJS 服务通过 module/controller/service 文件和装饰器表达模块边界。",
    test: (f) =>
      isProductionFile(f) &&
      /\.(ts|js)$/.test(f.path) &&
      (/\.(module|controller|service)\.ts$/.test(f.path) ||
        /@(Module|Controller|Injectable)\s*\(/.test(f.content)),
    minHigh: 5,
    minMedium: 2,
  },
  {
    id: "node-dto-validation",
    layer: "L3",
    category: "Typing",
    summary: "Node/TypeScript 接口契约通过 DTO、schema 或运行时校验库表达。",
    test: (f) =>
      isProductionFile(f) &&
      /\.(ts|tsx|js|jsx)$/.test(f.path) &&
      (/(^|\/)(dto|schemas?|validators?)\//i.test(f.path) ||
        /\b(z\.object|Joi\.object|body\s*\(|param\s*\(|query\s*\(|class-validator|@Is[A-Z]\w*)/.test(
          f.content,
        )),
  },
  {
    id: "node-orm-repository",
    layer: "L5",
    category: "Persistence",
    summary: "Node 数据访问通过 ORM、repository、model 或 prisma/drizzle/schema 层集中处理。",
    test: (f) =>
      isProductionFile(f) &&
      /\.(ts|js|prisma)$/.test(f.path) &&
      (/(^|\/)(repositories?|models?|entities|prisma|drizzle|schema)\//i.test(
        f.path,
      ) ||
        /\b(PrismaClient|drizzle\s*\(|sequelize\.define|mongoose\.model|TypeORM|Repository<)\b/.test(
          f.content,
        )),
  },
  {
    id: "node-middleware-security",
    layer: "L7",
    category: "Security",
    summary: "Node 服务通过 middleware/guard/filter 或安全库集中处理认证、校验和横切逻辑。",
    test: (f) =>
      isProductionFile(f) &&
      /\.(ts|js|mts|mjs|cts|cjs)$/.test(f.path) &&
      (hasSecurityEvidence(f) ||
        /(^|\/)(middlewares?|guards?|interceptors?|filters?)\//i.test(f.path) ||
        /\b(passport|helmet|cors|authGuard|CanActivate|UseGuards|middleware)\b/i.test(
          f.content,
        )),
  },
];
