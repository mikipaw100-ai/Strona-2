import { Doctor } from './types';

// Helper to get formatted date string for the next few days in Poland (YYYY-MM-DD)
export function getFutureDateString(daysAhead: number): string {
  const d = new Date('2026-05-22T19:01:56Z'); // Base on current ISO date
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
}

// Helper to dynamically calculate stable future days of the week for the calendar
export function getNextDayOfWeekString(targetDay: number): string {
  // targetDay: 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday
  const today = new Date('2026-05-22T19:01:56Z'); // Stable base date matching context
  const resultDate = new Date(today);
  const currentDay = today.getUTCDay();
  
  let daysToAdd = targetDay - currentDay;
  if (daysToAdd <= 0) {
    daysToAdd += 7;
  }
  resultDate.setUTCDate(today.getUTCDate() + daysToAdd);
  return resultDate.toISOString().split('T')[0];
}

export const DOCTORS: Doctor[] = [
  {
    id: 'mgr-noemi-krauze-piwowar',
    name: 'mgr Noemi Krauze-Piwowar',
    title: 'Psycholog / Analityk Zachowania / Psychoterapeuta',
    description: 'Indywidualna psychoterapia młodzieży i dorosłych, profesjonalna analiza zachowania, wsparcie w kryzysach emocjonalnych, terapia trudności relacyjnych, lęków oraz obniżonego nastroju w nurcie behawioralnym i humanistycznym.',
    price: 210,
    rating: 5.0,
    reviewsCount: 184,
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=256&auto=format&fit=crop',
    specializations: ['Analiza Zachowania', 'Psychoterapia', 'Rozwój osobisty', 'Wsparcie kryzysowe'],
    languages: ['Polski', 'Angielski'],
    slots: {
      [getNextDayOfWeekString(3)]: ['14:00', '15:00', '16:00', '17:00', '18:00'], // Środa (Wed) from 14:00 to 18:00
      [getNextDayOfWeekString(4)]: ['17:00', '18:00', '19:00'],                  // Czwartek (Thu) from 17:00 to 19:00
      [getNextDayOfWeekString(5)]: ['16:00', '17:00', '18:00', '19:00'],          // Piątek (Fri) from 16:00 to 19:00
    }
  }
];

export const CLIENT_REVIEWS = [
  {
    id: 'rev-1',
    patientName: 'Marta S.',
    rating: 5,
    text: 'Pani Noemi pomogła mi przejść przez niezwykle trudny kryzys zawodowy i życiowy. Pełen profesjonalizm, ogromna cierpliwość i ciepło podczas każdego spotkania.',
    date: '12-05-2026'
  },
  {
    id: 'rev-2',
    patientName: 'Paweł K.',
    rating: 5,
    text: 'Wspaniała specjalistka. Dzięki spotkaniom z panią Noemi zrozumiałem mechanizmy swoich reakcji i nauczyłem się konstruktywnie radzić sobie z lękiem.',
    date: '08-05-2026'
  },
  {
    id: 'rev-3',
    patientName: 'Katarzyna L.',
    rating: 5,
    text: 'Niezwykle profesjonalne podejście. Długo szukałam terapeuty, przy którym czułabym się tak bezpiecznie i u siebie. Centrum Analizy Zachowania to miejsce godne polecenia!',
    date: '30-04-2026'
  }
];
