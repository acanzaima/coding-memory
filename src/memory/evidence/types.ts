import type { ScannedFile } from "../../types.js";

export type EvidenceLayer = `L${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
export type EvidenceConfidence = "high" | "medium" | "low";

export interface EvidenceItem {
  id: string;
  layer: EvidenceLayer;
  category: string;
  summary: string;
  confidence: EvidenceConfidence;
  files: string[];
  count: number;
}

export interface EvidenceReport {
  generatedAt: string;
  projectType: string;
  languages: string[];
  fileCount: number;
  totalSize: number;
  items: EvidenceItem[];
}

export interface EvidenceRule {
  id: string;
  layer: EvidenceLayer;
  category: string;
  summary: string;
  test: (file: ScannedFile) => boolean;
  minHigh?: number;
  minMedium?: number;
}
