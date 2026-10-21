export type DayOfWeek = 'Dimanche' | 'Lundi' | 'Mardi' | 'Mercredi' | 'Jeudi';

export type SectionType =
  | 'KG'
  | 'KG3_GS'
  | 'Primary'
  | 'Secondary_Girls'
  | 'Secondary_Boys';

export type SchoolCategory =
  | 'ALL'
  | 'French_Section'
  | 'Boys_Section'
  | 'Girls_Section'
  | 'American_Section'
  | 'KG_Primary';

export interface BellRow {
  type: 'period' | 'break';
  periodNumber?: number;
  label: string;
  time: string;
  durationMinutes?: number;
  supervisorTeacher?: string; // Surveillance de récréation / pause (Enseignant ou Assistant)
}

export interface BellScheduleGroup {
  id: string;
  name: string;
  category: Exclude<SchoolCategory, 'ALL'>;
  sectionKey: SectionType;
  description: string;
  classNames: string[]; // Classes belonging to this timing group
  maxPeriodsPerDay: number;
  rows: BellRow[];
}

export interface LessonSlot {
  subject: string;
  teacher: string;
  assistantTeacher?: string; // Enseignant Assistant(e) / AT avec l'enseignant principal au même créneau
  subSubject?: string;
  subTeacher?: string;
  room?: string;
  groupName?: string; // e.g. 'Classe complète', 'Classe complète,Classe complète', 'Groupe 1', 'Demi-groupe'
  jointWithClasses?: string[]; // Classes assembled together at the same period
  isIntercalated?: boolean; // Marked if split/interleaved or overlapping bell schedule
  intercalatedNote?: string;
}

export interface SchoolClass {
  id: string;
  name: string;
  section: SectionType;
  category?: Exclude<SchoolCategory, 'ALL'>;
  timingGroupId?: string;
  defaultAssistant?: string; // Assistant(e) de classe attitré(e) (ex: Maternelle / Primaire)
  room: string;
  visibility: 'school';
  slots: Record<string, LessonSlot>; // key format: "${DayOfWeek}_${periodNumber}"
  subjectLoads?: Record<string, number>; // optional explicit target weekly periods per subject
  unavailableSlots?: string[]; // Temps libre classe (Time-off)
  updatedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TeacherProfile {
  id: string;
  name: string;
  subjects: string[];
  section: string;
  category?: Exclude<SchoolCategory, 'ALL'>;
  isAssistant?: boolean; // Indique si le profil peut agir comme Assistant(e) / Co-enseignant
  maxPeriodsPerWeek: number;
  maxPeriodsPerDay?: number;
  maxConsecutivePeriods?: number;
  unavailableSlots: string[]; // format: "${DayOfWeek}_${periodNumber}" (Rouge X dans aSc)
  questionableSlots?: string[]; // format: "${DayOfWeek}_${periodNumber}" (Jaune ? dans aSc)
  defaultAssigned: boolean;
  visibility: 'school';
  updatedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ScheduleConflict {
  id: string;
  type: 'double_booking' | 'unavailable_slot' | 'overload' | 'intercalated_bell';
  severity: 'critical' | 'warning';
  teacher: string;
  day: DayOfWeek;
  period: number;
  classesInvolved: string[];
  description: string;
}

export interface IntercalatedSessionInfo {
  id: string;
  kind: 'split_group' | 'joint_classes' | 'cross_section_bell_overlap';
  day: DayOfWeek;
  period: number;
  classNames: string[];
  teachers: string[];
  subjects: string[];
  timeWindowA: string;
  timeWindowB?: string;
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
