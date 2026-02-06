import { useState, useRef, useCallback } from 'react';
import { X, Upload, Trash2, Check, FolderOpen, Image as ImageIcon } from 'lucide-react';
import { useGraphicsStore, type GraphicItem } from '../../stores/graphicsStore';

interface GraphicsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (graphics: GraphicItem[]) => void;
  multiSelect?: boolean;
}

export function GraphicsDrawer({ isOpen, onClose, onSelect, multiSelect = true }: GraphicsDrawerProps) {
  const { graphics, uploadGraphics, deleteGraphic, isLoading } = useGraphicsStore();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      await uploadGraphics(files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [uploadGraphics]);

  const toggleSelect = (id: string) => {
    if (multiSelect) {
      setSelectedIds((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
        return newSet;
      });
    } else {
      setSelectedIds(new Set([id]));
    }
  };

  const handleConfirm = () => {
    const selectedGraphics = graphics.filter((g) => selectedIds.has(g.id));
    onSelect(selectedGraphics);
    setSelectedIds(new Set());
    onClose();
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Slet denne grafik?')) {
      deleteGraphic(id);
      setSelectedIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Grafik Library
            </h2>
            <span className="text-sm text-gray-500">({graphics.length})</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload zone */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50"
          >
            <Upload className="w-5 h-5" />
            {isLoading ? 'Uploader...' : 'Upload grafik'}
          </button>
        </div>

        {/* Graphics grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {graphics.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Ingen grafik endnu</p>
              <p className="text-sm mt-1">Upload logoer, templates, og andet grafik</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {graphics.map((graphic) => (
                <div
                  key={graphic.id}
                  onClick={() => toggleSelect(graphic.id)}
                  className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer group transition-all ${
                    selectedIds.has(graphic.id)
                      ? 'ring-3 ring-blue-500 ring-offset-2 dark:ring-offset-gray-800'
                      : 'hover:ring-2 hover:ring-gray-300 dark:hover:ring-gray-600'
                  }`}
                >
                  <img
                    src={graphic.thumbnailUrl}
                    alt={graphic.name}
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Selection indicator */}
                  {selectedIds.has(graphic.id) && (
                    <div className="absolute top-2 left-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}

                  {/* Hover overlay with delete */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-2">
                    <span className="text-xs text-white truncate flex-1 mr-2">
                      {graphic.name}
                    </span>
                    <button
                      onClick={(e) => handleDelete(graphic.id, e)}
                      className="p-1.5 bg-red-500 rounded-lg text-white hover:bg-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with confirm button */}
        {selectedIds.size > 0 && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
            <button
              onClick={handleConfirm}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              <Check className="w-5 h-5" />
              Tilføj {selectedIds.size} {selectedIds.size === 1 ? 'billede' : 'billeder'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
