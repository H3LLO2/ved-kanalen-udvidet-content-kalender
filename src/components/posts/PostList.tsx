import { PostCard } from './PostCard';
import type { Post } from '../../types';
import type { DisplayImage } from '../../stores';
import { Calendar, Download } from 'lucide-react';

interface PostListProps {
  posts: Post[];
  images: DisplayImage[];
  onCaptionChange?: (id: string, newCaption: string) => void;
}

export function PostList({ posts, images, onCaptionChange }: PostListProps) {
  const sortedPosts = [...posts].sort((a, b) => a.dayNumber - b.dayNumber);

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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {posts.length} opslag klar
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportText}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Eksporter TXT
          </button>
          <button
            onClick={handleExportAll}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Eksporter JSON
          </button>
        </div>
      </div>

      {/* Posts grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sortedPosts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            images={images}
            onCaptionChange={onCaptionChange}
          />
        ))}
      </div>
    </div>
  );
}
