import type { JournalListEntry } from '../types/diaryEntry'

// TODO: mock data standing in for a real endpoint — GET /api/diary/today/
// only ever addresses today's entry (see api/diary.ts), so there is nothing
// to call yet for the archived list. Swap this out once the backend exposes
// reads for past diary entries.

/** 'YYYY-MM-DD' for the local calendar day, `daysAgo` days before `reference`. */
function isoDateDaysAgo(reference: Date, daysAgo: number): string {
  const date = new Date(reference)
  date.setDate(date.getDate() - daysAgo)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface MockEntrySeed {
  daysAgo: number
  savedAtTime: string
  entry: Omit<JournalListEntry, 'id' | 'date' | 'savedAt'>
}

const SEEDS: MockEntrySeed[] = [
  {
    daysAgo: 1,
    savedAtTime: '21:42',
    entry: {
      mood: 'bad',
      emotions: [
        { emotion: 'Lęk', intensity: 7 },
        { emotion: 'Stres', intensity: 6 },
      ],
      energyLevel: 3,
      tensionLevel: 7,
      situationReaction: {
        trigger: 'Praca',
        triggerOther: '',
        situation: 'Trudna rozmowa z przełożonym o terminie projektu.',
        emotionNote: 'Poczułam narastający lęk i ucisk w gardle.',
        thought: 'Znowu wszystko schrzanię, nie nadążę.',
        behavior: 'Wyszłam na chwilę na korytarz, żeby się uspokoić.',
      },
      notes: 'Wieczorem trochę lepiej, pomogło spacer po pracy.',
      hasRiskyBehavior: false,
      riskyBehaviorNote: '',
    },
  },
  {
    daysAgo: 3,
    savedAtTime: '09:15',
    entry: {
      mood: 'very_good',
      emotions: [
        { emotion: 'Radość', intensity: 8 },
        { emotion: 'Spokój', intensity: null },
      ],
      energyLevel: 8,
      tensionLevel: 1,
      situationReaction: {
        trigger: 'Dom',
        triggerOther: '',
        situation: 'Spokojny poranek, śniadanie z rodziną.',
        emotionNote: 'Ciepło i wdzięczność.',
        thought: 'Dobrze mieć taki dzień.',
        behavior: 'Zaproponowałam wspólny wyjazd na weekend.',
      },
      notes: '',
      hasRiskyBehavior: false,
      riskyBehaviorNote: '',
    },
  },
  {
    daysAgo: 5,
    savedAtTime: '23:58',
    entry: {
      mood: 'very_bad',
      emotions: [
        { emotion: 'Bezradność', intensity: 9 },
        { emotion: 'Smutek', intensity: 8 },
        { emotion: 'Stres', intensity: 8 },
      ],
      energyLevel: 1,
      tensionLevel: 8,
      situationReaction: {
        trigger: 'Sam/sama w domu',
        triggerOther: '',
        situation: 'Zostałam sama na cały wieczór, długo rozmyślałam o rozstaniu.',
        emotionNote: 'Ogarnęła mnie ciężka, przytłaczająca rozpacz.',
        thought: 'Nic nigdy się nie zmieni, jestem sama.',
        behavior: 'Napisałam do przyjaciółki, żeby nie zostawać z tym samą.',
      },
      notes: 'Chciałam się zaciąć, ale zamiast tego zadzwoniłam do przyjaciółki.',
      hasRiskyBehavior: true,
      riskyBehaviorNote: 'Myśli o samookaleczeniu, bez działania.',
    },
  },
  {
    daysAgo: 8,
    savedAtTime: '18:20',
    entry: {
      mood: 'neutral',
      emotions: [
        { emotion: 'Frustracja', intensity: 4 },
        { emotion: 'Stres', intensity: 3 },
      ],
      energyLevel: 5,
      tensionLevel: 4,
      situationReaction: {
        trigger: 'Transport',
        triggerOther: '',
        situation: 'Spóźniony autobus, czekanie w deszczu.',
        emotionNote: 'Drobna irytacja, nic wielkiego.',
        thought: 'Typowy dzień, nic z tym nie zrobię.',
        behavior: 'Wsiadłam do kolejnego autobusu, zadzwoniłam do mamy.',
      },
      notes: '',
      hasRiskyBehavior: false,
      riskyBehaviorNote: '',
    },
  },
  {
    daysAgo: 12,
    savedAtTime: '13:05',
    entry: {
      mood: 'good',
      emotions: [
        { emotion: 'Radość', intensity: 6 },
        { emotion: 'Wstyd', intensity: 2 },
      ],
      energyLevel: 7,
      tensionLevel: 2,
      situationReaction: {
        trigger: 'Uczelnia',
        triggerOther: '',
        situation: 'Dobrze wypadła prezentacja na zajęciach.',
        emotionNote: 'Zadowolenie, ale też lekkie zawstydzenie po pochwale na głos.',
        thought: 'Chyba naprawdę mi się udało.',
        behavior: 'Podziękowałam i wróciłam na swoje miejsce.',
      },
      notes: 'Miły dzień, warto to zapamiętać.',
      hasRiskyBehavior: false,
      riskyBehaviorNote: '',
    },
  },
]

/**
 * Builds the mock "Dzienniczki" list, dated relative to `today` so the demo data
 * always looks recent. Ids are derived from the offset (not the calendar date),
 * so Journals.tsx and JournalDetail.tsx agree on the same id for the same seed
 * without sharing any runtime state.
 */
export function buildMockJournalEntries(today: Date): JournalListEntry[] {
  return SEEDS.map(({ daysAgo, savedAtTime, entry }) => {
    const date = isoDateDaysAgo(today, daysAgo)
    return {
      id: `mock-${daysAgo}`,
      date,
      savedAt: `${date}T${savedAtTime}:00`,
      ...entry,
    }
  })
}
