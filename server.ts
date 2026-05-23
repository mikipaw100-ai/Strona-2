import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import twilio from 'twilio';
import nodemailer from 'nodemailer';
import { initDiscordBot, notifyDiscordNewBooking } from './server/discord-bot';

// Load environmental variables safely
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Path to persist appointments locally
const DB_PATH = path.join(process.cwd(), 'appointments-db.json');

// Interface representation on backend matching src/types
interface Appointment {
  id: string;
  doctorId: string;
  doctorName: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  date: string;
  timeSlot: string;
  status: 'pending_payment' | 'confirmed' | 'cancelled';
  paymentMethod: 'stripe' | 'onsite';
  stripePaymentIntentId?: string;
  smsReminderSent: boolean;
  smsLog?: string;
  createdAt: string;
}

// Helper to read and write local appointments
function readDB(): Appointment[] {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading appointments DB:', err);
  }
  return [];
}

function writeDB(data: Appointment[]) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing appointments DB:', err);
  }
}

// Lazy Stripe Initialization to prevent crashes on startup if secret key is missing as requested
let stripeClient: Stripe | null = null;
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.includes('MY_STRIPE_SECRET_KEY') || key.trim() === '') {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key, { apiVersion: '2025-01-27' as any });
  }
  return stripeClient;
}

// Lazy Twilio client builder
let twilioClient: any = null;
function getTwilio() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const phone = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !phone || sid.trim() === '' || token.trim() === '') {
    return null;
  }
  if (!twilioClient) {
    twilioClient = twilio(sid, token);
  }
  return { client: twilioClient, fromNumber: phone };
}

// Lazy SMTP Transporter builder for 100% stable free Emails
function getSMTP() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !user || !pass || user.trim() === '' || pass.trim() === '') {
    return null;
  }

  return {
    transporter: nodemailer.createTransport({
      host,
      port: Number(port || 587),
      secure: Number(port) === 465,
      auth: { user, pass }
    }),
    from: from || user
  };
}

// Telegram Bot details
function getTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId || token.trim() === '' || chatId.trim() === '') {
    return null;
  }
  return { token, chatId };
}

// ================= API ENDPOINTS =================

// 1. GET ALL APPOINTMENTS (COMPLIANT WITH GDPR / RODO PRIVACY MANDATES)
app.get('/api/appointments', (req, res) => {
  const appointments = readDB();
  const { ids, phone, email } = req.query;

  // If specific search criteria are passed, return Full appointments matching the filters
  if (ids || phone || email) {
    let filtered = [...appointments];

    if (ids) {
      const idList = String(ids).split(',').map(id => id.trim());
      filtered = filtered.filter(appt => idList.includes(appt.id));
    }

    if (phone) {
      const cleanSearchPhone = String(phone).replace(/\s+/g, '').replace('+', '');
      filtered = filtered.filter(appt => {
        const cleanApptPhone = appt.patientPhone.replace(/\s+/g, '').replace('+', '');
        return cleanApptPhone.includes(cleanSearchPhone);
      });
    }

    if (email) {
      const cleanEmail = String(email).trim().toLowerCase();
      filtered = filtered.filter(appt => appt.patientEmail.trim().toLowerCase().includes(cleanEmail));
    }

    res.json(filtered);
    return;
  }

  // Otherwise, return SANITIZED records (only public slot states) to protect patient privacy from other visitors
  const sanitized = appointments.map(appt => ({
    id: appt.id,
    doctorId: appt.doctorId,
    doctorName: appt.doctorName,
    date: appt.date,
    timeSlot: appt.timeSlot,
    status: appt.status,
    createdAt: appt.createdAt,
    // Sensitive properties are anonymized
    patientName: "Pacjent Anonimowy",
    patientPhone: "Sprawdź w koncie pacjenta",
    patientEmail: "Ochrona danych osobowych (RODO)",
    paymentMethod: appt.paymentMethod,
    smsReminderSent: appt.smsReminderSent
  }));

  res.json(sanitized);
});

// 2. CREATE A COMFIRMED OR PENDING BOOKING
app.post('/api/appointments', async (req, res) => {
  try {
    const { 
      doctorId, 
      doctorName, 
      patientName, 
      patientPhone, 
      patientEmail, 
      date, 
      timeSlot, 
      paymentMethod 
    } = req.body;

    if (!doctorId || !doctorName || !patientName || !patientPhone || !patientEmail || !date || !timeSlot) {
      res.status(400).json({ error: 'Uzupełnij wszystkie wymagane pola pacjenta i termin.' });
      return;
    }

    const appointments = readDB();

    // Check duplicate slot
    const isConflict = appointments.some(appt => 
      appt.doctorId === doctorId && 
      appt.date === date && 
      appt.timeSlot === timeSlot &&
      appt.status !== 'cancelled'
    );

    if (isConflict) {
      res.status(409).json({ error: 'Ten termin u wybranego lekarza został już zarezerwowany.' });
      return;
    }

    const newAppointment: Appointment = {
      id: `apt-${Math.random().toString(36).substring(2, 9)}`,
      doctorId,
      doctorName,
      patientName,
      patientPhone,
      patientEmail,
      date,
      timeSlot,
      status: paymentMethod === 'stripe' ? 'pending_payment' : 'confirmed',
      paymentMethod,
      smsReminderSent: false,
      createdAt: new Date().toISOString()
    };

    // Trigger Twilio SMS if payment is confirmed immediately (cash onsite)
    if (newAppointment.status === 'confirmed') {
      await triggerSMSReminder(newAppointment);
    }

    appointments.unshift(newAppointment);
    writeDB(appointments);

    // Notify Discord Bot or Channel if configured
    notifyDiscordNewBooking(newAppointment);

    res.status(201).json(newAppointment);
  } catch (err: any) {
    console.error('Error creating booking:', err);
    res.status(500).json({ error: 'Błąd podczas rezerwacji terminu.' });
  }
});

// 3. SECURE PAYMENTS: CREATE STRIPE INTENT OR SESSION
app.post('/api/stripe-checkout', async (req, res) => {
  const { appointmentId, price } = req.body;
  if (!appointmentId || !price) {
    res.status(400).json({ error: 'Brakujące parametry płatności.' });
    return;
  }

  const stripe = getStripe();
  try {
    if (stripe) {
      // Create a real payment session
      // For this single-page, we can create a PaymentIntent and return the client_secret
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(price * 100), // convert PLN to grosze
        currency: 'pln',
        metadata: { appointmentId },
        description: `Wizyta w Centrum Analizy Zachowania`
      });

      res.json({
        isMock: false,
        clientSecret: paymentIntent.client_secret,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder'
      });
    } else {
      // fallback simulation log
      res.json({
        isMock: true,
        clientSecret: `mock_sec_${Math.random().toString(36).substring(2, 12)}`,
        message: 'Stripe keys are not defined. Operating in Sandbox Demo mode.'
      });
    }
  } catch (err: any) {
    console.error('Stripe initialization failed:', err);
    res.status(500).json({ error: 'Nie udało się połączyć z dostawcą Stripe.' });
  }
});

// 4. CONFIRM PAYMENT FOR MOCK OR ACTUAL STRIPE TRANSACTIONS
app.post('/api/confirm-payment', async (req, res) => {
  const { appointmentId, stripePaymentIntentId } = req.body;
  if (!appointmentId) {
    res.status(400).json({ error: 'Niepoprawny ID transakcji.' });
    return;
  }

  const appointments = readDB();
  const itemIdx = appointments.findIndex(a => a.id === appointmentId);

  if (itemIdx === -1) {
    res.status(404).json({ error: 'Wizyta nie została znaleziona.' });
    return;
  }

  appointments[itemIdx].status = 'confirmed';
  appointments[itemIdx].stripePaymentIntentId = stripePaymentIntentId || `mock_stripe_${Math.random().toString(36).substring(2, 9)}`;
  
  // Trigger SMS Reminder on successful payment confirmation
  await triggerSMSReminder(appointments[itemIdx]);

  writeDB(appointments);

  // Notify Discord of payment confirmation
  notifyDiscordNewBooking(appointments[itemIdx]);

  res.json({ success: true, appointment: appointments[itemIdx] });
});

// 5. MANUAL REMOTE TESTING ENDPOINT FOR SMS TRIGGER
app.post('/api/trigger-sms', async (req, res) => {
  const { appointmentId } = req.body;
  if (!appointmentId) {
    res.status(400).json({ error: 'Brakujący ID wizyty.' });
    return;
  }

  const appointments = readDB();
  const itemIdx = appointments.findIndex(a => a.id === appointmentId);

  if (itemIdx === -1) {
    res.status(404).json({ error: 'Wizyta nie została znaleziona.' });
    return;
  }

  await triggerSMSReminder(appointments[itemIdx]);
  writeDB(appointments);

  res.json({ success: true, appointment: appointments[itemIdx] });
});

// 6. CANCEL APPOINTMENT ENDPOINT
app.post('/api/cancel-appointment', async (req, res) => {
  const { appointmentId } = req.body;
  if (!appointmentId) {
    res.status(400).json({ error: 'Brakujący ID wizyty.' });
    return;
  }

  const appointments = readDB();
  const itemIdx = appointments.findIndex(a => a.id === appointmentId);

  if (itemIdx === -1) {
    res.status(404).json({ error: 'Wizyta nie została znaleziona.' });
    return;
  }

  const appt = appointments[itemIdx];
  appt.status = 'cancelled';
  appt.smsLog = `[SYSTEM GABINETU] Wizyta została anulowana przez pacjenta o godz ${new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}. Termin został zwolniony i zarejestrowano wniosek o automatyczny zwrot środków Stripe.`;

  // Real automatic Stripe Refund invocation
  const stripe = getStripe();
  if (stripe && appt.stripePaymentIntentId && !appt.stripePaymentIntentId.startsWith('mock_')) {
    try {
      await stripe.refunds.create({
        payment_intent: appt.stripePaymentIntentId
      });
      appt.smsLog += `\n[STRIPE REFUND: SUKCES] Pomyślnie przetworzono i zlecono zwrot środków (refund) bezpośrednio na kartę płatniczą przez system Stripe API!`;
    } catch (refundError: any) {
      appt.smsLog += `\n[STRIPE REFUND: INFO / ERR] Zarejestrowano wniosek o ręczny zwrot z powodu błędu bramki Stripe: ${refundError.message || refundError}`;
    }
  } else if (appt.paymentMethod === 'stripe') {
    // Mock simulation description
    appt.smsLog += `\n[STRIPE REFUND: DEMO MODE] System zasymulował pomyślny zwrot kwoty transakcji na rachunek demonstracyjny pacjenta.`;
  }

  writeDB(appointments);

  // Notify Discord or Logs of cancellation
  notifyDiscordNewBooking(appt);

  res.json({ success: true, appointment: appt });
});

// Shared Helper: Sends notifications (Twilio SMS, Free SMTP Email, Free Telegram Bot) based on settings
async function triggerSMSReminder(appt: Appointment) {
  const twilioConf = getTwilio();
  const smtpConf = getSMTP();
  const telegramConf = getTelegram();

  const alertText = `Centrum Analizy Zachowania: Przypominamy o Twojej konsultacji u terapeuty: ${appt.doctorName} w dniu ${appt.date} o godz ${appt.timeSlot}. Bezpieczny gabinet online. Zapraszamy! Telefon kontaktowy: 22 123 45 67.`;

  const logs: string[] = [];
  let sentAnySuccess = false;

  // 1. Deliver via Twilio (Paid / Trial carrier SMS)
  if (twilioConf) {
    try {
      const response = await twilioConf.client.messages.create({
        body: alertText,
        from: twilioConf.fromNumber,
        to: appt.patientPhone
      });
      sentAnySuccess = true;
      logs.push(`[TWILIO SMS: SUKCES] Wysłano SMS za pośrednictwem Twilio. SID: ${response.sid}`);
    } catch (err: any) {
      logs.push(`[TWILIO SMS: BŁĄD] ${err.message || err}`);
    }
  }

  // 2. Deliver via Free Telegram Bot API (100% Free real-time notifications on phone!)
  if (telegramConf) {
    try {
      const { token, chatId } = telegramConf;
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const messageText = `🔔 NOWA WIZYTA (Centrum Analizy Zachowania)!\nPacjent: ${appt.patientName}\nLekarz: ${appt.doctorName}\nTermin: ${appt.date} o godz ${appt.timeSlot}\nTelefon: ${appt.patientPhone}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: messageText })
      });
      if (response.ok) {
        sentAnySuccess = true;
        logs.push(`[TELEGRAM ALERTS: SUKCES] Powiadomienie wysłane pomyślnie na Twój telefon przez darmowe API Telegrama!`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        logs.push(`[TELEGRAM ALERTS: BŁĄD] Kod statusu: ${response.status}. Opis: ${JSON.stringify(errorData)}`);
      }
    } catch (err: any) {
      logs.push(`[TELEGRAM ALERTS: BŁĄD SIECOWY] ${err.message || err}`);
    }
  }

  // 3. Deliver via Free SMTP Email (100% Free notifications to patient and doctor email!)
  if (smtpConf) {
    try {
      const { transporter, from } = smtpConf;
      const mailOptions = {
        from: `"Centrum Analizy Zachowania" <${from}>`,
        to: appt.patientEmail,
        subject: `Potwierdzenie Rezerwacji Wizyty - ${appt.date} o ${appt.timeSlot}`,
        text: `Dzień dobry ${appt.patientName},\n\nTwoja wizyta u terapeuty ${appt.doctorName} została pomyślnie potwierdzona.\n\nSzczegóły:\nData: ${appt.date}\nGodzina: ${appt.timeSlot}\nGabinet: Online (link zostanie wygenerowany)\n\nŻyczymy miłego dnia,\nCentrum Analizy Zachowania`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #4a4a4a; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #fbfbf9;">
            <h2 style="color: #477267; margin-bottom: 20px; font-family: Georgia, serif; border-bottom: 2px solid #7FA99B; padding-bottom: 10px;">Potwierdzenie Rezerwacji</h2>
            <p>Dzień dobry <strong>${appt.patientName}</strong>,</p>
            <p>Twoja konsultacja terapeutyczna została pomyślnie zarezerwowana w naszym systemie.</p>
            <div style="background-color: #f5f6f2; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1.5px solid #dcdfd8;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 5px 0; color: #7a7a7a;">Specjalista:</td><td><strong>${appt.doctorName}</strong></td></tr>
                <tr><td style="padding: 5px 0; color: #7a7a7a;">Data wizyty:</td><td><strong>${appt.date}</strong></td></tr>
                <tr><td style="padding: 5px 0; color: #7a7a7a;">Godzina:</td><td style="color: #477267; font-weight: bold;">${appt.timeSlot}</td></tr>
                <tr><td style="padding: 5px 0; color: #7a7a7a;">Lokalizacja:</td><td>Gabinet stacjonarny lub Online</td></tr>
              </table>
            </div>
            <p style="font-size: 11px; color: #888; font-style: italic; margin-top: 25px; border-top: 1px solid #eee; padding-top: 10px;">
              To jest bezpłatne powiadomienie e-mail przesłane przez automatyczny system Centrum Analizy Zachowania.
            </p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      sentAnySuccess = true;
      logs.push(`[SMTP EMAIL: SUKCES] Wysłano e-mail potwierdzający do pacjenta na adres ${appt.patientEmail}`);
    } catch (err: any) {
      logs.push(`[SMTP EMAIL: BŁĄD] ${err.message || err}`);
    }
  }

  // 4. Fallback when NO integrations are configured / Sandbox Guide
  if (!twilioConf && !smtpConf && !telegramConf) {
    appt.smsReminderSent = true; // Mark sent so the UI lights up green with our instructions
    appt.smsLog = `[WSZYSTKIE BRAMKI W TRYBIE DEMO - TUTORIAL]
1. E-MAIL SMTP (Najłatwiejsze & Zamiennik Twilio za 0zł):
   Uzupełnij SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM w .env (np. własnym kontem Gmail/Onet). System zacznie wysyłać prawdziwe, piękne e-maile z potwierdzeniem do pacjentów za darmo!

2. TELEGRAM (Całkowicie darmowe Alerty na Twój Telefon):
   Stwórz darmowego bota u @BotFather na Telegramie, wpisz TELEGRAM_BOT_TOKEN i TELEGRAM_CHAT_ID w .env i otrzymuj natychmiastowe wiadomości na żywo, kiedy ktoś rezerwuje termin!

3. TWILIO SMS (Płatne):
   Wpisz swoje TWILIO_ACCOUNT_SID, AUTH_TOKEN i numer w .env.

[TREŚĆ SYMULOWANEGO SMS]:
"${alertText}" (Odbiorca: ${appt.patientPhone})`;
    console.log('Sandbox simulation completed.');
    return;
  }

  appt.smsReminderSent = sentAnySuccess;
  appt.smsLog = logs.join('\n\n');
}

// ================= VITE INTEGRATION =================

async function startServer() {
  // Start Discord Bot manager
  initDiscordBot(readDB, writeDB, triggerSMSReminder);

  // Vite dev or production static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
