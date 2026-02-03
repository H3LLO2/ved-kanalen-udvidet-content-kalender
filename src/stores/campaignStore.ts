import { create } from 'zustand';
import type { Campaign, Phase, BrandContext, Strategy } from '../types';
import {
  saveCampaign,
  getCampaign,
  getAllCampaigns,
  deleteCampaign as dbDeleteCampaign,
  generateId,
} from '../lib/database';

interface CampaignState {
  campaigns: Campaign[];
  currentCampaign: Campaign | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadCampaigns: () => Promise<void>;
  createCampaign: (name: string, phase: Phase) => Promise<Campaign>;
  selectCampaign: (id: string) => Promise<void>;
  updateCampaign: (updates: Partial<Campaign>) => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;
  advancePhase: () => Promise<void>;
}

// Default brand context for Ved Kanalen
const defaultBrandContext: BrandContext = {
  name: 'Ved Kanalen',
  location: 'Kanalbyen, Fredericia',
  concept: 'Casual bistro/Klubhus - et sted der bare er',
  owners: ['Malte', 'Per'],
  tone: 'Jordnær, autentisk, ingen marketing-bullshit',
  manifest: `Vi lover ikke at være alt for alle. Men vi lover at være et sted.
Et sted hvor maden er ærlig, servicen er varm, og stemningen er afslappet.
Kom som du er. Bliv så længe du vil.`,
  forbiddenWords: [
    'lækker',
    'lækre',
    'gastronomisk rejse',
    'forkælelse',
    'eksklusiv',
    'mundvandsdrivende',
    'udsøgt',
    'magisk',
    'kulinarisk',
    'gourmet',
  ],
  preferredWords: ['godt', 'sprødt', 'mørt', 'ærligt', 'sgu', 'jo', 'lige', 'egentlig', 'altså'],
};

const defaultStrategy: Strategy = {
  totalDays: 90,
  postsPerDay: 1,
  platforms: ['instagram', 'facebook'],
  narrativeArc: 'Fra transformation til etablering',
  currentDay: 1,
};

export const useCampaignStore = create<CampaignState>((set, get) => ({
  campaigns: [],
  currentCampaign: null,
  isLoading: false,
  error: null,

  loadCampaigns: async () => {
    set({ isLoading: true, error: null });
    try {
      const campaigns = await getAllCampaigns();
      set({ campaigns, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  createCampaign: async (name: string, phase: Phase) => {
    const campaign: Campaign = {
      id: generateId(),
      name,
      brandContext: defaultBrandContext,
      strategy: defaultStrategy,
      currentPhase: phase,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await saveCampaign(campaign);
    set((state) => ({
      campaigns: [...state.campaigns, campaign],
      currentCampaign: campaign,
    }));

    return campaign;
  },

  selectCampaign: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const campaign = await getCampaign(id);
      if (campaign) {
        set({ currentCampaign: campaign, isLoading: false });
      } else {
        set({ error: 'Campaign not found', isLoading: false });
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  updateCampaign: async (updates: Partial<Campaign>) => {
    const { currentCampaign } = get();
    if (!currentCampaign) return;

    const updated: Campaign = {
      ...currentCampaign,
      ...updates,
      updatedAt: new Date(),
    };

    await saveCampaign(updated);
    set((state) => ({
      currentCampaign: updated,
      campaigns: state.campaigns.map((c) => (c.id === updated.id ? updated : c)),
    }));
  },

  deleteCampaign: async (id: string) => {
    await dbDeleteCampaign(id);
    set((state) => ({
      campaigns: state.campaigns.filter((c) => c.id !== id),
      currentCampaign: state.currentCampaign?.id === id ? null : state.currentCampaign,
    }));
  },

  advancePhase: async () => {
    const { currentCampaign, updateCampaign } = get();
    if (!currentCampaign) return;

    const phaseOrder: Phase[] = ['TRANSITION_TEASE', 'GETTING_READY', 'LAUNCH', 'ESTABLISHMENT'];
    const currentIndex = phaseOrder.indexOf(currentCampaign.currentPhase);
    const nextPhase = phaseOrder[Math.min(currentIndex + 1, phaseOrder.length - 1)];

    await updateCampaign({ currentPhase: nextPhase });
  },
}));
