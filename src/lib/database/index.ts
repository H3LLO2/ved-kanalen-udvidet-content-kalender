import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Campaign, BrainOutput, MenuExemptImage, EventGraphicImage, FlexibleGraphicImage, FlexibleContentType } from '../../types';

// ============================================================================
// Database Schema
// ============================================================================

interface VedKanalenDB extends DBSchema {
  campaigns: {
    key: string;
    value: Campaign;
    indexes: { 'by-created': Date };
  };
  images: {
    key: string;
    value: StoredImage;
    indexes: {
      'by-campaign': string;
      'by-created': Date;
    };
  };
  analyses: {
    key: string;
    value: StoredAnalysis;
    indexes: { 'by-image': string };
  };
  posts: {
    key: string;
    value: StoredPost;
    indexes: {
      'by-campaign': string;
      'by-day': number;
    };
  };
  brainPlans: {
    key: string;
    value: StoredBrainPlan;
    indexes: { 'by-campaign': string };
  };
  menuExempts: {
    key: string;
    value: StoredMenuExempt;
    indexes: { 'by-campaign': string };
  };
  eventGraphics: {
    key: string;
    value: StoredEventGraphics;
    indexes: { 'by-campaign': string };
  };
  flexibleGraphics: {
    key: string;
    value: StoredFlexibleGraphics;
    indexes: { 'by-campaign': string };
  };
}

// Storage types (serializable versions without File objects)
export interface StoredImage {
  id: string;
  campaignId: string;
  originalName: string;
  mimeType: string;
  blob: Blob;           // Store as Blob instead of File
  thumbnailBlob?: Blob; // Thumbnail version
  analysisId?: string;
  usedInPostId?: string;
  createdAt: Date;
}

export interface StoredAnalysis {
  id: string;
  imageId: string;
  content: string;
  mood: string;
  strategicFit: string;
  quality?: 'high' | 'medium' | 'low';
  suggestedGroupings?: string[];
  createdAt: Date;
}

export interface StoredPost {
  id: string;
  campaignId: string;
  runId: string;        // Groups posts by generation run (v1, v2, etc.)
  runNumber: number;    // 1, 2, 3... for display
  dayNumber: number;
  caption: string;
  hashtags?: string[];  // Instagram hashtags
  postingTime: string;
  seed: string;
  reasoning: string;
  status: 'draft' | 'approved' | 'scheduled' | 'posted';
  imageIds: string[];
  generatedGraphicBlob?: Blob;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredBrainPlan {
  id: string;
  campaignId: string;
  thoughts: string;
  plan: BrainOutput['plan'];
  createdAt: Date;
}

export interface StoredMenuExempt {
  id: string;
  campaignId: string;
  description: string;
  images: MenuExemptImage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredEventGraphics {
  id: string;
  campaignId: string;
  postText: string;
  eventContext: string;
  images: EventGraphicImage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredFlexibleGraphics {
  id: string;
  campaignId: string;
  inputText: string;
  detectedType: FlexibleContentType;
  images: FlexibleGraphicImage[];
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Database Instance
// ============================================================================

const DB_NAME = 'ved-kanalen-db';
const DB_VERSION = 4;

let dbPromise: Promise<IDBPDatabase<VedKanalenDB>> | null = null;

export async function getDb(): Promise<IDBPDatabase<VedKanalenDB>> {
  if (!dbPromise) {
    console.log('[DB] Opening database version', DB_VERSION);
    dbPromise = openDB<VedKanalenDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion) {
        console.log('[DB] Upgrading from', oldVersion, 'to', newVersion);
        // Campaigns store
        if (!db.objectStoreNames.contains('campaigns')) {
          const campaignStore = db.createObjectStore('campaigns', { keyPath: 'id' });
          campaignStore.createIndex('by-created', 'createdAt');
        }

        // Images store
        if (!db.objectStoreNames.contains('images')) {
          const imageStore = db.createObjectStore('images', { keyPath: 'id' });
          imageStore.createIndex('by-campaign', 'campaignId');
          imageStore.createIndex('by-created', 'createdAt');
        }

        // Analyses store
        if (!db.objectStoreNames.contains('analyses')) {
          const analysisStore = db.createObjectStore('analyses', { keyPath: 'id' });
          analysisStore.createIndex('by-image', 'imageId');
        }

        // Posts store
        if (!db.objectStoreNames.contains('posts')) {
          const postStore = db.createObjectStore('posts', { keyPath: 'id' });
          postStore.createIndex('by-campaign', 'campaignId');
          postStore.createIndex('by-day', 'dayNumber');
        }

        // Brain plans store
        if (!db.objectStoreNames.contains('brainPlans')) {
          const brainStore = db.createObjectStore('brainPlans', { keyPath: 'id' });
          brainStore.createIndex('by-campaign', 'campaignId');
        }

        // Menu exempts store (added in v2)
        if (!db.objectStoreNames.contains('menuExempts')) {
          const menuExemptStore = db.createObjectStore('menuExempts', { keyPath: 'id' });
          menuExemptStore.createIndex('by-campaign', 'campaignId');
        }

        // Event graphics store (added in v3)
        if (!db.objectStoreNames.contains('eventGraphics')) {
          const eventGraphicsStore = db.createObjectStore('eventGraphics', { keyPath: 'id' });
          eventGraphicsStore.createIndex('by-campaign', 'campaignId');
        }

        // Flexible graphics store (added in v4)
        if (!db.objectStoreNames.contains('flexibleGraphics')) {
          const flexibleGraphicsStore = db.createObjectStore('flexibleGraphics', { keyPath: 'id' });
          flexibleGraphicsStore.createIndex('by-campaign', 'campaignId');
        }
        console.log('[DB] Upgrade complete');
      },
      blocked() {
        console.error('[DB] Database blocked by another connection. Close other tabs using this site.');
        alert('Database er blokeret af en anden fane. Luk andre faner med localhost:3001 og genindlæs.');
      },
      blocking() {
        console.warn('[DB] This connection is blocking a newer version. Reloading...');
        window.location.reload();
      },
    });
  }
  return dbPromise;
}

// ============================================================================
// Campaign Operations
// ============================================================================

export async function saveCampaign(campaign: Campaign): Promise<void> {
  const db = await getDb();
  await db.put('campaigns', campaign);
}

export async function getCampaign(id: string): Promise<Campaign | undefined> {
  const db = await getDb();
  return db.get('campaigns', id);
}

export async function getAllCampaigns(): Promise<Campaign[]> {
  const db = await getDb();
  return db.getAllFromIndex('campaigns', 'by-created');
}

export async function deleteCampaign(id: string): Promise<void> {
  const db = await getDb();

  // Delete associated data
  const images = await db.getAllFromIndex('images', 'by-campaign', id);
  const posts = await db.getAllFromIndex('posts', 'by-campaign', id);
  const plans = await db.getAllFromIndex('brainPlans', 'by-campaign', id);
  const menuExempts = await db.getAllFromIndex('menuExempts', 'by-campaign', id);
  const eventGraphics = await db.getAllFromIndex('eventGraphics', 'by-campaign', id);
  const flexibleGraphics = await db.getAllFromIndex('flexibleGraphics', 'by-campaign', id);

  const tx = db.transaction(['campaigns', 'images', 'analyses', 'posts', 'brainPlans', 'menuExempts', 'eventGraphics', 'flexibleGraphics'], 'readwrite');

  // Delete images and their analyses
  for (const img of images) {
    await tx.objectStore('images').delete(img.id);
    if (img.analysisId) {
      await tx.objectStore('analyses').delete(img.analysisId);
    }
  }

  // Delete posts
  for (const post of posts) {
    await tx.objectStore('posts').delete(post.id);
  }

  // Delete brain plans
  for (const plan of plans) {
    await tx.objectStore('brainPlans').delete(plan.id);
  }

  // Delete menu exempts
  for (const exempt of menuExempts) {
    await tx.objectStore('menuExempts').delete(exempt.id);
  }

  // Delete event graphics
  for (const event of eventGraphics) {
    await tx.objectStore('eventGraphics').delete(event.id);
  }

  // Delete flexible graphics
  for (const flexible of flexibleGraphics) {
    await tx.objectStore('flexibleGraphics').delete(flexible.id);
  }

  // Delete campaign
  await tx.objectStore('campaigns').delete(id);
  await tx.done;
}

// ============================================================================
// Image Operations
// ============================================================================

export async function saveImage(image: StoredImage): Promise<void> {
  const db = await getDb();
  await db.put('images', image);
}

export async function saveImages(images: StoredImage[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('images', 'readwrite');
  for (const img of images) {
    await tx.store.put(img);
  }
  await tx.done;
}

export async function getImage(id: string): Promise<StoredImage | undefined> {
  const db = await getDb();
  return db.get('images', id);
}

export async function getImagesByCampaign(campaignId: string): Promise<StoredImage[]> {
  const db = await getDb();
  return db.getAllFromIndex('images', 'by-campaign', campaignId);
}

export async function deleteImage(id: string): Promise<void> {
  const db = await getDb();
  const image = await db.get('images', id);
  if (image?.analysisId) {
    await db.delete('analyses', image.analysisId);
  }
  await db.delete('images', id);
}

export async function updateImageAnalysis(imageId: string, analysisId: string): Promise<void> {
  const db = await getDb();
  const image = await db.get('images', imageId);
  if (image) {
    image.analysisId = analysisId;
    await db.put('images', image);
  }
}

// ============================================================================
// Analysis Operations
// ============================================================================

export async function saveAnalysis(analysis: StoredAnalysis): Promise<void> {
  const db = await getDb();
  await db.put('analyses', analysis);
  await updateImageAnalysis(analysis.imageId, analysis.id);
}

export async function getAnalysis(id: string): Promise<StoredAnalysis | undefined> {
  const db = await getDb();
  return db.get('analyses', id);
}

export async function getAnalysisByImage(imageId: string): Promise<StoredAnalysis | undefined> {
  const db = await getDb();
  const results = await db.getAllFromIndex('analyses', 'by-image', imageId);
  return results[0];
}

export async function getAllAnalysesForCampaign(campaignId: string): Promise<StoredAnalysis[]> {
  const db = await getDb();
  const images = await getImagesByCampaign(campaignId);
  const analyses: StoredAnalysis[] = [];

  for (const img of images) {
    if (img.analysisId) {
      const analysis = await db.get('analyses', img.analysisId);
      if (analysis) {
        analyses.push(analysis);
      }
    }
  }

  return analyses;
}

// ============================================================================
// Post Operations
// ============================================================================

export async function savePost(post: StoredPost): Promise<void> {
  const db = await getDb();
  await db.put('posts', post);
}

export async function savePosts(posts: StoredPost[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('posts', 'readwrite');
  for (const post of posts) {
    await tx.store.put(post);
  }
  await tx.done;
}

export async function getPost(id: string): Promise<StoredPost | undefined> {
  const db = await getDb();
  return db.get('posts', id);
}

export async function getPostsByCampaign(campaignId: string): Promise<StoredPost[]> {
  const db = await getDb();
  return db.getAllFromIndex('posts', 'by-campaign', campaignId);
}

export async function updatePostCaption(id: string, caption: string): Promise<void> {
  const db = await getDb();
  const post = await db.get('posts', id);
  if (post) {
    post.caption = caption;
    post.updatedAt = new Date();
    await db.put('posts', post);
  }
}

export async function updatePostStatus(id: string, status: StoredPost['status']): Promise<void> {
  const db = await getDb();
  const post = await db.get('posts', id);
  if (post) {
    post.status = status;
    post.updatedAt = new Date();
    await db.put('posts', post);
  }
}

export async function deletePost(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('posts', id);
}

// Get all unique run numbers for a campaign, sorted descending (newest first)
export async function getRunNumbersForCampaign(campaignId: string): Promise<number[]> {
  const posts = await getPostsByCampaign(campaignId);
  const runNumbers = new Set(posts.map(p => p.runNumber || 1));
  return Array.from(runNumbers).sort((a, b) => b - a);
}

// Get the next run number for a campaign
export async function getNextRunNumber(campaignId: string): Promise<number> {
  const runNumbers = await getRunNumbersForCampaign(campaignId);
  return runNumbers.length > 0 ? Math.max(...runNumbers) + 1 : 1;
}

// Get posts for a specific run
export async function getPostsByRun(campaignId: string, runNumber: number): Promise<StoredPost[]> {
  const posts = await getPostsByCampaign(campaignId);
  return posts.filter(p => (p.runNumber || 1) === runNumber);
}

// Delete all posts for a specific run
export async function deleteRun(campaignId: string, runNumber: number): Promise<void> {
  const db = await getDb();
  const posts = await getPostsByRun(campaignId, runNumber);
  const tx = db.transaction('posts', 'readwrite');
  for (const post of posts) {
    await tx.store.delete(post.id);
  }
  await tx.done;
}

// ============================================================================
// Brain Plan Operations
// ============================================================================

export async function saveBrainPlan(plan: StoredBrainPlan): Promise<void> {
  const db = await getDb();
  await db.put('brainPlans', plan);
}

export async function getBrainPlan(id: string): Promise<StoredBrainPlan | undefined> {
  const db = await getDb();
  return db.get('brainPlans', id);
}

export async function getBrainPlanByCampaign(campaignId: string): Promise<StoredBrainPlan | undefined> {
  const db = await getDb();
  const results = await db.getAllFromIndex('brainPlans', 'by-campaign', campaignId);
  return results[0];
}

// ============================================================================
// Utility Functions
// ============================================================================

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['campaigns', 'images', 'analyses', 'posts', 'brainPlans', 'menuExempts', 'eventGraphics', 'flexibleGraphics'], 'readwrite');
  await tx.objectStore('campaigns').clear();
  await tx.objectStore('images').clear();
  await tx.objectStore('analyses').clear();
  await tx.objectStore('posts').clear();
  await tx.objectStore('brainPlans').clear();
  await tx.objectStore('menuExempts').clear();
  await tx.objectStore('eventGraphics').clear();
  await tx.objectStore('flexibleGraphics').clear();
  await tx.done;
}

// Helper to convert StoredImage to display-friendly format with object URLs
export function createImageUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export function revokeImageUrl(url: string): void {
  URL.revokeObjectURL(url);
}

// ============================================================================
// Menu Exempt Operations
// ============================================================================

export async function saveMenuExempt(menuExempt: StoredMenuExempt): Promise<void> {
  const db = await getDb();
  await db.put('menuExempts', menuExempt);
}

export async function getMenuExempt(id: string): Promise<StoredMenuExempt | undefined> {
  const db = await getDb();
  return db.get('menuExempts', id);
}

export async function getMenuExemptsByCampaign(campaignId: string): Promise<StoredMenuExempt[]> {
  const db = await getDb();
  return db.getAllFromIndex('menuExempts', 'by-campaign', campaignId);
}

export async function deleteMenuExempt(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('menuExempts', id);
}

export async function updateMenuExemptImages(
  id: string,
  images: MenuExemptImage[]
): Promise<void> {
  const db = await getDb();
  const menuExempt = await db.get('menuExempts', id);
  if (menuExempt) {
    menuExempt.images = images;
    menuExempt.updatedAt = new Date();
    await db.put('menuExempts', menuExempt);
  }
}

// ============================================================================
// Event Graphics Operations
// ============================================================================

export async function saveEventGraphics(eventGraphics: StoredEventGraphics): Promise<void> {
  const db = await getDb();
  await db.put('eventGraphics', eventGraphics);
}

export async function getEventGraphics(id: string): Promise<StoredEventGraphics | undefined> {
  const db = await getDb();
  return db.get('eventGraphics', id);
}

export async function getEventGraphicsByCampaign(campaignId: string): Promise<StoredEventGraphics[]> {
  const db = await getDb();
  return db.getAllFromIndex('eventGraphics', 'by-campaign', campaignId);
}

export async function deleteEventGraphics(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('eventGraphics', id);
}

export async function updateEventGraphicsImages(
  id: string,
  images: EventGraphicImage[]
): Promise<void> {
  const db = await getDb();
  const eventGraphics = await db.get('eventGraphics', id);
  if (eventGraphics) {
    eventGraphics.images = images;
    eventGraphics.updatedAt = new Date();
    await db.put('eventGraphics', eventGraphics);
  }
}

// ============================================================================
// Flexible Graphics Operations
// ============================================================================

export async function saveFlexibleGraphics(flexibleGraphics: StoredFlexibleGraphics): Promise<void> {
  const db = await getDb();
  await db.put('flexibleGraphics', flexibleGraphics);
}

export async function getFlexibleGraphics(id: string): Promise<StoredFlexibleGraphics | undefined> {
  const db = await getDb();
  return db.get('flexibleGraphics', id);
}

export async function getFlexibleGraphicsByCampaign(campaignId: string): Promise<StoredFlexibleGraphics[]> {
  const db = await getDb();
  return db.getAllFromIndex('flexibleGraphics', 'by-campaign', campaignId);
}

export async function deleteFlexibleGraphics(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('flexibleGraphics', id);
}

export async function updateFlexibleGraphicsImages(
  id: string,
  images: FlexibleGraphicImage[]
): Promise<void> {
  const db = await getDb();
  const flexibleGraphics = await db.get('flexibleGraphics', id);
  if (flexibleGraphics) {
    flexibleGraphics.images = images;
    flexibleGraphics.updatedAt = new Date();
    await db.put('flexibleGraphics', flexibleGraphics);
  }
}
