// Ved Kanalen Content Calendar - Date & Scheduling System
// Produces exactly 90 days of content across phased batches

// Key dates
export const CALENDAR = {
  // Already posted
  lastPosted: new Date('2026-01-18'), // Sunday evening

  // Phase 1: Pre-opening (TRANSITION_TEASE + GETTING_READY)
  phase1Start: new Date('2026-01-20'), // Tuesday morning - first generated post
  dayBeforeOpening: new Date('2026-01-27'), // Monday
  openingDay: new Date('2026-01-28'), // Tuesday - LAUNCH
  dayAfterOpening: new Date('2026-01-29'), // Wednesday - look back on opening

  // Phase 2: Post-opening (ESTABLISHMENT begins)
  phase2Start: new Date('2026-01-30'), // Thursday
  phase1ImagesLastUntil: new Date('2026-02-10'), // Phase 1 images must cover until here
  newImagesArrive: new Date('2026-02-08'), // New batch arrives

  // Cycle info
  batchDuration: 30, // days per batch
  imageDeliveryInterval: 28, // new images every 28 days
  totalDays: 90, // exactly 90 days of content
};

// Fixed posting times per weekday - Ved Kanalen specific schedule
// These are the EXACT times to post on each day
export const FIXED_POSTING_TIMES: Record<number, string> = {
  0: '19:00', // Søndag
  1: '19:00', // Mandag
  2: '11:30', // Tirsdag
  3: '19:00', // Onsdag
  4: '11:30', // Torsdag
  5: '11:30', // Fredag
  6: '15:30', // Lørdag
};

// Posting times reference (for documentation/UI)
export const POSTING_TIMES = {
  // Fixed schedule per day
  schedule: {
    søndag: '19:00',
    mandag: '19:00',
    tirsdag: '11:30',
    onsdag: '19:00',
    torsdag: '11:30',
    fredag: '11:30',
    lørdag: '15:30',
  },

  // Best days ranked (for Danish food/restaurant content)
  bestDays: ['tuesday', 'wednesday', 'thursday', 'sunday', 'friday', 'saturday', 'monday'],

  // Avoid these times
  avoid: [
    { time: '06:00', reason: 'For tidligt - lav aktivitet' },
    { time: '23:00', reason: 'For sent - folk sover' },
    { time: '14:00', reason: 'Post-frokost dip' },
  ],
};

// Get optimal posting time for a specific date - uses fixed schedule
export function getOptimalPostingTime(date: Date): { time: string; reason: string } {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  const time = FIXED_POSTING_TIMES[dayOfWeek] || '19:00';
  
  const dayNames = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
  const dayName = dayNames[dayOfWeek] || 'dag';
  
  return { 
    time, 
    reason: `Fast ${dayName}-tidspunkt` 
  };
}

// Get posting time recommendation string for Brain
export function getPostingTimeGuidance(): string {
  return `
FASTE POSTING-TIDER (Ved Kanalen schedule):

| Dag      | Tid   |
|----------|-------|
| Søndag   | 19:00 |
| Mandag   | 19:00 |
| Tirsdag  | 11:30 |
| Onsdag   | 19:00 |
| Torsdag  | 11:30 |
| Fredag   | 11:30 |
| Lørdag   | 15:30 |

BRUG PRÆCIS DISSE TIDER - de er faste for hver ugedag.
`.trim();
}

// Calculate actual date from day number
export function getDayDate(dayNumber: number): Date {
  const startDate = new Date(CALENDAR.phase1Start);
  const result = new Date(startDate);
  result.setDate(startDate.getDate() + dayNumber - 1);
  return result;
}

// Format date in Danish
export function formatDateDanish(date: Date): string {
  const days = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
  const months = ['januar', 'februar', 'marts', 'april', 'maj', 'juni',
    'juli', 'august', 'september', 'oktober', 'november', 'december'];

  const dayName = days[date.getDay()];
  const dayNum = date.getDate();
  const monthName = months[date.getMonth()];

  return `${dayName} d. ${dayNum}. ${monthName}`;
}

// Get phase for a specific day number
export function getPhaseForDay(dayNumber: number): 'TRANSITION_TEASE' | 'GETTING_READY' | 'LAUNCH' | 'ESTABLISHMENT' {
  const date = getDayDate(dayNumber);

  if (date < CALENDAR.dayBeforeOpening) {
    return 'TRANSITION_TEASE';
  } else if (date < CALENDAR.openingDay) {
    return 'GETTING_READY';
  } else if (date <= CALENDAR.dayAfterOpening) {
    return 'LAUNCH';
  } else {
    return 'ESTABLISHMENT';
  }
}

// Check if date is a milestone
export function getMilestone(date: Date): string | null {
  const dateStr = date.toISOString().split('T')[0];

  if (dateStr === CALENDAR.dayBeforeOpening.toISOString().split('T')[0]) {
    return 'DAGEN FØR ÅBNING';
  }
  if (dateStr === CALENDAR.openingDay.toISOString().split('T')[0]) {
    return 'ÅBNINGSDAG';
  }
  if (dateStr === CALENDAR.dayAfterOpening.toISOString().split('T')[0]) {
    return 'DAGEN EFTER ÅBNING - TILBAGEBLIK';
  }

  return null;
}

// Calculate how many days of content we need from current batch
export function calculateBatchDays(
  batchNumber: 1 | 2 | 3,
  _totalImages: number // Used for future image-per-day calculations
): { days: number; startDay: number; endDay: number; note: string; dateRange: string } {
  switch (batchNumber) {
    case 1:
      // Jan 20 - Jan 27 = 8 days (rebuilding phase only)
      // User handles opening day (Jan 28) and day after (Jan 29) manually
      return {
        days: 8,
        startDay: 1,
        endDay: 8,
        dateRange: '20. - 27. januar',
        note: 'Ombygningsfasen. Åbningsdag laves manuelt.',
      };
    case 2:
      // Jan 30 - Feb 8 = 10 days (new images arrive Jan 29)
      return {
        days: 10,
        startDay: 9,
        endDay: 18,
        dateRange: '30. jan - 8. feb',
        note: 'Første uge efter åbning.',
      };
    case 3:
      // Feb 9 onwards - adjust as needed
      return {
        days: 14,
        startDay: 19,
        endDay: 32,
        dateRange: '9. - 22. feb',
        note: 'Etablering og hverdagsrutiner.',
      };
  }
}
