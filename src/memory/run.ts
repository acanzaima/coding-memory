/**
 * Learn run state and checkpoints.
 *
 * These files make long learn jobs resumable and diagnosable without changing
 * the public artifact layout under reference/.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { CONFIG_DIR } from "../config/manager.js";
import type { ChatCompletionDiagnosticEvent } from "../llm/client.js";
import type { EvidenceReport } from "./evidence.js";

export interface LearnRunManifest {
  version: 1;
  runId: string;
  createdAt: string;
  updatedAt: string;
  status: "running" | "complete" | "failed";
  projectRoot: string;
  skillName: string;
  projectType: string;
  scanHash: string;
  evidenceHash: string;
  retryMode: boolean;
  phases: Record<string, LearnRunPhaseState>;
  layers: Record<string, LearnRunLayerState>;
  error?: {
    message: string;
    at: string;
  };
}

export interface LearnRunPhaseState {
  status: "pending" | "complete" | "failed";
  checkpoint?: string;
}

export interface LearnRunLayerState extends LearnRunPhaseState {
  selectedFiles?: string[];
}

export interface LearnRun {
  manifest: LearnRunManifest;
  runDir: string;
}

export interface CreateLearnRunInput {
  projectRoot: string;
  skillName: string;
  projectType: string;
  scanHash: string;
  evidenceReport: EvidenceReport;
  retryMode: boolean;
  resume?: boolean | string;
}

const RUNS_DIR = join(CONFIG_DIR, ".runs");
const PHASES = ["focus", "P0", "P1", "P2", "file-selection", "P4"];
const LAYERS = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"];

export function openLearnRun(input: CreateLearnRunInput): LearnRun {
  ensureRunsDir();
  const evidenceHash = stableHash(JSON.stringify(input.evidenceReport));
  if (input.resume) {
    const resumed = findRunToResume(input, evidenceHash);
    if (resumed) {
      resumed.manifest.status = "running";
      resumed.manifest.updatedAt = new Date().toISOString();
      resumed.manifest.error = undefined;
      writeManifest(resumed);
      return resumed;
    }
  }

  const runId = createRunId();
  const runDir = join(
    RUNS_DIR,
    sanitizePathSegment(input.skillName),
    sanitizePathSegment(input.projectType),
    runId,
  );
  mkdirSync(join(runDir, "layers"), { recursive: true });
  const now = new Date().toISOString();
  const manifest: LearnRunManifest = {
    version: 1,
    runId,
    createdAt: now,
    updatedAt: now,
    status: "running",
    projectRoot: input.projectRoot,
    skillName: input.skillName,
    projectType: input.projectType,
    scanHash: input.scanHash,
    evidenceHash,
    retryMode: input.retryMode,
    phases: Object.fromEntries(
      PHASES.map((phase) => [phase, { status: "pending" }]),
    ),
    layers: Object.fromEntries(
      LAYERS.map((layer) => [layer, { status: "pending" }]),
    ),
  };
  const run = { manifest, runDir };
  writeManifest(run);
  writeJson(join(runDir, "evidence.snapshot.json"), input.evidenceReport);
  return run;
}

export function completeLearnRun(run: LearnRun): void {
  run.manifest.status = "complete";
  run.manifest.updatedAt = new Date().toISOString();
  writeManifest(run);
}

export function failLearnRun(run: LearnRun, error: unknown): void {
  run.manifest.status = "failed";
  run.manifest.updatedAt = new Date().toISOString();
  run.manifest.error = {
    message: error instanceof Error ? error.message : String(error),
    at: new Date().toISOString(),
  };
  writeManifest(run);
}

export function readPhaseCheckpoint(
  run: LearnRun | undefined,
  phase: string,
): string | null {
  if (!run) return null;
  const checkpoint = run.manifest.phases[phase]?.checkpoint;
  if (!checkpoint) return null;
  return readTextIfExists(join(run.runDir, checkpoint));
}

export function writePhaseCheckpoint(
  run: LearnRun | undefined,
  phase: string,
  content: string,
): void {
  if (!run) return;
  const filename = `${phase}.md`;
  writeFileSync(join(run.runDir, filename), content, "utf-8");
  run.manifest.phases[phase] = { status: "complete", checkpoint: filename };
  touchManifest(run);
}

export function readLayerCheckpoint(
  run: LearnRun | undefined,
  layerId: string,
): string | null {
  if (!run) return null;
  const checkpoint = run.manifest.layers[layerId]?.checkpoint;
  if (!checkpoint) return null;
  return readTextIfExists(join(run.runDir, checkpoint));
}

export function writeLayerCheckpoint(
  run: LearnRun | undefined,
  layerId: string,
  content: string,
  selectedFiles?: string[],
): void {
  if (!run) return;
  const filename = `layers/${layerId}.md`;
  writeFileSync(join(run.runDir, filename), content, "utf-8");
  run.manifest.layers[layerId] = {
    status: "complete",
    checkpoint: filename,
    selectedFiles,
  };
  touchManifest(run);
}

export function writeRunJson(
  run: LearnRun | undefined,
  filename: string,
  value: unknown,
): void {
  if (!run) return;
  writeJson(join(run.runDir, filename), value);
}

export function recordLlmDiagnostic(
  run: LearnRun | undefined,
  event: ChatCompletionDiagnosticEvent,
): void {
  if (!run) return;
  try {
    mkdirSync(run.runDir, { recursive: true });
    writeFileSync(
      join(run.runDir, "calls.jsonl"),
      `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`,
      { encoding: "utf-8", flag: "a" },
    );
  } catch {
    // Best-effort diagnostics.
  }
}

export function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function findRunToResume(
  input: CreateLearnRunInput,
  evidenceHash: string,
): LearnRun | null {
  const base = join(
    RUNS_DIR,
    sanitizePathSegment(input.skillName),
    sanitizePathSegment(input.projectType),
  );
  if (!existsSync(base)) return null;
  const candidates = readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(base, entry.name))
    .sort()
    .reverse();
  const requestedRunId = typeof input.resume === "string" ? input.resume : null;
  for (const runDir of candidates) {
    const manifest = readManifest(runDir);
    if (!manifest) continue;
    if (requestedRunId && manifest.runId !== requestedRunId) continue;
    if (manifest.projectRoot !== input.projectRoot) continue;
    if (manifest.skillName !== input.skillName) continue;
    if (manifest.projectType !== input.projectType) continue;
    if (manifest.scanHash !== input.scanHash) continue;
    if (manifest.evidenceHash !== evidenceHash) continue;
    return { manifest, runDir };
  }
  return null;
}

function readManifest(runDir: string): LearnRunManifest | null {
  try {
    const raw = readTextIfExists(join(runDir, "manifest.json"));
    return raw ? (JSON.parse(raw) as LearnRunManifest) : null;
  } catch {
    return null;
  }
}

function writeManifest(run: LearnRun): void {
  writeJson(join(run.runDir, "manifest.json"), run.manifest);
}

function touchManifest(run: LearnRun): void {
  run.manifest.updatedAt = new Date().toISOString();
  writeManifest(run);
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function readTextIfExists(path: string): string | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

function ensureRunsDir(): void {
  mkdirSync(RUNS_DIR, { recursive: true });
}

function createRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 120) || "run";
}
