# Technical Specification

## Technology Stack Recommendation

### Frontend
- **Framework:** React 18+ with TypeScript
- **Build:** Vite
- **Styling:** Tailwind CSS or vanilla CSS (no heavy frameworks)
- **State:** React hooks + Context (or Zustand for complex state)
- **Icons:** Lucide React

### Backend (NEW - Don't do frontend-only!)
- **Platform:** Supabase
- **Database:** PostgreSQL for strategy/post persistence
- **Edge Functions:** For AI API calls (keeps keys secure)
- **Storage:** Supabase Storage for processed images

### AI Integration
- **Provider:** Google Gemini API
- **Models:**
  - `gemini-3-flash-preview` - Vision analysis (fast, cheap)
  - `gemini-3-pro-preview` - Planning and writing (smart)
  - `gemini-3-pro-image-preview` - Graphic generation (Nano Banana Pro)

---

## Database Schema

```sql
-- Campaigns/Projects
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  brand_context JSONB NOT NULL,
  strategy JSONB NOT NULL,
  current_phase TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Uploaded Images
CREATE TABLE images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  analysis JSONB, -- AI vision analysis results
  used_in_post UUID REFERENCES posts(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Generated Posts
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  caption TEXT NOT NULL,
  posting_time TEXT NOT NULL,
  seed TEXT, -- The original content seed
  reasoning TEXT, -- AI's reasoning for this post
  status TEXT DEFAULT 'draft', -- draft, approved, scheduled, posted
  generated_graphic_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Post-Image join table (1-3 images per post)
CREATE TABLE post_images (
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  image_id UUID REFERENCES images(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL,
  PRIMARY KEY (post_id, image_id)
);

-- Strategy history (for narrative continuity)
CREATE TABLE strategy_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id),
  summary TEXT NOT NULL, -- What was posted, for context
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## API Endpoints (Edge Functions)

### `POST /analyze-image`
- Input: Image file (multipart)
- Process: Upload to storage, send to Gemini Vision, save analysis
- Output: `{ id, analysisResult }`

### `POST /generate-plan`
- Input: `{ campaignId, imageIds[], brandContext, strategy }`
- Process: Send to Gemini Pro, get strategic plan
- Output: `{ plan: DayPlan[], thoughts }`

### `POST /generate-caption`
- Input: `{ postId, seed, imageContext, previousPosts, systemPrompt }`
- Process: Send to Gemini Pro with full context
- Output: `{ caption }`

### `POST /generate-graphic`
- Input: `{ concept, headline?, subtext?, style }`
- Process: Send to Gemini Pro Image
- Output: `{ imageUrl }` (stored in Supabase Storage)

### `POST /regenerate-post`
- Input: `{ postId }`
- Process: Generate new caption with same context
- Output: `{ newCaption }`

---

## Image Processing Flow

```
1. User uploads HEIC/JPEG/PNG files
   ↓
2. Frontend converts HEIC → JPEG (heic2any library)
   ↓
3. Upload to Supabase Storage (original + thumbnail)
   ↓
4. Call /analyze-image for each image
   ↓
5. Store analysis results in database
   ↓
6. Display thumbnails with analysis badges
```

---

## Generation Flow

```
1. User clicks "Generate Calendar"
   ↓
2. Get all analyzed images for campaign
   ↓
3. Call /generate-plan with brand context + strategy
   ↓
4. Receive DayPlan[] with image groupings
   ↓
5. For each day with graphic request:
   - Call /generate-graphic
   - Store result
   ↓
6. For each day (sequentially for context):
   - Call /generate-caption with previous post context
   - Store caption
   - Update strategy_history
   ↓
7. Display completed calendar
```

---

## Error Handling Requirements

1. **All API calls in try-catch** with user-friendly error messages
2. **Retry logic** for transient failures (rate limits, network)
3. **Graceful degradation** - if graphic fails, continue without it
4. **Error boundaries** in React to prevent white/black screens
5. **Progress indicators** showing current step and overall progress
6. **Validation** before expensive operations (check API key, images exist, etc.)

---

## Performance Considerations

1. **Batch image uploads** - use Promise.all with concurrency limit
2. **Lazy load thumbnails** - don't render 100 images at once
3. **Stream long operations** - show progress as each post generates
4. **Cache brand context** - don't refetch on every operation
5. **Compress images** before upload - reduce storage and API costs

---

## Security

1. **API keys in Edge Functions only** - never in frontend
2. **Row Level Security (RLS)** on all Supabase tables
3. **Authentication** if supporting multiple users/campaigns
4. **Input sanitization** - especially for user-entered text
