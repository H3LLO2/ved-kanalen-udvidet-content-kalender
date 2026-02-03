import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, Loader2, Image, Download, Sparkles, DollarSign } from 'lucide-react';
import { useMenuExemptStore } from '../../stores';
import { generateGraphic, BRAND_COLORS } from '../../agents/designer';
import { createImageUrl, generateId } from '../../lib/database';
import type { MenuExemptImage } from '../../types';

// Gemini image generation pricing (USD per image)
const COST_PER_IMAGE_USD = 0.04;

interface MenuExemptGeneratorProps {
  campaignId: string;
}

// Build a menu-specific prompt for graphic generation
function buildMenuGraphicPrompt(description: string, variation: 1 | 2): string {
  const colorPalette = `${BRAND_COLORS.cream} (warm cream background), ${BRAND_COLORS.darkGreen} (forest green), ${BRAND_COLORS.warmBrown} (warm brown), ${BRAND_COLORS.terracotta} (terracotta accent)`;

  const variationStyle = variation === 1
    ? `
VARIATION 1: Typography-focused
- Feature the dish name prominently
- Use elegant serif or modern sans-serif typography
- Clean, minimal layout with generous whitespace
- Reference style: Fine dining menu cards, Kinfolk magazine`
    : `
VARIATION 2: Abstract/Mood
- Create an abstract representation of the dish's essence
- Use geometric shapes, textures, or patterns
- Evoke the mood and feeling rather than literal depiction
- Reference style: Scandinavian design posters, abstract food art`;

  return `Create a social media graphic for a Danish bistro menu item.

===== CRITICAL: WHAT THIS IS NOT =====
- NOT a photograph of food
- NOT photorealistic
- NOT AI-generated looking
- NOT showing actual food or ingredients
- NOT stock design or clip art
- NOT busy or cluttered

===== WHAT THIS IS =====
A TYPOGRAPHY-FOCUSED or ABSTRACT graphic that represents this menu item elegantly.
${variationStyle}

===== COLOR PALETTE (use these exact tones) =====
${colorPalette}

===== MENU ITEM DESCRIPTION =====
${description}

===== DESIGN BRIEF =====
Create a graphic that captures the ESSENCE of this dish without showing the food itself.
Focus on: the mood, the season, the ingredients' origins, or the dining experience.
Think: how would a Copenhagen design studio represent this dish abstractly?

===== TECHNICAL SPECS =====
- Aspect ratio: 1:1 square (1080x1080 pixels feel)
- Style: Scandinavian minimal, warm bistro aesthetic
- High contrast, sharp edges
- If using text: typography must be PERFECTLY crisp and legible
- Brand name "Ved Kanalen" can appear small at bottom if appropriate

===== QUALITY CHECK =====
Before generating, ensure:
1. A human designer would be proud of this
2. It does NOT look AI-generated
3. Typography (if any) is flawless
4. Colors are from the specified palette
5. Design is simple, not busy
6. It represents the dish's essence, not literal appearance

Generate the graphic now.`;
}

export function MenuExemptGenerator({ campaignId }: MenuExemptGeneratorProps) {
  const [newDescription, setNewDescription] = useState('');
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const {
    menuExempts,
    isLoading,
    isGenerating,
    generationProgress,
    loadMenuExempts,
    addMenuExempt,
    removeMenuExempt,
    setImages,
    setGenerating,
    setGenerationProgress,
    setError,
  } = useMenuExemptStore();

  // Load menu exempts on mount
  useEffect(() => {
    loadMenuExempts(campaignId);
  }, [campaignId, loadMenuExempts]);

  // Handle adding a new description
  const handleAddDescription = useCallback(async () => {
    if (!newDescription.trim()) return;

    await addMenuExempt(campaignId, newDescription.trim());
    setNewDescription('');
  }, [campaignId, newDescription, addMenuExempt]);

  // Generate graphics for a specific menu exempt
  const handleGenerateGraphics = useCallback(
    async (menuExemptId: string, description: string) => {
      setGeneratingId(menuExemptId);
      setGenerating(true);
      setGenerationProgress(0, 2);

      const images: MenuExemptImage[] = [];

      try {
        // Generate 2 variations
        for (let i = 1; i <= 2; i++) {
          const prompt = buildMenuGraphicPrompt(description, i as 1 | 2);

          const result = await generateGraphic({
            concept: prompt,
            style: i === 1 ? 'Typography-focused menu card' : 'Abstract mood representation',
          });

          setGenerationProgress(i, 2);

          if (result.success && result.imageBlob) {
            images.push({
              id: generateId(),
              blob: result.imageBlob,
              description: result.description || `Variation ${i}`,
              costUsd: COST_PER_IMAGE_USD,
              createdAt: new Date(),
            });
          }

          // Delay between requests
          if (i < 2) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }

        // Save images to the menu exempt
        await setImages(menuExemptId, images);
      } catch (err) {
        console.error('Failed to generate graphics:', err);
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
        <Image className="w-6 h-6 text-amber-500" />
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Menu Grafik Generator
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Indsæt menu beskrivelser og generer grafik til sociale medier
          </p>
        </div>
      </div>

      {/* Add new description */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Ny menu beskrivelse
        </label>
        <textarea
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="Indsæt menu beskrivelse her... f.eks. 'Stegt flæsk med persillesovs og kartofler - klassisk dansk comfort food med sprød svær og cremet sovs'"
          rows={4}
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
        />
        <button
          onClick={handleAddDescription}
          disabled={!newDescription.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          Tilføj beskrivelse
        </button>
      </div>

      {/* List of menu exempts */}
      {menuExempts.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <Image className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            Ingen menu beskrivelser endnu. Tilføj en ovenfor.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {menuExempts.map((exempt) => (
            <div
              key={exempt.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              {/* Description header */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-gray-900 dark:text-white flex-1">
                    {exempt.description}
                  </p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleGenerateGraphics(exempt.id, exempt.description)}
                      disabled={isGenerating}
                      className="flex items-center gap-2 px-3 py-1.5 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {generatingId === exempt.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {generationProgress.current}/{generationProgress.total}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          {exempt.images.length > 0 ? 'Generer igen' : 'Generer grafik'}
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => removeMenuExempt(exempt.id)}
                      disabled={isGenerating}
                      className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                      title="Slet"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                  Tilføjet {exempt.createdAt.toLocaleDateString('da-DK')}
                </p>
              </div>

              {/* Generated images */}
              {exempt.images.length > 0 ? (
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-4">
                    {exempt.images.map((img, index) => {
                      const blobUrl = createImageUrl(img.blob);
                      return (
                        <div
                          key={img.id}
                          className="relative group bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden"
                        >
                          <img
                            src={blobUrl}
                            alt={img.description}
                            className="w-full aspect-square object-cover"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                              onClick={() =>
                                handleDownloadImage(
                                  img.blob,
                                  `menu-grafik-${index + 1}-${Date.now()}.png`
                                )
                              }
                              className="flex items-center gap-2 px-3 py-2 bg-white text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
                            >
                              <Download className="w-4 h-4" />
                              Download
                            </button>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                            <p className="text-white text-xs">
                              Variation {index + 1}
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
                    Klik &quot;Generer grafik&quot; for at lave 2 billeder
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
