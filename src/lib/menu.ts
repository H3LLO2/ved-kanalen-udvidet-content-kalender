// Ved Kanalen Menu
// Used by The Brain for post-opening content strategy

export const MENU = {
  // Lunch only (11:30-15:00)
  frokost: [
    { name: 'Rødspættefilet', price: 80, desc: 'Sprødstegt fisk, hjemmerørt remoulade, citron & urter' },
    { name: 'Roastbeef', price: 80, desc: 'Ristede løg, pickles, peberrod & estragonmayo' },
    { name: 'Æg & rejer', price: 80, desc: 'Håndpillede rejer, citronmayo, dild & karse' },
    { name: 'Rødbede og gedeost', price: 80, desc: 'Variation af rødbede, gedeostcreme, balsamico og urter' },
    { name: 'Fiskefrikadeller', price: 80, desc: 'Hjemmelavet fiskefrikadeller, smør, hjemmerørt remoulade og rugbrød' },
  ],

  // Starters
  forretter: [
    { name: 'Carpaccio af pastinak', price: 70, desc: 'Grillet pastinak, hjemmelavet pesto, syrlig salat og revet vesterhavsost' },
    { name: 'Pocheret og friteret æg', price: 75, desc: 'Æg, svampe a la creme, urter og ristet brød' },
    { name: 'Rørt tatar af okse', price: 100, desc: 'Kapers, estragon, sennep & ristet brød' },
    { name: 'Hjemmelavet nuggets med emulsion', price: 79, desc: 'Syltede løg, cornichoner & vinterurter' },
  ],

  // Main courses
  hovedretter: [
    { name: 'Smørbagt torsk eller kuller', price: 135, desc: 'Sauce blanquette med miso, porrer, spinat & rodfrugtspuré', note: 'efter fangst' },
    { name: 'Moules frites', price: 145, desc: 'Hvidvin, fløde & urter' },
    { name: 'Boeuf Bourguignon', price: 210, desc: 'Rødvin, bacon, svampe & kartoffelmos' },
    { name: 'Braiseret kalveskank', price: 210, desc: 'Glaserede rodfrugter, timian & kalvesky' },
    { name: 'Steak frites', price: 200, desc: 'Bearnaise eller pebersauce' },
    { name: 'Løg tærte', price: 120, desc: 'Karamelliserede skallotteløg & creme fraîche' },
    { name: 'Burgeren', price: 180, desc: '200gr oksekød, røget vesterhavsost, salat, syltede agurker, bacon og løg kompot, sprøde løg, pommes frites' },
    { name: 'Stegt grønt', price: 80, desc: 'Let ostecreme med peberrod, stegte grøntsager, chiliolie, sprød grønkål og jordskokchips' },
    { name: 'Salaten', price: 80, desc: 'Stegt salat, syltede svampe, bagte jordskokker, citrus vinagrette og vesterhavsost' },
    { name: 'Fish & chips', price: 135, desc: 'Friteret frisk fisk, pommes frites, sauce tartare og mashed peas' },
  ],

  // Desserts
  desserter: [
    { name: 'Dagens kage', price: 65, desc: 'Spørg personalet om dagens friskbagte kage' },
    { name: 'Affogato', price: 65, desc: 'Vaniljeis med friskbrygget espresso' },
    { name: 'Havtorn-crumble', price: 75, desc: 'Syrlige havtorn, smuldrekage & flødeskum' },
    { name: 'Hjemmelavet is', price: 65, desc: 'Spørg personalet om vores udvalg' },
    { name: 'Dagens oste', price: null, desc: 'Tilbehør efter sæson' },
  ],

  // Bar snacks
  barSnacks: [
    { name: 'Sprød grønkål', price: 20, desc: 'Friteret grønkål, let salt & citron' },
    { name: 'Kartoffelmos-kroketter', price: 40, desc: 'Sprøde panerede kroketter, bearnaise-emulsion' },
    { name: 'Ristet brød & pisket smør', price: 25, desc: 'Grillet surdejsbrød, pisket smør med urter' },
    { name: 'Sprøde fiskeskind', price: 30, desc: 'Friterede fiskeskind, urtesalt & citron' },
    { name: 'Rugbrødschips med dip', price: 20, desc: 'Sprøde rugbrødschips, sauce tartare eller estragonmayo' },
  ],
};

// Format menu for AI context (used in post-opening phases)
export function getMenuContext(): string {
  return `
MENUOVERSIGT - VED KANALEN

FROKOST (11:30-15:00):
${MENU.frokost.map(d => `- ${d.name} (${d.price}kr): ${d.desc}`).join('\n')}

FORRETTER:
${MENU.forretter.map(d => `- ${d.name} (${d.price}kr): ${d.desc}`).join('\n')}

HOVEDRETTER:
${MENU.hovedretter.map(d => `- ${d.name} (${d.price}kr): ${d.desc}${d.note ? ` [${d.note}]` : ''}`).join('\n')}

DESSERTER:
${MENU.desserter.map(d => `- ${d.name}${d.price ? ` (${d.price}kr)` : ''}: ${d.desc}`).join('\n')}

BAR SNACKS:
${MENU.barSnacks.map(d => `- ${d.name} (${d.price}kr): ${d.desc}`).join('\n')}

NØGLEPUNKTER:
- Priser er almindeligt bistro-leje (80-210kr for hovedretter)
- Alt er hjemmelavet - fiskefrikadeller, remoulade, nuggets, is
- Comfort food med håndværk: braiserede retter, langtidstilberedt
- Fleksibelt koncept: én ret, snack + vin, eller fuld middag
- Fisk efter dagens fangst - autentisk og ærligt
`.trim();
}

// Get signature dishes for content highlighting
export function getSignatureDishes(): string[] {
  return [
    'Boeuf Bourguignon - den klassiske franske simreret',
    'Braiseret kalveskank - tid som ingrediens',
    'Hjemmelavet fiskefrikadeller - dansk klassiker',
    'Moules frites - kanalen kalder',
    'Smørbagt torsk - efter dagens fangst',
  ];
}
