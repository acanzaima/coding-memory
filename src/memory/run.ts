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
  metrics?: LearnRunMetrics;
  error?: {
    message: string;
    at: string;
  };
}

export interface LearnRunMetrics {
  version: 1;
  runId: string;
  status: LearnRunManifest["status"];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  llmRequests: number;
  conversationTurns: number;
  llmRetries: number;
  llmDurationMs: number;
  successfulRequests: number;
  failedRequests: number;
  requestChars: number;
  responseChars: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  phases: LearnRunPhaseMetrics[];
}

export interface LearnRunPhaseMetrics {
  phase: string;
  requests: number;
  conversationTurns: number;
  retries: number;
  durationMs: number;
  successfulRequests: number;
  failedRequests: number;
  responseChars: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
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

export function completeLearnRun(run: LearnRun): LearnRunMetrics {
  run.manifest.status = "complete";
  run.manifest.updatedAt = new Date().toISOString();
  const metrics = collectLearnRunMetrics(run);
  run.manifest.metrics = metrics;
  writeManifest(run);
  writeJson(join(run.runDir, "METRICS.json"), metrics);
  return metrics;
}

export function failLearnRun(run: LearnRun, error: unknown): LearnRunMetrics {
  run.manifest.status = "failed";
  run.manifest.updatedAt = new Date().toISOString();
  run.manifest.error = {
    message: error instanceof Error ? error.message : String(error),
    at: new Date().toISOString(),
  };
  const metrics = collectLearnRunMetrics(run);
  run.manifest.metrics = metrics;
  writeManifest(run);
  writeJson(join(run.runDir, "METRICS.json"), metrics);
  return metrics;
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

export function collectLearnRunMetrics(run: LearnRun): LearnRunMetrics {
  const events = readDiagnosticEvents(run);
  const finishedAt = run.manifest.updatedAt || new Date().toISOString();
  const metrics: LearnRunMetrics = {
    version: 1,
    runId: run.manifest.runId,
    status: run.manifest.status,
    startedAt: run.manifest.createdAt,
    finishedAt,
    durationMs: Math.max(
      0,
      Date.parse(finishedAt) - Date.parse(run.manifest.createdAt),
    ),
    llmRequests: 0,
    conversationTurns: 0,
    llmRetries: 0,
    llmDurationMs: 0,
    successfulRequests: 0,
    failedRequests: 0,
    requestChars: 0,
    responseChars: 0,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    phases: [],
  };
  const byPhase = new Map<string, LearnRunPhaseMetrics>();

  for (const event of events) {
    const phaseName = typeof event.phase === "string" ? event.phase : "unknown";
    const phase = getPhaseMetrics(byPhase, phaseName);
    const attempt =
      typeof event.attempt === "number" && event.attempt > 0
        ? event.attempt
        : 1;
    const ok = event.ok === true;
    const durationMs = numberValue(event.durationMs);
    const requestChars = numberValue(event.requestChars);
    const responseChars = numberValue(event.responseChars);
    const usage = event.usage || {};
    const promptTokens = numberValue(usage.prompt_tokens);
    const completionTokens = numberValue(usage.completion_tokens);
    const reasoningTokens = numberValue(
      usage.completion_tokens_details?.reasoning_tokens ??
        usage.reasoning_tokens,
    );
    const totalTokens = numberValue(usage.total_tokens);

    metrics.llmRequests += 1;
    phase.requests += 1;
    if (attempt === 1) {
      metrics.conversationTurns += 1;
      phase.conversationTurns += 1;
    } else {
      metrics.llmRetries += 1;
      phase.retries += 1;
    }
    if (ok) {
      metrics.successfulRequests += 1;
      phase.successfulRequests += 1;
    } else {
      metrics.failedRequests += 1;
      phase.failedRequests += 1;
    }
    metrics.requestChars += requestChars;
    metrics.responseChars += responseChars;
    metrics.llmDurationMs += durationMs;
    metrics.promptTokens += promptTokens;
    metrics.completionTokens += completionTokens;
    metrics.reasoningTokens += reasoningTokens;
    metrics.totalTokens += totalTokens;

    phase.durationMs += durationMs;
    phase.responseChars += responseChars;
    phase.promptTokens += promptTokens;
    phase.completionTokens += completionTokens;
    phase.reasoningTokens += reasoningTokens;
    phase.totalTokens += totalTokens;
  }

  metrics.phases = [...byPhase.values()];
  return metrics;
}

export function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

type DiagnosticRecord = ChatCompletionDiagnosticEvent & {
  at?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    reasoning_tokens?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
};

function readDiagnosticEvents(run: LearnRun): DiagnosticRecord[] {
  const raw = readTextIfExists(join(run.runDir, "calls.jsonl"));
  if (!raw) return [];
  const out: DiagnosticRecord[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as DiagnosticRecord);
    } catch {
      // Keep metrics best-effort; a broken diagnostic line should not break learn.
    }
  }
  return out;
}

function getPhaseMetrics(
  byPhase: Map<string, LearnRunPhaseMetrics>,
  phaseName: string,
): LearnRunPhaseMetrics {
  const existing = byPhase.get(phaseName);
  if (existing) return existing;
  const created: LearnRunPhaseMetrics = {
    phase: phaseName,
    requests: 0,
    conversationTurns: 0,
    retries: 0,
    durationMs: 0,
    successfulRequests: 0,
    failedRequests: 0,
    responseChars: 0,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };
  byPhase.set(phaseName, created);
  return created;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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
