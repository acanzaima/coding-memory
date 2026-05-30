/**
 * LLM provider definitions.
 *
 * Model references are manually curated. To refresh from the community
 * database, run:  node scripts/sync-providers.mjs
 *
 * Source: LiteLLM model_prices_and_context_window.json
 * (used by Cline, Aider, Continue, and others)
 */

import type { LLMConfig } from '../types.js'

export interface ProviderPreset {
  id: string
  name: string
  provider: LLMConfig['provider']
  models: ModelPreset[]
}

export interface ModelPreset {
  id: string
  name: string
  description?: string
}

export const providerPresets: ProviderPreset[] = [
  // ═══════════════════════════════════════════════════════════
  // Tier 1
  // ═══════════════════════════════════════════════════════════
  {
    id: 'openai',
    name: 'OpenAI',
    provider: 'openai',
    models: [
      { id: 'gpt-5.5', name: 'GPT-5.5', description: 'Latest frontier' },
      { id: 'gpt-5.4', name: 'GPT-5.4', description: 'More affordable frontier' },
      { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', description: 'Lighter & faster' },
      { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano', description: 'Lowest latency' },
      { id: 'gpt-4.1', name: 'GPT-4.1', description: '1M context' },
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Multimodal' },
      { id: 'o3', name: 'o3', description: 'Deep reasoning' },
      { id: 'o4-mini', name: 'o4-mini', description: 'Fast reasoning' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    provider: 'anthropic',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: 'Best balance' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', description: 'Most capable' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', description: 'Fast' },
    ],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    provider: 'openai-compatible',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Stable flagship' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Fast' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', description: 'Low latency' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    provider: 'openai-compatible',
    models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', description: 'Latest flagship, 1M context' },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', description: 'Fast, 1M (replaces chat/reasoner)' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // Tier 2
  // ═══════════════════════════════════════════════════════════
  {
    id: 'xai',
    name: 'xAI Grok',
    provider: 'openai-compatible',
    models: [
      { id: 'grok-4.3', name: 'Grok 4.3', description: 'Latest flagship' },
      { id: 'grok-4', name: 'Grok 4', description: 'Legacy alias redirects to latest' },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    provider: 'openai-compatible',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', description: 'Flagship chat' },
      { id: 'mistral-small-latest', name: 'Mistral Small', description: 'Fast general chat' },
      { id: 'codestral-latest', name: 'Codestral', description: 'Code-specialized' },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    provider: 'openai-compatible',
    models: [
      { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', description: 'Via OpenRouter' },
      { id: 'openai/gpt-5.5', name: 'OpenAI GPT-5.5', description: 'Via OpenRouter' },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Via OpenRouter' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    provider: 'openai-compatible',
    models: [
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', description: 'Fast OSS model' },
      { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', description: 'Fast lightweight OSS model' },
    ],
  },
  {
    id: 'together',
    name: 'Together AI',
    provider: 'openai-compatible',
    models: [
      { id: 'zai-org/GLM-5.1', name: 'GLM-5.1', description: 'Agentic coding' },
      { id: 'moonshotai/Kimi-K2.6', name: 'Kimi K2.6', description: 'Agentic multimodal' },
      { id: 'deepseek-ai/DeepSeek-V4-Pro', name: 'DeepSeek V4 Pro', description: 'Reasoning and coding' },
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', description: 'Open-weight reasoning' },
      { id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct', name: 'Qwen3 Coder 480B', description: 'Agentic coding' },
    ],
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    provider: 'openai-compatible',
    models: [
      { id: 'accounts/fireworks/models/kimi-k2p5', name: 'Kimi K2.5', description: 'Agentic' },
    ],
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    provider: 'openai-compatible',
    models: [
      { id: 'gpt-oss-120b', name: 'GPT-OSS 120B', description: 'Production model' },
    ],
  },
  {
    id: 'wandb',
    name: 'Weights & Biases',
    provider: 'openai-compatible',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', description: 'Documented W&B model' },
      { id: 'deepseek-ai/DeepSeek-R1-0528', name: 'DeepSeek R1', description: 'Reasoning' },
      { id: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', name: 'Llama 4 Scout', description: 'Fast' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // Chinese providers
  // ═══════════════════════════════════════════════════════════
  {
    id: 'zhipu',
    name: '智谱 Z.AI (GLM)',
    provider: 'openai-compatible',
    models: [
      { id: 'glm-5.1', name: 'GLM-5.1', description: '最新旗舰' },
      { id: 'glm-5', name: 'GLM-5', description: '前代旗舰' },
      { id: 'glm-4.7', name: 'GLM-4.7', description: '高性能' },
    ],
  },
  {
    id: 'qwen',
    name: '通义千问 Qwen',
    provider: 'openai-compatible',
    models: [
      { id: 'qwen3-coder-plus', name: 'Qwen3 Coder Plus', description: '旗舰代码模型' },
    ],
  },
  {
    id: 'moonshot',
    name: '月之暗面 Moonshot (Kimi)',
    provider: 'openai-compatible',
    models: [
      { id: 'kimi-k2.5', name: 'Kimi K2.5', description: '最新旗舰，支持视觉' },
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    provider: 'openai-compatible',
    models: [
      { id: 'MiniMax-M2.7', name: 'MiniMax M2.7', description: '最新旗舰' },
      { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax M2.7 Highspeed', description: '高速版本' },
      { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', description: '前代旗舰' },
    ],
  },
  {
    id: 'doubao',
    name: '字节豆包 (ByteDance)',
    provider: 'openai-compatible',
    models: [],
  },
  // ═══════════════════════════════════════════════════════════
  // Local / Self-hosted
  // ═══════════════════════════════════════════════════════════
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    provider: 'ollama',
    models: [
      { id: 'qwen3:14b', name: 'Qwen 3 14B', description: 'Alibaba' },
      { id: 'deepseek-r1:14b', name: 'DeepSeek R1 14B', description: 'Reasoning' },
      { id: 'codestral:22b', name: 'Codestral 22B', description: 'Code' },
    ],
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (Local)',
    provider: 'openai-compatible',
    models: [
      { id: 'local-model', name: 'Local Model', description: 'Loaded in LM Studio' },
    ],
  },
  {
    id: 'vllm',
    name: 'vLLM / SGLang (Self-hosted)',
    provider: 'openai-compatible',
    models: [
      { id: 'default', name: 'Default model', description: 'OpenAI-compatible endpoint' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // Custom
  // ═══════════════════════════════════════════════════════════
  {
    id: 'custom',
    name: '自定义兼容接口 (OpenAI-compatible)',
    provider: 'custom',
    models: [],
  },
]

/**
 * Default base URLs. The `/v1` suffix is intentionally included/excluded
 * to match each provider's documented API prefix exactly, since our
 * llm/client.ts appends `/chat/completions` to this base.
 */
export const defaultBaseURLs: Record<string, string> = {
  openai:     'https://api.openai.com/v1',
  anthropic:  'https://api.anthropic.com',
  google:     'https://generativelanguage.googleapis.com/v1beta/openai',
  deepseek:   'https://api.deepseek.com',
  xai:        'https://api.x.ai/v1',
  mistral:    'https://api.mistral.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq:       'https://api.groq.com/openai/v1',
  together:   'https://api.together.xyz/v1',
  fireworks:  'https://api.fireworks.ai/inference/v1',
  cerebras:   'https://api.cerebras.ai/v1',
  wandb:      'https://api.inference.wandb.ai/v1',

  zhipu:      'https://open.bigmodel.cn/api/paas/v4',
  qwen:       'https://dashscope.aliyuncs.com/compatible-mode/v1',
  moonshot:   'https://api.moonshot.cn/v1',
  minimax:    'https://api.minimax.io/v1',
  doubao:     'https://ark.cn-beijing.volces.com/api/v3',

  ollama:     'http://localhost:11434/v1',
  lmstudio:   'http://localhost:1234/v1',
  vllm:       'http://localhost:8000/v1',
}

export function getBaseURL(presetId: string, provider: LLMConfig['provider']): string {
  if (provider === 'openai') return defaultBaseURLs.openai
  if (provider === 'ollama') return defaultBaseURLs.ollama
  return defaultBaseURLs[presetId] || ''
}

export function getEnvVarName(presetId: string): string {
  const envMap: Record<string, string> = {
    openai:     'OPENAI_API_KEY',
    anthropic:  'ANTHROPIC_API_KEY',
    google:     'GEMINI_API_KEY',
    deepseek:   'DEEPSEEK_API_KEY',
    xai:        'XAI_API_KEY',
    mistral:    'MISTRAL_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    groq:       'GROQ_API_KEY',
    together:   'TOGETHER_API_KEY',
    fireworks:  'FIREWORKS_API_KEY',
    cerebras:   'CEREBRAS_API_KEY',
    wandb:      'WANDB_API_KEY',
    zhipu:      'ZHIPU_API_KEY',
    qwen:       'DASHSCOPE_API_KEY',
    moonshot:   'MOONSHOT_API_KEY',
    minimax:    'MINIMAX_API_KEY',
    doubao:     'ARK_API_KEY',
    ollama:     'OLLAMA_API_KEY',
    lmstudio:   'LM_STUDIO_API_KEY',
    vllm:       'VLLM_API_KEY',
  }
  return envMap[presetId] || `${presetId.toUpperCase()}_API_KEY`
}
