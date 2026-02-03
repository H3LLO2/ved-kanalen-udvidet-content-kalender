import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, Loader2, Download, Sparkles, DollarSign, PartyPopper } from 'lucide-react';
import { useEventGraphicsStore } from '../../stores';
import { generateGraphic, BRAND_COLORS } from '../../agents/designer';
import { createImageUrl, generateId } from '../../lib/database';
import type { EventGraphicImage } from '../../types';

interface EventGraphicsGeneratorProps {
  campaignId: string;
}

// Gemini image generation pricing (USD per image)
const COST_PER_IMAGE_USD = 0.04;

// 5 different visual styles for event graphics
const EVENT_GRAPHIC_STYLES = [
  {
    name: 'Bold Typography',
    description: 'Large, impactful text with minimal design',
    prompt: `STYLE: Bold Swiss Typography
- Massive, bold sans-serif numbers and text
- High contrast: dark green on cream, or cream on dark green
- Geometric shapes as accents (circles, lines)
- Reference: Swiss International Style posters`,
  },
  {
    name: 'Warm Invitation',
    description: 'Cozy, welcoming feel with warm colors',
    prompt: `STYLE: Warm Invitation Card
- Warm color palette: terracotta, warm brown, cream
- Elegant but casual typography
- Subtle texture: paper grain or linen
- Reference: Scandinavian hygge aesthetics, cozy bistro vibes`,
  },
  {
    name: 'Minimalist Modern',
    description: 'Clean, ultra-minimal design',
    prompt: `STYLE: Minimalist Modern
- Extreme simplicity: one or two elements only
- Lots of negative space
- Single accent color on neutral background
- Reference: Japanese minimalism, Copenhagen design studios`,
  },
  {
    name: 'Playful Geometric',
    description: 'Fun shapes and patterns',
    prompt: `STYLE: Playful Geometric
- Abstract geometric shapes: circles, arcs, rectangles
- Layered colors from the palette
- Dynamic, celebratory feeling
- Reference: Modern event posters, Memphis design (subtle)`,
  },
  {
    name: 'Elegant Classic',
    description: 'Sophisticated, timeless design',
    prompt: `STYLE: Elegant Classic
- Refined serif typography
- Subtle borders or frames
- Muted, sophisticated color usage
- Reference: Fine dining menus, gallery invitations`,
  },
];

// Build event-specific prompt for graphic generation
function buildEventGraphicPrompt(
  postText: string,
  eventContext: string,
  styleConfig: typeof EVENT_GRAPHIC_STYLES[0]
): string {
  const colorPalette = `${BRAND_COLORS.cream} (warm cream), ${BRAND_COLORS.darkGreen} (forest green), ${BRAND_COLORS.warmBrown} (warm brown), ${BRAND_COLORS.terracotta} (terracotta accent), ${BRAND_COLORS.charcoal} (charcoal text)`;

  return `Create a social media graphic for a Danish bistro's OPEN HOUSE event.

===== CRITICAL: WHAT THIS IS NOT =====
- NOT a photograph
- NOT photorealistic
- NOT AI-generated looking
- NOT showing people, faces, or food
- NOT busy or cluttered
- NOT generic or stock-looking

===== WHAT THIS IS =====
A professionally designed EVENT ANNOUNCEMENT graphic for social media.
${styleConfig.prompt}

===== EVENT DETAILS =====
${eventContext}

===== POST TEXT (for context/mood) =====
${postText}

===== COLOR PALETTE =====
${colorPalette}

===== KEY INFO TO POTENTIALLY FEATURE =====
- "ÅBENT HUS" or "ÅBNING" (Open House / Opening)
- "Lørdag 31. januar" (Saturday January 31)
- "11:30-16:00"
- "Øl & Vin kr 25,-"
- "Ved Kanalen"
- "Smagsprøver" (Tastings)

(Don't include ALL info - pick what fits the style. Some styles work better with minimal text.)

===== TECHNICAL SPECS =====
- Aspect ratio: 1:1 square (1080x1080 pixels feel)
- Typography must be PERFECTLY crisp and legible
- If using Danish text, spell it correctly

===== QUALITY CHECK =====
Before generating, ensure:
1. A human designer would be proud of this
2. It does NOT look AI-generated
3. Typography is flawless
4. It feels celebratory but tasteful
5. It matches Ved Kanalen's warm, authentic brand

Generate the graphic now.`;
}

export function EventGraphicsGenerator({ campaignId }: EventGraphicsGeneratorProps) {
  const [postText, setPostText] = useState('');
  const [eventContext, setEventContext] = useState(
    `Åbent Hus hos Ved Kanalen
Lørdag den 31. januar 2026
Kl. 11:30 - 16:00

Øl og vin til kr 25,- per glas
Smagsprøver fra den nye menu
Efter kl. 16:00 normalt åbent for mad og drikkevarer`
  );
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const {
    eventPosts,
    isLoading,
    isGenerating,
    generationProgress,
    loadEventPosts,
    addEventPost,
    removeEventPost,
    setImages,
    setGenerating,
    setGenerationProgress,
    setError,
  } = useEventGraphicsStore();

  // Load event posts on mount
  useEffect(() => {
    loadEventPosts(campaignId);
  }, [campaignId, loadEventPosts]);

  // Handle adding a new post
  const handleAddPost = useCallback(async () => {
    if (!postText.trim()) return;

    await addEventPost(campaignId, postText.trim(), eventContext.trim());
    setPostText('');
  }, [campaignId, postText, eventContext, addEventPost]);

  // Generate graphics for a specific event post
  const handleGenerateGraphics = useCallback(
    async (eventPostId: string, text: string, context: string) => {
      setGeneratingId(eventPostId);
      setGenerating(true);
      setGenerationProgress(0, 5);

      const images: EventGraphicImage[] = [];

      try {
        // Generate 5 variations with different styles
        for (let i = 0; i < EVENT_GRAPHIC_STYLES.length; i++) {
          const style = EVENT_GRAPHIC_STYLES[i]!;
          const prompt = buildEventGraphicPrompt(text, context, style);

          const result = await generateGraphic({
            concept: prompt,
            style: style.name,
          });

          setGenerationProgress(i + 1, 5);

          if (result.success && result.imageBlob) {
            images.push({
              id: generateId(),
              blob: result.imageBlob,
              style: `${style.name}: ${style.description}`,
              costUsd: COST_PER_IMAGE_USD,
              createdAt: new Date(),
            });
          }

          // Delay between requests
          if (i < EVENT_GRAPHIC_STYLES.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }

        // Save images to the event post
        await setImages(eventPostId, images);
      } catch (err) {
        console.error('Failed to generate event graphics:', err);
        setError(err instanceof Error ? err.message : 'Generation failed');
      } finally {
        setGenerating(false);
        setGeneratingId(null);
      }
    },
    [setGenerating, setGenerationProgress, setImages, setError]
  );

  // Download a single image
  const handleDownloadImage = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Calculate total cost for an event post
  const getTotalCost = (images: EventGraphicImage[]) => {
    return images.reduce((sum, img) => sum + (img.costUsd || COST_PER_IMAGE_USD), 0);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <PartyPopper className="w-6 h-6 text-purple-500" />
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Event Grafik Generator
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Generer 5 forskellige billeder til event-opslag (Åbent Hus)
          </p>
        </div>
      </div>

      {/* Event context (editable) */}
      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 space-y-3">
        <label className="block text-sm font-medium text-purple-700 dark:text-purple-300">
          Event kontekst (bruges til alle billeder)
        </label>
        <textarea
          value={eventContext}
          onChange={(e) => setEventContext(e.target.value)}
          rows={5}
          className="w-full px-4 py-3 border border-purple-300 dark:border-purple-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-sm"
        />
      </div>

      {/* Add new post text */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Opslags-tekst (kopier din caption ind her)
        </label>
        <textarea
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          placeholder="Indsæt teksten til dit opslag her..."
          rows={4}
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
        />
        <button
          onClick={handleAddPost}
          disabled={!postText.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          Tilføj opslag og generer 5 billeder
        </button>
      </div>

      {/* List of event posts */}
      {eventPosts.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <PartyPopper className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            Ingen event-opslag endnu. Tilføj et ovenfor.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {eventPosts.map((post) => (
            <div
              key={post.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              {/* Post header */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-gray-900 dark:text-white whitespace-pre-wrap text-sm">
                      {post.postText}
                    </p>
                    {post.images.length > 0 && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        Total: ${getTotalCost(post.images).toFixed(2)} USD ({post.images.length} billeder)
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleGenerateGraphics(post.id, post.postText, post.eventContext)}
                      disabled={isGenerating}
                      className="flex items-center gap-2 px-3 py-1.5 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {generatingId === post.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {generationProgress.current}/{generationProgress.total}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          {post.images.length > 0 ? 'Generer igen' : 'Generer 5 billeder'}
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => removeEventPost(post.id)}
                      disabled={isGenerating}
                      className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                      title="Slet"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                  Tilføjet {post.createdAt.toLocaleDateString('da-DK')}
                </p>
              </div>

              {/* Generated images */}
              {post.images.length > 0 ? (
                <div className="p-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {post.images.map((img, index) => {
                      const blobUrl = createImageUrl(img.blob);
                      return (
                        <div
                          key={img.id}
                          className="relative group bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden"
                        >
                          <img
                            src={blobUrl}
                            alt={img.style}
                            className="w-full aspect-square object-cover"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                              onClick={() =>
                                handleDownloadImage(
                                  img.blob,
                                  `event-grafik-${index + 1}-${Date.now()}.png`
                                )
                              }
                              className="flex items-center gap-2 px-3 py-2 bg-white text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
                            >
                              <Download className="w-4 h-4" />
                              Download
                            </button>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                            <p className="text-white text-xs font-medium truncate">
                              {EVENT_GRAPHIC_STYLES[index]?.name || `Style ${index + 1}`}
                            </p>
                            <p className="text-green-400 text-xs font-mono flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              {(img.costUsd || COST_PER_IMAGE_USD).toFixed(2)} USD
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center">
                  <Sparkles className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Klik &quot;Generer 5 billeder&quot; for at lave event grafik
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
