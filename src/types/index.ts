// ============================================================================
// Core Domain Types
// ============================================================================

export interface Campaign {
  id: string;
  name: string;
  brandContext: BrandContext;
  strategy: Strategy;
  currentPhase: Phase;
  createdAt: Date;
  updatedAt: Date;
}

export interface BrandContext {
  name: string;
  location: string;
  concept: string;
  owners: string[];
  tone: string;
  manifest: string;
  forbiddenWords: string[];
  preferredWords: string[];
}

export interface Strategy {
  totalDays: number;
  postsPerDay: number;
  platforms: Platform[];
  narrativeArc: string;
  currentDay: number;
}

export type Platform = 'instagram' | 'facebook';

export type Phase =
  | 'TRANSITION_TEASE'    // Days 1-15
  | 'GETTING_READY'       // Days 16-30
  | 'LAUNCH'              // Days 30-37
  | 'ESTABLISHMENT';      // Days 37-90

// ============================================================================
// Image Types
// ============================================================================

export interface UploadedImage {
  id: string;
  campaignId: string;
  file: File;
  previewUrl: string;    // Object URL for display
  storagePath?: string;  // Supabase storage path
  thumbnailPath?: string;
  analysis?: ImageAnalysis;
  usedInPostId?: string;
  createdAt: Date;
}

export interface ImageAnalysis {
  id: string;
  content: string;       // What's in the image
  mood: string;          // Emotional tone
  strategicFit: string;  // Brand strategy alignment
  quality?: 'high' | 'medium' | 'low';
  suggestedGroupings?: string[];
}

// ============================================================================
// Post Types
// ============================================================================

export interface Post {
  id: string;
  campaignId: string;
  dayNumber: number;
  caption: string;
  hashtags?: string[];   // Instagram hashtags
  postingTime: string;   // "HH:MM" format
  seed: string;          // Original content premise
  reasoning: string;     // AI's reasoning
  status: PostStatus;
  imageIds: string[];
  generatedGraphicPath?: string;
  scheduledFor?: Date;   // When scheduled to post via Meta API
  metaPostId?: string;   // ID from Meta after scheduling
  createdAt: Date;
  updatedAt: Date;
}

export type PostStatus = 'draft' | 'approved' | 'scheduled' | 'posted';

export interface PostSummary {
  id: string;
  dayNumber: number;
  captionSummary: string;  // Brief summary for context
  hookType: HookType;
  ctaType: CTAType;
}

// ============================================================================
// AI Agent Types
// ============================================================================

// The Eye (Vision Analysis)
export interface EyeInput {
  imageId: string;
  imageData: string;  // base64 or URL
}

export interface EyeOutput {
  id: string;
  content: string;
  mood: string;
  strategicFit: string;
}

// The Brain (Strategic Planner)
export interface BrainInput {
  imageAnalyses: EyeOutput[];
  brandManifest: string;
  currentPhase: Phase;
  previousPosts: PostSummary[];
  imageCount: number;
}

export interface BrainOutput {
  thoughts: string;
  plan: DayPlan[];
}

export interface DayPlan {
  day: number;
  imageIds: string[];
  seed: string;
  reasoning: string;
  time: string;
  hookType?: HookType;  // Brain suggests this for variation
  ctaType?: CTAType;    // Brain suggests this based on phase
  graphic?: GraphicRequest | null;
}

export interface GraphicRequest {
  shouldGenerate: boolean;
  concept: string;
  headline?: string;
  subtext?: string;
  style: string;
  reasoning: string;
}

// The Voice (Copywriter)
export interface VoiceInput {
  seed: string;
  imageContext: string;
  previousPost?: string;
  phase: Phase;
  hookType?: HookType;
  ctaType?: CTAType;
}

export type HookType =
  | 'EMOTIONAL'      // Feelings, memories
  | 'CONTROVERSIAL'  // Sharp opinion
  | 'HUMOROUS'       // Self-deprecating, chaos
  | 'INFORMATIVE'    // Nerdy knowledge
  | 'DIRECT';        // Just facts

export type CTAType =
  | 'NONE'    // Just end with period
  | 'HIDDEN'  // Mention possibility in passing
  | 'SOFT'    // "Drop by..."
  | 'VALUE'   // Recipe/tip
  | 'SELL';   // Direct booking (rare)

export type EstablishmentSegment = 1 | 2 | 3;

// The Designer (Graphics)
export interface DesignerInput {
  concept: string;
  headline?: string;
  subtext?: string;
  style: string;
  brandColors?: string[];
}

export interface DesignerOutput {
  imageUrl: string;
  resolution: string;
}

// ============================================================================
// UI State Types
// ============================================================================

export interface GenerationProgress {
  stage: GenerationStage;
  current: number;
  total: number;
  message: string;
}

export type GenerationStage =
  | 'idle'
  | 'uploading'
  | 'analyzing'
  | 'planning'
  | 'generating-graphics'
  | 'writing'
  | 'complete'
  | 'error';

export interface AppError {
  code: string;
  message: string;
  details?: string;
  recoverable: boolean;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: AppError;
}

// ============================================================================
// Menu Exempt Types
// ============================================================================

export interface MenuExempt {
  id: string;
  campaignId: string;
  description: string;          // The pasted menu description
  images: MenuExemptImage[];    // Generated images (2 per description)
  createdAt: Date;
  updatedAt: Date;
}

export interface MenuExemptImage {
  id: string;
  blob: Blob;
  description: string;          // AI-generated description of the image
  costUsd: number;              // Cost in USD for generating this image
  createdAt: Date;
}

// ============================================================================
// Event Graphics Types
// ============================================================================

export interface EventGraphicsPost {
  id: string;
  campaignId: string;
  postText: string;             // The post text/caption
  eventContext: string;         // Context about the event
  images: EventGraphicImage[];  // Generated images (5 per post)
  createdAt: Date;
  updatedAt: Date;
}

export interface EventGraphicImage {
  id: string;
  blob: Blob;
  style: string;                // Style/variation description
  costUsd: number;
  createdAt: Date;
}

// ============================================================================
// Flexible Graphics Types (adapts to any content)
// ============================================================================

export type FlexibleContentType = 'event' | 'menu' | 'information' | 'opening' | 'announcement' | 'general';

export interface FlexibleGraphicsPost {
  id: string;
  campaignId: string;
  inputText: string;            // The raw text input
  detectedType: FlexibleContentType;  // Auto-detected content type
  images: FlexibleGraphicImage[];     // Generated images (3 per input)
  createdAt: Date;
  updatedAt: Date;
}

export interface FlexibleGraphicImage {
  id: string;
  blob: Blob;
  style: string;                // Style/variation description
  costUsd: number;
  createdAt: Date;
}
