import { Eye, Brain, Mic, Palette, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { GenerationStage } from '../../types';

interface GenerationProgressProps {
  stage: GenerationStage;
  currentStep: number;
  totalSteps: number;
  message: string;
  error?: string | null;
}

const stageConfig: Record<
  GenerationStage,
  { label: string; icon: React.ElementType; color: string }
> = {
  idle: { label: 'Klar', icon: CheckCircle, color: 'text-gray-400' },
  uploading: { label: 'Uploader', icon: Loader2, color: 'text-blue-500' },
  analyzing: { label: 'The Eye analyserer', icon: Eye, color: 'text-purple-500' },
  planning: { label: 'The Brain planlægger', icon: Brain, color: 'text-amber-500' },
  'generating-graphics': { label: 'The Designer skaber', icon: Palette, color: 'text-pink-500' },
  writing: { label: 'The Voice skriver', icon: Mic, color: 'text-green-500' },
  complete: { label: 'Færdig', icon: CheckCircle, color: 'text-green-500' },
  error: { label: 'Fejl', icon: XCircle, color: 'text-red-500' },
};

const stages: GenerationStage[] = [
  'analyzing',
  'planning',
  'generating-graphics',
  'writing',
  'complete',
];

export function GenerationProgress({
  stage,
  currentStep,
  totalSteps,
  message,
  error,
}: GenerationProgressProps) {
  const config = stageConfig[stage];
  const Icon = config.icon;
  const currentStageIndex = stages.indexOf(stage);

  if (stage === 'idle') {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 space-y-4">
      {/* Current stage indicator */}
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-full bg-gray-100 dark:bg-gray-700 ${config.color}`}>
          <Icon
            className={`w-6 h-6 ${stage !== 'complete' && stage !== 'error' ? 'animate-pulse' : ''}`}
          />
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-gray-900 dark:text-white">{config.label}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
        </div>
      </div>

      {/* Progress bar */}
      {totalSteps > 0 && stage !== 'complete' && stage !== 'error' && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>
              {currentStep} af {totalSteps}
            </span>
            <span>{Math.round((currentStep / totalSteps) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                stage === 'analyzing'
                  ? 'bg-purple-500'
                  : stage === 'writing'
                    ? 'bg-green-500'
                    : stage === 'generating-graphics'
                      ? 'bg-pink-500'
                      : 'bg-blue-500'
              }`}
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Stage pipeline */}
      <div className="flex items-center justify-between pt-4">
        {stages.slice(0, -1).map((s, index) => {
          const sConfig = stageConfig[s];
          const SIcon = sConfig.icon;
          const isActive = s === stage;
          const isComplete = currentStageIndex > index || stage === 'complete';
          const isPending = currentStageIndex < index && stage !== 'complete';

          return (
            <div key={s} className="flex items-center">
              <div
                className={`
                  flex items-center justify-center w-10 h-10 rounded-full
                  transition-all duration-300
                  ${isComplete ? 'bg-green-100 dark:bg-green-900/30' : ''}
                  ${isActive ? 'bg-blue-100 dark:bg-blue-900/30 ring-2 ring-blue-500' : ''}
                  ${isPending ? 'bg-gray-100 dark:bg-gray-700' : ''}
                `}
              >
                {isComplete ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <SIcon
                    className={`w-5 h-5 ${
                      isActive ? sConfig.color : 'text-gray-400 dark:text-gray-500'
                    } ${isActive ? 'animate-pulse' : ''}`}
                  />
                )}
              </div>
              {index < stages.length - 2 && (
                <div
                  className={`w-12 h-0.5 mx-1 ${
                    currentStageIndex > index || stage === 'complete'
                      ? 'bg-green-500'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
