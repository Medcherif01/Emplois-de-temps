export type DayOfWeek = 'Dimanche' | 'Lundi' | 'Mardi' | 'Mercredi' | 'Jeudi';

export type SectionType =
  | 'KG'
  | 'KG3_GS'
  | 'Primary'
  | 'Secondary_Girls'
  | 'Secondary_Boys';

export interface BellRow {
  type: 'period' | 'break';
  periodNumber?: number;
  label: string;
  time: string;
}

export interface LessonSlot {
  subject: string;
  teacher: string;
  subSubject?: string;
  subTeacher?: string;
  room?: string;
}

export interface SchoolClass {
  id: string;
  name: string;
  section: SectionType;
  room: string;
  visibility: 'school';
  slots: Record<string, LessonSlot>; // key format: "${DayOfWeek}_${periodNumber}"
  updatedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TeacherProfile {
  id: string;
  name: string;
  subjects: string[];
  section: string;
  maxPeriodsPerWeek: number;
  unavailableSlots: string[]; // format: "${DayOfWeek}_${periodNumber}"
  defaultAssigned: boolean;
  visibility: 'school';
  updatedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ScheduleConflict {
  id: string;
  type: 'double_booking' | 'unavailable_slot' | 'overload';
  severity: 'critical' | 'warning';
  teacher: string;
  day: DayOfWeek;
  period: number;
  classesInvolved: string[];
  description: string;
}

export interface NotificationEntry {
  id: string;
  title: string;
  message: string;
  type:
    | 'conflict_resolved'
    | 'schedule_updated'
    | 'ai_generated'
    | 'teacher_assigned'
    | 'availability_changed';
  targetTeacher: string;
  visibility: 'school';
  authorId: string;
  createdAt?: unknown;
  timestampMs?: number;
}
