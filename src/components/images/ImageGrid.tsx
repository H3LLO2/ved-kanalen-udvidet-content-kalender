import { useCallback } from 'react';
import { Check, Trash2, Eye, Sparkles, Ban } from 'lucide-react';
import { useImageStore, type DisplayImage } from '../../stores';

interface ImageGridProps {
  onImageClick?: (image: DisplayImage) => void;
  selectable?: boolean;
}

export function ImageGrid({ onImageClick, selectable = true }: ImageGridProps) {
  const {
    images,
    selectedIds,
    externallyUsedIds,
    postedToMetaIds,
    toggleImageSelection,
    selectAll,
    deselectAll,
    deleteSelected,
    toggleExternallyUsed,
    markSelectedAsExternallyUsed,
    clearExternallyUsed,
    clearPostedToMeta,
  } = useImageStore();

  const handleImageClick = useCallback(
    (image: DisplayImage, e: React.MouseEvent) => {
      if (selectable && (e.ctrlKey || e.metaKey || e.shiftKey)) {
        toggleImageSelection(image.id);
      } else if (onImageClick) {
        onImageClick(image);
      } else if (selectable) {
        toggleImageSelection(image.id);
      }
    },
    [selectable, toggleImageSelection, onImageClick]
  );

  const handleMarkUsedClick = useCallback(
    (e: React.MouseEvent, imageId: string) => {
      e.stopPropagation();
      toggleExternallyUsed(imageId);
    },
    [toggleExternallyUsed]
  );

  if (images.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <Eye className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Ingen billeder endnu</p>
        <p className="text-sm mt-1">Upload billeder for at komme i gang</p>
      </div>
    );
  }

  const selectedCount = selectedIds.size;
  const usedCount = externallyUsedIds.size;
  const metaCount = postedToMetaIds.size;
  const availableImages = images.filter(img => !externallyUsedIds.has(img.id));

  return (
    <div className="space-y-4">
      {selectable && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {availableImages.length} tilgængelige
              {usedCount > 0 && <span className="text-orange-500"> ({usedCount} brugt tidligere)</span>}
              {metaCount > 0 && <span className="text-blue-500"> ({metaCount} på Facebook)</span>}
              {selectedCount > 0 && ` • ${selectedCount} valgt`}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {selectedCount > 0 ? (
              <>
                <button
                  onClick={markSelectedAsExternallyUsed}
                  className="flex items-center gap-1 text-sm text-orange-600 hover:text-orange-700 dark:text-orange-400"
                  title="Marker som allerede brugt"
                >
                  <Ban className="w-4 h-4" />
                  Marker som brugt
                </button>
                <button
                  onClick={deselectAll}
                  className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Fravælg
                </button>
                <button
                  onClick={deleteSelected}
                  className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                  Slet
                </button>
              </>
            ) : (
              <>
                {metaCount > 0 && (
                  <button
                    onClick={clearPostedToMeta}
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    Nulstil sync
                  </button>
                )}
                {usedCount > 0 && (
                  <button
                    onClick={clearExternallyUsed}
                    className="text-sm text-orange-600 hover:text-orange-700 dark:text-orange-400"
                  >
                    Nulstil "brugt"
                  </button>
                )}
                <button
                  onClick={selectAll}
                  className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Vælg alle
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
        {images.map((image) => {
          const isSelected = selectedIds.has(image.id);
          const isExternallyUsed = externallyUsedIds.has(image.id);
          const isPostedToMeta = postedToMetaIds.has(image.id);
          const hasAnalysis = !!image.analysisId;

          return (
            <div
              key={image.id}
              onClick={(e) => handleImageClick(image, e)}
              className={`
                relative aspect-square rounded-lg overflow-hidden cursor-pointer
                transition-all duration-200 group
                ${isExternallyUsed || isPostedToMeta ? 'opacity-50' : ''}
                ${isSelected
                  ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900'
                  : 'hover:ring-2 hover:ring-gray-300 dark:hover:ring-gray-600'
                }
              `}
            >
              <img
                src={image.thumbnailUrl || image.url}
                alt={image.originalName}
                className="w-full h-full object-cover"
                loading="lazy"
              />

              {/* Selection overlay */}
              {selectable && (
                <div
                  className={`
                    absolute inset-0 transition-all duration-200
                    ${isSelected ? 'bg-blue-500/30' : 'bg-black/0 group-hover:bg-black/10'}
                  `}
                />
              )}

              {/* Selection checkbox */}
              {selectable && (
                <div
                  className={`
                    absolute top-2 left-2 w-6 h-6 rounded-full
                    flex items-center justify-center transition-all
                    ${isSelected
                      ? 'bg-blue-500 text-white'
                      : 'bg-white/80 text-transparent group-hover:text-gray-400'
                    }
                  `}
                >
                  <Check className="w-4 h-4" />
                </div>
              )}

              {/* Externally used indicator - clickable to toggle */}
              <button
                onClick={(e) => handleMarkUsedClick(e, image.id)}
                className={`
                  absolute top-2 right-2 w-6 h-6 rounded-full
                  flex items-center justify-center transition-all
                  ${isExternallyUsed 
                    ? 'bg-orange-500 text-white' 
                    : 'bg-white/80 text-gray-400 opacity-0 group-hover:opacity-100'
                  }
                `}
                title={isExternallyUsed ? 'Marker som ikke brugt' : 'Marker som allerede brugt'}
              >
                {isExternallyUsed ? <Ban className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
              </button>

              {/* Analysis indicator */}
              {hasAnalysis && !isExternallyUsed && !isPostedToMeta && (
                <div className="absolute bottom-2 right-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              )}

              {/* Externally used banner */}
              {isExternallyUsed && (
                <div className="absolute bottom-0 left-0 right-0 bg-orange-500 text-white text-xs py-1 text-center">
                  Allerede brugt
                </div>
              )}

              {/* Posted to Facebook banner */}
              {isPostedToMeta && !isExternallyUsed && (
                <div className="absolute bottom-0 left-0 right-0 bg-blue-500 text-white text-xs py-1 text-center">
                  På Facebook
                </div>
              )}

              {/* Filename on hover (only if not marked) */}
              {!isExternallyUsed && !isPostedToMeta && (
                <div
                  className="
                    absolute bottom-0 left-0 right-0 p-2
                    bg-gradient-to-t from-black/60 to-transparent
                    opacity-0 group-hover:opacity-100 transition-opacity
                  "
                >
                  <p className="text-xs text-white truncate">{image.originalName}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
