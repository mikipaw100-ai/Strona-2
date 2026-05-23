import React, { useState, useEffect } from 'react';
import { Doctor, Appointment } from './types';
import { DOCTORS, getFutureDateString } from './data';
import BookingModal from './components/BookingModal';
import ReviewList from './components/ReviewList';
import { 
  Heart, 
  Calendar, 
  Clock, 
  User, 
  Phone, 
  Mail, 
  CreditCard, 
  ShieldCheck, 
  MessageSquare, 
  Star, 
  FileText, 
  ChevronRight, 
  Check, 
  RefreshCw, 
  SlidersHorizontal,
  Search,
  BookOpen,
  DollarSign,
  HelpCircle,
  Activity,
  Send,
  Sparkles,
  Award,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  // Navigation tabs state
  const [activeTab, setActiveTab] = useState<'booking' | 'appointments' | 'about' | 'faq'>('booking');

  // Interactive filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSpecialization, setSelectedSpecialization] = useState('All');

  // Appointments database loaded from database in Express backend (Sanitized for slot availability check)
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(false);
  const [smsRefreshStates, setSmsRefreshStates] = useState<Record<string, boolean>>({});
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancellingStates, setCancellingStates] = useState<Record<string, boolean>>({});

  // Confidential personal appointments for the current user (Full details)
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);
  const [loadingMyAppts, setLoadingMyAppts] = useState(false);
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [lookupSuccessMsg, setLookupSuccessMsg] = useState('');

  // Active slot setup being drafted for booking modal trigger
  const [selectedDoctorForBooking, setSelectedDoctorForBooking] = useState<Doctor | null>(null);
  const [selectedDateForBooking, setSelectedDateForBooking] = useState('');
  const [selectedSlotForBooking, setSelectedSlotForBooking] = useState('');

  // Fetch appointments (sanitized slots for availability checkers)
  const fetchAppointments = async () => {
    setLoadingAppts(true);
    try {
      const res = await fetch('/api/appointments');
      if (res.ok) {
        const data = await res.json();
        setAppointments(data);
      }
    } catch (err) {
      console.error('Error fetching appointments:', err);
    } finally {
      setLoadingAppts(false);
    }
  };

  // Fetch patient's specific appointments securely
  const fetchMyAppointments = async (additionalPhoneOrEmail?: string) => {
    setLoadingMyAppts(true);
    setLookupError('');
    try {
      const localIdsString = localStorage.getItem('balance_my_appointment_ids') || '';
      const params = new URLSearchParams();
      
      if (localIdsString) {
        try {
          params.append('ids', JSON.parse(localIdsString).join(','));
        } catch (e) {
          localStorage.removeItem('balance_my_appointment_ids');
        }
      }
      
      if (additionalPhoneOrEmail) {
        const cleanQuery = additionalPhoneOrEmail.trim();
        if (cleanQuery.includes('@')) {
          params.append('email', cleanQuery);
        } else {
          params.append('phone', cleanQuery);
        }
      }

      // If we have no local IDs and no query parameter, we do not fetch anything to avoid leaking all
      if (!localIdsString && !additionalPhoneOrEmail) {
        setMyAppointments([]);
        setLoadingMyAppts(false);
        return;
      }

      const res = await fetch(`/api/appointments?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMyAppointments(data);

        // If lookup succeeded with a search query, automatically append found IDs to localStorage registry so they persist next time!
        if (additionalPhoneOrEmail) {
          if (data.length > 0) {
            let currentLocalIds: string[] = [];
            try {
              currentLocalIds = localIdsString ? JSON.parse(localIdsString) : [];
            } catch (e) {}
            const foundIds = data.map((appt: Appointment) => appt.id);
            const uniqueIds = Array.from(new Set([...currentLocalIds, ...foundIds]));
            localStorage.setItem('balance_my_appointment_ids', JSON.stringify(uniqueIds));
            setLookupSuccessMsg(`Sukces! Znaleźliśmy ${data.length} wizyt(ę/y) i przypisaliśmy je do tego urządzenia.`);
            setTimeout(() => setLookupSuccessMsg(''), 6000);
            setLookupQuery('');
          } else {
            setLookupError('Nie odnaleźliśmy żadnych aktywnych wizyt dla podanych danych. Upewnij się, że wpisujesz dokładnie ten sam numer telefonu lub adres e-mail, który podano w formularzu zapisu.');
          }
        }
      }
    } catch (err) {
      console.error('Error fetching secret appointments:', err);
    } finally {
      setLoadingMyAppts(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
    fetchMyAppointments();
  }, [activeTab]);

  // Specializations compiled dynamically from standard data
  const specList = ['All', ...Array.from(new Set(DOCTORS.flatMap(doc => doc.specializations)))];

  const filteredDoctors = DOCTORS.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          doc.specializations.some(s => s.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesSpec = selectedSpecialization === 'All' || 
                        doc.specializations.some(s => s.toLowerCase() === selectedSpecialization.toLowerCase());

    return matchesSearch && matchesSpec;
  });

  const handleBookingSuccess = (newAppt: Appointment) => {
    // Save new appointment ID to local storage securely
    try {
      const localIdsString = localStorage.getItem('balance_my_appointment_ids');
      const currentIds: string[] = localIdsString ? JSON.parse(localIdsString) : [];
      if (!currentIds.includes(newAppt.id)) {
        currentIds.push(newAppt.id);
        localStorage.setItem('balance_my_appointment_ids', JSON.stringify(currentIds));
      }
    } catch (err) {
      console.error('Error storing created ID to localStorage:', err);
    }

    // Refresh database listing 
    fetchAppointments();
    fetchMyAppointments();
    // Close booking modal
    setSelectedDoctorForBooking(null);
    // Move to the user's dashboard automatically so they verify SMS records immediately
    setActiveTab('appointments');
  };

  const handleManualSmsRetry = async (apptId: string) => {
    setSmsRefreshStates(prev => ({ ...prev, [apptId]: true }));
    try {
      const res = await fetch('/api/trigger-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: apptId })
      });
      if (res.ok) {
        await fetchAppointments();
        await fetchMyAppointments();
      }
    } catch (err) {
      console.error('Error triggering manual SMS:', err);
    } finally {
      setSmsRefreshStates(prev => ({ ...prev, [apptId]: false }));
    }
  };

  const handleCancelAppointment = async (apptId: string) => {
    setCancellingStates(prev => ({ ...prev, [apptId]: true }));
    try {
      const res = await fetch('/api/cancel-appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: apptId })
      });
      if (res.ok) {
        await fetchAppointments();
        await fetchMyAppointments();
        setConfirmCancelId(null);
      }
    } catch (err) {
      console.error('Error cancelling appointment:', err);
    } finally {
      setCancellingStates(prev => ({ ...prev, [apptId]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-stone-800 font-sans flex flex-col justify-between selection:bg-[#477267] selection:text-white">
      


      {/* COMPACT STYLISH LOGO HEADER */}
      <header className="sticky top-0 bg-[#FAF9F5]/90 backdrop-blur-md border-b border-stone-200/60 z-30 transition">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="text-left cursor-pointer flex items-center gap-3 select-none" onClick={() => setActiveTab('booking')}>
            {/* Elegant SVG Logo representation from user's image */}
            <div className="w-11 h-11 shrink-0 bg-white/50 p-1.5 rounded-full border border-stone-200/40 shadow-sm flex items-center justify-center">
              <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
                {/* Left Head Outline (Sage/Teal `#7FA99B`) */}
                <path d="M38,30 C30,30 25,35 25,48 C25,58 29,62 25,68 C22,72 25,75 29,75 C31,78 32,82 34,85" stroke="#7FA99B" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                {/* Right Head Outline (Beige/Gold `#CBB696`) */}
                <path d="M62,30 C70,30 75,35 75,48 C75,58 71,62 75,68 C78,72 75,75 71,75 C69,78 68,82 66,85" stroke="#CBB696" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                {/* Middle Psi & Tree structure in Gold `#BFAA80` */}
                <path d="M50,72 V50" stroke="#BFAA80" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M42,48 C42,60 58,60 58,48" stroke="#BFAA80" strokeWidth="3" strokeLinecap="round" />
                {/* Tree branches extending upwards */}
                <path d="M50,52 Q44,40 40,37" stroke="#BFAA80" strokeWidth="2" strokeLinecap="round" />
                <path d="M50,47 Q56,36 60,34" stroke="#BFAA80" strokeWidth="2" strokeLinecap="round" />
                {/* Colored Nodes (Thought Leaves) representative of the logo */}
                <circle cx="39" cy="36" r="3.5" fill="#7FA99B" />
                <circle cx="50" cy="30" r="3.5" fill="#CBB696" />
                <circle cx="61" cy="34" r="3" fill="#FAF4EE" stroke="#CBB696" strokeWidth="1" />
                <circle cx="43" cy="27" r="2.5" fill="#B9CFD7" />
                <circle cx="56" cy="25" r="3.5" fill="#7FA99B" />
              </svg>
            </div>
            
            <div className="flex flex-col">
              <span className="font-serif font-bold text-lg md:text-xl tracking-tight leading-none">
                <span className="text-[#CBB696]">Centrum</span> <span className="text-[#477267]">Analizy Zachowania</span>
              </span>
              <span className="text-[10px] md:text-xs font-serif italic text-stone-500 mt-1 font-semibold tracking-wide">
                mgr Noemi Krauze-Piwowar
              </span>
            </div>
          </div>

          {/* Nav pills */}
          <nav className="flex items-center flex-wrap gap-1.5 bg-stone-100 p-1.5 rounded-2xl border border-stone-200/40">
            <button
              onClick={() => setActiveTab('booking')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition tracking-wide ${
                activeTab === 'booking'
                  ? 'bg-[#477267] text-[#FFFDF4] shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
              }`}
            >
              Grafik Wizyt
            </button>
            <button
              onClick={() => setActiveTab('appointments')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition tracking-wide flex items-center gap-1.5 ${
                activeTab === 'appointments'
                  ? 'bg-[#477267] text-[#FFFDF4] shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
              }`}
            >
              Moje Wizyty & SMS
              {appointments.length > 0 && (
                <span className="inline-flex h-2 w-2 rounded-full bg-red-500 animate-ping" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('about')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition tracking-wide ${
                activeTab === 'about'
                  ? 'bg-[#477267] text-[#FFFDF4] shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
              }`}
            >
              O Gabinecie
            </button>
            <button
              onClick={() => setActiveTab('faq')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition tracking-wide ${
                activeTab === 'faq'
                  ? 'bg-[#477267] text-[#FFFDF4] shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
              }`}
            >
              Pomoc & FAQ
            </button>
          </nav>
        </div>
      </header>

      {/* MAIN VISUAL LAYOUT WORKSPACE */}
      <main className="flex-1 bg-gradient-to-b from-[#FFFDF6] via-[#FAF9F5] to-[#FAF9F5]">

        <AnimatePresence mode="wait">
          {activeTab === 'booking' && (
            <motion.div
              key="booking-tab"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
              className="max-w-6xl mx-auto px-6 py-8 md:py-12 space-y-12"
            >
              {/* BRAND HERO HIGHLIGHT */}
              <section className="bg-gradient-to-br from-[#FAF6F0] to-[#E8EFEA] rounded-3xl p-6 md:p-10 border border-stone-200/60 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8 shadow-sm">
                <div className="absolute top-0 right-0 w-96 h-96 bg-[#7FA99B]/10 rounded-full blur-3xl transform translate-x-24 -translate-y-12" />
                
                <div className="space-y-4 max-w-xl text-left relative z-10">
                  <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#477267]/10 text-[#477267] text-xs font-mono font-bold border border-[#477267]/10 uppercase tracking-widest">
                    <Award className="w-3.5 h-3.5" /> Prywatna Praktyka Terapeutyczna
                  </div>
                  <h1 className="text-3xl md:text-5xl font-serif font-bold text-[#477267]/90 tracking-tight leading-tight">
                    Odzyskaj życiową harmonię pod naszą opieką
                  </h1>
                  <p className="text-stone-600 text-sm md:text-base leading-relaxed font-light">
                    <strong>Centrum Analizy Zachowania</strong> to specjalistyczny gabinet psychoterapeutyczny prowadzony przez <strong>mgr Noemi Krauze-Piwowar</strong>. Oferujemy terapię opartą na zaufaniu, zintegrowane powiadomienia i <strong>przypomnienia SMS</strong> o wizytach oraz bezproblemowe płatności online.
                  </p>

                  <div className="flex flex-wrap items-center gap-2.5 pt-2">
                    <span className="flex items-center gap-1.5 text-xs text-stone-600 font-medium bg-white/70 border border-stone-200/50 p-1 px-3 rounded-xl shadow-sm font-mono">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Bezpieczne połączenie SSL
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-stone-600 font-medium bg-white/70 border border-stone-200/50 p-1 px-3 rounded-xl shadow-sm font-mono">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-600" /> Carrier SMS Reminders
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-stone-600 font-medium bg-white/70 border border-stone-200/50 p-1 px-3 rounded-xl shadow-sm font-mono">
                      <Activity className="w-3.5 h-3.5 text-red-650" /> Szybka Pomoc 48h
                    </span>
                  </div>
                </div>

                <div className="w-full md:w-80 bg-white border border-stone-200 shadow-xl rounded-3xl p-6 relative z-10 space-y-4 text-left">
                  <h3 className="text-md font-bold font-serif text-[#477267] flex items-center gap-1.5 border-b border-stone-100 pb-2">
                    <Calendar className="w-4 h-4 text-[#477267]" /> Jak umówić wizytę?
                  </h3>
                  <div className="space-y-3 text-xs text-stone-600">
                    <div className="flex gap-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#477267]/10 text-[#477267] font-bold font-mono text-[10px]">1</span>
                      <p>Wybierz specjalistę i naciśnij preferowaną godzinę w kalendarzu.</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#477267]/10 text-[#477267] font-bold font-mono text-[10px]">2</span>
                      <p>Wpisz swoje dane (telefon wymagany jest do przypomnień SMS).</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#477267]/10 text-[#477267] font-bold font-mono text-[10px]">3</span>
                      <p>Opłać rezerwację (karta/BLIK) lub opłać stacjonarnie.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* SEARCH ACTION BAR */}
              <section className="bg-white border border-stone-200/80 rounded-2xl p-5 flex flex-col md:flex-row gap-4 items-center justify-between">
                
                {/* Search Textbar */}
                <div className="relative w-full">
                  <span className="absolute inset-y-0 left-3 flex items-center text-stone-400">
                    <Search className="w-4.5 h-4.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Szukaj symptomu lub słowa kluczowego..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-[#FAF9F5] border border-stone-200 rounded-xl pl-10 pr-4 py-2 text-xs focus:outline-none focus:border-[#477267] transition shadow-sm"
                  />
                </div>

              </section>

              {/* INTERACTIVE DOCTOR DIRECTORY CARDS */}
              <section className="space-y-5">
                <div className="text-left border-b border-stone-200 pb-2">
                  <h2 className="text-xl font-bold font-serif text-[#477267]">Dostępni Specjaliści</h2>
                  <p className="text-xs text-stone-550 mt-1 leading-normal">Wybierz dowolny termin bezpośrednio z kalendarza, by rozpocząć procedurę zapisu.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {filteredDoctors.map((doc) => (
                    <div 
                      key={doc.id}
                      className="bg-white border border-stone-200 rounded-3xl p-5 md:p-6 flex flex-col justify-between hover:shadow-md hover:border-[#477267]/20 transition duration-300 relative group"
                    >
                      
                      <div className="flex flex-col sm:flex-row items-start gap-4 text-left">
                        {/* Avatar */}
                        <img 
                          src={doc.avatarUrl} 
                          alt={doc.name} 
                          className="w-16 h-16 rounded-3xl object-cover shrink-0 border border-stone-100/80" 
                        />
                        
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center flex-wrap gap-2 justify-between">
                            <h3 className="font-bold text-lg font-serif text-[#477267]">{doc.name}</h3>
                            <div className="flex items-center gap-1 bg-yellow-400/10 text-yellow-700 px-2 py-0.5 rounded-lg text-xs font-semibold">
                              <Star className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" />
                              <span>{doc.rating}</span>
                              <span className="text-[10px] text-stone-400">({doc.reviewsCount})</span>
                            </div>
                          </div>

                          <p className="text-xs text-[#477267] font-mono leading-none">{doc.title}</p>
                          <p className="text-xs text-stone-550 leading-relaxed line-clamp-2 pr-4">{doc.description}</p>
                          
                          {/* Specializations inline tag index */}
                          <div className="flex flex-wrap gap-1 pt-1 bg-transparent">
                            {doc.specializations.map((spec) => (
                              <span 
                                key={spec} 
                                className="px-2 py-0.5 bg-stone-100 text-stone-600 text-[10px] font-mono rounded"
                              >
                                {spec}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Interactive calendar timeline slider */}
                      <div className="mt-5 border-t border-stone-100 pt-4 space-y-3 text-left bg-transparent">
                        <span className="block text-[10px] uppercase tracking-wider font-semibold font-mono text-stone-400">
                          Rezerwacja terminu na najbliższe dni:
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {Object.keys(doc.slots).map((dateStr) => {
                            const availableHours = doc.slots[dateStr] || [];
                            
                            // Transform date into beautiful written Polish form like "Sobota 23.05"
                            const testDateObj = new Date(dateStr);
                            const localizedDay = testDateObj.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'numeric' });

                            return (
                              <div key={dateStr} className="p-2 bg-stone-50 rounded-xl border border-stone-100">
                                <span className="block text-[10px] font-bold text-[#477267] capitalize font-sans mb-1.5 text-center">
                                  {localizedDay}
                                </span>

                                <div className="space-y-1">
                                  {availableHours.map((slot) => {
                                    const isSlotBooked = appointments.some(appt => 
                                      appt.doctorId === doc.id && 
                                      appt.date === dateStr && 
                                      appt.timeSlot === slot && 
                                      appt.status !== 'cancelled'
                                    );

                                    return (
                                      <button
                                        key={slot}
                                        disabled={isSlotBooked}
                                        onClick={() => {
                                          setSelectedDoctorForBooking(doc);
                                          setSelectedDateForBooking(dateStr);
                                          setSelectedSlotForBooking(slot);
                                        }}
                                        className={`w-full py-1 rounded-lg text-[11px] font-semibold transition tracking-tight select-none text-center block border ${
                                          isSlotBooked
                                            ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed line-through'
                                            : 'bg-white border-stone-200/80 text-stone-700 hover:bg-[#477267] hover:text-white cursor-pointer'
                                        }`}
                                      >
                                        {isSlotBooked ? 'Zajęty' : slot}
                                      </button>
                                    );
                                  })}

                                  {availableHours.length === 0 && (
                                    <span className="text-[10px] text-stone-400 italic block text-center py-2">
                                      Brak wolnych slots
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Card utility section representing cost info */}
                      <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500 font-sans">
                        <span className="flex items-center gap-1">
                          Dotyczy wizyt lekarskich online / gabinet
                        </span>
                        <span className="font-bold text-stone-800 bg-stone-100 px-3 py-1 rounded-xl">
                          {doc.price} PLN / sesja
                        </span>
                      </div>

                    </div>
                  ))}

                  {filteredDoctors.length === 0 && (
                    <div className="col-span-1 lg:col-span-2 text-center py-12 bg-white border border-stone-200 rounded-3xl space-y-2">
                      <p className="text-stone-400 italic text-sm">Nie znaleziono specjalisty odpowiadającego kryteriom wyszukiwania.</p>
                      <button 
                        onClick={() => { setSearchTerm(''); setSelectedSpecialization('All'); }}
                        className="text-xs text-[#477267] hover:underline font-bold"
                      >
                        Wyczyść filtry i pokaż wszystkich
                      </button>
                    </div>
                  )}
                </div>

              </section>

              {/* DECORATIVE REVIEWS BLOCK */}
              <section className="space-y-6 pt-6 border-t border-stone-200/80">
                <div className="text-center space-y-1.5 max-w-lg mx-auto">
                  <span className="inline-block text-[10px] uppercase font-mono tracking-widest text-[#477267] bg-[#477267]/10 border border-[#477267]/20 rounded-md p-1 px-3">
                    Opinie Pacjentów
                  </span>
                  <h2 className="text-2xl font-serif font-bold text-[#477267] tracking-tight">
                    Zaufali nam pacjenci z całej Polski
                  </h2>
                </div>
                <ReviewList />
              </section>

            </motion.div>
          )}

          {activeTab === 'appointments' && (
            <motion.div
              key="appointments-tab"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
              className="max-w-6xl mx-auto px-6 py-8 md:py-12 space-y-8"
            >
              
              {/* BRAND HEADER BOARD */}
              <div className="bg-white border border-stone-200 shadow-sm rounded-3xl p-6 md:p-8 text-left space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold font-serif text-[#477267]">
                      Konto Pacjenta: Twoje Wizyty
                    </h1>
                    <p className="text-xs text-stone-550 mt-1">
                      Tutaj znajdziesz listę wszystkich zaplanowanych konsultacji w Centrum Analizy Zachowania oraz powiązane logi SMS.
                    </p>
                  </div>

                  <button
                    onClick={() => fetchMyAppointments()}
                    disabled={loadingMyAppts}
                    className="flex items-center gap-1.5 border border-stone-200 hover:border-[#477267] bg-[#FAF9F5] text-[#477267] hover:bg-[#477267]/5 select-none py-2 px-4 rounded-xl text-xs font-semibold cursor-pointer transition disabled:opacity-75"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingMyAppts ? 'animate-spin' : ''}`} />
                    Odśwież Listę
                  </button>
                </div>

                {/* ACCESS CONTROL & SECURE SEARCH LOOKUP */}
                <div className="p-5 bg-[#FAF9F5] border border-stone-200 rounded-2xl text-left space-y-3 shadow-sm">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold font-serif text-[#477267] flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" /> Ochrona Prywatności Pacjentów (RODO)
                    </h3>
                    <p className="text-[11.5px] text-stone-550 leading-relaxed">
                      Dla pełnego bezpieczeństwa, lista wizyt nie jest publicznie jawna. Domyślnie aplikacja wyświetla tylko wizyty zarezerwowane na **tym urządzeniu**. Jeśli korzystasz z innego laptopa, komputera lub telefonu, po prostu wpisz poniżej swój **numer telefonu** (np. `500600700`) lub **adres e-mail** użyty przy zapisie, by natychmiast załadować swoje terminy.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 max-w-lg pt-1">
                    <input
                      type="text"
                      placeholder="Wpisz swój telefon lub e-mail..."
                      value={lookupQuery}
                      onChange={(e) => {
                        setLookupQuery(e.target.value);
                        setLookupError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && lookupQuery.trim()) {
                          fetchMyAppointments(lookupQuery);
                        }
                      }}
                      className="flex-1 bg-white border border-stone-200 rounded-xl px-4.5 py-2.5 text-xs focus:outline-none focus:border-[#477267] transition"
                    />
                    <button
                      onClick={() => fetchMyAppointments(lookupQuery)}
                      disabled={loadingMyAppts || !lookupQuery.trim()}
                      className="bg-[#477267] hover:bg-[#34524a] text-white text-xs font-bold py-2.5 px-4 rounded-xl transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
                    >
                      {loadingMyAppts ? 'Szukanie...' : 'Pobierz moje wizyty'}
                    </button>
                  </div>

                  {lookupError && (
                    <p className="text-xs text-red-600 font-medium pt-1">{lookupError}</p>
                  )}

                  {lookupSuccessMsg && (
                    <p className="text-xs text-green-700 bg-green-50 border border-green-200 p-2.5 rounded-xl font-medium pt-1 inline-block">{lookupSuccessMsg}</p>
                  )}
                </div>

                {/* Info reminder instruction on how testing works */}
                <div className="p-4 bg-teal-50 border border-teal-200/50 rounded-2xl text-xs leading-relaxed text-teal-800 flex gap-2.5">
                  <MessageSquare className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-teal-900 block mb-0.5">Działanie Reminderów SMS (Operator GSM):</span>
                    Przetestuj proces! Jeśli podasz swój prawdziwy numer i wpiszesz klucze do pliku `.env`, Twilio prześle wiadomość na podany telefon! W przeciwnym razie system zasymuluje pełen log operacyjny GSM na serwerze i wyświetli go poniżej. Zapobiega to kosztownym testom i pozwala sprawdzić kod od razu.
                  </div>
                </div>

                {/* Table list */}
                {loadingMyAppts && myAppointments.length === 0 ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-[#477267] mx-auto mb-2" />
                    <p className="text-xs text-stone-400 font-mono font-medium">Autoryzacja i pobieranie Twoich wizyt z serwera...</p>
                  </div>
                ) : myAppointments.length === 0 ? (
                  <div className="text-center py-16 border-2 border-dashed border-stone-200 rounded-3xl space-y-4">
                     <p className="text-stone-450 italic text-sm">Nie znaleźliśmy jeszcze zaplanowanych wizyt dla tego komputera.</p>
                     <div className="flex justify-center gap-3">
                       <button
                         onClick={() => setActiveTab('booking')}
                         className="bg-[#477267] hover:bg-[#34524a] text-white select-none py-2 px-5 rounded-xl text-xs font-bold shadow transition tracking-wide cursor-pointer"
                       >
                         Zarezerwuj nową konsultację
                       </button>
                     </div>
                  </div>
                ) : (
                  <div className="space-y-4 bg-transparent pt-2">
                    {myAppointments.map((appt) => (
                      <div 
                        key={appt.id}
                        className="border border-stone-200 bg-stone-50/50 rounded-2xl overflow-hidden shadow-sm"
                      >
                        {/* Upper row summarizer */}
                        <div className="bg-white p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-stone-100">
                          <div className="text-left flex items-start gap-4">
                            <span className="w-10 h-10 rounded-full bg-[#477267]/10 text-[#477267] border border-[#477267]/20 flex items-center justify-center font-bold text-sm shrink-0 font-serif">
                              C
                            </span>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-bold text-sm text-[#477267]">{appt.doctorName}</span>
                                <span className="text-[10px] font-mono text-stone-400 bg-stone-100 p-0.5 px-2 rounded-full border border-stone-200">ID: {appt.id}</span>
                              </div>
                              
                              {/* Consultation details badge array */}
                              <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 text-xs text-stone-550 font-sans mt-1.5">
                                <span className="flex items-center gap-1 font-medium bg-[#477267]/5 p-0.5 px-2 rounded-md border border-[#477267]/10 text-[#477267] font-mono">
                                  <Calendar className="w-3.5 h-3.5" /> {appt.date}
                                </span>
                                <span className="flex items-center gap-1 font-medium bg-[#477267]/5 p-0.5 px-2 rounded-md border border-[#477267]/10 text-[#477267] font-mono">
                                  <Clock className="w-3.5 h-3.5" /> {appt.timeSlot}
                                </span>
                                <span className="flex items-center gap-1">
                                  <User className="w-3.5 h-3.5" /> Pacjent: {appt.patientName}
                                </span>
                                <span className="flex items-center gap-1 font-mono">
                                  <Phone className="w-3.5 h-3.5" /> {appt.patientPhone}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Action badges & state controls */}
                          <div className="flex flex-wrap items-center gap-3 self-stretch md:self-auto justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-stone-100">
                            <div>
                              {appt.status === 'confirmed' ? (
                                <span className="text-[10px] font-bold bg-[#477267]/10 text-[#477267] border border-[#477267]/20 px-3 py-1.5 rounded-full font-mono inline-block">
                                  POTWIERDZONA &amp; OPŁACONA
                                </span>
                              ) : appt.status === 'cancelled' ? (
                                <span className="text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-full font-mono inline-block animate-pulse">
                                  ANULOWANA (ZWRÓCONO ŚRODKI)
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-full font-mono inline-block animate-pulse">
                                  NIEOPŁACONA
                                </span>
                              )}
                            </div>

                            {appt.status !== 'cancelled' && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleManualSmsRetry(appt.id)}
                                  disabled={smsRefreshStates[appt.id]}
                                  className="text-xs text-[#477267] font-bold py-1.5 px-3.5 rounded-xl border border-stone-200 hover:border-[#477267] bg-white transition hover:bg-stone-50 cursor-pointer flex items-center gap-1.5"
                                  title="Wymuś wysłanie SMS przez bramkę"
                                >
                                  <Send className={`w-3.5 h-3.5 ${smsRefreshStates[appt.id] ? 'animate-spin' : ''}`} />
                                  Ponów SMS
                                </button>

                                {confirmCancelId === appt.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleCancelAppointment(appt.id)}
                                      disabled={cancellingStates[appt.id]}
                                      className="text-xs bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-3 rounded-xl transition cursor-pointer"
                                    >
                                      {cancellingStates[appt.id] ? 'Anulowanie...' : 'Tak, odwołaj'}
                                    </button>
                                    <button
                                      onClick={() => setConfirmCancelId(null)}
                                      className="text-xs text-stone-500 hover:text-stone-800 py-1.5 px-2 rounded-xl border border-stone-200 bg-white transition cursor-pointer"
                                    >
                                      Cofnij
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setConfirmCancelId(appt.id)}
                                    className="text-xs text-red-600 hover:text-white hover:bg-red-600 font-bold py-1.5 px-3.5 rounded-xl border border-red-200 hover:border-red-650 transition cursor-pointer"
                                  >
                                    Odwołaj wizytę
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Lower logs panel - detailing Twilio Carrier transactions */}
                        <div className="bg-[#FAF9F5] p-4 p-l-6 border-t border-stone-100/50">
                          <span className="block text-[10px] font-bold font-mono text-stone-400 uppercase tracking-widest mb-1.5">
                            Status wysyłki powiadomienia GSM:
                          </span>

                          <div className="bg-stone-900 text-stone-300 font-mono text-[11px] p-3 rounded-xl border border-stone-850 shadow-inner flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                            <div className="flex-1 space-y-1">
                              <span className="text-amber-300 font-semibold block uppercase text-[9px] tracking-wider">LOGI OPERATORA GSM (Twilio Server Output)</span>
                              <div className="text-stone-200 leading-relaxed pr-3 break-all">
                                {appt.smsLog || 'Brak danych wysyłkowych. System oczekuje na finalizację statusu.'}
                              </div>
                            </div>
                            
                            <div className="shrink-0 flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider bg-white/5 p-2 rounded-lg border border-white/5">
                              {appt.smsReminderSent ? (
                                <>
                                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-ping" />
                                  <span className="text-green-400 font-sans text-[10px]">Wysłano</span>
                                </>
                              ) : (
                                <>
                                  <span className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse" />
                                  <span className="text-red-400 font-sans text-[10px]">Brak wysyłki (Zatrzymaj)</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                      </div>
                    ))}
                  </div>
                )}
              </div>

            </motion.div>
          )}

          {activeTab === 'about' && (
            <motion.div
              key="about-tab"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
              className="max-w-4xl mx-auto px-6 py-8 md:py-12 space-y-12 text-left"
            >
              
              {/* STYLISH ABOUT CONTENT */}
              <section className="space-y-6">
                <span className="text-[10px] font-bold uppercase font-mono tracking-widest text-[#477267] bg-[#477267]/10 border border-[#477267]/20 rounded p-1 px-3">
                  Wizja i Filozofia Centrum
                </span>
                
                <h1 className="text-3xl md:text-4xl font-serif font-bold text-[#477267] leading-snug">
                  Wspieramy Cię w drodze do odzyskania wewnętrznego balansu i pełni sił życiowych.
                </h1>

                <p className="text-stone-600 text-base leading-relaxed font-light">
                  Nasze centrum powstało z myślą o osobach poszukujących profesjonalnego, nowoczesnego i zindywidualizowanego wsparcia psychologicznego i psychoterapeutycznego. Oferujemy bezpieczną przestrzeń do pracy nad rozwojem osobistym oraz radzeniem sobie z wyzwaniami codziennego życia.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                  <div className="p-6 bg-white border border-stone-200/80 rounded-3xl space-y-2.5 shadow-sm">
                    <h3 className="text-md font-bold font-serif text-[#477267]">Najwyższy Profesjonalizm</h3>
                    <p className="text-xs text-stone-550 leading-relaxed font-light">
                      Nasz gabinet prowadzony jest przez wykwalifikowaną, dyplomowaną psycholog i psychoterapeutkę mgr Noemi Krauze-Piwowar z bogatym doświadczeniem w pracy wsparciowej i rozwojowej.
                    </p>
                  </div>

                  <div className="p-6 bg-white border border-stone-200/80 rounded-3xl space-y-2.5 shadow-sm">
                    <h3 className="text-md font-bold font-serif text-[#477267]">Technologia w Waszej Służbie</h3>
                    <p className="text-xs text-stone-550 leading-relaxed font-light">
                      Jako jedni z nielicznych upraszczamy konsultacje. Nie marnujesz czasu pod gabinetem. Wszystkie powiadomienia, informacje o terminach oraz e-maile otrzymujesz wygodnie i bezpłatnie natychmiast po rezerwacji.
                    </p>
                  </div>
                </div>
              </section>

              {/* TREATMENT PROTOCOLS */}
              <section className="space-y-6 pt-6 border-t border-stone-200">
                <h2 className="text-xl font-bold font-serif text-[#477267]">W czym wspieramy?</h2>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { title: 'Zarządzanie Stresem', desc: 'Praca ze stresem biznesowym i codziennym, radzenie sobie z napięciem, techniki relaksacyjne, budowanie odporności psychicznej.' },
                    { title: 'Relacje i Komunikacja', desc: 'Wzmacnianie asertywności, poprawa komunikacji z bliskimi, budowanie dojrzałych relacji partnerskich i zawodowych.' },
                    { title: 'Rozwój Osobisty', desc: 'Podnoszenie samooceny, praca nad motywacją, planowanie celów życiowych, odkrywanie mocnych stron i zasobów wewnętrznych.' }
                  ].map((p, idx) => (
                    <div key={idx} className="p-5 bg-stone-100/60 border border-stone-200/40 rounded-2xl text-left space-y-1.5">
                      <span className="w-6 h-6 rounded-full bg-[#477267] text-white flex items-center justify-center font-bold text-xs font-mono mb-2">
                        {idx + 1}
                      </span>
                      <h4 className="text-sm font-bold text-[#477267] font-serif">{p.title}</h4>
                      <p className="text-[11px] text-stone-550 leading-relaxed">{p.desc}</p>
                    </div>
                  ))}
                </div>
              </section>

            </motion.div>
          )}

          {activeTab === 'faq' && (
            <motion.div
              key="faq-tab"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
              className="max-w-4xl mx-auto px-6 py-8 md:py-12 space-y-10 text-left"
            >
              
              {/* HEADER */}
              <div className="space-y-2">
                <span className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-[#477267] font-bold">Strefa Pacjenta</span>
                <h1 className="text-2xl md:text-3xl font-bold font-serif text-[#477267]">Pomoc i Wsparcie Kryzysowe</h1>
                <p className="text-xs text-stone-550 max-w-xl">
                  Kompleksowe wsparcie oraz najważniejsze telefony zaufania dla osób poszukujących pomocy psychologicznej i kryzysowej.
                </p>
              </div>

              {/* CRITICAL CRISIS HOTLINES CARD */}
              <div className="p-6 bg-red-50/70 border border-red-200/60 rounded-2xl space-y-4">
                <div className="flex items-start gap-3">
                  <span className="p-2 bg-red-105/10 rounded-xl text-red-700 animate-pulse mt-0.5">
                    <Heart className="w-5 h-5 fill-red-650 text-red-650" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-red-900 font-serif">Ważne: Wsparcie Kryzysowe & Telefony Zaufania</h3>
                    <p className="text-[11.5px] text-red-850 mt-0.5 leading-relaxed">
                      Jeśli przeżywasz trudny moment, masz myśli samobójcze lub potrzebujesz natychmiastowego profesjonalnego wsparcia rówieśniczego lub lekarskiego, skontaktuj się z jedną z darmowych i poufnych infolinii:
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <div className="p-3.5 bg-white border border-red-100 rounded-xl space-y-1 text-left">
                    <span className="text-[10px] font-mono font-bold text-red-600 block uppercase">Dla Dzieci i Młodzieży</span>
                    <a href="tel:116111" className="text-lg font-bold text-stone-900 hover:text-red-700 transition flex items-center gap-1.5 font-mono">
                      <Phone className="w-4 h-4 text-red-500" /> 116 111
                    </a>
                    <p className="text-[10px] text-stone-500">Całodobowy, bezpłatny telefon zaufania.</p>
                  </div>

                  <div className="p-3.5 bg-white border border-red-100 rounded-xl space-y-1 text-left">
                    <span className="text-[10px] font-mono font-bold text-red-600 block uppercase">Dla Osób Dorosłych</span>
                    <a href="tel:116123" className="text-lg font-bold text-stone-900 hover:text-red-700 transition flex items-center gap-1.5 font-mono">
                      <Phone className="w-4 h-4 text-red-500" /> 116 123
                    </a>
                    <p className="text-[10px] text-stone-500">Codziennie w godzinach 14:00 - 22:00.</p>
                  </div>

                  <div className="p-3.5 bg-white border border-red-100 rounded-xl space-y-1 text-left">
                    <span className="text-[10px] font-mono font-bold text-red-600 block uppercase">Wypadek lub Zagrożenie</span>
                    <a href="tel:112" className="text-lg font-bold text-stone-900 hover:text-red-700 transition flex items-center gap-1.5 font-mono">
                      <Phone className="w-4 h-4 text-red-550" /> 112
                    </a>
                    <p className="text-[10px] text-stone-500">Ogólny numer alarmowy w nagłych wypadkach.</p>
                  </div>
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* FOOTER */}
      <footer className="bg-stone-900 text-stone-400 py-10 px-6 border-t border-stone-850 mt-12 text-left">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
          
          <div className="space-y-3 md:col-span-2">
            <h3 className="font-serif text-white text-xl font-bold flex items-center gap-2">
              <span className="text-[#CBB696]">Centrum</span> <span className="text-[#7FA99B]">Analizy Zachowania</span>
            </h3>
            <p className="text-xs text-stone-400 leading-relaxed max-w-sm font-light">
              Gabinet Psychoterapeutyczny mgr Noemi Krauze-Piwowar. Współczesny standard wsparcia psychologicznego i rozwoju osobistego z pełną informatyzacją i bezpłatnymi powiadomieniami.
            </p>
            <div className="flex items-center gap-2.5 text-xs text-stone-500">
              <span>NIP: 897-123-45-67</span>
              <span>•</span>
              <span>REGON: 391234567</span>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <span className="font-mono text-[10px] text-stone-500 uppercase tracking-widest block font-bold">Gabinet</span>
            <ul className="space-y-1 bg-transparent">
              <li>Wrocław</li>
              <li>Telefon: +48 22 123 45 67</li>
              <li>E-mail: kontakt@analizazachowania.pl</li>
            </ul>
          </div>

          <div className="space-y-2 text-xs">
            <span className="font-mono text-[10px] text-stone-500 uppercase tracking-widest block font-bold">Godziny Pracy</span>
            <ul className="space-y-1 bg-transparent">
              <li>Poniedziałek - Piątek: 08:00 - 20:00</li>
              <li>Sobota: 09:00 - 15:00</li>
              <li>Niedziela: Zamknięte</li>
            </ul>
          </div>

        </div>

        <div className="max-w-6xl mx-auto border-t border-stone-800/80 pt-6 mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500 font-sans">
          <p>&copy; 2026 Centrum Analizy Zachowania. Wszelkie prawa zastrzeżone.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-stone-300">Polityka prywatności ROODO</a>
            <a href="#" className="hover:text-stone-300">Regulamin usług lekarskich</a>
          </div>
        </div>
      </footer>

      {/* RENDER DYNAMIC BOOKING FLOW DIALOG MODAL IF DOCTOR IS CLICKED */}
      <AnimatePresence>
        {selectedDoctorForBooking && (
          <BookingModal
            doctor={selectedDoctorForBooking}
            date={selectedDateForBooking}
            timeSlot={selectedSlotForBooking}
            onClose={() => setSelectedDoctorForBooking(null)}
            onSuccess={handleBookingSuccess}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
