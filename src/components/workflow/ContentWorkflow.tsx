import { useState, useCallback, useEffect, useMemo } from 'react';
import { Play, RefreshCw, ChevronRight, Settings, Image, Sparkles, Hash } from 'lucide-react';
import { scheduleFacebookPost, uploadImageToMeta, fetchPostedImages, scheduleInstagramPost } from '../../lib/meta-api';
import { uploadToImgbb, isImageHostingConfigured } from '../../lib/image-hosting';
import type { GraphicItem } from '../../stores/graphicsStore';
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
import { writeAllCaptions, autoFixCaptions, rewriteWithFeedback } from '../../agents/voice';
import { getAnalysisByImage } from '../../lib/database';
import {
  generateGraphic,
} from '../../agents/designer';
import { generateAllHashtags } from '../../lib/hashtags';
import { getImage, generateId, createImageUrl } from '../../lib/database';
import { formatDateDanish } from '../../lib/calendar';
import { blobToBase64 } from '../../lib/heic';
import type { Post, Phase, EstablishmentSegment } from '../../types';

// Brain's suggestion for a graphic (not yet generated)
interface GraphicSuggestionItem {
  dayNumber: number;
  concept: string;
  headline?: string;
  subtext?: string;
  style: string;
  reason: string;
  status: 'pending' | 'generating' | 'done';
  blobUrl?: string;
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

type PlanDuration = '7' | '14' | '30' | 'custom';

export function ContentWorkflow({ campaignId }: ContentWorkflowProps) {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<1 | 2 | 3>(1);
  const [historyContent, setHistoryContent] = useState(''); // Previously posted content for context
  const [clientNotes, setClientNotes] = useState(''); // Ongoing notes from client
  const [metaToken, setMetaToken] = useState(import.meta.env.VITE_META_ACCESS_TOKEN || ''); // Meta API token
  const [isFetchingMeta, setIsFetchingMeta] = useState(false);
  
  // Flexible plan settings
  const [planDuration, setPlanDuration] = useState<PlanDuration>('7');
  const [customDays, setCustomDays] = useState(7);
  const [planStartDate, setPlanStartDate] = useState(new Date().toISOString().split('T')[0] ?? '');
  const [isSyncingWithFacebook, setIsSyncingWithFacebook] = useState(false);

  // Graphics generation state

  // Brain's graphic suggestions queue
  const [graphicSuggestions, setGraphicSuggestions] = useState<GraphicSuggestionItem[]>([]);

  const { images, loadImages, selectedIds, markAsPostedToMeta } = useImageStore();
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

  // Calculate number of days for the plan (must be before handleGenerate)
  const planDays = useMemo(() => {
    if (planDuration === 'custom') return customDays;
    return parseInt(planDuration, 10);
  }, [planDuration, customDays]);

  const handleGenerate = useCallback(async () => {
    if (!currentCampaign) return;

    setCurrentStep('generate');
    reset();

    try {
      // Start a new generation run
      const runNumber = await startNewRun(campaignId);
      const runId = useGenerationStore.getState().currentRunId!;

      // Step 1: Analyze images with The Eye (skip already-analyzed images)
      setStage('analyzing', 'Tjekker eksisterende analyser...');

      const imagesToProcess = selectedIds.size > 0
        ? images.filter((img) => selectedIds.has(img.id))
        : images;

      // Check which images already have analyses in the DB
      const existingAnalyses: import('../../types').EyeOutput[] = [];
      const needsAnalysis: typeof imagesToProcess = [];

      for (const img of imagesToProcess) {
        const existing = await getAnalysisByImage(img.id);
        // Only reuse analysis if it's valid (not a failure placeholder)
        const isValid = existing &&
          existing.content &&
          !existing.content.toLowerCase().includes('failed') &&
          !existing.content.toLowerCase().includes('manual description') &&
          existing.content.length > 20;
        if (isValid) {
          existingAnalyses.push({
            id: existing.imageId,
            content: existing.content,
            mood: existing.mood,
            strategicFit: existing.strategicFit,
          });
        } else {
          needsAnalysis.push(img);
        }
      }

      let newAnalyses = [...existingAnalyses];

      if (needsAnalysis.length > 0) {
        setStage('analyzing', `Analyserer ${needsAnalysis.length} nye billeder (${existingAnalyses.length} allerede analyseret)...`);

        const imageBlobs = await Promise.all(
          needsAnalysis.map(async (img) => {
            const stored = await getImage(img.id);
            return { id: img.id, blob: stored?.blob || new Blob() };
          })
        );

        const { analyses: freshAnalyses } = await analyzeAllImages(imageBlobs, (current, total) => {
          setProgress(current, total, `Analyserer billede ${current} af ${total} (${existingAnalyses.length} genbrugt)...`);
        });

        // Save new analyses
        for (const analysis of freshAnalyses) {
          await addAnalysis(analysis);
        }

        newAnalyses = [...existingAnalyses, ...freshAnalyses];
      } else {
        setStage('analyzing', `Alle ${existingAnalyses.length} billeder allerede analyseret — springer over!`);
        // Brief pause so user can see the message
        await new Promise(r => setTimeout(r, 1500));
      }

      // Step 1.5: Fetch engagement insights from Meta (if token available)
      setStage('planning', 'Henter engagement data fra Meta...');
      let engagementInsights: string | undefined;
      let styleReference: string | undefined;

      if (metaToken) {
        try {
          const insightsRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3002'}/api/meta/engagement-insights`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: metaToken }),
          });
          const insightsData = await insightsRes.json();
          if (insightsData.success) {
            engagementInsights = insightsData.insights;
            styleReference = insightsData.styleReference;
            console.log(`Loaded engagement insights from ${insightsData.postCount} posts`);
          }
        } catch (e) {
          console.warn('Could not fetch engagement insights:', e);
        }
      }

      // Step 2: Create content plan with The Brain
      setStage('planning', 'Opretter content plan...');

      // Get the highest existing day number to continue from
      const existingPosts = useGenerationStore.getState().posts;
      const highestExistingDay = existingPosts.length > 0
        ? Math.max(...existingPosts.map(p => p.dayNumber))
        : 0;

      // Use flexible plan days instead of batch system
      const targetDays = planDays;
      const startFromDay = highestExistingDay + 1;

      const { phase, segment } = getPhaseForBatch(selectedBatch);

      const planResult = await createContentPlan(
        newAnalyses,
        phase,
        targetDays,
        segment,
        historyContent, // Previously posted content for context
        startFromDay, // Start numbering from this day
        engagementInsights, // Engagement patterns from Meta
        undefined, // reviewFeedback (none on first pass)
        clientNotes || undefined, // Owner's notes/directions
      );

      if (!planResult.success || !planResult.output) {
        throw new Error(planResult.error || 'Planning failed');
      }

      await setBrainPlan(planResult.output, campaignId);

      // Store graphic suggestions from Brain (user will review & generate later)
      const brainGraphicSuggestions: GraphicSuggestionItem[] = planResult.output.plan
        .filter((p: any) => p.graphicSuggestion)
        .map((p: any) => ({
          dayNumber: p.day,
          concept: p.graphicSuggestion.concept,
          headline: p.graphicSuggestion.headline,
          subtext: p.graphicSuggestion.subtext,
          style: p.graphicSuggestion.style,
          reason: p.graphicSuggestion.reason,
          status: 'pending' as const,
        }));
      setGraphicSuggestions(brainGraphicSuggestions);

      // Step 3: Write captions with The Voice
      setStage('writing', 'Skriver tekster...');

      const captionInputs = planResult.output.plan.map((p, index) => {
        const imageAnalyses = newAnalyses.filter((a) => p.imageIds.includes(a.id));
        const imageContext = imageAnalyses.map((a) => a.content).join('\n');

        // Calculate actual date for this day
        let actualDate: string | undefined;
        if (planStartDate) {
          const date = new Date(planStartDate);
          date.setDate(date.getDate() + index);
          actualDate = formatDateDanish(date);
        }

        return {
          dayNumber: p.day,
          seed: p.seed,
          imageContext,
          hookType: p.hookType,
          ctaType: p.ctaType,
          actualDate,
        };
      });

      const { captions } = await writeAllCaptions(
        captionInputs,
        phase,
        (current, total) => {
          setProgress(current, total, `Skriver tekst ${current} af ${total}...`);
        },
        styleReference, // Recent post style for tone continuity
      );

      // Step 4: Review → Rewrite → Re-plan feedback loop
      // Round 1: Review → if low, rewrite Voice
      // Round 2: Review → if still low, re-plan Brain → rewrite all Voice
      // Round 3: Final review (just score, no more rewrites)
      setStage('reviewing', 'Kører kvalitetskontrol...');

      let fixedCaptions = autoFixCaptions(captions);
      let currentPlanResult = planResult;
      let currentCaptionInputs = captionInputs;
      const QUALITY_THRESHOLD = 80;

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';

      // Helper: run AI review
      const runReview = async (caps: Map<number, string>) => {
        const res = await fetch(`${apiUrl}/api/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            captions: [...caps.entries()].map(([day, caption]) => ({ dayNumber: day, caption })),
            phase,
          }),
        });
        const data = await res.json();
        if (!data.success || !data.review) return null;
        return data.review as {
          overallScore: number;
          issues: Array<{ day: number; severity: string; type: string; message: string }>;
          summary: string;
        };
      };

      try {
        // === ROUND 1: Initial review ===
        setProgress(1, 4, 'AI kvalitetskontrol (runde 1)...');
        const review1 = await runReview(fixedCaptions);

        if (review1 && review1.overallScore < QUALITY_THRESHOLD) {
          console.log(`Review 1: ${review1.overallScore}/100 — attempting Voice rewrites`);
          const seriousIssues = review1.issues.filter((i) => i.severity === 'high' || i.severity === 'medium');

          if (seriousIssues.length > 0) {
            // === ROUND 1b: Rewrite flagged Voice days ===
            setProgress(2, 4, `Omskriver ${new Set(seriousIssues.map((i) => i.day)).size} opslag...`);
            const rewriteResult = await rewriteWithFeedback(
              fixedCaptions, review1.issues, review1.summary,
              currentCaptionInputs, phase,
              (c, t) => setProgress(2, 4, `Omskriver opslag ${c}/${t}...`),
              styleReference,
            );
            fixedCaptions = rewriteResult.captions;
            console.log(`Rewrote ${rewriteResult.rewrittenDays.length} days`);

            // === ROUND 2: Review after Voice rewrites ===
            setProgress(2, 4, 'AI kvalitetskontrol (runde 2)...');
            const review2 = await runReview(fixedCaptions);

            if (review2 && review2.overallScore < QUALITY_THRESHOLD) {
              console.log(`Review 2: ${review2.overallScore}/100 — Brain re-plan needed`);

              // === ROUND 2b: Brain re-plan with review feedback ===
              setStage('planning', 'Brain laver ny plan baseret på feedback...');
              setProgress(3, 4, 'Brain laver ny plan...');

              const replanResult = await createContentPlan(
                newAnalyses, phase, targetDays, segment,
                historyContent, startFromDay, engagementInsights,
                `SCORE: ${review2.overallScore}/100\n${review2.summary}\n\nPROBLEMER:\n${review2.issues.map((i) => `- Dag ${i.day} [${i.severity}/${i.type}]: ${i.message}`).join('\n')}`,
                clientNotes || undefined,
              );

              if (replanResult.success && replanResult.output) {
                currentPlanResult = replanResult;
                await setBrainPlan(replanResult.output, campaignId);

                // Rebuild caption inputs from new plan
                currentCaptionInputs = replanResult.output.plan.map((p, idx) => {
                  const imgAnalyses = newAnalyses.filter((a) => p.imageIds.includes(a.id));
                  const imgCtx = imgAnalyses.map((a) => a.content).join('\n');
                  let ad: string | undefined;
                  if (planStartDate) {
                    const d = new Date(planStartDate);
                    d.setDate(d.getDate() + idx);
                    ad = formatDateDanish(d);
                  }
                  return { dayNumber: p.day, seed: p.seed, imageContext: imgCtx, hookType: p.hookType, ctaType: p.ctaType, actualDate: ad };
                });

                // === ROUND 2c: Voice all days with new plan ===
                setStage('writing', 'Skriver nye tekster...');
                const { captions: newCaps } = await writeAllCaptions(
                  currentCaptionInputs, phase,
                  (c, t) => setProgress(3, 4, `Skriver tekst ${c} af ${t}...`),
                  styleReference,
                );
                fixedCaptions = autoFixCaptions(newCaps);

                // === ROUND 3: Final review ===
                setStage('reviewing', 'Final kvalitetskontrol...');
                setProgress(4, 4, 'AI kvalitetskontrol (final)...');
                const review3 = await runReview(fixedCaptions);
                if (review3) {
                  console.log(`Review 3 (final): ${review3.overallScore}/100 - ${review3.summary}`);
                  setProgress(4, 4, `Kvalitetsscore: ${review3.overallScore}/100 - ${review3.summary}`);
                  await new Promise((r) => setTimeout(r, 3000));
                }
              }
            } else if (review2) {
              console.log(`Review 2: ${review2.overallScore}/100 — good enough after rewrites`);
              setProgress(4, 4, `Kvalitetsscore: ${review2.overallScore}/100 - ${review2.summary}`);
              await new Promise((r) => setTimeout(r, 3000));
            }
          }
        } else if (review1) {
          console.log(`Review 1: ${review1.overallScore}/100 — passed on first try!`);
          setProgress(4, 4, `Kvalitetsscore: ${review1.overallScore}/100 - ${review1.summary}`);
          await new Promise((r) => setTimeout(r, 3000));
        }
      } catch (e) {
        console.warn('Review loop failed (non-critical):', e);
      }

      // Create posts with adjusted day numbers (continuing from existing)
      const finalPlan = currentPlanResult.output!.plan;
      const newPosts: Post[] = finalPlan.map((p, index) => ({
        id: generateId(),
        campaignId,
        dayNumber: startFromDay + index, // Continue numbering from existing posts
        caption: fixedCaptions.get(p.day) || '',
        postingTime: p.time,
        seed: p.seed,
        reasoning: p.reasoning,
        status: 'draft',
        imageIds: p.imageIds,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // Merge with existing posts instead of replacing
      const mergedPosts = [...existingPosts, ...newPosts];
      await setPosts(mergedPosts, campaignId, runNumber, runId);

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
    planDays,
    planStartDate,
    metaToken,
    historyContent,
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

  // Handle image changes for a post
  const handleImagesChange = useCallback(
    (postId: string, imageIds: string[], newGraphics?: GraphicItem[]) => {
      // For now, just update the imageIds
      // Graphics from the library will need to be handled differently (uploaded or stored)
      updatePost(postId, { imageIds });
      
      // TODO: If newGraphics are provided, we need to either:
      // 1. Add them to the campaign's image store
      // 2. Or handle them separately for upload to Meta
      if (newGraphics && newGraphics.length > 0) {
        console.log('New graphics added:', newGraphics.length);
        // For now, we could add graphic IDs to imageIds after converting them
      }
    },
    [updatePost]
  );

  // Handle scheduling a post to Meta (FB + IG)
  const handleSchedule = useCallback(
    async (postId: string, scheduledTime: Date, platforms: { fb: boolean; ig: boolean } = { fb: true, ig: true }): Promise<{ success: boolean; error?: string }> => {
      const post = posts.find((p) => p.id === postId);
      if (!post) {
        return { success: false, error: 'Post ikke fundet' };
      }

      try {
        // Get images for this post
        const postImages = images.filter((img) => post.imageIds.includes(img.id));
        
        const caption = post.hashtags?.length 
          ? `${post.caption}\n\n${post.hashtags.join(' ')}`
          : post.caption;

        const results: { fb?: { success: boolean; error?: string }; ig?: { success: boolean; error?: string } } = {};

        // === FACEBOOK ===
        if (platforms.fb) {
          // Upload images to Meta for Facebook
          const uploadedMediaIds: string[] = [];
          for (const img of postImages) {
            const stored = await getImage(img.id);
            if (stored?.blob) {
              const uploadResult = await uploadImageToMeta(stored.blob);
              if (uploadResult.success && uploadResult.mediaId) {
                uploadedMediaIds.push(uploadResult.mediaId);
              } else {
                console.warn('Failed to upload image to FB:', uploadResult.error);
              }
            }
          }

          results.fb = await scheduleFacebookPost(
            caption,
            scheduledTime,
            uploadedMediaIds.length > 0 ? uploadedMediaIds : undefined
          );
        }

        // === INSTAGRAM ===
        if (platforms.ig) {
          // Instagram requires public URLs - upload to imgbb first
          if (!isImageHostingConfigured()) {
            results.ig = { success: false, error: 'Image hosting (imgbb) ikke konfigureret - tilføj VITE_IMGBB_API_KEY til .env' };
          } else if (postImages.length === 0) {
            results.ig = { success: false, error: 'Instagram kræver mindst ét billede' };
          } else {
            const publicUrls: string[] = [];
            for (const img of postImages) {
              const stored = await getImage(img.id);
              if (stored?.blob) {
                const uploadResult = await uploadToImgbb(stored.blob, img.originalName);
                if (uploadResult.success && uploadResult.url) {
                  publicUrls.push(uploadResult.url);
                } else {
                  console.warn('Failed to upload to imgbb:', uploadResult.error);
                }
              }
            }

            if (publicUrls.length > 0) {
              results.ig = await scheduleInstagramPost(caption, publicUrls, scheduledTime);
            } else {
              results.ig = { success: false, error: 'Kunne ikke uploade billeder til hosting' };
            }
          }
        }

        // Determine overall success
        const fbOk = !platforms.fb || results.fb?.success;
        const igOk = !platforms.ig || results.ig?.success;
        
        if (fbOk && igOk) {
          updatePost(postId, { 
            status: 'scheduled',
            scheduledFor: scheduledTime,
          });
          return { success: true };
        } else {
          const errors: string[] = [];
          if (platforms.fb && !results.fb?.success) errors.push(`FB: ${results.fb?.error}`);
          if (platforms.ig && !results.ig?.success) errors.push(`IG: ${results.ig?.error}`);
          return { success: false, error: errors.join(' | ') };
        }
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    },
    [posts, images, updatePost]
  );

  // Calculate start date for the plan
  const batchStartDate = useMemo(() => {
    return new Date(planStartDate);
  }, [planStartDate]);

  // Sync with Facebook to find already posted images via perceptual hashing
  const handleSyncWithFacebook = useCallback(async () => {
    setIsSyncingWithFacebook(true);
    try {
      // 1. Fetch FB image URLs
      const result = await fetchPostedImages(100);
      if (!result.success) {
        alert('Fejl ved sync: ' + result.error);
        return;
      }
      const facebookImageUrls = result.images.map(img => img.url);
      if (facebookImageUrls.length === 0) {
        alert('Ingen billeder fundet på Facebook.');
        return;
      }

      // 2. Get thumbnails from IndexedDB for each uploaded image, convert to base64
      const uploadedImages: Array<{ id: string; base64: string }> = [];
      for (const img of images) {
        try {
          const stored = await getImage(img.id);
          if (stored?.thumbnailBlob) {
            const base64 = await blobToBase64(stored.thumbnailBlob);
            uploadedImages.push({ id: img.id, base64 });
          }
        } catch {
          // Skip images that fail to load
        }
      }

      if (uploadedImages.length === 0) {
        alert('Ingen uploadede billeder at sammenligne.');
        return;
      }

      // 3. POST to match endpoint
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3002';
      const matchRes = await fetch(`${apiUrl}/api/match-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadedImages, facebookImageUrls }),
      });
      const matchData = await matchRes.json();

      if (!matchData.success) {
        alert('Fejl ved billedsammenligning: ' + matchData.error);
        return;
      }

      // 4. Mark matched images in the store
      const matchedIds = matchData.matches.map((m: { uploadedImageId: string }) => m.uploadedImageId);
      if (matchedIds.length > 0) {
        markAsPostedToMeta(matchedIds);
      }

      alert(`Sync færdig: ${matchedIds.length} af ${uploadedImages.length} billeder fundet på Facebook.`);
    } catch (err) {
      alert('Fejl: ' + (err as Error).message);
    } finally {
      setIsSyncingWithFacebook(false);
    }
  }, [images, markAsPostedToMeta]);

  const handlePhaseChange = useCallback(
    (phase: Phase) => {
      updateCampaign({ currentPhase: phase });
    },
    [updateCampaign]
  );

  // Generate a single graphic from Brain's suggestion
  const handleGenerateSingleGraphic = useCallback(async (dayNumber: number) => {
    const suggestion = graphicSuggestions.find(s => s.dayNumber === dayNumber);
    if (!suggestion) return;

    // Mark as generating
    setGraphicSuggestions(prev => prev.map(s =>
      s.dayNumber === dayNumber ? { ...s, status: 'generating' as const } : s
    ));

    try {
      const result = await generateGraphic({
        concept: suggestion.concept,
        headline: suggestion.headline,
        subtext: suggestion.subtext,
        style: suggestion.style,
      });

      if (result.success && result.imageBlob) {
        const blobUrl = createImageUrl(result.imageBlob);

        // Mark suggestion as done with preview
        setGraphicSuggestions(prev => prev.map(s =>
          s.dayNumber === dayNumber ? { ...s, status: 'done' as const, blobUrl } : s
        ));
      }
    } catch (err) {
      console.error('Single graphic generation failed:', err);
      // Reset to pending on failure
      setGraphicSuggestions(prev => prev.map(s =>
        s.dayNumber === dayNumber ? { ...s, status: 'pending' as const } : s
      ));
    }
  }, [graphicSuggestions, posts]);

  // Add generated graphic to a post
  const handleAddGraphicToPost = useCallback((dayNumber: number) => {
    const suggestion = graphicSuggestions.find(s => s.dayNumber === dayNumber && s.status === 'done');
    const post = posts.find(p => p.dayNumber === dayNumber);

    if (suggestion?.blobUrl && post) {
      updatePost(post.id, { generatedGraphicPath: suggestion.blobUrl });
    }
  }, [graphicSuggestions, posts, updatePost]);

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
          {/* Plan Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Plan-længde
            </label>
            <div className="flex gap-2 flex-wrap">
              {[
                { value: '7' as PlanDuration, label: '1 uge' },
                { value: '14' as PlanDuration, label: '2 uger' },
                { value: '30' as PlanDuration, label: '1 måned' },
                { value: 'custom' as PlanDuration, label: 'Custom' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPlanDuration(opt.value)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    planDuration === opt.value
                      ? 'bg-blue-500 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:border-blue-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              {planDuration === 'custom' && (
                <input
                  type="number"
                  value={customDays}
                  onChange={(e) => setCustomDays(Math.max(1, Math.min(90, parseInt(e.target.value) || 1)))}
                  min={1}
                  max={90}
                  className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  placeholder="Dage"
                />
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Genererer {planDays} dage fra startdato. Eksisterende posts bevares.
            </p>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Startdato for næste batch
            </label>
            <input
              type="date"
              value={planStartDate}
              onChange={(e) => setPlanStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Nye posts starter fra denne dato. Dag 1 = {planStartDate ? new Date(planStartDate).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' }) : '(vælg dato)'}
            </p>
          </div>

          {/* Sync with Facebook */}
          <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Sync med Facebook
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Find billeder der allerede er postet, så vi undgår dubletter
                </p>
              </div>
              <button
                onClick={handleSyncWithFacebook}
                disabled={isSyncingWithFacebook}
                className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm flex items-center gap-2"
              >
                {isSyncingWithFacebook ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Synkroniserer...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Sync nu
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Legacy Batch selector (hidden but kept for compatibility) */}
          <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Fase (til AI kontekst)
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
              <option value={1}>Overgang/Tease</option>
              <option value={2}>Efter åbning</option>
              <option value={3}>Etablering</option>
            </select>
          </div>

          {/* History import */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Tidligere opslag (kontekst)
              </label>
              {metaToken && (
                <button
                  onClick={async () => {
                    setIsFetchingMeta(true);
                    try {
                      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3002'}/api/meta/fetch-history`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ accessToken: metaToken, limit: 30 }),
                      });
                      const data = await response.json();
                      if (data.success && data.historyText) {
                        setHistoryContent(data.historyText);
                      } else {
                        alert('Fejl: ' + (data.error || 'Kunne ikke hente data'));
                      }
                    } catch (e) {
                      alert('Fejl: ' + e);
                    } finally {
                      setIsFetchingMeta(false);
                    }
                  }}
                  disabled={isFetchingMeta}
                  className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  {isFetchingMeta ? 'Henter...' : 'Hent fra Meta'}
                </button>
              )}
            </div>
            <textarea
              value={historyContent}
              onChange={(e) => setHistoryContent(e.target.value)}
              placeholder="Paste dine tidligere opslag her, eller brug 'Hent fra Meta' knappen..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 text-sm"
              rows={4}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {historyContent ? `${historyContent.split('\n').filter(l => l.trim()).length} linjer indlæst` : 'Valgfrit - hjælper systemet med at undgå gentagelser'}
            </p>
          </div>

          {/* Client notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Løbende noter fra kunden
            </label>
            <textarea
              value={clientNotes}
              onChange={(e) => setClientNotes(e.target.value)}
              placeholder="Tilføj noter fra kunden her... F.eks. 'Vi har lukket d. 14 feb', 'Ny ret på menuen', etc."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 text-sm"
              rows={2}
            />
          </div>

          {/* Meta API Token */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Meta Page Access Token
            </label>
            <input
              type="password"
              value={metaToken}
              onChange={(e) => setMetaToken(e.target.value)}
              placeholder="EAA..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 text-sm font-mono"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Bruges til at hente historik og schedule posts til Business Suite
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

          <PostList 
            posts={posts} 
            images={images} 
            onCaptionChange={handleCaptionChange}
            onImagesChange={handleImagesChange}
            onSchedule={handleSchedule}
            startDate={batchStartDate}
            onPostsRegenerated={(regeneratedPosts) => {
              // Update each regenerated post in the store
              for (const post of regeneratedPosts) {
                updatePost(post.id, {
                  seed: post.seed,
                  caption: post.caption,
                  postingTime: post.postingTime,
                  reasoning: post.reasoning,
                });
              }
            }}
            imageAnalyses={useGenerationStore.getState().analyses.map(a => ({
              id: a.id,
              content: a.content,
              mood: a.mood,
              strategicFit: a.strategicFit,
            }))}
            phase={currentCampaign?.currentPhase || 'ESTABLISHMENT'}
            history={historyContent}
          />

          {/* Graphics Queue - Brain's Recommendations */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-purple-500" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Grafik Anbefalinger
              </h3>
              {graphicSuggestions.length > 0 && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  ({graphicSuggestions.filter(s => s.status === 'done').length}/{graphicSuggestions.length} genereret)
                </span>
              )}
            </div>

            {graphicSuggestions.length > 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  The Brain har anbefalet grafik til disse dage. Klik &quot;Generer&quot; for at lave dem enkeltvis, og &quot;Tilføj til post&quot; for at knytte dem til opslaget.
                </p>
                {graphicSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.dayNumber}
                    className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-750 rounded-lg border border-gray-200 dark:border-gray-600"
                  >
                    {/* Preview or placeholder */}
                    <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-600">
                      {suggestion.blobUrl ? (
                        <img src={suggestion.blobUrl} alt={suggestion.concept} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Image className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">Dag {suggestion.dayNumber}</span>
                        {suggestion.headline && (
                          <span className="text-xs text-purple-600 dark:text-purple-400 font-mono">&quot;{suggestion.headline}&quot;</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">{suggestion.concept}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 italic">{suggestion.reason}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Stil: {suggestion.style}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {suggestion.status === 'pending' && (
                        <button
                          onClick={() => handleGenerateSingleGraphic(suggestion.dayNumber)}
                          className="px-3 py-1.5 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3" />
                          Generer
                        </button>
                      )}
                      {suggestion.status === 'generating' && (
                        <button disabled className="px-3 py-1.5 text-sm bg-purple-400 text-white rounded-lg opacity-75 flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Genererer...
                        </button>
                      )}
                      {suggestion.status === 'done' && (
                        <>
                          <button
                            onClick={() => handleAddGraphicToPost(suggestion.dayNumber)}
                            className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-1"
                          >
                            <ChevronRight className="w-3 h-3" />
                            Tilføj til post
                          </button>
                          <button
                            onClick={() => handleGenerateSingleGraphic(suggestion.dayNumber)}
                            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Generer ny
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 dark:bg-gray-750 rounded-lg">
                <Sparkles className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  The Brain har ikke anbefalet grafik til nogen dage endnu.
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Grafik-anbefalinger genereres automatisk under content planlægning.
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
