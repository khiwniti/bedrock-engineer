import React from 'react'
import { useTranslation } from 'react-i18next'
import { FcElectronics, FcMindMap } from 'react-icons/fc'
import { SettingSection } from '../SettingSection'
import { SettingInput } from '../SettingInput'
import { SettingSelect } from '../SettingSelect'
import { ThinkingModeSettings } from '../ThinkingModeSettings'
import { LLM } from '@/types/llm'

interface ModelSettingsSectionProps {
  currentLLM: LLM
  availableModels: LLM[]
  inferenceParams: {
    maxTokens: number
    temperature: number
    topP?: number
  }
  onUpdateLLM: (modelId: string) => void
  onUpdateInferenceParams: (params: Partial<ModelSettingsSectionProps['inferenceParams']>) => void
  providerLabel?: string
}

export const ModelSettingsSection: React.FC<ModelSettingsSectionProps> = ({
  currentLLM,
  availableModels,
  inferenceParams,
  onUpdateLLM,
  onUpdateInferenceParams,
  providerLabel
}) => {
  const { t } = useTranslation()

  const modelOptions = availableModels.map((model) => ({
    value: model.modelId,
    label: model.modelName
  }))

  const sectionTitle = providerLabel
    ? `${providerLabel} - ${t('LLM (Large Language Model)')}`
    : t('LLM (Large Language Model)')

  return (
    <>
      <SettingSection title={sectionTitle} icon={FcElectronics}>
        <div className="space-y-4">
          {availableModels.length > 0 ? (
            <SettingSelect
              label={t('LLM (Large Language Model)')}
              value={currentLLM?.modelId}
              options={modelOptions}
              onChange={(e) => onUpdateLLM(e.target.value)}
            />
          ) : (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                {t(
                  'No models available. Please check your provider configuration in settings above.'
                )}
              </p>
            </div>
          )}
        </div>
      </SettingSection>

      <SettingSection title={t('Inference Parameters')} icon={FcMindMap}>
        <div className="space-y-4">
          <SettingInput
            label={t('Max Tokens')}
            type="number"
            placeholder={t('Max tokens')}
            value={inferenceParams.maxTokens}
            min={1}
            max={currentLLM?.maxTokensLimit || 8192}
            onChange={(e) => {
              onUpdateInferenceParams({ maxTokens: parseInt(e.target.value, 10) })
            }}
          />

          <SettingInput
            label={t('Temperature')}
            type="number"
            placeholder={t('Temperature')}
            value={inferenceParams.temperature}
            min={0}
            max={1.0}
            step={0.1}
            onChange={(e) => {
              onUpdateInferenceParams({ temperature: parseFloat(e.target.value) })
            }}
          />

          <SettingInput
            label={t('topP')}
            type="number"
            placeholder={t('topP')}
            value={inferenceParams.topP}
            min={0}
            max={1}
            step={0.1}
            onChange={(e) => {
              onUpdateInferenceParams({ topP: parseFloat(e.target.value) })
            }}
          />

          <ThinkingModeSettings />
        </div>
      </SettingSection>
    </>
  )
}
