import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Lock, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Phone, Mail, CheckCircle2, XCircle, Bell, ChevronDown, ChevronUp, Loader2, Activity, Settings2, ShieldCheck, Database, Server, Download, Upload } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';
import { pl } from 'date-fns/locale';

interface Props {
  onLogin: () => void;
}

export default function DoctorDashboard({ onLogin }: Props) {
  const [lookupQuery, setLookupQuery] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  const [activeTab, setActiveTab] = useState<'calendar' | 'system'>('calendar');
  const [stats, setStats] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [expandedApptId, setExpandedApptId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<{ id: string, action: string } | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);

  const fetchAppointments = async (code: string = lookupQuery) => {
    const apptRes = await fetch('/api/appointments', {
        method: 'GET',
        headers: { 'X-Doctor-Code': code }
    });
    if (apptRes.ok) {
        const bookings = await apptRes.json();
        setAppointments(bookings);
        return bookings;
    }
    return [];
  };
  
  const fetchStats = async (code: string = lookupQuery) => {
    try {
        const res = await fetch('/api/system/stats', {
            headers: { 'X-Doctor-Code': code }
        });
        if (res.ok) {
            setStats(await res.json());
        }
    } catch (e) {
        console.error(e);
    }
  };

  const handleDownloadBackup = () => {
    window.location.href = `/api/system/backup?code=${lookupQuery}`;
  };

  const handleUploadBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setBackupLoading(true);
        const jsonData = JSON.parse(event.target?.result as string);
        const res = await fetch('/api/system/restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Doctor-Code': lookupQuery
          },
          body: JSON.stringify(jsonData)
        });
        if (res.ok) {
           setSuccess('Baza danych została pomyślnie przywrócona.');
           await fetchAppointments(lookupQuery);
           await fetchStats(lookupQuery);
        } else {
           setError('Błąd przywracania bazy danych.');
        }
      } catch (err) {
        setError('Nieprawidłowy plik JSON. Upewnij się, że to oryginalny plik kopii zapasowej.');
      } finally {
        setBackupLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleValidate = async () => {
    try {
      const res = await fetch('/api/doctor/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: lookupQuery })
      });
      if (res.ok) {
        setAuthenticated(true);
        const bookings = await fetchAppointments(lookupQuery);
        await fetchStats(lookupQuery);
        setSuccess(`Zalogowano pomyślnie. Pobrano ${bookings.length} wizyt z serwera.`);
        setError('');
      } else {
        setError('Błędny kod dostępu.');
      }
    } catch (err) {
      setError('Wystąpił błąd podczas logowania.');
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (authenticated && activeTab === 'system') {
        fetchStats(lookupQuery);
        interval = setInterval(() => {
            fetchStats(lookupQuery);
        }, 5000); // refresh every 5s
    }
    return () => {
        if (interval) clearInterval(interval);
    };
  }, [authenticated, activeTab]);

  const handleAction = async (apptId: string, endpoint: string, actionName: string) => {
    setActionLoading({ id: apptId, action: actionName });
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: apptId })
      });
      if (res.ok) {
         await fetchAppointments(lookupQuery);
         setSuccess(`Akcja ${actionName} wykonana pomyślnie dla wizyty ${apptId}.`);
      } else {
         setError(`Akcja ${actionName} nie powiodła się.`);
      }
    } catch (err) {
      setError(`Błąd sieci podczas akcji ${actionName}.`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -5 }}
        transition={{ duration: 0.2 }}
        className="max-w-4xl mx-auto px-4 sm:px-6 py-8 md:py-12"
    >
        <div className="bg-white border border-stone-200 rounded-3xl p-6 md:p-8 space-y-6">
            <h1 className="text-2xl font-bold font-serif text-[#477267] flex items-center gap-2">
                <Lock className="w-6 h-6" /> Panel Doktora
            </h1>
            {!authenticated ? (
                <div className="space-y-4">
                    <input
                        type="password"
                        placeholder="Wpisz kod..."
                        value={lookupQuery}
                        onChange={(e) => setLookupQuery(e.target.value)}
                        className="bg-white border border-stone-200 rounded-xl px-4.5 py-2.5 text-xs focus:outline-none focus:border-[#477267] transition w-full"
                    />
                    <button
                        onClick={handleValidate}
                        className="bg-amber-600 text-white p-2 rounded w-full"
                    >
                        Sprawdź
                    </button>
                    {error && <p className="text-red-500 text-xs">{error}</p>}
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="flex gap-2 border-b border-stone-200 pb-4">
                        <button 
                            onClick={() => setActiveTab('calendar')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${activeTab === 'calendar' ? 'bg-[#477267] text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
                        >
                            <CalendarIcon className="w-4 h-4" /> Kalendarz
                        </button>
                        <button 
                            onClick={() => setActiveTab('system')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${activeTab === 'system' ? 'bg-[#477267] text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
                        >
                            <Activity className="w-4 h-4" /> System & Integracje
                        </button>
                    </div>

                    {success && activeTab === 'calendar' && <p className="text-green-700 bg-green-50 p-3 rounded-xl text-xs font-medium border border-green-200">{success}</p>}
                    
                    {activeTab === 'calendar' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                            <h2 className="text-lg font-bold font-serif text-[#477267] border-b pb-2">Kalendarz Wizyt</h2>
                            
                            {/* Simplified Calendar View */}
                            <div className="flex justify-between items-center mb-4 bg-stone-50 p-2 rounded-xl border border-stone-200">                
                                <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="p-2 hover:bg-stone-200 rounded-lg"><ChevronLeft className="w-5 h-5 text-[#477267]" /></button>                
                                <span className="font-bold text-[#477267] capitalize">{format(currentMonth, 'MMMM yyyy', { locale: pl })}</span>                
                                <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="p-2 hover:bg-stone-200 rounded-lg"><ChevronRight className="w-5 h-5 text-[#477267]" /></button>                
                            </div>
                            
                            <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-stone-500 mb-1">
                              {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map(day => <div key={day}>{day}</div>)}
                            </div>
                            
                            <div className="grid grid-cols-7 gap-1 text-center text-sm">
                              {/* Empty slots for padding */}
                              {Array.from({ length: (startOfMonth(currentMonth).getDay() + 6) % 7 }).map((_, i) => (
                                  <div key={`empty-${i}`} className="p-2"></div>
                              ))}
                              
                              {eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) }).map(day => {
                                const dayStr = format(day, 'yyyy-MM-dd');
                                const hasAppt = appointments.some(appt => appt.date === dayStr);
                                const isSelected = format(selectedDate, 'yyyy-MM-dd') === dayStr;
                                
                                return (
                                  <button 
                                    key={dayStr} 
                                    type="button"
                                    onClick={() => setSelectedDate(day)} 
                                    className={`p-2 rounded-xl transition ${isSelected ? 'bg-[#477267] text-white font-bold shadow-md' : hasAppt ? 'bg-[#477267]/10 text-[#477267] font-bold hover:bg-[#477267]/20 border border-[#477267]/20' : 'hover:bg-stone-100 text-stone-600'}`}
                                  >
                                    {format(day, 'd')}
                                  </button>
                              )})}
                            </div>

                            <h3 className="font-bold text-sm text-stone-800 mt-6 pt-4 border-t border-stone-100">Wizyty w dniu {format(selectedDate, 'd MMMM', { locale: pl })}:</h3>
                            
                            <div className="grid grid-cols-1 gap-4 mt-4">
                                {appointments.filter(appt => appt.date === format(selectedDate, 'yyyy-MM-dd')).length === 0 ? (
                                    <p className="text-stone-500 text-sm italic bg-stone-50 p-4 rounded-xl border border-stone-200 text-center">Brak zaplanowanych wizyt w tym dniu.</p>
                                ) : appointments.filter(appt => appt.date === format(selectedDate, 'yyyy-MM-dd')).map(appt => {
                                    const date = new Date(appt.date);
                                    const isExpanded = expandedApptId === appt.id;
                                    const isPending = appt.status === 'pending_payment';
                                    const isCancelled = appt.status === 'cancelled';
                                    
                                    let statusColor = 'bg-[#477267]/10 text-[#477267]';
                                    if (isPending) statusColor = 'bg-amber-100 text-amber-800';
                                    if (isCancelled) statusColor = 'bg-red-100 text-red-800';
                                    
                                    return (
                                        <div key={appt.id} className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden transition-all hover:border-[#477267]/30">
                                            <div 
                                              className="p-5 flex items-center gap-4 cursor-pointer select-none"
                                              onClick={() => setExpandedApptId(isExpanded ? null : appt.id)}
                                            >
                                                <div className="flex flex-col items-center shrink-0 w-16">
                                                    <span className="text-[10px] text-[#477267] font-bold uppercase">{date.toLocaleDateString('pl-PL', { month: 'short' })}</span>
                                                    <span className="text-2xl font-bold font-mono text-[#477267]">{date.getDate()}</span>
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className="font-bold text-sm text-stone-800">{appt.patientName}</h3>
                                                    <p className="text-xs text-stone-500 font-mono mt-0.5">
                                                        {appt.timeSlot}
                                                    </p>
                                                </div>
                                                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
                                                    {appt.status}
                                                </div>
                                                <div className="shrink-0 ml-2">
                                                    {isExpanded ? <ChevronUp className="w-5 h-5 text-stone-400" /> : <ChevronDown className="w-5 h-5 text-stone-400" />}
                                                </div>
                                            </div>

                                            <AnimatePresence>
                                                {isExpanded && (
                                                    <motion.div 
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        className="bg-stone-50 border-t border-stone-100"
                                                    >
                                                        <div className="p-5 space-y-4">
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                <div className="space-y-1">
                                                                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-1"><Phone className="w-3 h-3"/> Telefon</div>
                                                                    <div className="text-sm font-medium text-stone-700">{appt.patientPhone || 'Brak danych'}</div>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-1"><Mail className="w-3 h-3"/> E-mail</div>
                                                                    <div className="text-sm font-medium text-stone-700">{appt.patientEmail || 'Brak danych'}</div>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Metoda płatności</div>
                                                                    <div className="text-sm font-medium text-stone-700 uppercase">{appt.paymentMethod || 'Nieznana'}</div>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Utworzono</div>
                                                                    <div className="text-sm font-medium text-stone-700">{appt.createdAt ? new Date(appt.createdAt).toLocaleString('pl-PL') : 'Brak danych'}</div>
                                                                </div>
                                                            </div>

                                                            {appt.smsLog && (
                                                                <div className="mt-4 bg-white p-3 rounded-xl border border-stone-200 shadow-sm">
                                                                    <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                                                        <Bell className="w-3 h-3" /> Status / Logi Powiadomień (SMTP / SMS)
                                                                    </div>
                                                                    <div className="text-[10px] text-stone-600 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                                                                        {appt.smsLog}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <div className="pt-4 border-t border-stone-200 flex flex-wrap gap-2">
                                                                {isPending && (
                                                                    <button 
                                                                        disabled={actionLoading !== null}
                                                                        onClick={() => handleAction(appt.id, '/api/confirm-payment', 'Potwierdź')}
                                                                        className="flex items-center gap-1 text-xs font-bold bg-green-100 text-green-700 px-3 py-2 rounded-lg hover:bg-green-200 transition disabled:opacity-50"
                                                                    >
                                                                        {actionLoading?.id === appt.id && actionLoading?.action === 'Potwierdź' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} 
                                                                        Potwierdź Płatność
                                                                    </button>
                                                                )}
                                                                
                                                                {!isCancelled && (
                                                                    <button 
                                                                        disabled={actionLoading !== null}
                                                                        onClick={() => handleAction(appt.id, '/api/cancel-appointment', 'Anuluj')}
                                                                        className="flex items-center gap-1 text-xs font-bold bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200 transition disabled:opacity-50"
                                                                    >
                                                                        {actionLoading?.id === appt.id && actionLoading?.action === 'Anuluj' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} 
                                                                        Anuluj
                                                                    </button>
                                                                )}

                                                                <button 
                                                                    disabled={actionLoading !== null}
                                                                    onClick={() => handleAction(appt.id, '/api/trigger-sms', 'Powiadomienia')}
                                                                    className="flex items-center gap-1 text-xs font-bold bg-[#477267] text-white px-3 py-2 rounded-lg hover:bg-[#34584f] transition disabled:opacity-50 ml-auto"
                                                                >
                                                                    {actionLoading?.id === appt.id && actionLoading?.action === 'Powiadomienia' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} 
                                                                    Wyślij Powiadomienie (Email/SMS)
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'system' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                            <h2 className="text-lg font-bold font-serif text-[#477267] border-b pb-2 flex items-center gap-2">
                                <Server className="w-5 h-5" /> Diagnostyka Systemu i Baza Danych 
                            </h2>

                            {stats?.systemLocked && (
                                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-3">
                                    <Lock className="w-5 h-5" />
                                    <div className="text-sm">
                                        <strong>Tryb Konserwacji Włączony</strong>
                                        <p>Pacjenci nie mogą obecnie dokonywać nowych rejestracji. Użyj komendy <code className="bg-red-100 px-1 rounded text-red-800">!unlock</code> na Discordzie, aby to odblokować.</p>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="bg-stone-50 border border-stone-200 p-4 rounded-xl flex items-center gap-4">
                                    <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><Database className="w-6 h-6" /></div>
                                    <div>
                                        <p className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">Rekordy w bazie JSON</p>
                                        <p className="text-xl font-bold font-mono text-stone-800">{stats?.dbRecords || 0}</p>
                                    </div>
                                </div>
                                <div className="bg-stone-50 border border-stone-200 p-4 rounded-xl flex items-center gap-4">
                                    <div className="p-3 bg-green-100 text-green-600 rounded-lg"><Activity className="w-6 h-6" /></div>
                                    <div>
                                        <p className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">Czas uptime</p>
                                        <p className="text-xl font-bold font-mono text-stone-800">{stats?.uptimeSeconds ? (stats.uptimeSeconds / 3600).toFixed(2) + ' h' : '0 h'}</p>
                                    </div>
                                </div>
                                <div className="bg-stone-50 border border-stone-200 p-4 rounded-xl flex items-center gap-4">
                                    <div className="p-3 bg-purple-100 text-purple-600 rounded-lg"><Server className="w-6 h-6" /></div>
                                    <div>
                                        <p className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">Pamięć RAM (RSS)</p>
                                        <p className="text-xl font-bold font-mono text-stone-800">{stats?.memoryUsage ? (stats.memoryUsage.rss / 1024 / 1024).toFixed(1) + ' MB' : '0 MB'}</p>
                                    </div>
                                </div>
                                <div className="bg-stone-50 border border-stone-200 p-4 rounded-xl flex items-center gap-4">
                                    <div className="p-3 bg-amber-100 text-amber-600 rounded-lg"><Settings2 className="w-6 h-6" /></div>
                                    <div>
                                        <p className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">Wersja Node</p>
                                        <p className="text-xl font-bold font-mono text-stone-800">{stats?.nodeVersion || 'N/A'}</p>
                                    </div>
                                </div>
                            </div>
                            
                            <h3 className="text-md font-bold text-stone-800 mt-8 mb-4 border-b border-stone-100 pb-2">Status Integracji (.env)</h3>
                            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
                                <div className="p-4 flex items-center justify-between border-b border-stone-100">
                                    <div className="flex items-center gap-3">
                                        <Mail className="w-5 h-5 text-stone-400" />
                                        <div>
                                            <p className="font-bold text-sm text-stone-800">SMTP Email</p>
                                            <p className="text-[10px] text-stone-500">Wysyłka e-maili i przypomnień do pacjentów</p>
                                        </div>
                                    </div>
                                    <div className={`px-2 py-1 rounded text-xs font-bold ${stats?.hasSmtp ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {stats?.hasSmtp ? 'AKTYWNY' : 'BRAK DANYCH (DEMO)'}
                                    </div>
                                </div>
                                <div className="p-4 flex items-center justify-between border-b border-stone-100">
                                    <div className="flex items-center gap-3">
                                        <Phone className="w-5 h-5 text-stone-400" />
                                        <div>
                                            <p className="font-bold text-sm text-stone-800">Twilio SMS</p>
                                            <p className="text-[10px] text-stone-500">Bramka płatnych wiadomości SMS na telefony</p>
                                        </div>
                                    </div>
                                    <div className={`px-2 py-1 rounded text-xs font-bold ${stats?.hasTwilio ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {stats?.hasTwilio ? 'AKTYWNY' : 'BRAK DANYCH (DEMO)'}
                                    </div>
                                </div>
                                <div className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <ShieldCheck className="w-5 h-5 text-stone-400" />
                                        <div>
                                            <p className="font-bold text-sm text-stone-800">Telegram Bot</p>
                                            <p className="text-[10px] text-stone-500">Darmowe alerty administratora o nowych rezerwacjach</p>
                                        </div>
                                    </div>
                                    <div className={`px-2 py-1 rounded text-xs font-bold ${stats?.hasTelegram ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {stats?.hasTelegram ? 'AKTYWNY' : 'BRAK DANYCH (DEMO)'}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-stone-50 p-4 border border-stone-200 rounded-xl mt-4">
                                <p className="text-xs text-stone-600 mb-2 font-bold">💡 Informacja o Integracjach Email / SMS</p>
                                <p className="text-xs text-stone-500 leading-relaxed">
                                    Aby włączyć prawdziwe powiadomienia wysyłane do pacjentów, należy skonfigurować środowisko (zmienne .env).
                                    System wspiera łatwą wysyłkę e-maili przez wbudowany moduł Nodemailer podłączony do bezpłatnej poczty SMTP (np. Gmail).
                                    W sekcji <strong>Kalendarz Wizyt</strong> u żywego pacjenta możesz kliknąć "Wyślij Powiadomienie (Email/SMS)", 
                                    co wyzwoli próbę wysłania. W trybie "DEMO" wygeneruje to symulacyjny plik logów potwierdzający schemat działania.
                                </p>
                            </div>

                            <h3 className="text-md font-bold text-stone-800 mt-8 mb-4 border-b border-stone-100 pb-2">Zarządzanie Danymi (Zapis w Chmurze / Lokalnie)</h3>
                            <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
                                <p className="text-xs text-stone-600">
                                    Wizyty zapisywane są w lokalnej bazie <code className="bg-stone-100 px-1 rounded">db.json</code>. Jeśli aplikacja zrestartuje serwer w chmurze (np. na Cloud Run), dane mogą zostać zresetowane. Pobieraj regularnie bazę wizyt, aby ją zabezpieczyć.
                                </p>
                                
                                <div className="flex flex-col sm:flex-row items-center gap-3">
                                    <button
                                        onClick={handleDownloadBackup}
                                        className="w-full sm:w-auto flex items-center justify-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-800 px-4 py-2.5 rounded-xl text-sm font-bold transition border border-stone-200"
                                    >
                                        <Download className="w-4 h-4" /> Pobierz plik bazy (JSON)
                                    </button>
                                    
                                    <input 
                                        type="file" 
                                        accept=".json" 
                                        ref={fileInputRef} 
                                        className="hidden" 
                                        onChange={handleUploadBackup}
                                    />
                                    <button
                                        disabled={backupLoading}
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#477267] hover:bg-[#32524a] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50"
                                    >
                                        {backupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                        Wgraj z pliku (Przywróć)
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>
            )}
        </div>
    </motion.div>
  );
}
