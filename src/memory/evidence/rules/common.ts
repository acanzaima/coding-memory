import { isProductionFile } from "../helpers.js";
import type { EvidenceRule } from "../types.js";

export const commonEvidenceRules: EvidenceRule[] = [
  {
    id: "test-fixtures",
    layer: "L6",
    category: "Quality",
    summary: "项目包含自动化测试或测试基类作为回归安全网。",
    test: (f) => {
      if (/(^|\/)(fixtures?|mocks?)\//i.test(f.path)) return false;
      return (
        /(^|\/)(test|tests|__tests__)\//.test(f.path) ||
        /\.(spec|test)\.[^.]+$/.test(f.path) ||
        /Test\.java$/.test(f.path) ||
        /^\s*@Test\b/m.test(f.content) ||
        /^\s*import\s+.*\s+from\s+['"](vitest|jest)['"]/m.test(f.content) ||
        /^\s*import\s+.*Mockito/m.test(f.content) ||
        /^\s*@ExtendWith\s*\(\s*MockitoExtension\.class\s*\)/m.test(f.content)
      );
    },
  },
  {
    id: "env-config",
    layer: "L8",
    category: "Environment",
    summary: "环境差异通过 .env、profile 或配置文件集中管理。",
    test: (f) =>
      isProductionFile(f) &&
      (/(^|\/)\.env/.test(f.path) ||
        /(^|\/)(application-|bootstrap).*\.ya?ml$/.test(f.path) ||
        /import\.meta\.env|process\.env|os\.environ|std::env|spring\.profiles/.test(
          f.content,
        )),
  },
  {
    id: "containerized-runtime",
    layer: "L8",
    category: "Environment",
    summary: "运行环境通过 Dockerfile、Compose 或容器构建配置描述。",
    test: (f) =>
      isProductionFile(f) &&
      (/(^|\/)Dockerfile$/.test(f.path) ||
        /(^|\/)docker-compose\.ya?ml$/.test(f.path) ||
        /^\s*(FROM|services:)\b/m.test(f.content)),
  },
  {
    id: "ci-workflows",
    layer: "L6",
    category: "Quality",
    summary: "项目包含 CI 工作流或流水线配置作为持续验证入口。",
    test: (f) =>
      isProductionFile(f) &&
      (/(^|\/)\.github\/workflows\/.+\.ya?ml$/.test(f.path) ||
        /(^|\/)(\.gitlab-ci|azure-pipelines|Jenkinsfile)/.test(f.path) ||
        /\b(actions\/checkout|npm\s+test|mvn\s+test|go\s+test|cargo\s+test|pytest)\b/.test(
          f.content,
        )),
  },
];
