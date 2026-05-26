/**
 * File scanner for discovering and reading project source files.
 * Respects .gitignore and config-based include/exclude patterns.
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { relative, join } from 'node:path'
import { detectLanguage, isCodeLanguage } from './language.js'
import type { ScannedFile, LanguageGroup, CodingMemoryConfig } from '../types.js'

/**
 * Simple glob matching. Supports ** and * wildcards.
 * This is a minimal implementation to avoid dependency on glob packages.
 */
function matchGlob(pattern: string, path: string): boolean {
  // Normalize separators
  const normalizedPath = path.replace(/\\/g, '/')
  const normalizedPattern = pattern.replace(/\\/g, '/')

  // Convert glob pattern to regex
  const regexStr = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/\*\*\/?/g, '___DOUBLESTAR___') // Temporarily replace **
    .replace(/\*/g, '[^/]*') // Single star
    .replace(/___DOUBLESTAR___/g, '.*') // Double star
    .replace(/\?/g, '[^/]') // Question mark

  const regex = new RegExp(`^${regexStr}$`)
  return regex.test(normalizedPath)
}

/**
 * Check if a path matches any pattern in the list.
 */
function matchesAny(path: string, patterns: string[]): boolean {
  return patterns.some(p => matchGlob(p, path))
}

/**
 * Read .gitignore and parse its patterns.
 */
function readGitignore(projectRoot: string): string[] {
  const gitignorePath = join(projectRoot, '.gitignore')
  if (!existsSync(gitignorePath)) return []

  try {
    const content = readFileSync(gitignorePath, 'utf-8')
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        // Convert .gitignore patterns to glob-compatible patterns
        if (line.startsWith('/')) line = line.slice(1)
        if (line.endsWith('/')) line = line + '**'
        if (!line.includes('*') && !line.includes('/')) {
          return `**/${line}/**`
        }
        return line.startsWith('**') ? line : `**/${line}`
      })
  } catch {
    return []
  }
}

/**
 * Recursively walk a directory and collect matching files.
 */
function walkDir(
  dir: string,
  projectRoot: string,
  include: string[],
  exclude: string[],
  gitignorePatterns: string[],
  maxFileSize: number,
  respectGitignore: boolean,
): ScannedFile[] {
  const results: ScannedFile[] = []

  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relPath = relative(projectRoot, fullPath).replace(/\\/g, '/')

    // Skip excluded paths
    if (matchesAny(relPath, exclude)) continue

    // Respect .gitignore
    if (respectGitignore && matchesAny(relPath, gitignorePatterns)) continue

    if (entry.isDirectory()) {
      // Skip hidden directories (except .github, .vscode which may have useful files)
      if (entry.name.startsWith('.') && !['.github', '.vscode', '.coding-memory'].includes(entry.name)) {
        continue
      }
      results.push(...walkDir(fullPath, projectRoot, include, exclude, gitignorePatterns, maxFileSize, respectGitignore))
    } else if (entry.isFile()) {
      // Check if file matches include patterns
      if (!matchesAny(relPath, include)) continue

      // Check file size
      let size = 0
      try {
        size = statSync(fullPath).size
      } catch {
        continue
      }
      if (size > maxFileSize) continue
      if (size === 0) continue

      // Read file content
      let content = ''
      try {
        content = readFileSync(fullPath, 'utf-8')
      } catch {
        // Skip binary files
        continue
      }

      // Skip empty files
      if (!content.trim()) continue

      const ext = entry.name.includes('.') ? '.' + entry.name.split('.').pop()?.toLowerCase() || '' : ''

      results.push({
        path: relPath,
        language: detectLanguage(entry.name),
        content,
        size,
        extension: ext,
      })
    }
  }

  return results
}

/**
 * Scan project files and group them by language.
 */
export function scanProject(
  projectRoot: string,
  config: CodingMemoryConfig,
): LanguageGroup[] {
  const gitignorePatterns = config.respectGitignore ? readGitignore(projectRoot) : []

  const files = walkDir(
    projectRoot,
    projectRoot,
    config.include,
    config.exclude,
    gitignorePatterns,
    config.maxFileSize,
    config.respectGitignore,
  )

  // Group by language
  const groups = new Map<string, ScannedFile[]>()

  for (const file of files) {
    const lang = file.language
    if (!groups.has(lang)) {
      groups.set(lang, [])
    }
    groups.get(lang)!.push(file)
  }

  // Convert to LanguageGroup array, sorted by total size (largest first)
  const result: LanguageGroup[] = []
  for (const [language, langFiles] of groups) {
    result.push({
      language,
      files: langFiles,
      totalSize: langFiles.reduce((sum, f) => sum + f.size, 0),
    })
  }

  result.sort((a, b) => b.totalSize - a.totalSize)

  return result
}

/**
 * Prepare a representative sample of code for LLM analysis.
 * Prioritizes important files and truncates to fit token budget.
 */
export function prepareCodeSample(
  group: LanguageGroup,
  maxTotalChars: number = 50000,
): { filePath: string; content: string }[] {
  // Sort files: prioritize smaller files, then by path (config-like first, then source)
  const sorted = [...group.files].sort((a, b) => {
    // Prioritize certain file types
    const aPriority = getFilePriority(a.path)
    const bPriority = getFilePriority(b.path)
    if (aPriority !== bPriority) return aPriority - bPriority

    // Then by size (smaller first)
    return a.size - b.size
  })

  const samples: { filePath: string; content: string }[] = []
  let totalChars = 0

  for (const file of sorted) {
    const charsNeeded = Math.min(file.content.length, maxTotalChars - totalChars)
    if (charsNeeded <= 0) break

    const truncated = file.content.length > 8000
      ? file.content.slice(0, 4000) + '\n\n... (truncated) ...\n\n' + file.content.slice(-4000)
      : file.content

    samples.push({ filePath: file.path, content: truncated })
    totalChars += truncated.length
  }

  return samples
}

/**
 * Get priority for a file (lower = higher priority).
 */
function getFilePriority(filePath: string): number {
  const basename = filePath.split('/').pop() || ''

  // Top priority: package manifests, configs, index files
  if (['package.json', 'tsconfig.json', 'vite.config.ts', 'index.ts', 'main.ts', 'App.vue', 'app.ts'].includes(basename)) {
    return 0
  }

  // High priority: type definitions, configs, entry points
  if (basename.includes('config') || basename.includes('types') || basename.endsWith('.d.ts')) {
    return 1
  }

  // Medium priority: source files
  if (isCodeLanguage(detectLanguage(filePath))) {
    return 2
  }

  // Low priority: docs, assets
  return 3
}
