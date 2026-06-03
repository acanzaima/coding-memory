/**
 * Config command — manages LLM models in ~/.coding-memory/models.json
 *
 * Flow: pick provider (arrow keys) → type model name → API key → name it → done
 */

import { createInterface } from 'node:readline'
import { select } from '../cli/select.js'
import { isAbsolute, resolve } from 'node:path'
import { expandHomePath, readConfig, updateConfig } from '../config/manager.js'
import { consumeModelsMigrationNotice, readModels, upsertModel, switchModel, removeModel, listModels, getCurrentModel } from '../config/models.js'
import { providerPresets, getBaseURL, getEnvVarName } from '../llm/providers.js'
import { testConnection } from '../llm/client.js'
import type { LLMConfig } from '../types.js'

const c = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m' }
const icon = { ok: '\u2713', err: '\u2717', star: '\u2605', arrow: '\u2192' }

function ask(rl: ReturnType<typeof createInterface>, q: string): Promise<string> {
  return new Promise(resolve => rl.question(q, a => resolve(a.trim())))
}

export async function configCommand(options?: { list?: boolean; remove?: string; outputLanguage?: string; skillsDir?: string }): Promise<void> {
  if (options?.skillsDir) return handleSkillsDir(options.skillsDir)
  if (options?.outputLanguage) return handleOutputLanguage(options.outputLanguage)
  if (options?.list) return showModelList()
  if (options?.remove) return handleRemove(options.remove)
  await interactiveSetup()
}

function handleSkillsDir(raw: string): void {
  const dir = raw.trim()
  if (!dir) {
    console.log(`${c.red}${icon.err}${c.reset} Output directory is required.`)
    console.log(`  ${c.dim}Use ${c.cyan}coding-memory config --dir D:/AI/memories${c.reset}${c.dim}.${c.reset}`)
    return
  }
  const expanded = expandHomePath(dir)
  const skillsDir = isAbsolute(expanded) ? expanded : resolve(expanded)
  updateConfig({ skillsDir })
  console.log(`${c.green}${icon.ok}${c.reset} Output directory set to ${c.cyan}${skillsDir}${c.reset}`)
}

async function interactiveSetup(): Promise<void> {

  console.log(`\n${c.bold}${c.cyan}  coding-memory${c.reset} ${c.dim}\u2014 model configuration${c.reset}\n`)
  console.log(`${c.dim}  Configure one or more LLM models. Switch with${c.reset} ${c.cyan}coding-memory use <name>${c.reset}\n`)

  const existing = listModels()
  if (existing.length > 0) {
    const current = readModels().current
    console.log(`${c.bold}  Configured models:${c.reset}`)
    for (const m of existing) {
      const mark = m.name === current ? ` ${c.yellow}${icon.star} active${c.reset}` : ''
      console.log(`    ${c.dim}${icon.arrow}${c.reset} ${c.cyan}${m.name}${c.reset} ${c.dim}\u2192${c.reset} ${m.provider} ${c.dim}/${c.reset} ${m.model}${mark}`)
    }
    console.log()
  }

  // Step 1 — Provider (arrow-key selection, uses its own readline)
  const providerNames = providerPresets.map(p => p.name)
  const providerDescs = providerPresets.map(p =>
    requiresBaseURL(p.id)
      ? 'OpenAI-compatible endpoint, enter model and base URL'
      : p.models[0]?.id
        ? `model e.g. ${p.models[0].id}`
        : 'enter the model or endpoint ID from your provider console',
  )
  const idx = await select('Choose a provider:', providerNames, providerDescs)
  if (idx < 0) return
  const provider = providerPresets[idx]
  console.log()

  // Now create readline for text input (after select cleaned up stdin)
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  // Step 2 — Model name (free text)
  const defaultModel = provider.models[0]?.id || ''
  const modelHint = defaultModel ? ` ${c.dim}[${defaultModel}]${c.reset}` : ''
  console.log(`${c.bold}  Step 2: Model name${c.reset}`)
  if (!defaultModel) {
    console.log(`  ${c.dim}Enter the exact model or endpoint ID shown in your provider console.${c.reset}\n`)
  } else {
    console.log(`  ${c.dim}Enter the model identifier (e.g. gpt-4o, deepseek-chat)${c.reset}\n`)
  }

  let model = await ask(rl, `  ${c.yellow}Model${c.reset}${modelHint}: `)
  if (!model) {
    if (defaultModel) { model = defaultModel; console.log(`  ${c.dim}Using default: ${model}${c.reset}`) }
    else { console.log(`  ${c.red}Model name is required.${c.reset}`); rl.close(); return }
  } else { console.log(`  ${c.green}${icon.ok}${c.reset} ${model}`) }
  console.log()

  // Step 3 — API Key
  const envVar = getEnvVarName(provider.id)
  const envVal = process.env[envVar]
  let apiKey = ''
  const localProvider = ['ollama', 'lmstudio', 'vllm'].includes(provider.id)

  console.log(`${c.bold}  Step 3: API key${c.reset}`)
  if (envVal) {
    console.log(`  ${c.dim}Found $${envVar} in environment${c.reset}`)
    const useEnv = await ask(rl, `  ${c.yellow}Use $${envVar}?${c.reset} ${c.dim}[Y/n]${c.reset}: `)
    if (useEnv.toLowerCase() !== 'n') { apiKey = envVal; console.log(`  ${c.green}${icon.ok}${c.reset} Using $${envVar}\n`) }
  }
  if (!apiKey) {
    if (localProvider) {
      console.log(`  ${c.dim}Local/self-hosted provider: API key is optional.${c.reset}`)
      apiKey = await ask(rl, `  ${c.yellow}API key${c.reset} ${c.dim}[optional]${c.reset}: `)
      console.log(`  ${c.green}${icon.ok}${c.reset} ${apiKey ? 'Key saved' : 'No key'}\n`)
    } else {
      console.log(`  ${c.dim}Paste your API key${c.reset}`)
      apiKey = await ask(rl, `  ${c.yellow}API key${c.reset}: `)
      if (!apiKey) { console.log(`  ${c.red}API key is required.${c.reset}`); rl.close(); return }
      console.log(`  ${c.green}${icon.ok}${c.reset} Key saved\n`)
    }
  }

  // Step 4 — Name this config
  console.log(`${c.bold}  Step 4: Name this configuration${c.reset}`)
  const defaultName = `${provider.name}/${model}`
  const name = await ask(rl, `  ${c.yellow}Name${c.reset} ${c.dim}[${defaultName}]${c.reset}: `)
  const finalName = name || defaultName
  console.log(`  ${c.green}${icon.ok}${c.reset} ${finalName}\n`)

  let baseURL = getBaseURL(provider.id, provider.provider)
  if (requiresBaseURL(provider.id)) {
    console.log(`${c.bold}  Base URL${c.reset}`)
    console.log(`  ${c.dim}Enter the OpenAI-compatible endpoint, usually ending with /v1.${c.reset}`)
    baseURL = await ask(rl, `  ${c.yellow}Base URL${c.reset}: `)
    if (!baseURL) { console.log(`  ${c.red}Base URL is required.${c.reset}`); rl.close(); return }
    console.log(`  ${c.green}${icon.ok}${c.reset} ${baseURL}\n`)
  }

  const headers = await extraHeaders(provider.id, rl)
  if (headers === null) { rl.close(); return }

  const llmConfig = createModelConfigDefaults({
    providerId: provider.id,
    provider: provider.provider,
    model,
    apiKey,
    baseURL: baseURL || undefined,
    headers,
  })
  upsertModel(finalName, llmConfig)

  console.log(`${c.green}${icon.ok}${c.reset} ${c.bold}Model saved${c.reset}`)
  console.log(`   ${c.dim}Name:     ${c.reset}${c.cyan}${finalName}${c.reset}`)
  console.log(`   ${c.dim}Provider: ${c.reset}${provider.name}`)
  console.log(`   ${c.dim}Model:    ${c.reset}${model}`)
  console.log(`   ${c.dim}Base URL: ${c.reset}${baseURL || '(default)'}`)
  console.log(`   ${c.dim}Request:  ${c.reset}${JSON.stringify(llmConfig.request || {})} ${c.dim}(edit ~/.coding-memory/models.json for advanced parameters)${c.reset}`)

  if (existing.length > 0) {
    const mkCurrent = await ask(rl, `\n  ${c.yellow}Make this the active model?${c.reset} ${c.dim}[Y/n]${c.reset}: `)
    if (mkCurrent.toLowerCase() !== 'n') { switchModel(finalName); console.log(`  ${c.green}${icon.ok}${c.reset} Set as active`) }
  }

  const doTest = await ask(rl, `\n  ${c.yellow}Test connection?${c.reset} ${c.dim}[Y/n]${c.reset}: `)
  if (doTest.toLowerCase() !== 'n') await doTestConnection(llmConfig)

  console.log()
  rl.close()
}

function showModelList(): void {
  const cfg = readModels(); const models = listModels()
  printModelMigrationNotice()
  console.log(`\n${c.bold}${c.cyan}  Configured models${c.reset}\n`)
  if (models.length === 0) { console.log(`  ${c.dim}No models configured yet.${c.reset}\n  Run ${c.cyan}coding-memory config${c.reset} to add one.\n`); return }
  for (const m of models) {
    const mark = m.name === cfg.current ? ` ${c.yellow}${icon.star} active${c.reset}` : ''
    console.log(`  ${c.cyan}${m.name}${c.reset}${mark}`)
    console.log(`  ${c.dim}${icon.arrow} ${m.provider} / ${m.model}${c.reset}\n`)
  }
  console.log(`${c.dim}  Commands:${c.reset}`)
  console.log(`  ${c.cyan}coding-memory config${c.reset}           ${c.dim}Add a model${c.reset}`)
  console.log(`  ${c.cyan}coding-memory use <name>${c.reset}     ${c.dim}Switch active model${c.reset}`)
  console.log(`  ${c.cyan}coding-memory config --rm <name>${c.reset} ${c.dim}Remove a model${c.reset}\n`)
}

async function handleRemove(name: string): Promise<void> {
  if (removeModel(name)) console.log(`${c.green}${icon.ok}${c.reset} Removed ${c.cyan}${name}${c.reset}`)
  else console.log(`${c.red}${icon.err}${c.reset} Model "${name}" not found.`)
}

function handleOutputLanguage(raw: string): void {
  const normalized = raw.toLowerCase()
  if (!['zh', 'cn', 'chinese', 'en', 'english'].includes(normalized)) {
    console.log(`${c.red}${icon.err}${c.reset} Invalid output language: ${raw}`)
    console.log(`  ${c.dim}Use ${c.cyan}coding-memory config --lang zh${c.reset}${c.dim} or ${c.cyan}coding-memory config --lang en${c.reset}${c.dim}.${c.reset}`)
    return
  }
  const outputLanguage = ['en', 'english'].includes(normalized) ? 'en' : 'zh'
  updateConfig({ outputLanguage })
  const label = outputLanguage === 'en' ? 'English' : '中文'
  console.log(`${c.green}${icon.ok}${c.reset} Output language set to ${c.cyan}${label}${c.reset}`)
  console.log(`  ${c.dim}Current skillsDir: ${readConfig().skillsDir}${c.reset}`)
}

async function doTestConnection(config: LLMConfig): Promise<void> {
  process.stdout.write(`  ${c.dim}Testing...${c.reset} `)
  const result = await testConnection(config)
  if (result.ok) { console.log(`${c.green}${icon.ok} Connected${c.reset}`); console.log(`  ${c.dim}${result.message}${c.reset}`) }
  else { console.log(`${c.red}${icon.err} Failed${c.reset}`); console.log(`  ${c.dim}${result.message.slice(0, 120)}${c.reset}`) }
}

/** Default minimal model config. Users can edit request for advanced parameters. */
export function createModelConfigDefaults(input: {
  providerId: string
  provider: LLMConfig['provider']
  model: string
  apiKey: string
  baseURL?: string
  headers?: Record<string, string>
}): LLMConfig {
  const llmConfig: LLMConfig = {
    provider: input.provider,
    model: input.model,
    apiKey: input.apiKey,
    baseURL: input.baseURL,
    request: input.headers ? { headers: input.headers } : {},
  }
  return llmConfig
}

function printModelMigrationNotice(): void {
  const migration = consumeModelsMigrationNotice()
  if (!migration.migrated) return
  console.log(`${c.yellow}${icon.arrow}${c.reset} models.json upgraded to request-based advanced parameters.`)
  console.log(`  ${c.dim}Migrated: ${migration.modelNames.join(', ') || '(unknown)'}. Legacy temperature/maxTokens/options/headers were copied into request.${c.reset}`)
}

async function extraHeaders(
  providerId: string,
  rl: ReturnType<typeof createInterface>,
): Promise<Record<string, string> | undefined | null> {
  if (providerId !== 'wandb') return undefined

  console.log(`${c.bold}  W&B project${c.reset}`)
  console.log(`  ${c.dim}Enter the W&B entity/project used by Inference, for example my-team/coding-memory.${c.reset}`)
  const project = await ask(rl, `  ${c.yellow}Project${c.reset}: `)
  if (!project) {
    console.log(`  ${c.red}W&B project is required for this preset.${c.reset}`)
    return null
  }
  console.log(`  ${c.green}${icon.ok}${c.reset} ${project}\n`)
  return { 'OpenAI-Project': project }
}

function requiresBaseURL(providerId: string): boolean {
  return providerId === 'custom'
}
