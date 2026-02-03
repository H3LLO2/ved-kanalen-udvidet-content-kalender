import { useCallback, useState } from 'react';
import { Upload, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useImageStore } from '../../stores';

interface ImageUploadProps {
  campaignId: string;
  onUploadComplete?: () => void;
}

export function ImageUpload({ campaignId, onUploadComplete }: ImageUploadProps) {
  const { uploadImages, uploadProgress, isLoading } = useImageStore();
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((f) =>
        f.type.startsWith('image/') ||
        f.name.toLowerCase().endsWith('.heic') ||
        f.name.toLowerCase().endsWith('.heif')
      );

      if (imageFiles.length === 0) return;

      await uploadImages(campaignId, imageFiles);
      onUploadComplete?.();
    },
    [campaignId, uploadImages, onUploadComplete]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(e.target.files);
      }
    },
    [handleFiles]
  );

  return (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center
          transition-all duration-200 cursor-pointer
          ${isDragOver
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }
          ${isLoading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <input
          type="file"
          multiple
          accept="image/*,.heic,.heif"
          onChange={handleInputChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isLoading}
        />

        {isLoading && uploadProgress ? (
          <div className="space-y-3">
            <Loader2 className="w-12 h-12 mx-auto text-blue-500 animate-spin" />
            <p className="text-gray-600 dark:text-gray-400">
              Uploader billede {uploadProgress.current} af {uploadProgress.total}...
            </p>
            <div className="w-full max-w-xs mx-auto bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-center">
              <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-full">
                {isDragOver ? (
                  <ImageIcon className="w-8 h-8 text-blue-500" />
                ) : (
                  <Upload className="w-8 h-8 text-gray-400" />
                )}
              </div>
            </div>
            <div>
              <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
                {isDragOver ? 'Slip billederne her' : 'Træk billeder hertil'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                eller klik for at vælge filer
              </p>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              HEIC, JPEG, PNG - op til 100+ billeder
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
