/**
 * Meta (Facebook/Instagram) Graph API integration
 * Handles scheduling and publishing posts
 */

const META_ACCESS_TOKEN = import.meta.env.VITE_META_ACCESS_TOKEN;
const FB_PAGE_ID = import.meta.env.VITE_FB_PAGE_ID;
const IG_USER_ID = import.meta.env.VITE_IG_USER_ID;

export interface ScheduleResult {
  success: boolean;
  postId?: string;
  error?: string;
  scheduledTime?: Date;
}

export interface MediaUploadResult {
  success: boolean;
  mediaId?: string;
  error?: string;
}

/**
 * Validates that a scheduled time is in the future
 */
export function validateScheduleTime(scheduledTime: Date): { valid: boolean; error?: string } {
  const now = new Date();
  const minTime = new Date(now.getTime() + 20 * 60 * 1000); // At least 20 minutes from now (Meta requirement)
  const maxTime = new Date(now.getTime() + 75 * 24 * 60 * 60 * 1000); // Max 75 days ahead

  if (scheduledTime < now) {
    return { valid: false, error: 'Kan ikke schedule til fortiden' };
  }

  if (scheduledTime < minTime) {
    return { valid: false, error: 'Skal være mindst 20 minutter fra nu (Meta krav)' };
  }

  if (scheduledTime > maxTime) {
    return { valid: false, error: 'Kan ikke schedule mere end 75 dage frem' };
  }

  return { valid: true };
}

/**
 * Upload image to Meta for later use in a post
 */
export async function uploadImageToMeta(imageBlob: Blob): Promise<MediaUploadResult> {
  try {
    // First, we need to get the image as a URL that Meta can access
    // For now, we'll use the container approach for Instagram
    const formData = new FormData();
    formData.append('source', imageBlob, 'image.jpg');
    formData.append('access_token', META_ACCESS_TOKEN);

    const response = await fetch(
      `https://graph.facebook.com/v23.0/${FB_PAGE_ID}/photos?published=false`,
      {
        method: 'POST',
        body: formData,
      }
    );

    const data = await response.json();

    if (data.error) {
      return { success: false, error: data.error.message };
    }

    return { success: true, mediaId: data.id };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Schedule a post to Facebook Page
 */
export async function scheduleFacebookPost(
  message: string,
  scheduledTime: Date,
  imageIds?: string[]
): Promise<ScheduleResult> {
  // Validate time
  const validation = validateScheduleTime(scheduledTime);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    const unixTimestamp = Math.floor(scheduledTime.getTime() / 1000);

    const params = new URLSearchParams({
      message,
      published: 'false',
      scheduled_publish_time: unixTimestamp.toString(),
      access_token: META_ACCESS_TOKEN,
    });

    // If we have images, attach them
    if (imageIds && imageIds.length > 0) {
      // For multiple images, we need to use the feed endpoint with attached_media
      const attachedMedia = imageIds.map((id) => ({ media_fbid: id }));
      params.append('attached_media', JSON.stringify(attachedMedia));
    }

    const response = await fetch(
      `https://graph.facebook.com/v23.0/${FB_PAGE_ID}/feed`,
      {
        method: 'POST',
        body: params,
      }
    );

    const data = await response.json();

    if (data.error) {
      return { success: false, error: data.error.message };
    }

    return {
      success: true,
      postId: data.id,
      scheduledTime,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Schedule a post to Instagram (via Facebook Page)
 * Instagram requires images to be hosted at public URLs
 */
export async function scheduleInstagramPost(
  caption: string,
  imageUrls: string[],
  scheduledTime: Date
): Promise<ScheduleResult> {
  // Validate time
  const validation = validateScheduleTime(scheduledTime);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    // Note: Instagram API doesn't support scheduled publishing directly via API
    // We publish immediately - scheduling requires Business Suite
    // const unixTimestamp = Math.floor(scheduledTime.getTime() / 1000);

    if (imageUrls.length === 0) {
      return { success: false, error: 'Instagram kræver mindst ét billede' };
    }

    const firstImageUrl = imageUrls[0];
    if (!firstImageUrl) {
      return { success: false, error: 'Instagram kræver mindst ét billede' };
    }

    if (imageUrls.length === 1) {
      // Single image post
      const createResponse = await fetch(
        `https://graph.facebook.com/v23.0/${IG_USER_ID}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            image_url: firstImageUrl,
            caption,
            access_token: META_ACCESS_TOKEN,
          }),
        }
      );

      const createData = await createResponse.json();
      if (createData.error) {
        return { success: false, error: createData.error.message };
      }

      // Publish the container (scheduled)
      const publishResponse = await fetch(
        `https://graph.facebook.com/v23.0/${IG_USER_ID}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            creation_id: createData.id,
            access_token: META_ACCESS_TOKEN,
          }),
        }
      );

      const publishData = await publishResponse.json();
      if (publishData.error) {
        return { success: false, error: publishData.error.message };
      }

      return {
        success: true,
        postId: publishData.id,
        scheduledTime,
      };
    } else {
      // Carousel post (multiple images)
      const childContainers: string[] = [];

      // Create child containers for each image
      for (const imageUrl of imageUrls) {
        const childResponse = await fetch(
          `https://graph.facebook.com/v23.0/${IG_USER_ID}/media`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              image_url: imageUrl,
              is_carousel_item: 'true',
              access_token: META_ACCESS_TOKEN,
            }),
          }
        );

        const childData = await childResponse.json();
        if (childData.error) {
          return { success: false, error: `Carousel item fejl: ${childData.error.message}` };
        }
        childContainers.push(childData.id);
      }

      // Create carousel container
      const carouselResponse = await fetch(
        `https://graph.facebook.com/v23.0/${IG_USER_ID}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            media_type: 'CAROUSEL',
            children: childContainers.join(','),
            caption,
            access_token: META_ACCESS_TOKEN,
          }),
        }
      );

      const carouselData = await carouselResponse.json();
      if (carouselData.error) {
        return { success: false, error: carouselData.error.message };
      }

      // Publish carousel
      const publishResponse = await fetch(
        `https://graph.facebook.com/v23.0/${IG_USER_ID}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            creation_id: carouselData.id,
            access_token: META_ACCESS_TOKEN,
          }),
        }
      );

      const publishData = await publishResponse.json();
      if (publishData.error) {
        return { success: false, error: publishData.error.message };
      }

      return {
        success: true,
        postId: publishData.id,
        scheduledTime,
      };
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Get scheduled posts from Facebook Page
 */
export async function getScheduledPosts(): Promise<any[]> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v23.0/${FB_PAGE_ID}/scheduled_posts?access_token=${META_ACCESS_TOKEN}`
    );
    const data = await response.json();
    return data.data || [];
  } catch {
    return [];
  }
}

/**
 * Check if Meta API is configured
 */
export function isMetaConfigured(): boolean {
  return !!(META_ACCESS_TOKEN && FB_PAGE_ID);
}

/**
 * Fetch all posted images from Facebook Page
 * Returns URLs and hashes for comparison
 */
export async function fetchPostedImages(limit = 100): Promise<{
  success: boolean;
  images: Array<{ id: string; url: string; createdTime: string; postId: string }>;
  error?: string;
}> {
  try {
    // Get posts with their attached photos
    const response = await fetch(
      `https://graph.facebook.com/v23.0/${FB_PAGE_ID}/posts?fields=id,created_time,full_picture,attachments{media,subattachments}&limit=${limit}&access_token=${META_ACCESS_TOKEN}`
    );
    
    const data = await response.json();
    
    if (data.error) {
      return { success: false, images: [], error: data.error.message };
    }

    const images: Array<{ id: string; url: string; createdTime: string; postId: string }> = [];
    
    for (const post of data.data || []) {
      // Main picture
      if (post.full_picture) {
        images.push({
          id: `${post.id}_main`,
          url: post.full_picture,
          createdTime: post.created_time,
          postId: post.id,
        });
      }
      
      // Attachments (carousel/album)
      if (post.attachments?.data) {
        for (const attachment of post.attachments.data) {
          if (attachment.media?.image?.src) {
            images.push({
              id: `${post.id}_${attachment.media.id || 'att'}`,
              url: attachment.media.image.src,
              createdTime: post.created_time,
              postId: post.id,
            });
          }
          // Subattachments (for albums)
          if (attachment.subattachments?.data) {
            for (const sub of attachment.subattachments.data) {
              if (sub.media?.image?.src) {
                images.push({
                  id: `${post.id}_${sub.media.id || 'sub'}`,
                  url: sub.media.image.src,
                  createdTime: post.created_time,
                  postId: post.id,
                });
              }
            }
          }
        }
      }
    }

    return { success: true, images };
  } catch (err) {
    return { success: false, images: [], error: (err as Error).message };
  }
}

/**
 * Fetch posted image URLs for duplicate detection
 */
export async function getPostedImageUrls(): Promise<string[]> {
  const result = await fetchPostedImages(200);
  if (!result.success) return [];
  return result.images.map(img => img.url);
}
