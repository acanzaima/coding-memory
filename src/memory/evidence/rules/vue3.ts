import { hasPiniaEvidence, isProductionFile } from "../helpers.js";
import type { EvidenceRule } from "../types.js";

export const vue3EvidenceRules: EvidenceRule[] = [
  {
    id: "vue3-composition-api",
    layer: "L4",
    category: "Implementation",
    summary: "Vue 3 组件优先使用 Composition API 与 `<script setup>` 组织逻辑。",
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".vue" &&
      (/<script\s+setup/.test(f.content) ||
        /\b(ref|reactive|computed|watch|onMounted)\s*\(/.test(f.content)),
    minHigh: 5,
    minMedium: 2,
  },
  {
    id: "vue3-pinia-state",
    layer: "L5",
    category: "State",
    summary: "Vue 3 跨页面状态通过 Pinia store 管理，并以模块方式组织。",
    test: (f) =>
      (isProductionFile(f) &&
        /(^|\/)(store|stores)\//i.test(f.path) &&
        /(defineStore|createPinia|from\s+['"]pinia['"])/.test(f.content)) ||
      (isProductionFile(f) && hasPiniaEvidence(f)),
  },
  {
    id: "vue3-router-bootstrap",
    layer: "L8",
    category: "Bootstrap",
    summary: "Vue 3 启动流程显式装配 createApp、router、Pinia 或组件库插件。",
    test: (f) =>
      isProductionFile(f) &&
      /(^|\/)(main|app)\.(ts|js)$/.test(f.path) &&
      /(createApp|createRouter|createPinia|\.use\s*\()/.test(f.content),
  },
];
