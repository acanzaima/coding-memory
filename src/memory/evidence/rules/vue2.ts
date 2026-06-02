import { isProductionFile } from "../helpers.js";
import type { EvidenceRule } from "../types.js";

export const vue2EvidenceRules: EvidenceRule[] = [
  {
    id: "vue2-options-api",
    layer: "L4",
    category: "Implementation",
    summary: "Vue 2 组件主要通过 Options API 的 data/methods/computed/watch 组织逻辑。",
    appliesTo: ["vue2", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".vue" &&
      /export\s+default\s+\{[\s\S]*\b(data|methods|computed|watch)\s*:/m.test(
        f.content,
      ),
    minHigh: 5,
    minMedium: 2,
  },
  {
    id: "vue2-vuex-state",
    layer: "L5",
    category: "State",
    summary: "Vue 2 跨页面状态通过 Vuex store、mapState/mapActions 或 createStore 集中管理。",
    appliesTo: ["vue2", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      (/(^|\/)(store|stores)\//i.test(f.path) &&
        /(Vuex|new\s+Vuex\.Store|createStore|state\s*:|mutations\s*:)/.test(
          f.content,
        )) ||
      /\b(mapState|mapGetters|mapMutations|mapActions)\s*\(/.test(f.content),
  },
  {
    id: "vue2-router-bootstrap",
    layer: "L8",
    category: "Bootstrap",
    summary: "Vue 2 启动流程显式装配 VueRouter、Vuex store 和根组件。",
    appliesTo: ["vue2", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      /(^|\/)(main|app)\.(ts|js)$/.test(f.path) &&
      /(new\s+Vue\s*\(|Vue\.use\s*\(\s*VueRouter|router\s*,|store\s*,)/.test(
        f.content,
      ),
  },
];
