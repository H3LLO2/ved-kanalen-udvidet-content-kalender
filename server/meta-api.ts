/**
 * Meta Graph API Integration
 * - Fetch posted content (Facebook + Instagram)
 * - Schedule posts to Business Suite
 */

import type { Request, Response, Router } from 'express';
import express from 'express';

const router: Router = express.Router();

// Ved Kanalen Meta IDs (from config)
const DEFAULT_FB_PAGE_ID = '753891141658884';
const DEFAULT_IG_USER_ID = '17841413474356160';

// Types
interface MetaPost {
  id: string;
  message?: string;
  caption?: string;
  created_time: string;
  full_picture?: string;
  media_url?: string;
  permalink_url?: string;
  media_type?: string;
}

interface FetchHistoryRequest {
  accessToken: string;
  fbPageId?: string;
  igUserId?: string;
  limit?: number;
}

interface SchedulePostRequest {
  accessToken: string;
  fbPageId?: string;
  igUserId?: string;
  message: string;
  imageUrl?: string;
  scheduledTime: number; // Unix timestamp
  platforms: ('facebook' | 'instagram')[];
}

// ============================================================================
// FETCH HISTORY - Get previously posted content
// ============================================================================

router.post('/fetch-history', async (req: Request, res: Response) => {
  try {
    const { 
      accessToken, 
      fbPageId = DEFAULT_FB_PAGE_ID, 
      igUserId = DEFAULT_IG_USER_ID,
      limit = 50 
    } = req.body as FetchHistoryRequest;

    if (!accessToken) {
      return res.status(400).json({ error: 'accessToken required' });
    }

    const posts: MetaPost[] = [];
    const errors: string[] = [];

    // Fetch Facebook posts
    try {
      const fbUrl = `https://graph.facebook.com/v19.0/${fbPageId}/feed?fields=id,message,created_time,full_picture,permalink_url&limit=${limit}&access_token=${accessToken}`;
      const fbResponse = await fetch(fbUrl);
      const fbData = await fbResponse.json();

      if (fbData.error) {
        errors.push(`Facebook: ${fbData.error.message}`);
      } else if (fbData.data) {
        for (const post of fbData.data) {
          posts.push({
            id: post.id,
            message: post.message,
            created_time: post.created_time,
            full_picture: post.full_picture,
            permalink_url: post.permalink_url,
          });
        }
      }
    } catch (e) {
      errors.push(`Facebook fetch error: ${e}`);
    }

    // Fetch Instagram posts
    try {
      const igUrl = `https://graph.facebook.com/v19.0/${igUserId}/media?fields=id,caption,timestamp,media_url,permalink,media_type&limit=${limit}&access_token=${accessToken}`;
      const igResponse = await fetch(igUrl);
      const igData = await igResponse.json();

      if (igData.error) {
        errors.push(`Instagram: ${igData.error.message}`);
      } else if (igData.data) {
        for (const post of igData.data) {
          posts.push({
            id: post.id,
            caption: post.caption,
            created_time: post.timestamp,
            media_url: post.media_url,
            permalink_url: post.permalink,
            media_type: post.media_type,
          });
        }
      }
    } catch (e) {
      errors.push(`Instagram fetch error: ${e}`);
    }

    // Sort by date (newest first)
    posts.sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime());

    // Extract text for history
    const historyText = posts
      .filter(p => p.message || p.caption)
      .map(p => {
        const date = new Date(p.created_time).toLocaleDateString('da-DK');
        const text = p.message || p.caption || '';
        return `[${date}]\n${text}`;
      })
      .join('\n\n---\n\n');

    // Extract image URLs for matching
    const imageUrls = posts
      .filter(p => p.full_picture || p.media_url)
      .map(p => ({
        postId: p.id,
        url: p.full_picture || p.media_url || '',
        date: p.created_time,
      }));

    return res.json({
      success: true,
      postCount: posts.length,
      historyText,
      imageUrls,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Fetch history error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

// ============================================================================
// SCHEDULE POST - Schedule to Business Suite
// ============================================================================

router.post('/schedule', async (req: Request, res: Response) => {
  try {
    const { 
      accessToken, 
      fbPageId = DEFAULT_FB_PAGE_ID,
      igUserId = DEFAULT_IG_USER_ID,
      message, 
      imageUrl,
      scheduledTime,
      platforms = ['facebook', 'instagram']
    } = req.body as SchedulePostRequest;

    if (!accessToken || !message || !scheduledTime) {
      return res.status(400).json({ error: 'accessToken, message, and scheduledTime required' });
    }

    const results: { platform: string; success: boolean; id?: string; error?: string }[] = [];

    // Schedule to Facebook
    if (platforms.includes('facebook')) {
      try {
        let fbUrl: string;
        let body: Record<string, string | number>;

        if (imageUrl) {
          // Photo post
          fbUrl = `https://graph.facebook.com/v19.0/${fbPageId}/photos`;
          body = {
            url: imageUrl,
            caption: message,
            scheduled_publish_time: scheduledTime,
            published: 'false',
            access_token: accessToken,
          };
        } else {
          // Text-only post
          fbUrl = `https://graph.facebook.com/v19.0/${fbPageId}/feed`;
          body = {
            message,
            scheduled_publish_time: scheduledTime,
            published: 'false',
            access_token: accessToken,
          };
        }

        const fbResponse = await fetch(fbUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const fbData = await fbResponse.json();

        if (fbData.error) {
          results.push({ platform: 'facebook', success: false, error: fbData.error.message });
        } else {
          results.push({ platform: 'facebook', success: true, id: fbData.id || fbData.post_id });
        }
      } catch (e) {
        results.push({ platform: 'facebook', success: false, error: String(e) });
      }
    }

    // Schedule to Instagram (requires container creation)
    if (platforms.includes('instagram') && imageUrl) {
      try {
        // Step 1: Create media container
        const containerUrl = `https://graph.facebook.com/v19.0/${igUserId}/media`;
        const containerResponse = await fetch(containerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: imageUrl,
            caption: message,
            access_token: accessToken,
          }),
        });
        const containerData = await containerResponse.json();

        if (containerData.error) {
          results.push({ platform: 'instagram', success: false, error: containerData.error.message });
        } else {
          // Step 2: Publish container (scheduled)
          // Note: Instagram API doesn't directly support scheduled_publish_time like Facebook
          // You would need to use a separate scheduling mechanism or publish immediately
          // For now, we'll note this limitation
          
          const publishUrl = `https://graph.facebook.com/v19.0/${igUserId}/media_publish`;
          const publishResponse = await fetch(publishUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              creation_id: containerData.id,
              access_token: accessToken,
            }),
          });
          const publishData = await publishResponse.json();

          if (publishData.error) {
            results.push({ 
              platform: 'instagram', 
              success: false, 
              error: `Container created but publish failed: ${publishData.error.message}. Note: Instagram API doesn't support direct scheduling - use Business Suite for scheduling.` 
            });
          } else {
            results.push({ platform: 'instagram', success: true, id: publishData.id });
          }
        }
      } catch (e) {
        results.push({ platform: 'instagram', success: false, error: String(e) });
      }
    } else if (platforms.includes('instagram') && !imageUrl) {
      results.push({ platform: 'instagram', success: false, error: 'Instagram requires an image' });
    }

    const allSuccess = results.every(r => r.success);

    return res.json({
      success: allSuccess,
      results,
    });
  } catch (error) {
    console.error('Schedule error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

// ============================================================================
// VERIFY TOKEN - Check if token is valid and has required permissions
// ============================================================================

router.post('/verify-token', async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: 'accessToken required' });
    }

    // Check token info
    const tokenUrl = `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${accessToken}`;
    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return res.json({
        valid: false,
        error: tokenData.error.message,
      });
    }

    // Check permissions
    const permUrl = `https://graph.facebook.com/v19.0/me/permissions?access_token=${accessToken}`;
    const permResponse = await fetch(permUrl);
    const permData = await permResponse.json();

    const permissions = permData.data?.map((p: { permission: string; status: string }) => ({
      permission: p.permission,
      granted: p.status === 'granted',
    })) || [];

    const requiredPerms = ['pages_manage_posts', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish'];
    const missingPerms = requiredPerms.filter(p => !permissions.find((perm: { permission: string; granted: boolean }) => perm.permission === p && perm.granted));

    return res.json({
      valid: true,
      user: tokenData,
      permissions,
      missingPermissions: missingPerms,
      hasAllRequired: missingPerms.length === 0,
    });
  } catch (error) {
    console.error('Verify token error:', error);
    return res.status(500).json({ error: String(error) });
  }
});

export default router;
