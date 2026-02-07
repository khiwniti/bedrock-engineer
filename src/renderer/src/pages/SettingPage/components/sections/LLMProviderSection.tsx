import React from 'react'
import { useTranslation } from 'react-i18next'
import { FcMindMap } from 'react-icons/fc'
import { SettingSection } from '../SettingSection'
import type { LLMProvider } from '@/types/llm-provider'

interface LLMProviderSectionProps {
  currentProvider: LLMProvider
  onChangeProvider: (provider: LLMProvider) => void
}

export const LLMProviderSection: React.FC<LLMProviderSectionProps> = ({
  currentProvider,
  onChangeProvider
}) => {
  const { t } = useTranslation()

  const providers: { value: LLMProvider; label: string; description: string }[] = [
    {
      value: 'bedrock',
      label: t('Amazon Bedrock'),
      description: t(
        'Use AWS credentials to access models via Amazon Bedrock. Supports Claude, Nova, Stability AI, and more.'
      )
    },
    {
      value: 'openai-compatible',
      label: t('OpenAI Compatible'),
      description: t(
        'Use any OpenAI-compatible API endpoint. Works with OpenAI, Azure OpenAI, Ollama, LM Studio, vLLM, and more. No AWS credentials required.'
      )
    }
  ]

  return (
    <SettingSection title={t('LLM Provider')} icon={FcMindMap}>
      <div className="space-y-3">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          {t('Select the LLM provider to use for AI conversations.')}
        </p>

        <div className="grid grid-cols-1 gap-3">
          {providers.map((provider) => (
            <label
              key={provider.value}
              className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors
                ${
                  currentProvider === provider.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
            >
              <input
                type="radio"
                name="llmProvider"
                value={provider.value}
                checked={currentProvider === provider.value}
                onChange={() => onChangeProvider(provider.value)}
                className="mt-1 form-radio h-4 w-4 text-blue-600 border-gray-300
                  focus:ring-blue-500 dark:focus:ring-blue-600"
              />
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {provider.label}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {provider.description}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </SettingSection>
  )
}
