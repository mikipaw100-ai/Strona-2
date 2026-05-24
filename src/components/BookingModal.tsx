import React, { useState, useEffect } from 'react';
import { Doctor, Appointment } from '../types';
import { 
  X, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  CreditCard, 
  AlertCircle, 
  ShieldCheck, 
  Sparkles, 
  PhoneCall, 
  Info,
  Loader2,
  Lock,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BookingModalProps {
  doctor: Doctor;
  date: string;
  timeSlot: string;
  token: string | null;
  onLogin: () => Promise<void>;
  onClose: () => void;
  onSuccess: (appointment: Appointment) => void;
}

export default function BookingModal({ doctor, date, timeSlot, token, onLogin, onClose, onSuccess }: BookingModalProps) {
  const [step, setStep] = useState<'details' | 'stripe_模擬' | 'completed'>('details');
  const [patientName, setPatientName] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [patientPhone, setPatientPhone] = useState('+48 ');
  const [paymentMethod] = useState<'stripe'>('stripe');
  
  // Agreement checkboxes
  const [acceptTerms, setAcceptTerms] = useState(true);
  const [wantSMS, setWantSMS] = useState(true);

  // Loading & error states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);

  // Stripe simulation form inputs
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCVC, setCardCVC] = useState('');
  const [isPaying, setIsPaying] = useState(false);

  // Auto-fill standard sandbox credentials on simple click
  const handleFillSandboxCard = () => {
    setCardNumber('4242 4242 4242 4242');
    setCardExpiry('12/28');
    setCardCVC('242');
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // Validations
    if (!patientName.trim()) {
      setErrorMessage('Proszę podać imię i nazwisko pacjenta.');
      return;
    }
    const phoneTrimmed = patientPhone.replace(/\s+/g, '');
    if (phoneTrimmed.length < 9) {
      setErrorMessage('Proszę wprowadzić poprawny numer telefonu dla powiadomień SMS (minimum 9 znaków).');
      return;
    }
    if (!patientEmail.includes('@')) {
      setErrorMessage('Wprowadź poprawny adres e-mail do wysyłki e-potwierdzenia.');
      return;
    }
    if (!acceptTerms) {
      setErrorMessage('Musisz zaakceptować zgodę RODO na przetwarzanie danych klinicznych.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: doctor.id,
          doctorName: doctor.name,
          patientName,
          patientPhone,
          patientEmail,
          date,
          timeSlot,
          paymentMethod
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Coś poszło nie tak podczas rezerwacji.');
      }

      const bookedAppt: Appointment = result;
      setActiveAppointment(bookedAppt);

      if (paymentMethod === 'stripe') {
        // Fetch client secret initialization key
        const payInitRes = await fetch('/api/stripe-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appointmentId: bookedAppt.id,
            price: doctor.price
          })
        });
        const payInitData = await payInitRes.json();
        
        // Advance to modular stripe interactive mock overlay
        setStep('stripe_模擬');
      } else {
        // For onsite cash/card payments, reservation is instantly fully confirmed
        setStep('completed');
        onSuccess(bookedAppt);
        syncToGoogleCalendar(bookedAppt);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Błąd połączenia z serwerem. Spróbuj ponownie.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStripePaymentConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cardNumber.replace(/\s/g, '').length < 16) {
      alert('Wpisz pełny numer karty testowej (16 cyfr). Możesz użyć autouzupełnienia poniżej.');
      return;
    }

    setIsPaying(true);
    try {
      // call Server endpoint to transition appointment.status to confirmed and fire notifications
      const finalizeRes = await fetch('/api/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: activeAppointment?.id,
          stripePaymentIntentId: `pi_live_${Math.random().toString(36).substring(2, 10)}`
        })
      });
      const finalizedData = await finalizeRes.json();

      if (finalizeRes.ok && finalizedData.success) {
        setActiveAppointment(finalizedData.appointment);
        setStep('completed');
        onSuccess(finalizedData.appointment);
        syncToGoogleCalendar(finalizedData.appointment);
      } else {
        alert('Stripe odrzucił transakcję. Sprawdź parametry karty.');
      }
    } catch (err) {
      alert('Problem z autoryzacją transakcji płatniczej.');
    } finally {
      setIsPaying(false);
    }
  };

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const syncToGoogleCalendar = async (appointment: Appointment) => {
    if (!token) return;
    setIsSyncing(true);
    setSyncStatus('Synchronizacja z Google Calendar...');
    const [hour, minute] = appointment.timeSlot.split(':');
    const start = new Date(appointment.date);
    start.setHours(parseInt(hour), parseInt(minute));
    const end = new Date(start.getTime() + 50 * 60000);

    const event = {
        summary: `Wizyta: ${appointment.doctorName}`,
        description: `Pacjent: ${appointment.patientName}, Telefon: ${appointment.patientPhone}`,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() }
    };

    try {
        const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(event)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to sync to Google Calendar. Response:', response.status, errorText);
            setSyncStatus('Błąd synchronizacji z Google Calendar: ' + response.statusText);
        } else {
            console.log('Successfully synced to Google Calendar');
            setSyncStatus('Pomyślnie zsynchronizowano z Google Calendar!');
        }
    } catch (e) {
        console.error('Failed to sync to Google Calendar', e);
        setSyncStatus('Błąd sieci podczas synchronizacji z Google Calendar.');
    } finally {
        setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (token && syncStatus === 'Oczekuje na logowanie...' && activeAppointment) {
      syncToGoogleCalendar(activeAppointment);
    }
  }, [token, syncStatus, activeAppointment]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/85 backdrop-blur-sm overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-lg bg-[#FAF9F5] rounded-3xl overflow-hidden shadow-2xl border border-stone-200/50 flex flex-col my-8"
      >
        {/* Modal Close */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 transition z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Dynamic header colored based on steps */}
        <div className={`p-6 text-white ${step === 'stripe_模擬' ? 'bg-[#5433FF]' : 'bg-[#477267]'} relative overflow-hidden transition-colors duration-300`}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl transform translate-x-12 -translate-y-12" />
          
          <div className="flex items-center gap-1 text-[10px] font-mono uppercase bg-white/10 w-fit px-2 py-0.5 rounded tracking-widest text-[#FFFDF6] mb-2">
            {step === 'details' && 'Dopełnienie rejestracji'}
            {step === 'stripe_模擬' && 'Autoryzacja Płatności'}
            {step === 'completed' && 'Wizyta zarezerwowana'}
          </div>

          <h3 className="text-xl md:text-2xl font-serif font-bold text-[#FCFAF7]">
            {step === 'stripe_模擬' ? 'Bezpieczna Płatność Online' : 'Rezerwacja Konsultacji'}
          </h3>
          <p className="text-xs text-stone-200/90 font-sans mt-1">
            Centrum Analizy Zachowania • Konsultacja Indywidualna 50 min
          </p>
        </div>

        {/* Modal Content container */}
        <div className="p-6 md:p-8 flex-1 overflow-y-auto max-h-[70vh] text-stone-800">

          <AnimatePresence mode="wait">
            {step === 'details' && (
              <motion.form 
                key="step-details"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                onSubmit={handleBookingSubmit}
                className="space-y-5"
              >
                {/* Doctor Mini-Banner Summary */}
                <div className="p-4 bg-[#FAF6F0] rounded-2xl flex items-center gap-3 border border-stone-200/40">
                  <img 
                    src={doctor.avatarUrl} 
                    alt={doctor.name} 
                    className="w-12 h-12 rounded-full object-cover border border-[#477267]/20" 
                  />
                  <div className="text-left">
                    <h4 className="text-sm font-bold text-[#477267] font-serif">{doctor.name}</h4>
                    <span className="text-[11px] text-stone-500 block leading-tight">{doctor.title}</span>
                    <div className="flex items-center gap-3 mt-1.5 text-xs font-mono text-stone-600">
                      <span className="flex items-center gap-1 font-medium bg-[#477267]/10 p-0.5 px-2.5 rounded border border-[#477267]/20 text-[#477267]">
                        <Calendar className="w-3.5 h-3.5" /> {date}
                      </span>
                      <span className="flex items-center gap-1 font-medium bg-[#477267]/10 p-0.5 px-2.5 rounded border border-[#477267]/20 text-[#477267]">
                        <Clock className="w-3.5 h-3.5" /> {timeSlot}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Form fields */}
                <div className="space-y-3.5">
                  <div>
                    <label className="block text-xs text-stone-500 mb-1 font-semibold uppercase tracking-wider font-mono">
                      Imię i Nazwisko Pacjenta *
                    </label>
                    <input 
                      type="text" 
                      required
                      placeholder="np. Michał Pawłowski"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#477267] transition shadow-sm font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-stone-500 mb-1 font-semibold uppercase tracking-wider font-mono">
                      Adres E-mail *
                    </label>
                    <input 
                      type="email" 
                      required
                      placeholder="twoj.mail@example.com"
                      value={patientEmail}
                      onChange={(e) => setPatientEmail(e.target.value)}
                      className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#477267] transition shadow-sm font-sans"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-stone-500 font-semibold uppercase tracking-wider font-mono flex items-center gap-1 bg-transparent">
                        <PhoneCall className="w-3.5 h-3.5 text-[#477267]" /> Telefon komórkowy (Powiadomienia SMS) *
                      </label>
                      <span className="text-[10px] text-amber-600 bg-amber-50 p-0.5 px-1.5 rounded-md font-mono border border-amber-200/50">Wymagane do reminderów</span>
                    </div>
                    <input 
                      type="tel" 
                      required
                      placeholder="+48 501 234 567"
                      value={patientPhone}
                      onChange={(e) => setPatientPhone(e.target.value)}
                      className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#477267] transition shadow-sm font-sans"
                    />
                    <span className="text-[10px] text-stone-400 mt-1 block leading-normal italic font-sans">
                      Na ten numer zostanie automatycznie wysłany SMS z bezpłatnym powiadomieniem przed wizytą.
                    </span>
                  </div>
                </div>

                {/* Payment option info (Stripe only) */}
                <div className="border-t border-stone-200/80 pt-4 space-y-2.5">
                  <label className="block text-xs text-stone-550 font-semibold uppercase tracking-wider font-mono">
                    Forma rozliczenia
                  </label>
                  
                  <div className="p-4 bg-[#477267]/5 rounded-2xl border border-[#477267]/20 text-left">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#477267]">
                      <CreditCard className="w-4 h-4" /> Bezpieczna płatność online (Karta / BLIK)
                    </div>
                    <p className="text-[10px] text-stone-600 mt-1.5 leading-relaxed font-sans">
                      Płatność realizowana jest z góry za pośrednictwem bezproblemowego systemu płatności online. Kliknięcie przycisku poniżej uruchomi interaktywną bramkę płatniczą.
                    </p>
                  </div>
                </div>

                {/* Confirm Checkboxes */}
                <div className="space-y-2.5 pt-2">
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs text-stone-600 font-sans leading-relaxed select-none">
                    <input 
                      type="checkbox" 
                      checked={wantSMS}
                      onChange={(e) => setWantSMS(e.target.checked)}
                      className="mt-0.5 rounded text-[#477267] focus:ring-[#477267]" 
                    />
                    <span>Chcę otrzymać bezpłatne przypomnienie SMS z linkiem na wejście oraz informacją o dojeździe.</span>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer text-xs text-stone-600 font-sans leading-relaxed select-none">
                    <input 
                      type="checkbox" 
                      required
                      checked={acceptTerms}
                      onChange={(e) => setAcceptTerms(e.target.checked)}
                      className="mt-0.5 rounded text-[#477267] focus:ring-[#477267]" 
                    />
                    <span>
                      Akceptuję regulamin rezerwacji i wyrażam zgodę na przetwarzanie moich danych do koordynacji wizyt. *
                    </span>
                  </label>
                </div>

                {/* Error handling feedback */}
                {errorMessage && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Submit trigger button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#477267] hover:bg-[#34584E] text-white py-3.5 rounded-xl font-semibold text-sm transition shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 select-none"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      Weryfikacja dostępności terminu...
                    </>
                  ) : paymentMethod === 'stripe' ? (
                    'Zarezerwuj i przejdź do płatności'
                  ) : (
                    'Zatwierdź i wejdź do panelu wizyt'
                  )}
                </button>
              </motion.form>
            )}

            {step === 'stripe_模擬' && (
              <motion.div 
                key="step-stripe"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-4"
              >
                <div className="p-3 bg-indigo-50 text-indigo-800 border-l-4 border-[#5433FF] rounded text-xs leading-normal flex items-start gap-2">
                  <Info className="w-4 h-4 text-[#5433FF] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Bezpieczna Bramka Płatnicza</span>
                    Autoryzacja płatności przebiega za pośrednictwem szyfrowanego poufnego połączenia. Dane bankowe są w pełni chronione kluczem SSL.
                  </div>
                </div>

                {/* Simulative Credit Card widget panel */}
                <form onSubmit={handleStripePaymentConfirm} className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4 shadow-sm text-stone-700">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-500 font-mono flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-stone-400" /> Transakcja Szyfrowana (SSL)
                    </span>
                    <span className="text-xs bg-indigo-50 text-[#5433FF] font-mono px-2 py-0.5 rounded font-bold">
                      {doctor.price} PLN
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] text-stone-500 mb-1 font-semibold uppercase tracking-wider font-mono">Numer Karty Kredytowej</label>
                      <input 
                        type="text"
                        required
                        placeholder="4242 4242 4242 4242"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-[#5433FF] font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-stone-500 mb-1 font-semibold uppercase tracking-wider font-mono">Ważność (MM/YY)</label>
                        <input 
                          type="text"
                          required
                          placeholder="12/28"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-[#5433FF] text-center font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-stone-500 mb-1 font-semibold uppercase tracking-wider font-mono">Kod CVC</label>
                        <input 
                          type="password"
                          maxLength={3}
                          required
                          placeholder="242"
                          value={cardCVC}
                          onChange={(e) => setCardCVC(e.target.value)}
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-[#5433FF] text-center font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Sandboxed help buttons */}
                  <div className="bg-stone-50 p-2.5 rounded-lg border border-stone-200 flex items-center justify-between text-[11px] text-stone-500">
                    <span>Użyj standardowej karty testowej:</span>
                    <button
                      type="button"
                      onClick={handleFillSandboxCard}
                      className="text-[#5433FF] hover:underline font-bold text-xs"
                    >
                      Autouzupełnij dane
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isPaying}
                    className="w-full bg-[#5433FF] hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-xs transition tracking-wide flex items-center justify-center gap-2 cursor-pointer disabled:opacity-85 shadow-md shadow-[#5433FF]/20 select-none"
                  >
                    {isPaying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        Autoryzacja płatności 3D-Secure...
                      </>
                    ) : (
                      `Zapłać i potwierdź wizytę (${doctor.price} PLN)`
                    )}
                  </button>
                </form>

                <button
                  onClick={() => setStep('details')}
                  className="w-full text-center text-xs text-stone-500 hover:text-stone-800 font-semibold transition py-1"
                >
                  &larr; Powrót i zmiana danych pacjenta
                </button>
              </motion.div>
            )}

            {step === 'completed' && (
              <motion.div 
                key="step-complete"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-5 text-center py-4"
              >
                {/* Visual success element */}
                <div className="w-16 h-16 bg-[#477267]/10 rounded-full flex items-center justify-center mx-auto border border-[#477267]/30 mb-2">
                  <CheckCircle2 className="w-8 h-8 text-[#477267] animate-bounce" />
                </div>

                <div className="space-y-1">
                  <h4 className="text-lg font-serif font-bold text-[#477267]">Konsultacja Potwierdzona!</h4>
                  <p className="text-xs text-stone-500 max-w-sm mx-auto">
                    Twoja rejestracja w Centrum Analizy Zachowania zakończyła się sukcesem. Informacje na temat konsultacji zostały przekazane lekarzowi.
                  </p>
                </div>

                {/* Visual appointment summary for patient review */}
                {activeAppointment && (
                  <div className="bg-white border border-stone-200 rounded-2xl p-4 text-left space-y-2.5 max-w-sm mx-auto text-xs text-stone-700 font-sans shadow-sm">
                    <div className="flex justify-between border-b border-stone-100 pb-1.5 text-stone-400 uppercase tracking-widest font-mono text-[9px]">
                      <span>Podsumowanie Wizyty</span>
                      <span>ID: {activeAppointment.id}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1">
                      <span className="text-stone-400 font-medium">Lekarz:</span>
                      <span className="col-span-2 font-bold text-stone-900">{doctor.name}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1">
                      <span className="text-stone-400 font-medium">Lokalizacja:</span>
                      <span className="col-span-2 text-stone-600">Gabinet stacjonarny lub Online (Link w SMS)</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1">
                      <span className="text-stone-400 font-medium">Termin:</span>
                      <span className="col-span-2 font-mono font-bold text-[#477267]">
                        {activeAppointment.date} o godz {activeAppointment.timeSlot}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1">
                      <span className="text-stone-400 font-medium">Pacjent:</span>
                      <span className="col-span-2 text-stone-600">{activeAppointment.patientName}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1">
                      <span className="text-stone-400 font-medium">Telefon:</span>
                      <span className="col-span-2 text-stone-600 font-mono">{activeAppointment.patientPhone}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1">
                      <span className="text-stone-400 font-medium">Status płatności:</span>
                      <span className="col-span-2">
                        {activeAppointment.status === 'confirmed' ? (
                          <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded font-semibold text-[10px] border border-green-200/50 inline-block font-mono">
                            OPŁACONA
                          </span>
                        ) : (
                          <span className="text-mono text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-semibold text-[10px] border border-amber-200/50 inline-block font-mono">
                            OCZEKUJE NA AUTORYZACJĘ
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )}

                {/* Google Calendar Sync Status */}
                {syncStatus && (
                  <div className={`p-3 border rounded-xl text-[11px] leading-relaxed max-w-sm mx-auto text-left flex gap-2 ${isSyncing ? 'bg-amber-50 text-amber-800 border-amber-200' : syncStatus.includes('Błąd') ? 'bg-red-50 text-red-800 border-red-200' : 'bg-green-50 text-green-800 border-green-200'}`}>
                    {isSyncing ? <Loader2 className="w-5 h-5 animate-spin shrink-0 mt-0.5" /> : <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />}
                    <div>
                        <span className="font-semibold block">{isSyncing ? 'Synchronizowanie...' : 'Status Google Calendar'}</span>
                        {syncStatus}
                    </div>
                  </div>
                )}

                {!token && activeAppointment && !syncStatus && (
                  <button
                    onClick={async () => {
                      setSyncStatus('Oczekuje na logowanie...');
                      await onLogin();
                    }}
                    className="flex items-center justify-center gap-2 w-full max-w-xs mx-auto border border-stone-300 hover:bg-stone-50 text-stone-700 px-6 py-2 rounded-xl text-xs font-semibold cursor-pointer select-none transition"
                  >
                    <Calendar className="w-4 h-4 text-blue-600" />
                    Dodaj do Kalendarza Google
                  </button>
                )}

                {/* Message reminders alert mockup */}
                <div className="p-3 bg-teal-50/80 border border-teal-200/50 rounded-xl text-[11px] leading-relaxed text-teal-800 max-w-sm mx-auto text-left flex gap-2">
                  <MessageSquare className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block text-teal-900">SMS został wygenerowany!</span>
                    Możesz zweryfikować wysyłkę w panelu <strong className="text-teal-950 font-semibold cursor-pointer">"Moje Wizyty"</strong> na głównej stronie, gdzie rejestrowane są logi wyjściowe operatora GSM.
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={onClose}
                    className="bg-[#477267] hover:bg-[#34584E] text-white px-6 py-2.5 rounded-xl font-semibold text-xs transition tracking-wider w-full max-w-xs cursor-pointer select-none"
                  >
                    Przejdź do moich wizyt
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

        {/* Footer info lock banner */}
        <div className="p-4 bg-stone-100 border-t border-stone-200/50 text-center text-[10px] text-stone-400 font-mono flex items-center justify-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-stone-400" />
          Bezpieczne szyfrowanie SSL • Zgodność z RODO i standardami medycznymi
        </div>
      </motion.div>
    </div>
  );
}
