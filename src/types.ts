export interface Doctor {
  id: string;
  name: string;
  title: string;
  description: string;
  price: number;
  rating: number;
  reviewsCount: number;
  avatarUrl: string;
  specializations: string[];
  languages: string[];
  slots: Record<string, string[]>; // e.g., {'2026-05-23': ['09:00', '10:00', '13:00']}
}

export type AppointmentStatus = 'pending_payment' | 'confirmed' | 'cancelled';

export interface Appointment {
  id: string;
  doctorId: string;
  doctorName: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  date: string;
  timeSlot: string;
  status: AppointmentStatus;
  paymentMethod: 'stripe' | 'onsite';
  stripePaymentIntentId?: string;
  smsReminderSent: boolean;
  smsLog?: string;
  createdAt: string;
}

export interface Review {
  id: string;
  patientName: string;
  rating: number;
  text: string;
  date: string;
}
