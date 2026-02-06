import { useState } from 'react';
import { PostCard } from './PostCard';
import type { Post } from '../../types';
import type { DisplayImage } from '../../stores';
import { Calendar, Download, RefreshCw, Sparkles, Check, Square, CheckSquare } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002';

interface PostListProps {
  posts: Post[];
  images: DisplayImage[];
  onCaptionChange?: (id: string, newCaption: string) => void;
  onPostsRegenerated?: (regeneratedPosts: Post[]) => void;
  imageAnalyses?: Array<{ id: string; content: string; mood: string; strategicFit: string }>;
  phase?: string;
  history?: string;
}

export function PostList({ 
  posts, 
  images, 
  onCaptionChange,
  onPostsRegenerated,
  imageAnalyses = [],
  phase = 'ESTABLISHMENT',
  history = '',
}: PostListProps) {
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [themePrompt, setThemePrompt] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showThemePanel, setShowThemePanel] = useState(false);

  const sortedPosts = [...posts].sort((a, b) => a.dayNumber - b.dayNumber);

  const toggleDay = (day: number) => {
    const newSelected = new Set(selectedDays);
    if (newSelected.has(day)) {
      newSelected.delete(day);
    } else {
      newSelected.add(day);
    }
    setSelectedDays(newSelected);
  };

  const selectAll = () => {
    setSelectedDays(new Set(sortedPosts.map(p => p.dayNumber)));
  };

  const selectNone = () => {
    setSelectedDays(new Set());
  };

  const handleRegenerateSelected = async () => {
    if (selectedDays.size === 0 || !themePrompt.trim()) return;

    setIsRegenerating(true);
    try {
      // First, regenerate the plan for selected days
      const response = await fetch(`${API_BASE}/api/regenerate-selected`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedDays: Array.from(selectedDays),
          themePrompt: themePrompt.trim(),
          existingPlan: sortedPosts.map(p => ({
            day: p.dayNumber,
            imageIds: p.imageIds,
            seed: p.seed,
            caption: p.caption,
          })),
          imageAnalyses,
          phase,
          history,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate plan');
      }

      const data = await response.json();
      
      if (!data.success || !data.regeneratedPlan?.plan) {
        throw new Error(data.error || 'Invalid response');
      }

      // Now generate new captions for the regenerated days
      const regeneratedPosts: Post[] = [];
      let previousCaption = '';

      for (const newDay of data.regeneratedPlan.plan) {
        const imageContext = imageAnalyses
          .filter(a => newDay.imageIds.includes(a.id))
          .map(a => a.content)
          .join('; ');

        const voiceResponse = await fetch(`${API_BASE}/api/voice-themed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            seed: newDay.seed,
            imageContext,
            previousPost: previousCaption,
            phase,
            hookType: newDay.hookType,
            ctaType: newDay.ctaType,
            dayNumber: newDay.day,
            themeOverlay: themePrompt.trim(),
          }),
        });

        const voiceData = await voiceResponse.json();
        const newCaption = voiceData.success ? voiceData.caption : `[Fejl] ${newDay.seed}`;
        previousCaption = newCaption;

        // Find original post and update it
        const originalPost = posts.find(p => p.dayNumber === newDay.day);
        if (originalPost) {
          regeneratedPosts.push({
            ...originalPost,
            seed: newDay.seed,
            caption: newCaption,
            postingTime: newDay.time || originalPost.postingTime,
            reasoning: newDay.reasoning || `Tema: ${themePrompt}`,
            updatedAt: new Date(),
          });
        }
      }

      // Notify parent of regenerated posts
      if (onPostsRegenerated) {
        onPostsRegenerated(regeneratedPosts);
      }

      // Clear selection and theme
      setSelectedDays(new Set());
      setThemePrompt('');
      setShowThemePanel(false);

    } catch (error) {
      console.error('Regeneration failed:', error);
      alert('Regenerering fejlede: ' + (error instanceof Error ? error.message : 'Ukendt fejl'));
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleExportAll = () => {
    const exportData = sortedPosts.map((post) => ({
      day: post.dayNumber,
      time: post.postingTime,
      caption: post.caption,
      hashtags: post.hashtags || [],
      imageCount: post.imageIds.length,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ved-kanalen-content-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportText = () => {
    const text = sortedPosts
      .map((post) => {
        const hashtagStr = post.hashtags?.length ? `\n\n${post.hashtags.join(' ')}` : '';
        return `=== DAG ${post.dayNumber} (${post.postingTime}) ===\n\n${post.caption}${hashtagStr}\n\n`;
      })
      .join('\n---\n\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ved-kanalen-content-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (posts.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Ingen opslag endnu</p>
        <p className="text-sm mt-1">Generer indhold for at se dine opslag her</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with export buttons */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {posts.length} opslag klar
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowThemePanel(!showThemePanel)}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              showThemePanel || selectedDays.size > 0
                ? 'bg-purple-500 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Tema-overlay
          </button>
          <button
            onClick={handleExportText}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            TXT
          </button>
          <button
            onClick={handleExportAll}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            JSON
          </button>
        </div>
      </div>

      {/* Theme overlay panel */}
      {showThemePanel && (
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              <h3 className="font-medium text-gray-900 dark:text-white">Tema-overlay</h3>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <button onClick={selectAll} className="text-purple-600 hover:underline">
                Vælg alle
              </button>
              <span className="text-gray-400">|</span>
              <button onClick={selectNone} className="text-purple-600 hover:underline">
                Fravælg alle
              </button>
            </div>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400">
            Vælg dage nedenfor og skriv et tema. De valgte dage regenereres med dit tema.
          </p>

          <div className="flex flex-wrap gap-2">
            {sortedPosts.map((post) => (
              <button
                key={post.dayNumber}
                onClick={() => toggleDay(post.dayNumber)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  selectedDays.has(post.dayNumber)
                    ? 'bg-purple-500 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-purple-400'
                }`}
              >
                {selectedDays.has(post.dayNumber) ? (
                  <CheckSquare className="w-4 h-4" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                Dag {post.dayNumber}
              </button>
            ))}
          </div>

          {selectedDays.size > 0 && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tema / Prompt for dag {Array.from(selectedDays).sort((a,b) => a-b).join(', ')}
                </label>
                <textarea
                  value={themePrompt}
                  onChange={(e) => setThemePrompt(e.target.value)}
                  placeholder="F.eks: Valentine's dag - romantik, par-middag, kærlighed, date night..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  rows={2}
                />
              </div>

              <button
                onClick={handleRegenerateSelected}
                disabled={isRegenerating || !themePrompt.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRegenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Regenererer {selectedDays.size} dage...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Regenerer {selectedDays.size} valgte dage
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Posts grid - with selection indicators when theme panel is open */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sortedPosts.map((post) => (
          <div key={post.id} className="relative">
            {showThemePanel && (
              <button
                onClick={() => toggleDay(post.dayNumber)}
                className={`absolute -top-2 -left-2 z-10 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                  selectedDays.has(post.dayNumber)
                    ? 'bg-purple-500 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-400 border border-gray-300 dark:border-gray-600 hover:border-purple-400'
                }`}
              >
                {selectedDays.has(post.dayNumber) ? (
                  <Check className="w-4 h-4" />
                ) : null}
              </button>
            )}
            <div className={showThemePanel && selectedDays.has(post.dayNumber) ? 'ring-2 ring-purple-500 rounded-lg' : ''}>
              <PostCard
                post={post}
                images={images}
                onCaptionChange={onCaptionChange}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
