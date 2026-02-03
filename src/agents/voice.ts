import { getProModel, withRateLimit, trackTokens } from '../lib/gemini';
import { BRAND_CONTEXT, getPhaseStrategy } from '../lib/brandContext';
import type { Phase, HookType, CTAType } from '../types';

// Voice system prompt - DIRECT and CASUAL, not prose-y
const VOICE_SYSTEM_PROMPT = `Du skriver Facebook/Instagram-opslag for "Ved Kanalen" (tidligere Restaurant Ene).

TONEN: Som en ven der fortæller hvad der sker. IKKE som en forfatter. IKKE som en marketingafdeling.

SÅDAN SKRIVER DU:
- Kort og kontant. Sig det ligeud.
- Som du ville skrive til en ven på SMS - bare lidt længere.
- Brug "vi" og "os". Vi er mennesker, ikke en virksomhed.
- Konkret: "Vi maler køkkenet hvidt" - IKKE "Forandringens vinde blæser gennem lokalet"
- Underspil hellere end overspil. "Det blev meget fint" > "Det blev helt fantastisk"

UNDGÅ DISSE FEJL:
- INGEN poetisk sprog eller metaforer
- INGEN "rejse", "eventyr", "kapitel", "forvandling"
- INGEN sætninger der starter med "Der er noget særligt ved..."
- INGEN "i en tid hvor..." eller "når man..."
- INGEN klichéer om mad og passion
- ALDRIG lyde som reklame eller marketing

FORBUDTE ORD:
${BRAND_CONTEXT.forbiddenWords.map(w => `"${w}"`).join(', ')}
Også forbudt: "fedmefuld", "ypperlig", "velsmagende", "en fryd for øjet", "dyk ned i", "udforsk"

BRUG GERNE:
- Småord: "jo", "lige", "egentlig", "altså", "bare", "vel"
- "sgu" - men SJÆLDENT (1 gang per 5-10 opslag)
- Konkrete beskrivelser: farver, materialer, hvad vi faktisk gør

FORMATERING:
- Ren tekst, ingen markdown
- Korte afsnit med mellemrum
- 0-3 emojis maks, kun hvis det passer naturligt
- ALDRIG start med "Hej" eller hilsen

LÆNGDE: 5-10 sætninger. Giv teksten lidt mere kød på benet - men stadig uden fluff.

EKSEMPLER PÅ GOD TONE:
"Gulvet er væk. Det gamle trægulv måtte ud. Nu står vi med bart beton og en masse planer."
"Nye lamper i dag. De gamle var fine nok, men de her giver bare mere."
"Maleren har været her. Hvidt overalt. Det er ved at ligne noget."

EKSEMPLER PÅ DÅRLIG TONE (UNDGÅ!):
"En ny æra tager form i hjertet af Kanalbyen..." ❌
"Med bankende hjerter og malerruller i hænderne..." ❌
"Forandringens vinde blæser gennem vores lille oase..." ❌`;

// Hook type descriptions for the prompt
function getHookDescription(hookType: HookType): string {
  const descriptions: Record<HookType, string> = {
    EMOTIONAL: 'Start med minder, dufte, følelser. Skab forbindelse.',
    CONTROVERSIAL: 'Start med en skarp holdning til mad/vin. Vær modig.',
    HUMOROUS: 'Start med selvironi eller kaos. Vis menneskelig side.',
    INFORMATIVE: 'Start med nørdet viden. Del noget folk ikke vidste.',
    DIRECT: 'Start uden indpakning. Bare fakta, ingen pynt.',
  };
  return descriptions[hookType];
}

// CTA type descriptions for the prompt
function getCTADescription(ctaType: CTAType): string {
  const descriptions: Record<CTAType, string> = {
    NONE: 'Slut med punktum. Ingen opfordring.',
    HIDDEN: 'Nævn muligheden i en bisætning. Subtilt.',
    SOFT: 'Afslut med "Kig forbi...", "Kom og sig hej".',
    VALUE: 'Giv en opskrift, et tip, eller noget værdifuldt.',
    SELL: 'Direkte booking-opfordring. Brug sjældent!',
  };
  return descriptions[ctaType];
}

interface VoiceInput {
  seed: string;
  imageContext: string;
  previousPost?: string;
  phase: Phase;
  hookType?: HookType;
  ctaType?: CTAType;
  dayNumber: number;
}

interface VoiceResult {
  success: boolean;
  caption?: string;
  error?: string;
}

export async function writeCaption(input: VoiceInput): Promise<VoiceResult> {
  try {
    const model = getProModel();

    const phaseStrategy = getPhaseStrategy(input.phase);

    // Build hook and CTA hints from Brain
    const hookHint = input.hookType ? `HOOK TIP: Prøv [HOOK: ${input.hookType}] - ` + getHookDescription(input.hookType) : '';
    const ctaHint = input.ctaType ? `CTA TIP: Brug [CTA: ${input.ctaType}] - ` + getCTADescription(input.ctaType) : '';

    // Build the task prompt
    const userPrompt = `
OUTPUT REQUIREMENTS (CRITICAL):
- Output ONLY the final caption text. Nothing else.
- NO preamble like "Here's the caption:" or "Draft:"
- NO alternatives or options to choose from
- NO explanations or notes
- NO markdown formatting (no **, no ##, no __)
- NO quotation marks around the text
- Just the raw caption text, ready to copy-paste directly into Facebook/Instagram

FORMATTING:
- Plain text with line breaks between paragraphs
- 0-4 emojis maximum, placed naturally
- 6-12 sentences total (give the text some substance)

TONE:
- Authentic Danish voice
- "sgu" very rarely (1 in 5-10 posts max)
- No marketing buzzwords

CURRENT PHASE:
${phaseStrategy}

${hookHint ? `${hookHint}\n` : ''}${ctaHint ? `${ctaHint}\n` : ''}

TASK: Write the caption for Day ${input.dayNumber}.

INPUTS:
- Content Seed: "${input.seed}"
- Visual Context: "${input.imageContext}"
- Previous Day's Post: "${input.previousPost || 'This is the first post.'}"

OUTPUT THE CAPTION NOW (raw text only, no wrapper):`;


    const result = await withRateLimit(async () => {
      return await model.generateContent([
        { text: VOICE_SYSTEM_PROMPT },
        { text: userPrompt },
      ]);
    });

    // Track token usage
    trackTokens('voice', result);

    const response = result.response;
    let caption = response.text();

    // Clean up any markdown that slipped through
    caption = cleanCaption(caption);

    // Validate forbidden words
    const forbidden = checkForbiddenWords(caption);
    if (forbidden.length > 0) {
      console.warn('Caption contains forbidden words:', forbidden);
      caption = fixForbiddenWords(caption);
    }

    return {
      success: true,
      caption,
    };
  } catch (error) {
    console.error('Voice caption failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function cleanCaption(text: string): string {
  let cleaned = text
    // Remove any preamble lines like "Here's the caption:" or "Caption:"
    .replace(/^(Here'?s?\s*(the\s*)?(caption|post|text|draft)[:\s]*\n?)/i, '')
    .replace(/^(Caption|Post|Draft|Option\s*\d*)[:\s]*\n?/gim, '')
    // Remove "Alternative:" or "Option 1/2/3:" style prefixes
    .replace(/^(Alternative|Option|Version)\s*\d*[:\s]*/gim, '')
    // Remove wrapping quotes
    .replace(/^["']|["']$/g, '')
    // Remove markdown bold
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    // Remove markdown italic
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove markdown headers
    .replace(/^#+\s+/gm, '')
    // Remove em-dashes
    .replace(/—/g, ' - ')
    .replace(/–/g, ' - ')
    // Remove any trailing notes like "Note:" or explanations
    .replace(/\n\n(Note|PS|P\.S\.|NB|Bemærk)[:\s].*/gis, '')
    // Clean up extra whitespace but preserve paragraph breaks
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // If text still starts with a label/prefix after first line, remove first line
  const firstLine = cleaned.split('\n')[0];
  if (firstLine && /^(dag|day|post|caption|option|version)\s*\d*[:\s]/i.test(firstLine)) {
    cleaned = cleaned.substring(firstLine.length).trim();
  }

  return cleaned;
}

function checkForbiddenWords(text: string): string[] {
  const lower = text.toLowerCase();
  return BRAND_CONTEXT.forbiddenWords.filter((word) => lower.includes(word.toLowerCase()));
}

function fixForbiddenWords(text: string): string {
  const replacements: Record<string, string> = {
    lækker: 'god',
    lækre: 'gode',
    lækkert: 'godt',
    fedmefuld: 'fyldig',
    mundvandsdrivende: 'appetitlig',
    udsøgt: 'fin',
    ypperlig: 'god',
    magisk: 'speciel',
    vidunderlig: 'dejlig',
    velsmagende: 'god',
    smagsoplevelse: 'smag',
    verdensklasse: 'rigtig god',
    'gastronomisk rejse': 'madoplevelse',
    forkælelse: 'noget godt',
    'forkæl dig selv': 'gør dig selv en tjeneste',
    eksklusiv: 'særlig',
    eksklusive: 'særlige',
    perfekt: 'rigtig god',
    fantastisk: 'virkelig god',
    unik: 'anderledes',
    unikt: 'anderledes',
    kulinarisk: 'gastronomisk',
  };

  let result = text;
  for (const [forbidden, replacement] of Object.entries(replacements)) {
    const regex = new RegExp(forbidden, 'gi');
    result = result.replace(regex, replacement);
  }
  return result;
}

// Write all captions sequentially
export async function writeAllCaptions(
  plans: Array<{
    dayNumber: number;
    seed: string;
    imageContext: string;
    hookType?: HookType;
    ctaType?: CTAType;
  }>,
  phase: Phase,
  onProgress?: (current: number, total: number, caption: string) => void
): Promise<{ captions: Map<number, string>; errors: Array<{ day: number; error: string }> }> {
  const captions = new Map<number, string>();
  const errors: Array<{ day: number; error: string }> = [];
  let previousPost: string | undefined;
  let completed = 0;

  for (const plan of plans) {
    const result = await writeCaption({
      seed: plan.seed,
      imageContext: plan.imageContext,
      previousPost,
      phase,
      hookType: plan.hookType,
      ctaType: plan.ctaType,
      dayNumber: plan.dayNumber,
    });

    completed++;

    if (result.success && result.caption) {
      captions.set(plan.dayNumber, result.caption);
      previousPost = result.caption;
      onProgress?.(completed, plans.length, result.caption);
    } else {
      errors.push({ day: plan.dayNumber, error: result.error || 'Unknown error' });
      // Use placeholder
      const placeholder = `[Dag ${plan.dayNumber}] Caption generering fejlede. Seed: ${plan.seed}`;
      captions.set(plan.dayNumber, placeholder);
    }

    // Small delay between requests to avoid rate limits
    if (completed < plans.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return { captions, errors };
}
