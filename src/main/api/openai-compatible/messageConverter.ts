/**
 * Converts between Amazon Bedrock Converse API message format and
 * OpenAI Chat Completions API message format.
 *
 * This allows the frontend to continue using the Bedrock message format
 * while the backend can route to either Bedrock or OpenAI-compatible APIs.
 */

import type { Message, SystemContentBlock, ToolConfiguration } from '@aws-sdk/client-bedrock-runtime'

// OpenAI message types
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

export interface OpenAIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

export interface OpenAIChatCompletionRequest {
  model: string
  messages: OpenAIMessage[]
  tools?: OpenAITool[]
  tool_choice?: 'auto' | 'none' | 'required'
  max_tokens?: number
  temperature?: number
  top_p?: number
  stream?: boolean
}

/**
 * Convert Bedrock system content blocks to OpenAI system message
 */
export function convertSystemToOpenAI(system?: SystemContentBlock[]): OpenAIMessage | null {
  if (!system || system.length === 0) return null

  const text = system
    .map((block) => {
      if ('text' in block && block.text) return block.text
      return ''
    })
    .filter(Boolean)
    .join('\n')

  if (!text) return null

  return { role: 'system', content: text }
}

/**
 * Convert Bedrock messages to OpenAI messages
 */
export function convertMessagesToOpenAI(messages: Message[]): OpenAIMessage[] {
  const result: OpenAIMessage[] = []

  for (const msg of messages) {
    if (!msg.content || !Array.isArray(msg.content)) continue

    if (msg.role === 'user') {
      // Check for tool results
      const toolResults = msg.content.filter((block) => 'toolResult' in block && block.toolResult)
      const textBlocks = msg.content.filter((block) => 'text' in block && block.text)

      // Add tool result messages
      for (const block of toolResults) {
        const toolResult = block.toolResult!
        const resultContent = toolResult.content
          ?.map((c) => {
            if ('text' in c && c.text) return c.text
            if ('json' in c && c.json) return JSON.stringify(c.json)
            return ''
          })
          .filter(Boolean)
          .join('\n')

        result.push({
          role: 'tool',
          content: resultContent || '',
          tool_call_id: toolResult.toolUseId || ''
        })
      }

      // Add text messages
      if (textBlocks.length > 0) {
        const text = textBlocks
          .map((block) => {
            if ('text' in block && block.text) return block.text
            return ''
          })
          .filter(Boolean)
          .join('\n')

        if (text) {
          result.push({ role: 'user', content: text })
        }
      } else if (toolResults.length === 0) {
        // No tool results and no text - add empty user message
        result.push({ role: 'user', content: '' })
      }
    } else if (msg.role === 'assistant') {
      const textParts: string[] = []
      const toolCalls: OpenAIToolCall[] = []

      for (const block of msg.content) {
        if ('text' in block && block.text) {
          textParts.push(block.text)
        } else if ('toolUse' in block && block.toolUse) {
          toolCalls.push({
            id: block.toolUse.toolUseId || `call_${Date.now()}`,
            type: 'function',
            function: {
              name: block.toolUse.name || '',
              arguments:
                typeof block.toolUse.input === 'string'
                  ? block.toolUse.input
                  : JSON.stringify(block.toolUse.input || {})
            }
          })
        }
      }

      const assistantMsg: OpenAIMessage = {
        role: 'assistant',
        content: textParts.length > 0 ? textParts.join('\n') : null
      }

      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls
      }

      result.push(assistantMsg)
    }
  }

  return result
}

/**
 * Convert Bedrock tool config to OpenAI tools format
 */
export function convertToolConfigToOpenAI(toolConfig?: ToolConfiguration): OpenAITool[] | undefined {
  if (!toolConfig?.tools || toolConfig.tools.length === 0) return undefined

  return toolConfig.tools
    .filter((tool) => tool.toolSpec)
    .map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.toolSpec!.name || '',
        description: tool.toolSpec!.description || '',
        parameters: (tool.toolSpec!.inputSchema as any)?.json || {}
      }
    }))
}

/**
 * Build a complete OpenAI Chat Completions request from Bedrock Converse API params
 */
export function buildOpenAIRequest(params: {
  modelId: string
  messages: Message[]
  system?: SystemContentBlock[]
  toolConfig?: ToolConfiguration
  inferenceConfig?: { maxTokens?: number; temperature?: number; topP?: number }
  stream?: boolean
}): OpenAIChatCompletionRequest {
  const openaiMessages: OpenAIMessage[] = []

  // Add system message
  const systemMsg = convertSystemToOpenAI(params.system)
  if (systemMsg) {
    openaiMessages.push(systemMsg)
  }

  // Add conversation messages
  openaiMessages.push(...convertMessagesToOpenAI(params.messages))

  const request: OpenAIChatCompletionRequest = {
    model: params.modelId,
    messages: openaiMessages,
    stream: params.stream ?? true
  }

  // Add tools
  const tools = convertToolConfigToOpenAI(params.toolConfig)
  if (tools && tools.length > 0) {
    request.tools = tools
    request.tool_choice = 'auto'
  }

  // Add inference params
  if (params.inferenceConfig) {
    if (params.inferenceConfig.maxTokens) {
      request.max_tokens = params.inferenceConfig.maxTokens
    }
    if (params.inferenceConfig.temperature !== undefined) {
      request.temperature = params.inferenceConfig.temperature
    }
    if (params.inferenceConfig.topP !== undefined) {
      request.top_p = params.inferenceConfig.topP
    }
  }

  return request
}
