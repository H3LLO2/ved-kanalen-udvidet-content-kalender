import {
  getAllCampaigns,
  getImagesByCampaign,
  getPostsByCampaign,
  getBrainPlanByCampaign,
  getMenuExemptsByCampaign,
  saveCampaign,
  saveImages,
  savePosts,
  saveBrainPlan,
  saveMenuExempt,
  type StoredImage,
  type StoredPost,
  type StoredBrainPlan,
  type StoredMenuExempt,
} from './database';
import type { Campaign } from '../types';

// Backup format
interface BackupData {
  version: 1;
  exportedAt: string;
  campaigns: Campaign[];
  images: Array<{
    campaignId: string;
    data: Omit<StoredImage, 'blob' | 'thumbnailBlob'> & {
      blobBase64: string;
      thumbnailBase64?: string;
    };
  }>;
  posts: StoredPost[];
  brainPlans: StoredBrainPlan[];
  menuExempts: Array<{
    data: Omit<StoredMenuExempt, 'images'> & {
      images: Array<{
        id: string;
        blobBase64: string;
        description: string;
        costUsd: number;
        createdAt: string;
      }>;
    };
  }>;
}

// Convert Blob to base64
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      const base64Data = base64.split(',')[1] || base64;
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Convert base64 to Blob
function base64ToBlob(base64: string, mimeType: string = 'image/jpeg'): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

// Export all data to a JSON file
export async function exportAllData(): Promise<void> {
  const campaigns = await getAllCampaigns();

  const backup: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    campaigns,
    images: [],
    posts: [],
    brainPlans: [],
    menuExempts: [],
  };

  // Export data for each campaign
  for (const campaign of campaigns) {
    // Images
    const images = await getImagesByCampaign(campaign.id);
    for (const img of images) {
      const blobBase64 = await blobToBase64(img.blob);
      const thumbnailBase64 = img.thumbnailBlob
        ? await blobToBase64(img.thumbnailBlob)
        : undefined;

      backup.images.push({
        campaignId: campaign.id,
        data: {
          id: img.id,
          campaignId: img.campaignId,
          originalName: img.originalName,
          mimeType: img.mimeType,
          analysisId: img.analysisId,
          usedInPostId: img.usedInPostId,
          createdAt: img.createdAt,
          blobBase64,
          thumbnailBase64,
        },
      });
    }

    // Posts
    const posts = await getPostsByCampaign(campaign.id);
    backup.posts.push(...posts);

    // Brain plans
    const brainPlan = await getBrainPlanByCampaign(campaign.id);
    if (brainPlan) {
      backup.brainPlans.push(brainPlan);
    }

    // Menu exempts
    const menuExempts = await getMenuExemptsByCampaign(campaign.id);
    for (const exempt of menuExempts) {
      const imagesWithBase64 = await Promise.all(
        exempt.images.map(async (img) => ({
          id: img.id,
          blobBase64: await blobToBase64(img.blob),
          description: img.description,
          costUsd: img.costUsd || 0.04,
          createdAt: img.createdAt.toISOString(),
        }))
      );

      backup.menuExempts.push({
        data: {
          id: exempt.id,
          campaignId: exempt.campaignId,
          description: exempt.description,
          createdAt: exempt.createdAt,
          updatedAt: exempt.updatedAt,
          images: imagesWithBase64,
        },
      });
    }
  }

  // Download as JSON file
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `ved-kanalen-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Import data from a backup file
export async function importBackupData(file: File): Promise<{
  success: boolean;
  message: string;
  campaignsImported: number;
}> {
  try {
    const text = await file.text();
    const backup: BackupData = JSON.parse(text);

    if (backup.version !== 1) {
      return { success: false, message: 'Unsupported backup version', campaignsImported: 0 };
    }

    let campaignsImported = 0;

    // Import campaigns
    for (const campaign of backup.campaigns) {
      await saveCampaign(campaign);
      campaignsImported++;
    }

    // Import images
    const imagesToSave: StoredImage[] = [];
    for (const imgData of backup.images) {
      const blob = base64ToBlob(imgData.data.blobBase64, imgData.data.mimeType);
      const thumbnailBlob = imgData.data.thumbnailBase64
        ? base64ToBlob(imgData.data.thumbnailBase64, imgData.data.mimeType)
        : undefined;

      imagesToSave.push({
        id: imgData.data.id,
        campaignId: imgData.data.campaignId,
        originalName: imgData.data.originalName,
        mimeType: imgData.data.mimeType,
        blob,
        thumbnailBlob,
        analysisId: imgData.data.analysisId,
        usedInPostId: imgData.data.usedInPostId,
        createdAt: new Date(imgData.data.createdAt),
      });
    }
    if (imagesToSave.length > 0) {
      await saveImages(imagesToSave);
    }

    // Import posts
    if (backup.posts.length > 0) {
      await savePosts(backup.posts);
    }

    // Import brain plans
    for (const plan of backup.brainPlans) {
      await saveBrainPlan(plan);
    }

    // Import menu exempts
    for (const exemptData of backup.menuExempts) {
      const images = exemptData.data.images.map((img) => ({
        id: img.id,
        blob: base64ToBlob(img.blobBase64, 'image/png'),
        description: img.description,
        costUsd: img.costUsd || 0.04,
        createdAt: new Date(img.createdAt),
      }));

      await saveMenuExempt({
        id: exemptData.data.id,
        campaignId: exemptData.data.campaignId,
        description: exemptData.data.description,
        images,
        createdAt: new Date(exemptData.data.createdAt),
        updatedAt: new Date(exemptData.data.updatedAt),
      });
    }

    return {
      success: true,
      message: `Imported ${campaignsImported} campaigns`,
      campaignsImported,
    };
  } catch (err) {
    console.error('Import failed:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Import failed',
      campaignsImported: 0,
    };
  }
}
