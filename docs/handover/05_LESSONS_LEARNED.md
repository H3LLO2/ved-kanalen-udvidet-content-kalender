# Lessons Learned: What Went Wrong

This document captures every significant bug, design flaw, and mistake from the previous implementation so they are NOT repeated.

---

## Critical Bugs

### 1. LocalStorage Quota Exceeded
**What happened:** Storing base64-encoded images in localStorage hit the 5MB browser limit, crashing the app.

**How it manifested:** `QuotaExceededError: Failed to execute 'setItem' on 'Storage'`

**Root cause:** Posts were saved to localStorage WITH their full base64 image URLs.

**Fix:** 
- Never store image data in localStorage
- Use a database (Supabase) for image storage
- Only persist metadata/captions locally if needed

---

### 2. HEIC Files Not Displaying
**What happened:** iPhone photos (HEIC format) uploaded successfully but showed as broken images.

**How it manifested:** Black boxes or missing images in the preview grid.

**Root cause:** 
- Browsers cannot natively decode/display HEIC images
- The MIME type check `file.type.startsWith('image/')` sometimes fails for HEIC
- FileReader reads the bytes but browser can't render them

**Fix:**
- Use `heic2any` library to convert HEIC → JPEG on upload
- Check file extension in addition to MIME type
- Handle conversion errors gracefully

---

### 3. Black Screen / React Crash
**What happened:** App would crash to blank white/black screen with no error message.

**How it manifested:** User clicks button, entire app disappears.

**Root cause:**
- Unhandled exceptions in render cycle
- No React Error Boundaries
- JSON parsing failures crashing the component

**Fix:**
- Add Error Boundaries around major components
- Wrap all async operations in try-catch
- Display user-friendly error messages
- Never let JSON.parse crash the app

---

### 4. Malformed JSON from AI
**What happened:** AI sometimes returns JSON wrapped in markdown code blocks or with extra text.

**How it manifested:** `SyntaxError: Unexpected token` when parsing AI response.

**Root cause:** AI doesn't always follow the "return only JSON" instruction perfectly.

**Fix:**
```javascript
// Robust JSON extraction
function extractJSON(text) {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {}
  
  // Try extracting from code blocks
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch {}
  }
  
  // Try finding JSON object/array
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {}
  }
  
  throw new Error('Could not extract valid JSON from AI response');
}
```

---

### 5. Hardcoded Brand Data Truncated
**What happened:** Default brand values in code were accidentally truncated during editing.

**How it manifested:** Manifest showing "..." instead of full text.

**Root cause:** Large strings in source code are error-prone.

**Fix:**
- Load brand content from external files or database
- Never hardcode large content blocks
- Use environment variables or config files

---

## Design Flaws

### 1. Frontend-Only Architecture
**Problem:** All AI calls happen in browser, exposing API keys.

**Impact:** 
- API key visible in browser DevTools
- No rate limiting
- No caching
- Vulnerable to abuse

**Fix:** Move AI calls to Edge Functions (Supabase, Vercel, etc.)

---

### 2. No Real Persistence
**Problem:** Strategy, posts, and progress only exist in React state and localStorage.

**Impact:**
- Refresh = data loss for images
- Can't resume multi-session work
- No way to track 90-day narrative history

**Fix:** Use Supabase PostgreSQL for all persistent data.

---

### 3. Monolithic AI Service
**Problem:** Single `ai.ts` file with all agents mixed together.

**Impact:**
- Hard to test individual agents
- Prompts get mixed up
- Difficult to maintain

**Fix:** Separate each agent into its own module with clear interfaces.

---

### 4. No Narrative Memory
**Problem:** Each generation session starts fresh with no memory of previous posts.

**Impact:** Can't maintain 90-day narrative continuity across sessions.

**Fix:** 
- Store post summaries in `strategy_history` table
- Feed last N posts as context to each new generation
- Track which "hooks" and "CTAs" were recently used

---

### 5. No Image Tracking
**Problem:** System doesn't prevent reusing images across different posts.

**Impact:** Same photo could appear in multiple posts.

**Fix:**
- Mark images as "used" in database when assigned to a post
- Exclude used images from planning AI's available pool
- Show visual indicator of used vs. available images

---

## Process Issues

### 1. Testing with Production Data
**Problem:** Tested with actual client photos that hit API limits.

**Impact:** Wasted API credits, slow iteration.

**Fix:** 
- Create small test dataset (5-10 images)
- Mock AI responses for UI testing
- Only use full dataset for integration tests

---

### 2. No Progress Persistence
**Problem:** If generation fails midway, you start over.

**Impact:** Lost work, wasted time.

**Fix:**
- Save each post as it's generated
- Support resuming from last successful post
- Show clear status of each day's generation

---

## Performance Issues

### 1. Sequential Image Analysis
**Problem:** Analyzed images one at a time.

**Impact:** 20 images = 20 serial API calls = long wait.

**Fix:** Batch with concurrency limit (e.g., 5 parallel with p-limit library).

---

### 2. No Thumbnails
**Problem:** Full-resolution base64 images rendered in grid.

**Impact:** Slow rendering, high memory usage.

**Fix:** Generate thumbnails (300px) for preview, use full size only when needed.

---

## UX Issues

### 1. No Loading States
**Problem:** User unsure if action is working.

**Fix:** Clear progress bars, step indicators, estimated times.

### 2. Error Messages Too Vague
**Problem:** "Something went wrong" doesn't help debugging.

**Fix:** Show specific error type and actionable guidance.

### 3. No Undo
**Problem:** Regenerating a caption loses the previous one.

**Fix:** Keep version history or at least confirm before overwriting.

---

## Summary: Top 10 Rules for the Rebuild

1. **No base64 images in localStorage** - ever
2. **Convert HEIC on upload** - before any processing
3. **Error boundaries everywhere** - catch and display, don't crash
4. **Robust JSON parsing** - expect markdown wrapping
5. **Backend for AI calls** - protect API keys
6. **Database for persistence** - not browser storage
7. **Track image usage** - prevent duplicates
8. **Maintain narrative history** - 90-day context
9. **Progress persistence** - resume on failure
10. **Test with small datasets** - iterate fast
