import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, Loader2, Download, Sparkles, DollarSign, Wand2 } from 'lucide-react';
import { useFlexibleGraphicsStore } from '../../stores';
import { generateGraphic, BRAND_COLORS } from '../../agents/designer';
import { createImageUrl, generateId } from '../../lib/database';
import type { FlexibleGraphicImage, FlexibleContentType } from '../../types';

interface FlexibleGraphicsGeneratorProps {
  campaignId: string;
}

// Gemini image generation pricing (USD per image)
const COST_PER_IMAGE_USD = 0.04;

// Content type detection based on keywords
function detectContentType(text: string): FlexibleContentType {
  const lowerText = text.toLowerCase();

  // Event keywords
  if (lowerText.includes('event') || lowerText.includes('fest') || lowerText.includes('koncert') ||
      lowerText.includes('aften') || lowerText.includes('arrangement') || lowerText.includes('jazz') ||
      lowerText.includes('musik') || lowerText.includes('live') || lowerText.includes('dj')) {
    return 'event';
  }

  // Opening keywords
  if (lowerText.includes('åbning') || lowerText.includes('åbent hus') || lowerText.includes('grand opening') ||
      lowerText.includes('indvielse') || lowerText.includes('premiere') || lowerText.includes('velkommen')) {
    return 'opening';
  }

  // Menu keywords
  if (lowerText.includes('menu') || lowerText.includes('ret ') || lowerText.includes('serverer') ||
      lowerText.includes('smag') || lowerText.includes('ingrediens') || lowerText.includes('kok') ||
      lowerText.includes('frokost') || lowerText.includes('aftensmad') || lowerText.includes('dessert') ||
      lowerText.includes('vin') || lowerText.includes('øl') || lowerText.includes('drink')) {
    return 'menu';
  }

  // Information keywords
  if (lowerText.includes('åbningstid') || lowerText.includes('lukket') || lowerText.includes('info') ||
      lowerText.includes('adresse') || lowerText.includes('kontakt') || lowerText.includes('telefon') ||
      lowerText.includes('booking') || lowerText.includes('reservation')) {
    return 'information';
  }

  // Announcement keywords
  if (lowerText.includes('nyt') || lowerText.includes('nyhed') || lowerText.includes('annonce') ||
      lowerText.includes('meddel') || lowerText.includes('vigtig') || lowerText.includes('opdater')) {
    return 'announcement';
  }

  return 'general';
}

// Content type labels in Danish
const CONTENT_TYPE_LABELS: Record<FlexibleContentType, string> = {
  event: 'Event',
  menu: 'Menu',
  information: 'Information',
  opening: 'Åbning',
  announcement: 'Nyhed',
  general: 'Generelt',
};

// 3 different visual styles that adapt to content type
const FLEXIBLE_GRAPHIC_STYLES = [
  {
    name: 'Clean & Bold',
    description: 'Ren, moderne typografi med stærk kontrast',
    getPrompt: (contentType: FlexibleContentType) => `STYLE: Clean & Bold Typography
- Large, impactful sans-serif typography
- High contrast: ${contentType === 'event' || contentType === 'opening' ? 'dark green on cream' : 'cream on dark green'}
- Minimal design elements - let the text speak
- ${contentType === 'event' ? 'Celebratory but sophisticated feel' : ''}
${contentType === 'opening' ? '- Welcoming, inviting atmosphere' : ''}
${contentType === 'menu' ? '- Elegant, appetizing presentation' : ''}
${contentType === 'information' ? '- Clear, easy-to-read hierarchy' : ''}
- Reference: Swiss International Style, modern Scandinavian design`,
  },
  {
    name: 'Warm & Textured',
    description: 'Varm, indbydende stil med tekstur',
    getPrompt: (contentType: FlexibleContentType) => `STYLE: Warm & Textured
- Warm color palette: terracotta, warm brown, cream
- Subtle paper or fabric texture in background
- ${contentType === 'event' ? 'Festive but cozy atmosphere' : ''}
${contentType === 'opening' ? '- Hygge-inspired, personal warmth' : ''}
${contentType === 'menu' ? '- Rustic bistro feel, artisanal quality' : ''}
${contentType === 'information' ? '- Friendly, approachable tone' : ''}
- Elegant but casual typography
- Reference: Scandinavian hygge aesthetics, Copenhagen bistro vibes`,
  },
  {
    name: 'Geometric Accent',
    description: 'Moderne med geometriske accenter',
    getPrompt: (contentType: FlexibleContentType) => `STYLE: Geometric Accent
- Clean background with geometric shape accents
- Circles, arcs, or rectangles as design elements
- ${contentType === 'event' ? 'Dynamic, energetic shapes' : ''}
${contentType === 'opening' ? '- Open, welcoming geometric forms' : ''}
${contentType === 'menu' ? '- Subtle, elegant geometric framing' : ''}
${contentType === 'information' ? '- Organized, structured layout with shapes' : ''}
- Colors from Ved Kanalen palette
- Reference: Modern poster design, Bauhaus influence`,
  },
];

// Build content-adaptive prompt for graphic generation
function buildFlexibleGraphicPrompt(
  inputText: string,
  contentType: FlexibleContentType,
  styleConfig: typeof FLEXIBLE_GRAPHIC_STYLES[0]
): string {
  const colorPalette = `${BRAND_COLORS.cream} (warm cream), ${BRAND_COLORS.darkGreen} (forest green), ${BRAND_COLORS.warmBrown} (warm brown), ${BRAND_COLORS.terracotta} (terracotta accent), ${BRAND_COLORS.charcoal} (charcoal text)`;

  const contentTypeGuidance = {
    event: 'This is for an EVENT announcement - capture excitement and anticipation',
    menu: 'This is for MENU/FOOD content - evoke taste and quality without showing food',
    information: 'This is PRACTICAL INFORMATION - clarity and readability are paramount',
    opening: 'This is for an OPENING/LAUNCH - convey excitement and welcome',
    announcement: 'This is a NEWS ANNOUNCEMENT - important but not alarming',
    general: 'This is GENERAL content - focus on brand feeling and atmosphere',
  };

  return `Create a social media graphic for a Danish bistro called "Ved Kanalen".

===== CRITICAL: WHAT THIS IS NOT =====
- NOT a photograph
- NOT photorealistic
- NOT AI-generated looking
- NOT showing people, faces, or food
- NOT busy or cluttered
- NOT generic stock design

===== WHAT THIS IS =====
A professionally designed social media graphic that looks like it was made by a Copenhagen design studio.
${styleConfig.getPrompt(contentType)}

===== CONTENT TYPE =====
${contentTypeGuidance[contentType]}

===== INPUT TEXT (use this as your content/inspiration) =====
${inputText}

===== DESIGN BRIEF =====
Extract the key message from the input text and present it beautifully.
- Pick the 1-3 most important pieces of information
- Don't try to include everything - less is more
- If there are dates/times, feature them prominently
- Danish text must be spelled correctly

===== COLOR PALETTE =====
${colorPalette}

===== TECHNICAL SPECS =====
- Aspect ratio: 1:1 square (1080x1080 pixels feel)
- Typography must be PERFECTLY crisp and legible
- If using Danish text, spell it correctly
- "Ved Kanalen" can appear small at bottom if appropriate

===== QUALITY CHECK =====
Before generating, ensure:
1. A human designer would be proud of this
2. It does NOT look AI-generated
3. Typography is flawless
4. It feels authentically Ved Kanalen - warm, honest, Scandinavian
5. The key message is immediately clear

Generate the graphic now.`;
}

export function FlexibleGraphicsGenerator({ campaignId }: FlexibleGraphicsGeneratorProps) {
  const [inputText, setInputText] = useState('');
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const {
    flexiblePosts,
    isLoading,
    isGenerating,
    generationProgress,
    loadFlexiblePosts,
    addFlexiblePost,
    removeFlexiblePost,
    setImages,
    setGenerating,
    setGenerationProgress,
    setError,
  } = useFlexibleGraphicsStore();

  // Load flexible posts on mount
  useEffect(() => {
    loadFlexiblePosts(campaignId);
  }, [campaignId, loadFlexiblePosts]);

  // Handle adding a new input text
  const handleAddInput = useCallback(async () => {
    if (!inputText.trim()) return;

    const detectedType = detectContentType(inputText);
    await addFlexiblePost(campaignId, inputText.trim(), detectedType);
    setInputText('');
  }, [campaignId, inputText, addFlexiblePost]);

  // Generate graphics for a specific flexible post
  const handleGenerateGraphics = useCallback(
    async (flexiblePostId: string, text: string, contentType: FlexibleContentType) => {
      setGeneratingId(flexiblePostId);
      setGenerating(true);
      setGenerationProgress(0, 3);

      const images: FlexibleGraphicImage[] = [];

      try {
        // Generate 3 variations with different styles
        for (let i = 0; i < FLEXIBLE_GRAPHIC_STYLES.length; i++) {
          const style = FLEXIBLE_GRAPHIC_STYLES[i]!;
          const prompt = buildFlexibleGraphicPrompt(text, contentType, style);

          const result = await generateGraphic({
            concept: prompt,
            style: style.name,
          });

          setGenerationProgress(i + 1, 3);

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
          if (i < FLEXIBLE_GRAPHIC_STYLES.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }

        // Save images to the flexible post
        await setImages(flexiblePostId, images);
      } catch (err) {
        console.error('Failed to generate flexible graphics:', err);
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

  // Calculate total cost for a post
  const getTotalCost = (images: FlexibleGraphicImage[]) => {
    return images.reduce((sum, img) => sum + (img.costUsd || COST_PER_IMAGE_USD), 0);
  };

  // Preview detected content type
  const previewContentType = inputText.trim() ? detectContentType(inputText) : null;

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
        <Wand2 className="w-6 h-6 text-teal-500" />
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Fleksibel Grafik Generator
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Indtast tekst og generer 3 grafik-variationer der tilpasser sig indholdet
          </p>
        </div>
      </div>

      {/* Add new input text */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Indtast din tekst (event, menu, information, osv.)
        </label>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Skriv eller indsæt tekst her... f.eks. 'Jazz-aften fredag d. 14. februar kl. 20:00 - Live musik med Copenhagen Jazz Trio'"
          rows={4}
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
        />

        {/* Content type preview */}
        {previewContentType && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">Detekteret type:</span>
            <span className="px-2 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full font-medium">
              {CONTENT_TYPE_LABELS[previewContentType]}
            </span>
          </div>
        )}

        <button
          onClick={handleAddInput}
          disabled={!inputText.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          Tilfoej og generer 3 variationer
        </button>
      </div>

      {/* List of flexible posts */}
      {flexiblePosts.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <Wand2 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            Ingen grafik endnu. Indtast tekst ovenfor.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {flexiblePosts.map((post) => (
            <div
              key={post.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              {/* Post header */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full text-xs font-medium">
                        {CONTENT_TYPE_LABELS[post.detectedType]}
                      </span>
                    </div>
                    <p className="text-gray-900 dark:text-white whitespace-pre-wrap text-sm">
                      {post.inputText}
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
                      onClick={() => handleGenerateGraphics(post.id, post.inputText, post.detectedType)}
                      disabled={isGenerating}
                      className="flex items-center gap-2 px-3 py-1.5 bg-teal-500 text-white text-sm rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {generatingId === post.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {generationProgress.current}/{generationProgress.total}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          {post.images.length > 0 ? 'Generer igen' : 'Generer 3 billeder'}
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => removeFlexiblePost(post.id)}
                      disabled={isGenerating}
                      className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                      title="Slet"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                  Tilfojet {post.createdAt.toLocaleDateString('da-DK')}
                </p>
              </div>

              {/* Generated images */}
              {post.images.length > 0 ? (
                <div className="p-4">
                  <div className="grid grid-cols-3 gap-4">
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
                                  `ved-kanalen-grafik-${index + 1}-${Date.now()}.png`
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
                              {FLEXIBLE_GRAPHIC_STYLES[index]?.name || `Style ${index + 1}`}
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
                    Klik &quot;Generer 3 billeder&quot; for at lave grafik
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
