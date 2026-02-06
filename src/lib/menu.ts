/**
 * Ved Kanalen Menu - Updated February 2026
 * Used by Brain and Voice for content context
 */

export const MENU = {
  frokost: {
    servering: "11.30-15.00",
    retter: [
      { navn: "Rødspættefilet", pris: 80, beskrivelse: "Sprødstegt fisk, hjemmerørt remoulade, citron & urter" },
      { navn: "Roastbeef", pris: 80, beskrivelse: "Ristede løg, pickles, peberrod & estragonmayo" },
      { navn: "Æg & rejer", pris: 80, beskrivelse: "Håndpillede rejer, citronmayo, dild & karse" },
      { navn: "Rødbede og gedeost", pris: 80, beskrivelse: "Variation af rødbede, gedeostcreme, balsamico og urter" },
      { navn: "Fiskefrikadeller", pris: 80, beskrivelse: "Hjemmelavet fiskefrikadeller, smør, hjemmerørt remoulade og rugbrød" },
    ],
  },
  forretter: [
    { navn: "Carpaccio af pastinak", pris: 70, beskrivelse: "Grillet pastinak, hjemmelavet pesto, syrlig salat og revet vesterhavsost" },
    { navn: "Pocheret og friteret æg", pris: 75, beskrivelse: "Æg, svampe a la creme, urter og ristet brød" },
    { navn: "Rørt tatar af okse", pris: 100, beskrivelse: "Kapers, estragon, sennep & ristet brød" },
    { navn: "Rødbede og gedeost", pris: 80, beskrivelse: "Variation af rødbede, gedeostcreme, balsamico og urter" },
    { navn: "Hjemmelavet nuggets med emulsion", pris: 79, beskrivelse: "Syltede løg, cornichoner & vinterurter" },
  ],
  hovedretter: [
    { navn: "Smørbagt torsk eller kuller", pris: 135, beskrivelse: "Sauce blanquette med miso, porrer, spinat & rodfrugtspuré (efter fangst)" },
    { navn: "Moules frites", pris: 145, beskrivelse: "Hvidvin, fløde & urter" },
    { navn: "Boeuf Bourguignon", pris: 210, beskrivelse: "Rødvin, bacon, svampe & kartoffelmos" },
    { navn: "Braiseret kalveskank", pris: 210, beskrivelse: "Glaserede rodfrugter, timian & kalvesky" },
    { navn: "Steak frites", pris: 200, beskrivelse: "Bearnaise eller pebersauce" },
    { navn: "Løgtærte", pris: 120, beskrivelse: "Karamelliserede skalotteløg & cremefraîche" },
    { navn: "Burgeren", pris: 180, beskrivelse: "200 gr oksekød, røget vesterhavsost, salat, syltede agurker, bacon og løg kompot, sprøde løg, pommes frites" },
    { navn: "Stegt grønt", pris: 80, beskrivelse: "Let ostecreme med peberrod, stegte grøntsager, chiliolie, sprød grønkål og jordskokchips" },
    { navn: "Salaten", pris: 80, beskrivelse: "Stegt salat, syltede svampe, bagte jordskokker, citrus vinagrette og vesterhavsost" },
    { navn: "Fish & chips", pris: 135, beskrivelse: "Friteret frisk fisk, pommes frites, sauce tartare og mashed peas" },
  ],
  desserter: [
    { navn: "Dagens kage", pris: 65, beskrivelse: "Spørg personalet om dagens friskbagte kage" },
    { navn: "Affogato", pris: 65, beskrivelse: "Vaniljeis med friskbrygget espresso" },
    { navn: "Havtorn-crumble", pris: 75, beskrivelse: "Syrlige havtorn, smuldrekage & flødeskum" },
    { navn: "Hjemmelavet is", pris: 65, beskrivelse: "" },
    { navn: "Dagens oste", pris: 80, beskrivelse: "Tilbehør efter sæson" },
  ],
  barSnacks: [
    { navn: "Sprød grønkål", pris: 20, beskrivelse: "Friteret grønkål, let salt & citron" },
    { navn: "Kartoffelmos-kroketter", pris: 40, beskrivelse: "Sprøde panerede kroketter, bearnaise-emulsion" },
    { navn: "Ristet brød & pisket smør", pris: 25, beskrivelse: "Grillet surdejsbrød, pisket smør med urter" },
    { navn: "Sprød fiskeskind", pris: 30, beskrivelse: "Friterede fiskeskind, urtesalt & citron" },
    { navn: "Rugbrødschips med dip", pris: 20, beskrivelse: "Sprøde rugbrødschips, sauce tartare eller estragonmayo" },
  ],
};

/**
 * Get menu as formatted string for AI context
 */
export function getMenuContext(): string {
  const sections: string[] = [];
  
  // Frokost
  sections.push(`FROKOST (${MENU.frokost.servering}):`);
  for (const ret of MENU.frokost.retter) {
    sections.push(`- ${ret.navn} (${ret.pris} kr) - ${ret.beskrivelse}`);
  }
  
  // Forretter
  sections.push(`\nFORRETTER:`);
  for (const ret of MENU.forretter) {
    sections.push(`- ${ret.navn} (${ret.pris} kr) - ${ret.beskrivelse}`);
  }
  
  // Hovedretter
  sections.push(`\nHOVEDRETTER:`);
  for (const ret of MENU.hovedretter) {
    sections.push(`- ${ret.navn} (${ret.pris} kr) - ${ret.beskrivelse}`);
  }
  
  // Desserter
  sections.push(`\nDESSERTER:`);
  for (const ret of MENU.desserter) {
    sections.push(`- ${ret.navn} (${ret.pris} kr)${ret.beskrivelse ? ` - ${ret.beskrivelse}` : ''}`);
  }
  
  // Bar & Snacks
  sections.push(`\nBAR & SNACKS:`);
  for (const ret of MENU.barSnacks) {
    sections.push(`- ${ret.navn} (${ret.pris} kr) - ${ret.beskrivelse}`);
  }
  
  return sections.join('\n');
}

/**
 * Get a random dish for content inspiration
 */
export function getRandomDish(): { navn: string; pris: number; beskrivelse: string; kategori: string } {
  const allDishes = [
    ...MENU.frokost.retter.map(r => ({ ...r, kategori: 'Frokost' })),
    ...MENU.forretter.map(r => ({ ...r, kategori: 'Forret' })),
    ...MENU.hovedretter.map(r => ({ ...r, kategori: 'Hovedret' })),
    ...MENU.desserter.map(r => ({ ...r, kategori: 'Dessert' })),
    ...MENU.barSnacks.map(r => ({ ...r, kategori: 'Bar & Snacks' })),
  ];
  
  const randomIndex = Math.floor(Math.random() * allDishes.length);
  return allDishes[randomIndex] || { navn: 'Burgeren', pris: 180, beskrivelse: 'Default', kategori: 'Hovedret' };
}
