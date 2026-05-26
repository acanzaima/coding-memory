#!/usr/bin/env node
/**
 * Sync provider presets from LiteLLM's community-maintained model database.
 *
 * Usage:
 *   node scripts/sync-providers.mjs
 *
 * Source:
 *   https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json
 *
 * This is the single source of truth used by Cline, Aider, Continue, and others.
 * Run this before publishing a new version to see what models have been added/updated.
 *
 * Note: some providers (especially Chinese ones) may lag behind official docs.
 * Always cross-check with official API docs for critical providers.
 */

import { writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

const PROVIDER_MAP = {
  openai:           { id: 'openai',    name: 'OpenAI' },
  anthropic:        { id: 'anthropic', name: 'Anthropic Claude' },
  gemini:           { id: 'google',    name: 'Google Gemini' },
  deepseek:         { id: 'deepseek',  name: 'DeepSeek' },
  xai:              { id: 'xai',       name: 'xAI Grok' },
  mistral:          { id: 'mistral',   name: 'Mistral AI' },
  openrouter:       { id: 'openrouter',name: 'OpenRouter' },
  groq:             { id: 'groq',      name: 'Groq' },
  together_ai:      { id: 'together',  name: 'Together AI' },
  fireworks_ai:     { id: 'fireworks', name: 'Fireworks AI' },
  cerebras:         { id: 'cerebras',  name: 'Cerebras' },
  cohere_chat:      { id: 'cohere',    name: 'Cohere' },
}

/** Filter out noise: fine-tuned, embedding, moderation, old snapshots */
function isRelevantModel(modelId, info) {
  if (info.mode && info.mode !== 'chat') return false
  if (modelId.startsWith('ft:')) return false          // fine-tuned
  if (modelId.includes('embedding')) return false
  if (modelId.includes('moderation')) return false
  if (modelId.includes('davinci')) return false        // old completion models
  if (modelId.includes('babbage')) return false
  // Filter out generic "up-to-N-billion" pricing tiers
  if (/^\d+(\.\d+)?b-to-\d+(\.\d+)?b$/.test(info.model)) return false
  if (info.model === 'fireworks-ai-default') return false
  if (info.model === 'fireworks-ai-moe-up-to-56b') return false
  return true
}

async function main() {
  console.log('Fetching LiteLLM model database...')
  const res = await fetch(DB_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const db = await res.json()

  const providers = {}

  for (const [modelId, info] of Object.entries(db)) {
    const providerKey = info.litellm_provider
    if (!providerKey || !PROVIDER_MAP[providerKey]) continue
    if (!isRelevantModel(modelId, info)) continue

    const pid = PROVIDER_MAP[providerKey].id
    if (!providers[pid]) providers[pid] = { name: PROVIDER_MAP[providerKey].name, models: [] }

    const ctx = info.max_input_tokens || info.max_tokens || 0
    providers[pid].models.push({
      model: modelId,
      context: ctx,
    })
  }

  // Sort each provider's models by context window (bigger = newer/more capable)
  // then take top 8
  for (const p of Object.values(providers)) {
    p.models.sort((a, b) => b.context - a.context)
    p.models = p.models.slice(0, 8).map(m => ({
      model: m.model,
      context: m.context >= 1_000_000 ? `${(m.context / 1_000_000).toFixed(1)}M` :
               m.context >= 1_000 ? `${Math.round(m.context / 1_000)}K` : '',
    }))
  }

  const total = Object.values(providers).reduce((s, p) => s + p.models.length, 0)
  const outPath = join(__dirname, '..', 'src', 'llm', 'litellm-models.json')
  writeFileSync(outPath, JSON.stringify({ updated: new Date().toISOString(), total, providers }, null, 2))
  console.log(`Done — ${total} models across ${Object.keys(providers).length} providers\n`)

  // Show top models vs current presets
  const presetsPath = join(__dirname, '..', 'dist', 'llm', 'providers.js')
  let currentPresets = {}
  try {
    currentPresets = await import(`file://${presetsPath}`)
  } catch { /* dist not built yet */ }

  for (const [pid, p] of Object.entries(providers)) {
    const current = currentPresets.providerPresets?.find?.(x => x.id === pid)
    const curFirst = current?.models?.[0]?.id || '(none)'
    const newFirst = p.models[0]?.model || '(none)'
    const status = curFirst === newFirst ? '✓' : '⚠ DIFF'
    console.log(`  ${p.name}:`)
    console.log(`    current e.g.: ${curFirst}`)
    console.log(`    litellm e.g.: ${newFirst}  ${status}`)
    if (curFirst !== newFirst) {
      console.log(`    top models:  ${p.models.slice(0, 4).map(m => m.model).join(', ')}`)
    }
  }
}

main().catch(err => { console.error(err); process.exit(1) })
