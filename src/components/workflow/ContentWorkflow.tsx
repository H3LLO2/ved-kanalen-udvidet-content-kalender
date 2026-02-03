import { useState, useCallback, useEffect } from 'react';
import { Play, RefreshCw, ChevronRight, Settings, Image, Sparkles, Hash } from 'lucide-react';
import { ImageUpload } from '../upload/ImageUpload';
import { ImageGrid } from '../images/ImageGrid';
import { GenerationProgress } from '../progress/GenerationProgress';
import { PostList } from '../posts/PostList';
import { MenuExemptGenerator } from '../menu/MenuExemptGenerator';
import { EventGraphicsGenerator } from '../menu/EventGraphicsGenerator';
import { FlexibleGraphicsGenerator } from '../menu/FlexibleGraphicsGenerator';
import { useImageStore, useCampaignStore, useGenerationStore } from '../../stores';
import { analyzeAllImages } from '../../agents/eye';
import { createContentPlan } from '../../agents/brain';
import { writeAllCaptions } from '../../agents/voice';
import {
  processGraphicRequests,
  suggestGraphicForPost,
  generateGraphicsForPosts,
  type GraphicSuggestion,
} from '../../agents/designer';
import { generateAllHashtags } from '../../lib/hashtags';
import { getImage, generateId } from '../../lib/database';
import { calculateBatchDays } from '../../lib/calendar';
import { createImageUrl } from '../../lib/database';
import type { Post, Phase, EstablishmentSegment } from '../../types';

// Generated graphic with blob URL
interface GeneratedGraphic {
  postId: string;
  dayNumber: number;
  blobUrl: string;
  description: string;
}

type WorkflowStep = 'upload' | 'review' | 'generate' | 'output';

interface ContentWorkflowProps {
  campaignId: string;
}

// Derive phase and segment from batch selection
function getPhaseForBatch(batch: 1 | 2 | 3): { phase: Phase; segment?: EstablishmentSegment } {
  switch (batch) {
    case 1:
      return { phase: 'TRANSITION_TEASE' }; // Mixed phases, Brain handles internally
    case 2:
      return { phase: 'ESTABLISHMENT', segment: 1 };
    case 3:
      return { phase: 'ESTABLISHMENT', segment: 2 }; // Covers segment 2 & 3
  }
}

export function ContentWorkflow({ campaignId }: ContentWorkflowProps) {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<1 | 2 | 3>(1);

  // Graphics generation state
  const [generatedGraphics, setGeneratedGraphics] = useState<GeneratedGraphic[]>([]);
  const [isGeneratingGraphics, setIsGeneratingGraphics] = useState(false);
  const [graphicsProgress, setGraphicsProgress] = useState({ current: 0, total: 0 });

  const { images, loadImages, selectedIds } = useImageStore();
  const { currentCampaign, updateCampaign } = useCampaignStore();
  const {
    stage,
    currentStep: genCurrentStep,
    totalSteps,
    message,
    error,
    posts,
    availableRuns,
    currentRun,
    tokenUsage,
    setStage,
    setProgress,
    setError,
    addAnalysis,
    setBrainPlan,
    setPosts,
    updatePost,
    reset,
    loadGeneratedContent,
    startNewRun,
    loadRunPosts,
    refreshTokenUsage,
  } = useGenerationStore();

  // Load existing data on mount
  useEffect(() => {
    loadImages(campaignId);
    loadGeneratedContent(campaignId);
  }, [campaignId, loadImages, loadGeneratedContent]);

  // Auto-advance steps based on state
  useEffect(() => {
    if (images.length > 0 && currentStep === 'upload') {
      setCurrentStep('review');
    }
    if (posts.length > 0) {
      setCurrentStep('output');
    }
  }, [images.length, posts.length, currentStep]);

  const handleGenerate = useCallback(async () => {
    if (!currentCampaign) return;

    setCurrentStep('generate');
    reset();

    try {
      // Start a new generation run
      const runNumber = await startNewRun(campaignId);
      const runId = useGenerationStore.getState().currentRunId!;

      // Step 1: Analyze images with The Eye
      setStage('analyzing', 'Analyserer billeder...');

      const imagesToAnalyze = selectedIds.size > 0
        ? images.filter((img) => selectedIds.has(img.id))
        : images;

      const imageBlobs = await Promise.all(
        imagesToAnalyze.map(async (img) => {
          const stored = await getImage(img.id);
          return { id: img.id, blob: stored?.blob || new Blob() };
        })
      );

      const { analyses: newAnalyses } = await analyzeAllImages(imageBlobs, (current, total) => {
        setProgress(current, total, `Analyserer billede ${current} af ${total}...`);
      });

      // Save analyses
      for (const analysis of newAnalyses) {
        await addAnalysis(analysis);
      }

      // Step 2: Create content plan with The Brain
      setStage('planning', 'Opretter content plan...');

      // Get batch info for target days and phase/segment
      const batchInfo = calculateBatchDays(selectedBatch, imagesToAnalyze.length);
      const { phase, segment } = getPhaseForBatch(selectedBatch);

      const planResult = await createContentPlan(
        newAnalyses,
        phase,
        batchInfo.days,
        segment,
        '' // history (empty for now)
      );

      if (!planResult.success || !planResult.output) {
        throw new Error(planResult.error || 'Planning failed');
      }

      await setBrainPlan(planResult.output, campaignId);

      // Step 3: Generate graphics with The Designer (if any requested)
      const graphicRequests = planResult.output.plan
        .filter((p) => p.graphic?.shouldGenerate)
        .map((p) => ({ dayNumber: p.day, request: p.graphic! }));

      if (graphicRequests.length > 0) {
        setStage('generating-graphics', 'Genererer grafik...');
        await processGraphicRequests(graphicRequests, (current, total) => {
          setProgress(current, total, `Genererer grafik ${current} af ${total}...`);
        });
      }

      // Step 4: Write captions with The Voice
      setStage('writing', 'Skriver tekster...');

      const captionInputs = planResult.output.plan.map((p) => {
        const imageAnalyses = newAnalyses.filter((a) => p.imageIds.includes(a.id));
        const imageContext = imageAnalyses.map((a) => a.content).join('\n');

        return {
          dayNumber: p.day,
          seed: p.seed,
          imageContext,
          hookType: p.hookType,
          ctaType: p.ctaType,
        };
      });

      const { captions } = await writeAllCaptions(
        captionInputs,
        phase,
        (current, total) => {
          setProgress(current, total, `Skriver tekst ${current} af ${total}...`);
        }
      );

      // Create posts
      const newPosts: Post[] = planResult.output.plan.map((p) => ({
        id: generateId(),
        campaignId,
        dayNumber: p.day,
        caption: captions.get(p.day) || '',
        postingTime: p.time,
        seed: p.seed,
        reasoning: p.reasoning,
        status: 'draft',
        imageIds: p.imageIds,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await setPosts(newPosts, campaignId, runNumber, runId);

      // Update token usage stats
      refreshTokenUsage();

      setStage('complete', 'Alle opslag er genereret!');
      setCurrentStep('output');
    } catch (err) {
      console.error('Generation failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [
    currentCampaign,
    campaignId,
    images,
    selectedIds,
    selectedBatch,
    setStage,
    setProgress,
    setError,
    addAnalysis,
    setBrainPlan,
    setPosts,
    reset,
    startNewRun,
    refreshTokenUsage,
  ]);

  const handleCaptionChange = useCallback(
    (postId: string, newCaption: string) => {
      updatePost(postId, { caption: newCaption });
    },
    [updatePost]
  );

  const handlePhaseChange = useCallback(
    (phase: Phase) => {
      updateCampaign({ currentPhase: phase });
    },
    [updateCampaign]
  );

  // Generate graphics for posts (without redoing text/vision)
  const handleGenerateGraphics = useCallback(async () => {
    if (posts.length === 0) return;

    setIsGeneratingGraphics(true);
    setGraphicsProgress({ current: 0, total: posts.length });

    try {
      // Create suggestions for each post
      const suggestions: GraphicSuggestion[] = posts.map((post) =>
        suggestGraphicForPost(post.id, post.dayNumber, post.seed, post.caption)
      );

      // Generate graphics
      const results = await generateGraphicsForPosts(
        suggestions,
        (current, total, _postId) => {
          setGraphicsProgress({ current, total });
        }
      );

      // Convert blobs to URLs and store
      const graphics: GeneratedGraphic[] = [];
      for (const [postId, { blob, description }] of results) {
        const blobUrl = createImageUrl(blob);
        const suggestion = suggestions.find((s) => s.postId === postId);
        graphics.push({
          postId,
          dayNumber: suggestion?.dayNumber || 0,
          blobUrl,
          description,
        });
      }

      setGeneratedGraphics(graphics);
      refreshTokenUsage();
    } catch (err) {
      console.error('Graphics generation failed:', err);
    } finally {
      setIsGeneratingGraphics(false);
    }
  }, [posts, refreshTokenUsage]);

  // Generate hashtags for all posts
  const handleGenerateHashtags = useCallback(() => {
    if (posts.length === 0) return;

    const hashtagMap = generateAllHashtags(
      posts.map((p) => ({
        id: p.id,
        seed: p.seed,
        caption: p.caption,
        dayNumber: p.dayNumber,
      }))
    );

    // Update posts with hashtags
    for (const post of posts) {
      const hashtags = hashtagMap.get(post.id);
      if (hashtags) {
        updatePost(post.id, { hashtags });
      }
    }
  }, [posts, updatePost]);

  const steps: { key: WorkflowStep; label: string }[] = [
    { key: 'upload', label: 'Upload' },
    { key: 'review', label: 'Gennemse' },
    { key: 'generate', label: 'Generer' },
    { key: 'output', label: 'Output' },
  ];

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {steps.map((step, index) => (
          <div key={step.key} className="flex items-center">
            <button
              onClick={() => {
                if (
                  (step.key === 'review' && images.length > 0) ||
                  (step.key === 'output' && posts.length > 0) ||
                  step.key === 'upload'
                ) {
                  setCurrentStep(step.key);
                }
              }}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${currentStep === step.key
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }
              `}
            >
              {step.label}
            </button>
            {index < steps.length - 1 && (
              <ChevronRight className="w-4 h-4 text-gray-400 mx-1" />
            )}
          </div>
        ))}
      </div>

      {/* Settings toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <Settings className="w-4 h-4" />
          Indstillinger
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && currentCampaign && (
        <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Batch
            </label>
            <select
              value={selectedBatch}
              onChange={(e) => {
                const batch = Number(e.target.value) as 1 | 2 | 3;
                setSelectedBatch(batch);
                const { phase } = getPhaseForBatch(batch);
                handlePhaseChange(phase);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value={1}>Batch 1: 20.-27. jan (Ombygning)</option>
              <option value={2}>Batch 2: 30. jan - 8. feb (Efter åbning)</option>
              <option value={3}>Batch 3: 9.-22. feb (Etablering)</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {selectedBatch === 1 && 'Ombygningsfasen - 8 dage. Åbningsdag laves manuelt.'}
              {selectedBatch === 2 && 'Første uge efter åbning - 10 dage.'}
              {selectedBatch === 3 && 'Etablering og hverdagsrutiner - 14 dage.'}
            </p>
          </div>
        </div>
      )}

      {/* Content based on current step */}
      {currentStep === 'upload' && (
        <div className="space-y-6">
          <ImageUpload campaignId={campaignId} />
          {images.length > 0 && (
            <button
              onClick={() => setCurrentStep('review')}
              className="w-full py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Fortsæt med {images.length} billeder
            </button>
          )}
        </div>
      )}

      {currentStep === 'review' && (
        <div className="space-y-6">
          <ImageUpload campaignId={campaignId} />
          <ImageGrid selectable />

          {images.length > 0 && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {selectedIds.size > 0
                  ? `${selectedIds.size} billeder valgt`
                  : `Alle ${images.length} billeder vil blive brugt`}
              </p>
              <div className="flex items-center gap-3">
                {posts.length > 0 && (
                  <button
                    onClick={() => setCurrentStep('output')}
                    className="flex items-center gap-2 px-4 py-3 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                    Gaa til output
                  </button>
                )}
                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium"
                >
                  <Play className="w-5 h-5" />
                  Generer content
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {currentStep === 'generate' && (
        <div className="space-y-6">
          <GenerationProgress
            stage={stage}
            currentStep={genCurrentStep}
            totalSteps={totalSteps}
            message={message}
            error={error}
          />

          {stage === 'error' && (
            <button
              onClick={handleGenerate}
              className="flex items-center gap-2 mx-auto px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Prøv igen
            </button>
          )}
        </div>
      )}

      {currentStep === 'output' && (
        <div className="space-y-6">
          {/* Run version tabs and token usage */}
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
            {availableRuns.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Version:</span>
                {availableRuns.map((run) => (
                  <button
                    key={run}
                    onClick={() => loadRunPosts(campaignId, run)}
                    className={`
                      px-3 py-1.5 text-sm font-medium rounded-t-lg transition-colors
                      ${currentRun === run
                        ? 'bg-blue-500 text-white'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }
                    `}
                  >
                    v{run}
                  </button>
                ))}
              </div>
            )}

            {/* Token usage display */}
            {tokenUsage && (
              <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-3">
                <span title="Eye agent">
                  Eye: {tokenUsage.eye.totalTokens.toLocaleString()}
                </span>
                <span title="Brain agent">
                  Brain: {tokenUsage.brain.totalTokens.toLocaleString()}
                </span>
                <span title="Voice agent">
                  Voice: {tokenUsage.voice.totalTokens.toLocaleString()}
                </span>
                <span className="font-medium" title="Total tokens used">
                  Total: {tokenUsage.total.totalTokens.toLocaleString()}
                </span>
              </div>
            )}
          </div>

          <PostList posts={posts} images={images} onCaptionChange={handleCaptionChange} />

          {/* Graphics Generation Section */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Image className="w-5 h-5 text-purple-500" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Genererede Grafik
                </h3>
              </div>
              <button
                onClick={handleGenerateGraphics}
                disabled={isGeneratingGraphics || posts.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4" />
                {isGeneratingGraphics
                  ? `Genererer ${graphicsProgress.current}/${graphicsProgress.total}...`
                  : 'Generer Grafik'}
              </button>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Generer typografi-fokuserede grafik til dage hvor du mangler billeder, eller vil have variation.
              Grafikken er designet til at IKKE ligne AI - ren typografi og abstrakte former.
            </p>

            {generatedGraphics.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {generatedGraphics.map((graphic) => (
                  <div
                    key={graphic.postId}
                    className="bg-gray-50 dark:bg-gray-750 rounded-lg overflow-hidden"
                  >
                    <img
                      src={graphic.blobUrl}
                      alt={graphic.description}
                      className="w-full aspect-square object-cover"
                    />
                    <div className="p-2">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Dag {graphic.dayNumber}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {graphic.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 dark:bg-gray-750 rounded-lg">
                <Image className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Klik &quot;Generer Grafik&quot; for at lave typografisk grafik til dine posts
                </p>
              </div>
            )}
          </div>

          {/* Menu Exempt Graphics Section */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <MenuExemptGenerator campaignId={campaignId} />
          </div>

          {/* Event Graphics Section */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <EventGraphicsGenerator campaignId={campaignId} />
          </div>

          {/* Flexible Graphics Section */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <FlexibleGraphicsGenerator campaignId={campaignId} />
          </div>

          <div className="flex items-center justify-center gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setCurrentStep('review')}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Tilbage til billeder
            </button>
            <button
              onClick={handleGenerateHashtags}
              disabled={posts.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Hash className="w-4 h-4" />
              Generer Hashtags
            </button>
            <button
              onClick={() => {
                reset();
                setCurrentStep('review');
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Generer igen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
