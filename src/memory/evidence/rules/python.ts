import { isProductionFile } from "../helpers.js";
import type { EvidenceRule } from "../types.js";

export const pythonEvidenceRules: EvidenceRule[] = [
  {
    id: "python-api-routes",
    layer: "L2",
    category: "API",
    summary: "Python 服务通过 FastAPI/Flask/Django 路由、view 或 router 暴露 HTTP API。",
    appliesTo: ["python", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".py" &&
      (/(@(?:app|router|bp)\.(get|post|put|patch|delete|route)\s*\(|APIView|ViewSet|path\s*\(|re_path\s*\()/.test(
        f.content,
      ) ||
        /(^|\/)(views|routers?|api)\.py$/.test(f.path)),
  },
  {
    id: "python-schema-models",
    layer: "L3",
    category: "Typing",
    summary: "Python 数据契约通过 Pydantic、dataclass、serializer 或 ORM model 显式建模。",
    appliesTo: ["python", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".py" &&
      (/\b(BaseModel|Serializer|dataclass|SQLModel|models\.Model)\b/.test(
        f.content,
      ) ||
        /(^|\/)(schemas?|serializers?|models)\.py$/.test(f.path)),
  },
  {
    id: "python-service-boundaries",
    layer: "L1",
    category: "Architecture",
    summary: "Python 代码按 app/service/repository/router 等职责目录组织模块边界。",
    appliesTo: ["python", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".py" &&
      /(^|\/)(app|apps|services?|repositories?|routers?|blueprints|handlers)\//i.test(
        f.path,
      ),
    minHigh: 8,
    minMedium: 3,
  },
  {
    id: "python-persistence-layer",
    layer: "L5",
    category: "Persistence",
    summary: "Python 数据访问通过 ORM session、repository、model 或 migration 层集中处理。",
    appliesTo: ["python", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".py" &&
      (/(^|\/)(repositories?|models|migrations)\//i.test(f.path) ||
        /\b(Session|sessionmaker|db\.session|select\s*\(|models\.Model|alembic)\b/.test(
          f.content,
        )),
  },
];
