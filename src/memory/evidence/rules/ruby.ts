import { isProductionFile } from "../helpers.js";
import type { EvidenceRule } from "../types.js";

export const rubyEvidenceRules: EvidenceRule[] = [
  {
    id: "ruby-rails-routes",
    layer: "L2",
    category: "API",
    summary: "Ruby/Rails 项目通过 routes.rb、controller 或资源路由暴露 HTTP API。",
    appliesTo: ["ruby", "rails", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".rb" &&
      (/(^|\/)config\/routes\.rb$/.test(f.path) ||
        /(^|\/)app\/controllers\//.test(f.path) ||
        /\b(resources|namespace|scope|get|post|patch|put|delete)\s+[:'"]/.test(
          f.content,
        )),
  },
  {
    id: "ruby-active-record-models",
    layer: "L5",
    category: "Persistence",
    summary: "Ruby/Rails 数据访问通过 ActiveRecord model、migration 或 repository 层集中处理。",
    appliesTo: ["ruby", "rails", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".rb" &&
      (/(^|\/)app\/models\//.test(f.path) ||
        /(^|\/)db\/migrate\//.test(f.path) ||
        /ApplicationRecord|ActiveRecord::Migration/.test(f.content)),
  },
  {
    id: "ruby-service-objects",
    layer: "L4",
    category: "Implementation",
    summary: "Ruby 业务逻辑通过 service/job/policy/form 等对象从控制器中拆分。",
    appliesTo: ["ruby", "rails", "mixed"],
    test: (f) =>
      isProductionFile(f) &&
      f.extension === ".rb" &&
      /(^|\/)app\/(services|jobs|policies|forms)\//.test(f.path),
    minHigh: 5,
    minMedium: 2,
  },
];
