import { useCallback } from 'react';
import { Check, Trash2, Eye, Sparkles } from 'lucide-react';
import { useImageStore, type DisplayImage } from '../../stores';

interface ImageGridProps {
  onImageClick?: (image: DisplayImage) => void;
  selectable?: boolean;
}

export function ImageGrid({ onImageClick, selectable = true }: ImageGridProps) {
  const { images, selectedIds, toggleImageSelection, selectAll, deselectAll, deleteSelected } =
    useImageStore();

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

  return (
    <div className="space-y-4">
      {selectable && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {images.length} billeder {selectedCount > 0 && `(${selectedCount} valgt)`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectedCount > 0 ? (
              <>
                <button
                  onClick={deselectAll}
                  className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Fravælg alle
                </button>
                <button
                  onClick={deleteSelected}
                  className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                  Slet valgte
                </button>
              </>
            ) : (
              <button
                onClick={selectAll}
                className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Vælg alle
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
        {images.map((image) => {
          const isSelected = selectedIds.has(image.id);
          const hasAnalysis = !!image.analysisId;

          return (
            <div
              key={image.id}
              onClick={(e) => handleImageClick(image, e)}
              className={`
                relative aspect-square rounded-lg overflow-hidden cursor-pointer
                transition-all duration-200 group
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

              {/* Analysis indicator */}
              {hasAnalysis && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              )}

              {/* Filename on hover */}
              <div
                className="
                  absolute bottom-0 left-0 right-0 p-2
                  bg-gradient-to-t from-black/60 to-transparent
                  opacity-0 group-hover:opacity-100 transition-opacity
                "
              >
                <p className="text-xs text-white truncate">{image.originalName}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
