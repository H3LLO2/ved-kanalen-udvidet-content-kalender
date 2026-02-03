import { useState, useCallback } from 'react';
import { Copy, Check, Edit3, Clock, Image as ImageIcon, Save, X, Hash } from 'lucide-react';
import type { Post } from '../../types';
import type { DisplayImage } from '../../stores';

interface PostCardProps {
  post: Post;
  images: DisplayImage[];
  onCaptionChange?: (id: string, newCaption: string) => void;
}

export function PostCard({ post, images, onCaptionChange }: PostCardProps) {
  const [copied, setCopied] = useState(false);
  const [copiedHashtags, setCopiedHashtags] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCaption, setEditedCaption] = useState(post.caption);

  const handleCopy = useCallback(async () => {
    try {
      // Copy caption + hashtags if hashtags exist
      const textToCopy = post.hashtags?.length
        ? `${post.caption}\n\n${post.hashtags.join(' ')}`
        : post.caption;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [post.caption, post.hashtags]);

  const handleCopyHashtags = useCallback(async () => {
    if (!post.hashtags?.length) return;
    try {
      await navigator.clipboard.writeText(post.hashtags.join(' '));
      setCopiedHashtags(true);
      setTimeout(() => setCopiedHashtags(false), 2000);
    } catch (err) {
      console.error('Failed to copy hashtags:', err);
    }
  }, [post.hashtags]);

  const handleSave = useCallback(() => {
    onCaptionChange?.(post.id, editedCaption);
    setIsEditing(false);
  }, [post.id, editedCaption, onCaptionChange]);

  const handleCancel = useCallback(() => {
    setEditedCaption(post.caption);
    setIsEditing(false);
  }, [post.caption]);

  const postImages = images.filter((img) => post.imageIds.includes(img.id));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold text-sm">
            {post.dayNumber}
          </span>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">Dag {post.dayNumber}</h3>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Clock className="w-3 h-3" />
              <span>{post.postingTime}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Rediger"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={handleCopy}
                className={`p-2 rounded-lg transition-colors ${
                  copied
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title={copied ? 'Kopieret!' : 'Kopier tekst'}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Images */}
      {postImages.length > 0 && (
        <div className={`grid gap-1 p-1 ${postImages.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {postImages.slice(0, 4).map((img) => (
            <div key={img.id} className="aspect-square overflow-hidden">
              <img
                src={img.thumbnailUrl || img.url}
                alt={img.originalName}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
          {postImages.length > 4 && (
            <div className="aspect-square bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <span className="text-gray-500 dark:text-gray-400 font-medium">
                +{postImages.length - 4}
              </span>
            </div>
          )}
        </div>
      )}

      {postImages.length === 0 && (
        <div className="p-4 flex items-center justify-center bg-gray-50 dark:bg-gray-750">
          <div className="text-center text-gray-400">
            <ImageIcon className="w-8 h-8 mx-auto mb-1" />
            <span className="text-sm">Ingen billeder</span>
          </div>
        </div>
      )}

      {/* Caption */}
      <div className="p-4">
        {isEditing ? (
          <div className="space-y-3">
            <textarea
              value={editedCaption}
              onChange={(e) => setEditedCaption(e.target.value)}
              className="w-full h-48 p-3 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                Annuller
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-1"
              >
                <Save className="w-4 h-4" />
                Gem
              </button>
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
            {post.caption}
          </div>
        )}
      </div>

      {/* Hashtags */}
      {post.hashtags && post.hashtags.length > 0 && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 mb-2">
            <Hash className="w-3 h-3 text-amber-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Hashtags
            </span>
            <button
              onClick={handleCopyHashtags}
              className={`ml-auto p-1 rounded transition-colors ${
                copiedHashtags
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={copiedHashtags ? 'Kopieret!' : 'Kopier hashtags'}
            >
              {copiedHashtags ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
          <div className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
            {post.hashtags.join(' ')}
          </div>
        </div>
      )}

      {/* Seed/Reasoning (collapsible) */}
      {post.seed && (
        <details className="border-t border-gray-200 dark:border-gray-700">
          <summary className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750">
            Seed & reasoning
          </summary>
          <div className="px-4 pb-3 space-y-2">
            <div>
              <span className="text-xs font-medium text-gray-400">Seed:</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">{post.seed}</p>
            </div>
            {post.reasoning && (
              <div>
                <span className="text-xs font-medium text-gray-400">Reasoning:</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">{post.reasoning}</p>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
