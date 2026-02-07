/**
 * OpenAI-compatible Converse Service
 *
 * Provides the same interface as the Bedrock ConverseService but routes
 * requests to OpenAI-compatible API endpoints. Converts between Bedrock
 * Converse API format and OpenAI Chat Completions API format so the
 * frontend can remain unchanged.
 */

import type { ConverseCommandOutput, ConverseStreamCommandOutput } from '@aws-sdk/client-bedrock-runtime'
import type { CallConverseAPIProps, OpenAICompatibleConfig, ServiceContext } from '../bedrock/types'
import { buildOpenAIRequest } from './messageConverter'
import { createCategoryLogger } from '../../../common/logger'

const logger = createCategoryLogger('openai-compatible:converse')

/**
 * Service that talks to OpenAI-compatible API endpoints
 */
export class OpenAIConverseService {
  private static readonly MAX_RETRIES = 5
  private static readonly RETRY_DELAY = 3000

  constructor(private context: ServiceContext) {}

  private getConfig(): OpenAICompatibleConfig {
    const config = this.context.store.get('openaiCompatible') as OpenAICompatibleConfig | undefined
    if (!config || !config.apiKey || !config.baseUrl) {
      throw new Error(
        'OpenAI-compatible API is not configured. Please set API key and base URL in settings.'
      )
    }
    return config
  }

  /**
   * Non-streaming converse call
   */
  async converse(props: CallConverseAPIProps, retries = 0): Promise<ConverseCommandOutput> {
    try {
      const config = this.getConfig()
      const inferenceConfig = props.inferenceConfig ?? this.context.store.get('inferenceParams')

      const request = buildOpenAIRequest({
        modelId: props.modelId,
        messages: props.messages,
        system: props.system,
        toolConfig: props.toolConfig,
        inferenceConfig,
        stream: false
      })

      const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`

      logger.debug('Sending non-streaming request', {
        modelId: props.modelId,
        baseUrl: config.baseUrl,
        messageCount: props.messages.length
      })

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(request)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`)
      }

      const data = await response.json()
      return this.convertNonStreamingResponse(data)
    } catch (error: any) {
      return this.handleError(error, props, retries)
    }
  }

  /**
   * Streaming converse call - returns an object with a stream property
   * that yields Bedrock-format stream events
   */
  async converseStream(
    props: CallConverseAPIProps,
    retries = 0
  ): Promise<ConverseStreamCommandOutput> {
    try {
      const config = this.getConfig()
      const inferenceConfig = props.inferenceConfig ?? this.context.store.get('inferenceParams')

      const request = buildOpenAIRequest({
        modelId: props.modelId,
        messages: props.messages,
        system: props.system,
        toolConfig: props.toolConfig,
        inferenceConfig,
        stream: true
      })

      const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`

      logger.debug('Sending streaming request', {
        modelId: props.modelId,
        baseUrl: config.baseUrl,
        messageCount: props.messages.length
      })

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(request)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`)
      }

      const stream = this.createBedrockStreamFromOpenAI(response)

      return {
        stream,
        $metadata: {}
      } as ConverseStreamCommandOutput
    } catch (error: any) {
      return this.handleStreamError(error, props, retries)
    }
  }

  /**
   * Convert OpenAI SSE stream to Bedrock-format async iterable stream
   */
  private createBedrockStreamFromOpenAI(response: Response): AsyncIterable<any> {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()

    return {
      [Symbol.asyncIterator]() {
        let done = false
        let buffer = ''
        let contentBlockIndex = 0
        let currentToolCallIndex = -1
        let toolCallAccumulator: Map<
          number,
          { id: string; name: string; arguments: string }
        > = new Map()
        let messageStartSent = false
        let currentContentBlockOpen = false
        let inputTokens = 0
        let outputTokens = 0
        const pendingEvents: any[] = []

        return {
          async next(): Promise<IteratorResult<any>> {
            // Return pending events first
            if (pendingEvents.length > 0) {
              return { done: false, value: pendingEvents.shift() }
            }

            if (done) {
              return { done: true, value: undefined }
            }

            while (true) {
              const { done: readDone, value } = await reader.read()

              if (readDone) {
                done = true

                // Close any open content block
                if (currentContentBlockOpen) {
                  pendingEvents.push({
                    contentBlockStop: { contentBlockIndex: contentBlockIndex - 1 }
                  })
                  currentContentBlockOpen = false
                }

                // Flush accumulated tool calls
                for (const [idx, tool] of toolCallAccumulator) {
                  pendingEvents.push({
                    contentBlockStart: {
                      start: {
                        toolUse: {
                          toolUseId: tool.id,
                          name: tool.name
                        }
                      },
                      contentBlockIndex
                    }
                  })

                  if (tool.arguments) {
                    pendingEvents.push({
                      contentBlockDelta: {
                        delta: {
                          toolUse: { input: tool.arguments }
                        },
                        contentBlockIndex
                      }
                    })
                  }

                  pendingEvents.push({
                    contentBlockStop: { contentBlockIndex }
                  })

                  contentBlockIndex++
                }
                toolCallAccumulator.clear()

                // Add stop and metadata
                pendingEvents.push({
                  messageStop: { stopReason: 'end_turn' }
                })

                pendingEvents.push({
                  metadata: {
                    usage: { inputTokens, outputTokens },
                    metrics: { latencyMs: 0 }
                  }
                })

                if (pendingEvents.length > 0) {
                  return { done: false, value: pendingEvents.shift() }
                }

                reader.releaseLock()
                return { done: true, value: undefined }
              }

              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''

              for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed || !trimmed.startsWith('data: ')) continue
                const data = trimmed.slice(6)
                if (data === '[DONE]') continue

                try {
                  const parsed = JSON.parse(data)
                  const choice = parsed.choices?.[0]
                  if (!choice) continue

                  // Track usage if provided
                  if (parsed.usage) {
                    inputTokens = parsed.usage.prompt_tokens || 0
                    outputTokens = parsed.usage.completion_tokens || 0
                  }

                  const delta = choice.delta
                  if (!delta) continue

                  // Send messageStart on first delta
                  if (!messageStartSent) {
                    pendingEvents.push({
                      messageStart: { role: 'assistant' }
                    })
                    messageStartSent = true
                  }

                  // Handle text content
                  if (delta.content !== undefined && delta.content !== null) {
                    if (!currentContentBlockOpen) {
                      pendingEvents.push({
                        contentBlockStart: {
                          start: { text: '' },
                          contentBlockIndex
                        }
                      })
                      currentContentBlockOpen = true
                    }

                    pendingEvents.push({
                      contentBlockDelta: {
                        delta: { text: delta.content },
                        contentBlockIndex
                      }
                    })
                  }

                  // Handle tool calls
                  if (delta.tool_calls) {
                    // Close text content block if open
                    if (currentContentBlockOpen) {
                      pendingEvents.push({
                        contentBlockStop: { contentBlockIndex }
                      })
                      contentBlockIndex++
                      currentContentBlockOpen = false
                    }

                    for (const tc of delta.tool_calls) {
                      const tcIndex = tc.index ?? 0

                      if (!toolCallAccumulator.has(tcIndex)) {
                        toolCallAccumulator.set(tcIndex, {
                          id: tc.id || `call_${Date.now()}_${tcIndex}`,
                          name: tc.function?.name || '',
                          arguments: ''
                        })
                      }

                      const acc = toolCallAccumulator.get(tcIndex)!
                      if (tc.id) acc.id = tc.id
                      if (tc.function?.name) acc.name = tc.function.name
                      if (tc.function?.arguments) acc.arguments += tc.function.arguments
                    }
                  }

                  // Handle finish reason
                  if (choice.finish_reason) {
                    // Close text content block if open
                    if (currentContentBlockOpen) {
                      pendingEvents.push({
                        contentBlockStop: { contentBlockIndex }
                      })
                      contentBlockIndex++
                      currentContentBlockOpen = false
                    }

                    // Emit tool calls
                    for (const [idx, tool] of toolCallAccumulator) {
                      pendingEvents.push({
                        contentBlockStart: {
                          start: {
                            toolUse: {
                              toolUseId: tool.id,
                              name: tool.name
                            }
                          },
                          contentBlockIndex
                        }
                      })

                      if (tool.arguments) {
                        pendingEvents.push({
                          contentBlockDelta: {
                            delta: {
                              toolUse: { input: tool.arguments }
                            },
                            contentBlockIndex
                          }
                        })
                      }

                      pendingEvents.push({
                        contentBlockStop: { contentBlockIndex }
                      })
                      contentBlockIndex++
                    }
                    toolCallAccumulator.clear()

                    // Map finish reason
                    let stopReason = 'end_turn'
                    if (choice.finish_reason === 'tool_calls') stopReason = 'tool_use'
                    else if (choice.finish_reason === 'length') stopReason = 'max_tokens'

                    pendingEvents.push({
                      messageStop: { stopReason }
                    })

                    pendingEvents.push({
                      metadata: {
                        usage: { inputTokens, outputTokens },
                        metrics: { latencyMs: 0 }
                      }
                    })

                    done = true
                  }
                } catch (e) {
                  // Skip unparseable lines
                  logger.debug('Skipping unparseable SSE line', { line: trimmed })
                }
              }

              if (pendingEvents.length > 0) {
                return { done: false, value: pendingEvents.shift() }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Convert non-streaming OpenAI response to Bedrock ConverseCommandOutput format
   */
  private convertNonStreamingResponse(data: any): ConverseCommandOutput {
    const choice = data.choices?.[0]
    if (!choice) {
      throw new Error('No choices in OpenAI response')
    }

    const message = choice.message
    const contentBlocks: any[] = []

    // Add text content
    if (message.content) {
      contentBlocks.push({ text: message.content })
    }

    // Add tool calls
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        let input: any = {}
        try {
          input = JSON.parse(tc.function.arguments)
        } catch {
          input = { raw: tc.function.arguments }
        }

        contentBlocks.push({
          toolUse: {
            toolUseId: tc.id,
            name: tc.function.name,
            input
          }
        })
      }
    }

    // Map finish reason
    let stopReason = 'end_turn'
    if (choice.finish_reason === 'tool_calls') stopReason = 'tool_use'
    else if (choice.finish_reason === 'length') stopReason = 'max_tokens'

    return {
      output: {
        message: {
          role: 'assistant',
          content: contentBlocks
        }
      },
      stopReason,
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      },
      $metadata: {}
    } as ConverseCommandOutput
  }

  /**
   * Error handler for non-streaming requests
   */
  private async handleError(
    error: any,
    props: CallConverseAPIProps,
    retries: number
  ): Promise<ConverseCommandOutput> {
    if (retries >= OpenAIConverseService.MAX_RETRIES) {
      logger.error('Maximum retries reached for OpenAI-compatible API request', {
        maxRetries: OpenAIConverseService.MAX_RETRIES,
        errorMessage: error.message,
        modelId: props.modelId
      })
      throw error
    }

    // Retry on rate limit (429) or server errors (5xx)
    if (error.message?.includes('429') || error.message?.includes('5')) {
      logger.warn('Rate limited or server error, retrying', {
        retry: retries,
        errorMessage: error.message,
        modelId: props.modelId
      })
      await new Promise((resolve) => setTimeout(resolve, OpenAIConverseService.RETRY_DELAY))
      return this.converse(props, retries + 1)
    }

    throw error
  }

  /**
   * Error handler for streaming requests
   */
  private async handleStreamError(
    error: any,
    props: CallConverseAPIProps,
    retries: number
  ): Promise<ConverseStreamCommandOutput> {
    if (retries >= OpenAIConverseService.MAX_RETRIES) {
      logger.error('Maximum retries reached for OpenAI-compatible streaming request', {
        maxRetries: OpenAIConverseService.MAX_RETRIES,
        errorMessage: error.message,
        modelId: props.modelId
      })
      throw error
    }

    if (error.message?.includes('429') || error.message?.includes('5')) {
      logger.warn('Rate limited or server error, retrying stream', {
        retry: retries,
        errorMessage: error.message,
        modelId: props.modelId
      })
      await new Promise((resolve) => setTimeout(resolve, OpenAIConverseService.RETRY_DELAY))
      return this.converseStream(props, retries + 1)
    }

    throw error
  }
}
