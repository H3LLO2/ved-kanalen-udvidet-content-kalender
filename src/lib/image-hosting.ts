/**
 * Image Hosting Service
 * Uploads images to imgbb.com for public URLs (required for Instagram)
 */

const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;

export interface ImageUploadResult {
  success: boolean;
  url?: string;
  deleteUrl?: string;
  error?: string;
}

/**
 * Upload an image blob to imgbb and get a public URL
 */
export async function uploadToImgbb(blob: Blob, name?: string): Promise<ImageUploadResult> {
  if (!IMGBB_API_KEY) {
    return { success: false, error: 'IMGBB_API_KEY not configured' };
  }

  try {
    // Convert blob to base64
    const base64 = await blobToBase64(blob);
    
    const formData = new FormData();
    formData.append('key', IMGBB_API_KEY);
    formData.append('image', base64);
    if (name) {
      formData.append('name', name);
    }
    // Images expire after 1 day (enough for scheduling)
    formData.append('expiration', '86400');

    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!data.success) {
      return { success: false, error: data.error?.message || 'Upload failed' };
    }

    return {
      success: true,
      url: data.data.url,
      deleteUrl: data.data.delete_url,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Upload multiple images and return their public URLs
 */
export async function uploadMultipleToImgbb(
  blobs: Array<{ blob: Blob; name?: string }>
): Promise<Array<{ success: boolean; url?: string; error?: string }>> {
  const results = await Promise.all(
    blobs.map(({ blob, name }) => uploadToImgbb(blob, name))
  );
  return results;
}

/**
 * Check if image hosting is configured
 */
export function isImageHostingConfigured(): boolean {
  return !!IMGBB_API_KEY;
}

// Helper to convert Blob to base64
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64Data = base64.split(',')[1] || base64;
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
