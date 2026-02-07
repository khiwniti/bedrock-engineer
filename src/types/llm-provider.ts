/**
 * Shared types for LLM provider configuration.
 * These types are used by both main process and renderer process.
 */

/**
 * LLM Provider type - determines which backend to use for inference
 */
export type LLMProvider = 'bedrock' | 'openai-compatible'

/**
 * Configuration for OpenAI-compatible API endpoints
 */
export type OpenAICompatibleConfig = {
  /** API key for authentication */
  apiKey: string
  /** Base URL of the API endpoint (e.g., https://api.openai.com/v1) */
  baseUrl: string
  /** Custom model definitions available via this endpoint */
  customModels: OpenAICompatibleModel[]
}

/**
 * Custom model definition for OpenAI-compatible providers
 */
export type OpenAICompatibleModel = {
  /** Model ID to send in API requests */
  modelId: string
  /** Display name in the UI */
  modelName: string
  /** Whether the model supports tool/function calling */
  toolUse: boolean
  /** Maximum output tokens the model supports */
  maxTokensLimit: number
  /** Whether the model supports extended thinking */
  supportsThinking?: boolean
}
