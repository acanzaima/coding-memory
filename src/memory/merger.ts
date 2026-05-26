/**
 * Memory merger — handles merging new learnings into existing skills.
 * Skills are keyed by "skillName/projectType" (one entry = one L1-L8 set).
 * Re-learning the same combination merges (accumulates source projects/files).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { LOCK_FILE } from "../config/manager.js";
import type { SkillsLock, SkillEntry } from "../types.js";

export function readSkillsLock(): SkillsLock {
  try {
    if (existsSync(LOCK_FILE)) {
      return JSON.parse(readFileSync(LOCK_FILE, "utf-8")) as SkillsLock;
    }
  } catch {
    /* corrupted, start fresh */
  }
  return { version: 2, skills: {} };
}

export function writeSkillsLock(lock: SkillsLock): void {
  const parent = dirname(LOCK_FILE);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
  writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2), "utf-8");
}

export function computeHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function findExistingSkill(
  lock: SkillsLock,
  lockKey: string,
): SkillEntry | null {
  return lock.skills[lockKey] || null;
}

export function mergeSourceFiles(
  existing: string[],
  newFiles: string[],
): string[] {
  return [...new Set([...existing, ...newFiles])].sort();
}

export function mergeSourceProjects(
  existing: string[],
  newProject: string,
): string[] {
  return [...new Set([...existing, newProject])].sort();
}

export function upsertSkillEntry(
  lock: SkillsLock,
  lockKey: string,
  displayName: string,
  language: string,
  rawLanguages: string[],
  skillPath: string,
  contentHash: string,
  sourceFiles: string[],
  sourceProject: string,
  existingEntry: SkillEntry | null,
): SkillsLock {
  const now = new Date().toISOString();
  if (existingEntry) {
    lock.skills[lockKey] = {
      name: displayName,
      language,
      rawLanguages,
      createdAt: existingEntry.createdAt,
      updatedAt: now,
      learnCount: existingEntry.learnCount + 1,
      sourceProjects: mergeSourceProjects(
        existingEntry.sourceProjects || [],
        sourceProject,
      ),
      sourceFiles: mergeSourceFiles(existingEntry.sourceFiles, sourceFiles),
      skillPath,
      contentHash,
    };
  } else {
    lock.skills[lockKey] = {
      name: displayName,
      language,
      rawLanguages,
      createdAt: now,
      updatedAt: now,
      learnCount: 1,
      sourceProjects: [sourceProject],
      sourceFiles,
      skillPath,
      contentHash,
    };
  }
  return lock;
}

export function listSkills(lock: SkillsLock): SkillEntry[] {
  return Object.values(lock.skills).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}
