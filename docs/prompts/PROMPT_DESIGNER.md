# Prompt: The Designer (Graphic Generation)

**Model:** `gemini-3-pro-image-preview`

**Used in:** `AIService.generateGraphic()`

---

```
Create a professional social media graphic for Instagram.

STYLE REQUIREMENTS:
- Clean, modern, flat design aesthetic like a professionally made Canva template
- Style: ${request.style}
- Color palette: ${brandColors}
- Aspect ratio: 1:1 (square for Instagram feed)
- Resolution: High quality, sharp

CONTENT:
- Concept: ${request.concept}
${textElements.length > 0 ? textElements.join('\n') : '- No text needed, pure graphic design'}

CRITICAL REQUIREMENTS:
- This MUST look like a human graphic designer made it in Canva or Figma
- NO photorealistic AI-generated imagery
- NO weird AI artifacts or distortions
- Typography must be SHARP, LEGIBLE, and PROFESSIONAL
- Use clean geometric shapes, icons, or abstract elements
- The design should feel premium and intentional
- If Danish text is included, it must be spelled correctly

Create the graphic now.
```

---

## Text Elements Construction

If headline/subtext are provided, they're formatted as:

```javascript
const textElements = [];
if (request.headline) textElements.push(`Headline (Danish): "${request.headline}"`);
if (request.subtext) textElements.push(`Subtext (Danish): "${request.subtext}"`);
```

---

## API Call Configuration

```javascript
const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
        responseModalities: ["IMAGE"],
    }
});
```

The response contains `inlineData.data` (base64) and `inlineData.mimeType`.
