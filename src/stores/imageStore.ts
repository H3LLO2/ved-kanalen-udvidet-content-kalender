import { create } from 'zustand';
import {
  saveImages,
  getImagesByCampaign,
  deleteImage as dbDeleteImage,
  generateId,
  createImageUrl,
  revokeImageUrl,
  type StoredImage,
} from '../lib/database';
import { convertHeicToJpeg, createThumbnail } from '../lib/heic';

export interface DisplayImage {
  id: string;
  campaignId: string;
  originalName: string;
  url: string;           // Object URL for display
  thumbnailUrl?: string;
  analysisId?: string;
  usedInPostId?: string;
  createdAt: Date;
}

interface ImageState {
  images: DisplayImage[];
  selectedIds: Set<string>;
  externallyUsedIds: Set<string>; // Images already used in manually posted content
  postedToMetaIds: Set<string>; // Images confirmed posted to FB/IG
  isLoading: boolean;
  uploadProgress: { current: number; total: number } | null;
  error: string | null;

  // Actions
  loadImages: (campaignId: string) => Promise<void>;
  uploadImages: (campaignId: string, files: File[]) => Promise<void>;
  selectImage: (id: string) => void;
  deselectImage: (id: string) => void;
  toggleImageSelection: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  deleteImage: (id: string) => Promise<void>;
  deleteSelected: () => Promise<void>;
  cleanup: () => void;
  
  // Externally used tracking
  toggleExternallyUsed: (id: string) => void;
  markSelectedAsExternallyUsed: () => void;
  clearExternallyUsed: () => void;
  
  // Posted to Meta tracking
  markAsPostedToMeta: (ids: string[]) => void;
  clearPostedToMeta: () => void;
}

export const useImageStore = create<ImageState>((set, get) => ({
  images: [],
  selectedIds: new Set(),
  externallyUsedIds: new Set(),
  postedToMetaIds: new Set(),
  isLoading: false,
  uploadProgress: null,
  error: null,

  loadImages: async (campaignId: string) => {
    set({ isLoading: true, error: null });
    try {
      // Clean up existing URLs
      get().cleanup();

      const storedImages = await getImagesByCampaign(campaignId);
      const displayImages: DisplayImage[] = storedImages.map((img) => ({
        id: img.id,
        campaignId: img.campaignId,
        originalName: img.originalName,
        url: createImageUrl(img.blob),
        thumbnailUrl: img.thumbnailBlob ? createImageUrl(img.thumbnailBlob) : undefined,
        analysisId: img.analysisId,
        usedInPostId: img.usedInPostId,
        createdAt: img.createdAt,
      }));

      set({ images: displayImages, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  uploadImages: async (campaignId: string, files: File[]) => {
    set({ isLoading: true, uploadProgress: { current: 0, total: files.length }, error: null });

    const newImages: StoredImage[] = [];
    const displayImages: DisplayImage[] = [];

    try {
      for (const file of files) {
        set({ uploadProgress: { current: newImages.length + 1, total: files.length } });

        // Convert HEIC if needed
        let processedBlob: Blob;
        const isHeic = file.type === 'image/heic' ||
          file.type === 'image/heif' ||
          file.name.toLowerCase().endsWith('.heic') ||
          file.name.toLowerCase().endsWith('.heif');

        if (isHeic) {
          processedBlob = await convertHeicToJpeg(file);
        } else {
          processedBlob = file;
        }

        // Create thumbnail
        const thumbnailBlob = await createThumbnail(processedBlob, 400);

        const id = generateId();
        const storedImage: StoredImage = {
          id,
          campaignId,
          originalName: file.name,
          mimeType: processedBlob.type || 'image/jpeg',
          blob: processedBlob,
          thumbnailBlob,
          createdAt: new Date(),
        };

        newImages.push(storedImage);

        displayImages.push({
          id,
          campaignId,
          originalName: file.name,
          url: createImageUrl(processedBlob),
          thumbnailUrl: createImageUrl(thumbnailBlob),
          createdAt: storedImage.createdAt,
        });
      }

      // Save all to database
      await saveImages(newImages);

      set((state) => ({
        images: [...state.images, ...displayImages],
        isLoading: false,
        uploadProgress: null,
      }));
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false, uploadProgress: null });
    }
  },

  selectImage: (id: string) => {
    set((state) => {
      const newSelected = new Set(state.selectedIds);
      newSelected.add(id);
      return { selectedIds: newSelected };
    });
  },

  deselectImage: (id: string) => {
    set((state) => {
      const newSelected = new Set(state.selectedIds);
      newSelected.delete(id);
      return { selectedIds: newSelected };
    });
  },

  toggleImageSelection: (id: string) => {
    set((state) => {
      const newSelected = new Set(state.selectedIds);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      return { selectedIds: newSelected };
    });
  },

  selectAll: () => {
    set((state) => ({
      selectedIds: new Set(state.images.map((img) => img.id)),
    }));
  },

  deselectAll: () => {
    set({ selectedIds: new Set() });
  },

  deleteImage: async (id: string) => {
    const image = get().images.find((img) => img.id === id);
    if (image) {
      revokeImageUrl(image.url);
      if (image.thumbnailUrl) revokeImageUrl(image.thumbnailUrl);
    }

    await dbDeleteImage(id);
    set((state) => ({
      images: state.images.filter((img) => img.id !== id),
      selectedIds: new Set([...state.selectedIds].filter((sid) => sid !== id)),
    }));
  },

  deleteSelected: async () => {
    const { selectedIds, images } = get();
    for (const id of selectedIds) {
      const image = images.find((img) => img.id === id);
      if (image) {
        revokeImageUrl(image.url);
        if (image.thumbnailUrl) revokeImageUrl(image.thumbnailUrl);
      }
      await dbDeleteImage(id);
    }
    set((state) => ({
      images: state.images.filter((img) => !selectedIds.has(img.id)),
      selectedIds: new Set(),
    }));
  },

  cleanup: () => {
    const { images } = get();
    for (const img of images) {
      revokeImageUrl(img.url);
      if (img.thumbnailUrl) revokeImageUrl(img.thumbnailUrl);
    }
  },

  // Toggle whether an image is marked as externally used
  toggleExternallyUsed: (id: string) => {
    set((state) => {
      const newUsed = new Set(state.externallyUsedIds);
      if (newUsed.has(id)) {
        newUsed.delete(id);
      } else {
        newUsed.add(id);
      }
      return { externallyUsedIds: newUsed };
    });
  },

  // Mark all selected images as externally used
  markSelectedAsExternallyUsed: () => {
    set((state) => ({
      externallyUsedIds: new Set([...state.externallyUsedIds, ...state.selectedIds]),
      selectedIds: new Set(),
    }));
  },

  // Clear all externally used markings
  clearExternallyUsed: () => {
    set({ externallyUsedIds: new Set() });
  },

  // Mark images as posted to Meta (FB/IG)
  markAsPostedToMeta: (ids: string[]) => {
    set((state) => ({
      postedToMetaIds: new Set([...state.postedToMetaIds, ...ids]),
    }));
  },

  // Clear posted to Meta markings
  clearPostedToMeta: () => {
    set({ postedToMetaIds: new Set() });
  },
}));
