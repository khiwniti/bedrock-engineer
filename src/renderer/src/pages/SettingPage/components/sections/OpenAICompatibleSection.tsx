import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FcElectronics } from 'react-icons/fc'
import { IoMdClose, IoMdAdd } from 'react-icons/io'
import { SettingSection } from '../SettingSection'
import { SettingInput } from '../SettingInput'
import type { OpenAICompatibleConfig, OpenAICompatibleModel } from '@/types/llm-provider'

interface OpenAICompatibleSectionProps {
  config: OpenAICompatibleConfig
  onUpdateConfig: (config: Partial<OpenAICompatibleConfig>) => void
  onAddModel: (model: OpenAICompatibleModel) => void
  onRemoveModel: (modelId: string) => void
  onUpdateModel: (modelId: string, model: Partial<OpenAICompatibleModel>) => void
}

export const OpenAICompatibleSection: React.FC<OpenAICompatibleSectionProps> = ({
  config,
  onUpdateConfig,
  onAddModel,
  onRemoveModel,
  onUpdateModel
}) => {
  const { t } = useTranslation()
  const [showAddModel, setShowAddModel] = useState(false)
  const [newModel, setNewModel] = useState<OpenAICompatibleModel>({
    modelId: '',
    modelName: '',
    toolUse: true,
    maxTokensLimit: 4096
  })

  const handleAddModel = () => {
    if (!newModel.modelId || !newModel.modelName) return
    onAddModel(newModel)
    setNewModel({
      modelId: '',
      modelName: '',
      toolUse: true,
      maxTokensLimit: 4096
    })
    setShowAddModel(false)
  }

  return (
    <>
      <SettingSection title={t('OpenAI Compatible API')} icon={FcElectronics}>
        <div className="space-y-4">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {t(
              'Configure an OpenAI-compatible API endpoint. This works with OpenAI, Azure OpenAI, Ollama, LM Studio, vLLM, and other compatible providers.'
            )}
          </p>

          <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-md">
            <SettingInput
              label={t('API Base URL')}
              type="string"
              placeholder="https://api.openai.com/v1"
              value={config.baseUrl}
              onChange={(e) => onUpdateConfig({ baseUrl: e.target.value })}
              description={t(
                'The base URL of the API endpoint (e.g., https://api.openai.com/v1, http://localhost:11434/v1)'
              )}
            />

            <SettingInput
              label={t('API Key')}
              type="password"
              placeholder="sk-..."
              value={config.apiKey}
              onChange={(e) => onUpdateConfig({ apiKey: e.target.value })}
              description={t('API key for authentication. Leave empty if not required (e.g., Ollama).')}
            />
          </div>
        </div>
      </SettingSection>

      <SettingSection title={t('Custom Models')} icon={FcElectronics}>
        <div className="space-y-4">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {t(
              'Define the models available from your OpenAI-compatible endpoint. These will appear in the model selector.'
            )}
          </p>

          {/* Existing models list */}
          {config.customModels.length > 0 && (
            <div className="space-y-2">
              {config.customModels.map((model) => (
                <div
                  key={model.modelId}
                  className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-md"
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {model.modelName}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {model.modelId} | {t('Max Tokens')}: {model.maxTokensLimit} |{' '}
                      {t('Tool Use')}: {model.toolUse ? 'Yes' : 'No'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveModel(model.modelId)}
                    className="ml-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    <IoMdClose className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add model form */}
          {showAddModel ? (
            <div className="space-y-3 p-4 border border-blue-200 dark:border-blue-700 rounded-md bg-blue-50 dark:bg-blue-900/20">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                {t('Add New Model')}
              </h4>

              <SettingInput
                label={t('Model ID')}
                type="string"
                placeholder="gpt-4o, llama3.1, etc."
                value={newModel.modelId}
                onChange={(e) => setNewModel({ ...newModel, modelId: e.target.value })}
                description={t('The model ID to send in API requests')}
              />

              <SettingInput
                label={t('Display Name')}
                type="string"
                placeholder="GPT-4o, Llama 3.1, etc."
                value={newModel.modelName}
                onChange={(e) => setNewModel({ ...newModel, modelName: e.target.value })}
                description={t('The name displayed in the model selector UI')}
              />

              <SettingInput
                label={t('Max Tokens')}
                type="number"
                placeholder="4096"
                value={newModel.maxTokensLimit}
                min={1}
                max={1000000}
                onChange={(e) =>
                  setNewModel({
                    ...newModel,
                    maxTokensLimit: parseInt(e.target.value, 10) || 4096
                  })
                }
              />

              <div className="flex items-center space-x-2">
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="form-checkbox h-5 w-5 text-blue-600 rounded border-gray-300
                      focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800
                      focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    checked={newModel.toolUse}
                    onChange={(e) => setNewModel({ ...newModel, toolUse: e.target.checked })}
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    {t('Supports Tool Use (Function Calling)')}
                  </span>
                </label>
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleAddModel}
                  disabled={!newModel.modelId || !newModel.modelName}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700
                    disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('Add')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModel(false)}
                  className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700
                    dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  {t('Cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddModel(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white
                rounded-md hover:bg-blue-700"
            >
              <IoMdAdd className="w-4 h-4" />
              {t('Add Model')}
            </button>
          )}

          {config.customModels.length === 0 && !showAddModel && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                {t(
                  'No models configured. Add at least one model to use the OpenAI-compatible provider.'
                )}
              </p>
            </div>
          )}
        </div>
      </SettingSection>
    </>
  )
}
