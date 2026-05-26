import type { EvidenceRule } from "../types.js";
import { csharpEvidenceRules } from "./csharp.js";
import { commonEvidenceRules } from "./common.js";
import { frontendEvidenceRules } from "./frontend.js";
import { goEvidenceRules } from "./go.js";
import { javaEvidenceRules } from "./java.js";
import { nodeEvidenceRules } from "./node.js";
import { phpEvidenceRules } from "./php.js";
import { pythonEvidenceRules } from "./python.js";
import { reactEvidenceRules } from "./react.js";
import { rubyEvidenceRules } from "./ruby.js";
import { rustEvidenceRules } from "./rust.js";
import { vue2EvidenceRules } from "./vue2.js";
import { vue3EvidenceRules } from "./vue3.js";
import { vueEvidenceRules } from "./vue.js";

export const evidenceRules: EvidenceRule[] = [
  ...vueEvidenceRules,
  ...vue2EvidenceRules,
  ...vue3EvidenceRules,
  ...frontendEvidenceRules,
  ...reactEvidenceRules,
  ...javaEvidenceRules,
  ...nodeEvidenceRules,
  ...pythonEvidenceRules,
  ...goEvidenceRules,
  ...rustEvidenceRules,
  ...csharpEvidenceRules,
  ...phpEvidenceRules,
  ...rubyEvidenceRules,
  ...commonEvidenceRules,
];
