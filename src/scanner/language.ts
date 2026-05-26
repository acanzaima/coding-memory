/**
 * Language detection by file extension and filename patterns.
 * Maps file extensions and patterns to human-readable language/framework names.
 */

export interface LanguageInfo {
  name: string
  category: string
  group: string
}

/** Extension → language mapping */
const extensionMap: Record<string, LanguageInfo> = {
  // JavaScript / TypeScript ecosystem
  '.ts': { name: 'TypeScript', category: 'frontend', group: 'typescript' },
  '.tsx': { name: 'TypeScript React', category: 'frontend', group: 'typescript' },
  '.js': { name: 'JavaScript', category: 'frontend', group: 'javascript' },
  '.jsx': { name: 'JavaScript React', category: 'frontend', group: 'javascript' },
  '.mjs': { name: 'JavaScript ESM', category: 'frontend', group: 'javascript' },
  '.cjs': { name: 'JavaScript CJS', category: 'frontend', group: 'javascript' },

  // Vue
  '.vue': { name: 'Vue', category: 'frontend', group: 'vue' },

  // Svelte
  '.svelte': { name: 'Svelte', category: 'frontend', group: 'svelte' },

  // Styles
  '.css': { name: 'CSS', category: 'frontend', group: 'css' },
  '.scss': { name: 'SCSS', category: 'frontend', group: 'css' },
  '.sass': { name: 'Sass', category: 'frontend', group: 'css' },
  '.less': { name: 'Less', category: 'frontend', group: 'css' },
  '.styl': { name: 'Stylus', category: 'frontend', group: 'css' },

  // Python
  '.py': { name: 'Python', category: 'backend', group: 'python' },
  '.pyi': { name: 'Python Interface', category: 'backend', group: 'python' },

  // Java / JVM
  '.java': { name: 'Java', category: 'backend', group: 'java' },
  '.kt': { name: 'Kotlin', category: 'backend', group: 'java' },
  '.kts': { name: 'Kotlin Script', category: 'backend', group: 'java' },
  '.groovy': { name: 'Groovy', category: 'backend', group: 'java' },
  '.scala': { name: 'Scala', category: 'backend', group: 'java' },

  // Go
  '.go': { name: 'Go', category: 'backend', group: 'go' },

  // Rust
  '.rs': { name: 'Rust', category: 'systems', group: 'rust' },

  // C / C++
  '.c': { name: 'C', category: 'systems', group: 'c' },
  '.h': { name: 'C Header', category: 'systems', group: 'c' },
  '.cpp': { name: 'C++', category: 'systems', group: 'cpp' },
  '.cc': { name: 'C++', category: 'systems', group: 'cpp' },
  '.cxx': { name: 'C++', category: 'systems', group: 'cpp' },
  '.hpp': { name: 'C++ Header', category: 'systems', group: 'cpp' },

  // C#
  '.cs': { name: 'C#', category: 'backend', group: 'csharp' },

  // Ruby
  '.rb': { name: 'Ruby', category: 'backend', group: 'ruby' },

  // PHP
  '.php': { name: 'PHP', category: 'backend', group: 'php' },

  // Swift
  '.swift': { name: 'Swift', category: 'mobile', group: 'swift' },

  // Shell
  '.sh': { name: 'Shell', category: 'scripting', group: 'shell' },
  '.bash': { name: 'Bash', category: 'scripting', group: 'shell' },
  '.zsh': { name: 'Zsh', category: 'scripting', group: 'shell' },

  // Config / Data
  '.json': { name: 'JSON', category: 'config', group: 'config' },
  '.yaml': { name: 'YAML', category: 'config', group: 'config' },
  '.yml': { name: 'YAML', category: 'config', group: 'config' },
  '.toml': { name: 'TOML', category: 'config', group: 'config' },
  '.xml': { name: 'XML', category: 'config', group: 'config' },
  '.graphql': { name: 'GraphQL', category: 'api', group: 'graphql' },
  '.gql': { name: 'GraphQL', category: 'api', group: 'graphql' },

  // Markup / Docs
  '.md': { name: 'Markdown', category: 'docs', group: 'docs' },
  '.mdx': { name: 'MDX', category: 'docs', group: 'docs' },
  '.html': { name: 'HTML', category: 'frontend', group: 'html' },

  // SQL
  '.sql': { name: 'SQL', category: 'data', group: 'sql' },

  // Docker / Infra
  '.dockerfile': { name: 'Docker', category: 'infra', group: 'docker' },
}

/** Filename patterns → language */
const filenameMap: Record<string, LanguageInfo> = {
  'Dockerfile': { name: 'Docker', category: 'infra', group: 'docker' },
  'docker-compose.yml': { name: 'Docker Compose', category: 'infra', group: 'docker' },
  'docker-compose.yaml': { name: 'Docker Compose', category: 'infra', group: 'docker' },
  'Makefile': { name: 'Makefile', category: 'build', group: 'build' },
  'CMakeLists.txt': { name: 'CMake', category: 'build', group: 'build' },
  'meson.build': { name: 'Meson', category: 'build', group: 'build' },
}

/**
 * Detect the language of a file from its path.
 * Returns the language group name (used for skill grouping).
 */
export function detectLanguage(filePath: string): string {
  const basename = filePath.split('/').pop()?.split('\\').pop() || ''

  // Check filename patterns first
  if (filenameMap[basename]) {
    return filenameMap[basename].group
  }

  // Check extension
  const ext = basename.includes('.')
    ? '.' + basename.split('.').pop()?.toLowerCase()
    : ''

  if (extensionMap[ext]) {
    return extensionMap[ext].group
  }

  // Try multi-part extensions (e.g., .test.ts, .spec.tsx)
  if (basename.includes('.')) {
    const parts = basename.split('.')
    if (parts.length > 2) {
      for (let i = parts.length - 1; i >= 1; i--) {
        const multiExt = '.' + parts.slice(i).join('.')
        if (extensionMap[multiExt]) {
          return extensionMap[multiExt].group
        }
      }
    }
  }

  return 'other'
}

/**
 * Get the display name for a language group.
 */
export function getLanguageDisplayName(group: string): string {
  const entry = Object.values(extensionMap).find(e => e.group === group)
  if (entry) return entry.name

  const fEntry = Object.values(filenameMap).find(e => e.group === group)
  if (fEntry) return fEntry.name

  return group.charAt(0).toUpperCase() + group.slice(1)
}

/**
 * Get the category for a language group.
 */
export function getLanguageCategory(group: string): string {
  const entry = Object.values(extensionMap).find(e => e.group === group)
  if (entry) return entry.category

  const fEntry = Object.values(filenameMap).find(e => e.group === group)
  if (fEntry) return fEntry.category

  return 'other'
}

/**
 * Check if a language group is primarily code (vs config/docs).
 */
export function isCodeLanguage(group: string): boolean {
  const nonCodeGroups = ['config', 'docs', 'build']
  const category = getLanguageCategory(group)
  return !nonCodeGroups.includes(category) && group !== 'other'
}
