import { isProductionFile } from "../helpers.js";
import type { EvidenceRule } from "../types.js";

export const vueEvidenceRules: EvidenceRule[] = [
  {
    id: "vue-single-file-components",
    layer: "L1",
    category: "Component",
    summary: "Vue 页面/组件使用单文件组件组织模板、脚本和样式。",
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".vue" &&
      /<template[\s>]|<script[\s>]/.test(f.content),
    minHigh: 8,
    minMedium: 3,
  },
];
