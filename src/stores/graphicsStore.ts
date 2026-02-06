import { create } from 'zustand';
import {
  generateId,
  createImageUrl,
  revokeImageUrl,
} from '../lib/database';
import { convertHeicToJpeg, createThumbnail } from '../lib/heic';

export interface GraphicItem {
  id: string;
  name: string;
  blob: Blob;
  thumbnailBlob: Blob;
  url: string;
  thumbnailUrl: string;
  tags: string[];
  createdAt: Date;
}

interface GraphicsState {
  graphics: GraphicItem[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  uploadGraphics: (files: File[]) => Promise<void>;
  deleteGraphic: (id: string) => void;
  updateTags: (id: string, tags: string[]) => void;
  getGraphicById: (id: string) => GraphicItem | undefined;
  cleanup: () => void;
}

// Store graphics in IndexedDB for persistence
const GRAPHICS_DB_NAME = 'ved-kanalen-graphics';
const GRAPHICS_STORE_NAME = 'graphics';

async function openGraphicsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(GRAPHICS_DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(GRAPHICS_STORE_NAME)) {
        db.createObjectStore(GRAPHICS_STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

async function saveGraphicToDB(graphic: Omit<GraphicItem, 'url' | 'thumbnailUrl'>): Promise<void> {
  const db = await openGraphicsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GRAPHICS_STORE_NAME, 'readwrite');
    const store = tx.objectStore(GRAPHICS_STORE_NAME);
    store.put({
      id: graphic.id,
      name: graphic.name,
      blob: graphic.blob,
      thumbnailBlob: graphic.thumbnailBlob,
      tags: graphic.tags,
      createdAt: graphic.createdAt,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadGraphicsFromDB(): Promise<GraphicItem[]> {
  const db = await openGraphicsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GRAPHICS_STORE_NAME, 'readonly');
    const store = tx.objectStore(GRAPHICS_STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const items = request.result.map((item: any) => ({
        ...item,
        url: createImageUrl(item.blob),
        thumbnailUrl: createImageUrl(item.thumbnailBlob),
        createdAt: new Date(item.createdAt),
      }));
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteGraphicFromDB(id: string): Promise<void> {
  const db = await openGraphicsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GRAPHICS_STORE_NAME, 'readwrite');
    const store = tx.objectStore(GRAPHICS_STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const useGraphicsStore = create<GraphicsState>((set, get) => ({
  graphics: [],
  isLoading: false,
  error: null,

  uploadGraphics: async (files: File[]) => {
    set({ isLoading: true, error: null });
    
    try {
      const newGraphics: GraphicItem[] = [];
      
      for (const file of files) {
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
        const thumbnailBlob = await createThumbnail(processedBlob, 300);

        const id = generateId();
        const graphic: GraphicItem = {
          id,
          name: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
          blob: processedBlob,
          thumbnailBlob,
          url: createImageUrl(processedBlob),
          thumbnailUrl: createImageUrl(thumbnailBlob),
          tags: [],
          createdAt: new Date(),
        };

        // Save to IndexedDB
        await saveGraphicToDB(graphic);
        newGraphics.push(graphic);
      }

      set((state) => ({
        graphics: [...state.graphics, ...newGraphics],
        isLoading: false,
      }));
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  deleteGraphic: async (id: string) => {
    const graphic = get().graphics.find((g) => g.id === id);
    if (graphic) {
      revokeImageUrl(graphic.url);
      revokeImageUrl(graphic.thumbnailUrl);
      await deleteGraphicFromDB(id);
    }
    set((state) => ({
      graphics: state.graphics.filter((g) => g.id !== id),
    }));
  },

  updateTags: (id: string, tags: string[]) => {
    set((state) => ({
      graphics: state.graphics.map((g) =>
        g.id === id ? { ...g, tags } : g
      ),
    }));
  },

  getGraphicById: (id: string) => {
    return get().graphics.find((g) => g.id === id);
  },

  cleanup: () => {
    const { graphics } = get();
    for (const g of graphics) {
      revokeImageUrl(g.url);
      revokeImageUrl(g.thumbnailUrl);
    }
  },
}));

// Initialize store by loading from IndexedDB
loadGraphicsFromDB().then((graphics) => {
  useGraphicsStore.setState({ graphics });
}).catch(console.error);
