import { useState, useCallback } from 'react';
import { 
  Copy, Check, Edit3, Clock, Image as ImageIcon, Save, X, Hash, 
  Calendar, Plus, FolderOpen, Send, AlertCircle
} from 'lucide-react';
import type { Post } from '../../types';
import type { DisplayImage } from '../../stores';
import { GraphicsDrawer } from '../graphics/GraphicsDrawer';
import type { GraphicItem } from '../../stores/graphicsStore';
import { validateScheduleTime, isMetaConfigured } from '../../lib/meta-api';

interface PostCardProps {
  post: Post;
  images: DisplayImage[];
  onCaptionChange?: (id: string, newCaption: string) => void;
  onImagesChange?: (postId: string, imageIds: string[], newGraphics?: GraphicItem[]) => void;
  onSchedule?: (postId: string, scheduledTime: Date, platforms: { fb: boolean; ig: boolean }) => Promise<{ success: boolean; error?: string }>;
  startDate?: Date;
}

export function PostCard({ 
  post, 
  images, 
  onCaptionChange, 
  onImagesChange,
  onSchedule,
  startDate,
}: PostCardProps) {
  const [copied, setCopied] = useState(false);
  const [copiedHashtags, setCopiedHashtags] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingImages, setIsEditingImages] = useState(false);
  const [editedCaption, setEditedCaption] = useState(post.caption);
  const [showGraphicsDrawer, setShowGraphicsDrawer] = useState(false);
  const [tempImageIds, setTempImageIds] = useState<string[]>(post.imageIds);
  const [tempGraphics, setTempGraphics] = useState<GraphicItem[]>([]);
  
  // Scheduling state
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState(post.postingTime || '12:00');
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
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

  // Image editing handlers
  const handleStartImageEdit = () => {
    setTempImageIds([...post.imageIds]);
    setTempGraphics([]);
    setIsEditingImages(true);
  };

  const handleRemoveImage = (imageId: string) => {
    setTempImageIds((prev) => prev.filter((id) => id !== imageId));
  };

  const handleRemoveGraphic = (graphicId: string) => {
    setTempGraphics((prev) => prev.filter((g) => g.id !== graphicId));
  };

  const handleAddGraphics = (graphics: GraphicItem[]) => {
    setTempGraphics((prev) => [...prev, ...graphics]);
  };

  const handleSaveImages = () => {
    onImagesChange?.(post.id, tempImageIds, tempGraphics.length > 0 ? tempGraphics : undefined);
    setIsEditingImages(false);
  };

  const handleCancelImageEdit = () => {
    setTempImageIds(post.imageIds);
    setTempGraphics([]);
    setIsEditingImages(false);
  };

  // Scheduling handlers
  const calculateScheduleDate = (): string => {
    if (startDate && post.dayNumber) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + post.dayNumber - 1);
      return date.toISOString().split('T')[0] ?? '';
    }
    return new Date().toISOString().split('T')[0] ?? ''
  };

  const handleOpenScheduler = () => {
    setScheduleDate(calculateScheduleDate());
    setScheduleError(null);
    setShowScheduler(true);
  };

  const handleSchedule = async () => {
    if (!scheduleDate || !scheduleTime) {
      setScheduleError('Vælg dato og tid');
      return;
    }

    const scheduledTime = new Date(`${scheduleDate}T${scheduleTime}`);
    const validation = validateScheduleTime(scheduledTime);

    if (!validation.valid) {
      setScheduleError(validation.error || 'Ugyldig tid');
      return;
    }

    setIsScheduling(true);
    setScheduleError(null);

    try {
      if (onSchedule) {
        // Always post to both FB and IG
        const result = await onSchedule(post.id, scheduledTime, { fb: true, ig: true });
        if (result.success) {
          setIsScheduled(true);
          setShowScheduler(false);
        } else {
          setScheduleError(result.error || 'Ukendt fejl');
        }
      }
    } catch (err) {
      setScheduleError((err as Error).message);
    } finally {
      setIsScheduling(false);
    }
  };

  const postImages = images.filter((img) => post.imageIds.includes(img.id));
  const editImages = images.filter((img) => tempImageIds.includes(img.id));

  return (
    <>
      <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border overflow-hidden ${
        isScheduled 
          ? 'border-green-300 dark:border-green-700' 
          : 'border-gray-200 dark:border-gray-700'
      }`}>
        {/* Header */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-semibold text-sm ${
              isScheduled 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
            }`}>
              {isScheduled ? <Check className="w-4 h-4" /> : post.dayNumber}
            </span>
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">
                Dag {post.dayNumber}
                {isScheduled && <span className="ml-2 text-xs text-green-600 dark:text-green-400">Scheduled!</span>}
              </h3>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Clock className="w-3 h-3" />
                <span>{post.postingTime}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!isEditing && !isEditingImages && (
              <>
                {/* Schedule button */}
                {isMetaConfigured() && !isScheduled && (
                  <button
                    onClick={handleOpenScheduler}
                    className="p-2 text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                    title="Schedule post"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={handleStartImageEdit}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="Rediger billeder"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="Rediger tekst"
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

        {/* Scheduler popup */}
        {showScheduler && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 space-y-3">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
              <Calendar className="w-4 h-4" />
              <span className="font-medium text-sm">Schedule til FB + IG</span>
            </div>
            
            <div className="flex gap-2">
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>

            {scheduleError && (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{scheduleError}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowScheduler(false)}
                className="flex-1 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Annuller
              </button>
              <button
                onClick={handleSchedule}
                disabled={isScheduling}
                className="flex-1 px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isScheduling ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Scheduler...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Schedule
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Images - Normal view */}
        {!isEditingImages && postImages.length > 0 && (
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

        {/* Images - Edit mode */}
        {isEditingImages && (
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Rediger billeder ({editImages.length + tempGraphics.length})
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowGraphicsDrawer(true)}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  <FolderOpen className="w-3 h-3" />
                  Grafik
                </button>
              </div>
            </div>

            {/* Current images */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              {editImages.map((img) => (
                <div key={img.id} className="relative aspect-square rounded-lg overflow-hidden group">
                  <img
                    src={img.thumbnailUrl || img.url}
                    alt={img.originalName}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => handleRemoveImage(img.id)}
                    className="absolute top-1 right-1 p-1 bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              
              {/* Added graphics */}
              {tempGraphics.map((graphic) => (
                <div key={graphic.id} className="relative aspect-square rounded-lg overflow-hidden group ring-2 ring-blue-500">
                  <img
                    src={graphic.thumbnailUrl}
                    alt={graphic.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => handleRemoveGraphic(graphic.id)}
                    className="absolute top-1 right-1 p-1 bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <span className="absolute bottom-0 left-0 right-0 bg-blue-500/80 text-white text-[10px] px-1 text-center truncate">
                    Grafik
                  </span>
                </div>
              ))}

              {/* Empty state / add button */}
              {editImages.length + tempGraphics.length === 0 && (
                <button
                  onClick={() => setShowGraphicsDrawer(true)}
                  className="aspect-square rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-[10px] mt-1">Tilføj</span>
                </button>
              )}
            </div>

            {/* Save/Cancel buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleCancelImageEdit}
                className="flex-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                <X className="w-4 h-4" />
                Annuller
              </button>
              <button
                onClick={handleSaveImages}
                className="flex-1 px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors flex items-center justify-center gap-1"
              >
                <Save className="w-4 h-4" />
                Gem
              </button>
            </div>
          </div>
        )}

        {!isEditingImages && postImages.length === 0 && (
          <div className="p-4 flex items-center justify-center bg-gray-50 dark:bg-gray-750">
            <button
              onClick={handleStartImageEdit}
              className="text-center text-gray-400 hover:text-blue-500 transition-colors"
            >
              <ImageIcon className="w-8 h-8 mx-auto mb-1" />
              <span className="text-sm">Tilføj billeder</span>
            </button>
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

      {/* Graphics Drawer */}
      <GraphicsDrawer
        isOpen={showGraphicsDrawer}
        onClose={() => setShowGraphicsDrawer(false)}
        onSelect={handleAddGraphics}
        multiSelect={true}
      />
    </>
  );
}
