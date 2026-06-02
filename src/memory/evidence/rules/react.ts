import { isProductionFile } from "../helpers.js";
import type { EvidenceRule } from "../types.js";

export const reactEvidenceRules: EvidenceRule[] = [
  {
    id: "react-component-structure",
    layer: "L1",
    category: "Component",
    summary: "组件文件按功能/路由组织，存在 index 桶文件模式。",
    appliesTo: ["react", "nextjs", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      (/\.tsx$/.test(f.path) || /\.jsx$/.test(f.path)) &&
      /(^|\/)index\.(tsx|jsx)$/.test(f.path),
    minMedium: 3,
  },
  {
    id: "react-hooks-pattern",
    layer: "L4",
    category: "Hooks",
    summary: "项目使用自定义 hooks (useXxx) 封装逻辑。",
    appliesTo: ["react", "nextjs", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      /(^|\/)use[A-Z]\w+\.(ts|tsx|js|jsx)$/.test(f.path),
    minHigh: 5,
    minMedium: 2,
  },
  {
    id: "react-state-management",
    layer: "L5",
    category: "State",
    summary: "使用 Redux/Zustand/Jotai 等状态管理。",
    appliesTo: ["react", "nextjs", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      (/(^|\/)store\//.test(f.path) ||
        /(^|\/)stores\//.test(f.path) ||
        /createSlice|configureStore|createStore/.test(f.content) ||
        /from\s+['"](zustand|jotai|valtio|redux)['"]|create\s*\(\s*\(\s*(set|get|store)/.test(
          f.content,
        )),
  },
  {
    id: "react-router",
    layer: "L1",
    category: "Routing",
    summary: "使用 React Router 进行路由管理。",
    appliesTo: ["react", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      (/(^|\/)router\//.test(f.path) ||
        /(^|\/)routes\//.test(f.path) ||
        /createBrowserRouter|Route\s/.test(f.content)),
  },
  {
    id: "nextjs-app-router",
    layer: "L1",
    category: "Routing",
    summary: "Next.js 项目使用 app router 的目录约定组织页面、布局和服务端组件。",
    appliesTo: ["nextjs", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      /(^|\/)app\/.+\/(page|layout|loading|error|route)\.(ts|tsx|js|jsx)$/.test(
        f.path,
      ),
    minHigh: 5,
    minMedium: 2,
  },
  {
    id: "react-server-client-boundaries",
    layer: "L4",
    category: "Rendering",
    summary: "React/Next 组件显式区分 client component、server action 或服务端数据读取边界。",
    appliesTo: ["react", "nextjs", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      /\.(tsx|jsx|ts|js)$/.test(f.path) &&
      (/^['"]use client['"]/m.test(f.content) ||
        /^['"]use server['"]/m.test(f.content) ||
        /\bgetServerSideProps\b|\bgetStaticProps\b/.test(f.content)),
  },
];
