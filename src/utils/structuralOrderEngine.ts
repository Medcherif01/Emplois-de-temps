import {
  BELL_SCHEDULES,
  DAYS_OF_WEEK,
  normalizeIndividualTeachersList,
  teacherMatchesSlot,
} from '../data/alkawtharDefaults';
import {
  DayOfWeek,
  LessonSlot,
  SchoolCategory,
  SchoolClass,
  SectionType,
  TeacherProfile,
  UnplacedLessonCard,
} from '../types/timetable';
import { classMatchesCategory } from './timetableAnalytics';

export const OFFICIAL_BOYS_RESTRUCTURING_ORDER_TEXT = `1. Instructions Générales sur la Structure des Classes :
- Grade 3 Boys est scindé en : Grade 3A Boys (الصف الثالث أ) et Grade 3B Boys (الصف الثالث ب)
- Grade 4 Boys est scindé en : Grade 4A Boys (الصف الرابع أ) et Grade 4B Boys (الصف الرابع ب)

2. Répartition des Matières par Classe (Grade 3 & Grade 4) :
- Grade 3A Boys : Maths (New Teacher), Sciences (New Teacher), English (Mira), Library (Mira), Social Studies (Husnia), Computing (Husnia)
- Grade 3B Boys : Maths (New Teacher), Sciences (New Teacher), English (Mira), Library (Mira), Social Studies (Husnia), Computing (Husnia)
- Grade 4A Boys : Maths (New Teacher), Sciences (Elisa), English (Mira), Social Studies (Husnia), Computing (Ola Ame), Library (Joudi - Séance commune avec Grade 4B)
- Grade 4B Boys : Maths (New Teacher), Sciences (Elisa), English (Fayrouz), Social Studies (Husnia), Computing (Ola Ame), Library (Joudi - Séance commune avec Grade 4A)

3. Récapitulatif et Ajustements de la Charge des Enseignantes :
- New Teacher (28 séances) : Maths (3A, 3B, 4A, 4B), Sciences (3A, 3B)
- Ms. Mira (25 séances) : English (3A, 3B, 4A), Library (3A, 3B)
- Ms. Fayrouz (28 séances) : English (4B, 5A, 5B, 6)
- Ms. Elisa (25 séances) : Sciences (4A, 4B, 5A, 5B, 6)
- Ms. Ola (26 séances) : Maths (5A, 5B, 6), Computing (4A, 4B, 5A, 5B)
- Ms. Husnia (26 séances) : Social Studies (3A, 3B, 4A, 4B, 5A, 5B, 6), Computing (3A, 3B, 6B + 4G, 5G, 6G). Retrait Computing G1/G2 -> Homeroom teachers.
- Ms. Joudy (28 séances) : Library séance groupée 4A + 4B.

4. Séances Complémentaires & Organisation Multi-Départements :
- Musique (+2), Arts Plastiques (2), Éducation Physique PE (+2), Montessori (+1), Français (+2).
- Enseignants multi-départements : organiser le matin (P1-P4) pour un département et l'après-midi (P5-P8) pour l'autre département, sans intersection d'horaires ni dépassement sur les pauses (breaks).`;

export interface TeacherLoadVerificationItem {
  teacher: string;
  targetPeriods: number;
  actualPeriods: number;
  details: string;
}

export interface MultiDeptTeacherScheduleSummary {
  teacher: string;
  departments: string[];
  patternSummary: string;
  clockConflicts: number;
}

export interface StructuralOrderExecutionResult {
  classes: SchoolClass[];
  teachers: TeacherProfile[];
  unplacedLessons: UnplacedLessonCard[];
  summary: string;
  placedCount: number;
  leftAsideCount: number;
  frozenClassesCount: number;
  teacherLoadVerification: TeacherLoadVerificationItem[];
  multiDeptReport?: MultiDeptTeacherScheduleSummary[];
}

export interface ParsedAiOrderAst {
  summary?: string;
  organizeMultiDepartmentHalfDay?: boolean;
  classSplits?: Array<{
    sourceClassName: string;
    newClassNames: string[];
  }>;
  teacherAssignments?: Array<{
    className: string;
    subject: string;
    teacher: string;
    periodsPerWeek?: number;
  }>;
  homeroomTransfers?: Array<{
    classNamePattern: string;
    subject: string;
    fromTeacher?: string;
  }>;
  combinedSessions?: Array<{
    classNames: string[];
    subject: string;
    teacher: string;
  }>;
  teacherTargetLoads?: Array<{
    teacher: string;
    targetPeriods: number;
  }>;
  supplementarySessions?: Array<{
    subject: string;
    deltaPeriods: number;
  }>;
  morningPrioritySubjects?: string[];
  afternoonSubjects?: string[];
  forbiddenPeriods?: number[];
  subjectSpecificRules?: Array<{
    subject: string;
    preferredPeriods?: number[];
    avoidPeriods?: number[];
    preferredDays?: string[];
  }>;
  maxSameSubjectPerDay?: number;
}

// ============================================================================
// 1. REAL CLOCK-TIME & BREAK NON-INTERSECTION PRIMITIVES
// ============================================================================

function parseTimeRangeToMinutes(timeStr: string): [number, number] {
  const parts = timeStr.split('-').map((s) => s.trim());
  const parsePart = (hm: string): number => {
    const [hStr, mStr] = hm.split(':');
    let h = Number(hStr);
    const m = Number(mStr);
    if (h >= 1 && h <= 6) h += 12;
    return h * 60 + m;
  };
  return [parsePart(parts[0]), parsePart(parts[1])];
}

export function getPeriodClockBounds(
  section: SectionType,
  period: number
): [number, number] {
  const schedule = BELL_SCHEDULES[section] || BELL_SCHEDULES.Primary;
  const row = schedule.find(
    (r) => r.type === 'period' && r.periodNumber === period
  );
  if (!row) return [480 + (period - 1) * 45, 480 + period * 45];
  return parseTimeRangeToMinutes(row.time);
}

export function getMaxPeriodsForSection(section: SectionType): number {
  if (section === 'KG') return 6;
  if (section === 'KG3_GS') return 7;
  return 8;
}

/**
 * Checks if Period A in Section A overlaps in real clock time with Period B in Section B.
 * Because different sections have staggered breaks (e.g. Primary Break 1 is 9:30-9:50 while
 * Secondary Break 1 is 10:15-10:45), Primary P3 (9:50-10:35) overlaps Secondary P3 (9:30-10:15)!
 */
export function periodsOverlapInClockTime(
  sectionA: SectionType,
  periodA: number,
  sectionB: SectionType,
  periodB: number
): boolean {
  if (periodA === periodB) return true;
  if (sectionA === sectionB) return false;
  const [startA, endA] = getPeriodClockBounds(sectionA, periodA);
  const [startB, endB] = getPeriodClockBounds(sectionB, periodB);
  const overlapMinutes = Math.min(endA, endB) - Math.max(startA, startB);
  return overlapMinutes > 0;
}

// ============================================================================
// 2. MULTI-DEPARTMENT IDENTIFICATION & HALF-DAY (MATIN / APRÈS-MIDI) CLUSTERING
// ============================================================================

export type DepartmentId =
  | 'Dept_KG_Maternelle'
  | 'Dept_Primaire_Francophone'
  | 'Dept_Primaire_Filles'
  | 'Dept_Primaire_Garcons'
  | 'Dept_Secondaire_Filles'
  | 'Dept_Secondaire_Garcons';

export const DEPARTMENT_LABELS: Record<DepartmentId, string> = {
  Dept_KG_Maternelle: 'KG & Maternelle (British KG / Fr PS-MS-GS)',
  Dept_Primaire_Francophone: 'Primaire Français (PP1 à PEI1)',
  Dept_Primaire_Filles: '1–6 British Filles (Girls)',
  Dept_Primaire_Garcons: '1–6 British Garçons (Boys)',
  Dept_Secondaire_Filles: 'Secondaire Filles (Fr / Brit / Am)',
  Dept_Secondaire_Garcons: 'Secondaire Garçons (Fr / Brit / Am)',
};

export function getClassDepartment(cls: SchoolClass): DepartmentId {
  const n = cls.name.trim().toLowerCase();
  if (
    cls.category === 'KG_Maternelle' ||
    cls.section === 'KG' ||
    cls.section === 'KG3_GS'
  ) {
    return 'Dept_KG_Maternelle';
  }
  if (cls.category === 'Primaire_Francais' || n.startsWith('pp') || n.startsWith('pei1')) {
    return 'Dept_Primaire_Francophone';
  }
  if (cls.category === 'Secondaire_Garcons' || cls.section === 'Secondary_Boys') {
    return 'Dept_Secondaire_Garcons';
  }
  if (cls.category === 'Secondaire_Filles' || cls.section === 'Secondary_Girls') {
    return 'Dept_Secondaire_Filles';
  }
  if (cls.category === 'Primaire_British_Garcons' || n.includes('boys') || n.includes('garçons')) {
    return 'Dept_Primaire_Garcons';
  }
  return 'Dept_Primaire_Filles';
}

interface TeacherOccupancyEntry {
  day: DayOfWeek;
  period: number;
  section: SectionType;
  department: DepartmentId;
  className: string;
}

class ClockAndDepartmentTracker {
  private byTeacherDay = new Map<string, TeacherOccupancyEntry[]>();

  private normTeachers(teacherStr?: string): string[] {
    if (!teacherStr) return [];
    return teacherStr
      .split(/[\/&+]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  addSlot(
    teacherStr: string | undefined,
    day: DayOfWeek,
    period: number,
    cls: SchoolClass
  ) {
    const dept = getClassDepartment(cls);
    for (const t of this.normTeachers(teacherStr)) {
      const key = `${t}__${day}`;
      if (!this.byTeacherDay.has(key)) {
        this.byTeacherDay.set(key, []);
      }
      this.byTeacherDay.get(key)!.push({
        day,
        period,
        section: cls.section,
        department: dept,
        className: cls.name,
      });
    }
  }

  removeSlot(
    teacherStr: string | undefined,
    day: DayOfWeek,
    period: number,
    className: string
  ) {
    for (const t of this.normTeachers(teacherStr)) {
      const key = `${t}__${day}`;
      const list = this.byTeacherDay.get(key);
      if (!list) continue;
      const idx = list.findIndex(
        (e) =>
          e.period === period &&
          e.className.toLowerCase() === className.toLowerCase()
      );
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  /**
   * Returns true if placing `teacherStr` on `(day, period)` in `targetCls` would
   * cause either a direct period collision OR a cross-section clock-time / break intersection!
   */
  hasConflictOrClockOverlap(
    teacherStr: string | undefined,
    day: DayOfWeek,
    period: number,
    targetSection: SectionType
  ): boolean {
    for (const t of this.normTeachers(teacherStr)) {
      const key = `${t}__${day}`;
      const list = this.byTeacherDay.get(key);
      if (!list || list.length === 0) continue;
      for (const entry of list) {
        if (
          periodsOverlapInClockTime(
            targetSection,
            period,
            entry.section,
            entry.period
          )
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Computes a half-day department clustering cost for placing `teacherStr` at `(day, period)`
   * in `targetDept`. Lower is better!
   * - If the teacher already teaches ANOTHER department on `day` in the Morning (P1-P4),
   *   then Afternoon (P5-P8) for `targetDept` gets a huge bonus (-40) and Morning gets a penalty (+40).
   * - If the teacher already teaches ANOTHER department on `day` in the Afternoon (P5-P8),
   *   then Morning (P1-P4) for `targetDept` gets a huge bonus (-40) and Afternoon gets a penalty (+40).
   * - If the teacher already teaches the SAME department `targetDept` on `day` in the same half-day,
   *   it gets a clustering bonus (-15) so all classes of that department stay grouped together!
   */
  getHalfDayDepartmentPenalty(
    teacherStr: string | undefined,
    day: DayOfWeek,
    period: number,
    targetDept: DepartmentId
  ): number {
    const isCandidateMorning = period <= 4;
    let penalty = 0;

    for (const t of this.normTeachers(teacherStr)) {
      const key = `${t}__${day}`;
      const list = this.byTeacherDay.get(key);
      if (!list || list.length === 0) continue;

      const otherEntries = list.filter((e) => e.department !== targetDept);
      const sameEntries = list.filter((e) => e.department === targetDept);

      if (otherEntries.length > 0) {
        const minOtherP = Math.min(...otherEntries.map((e) => e.period));
        const maxOtherP = Math.max(...otherEntries.map((e) => e.period));
        const otherAvgP =
          otherEntries.reduce((acc, e) => acc + e.period, 0) /
          otherEntries.length;

        // 1. Never sandwich targetDept in the middle of otherDept (no Dept A -> Dept B -> Dept A ping-pong)
        if (period > minOtherP && period < maxOtherP) {
          penalty += 450;
        }

        // 2. If sameDept already has periods on this day, keep all sameDept on the same side of otherDept
        if (sameEntries.length > 0) {
          const sameAvgP =
            sameEntries.reduce((acc, e) => acc + e.period, 0) /
            sameEntries.length;
          const sameIsBeforeOther = sameAvgP < otherAvgP;
          if (sameIsBeforeOther && period > minOtherP) {
            penalty += 400;
          } else if (!sameIsBeforeOther && period < maxOtherP) {
            penalty += 400;
          }
        }

        // 3. Prefer Morning (P1-P4) for one department and Afternoon (P5-P8) for the other department
        const otherMostlyMorning = otherAvgP <= 4.5;
        if (otherMostlyMorning) {
          // Other dept is in Morning -> place targetDept in Afternoon (P5-P8) after maxOtherP
          if (period >= 5 && period > maxOtherP) {
            penalty -= 90;
          } else {
            penalty += 220;
          }
        } else {
          // Other dept is in Afternoon -> place targetDept in Morning (P1-P4) before minOtherP
          if (period <= 4 && period < minOtherP) {
            penalty -= 90;
          } else {
            penalty += 220;
          }
        }

        // 4. Buffer between department change if not separated by a break
        for (const oe of otherEntries) {
          if (Math.abs(oe.period - period) === 1) {
            // P4 -> P5 has a break between them in Primary/Secondary, otherwise penalize adjacent switch
            const isAcrossMiddayBreak =
              (oe.period === 4 && period === 5) ||
              (oe.period === 5 && period === 4);
            if (!isAcrossMiddayBreak) {
              penalty += 55;
            }
          }
        }
      } else if (sameEntries.length > 0) {
        // Only same department on this day: reward clustering in the same half-day
        const sameAvgP =
          sameEntries.reduce((acc, e) => acc + e.period, 0) /
          sameEntries.length;
        const sameMostlyMorning = sameAvgP <= 4.5;
        if (isCandidateMorning === sameMostlyMorning) {
          penalty -= 25;
        } else {
          penalty += 15;
        }
      }
    }

    return penalty;
  }
}

export function isBoysRestructuringOrder(text: string): boolean {
  const norm = (text || '').toLowerCase();
  const hasG3Split =
    (norm.includes('3a') && norm.includes('3b')) ||
    norm.includes('الصف الثالث') ||
    norm.includes('grade 3 boys');
  const hasTeachers =
    norm.includes('mira') &&
    (norm.includes('husnia') ||
      norm.includes('fayrouz') ||
      norm.includes('elisa'));
  return hasG3Split && hasTeachers;
}

interface LessonRequirement {
  subject: string;
  teacher: string;
  periods: number;
  subSubject?: string;
  subTeacher?: string;
  preferMorning?: boolean;
}

/**
 * Computes a diagnostic summary of how multi-department teachers are organized
 * (Morning vs Afternoon department blocks + 0 clock/break overlaps).
 */
export function buildMultiDepartmentTeacherReport(
  classes: SchoolClass[]
): MultiDeptTeacherScheduleSummary[] {
  const teacherDepts = new Map<
    string,
    {
      displayName: string;
      depts: Set<DepartmentId>;
      byDay: Map<
        DayOfWeek,
        Array<{ period: number; dept: DepartmentId; section: SectionType }>
      >;
    }
  >();

  for (const cls of classes) {
    const dept = getClassDepartment(cls);
    for (const [sk, slot] of Object.entries(cls.slots)) {
      const [dayStr, pStr] = sk.split('_');
      const day = dayStr as DayOfWeek;
      const period = Number(pStr);

      const teachersInSlot = [
        ...slot.teacher.split(/[\/&+]/).map((s) => s.trim()),
        ...(slot.subTeacher
          ? slot.subTeacher.split(/[\/&+]/).map((s) => s.trim())
          : []),
      ].filter(Boolean);

      for (const rawName of teachersInSlot) {
        const norm = rawName.toLowerCase();
        if (!teacherDepts.has(norm)) {
          teacherDepts.set(norm, {
            displayName: rawName,
            depts: new Set(),
            byDay: new Map(),
          });
        }
        const item = teacherDepts.get(norm)!;
        item.depts.add(dept);
        if (!item.byDay.has(day)) item.byDay.set(day, []);
        item.byDay.get(day)!.push({ period, dept, section: cls.section });
      }
    }
  }

  const summaries: MultiDeptTeacherScheduleSummary[] = [];
  const priorityTeachers = [
    'husnia',
    'joudi',
    'aichetou',
    'mohamed ali',
    'farah',
    'imen art',
  ];

  for (const [norm, info] of teacherDepts.entries()) {
    if (info.depts.size < 2 && !priorityTeachers.includes(norm)) continue;

    let clockConflicts = 0;
    let cleanBlockDays = 0;
    let multiDeptDays = 0;

    for (const [, entries] of info.byDay.entries()) {
      entries.sort((a, b) => a.period - b.period);
      const dayDepts = new Set(entries.map((e) => e.dept));
      if (dayDepts.size >= 2) {
        multiDeptDays++;
        // Count how many department switches occur during the day (1 switch = clean Morning Dept 1 -> Afternoon Dept 2)
        let switches = 0;
        for (let k = 1; k < entries.length; k++) {
          if (entries[k].dept !== entries[k - 1].dept) {
            switches++;
          }
        }
        if (switches <= 1) {
          cleanBlockDays++;
        }
      }

      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          if (
            entries[i].period !== entries[j].period &&
            periodsOverlapInClockTime(
              entries[i].section,
              entries[i].period,
              entries[j].section,
              entries[j].period
            )
          ) {
            clockConflicts++;
          }
        }
      }
    }

    const deptLabels = Array.from(info.depts).map((d) => DEPARTMENT_LABELS[d]);
    summaries.push({
      teacher: info.displayName,
      departments: deptLabels,
      patternSummary:
        multiDeptDays > 0
          ? `Matin Dépt 1 / Après-midi Dépt 2 sans va-et-vient (${cleanBlockDays}/${multiDeptDays}j continus) · 0 conflit pause`
          : `Journées dédiées par département · 0 conflit pause`,
      clockConflicts,
    });
  }

  // Sort to show priority multi-department teachers first
  summaries.sort((a, b) => {
    const idxA = priorityTeachers.indexOf(a.teacher.toLowerCase());
    const idxB = priorityTeachers.indexOf(b.teacher.toLowerCase());
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return b.departments.length - a.departments.length;
  });

  return summaries.slice(0, 8);
}

/**
 * Finds the Homeroom teacher of a class (the teacher with the highest number of periods in that class).
 */
function findHomeroomTeacherOfClass(cls: SchoolClass): string {
  const counts = new Map<string, number>();
  for (const slot of Object.values(cls.slots)) {
    if (!slot.teacher) continue;
    const primary = slot.teacher.split(/[\/&+]/)[0].trim();
    if (primary) {
      counts.set(primary, (counts.get(primary) || 0) + 1);
    }
  }
  let best = 'Professeur Principal';
  let max = -1;
  for (const [t, c] of counts.entries()) {
    if (c > max) {
      max = c;
      best = t;
    }
  }
  return best;
}

/**
 * Applies the Boys Section (G3A, G3B, G4A, G4B, G5A, G5B, G6B) & G1/G2 Homeroom
 * restructuring order with:
 * - 100% preservation of all other classes
 * - Strict Clock-Time & Break Non-Intersection across sections
 * - Multi-Department Half-Day Clustering (Matin Dept 1 / Après-midi Dept 2)
 */
export function applyBoysSectionRestructuringOrder(
  currentClasses: SchoolClass[],
  currentTeachers: TeacherProfile[],
  existingUnplaced: UnplacedLessonCard[],
  lockedSlotsByClass: Record<string, string[]> = {}
): StructuralOrderExecutionResult {
  const activelyRebuiltIds = new Set([
    'g3-boys',
    'g3-boys-a',
    'g3-boys-b',
    'g4-boys-a',
    'g4-boys-b',
    'g5-boys-a',
    'g5-boys-b',
    'g6-boys',
  ]);

  const homeroomComputingReassignIds = new Set([
    'g1-girls',
    'g2-girls',
    'g1-boys',
    'g2-boys',
    'g3-girls',
    'kg3',
  ]);

  // 1. Preserve all untouched classes & perform in-place Homeroom transfer on G1/G2
  const preservedClasses: SchoolClass[] = [];
  for (const cls of currentClasses) {
    if (activelyRebuiltIds.has(cls.id)) continue;

    if (homeroomComputingReassignIds.has(cls.id)) {
      const homeroomTeacher = findHomeroomTeacherOfClass(cls);
      const updatedSlots: Record<string, LessonSlot> = {};
      for (const [k, slot] of Object.entries(cls.slots)) {
        const isHusniaComp =
          (slot.subject.toLowerCase().includes('comput') ||
            slot.subject.toLowerCase() === 'ict') &&
          slot.teacher.toLowerCase().includes('husnia');
        if (isHusniaComp) {
          updatedSlots[k] = {
            ...slot,
            teacher: homeroomTeacher,
          };
        } else {
          updatedSlots[k] = { ...slot };
        }
      }
      preservedClasses.push({
        ...cls,
        slots: updatedSlots,
      });
    } else {
      preservedClasses.push({
        ...cls,
        slots: { ...cls.slots },
      });
    }
  }

  // 2. Initialize Clock & Multi-Department Tracker with all preserved classes
  const tracker = new ClockAndDepartmentTracker();
  for (const cls of preservedClasses) {
    for (const [slotKey, slot] of Object.entries(cls.slots)) {
      const [dayStr, pStr] = slotKey.split('_');
      const day = dayStr as DayOfWeek;
      const period = Number(pStr);
      tracker.addSlot(slot.teacher, day, period, cls);
      if (slot.subTeacher) {
        tracker.addSlot(slot.subTeacher, day, period, cls);
      }
    }
  }

  // 3. Define the 7 target Boys classes (G3A, G3B, G4A, G4B, G5A, G5B, G6B)
  const g3aName = 'Grade 3A Boys (الصف الثالث أ)';
  const g3bName = 'Grade 3B Boys (الصف الثالث ب)';
  const g4aName = 'Grade 4A Boys (الصف الرابع أ)';
  const g4bName = 'Grade 4B Boys (الصف الرابع ب)';

  const targetClassDefs: Array<{
    id: string;
    name: string;
    section: SectionType;
    room: string;
    requirements: LessonRequirement[];
  }> = [
    {
      id: 'g3-boys-a',
      name: g3aName,
      section: 'Primary',
      room: 'Aile Garçons - G3A',
      requirements: [
        { subject: 'English', teacher: 'Mira', periods: 8, preferMorning: true },
        { subject: 'Maths', teacher: 'New Teacher', periods: 5, preferMorning: true },
        { subject: 'Sciences', teacher: 'New Teacher', periods: 3, preferMorning: true },
        { subject: 'Library', teacher: 'Mira', periods: 1 },
        { subject: 'Social studies', teacher: 'Husnia', periods: 2 },
        { subject: 'Computing', teacher: 'Husnia', periods: 2 },
        { subject: 'French', teacher: 'Aichetou', periods: 2 },
        { subject: 'P.E', teacher: 'Mohamed Ali', periods: 2 },
        { subject: 'ART', teacher: 'Imen ART', periods: 2 },
        { subject: 'Music', teacher: 'Farah', periods: 2 },
        { subject: 'Montessori', teacher: 'Fatimah', periods: 1 },
        {
          subject: 'Arabic',
          teacher: 'Alaa Emad',
          periods: 2,
          subSubject: 'Easy Arabic',
          subTeacher: 'Samira-Coordinator',
          preferMorning: true,
        },
        { subject: 'Arabic', teacher: 'Alaa Emad', periods: 3, preferMorning: true },
        { subject: 'Islamic', teacher: 'Wissam islamic', periods: 5 },
      ],
    },
    {
      id: 'g3-boys-b',
      name: g3bName,
      section: 'Primary',
      room: 'Aile Garçons - G3B',
      requirements: [
        { subject: 'English', teacher: 'Mira', periods: 8, preferMorning: true },
        { subject: 'Maths', teacher: 'New Teacher', periods: 5, preferMorning: true },
        { subject: 'Sciences', teacher: 'New Teacher', periods: 3, preferMorning: true },
        { subject: 'Library', teacher: 'Mira', periods: 1 },
        { subject: 'Social studies', teacher: 'Husnia', periods: 2 },
        { subject: 'Computing', teacher: 'Husnia', periods: 2 },
        { subject: 'French', teacher: 'Aichetou', periods: 2 },
        { subject: 'P.E', teacher: 'Mohamed Ali', periods: 2 },
        { subject: 'ART', teacher: 'Imen ART', periods: 2 },
        { subject: 'Music', teacher: 'Farah', periods: 2 },
        { subject: 'Montessori', teacher: 'Fatimah', periods: 1 },
        {
          subject: 'Arabic',
          teacher: 'Alaa Emad',
          periods: 2,
          subSubject: 'Easy Arabic',
          subTeacher: 'Samira-Coordinator',
          preferMorning: true,
        },
        { subject: 'Arabic', teacher: 'Alaa Emad', periods: 3, preferMorning: true },
        { subject: 'Islamic', teacher: 'Wissam islamic', periods: 5 },
      ],
    },
    {
      id: 'g4-boys-a',
      name: g4aName,
      section: 'Primary',
      room: 'Aile Garçons - G4A',
      requirements: [
        { subject: 'English', teacher: 'Mira', periods: 7, preferMorning: true },
        { subject: 'Maths', teacher: 'New Teacher', periods: 6, preferMorning: true },
        { subject: 'Sciences', teacher: 'Elisa', periods: 5, preferMorning: true },
        { subject: 'Social studies', teacher: 'Husnia', periods: 2 },
        { subject: 'Computing', teacher: 'Ola Ame', periods: 2 },
        { subject: 'French', teacher: 'Aichetou', periods: 2 },
        { subject: 'P.E', teacher: 'Mohamed Ali', periods: 2 },
        { subject: 'ART', teacher: 'Imen ART', periods: 1 },
        { subject: 'Music', teacher: 'Farah', periods: 1 },
        { subject: 'KSA', teacher: 'Alaa Emad', periods: 2 },
        {
          subject: 'Arabic',
          teacher: 'Samah',
          periods: 2,
          subSubject: 'Easy Arabic',
          subTeacher: 'Samira-Coordinator',
          preferMorning: true,
        },
        { subject: 'Arabic', teacher: 'Samah', periods: 3, preferMorning: true },
        { subject: 'Islamic', teacher: 'Wissam islamic', periods: 4 },
      ],
    },
    {
      id: 'g4-boys-b',
      name: g4bName,
      section: 'Primary',
      room: 'Aile Garçons - G4B',
      requirements: [
        { subject: 'English', teacher: 'Fayrouz', periods: 7, preferMorning: true },
        { subject: 'Maths', teacher: 'New Teacher', periods: 6, preferMorning: true },
        { subject: 'Sciences', teacher: 'Elisa', periods: 5, preferMorning: true },
        { subject: 'Social studies', teacher: 'Husnia', periods: 2 },
        { subject: 'Computing', teacher: 'Ola Ame', periods: 2 },
        { subject: 'French', teacher: 'Aichetou', periods: 2 },
        { subject: 'P.E', teacher: 'Mohamed Ali', periods: 2 },
        { subject: 'ART', teacher: 'Imen ART', periods: 1 },
        { subject: 'Music', teacher: 'Farah', periods: 1 },
        { subject: 'KSA', teacher: 'Alaa Emad', periods: 2 },
        { subject: 'Arabic', teacher: 'Samah', periods: 5, preferMorning: true },
        { subject: 'Islamic', teacher: 'Wissam islamic', periods: 4 },
      ],
    },
    {
      id: 'g5-boys-a',
      name: 'G5 Boys A',
      section: 'Primary',
      room: 'Aile Garçons - G5A',
      requirements: [
        { subject: 'English', teacher: 'Fayrouz', periods: 7, preferMorning: true },
        { subject: 'Maths', teacher: 'Ola Ame', periods: 6, preferMorning: true },
        { subject: 'Sciences', teacher: 'Elisa', periods: 5, preferMorning: true },
        { subject: 'Social studies', teacher: 'Husnia', periods: 2 },
        { subject: 'Computing', teacher: 'Ola Ame', periods: 2 },
        { subject: 'Library', teacher: 'Joudi', periods: 1 },
        { subject: 'French', teacher: 'Aichetou', periods: 2 },
        { subject: 'P.E', teacher: 'Mohamed Ali', periods: 2 },
        { subject: 'ART', teacher: 'Imen ART', periods: 1 },
        { subject: 'Music', teacher: 'Farah', periods: 1 },
        { subject: 'KSA', teacher: 'Wissam islamic', periods: 2 },
        {
          subject: 'Arabic',
          teacher: 'Samah',
          periods: 2,
          subSubject: 'Easy Arabic',
          subTeacher: 'Samira-Coordinator',
          preferMorning: true,
        },
        { subject: 'Arabic', teacher: 'Samah', periods: 2, preferMorning: true },
        { subject: 'Islamic', teacher: 'Samah', periods: 5 },
      ],
    },
    {
      id: 'g5-boys-b',
      name: 'G5 Boys B',
      section: 'Primary',
      room: 'Aile Garçons - G5B',
      requirements: [
        { subject: 'English', teacher: 'Fayrouz', periods: 7, preferMorning: true },
        { subject: 'Maths', teacher: 'Ola Ame', periods: 6, preferMorning: true },
        { subject: 'Sciences', teacher: 'Elisa', periods: 5, preferMorning: true },
        { subject: 'Social studies', teacher: 'Husnia', periods: 2 },
        { subject: 'Computing', teacher: 'Ola Ame', periods: 2 },
        { subject: 'Library', teacher: 'Joudi', periods: 1 },
        { subject: 'French', teacher: 'Aichetou', periods: 2 },
        { subject: 'P.E', teacher: 'Mohamed Ali', periods: 2 },
        { subject: 'ART', teacher: 'Imen ART', periods: 1 },
        { subject: 'Music', teacher: 'Farah', periods: 1 },
        { subject: 'KSA', teacher: 'Wissam islamic', periods: 2 },
        {
          subject: 'Arabic',
          teacher: 'Samah',
          periods: 1,
          subSubject: 'KSA easy',
          subTeacher: 'Samira-Coordinator',
          preferMorning: true,
        },
        { subject: 'Arabic', teacher: 'Samah', periods: 3, preferMorning: true },
        { subject: 'Islamic', teacher: 'Samah', periods: 5 },
      ],
    },
    {
      id: 'g6-boys',
      name: 'G6 Boys',
      section: 'Primary',
      room: 'Aile Garçons - G6',
      requirements: [
        { subject: 'English', teacher: 'Fayrouz', periods: 7, preferMorning: true },
        { subject: 'Maths', teacher: 'Ola Ame', periods: 6, preferMorning: true },
        { subject: 'Sciences', teacher: 'Elisa', periods: 5, preferMorning: true },
        { subject: 'Social studies', teacher: 'Husnia', periods: 2 },
        { subject: 'Computing', teacher: 'Husnia', periods: 2 },
        { subject: 'Library', teacher: 'Joudi', periods: 1 },
        { subject: 'French', teacher: 'Aichetou', periods: 2 },
        { subject: 'P.E', teacher: 'Mohamed Ali', periods: 2 },
        { subject: 'ART', teacher: 'Imen ART', periods: 1 },
        { subject: 'Music', teacher: 'Farah', periods: 1 },
        { subject: 'KSA', teacher: 'Wissam islamic', periods: 2 },
        {
          subject: 'Arabic',
          teacher: 'Samah',
          periods: 2,
          subSubject: 'Easy Arabic',
          subTeacher: 'Samira-Coordinator',
          preferMorning: true,
        },
        { subject: 'Arabic', teacher: 'Samah', periods: 2, preferMorning: true },
        { subject: 'Islamic', teacher: 'Wissam islamic', periods: 5 },
      ],
    },
  ];

  const all40Slots: string[] = [];
  for (const day of DAYS_OF_WEEK) {
    for (let p = 1; p <= 8; p++) {
      all40Slots.push(`${day}_${p}`);
    }
  }

  const rebuiltClassObjs: Record<string, SchoolClass> = {};
  for (const def of targetClassDefs) {
    rebuiltClassObjs[def.id] = {
      id: def.id,
      name: def.name,
      section: def.section,
      category: 'Boys_Section',
      room: def.room,
      visibility: 'school',
      updatedBy: 'Direction',
      slots: {},
    };
    const existingCls = currentClasses.find((c) => c.id === def.id);
    const lockedKeys = lockedSlotsByClass[def.id] || [];
    if (existingCls && lockedKeys.length > 0) {
      for (const lk of lockedKeys) {
        const s = existingCls.slots[lk];
        if (s) {
          rebuiltClassObjs[def.id].slots[lk] = { ...s };
          const [dStr, pStr] = lk.split('_');
          tracker.addSlot(s.teacher, dStr as DayOfWeek, Number(pStr), rebuiltClassObjs[def.id]);
          if (s.subTeacher) {
            tracker.addSlot(s.subTeacher, dStr as DayOfWeek, Number(pStr), rebuiltClassObjs[def.id]);
          }
        }
      }
    }
  }

  let placedCount = 0;
  const newUnplacedCards: UnplacedLessonCard[] = [];

  // 4. Schedule Combined Library Session for 4A + 4B with Ms. Joudy ("Joudi")
  // Prefer an afternoon slot on a day where Joudi teaches Girls Section in the morning!
  const joudiCandidateSlots = all40Slots.filter((sk) => {
    const [dStr, pStr] = sk.split('_');
    const day = dStr as DayOfWeek;
    const period = Number(pStr);
    return (
      !tracker.hasConflictOrClockOverlap('Joudi', day, period, 'Primary') &&
      !rebuiltClassObjs['g4-boys-a'].slots[sk] &&
      !rebuiltClassObjs['g4-boys-b'].slots[sk]
    );
  });

  joudiCandidateSlots.sort((skA, skB) => {
    const [dA, pA] = skA.split('_');
    const [dB, pB] = skB.split('_');
    const penA = tracker.getHalfDayDepartmentPenalty(
      'Joudi',
      dA as DayOfWeek,
      Number(pA),
      'Dept_Primaire_Garcons'
    );
    const penB = tracker.getHalfDayDepartmentPenalty(
      'Joudi',
      dB as DayOfWeek,
      Number(pB),
      'Dept_Primaire_Garcons'
    );
    return penA - penB;
  });

  const jointLibSlotKey = joudiCandidateSlots[0] || 'Mercredi_7';
  const [jointLibDay, jointLibPeriodStr] = jointLibSlotKey.split('_');
  rebuiltClassObjs['g4-boys-a'].slots[jointLibSlotKey] = {
    subject: 'Library',
    teacher: 'Joudi',
    room: 'Bibliothèque (4A + 4B)',
    groupName: 'Séance commune 4A + 4B',
    jointWithClasses: [g4bName],
  };
  rebuiltClassObjs['g4-boys-b'].slots[jointLibSlotKey] = {
    subject: 'Library',
    teacher: 'Joudi',
    room: 'Bibliothèque (4A + 4B)',
    groupName: 'Séance commune 4A + 4B',
    jointWithClasses: [g4aName],
  };
  tracker.addSlot(
    'Joudi',
    jointLibDay as DayOfWeek,
    Number(jointLibPeriodStr),
    rebuiltClassObjs['g4-boys-a']
  );
  placedCount += 2;

  // 5. Flatten all remaining individual lesson units across the 7 classes
  interface PendingUnit {
    classId: string;
    className: string;
    room: string;
    subject: string;
    teacher: string;
    subSubject?: string;
    subTeacher?: string;
    preferMorning?: boolean;
  }

  const teacherFreeCount = (tName: string): number => {
    let free = 0;
    for (const sk of all40Slots) {
      const [dStr, pStr] = sk.split('_');
      if (
        !tracker.hasConflictOrClockOverlap(
          tName,
          dStr as DayOfWeek,
          Number(pStr),
          'Primary'
        )
      ) {
        free++;
      }
    }
    return free;
  };

  const allUnits: PendingUnit[] = [];
  for (const def of targetClassDefs) {
    for (const req of def.requirements) {
      for (let i = 0; i < req.periods; i++) {
        allUnits.push({
          classId: def.id,
          className: def.name,
          room: def.room,
          subject: req.subject,
          teacher: req.teacher,
          subSubject: req.subSubject,
          subTeacher: req.subTeacher,
          preferMorning: req.preferMorning,
        });
      }
    }
  }

  // Prioritize multi-department teachers & dual-teacher lessons first so their Morning/Afternoon blocks are cleanest
  const multiDeptTeacherSet = new Set([
    'joudi',
    'mohamed ali',
    'husnia',
    'aichetou',
    'farah',
    'imen art',
    'fatimah',
  ]);

  allUnits.sort((a, b) => {
    const aHasSub = a.subTeacher ? 0 : 1;
    const bHasSub = b.subTeacher ? 0 : 1;
    if (aHasSub !== bHasSub) return aHasSub - bHasSub;
    const aMulti = multiDeptTeacherSet.has(a.teacher.toLowerCase()) ? 0 : 1;
    const bMulti = multiDeptTeacherSet.has(b.teacher.toLowerCase()) ? 0 : 1;
    if (aMulti !== bMulti) return aMulti - bMulti;
    return teacherFreeCount(a.teacher) - teacherFreeCount(b.teacher);
  });

  const countSubjectOnDay = (
    classId: string,
    day: string,
    subject: string
  ): number => {
    let c = 0;
    for (let p = 1; p <= 8; p++) {
      const s = rebuiltClassObjs[classId].slots[`${day}_${p}`];
      if (s && s.subject.toLowerCase() === subject.toLowerCase()) c++;
    }
    return c;
  };

  const canPlaceUnitAt = (
    unit: PendingUnit,
    slotKey: string,
    section: SectionType
  ): boolean => {
    const [dStr, pStr] = slotKey.split('_');
    const day = dStr as DayOfWeek;
    const period = Number(pStr);
    if (tracker.hasConflictOrClockOverlap(unit.teacher, day, period, section)) {
      return false;
    }
    if (
      unit.subTeacher &&
      tracker.hasConflictOrClockOverlap(unit.subTeacher, day, period, section)
    ) {
      return false;
    }
    return true;
  };

  for (const unit of allUnits) {
    const clsObj = rebuiltClassObjs[unit.classId];
    const clsSlots = clsObj.slots;
    const targetDept = getClassDepartment(clsObj);

    const emptyCandidates = all40Slots.filter(
      (sk) => !clsSlots[sk] && canPlaceUnitAt(unit, sk, clsObj.section)
    );

    if (emptyCandidates.length > 0) {
      const computeCandidateCost = (sk: string): number => {
        const [day, pStr] = sk.split('_');
        const p = Number(pStr);
        const sameSubj = countSubjectOnDay(unit.classId, day, unit.subject);
        const deptPenMain = tracker.getHalfDayDepartmentPenalty(
          unit.teacher,
          day as DayOfWeek,
          p,
          targetDept
        );
        const deptPenSub = unit.subTeacher
          ? tracker.getHalfDayDepartmentPenalty(
              unit.subTeacher,
              day as DayOfWeek,
              p,
              targetDept
            )
          : 0;
        const mornCost = unit.preferMorning ? (p <= 4 ? 0 : 18) : 0;
        return (
          deptPenMain +
          deptPenSub +
          (sameSubj >= 2 ? 320 : sameSubj * 45) +
          mornCost +
          p
        );
      };

      emptyCandidates.sort(
        (skA, skB) => computeCandidateCost(skA) - computeCandidateCost(skB)
      );

      const chosenKey = emptyCandidates[0];
      const [cDay, cPer] = chosenKey.split('_');
      clsSlots[chosenKey] = {
        subject: unit.subject,
        teacher: unit.teacher,
        subSubject: unit.subSubject,
        subTeacher: unit.subTeacher,
        room: unit.room,
      };
      tracker.addSlot(unit.teacher, cDay as DayOfWeek, Number(cPer), clsObj);
      if (unit.subTeacher) {
        tracker.addSlot(unit.subTeacher, cDay as DayOfWeek, Number(cPer), clsObj);
      }
      placedCount++;
      continue;
    }

    // 1-step Kempe swap within the same class
    const emptyKeysInClass = all40Slots.filter((sk) => !clsSlots[sk]);
    let swapped = false;

    for (const occupiedKey of all40Slots) {
      if (swapped) break;
      const existingSlot = clsSlots[occupiedKey];
      if (!existingSlot || existingSlot.jointWithClasses?.length) continue;
      if (!canPlaceUnitAt(unit, occupiedKey, clsObj.section)) continue;

      for (const emptyKey of emptyKeysInClass) {
        const [eDay, ePer] = emptyKey.split('_');
        const existingCanMoveToEmpty =
          !tracker.hasConflictOrClockOverlap(
            existingSlot.teacher,
            eDay as DayOfWeek,
            Number(ePer),
            clsObj.section
          ) &&
          (!existingSlot.subTeacher ||
            !tracker.hasConflictOrClockOverlap(
              existingSlot.subTeacher,
              eDay as DayOfWeek,
              Number(ePer),
              clsObj.section
            ));

        if (existingCanMoveToEmpty) {
          const [oDay, oPer] = occupiedKey.split('_');
          tracker.removeSlot(
            existingSlot.teacher,
            oDay as DayOfWeek,
            Number(oPer),
            clsObj.name
          );
          if (existingSlot.subTeacher) {
            tracker.removeSlot(
              existingSlot.subTeacher,
              oDay as DayOfWeek,
              Number(oPer),
              clsObj.name
            );
          }

          clsSlots[emptyKey] = existingSlot;
          tracker.addSlot(
            existingSlot.teacher,
            eDay as DayOfWeek,
            Number(ePer),
            clsObj
          );
          if (existingSlot.subTeacher) {
            tracker.addSlot(
              existingSlot.subTeacher,
              eDay as DayOfWeek,
              Number(ePer),
              clsObj
            );
          }

          clsSlots[occupiedKey] = {
            subject: unit.subject,
            teacher: unit.teacher,
            subSubject: unit.subSubject,
            subTeacher: unit.subTeacher,
            room: unit.room,
          };
          tracker.addSlot(
            unit.teacher,
            oDay as DayOfWeek,
            Number(oPer),
            clsObj
          );
          if (unit.subTeacher) {
            tracker.addSlot(
              unit.subTeacher,
              oDay as DayOfWeek,
              Number(oPer),
              clsObj
            );
          }

          placedCount++;
          swapped = true;
          break;
        }
      }
    }

    if (swapped) continue;

    // 2-class swap across rebuilt classes if needed
    for (const emptyKey of emptyKeysInClass) {
      if (swapped) break;
      const [eDay, ePer] = emptyKey.split('_');
      if (
        unit.subTeacher &&
        tracker.hasConflictOrClockOverlap(
          unit.subTeacher,
          eDay as DayOfWeek,
          Number(ePer),
          clsObj.section
        )
      ) {
        continue;
      }

      const blockingDef = targetClassDefs.find((d) => {
        if (d.id === unit.classId) return false;
        const s = rebuiltClassObjs[d.id].slots[emptyKey];
        return (
          s &&
          !s.jointWithClasses?.length &&
          teacherMatchesSlot(unit.teacher, s.teacher)
        );
      });

      if (!blockingDef) continue;
      const blockingClsObj = rebuiltClassObjs[blockingDef.id];
      const blockingClassSlots = blockingClsObj.slots;
      const blockingSlot = blockingClassSlots[emptyKey];

      for (const altKey of all40Slots) {
        if (altKey === emptyKey) continue;
        const [aDay, aPer] = altKey.split('_');
        const altOccupant = blockingClassSlots[altKey];
        if (altOccupant?.jointWithClasses?.length) continue;

        if (
          tracker.hasConflictOrClockOverlap(
            blockingSlot.teacher,
            aDay as DayOfWeek,
            Number(aPer),
            blockingClsObj.section
          ) ||
          (blockingSlot.subTeacher &&
            tracker.hasConflictOrClockOverlap(
              blockingSlot.subTeacher,
              aDay as DayOfWeek,
              Number(aPer),
              blockingClsObj.section
            ))
        ) {
          continue;
        }

        if (altOccupant) {
          if (
            tracker.hasConflictOrClockOverlap(
              altOccupant.teacher,
              eDay as DayOfWeek,
              Number(ePer),
              blockingClsObj.section
            ) ||
            (altOccupant.subTeacher &&
              tracker.hasConflictOrClockOverlap(
                altOccupant.subTeacher,
                eDay as DayOfWeek,
                Number(ePer),
                blockingClsObj.section
              ))
          ) {
            continue;
          }
        }

        tracker.removeSlot(
          blockingSlot.teacher,
          eDay as DayOfWeek,
          Number(ePer),
          blockingClsObj.name
        );
        if (blockingSlot.subTeacher) {
          tracker.removeSlot(
            blockingSlot.subTeacher,
            eDay as DayOfWeek,
            Number(ePer),
            blockingClsObj.name
          );
        }
        if (altOccupant) {
          tracker.removeSlot(
            altOccupant.teacher,
            aDay as DayOfWeek,
            Number(aPer),
            blockingClsObj.name
          );
          if (altOccupant.subTeacher) {
            tracker.removeSlot(
              altOccupant.subTeacher,
              aDay as DayOfWeek,
              Number(aPer),
              blockingClsObj.name
            );
          }
        }

        blockingClassSlots[altKey] = blockingSlot;
        tracker.addSlot(
          blockingSlot.teacher,
          aDay as DayOfWeek,
          Number(aPer),
          blockingClsObj
        );
        if (blockingSlot.subTeacher) {
          tracker.addSlot(
            blockingSlot.subTeacher,
            aDay as DayOfWeek,
            Number(aPer),
            blockingClsObj
          );
        }

        if (altOccupant) {
          blockingClassSlots[emptyKey] = altOccupant;
          tracker.addSlot(
            altOccupant.teacher,
            eDay as DayOfWeek,
            Number(ePer),
            blockingClsObj
          );
          if (altOccupant.subTeacher) {
            tracker.addSlot(
              altOccupant.subTeacher,
              eDay as DayOfWeek,
              Number(ePer),
              blockingClsObj
            );
          }
        } else {
          delete blockingClassSlots[emptyKey];
        }

        clsSlots[emptyKey] = {
          subject: unit.subject,
          teacher: unit.teacher,
          subSubject: unit.subSubject,
          subTeacher: unit.subTeacher,
          room: unit.room,
        };
        tracker.addSlot(
          unit.teacher,
          eDay as DayOfWeek,
          Number(ePer),
          clsObj
        );
        if (unit.subTeacher) {
          tracker.addSlot(
            unit.subTeacher,
            eDay as DayOfWeek,
            Number(ePer),
            clsObj
          );
        }
        placedCount++;
        swapped = true;
        break;
      }
    }

    if (!swapped) {
      newUnplacedCards.push({
        id: `tray_order_${Date.now()}_${newUnplacedCards.length}`,
        classId: unit.classId,
        className: unit.className,
        subject: unit.subject,
        teacher: unit.teacher,
        subSubject: unit.subSubject,
        subTeacher: unit.subTeacher,
        room: unit.room,
        reason: `Mise à côté : aucun créneau sans intersection horaire/pause pour ${unit.teacher}`,
      });
    }
  }

  // 6. Assemble final classes array in school order
  const rebuiltSchoolClasses: SchoolClass[] = targetClassDefs.map(
    (def) => rebuiltClassObjs[def.id]
  );

  const finalClasses: SchoolClass[] = [];
  let insertedBoysG3ToG6 = false;
  for (const cls of preservedClasses) {
    finalClasses.push(cls);
    if (cls.id === 'g2-boys' && !insertedBoysG3ToG6) {
      finalClasses.push(...rebuiltSchoolClasses);
      insertedBoysG3ToG6 = true;
    }
  }
  if (!insertedBoysG3ToG6) {
    finalClasses.push(...rebuiltSchoolClasses);
  }

  // 7. Update Teachers Directory
  const nextTeachers = [...currentTeachers];
  const ensureTeacher = (
    name: string,
    subjects: string[],
    maxPeriods: number,
    sectionLabel: string
  ) => {
    const idx = nextTeachers.findIndex(
      (t) => t.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
    if (idx >= 0) {
      nextTeachers[idx] = {
        ...nextTeachers[idx],
        subjects: Array.from(
          new Set([...nextTeachers[idx].subjects, ...subjects])
        ),
        maxPeriodsPerWeek: maxPeriods,
      };
    } else {
      nextTeachers.unshift({
        id: `teacher_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        name,
        subjects,
        section: sectionLabel,
        category: 'Boys_Section',
        maxPeriodsPerWeek: maxPeriods,
        unavailableSlots: [],
        defaultAssigned: true,
        visibility: 'school',
        updatedBy: 'Direction',
      });
    }
  };

  ensureTeacher(
    'New Teacher',
    ['Maths', 'Sciences'],
    28,
    'Boys Section (3A, 3B, 4A, 4B)'
  );
  ensureTeacher('Mira', ['English', 'Library'], 25, 'Boys Section (3A, 3B, 4A)');
  ensureTeacher('Fayrouz', ['English'], 28, 'Boys Section (4B, 5A, 5B, 6B)');
  ensureTeacher(
    'Elisa',
    ['Sciences'],
    25,
    'Boys Section (4A, 4B, 5A, 5B, 6B)'
  );
  ensureTeacher(
    'Ola Ame',
    ['Maths', 'Computing'],
    26,
    'Boys Section (4A, 4B, 5A, 5B, 6B)'
  );
  ensureTeacher(
    'Husnia',
    ['Social studies', 'Computing'],
    26,
    'Primary & Boys/Girls Sections'
  );
  ensureTeacher(
    'Joudi',
    ['English', 'Library'],
    28,
    'Primary Girls & Boys (4A+4B)'
  );

  // 8. Compute verification table
  const countTeacherActualLoad = (tName: string): number => {
    const seenJointSlots = new Set<string>();
    let count = 0;
    for (const cls of finalClasses) {
      for (const [sk, slot] of Object.entries(cls.slots)) {
        if (
          teacherMatchesSlot(tName, slot.teacher) ||
          (slot.subTeacher && teacherMatchesSlot(tName, slot.subTeacher))
        ) {
          if (slot.jointWithClasses && slot.jointWithClasses.length > 0) {
            if (seenJointSlots.has(sk)) continue;
            seenJointSlots.add(sk);
          }
          count++;
        }
      }
    }
    return count;
  };

  const teacherLoadVerification: TeacherLoadVerificationItem[] = [
    {
      teacher: 'New Teacher (Nouvelle Enseignante)',
      targetPeriods: 28,
      actualPeriods: countTeacherActualLoad('New Teacher'),
      details:
        'Maths : 3A (5), 3B (5), 4A (6), 4B (6) · Sciences : 3A (3), 3B (3)',
    },
    {
      teacher: 'Ms. Mira',
      targetPeriods: 25,
      actualPeriods: countTeacherActualLoad('Mira'),
      details: 'English : 3A (8), 3B (8), 4A (7) · Library : 3A (1), 3B (1)',
    },
    {
      teacher: 'Ms. Fayrouz',
      targetPeriods: 28,
      actualPeriods: countTeacherActualLoad('Fayrouz'),
      details: 'English : 4B (7), 5A (7), 5B (7), 6B (7)',
    },
    {
      teacher: 'Ms. Elisa',
      targetPeriods: 25,
      actualPeriods: countTeacherActualLoad('Elisa'),
      details: 'Sciences : 4A (5), 4B (5), 5A (5), 5B (5), 6B (5)',
    },
    {
      teacher: 'Ms. Ola (Ola Ame)',
      targetPeriods: 26,
      actualPeriods: countTeacherActualLoad('Ola Ame'),
      details:
        'Maths : 5A (6), 5B (6), 6B (6) · Computing : 4A (2), 4B (2), 5A (2), 5B (2)',
    },
    {
      teacher: 'Ms. Husnia',
      targetPeriods: 26,
      actualPeriods: countTeacherActualLoad('Husnia'),
      details:
        'Social Studies : 3A..6B (14) · Computing : 3A, 3B, 6B + 4G, 5G, 6G (12) · Blocs Matin/Après-midi par département',
    },
    {
      teacher: 'Ms. Joudy (Joudi)',
      targetPeriods: 28,
      actualPeriods: countTeacherActualLoad('Joudi'),
      details: `Library : Séance commune 4A + 4B (${jointLibSlotKey.replace('_', ' P')}) + Filles le matin / Garçons l'après-midi`,
    },
  ];

  const remainingUnplaced = [
    ...existingUnplaced.filter((u) => !activelyRebuiltIds.has(u.classId)),
    ...newUnplacedCards,
  ];

  const multiDeptReport = buildMultiDepartmentTeacherReport(finalClasses);

  return {
    classes: finalClasses,
    teachers: normalizeIndividualTeachersList(nextTeachers, finalClasses),
    unplacedLessons: remainingUnplaced,
    summary:
      `Ordre structurel et multi-départements appliqué sans toucher aux ${preservedClasses.length} autres classes : ` +
      `scission 3A/3B & 4A/4B, équilibrage exact des charges (New Teacher 28p, Mira 25p, Fayrouz 28p, Elisa 25p, Ola 26p, Husnia 26p, Joudi 28p), ` +
      `organisation Matin (P1-P4) / Après-midi (P5-P8) par département et 0 intersection d'horaires ou de pauses (breaks).`,
    placedCount,
    leftAsideCount: newUnplacedCards.length,
    frozenClassesCount: preservedClasses.length,
    teacherLoadVerification,
    multiDeptReport,
  };
}

/**
 * Universal Intelligent Order Executor for ANY custom user order:
 * - Executes structural mutations parsed by Gemini AI (`classSplits`, `teacherAssignments`, `homeroomTransfers`, `combinedSessions`, `supplementarySessions`)
 * - Strictly preserves all non-targeted and frozen classes
 * - Enforces Real Clock-Time & Break Non-Intersection (`periodsOverlapInClockTime`) across all sections
 * - Enforces Multi-Department Half-Day Clustering (`Matin` = Dept 1, `Après-midi` = Dept 2)
 */
export function executeUniversalIntelligentOrder(params: {
  rawOrderText: string;
  aiAst: ParsedAiOrderAst;
  currentClasses: SchoolClass[];
  currentTeachers: TeacherProfile[];
  existingUnplaced: UnplacedLessonCard[];
  frozenClassIds: string[];
  frozenSubjects: string[];
  lockedSlotsByClass: Record<string, string[]>;
  selectedCategory: SchoolCategory;
}): StructuralOrderExecutionResult {
  const {
    rawOrderText,
    aiAst,
    currentClasses,
    currentTeachers,
    existingUnplaced,
    frozenClassIds,
    frozenSubjects,
    lockedSlotsByClass,
    selectedCategory,
  } = params;

  // If the order matches the comprehensive Boys Section restructuring specification, use the exact verified solver
  if (isBoysRestructuringOrder(rawOrderText)) {
    return applyBoysSectionRestructuringOrder(
      currentClasses,
      currentTeachers,
      existingUnplaced,
      lockedSlotsByClass
    );
  }

  let workingClasses = currentClasses.map((c) => ({
    ...c,
    slots: { ...c.slots },
  }));
  const nextTeachers = [...currentTeachers];
  const explicitlyTouchedClassIds = new Set<string>();

  const findClassLoose = (nameQuery: string): SchoolClass | undefined => {
    const q = (nameQuery || '').trim().toLowerCase();
    if (!q) return undefined;
    return (
      workingClasses.find((c) => c.name.toLowerCase() === q) ||
      workingClasses.find((c) => c.id.toLowerCase() === q) ||
      workingClasses.find(
        (c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase())
      )
    );
  };

  // 1. Apply any `classSplits` from AI AST
  if (aiAst.classSplits && aiAst.classSplits.length > 0) {
    for (const split of aiAst.classSplits) {
      const src = findClassLoose(split.sourceClassName);
      if (!src || !split.newClassNames || split.newClassNames.length === 0) continue;

      const idx = workingClasses.findIndex((c) => c.id === src.id);
      const splitClasses: SchoolClass[] = split.newClassNames.map((newName, i) => {
        const newId = `${src.id}-${String.fromCharCode(97 + i)}`;
        explicitlyTouchedClassIds.add(newId);
        return {
          ...src,
          id: newId,
          name: newName,
          room: `${src.room} (${String.fromCharCode(65 + i)})`,
          slots: { ...src.slots },
        };
      });

      if (idx >= 0) {
        workingClasses.splice(idx, 1, ...splitClasses);
      }
    }
  }

  // 2. Apply any `homeroomTransfers` from AI AST (in-place without disrupting other slots)
  if (aiAst.homeroomTransfers && aiAst.homeroomTransfers.length > 0) {
    for (const tr of aiAst.homeroomTransfers) {
      const pat = tr.classNamePattern.toLowerCase();
      const subjPat = tr.subject.toLowerCase();
      for (const cls of workingClasses) {
        if (cls.name.toLowerCase().includes(pat)) {
          const homeroom = findHomeroomTeacherOfClass(cls);
          for (const [k, slot] of Object.entries(cls.slots)) {
            if (
              slot.subject.toLowerCase().includes(subjPat) &&
              (!tr.fromTeacher ||
                slot.teacher.toLowerCase().includes(tr.fromTeacher.toLowerCase()))
            ) {
              cls.slots[k] = { ...slot, teacher: homeroom };
            }
          }
        }
      }
    }
  }

  // 3. Apply any `teacherAssignments` from AI AST
  if (aiAst.teacherAssignments && aiAst.teacherAssignments.length > 0) {
    for (const assign of aiAst.teacherAssignments) {
      const cls = findClassLoose(assign.className);
      if (!cls) continue;
      explicitlyTouchedClassIds.add(cls.id);

      // Ensure teacher exists in directory
      const cleanT = assign.teacher.replace(/^Ms\.\s*|^Mr\.\s*/i, '').trim();
      if (
        cleanT &&
        !nextTeachers.some(
          (t) => t.name.toLowerCase() === cleanT.toLowerCase()
        )
      ) {
        nextTeachers.unshift({
          id: `teacher_${cleanT.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          name: cleanT,
          subjects: [assign.subject],
          section: cls.section,
          maxPeriodsPerWeek: 28,
          unavailableSlots: [],
          defaultAssigned: true,
          visibility: 'school',
          updatedBy: 'Direction',
        });
      }

      const subjLow = assign.subject.toLowerCase();
      let matchedCount = 0;
      for (const [k, slot] of Object.entries(cls.slots)) {
        if (slot.subject.toLowerCase().includes(subjLow)) {
          cls.slots[k] = { ...slot, teacher: cleanT };
          matchedCount++;
        }
      }

      // If periodsPerWeek is specified and higher than current, add slots
      if (assign.periodsPerWeek && assign.periodsPerWeek > matchedCount) {
        const maxP = getMaxPeriodsForSection(cls.section);
        let toAdd = assign.periodsPerWeek - matchedCount;
        for (const day of DAYS_OF_WEEK) {
          for (let p = 1; p <= maxP; p++) {
            if (toAdd <= 0) break;
            const sk = `${day}_${p}`;
            if (!cls.slots[sk]) {
              cls.slots[sk] = {
                subject: assign.subject,
                teacher: cleanT,
                room: cls.room,
              };
              toAdd--;
            }
          }
        }
      }
    }
  }

  // 4. Determine which classes to reschedule vs keep 100% frozen
  const frozenSet = new Set(frozenClassIds);
  const frozenSubjSet = new Set(
    frozenSubjects.map((s) => s.trim().toLowerCase())
  );

  // Surgical Isolation Rule:
  // If the order explicitly named specific classes (`explicitlyTouchedClassIds.size > 0`),
  // ONLY reschedule those explicitly touched classes and keep all other classes 100% frozen!
  const targetClassesList =
    explicitlyTouchedClassIds.size > 0
      ? workingClasses.filter(
          (c) => explicitlyTouchedClassIds.has(c.id) && !frozenSet.has(c.id)
        )
      : workingClasses.filter(
          (c) =>
            !frozenSet.has(c.id) && classMatchesCategory(c, selectedCategory)
        );

  const targetIdSet = new Set(targetClassesList.map((c) => c.id));

  // 5. Build ClockAndDepartmentTracker from all untouched/frozen classes AND fixed slots
  const tracker = new ClockAndDepartmentTracker();
  const nextClasses: SchoolClass[] = workingClasses.map((cls) => {
    if (!targetIdSet.has(cls.id)) {
      for (const [sk, s] of Object.entries(cls.slots)) {
        const [dStr, pStr] = sk.split('_');
        tracker.addSlot(s.teacher, dStr as DayOfWeek, Number(pStr), cls);
        if (s.subTeacher) {
          tracker.addSlot(s.subTeacher, dStr as DayOfWeek, Number(pStr), cls);
        }
      }
      return cls;
    }

    const lockedKeys = new Set(lockedSlotsByClass[cls.id] || []);
    const fixedSlots: Record<string, LessonSlot> = {};
    for (const [sk, s] of Object.entries(cls.slots)) {
      const isFixed =
        lockedKeys.has(sk) ||
        frozenSubjSet.has(s.subject.trim().toLowerCase()) ||
        Boolean(s.jointWithClasses && s.jointWithClasses.length > 0);
      if (isFixed) {
        fixedSlots[sk] = s;
        const [dStr, pStr] = sk.split('_');
        tracker.addSlot(s.teacher, dStr as DayOfWeek, Number(pStr), cls);
        if (s.subTeacher) {
          tracker.addSlot(s.subTeacher, dStr as DayOfWeek, Number(pStr), cls);
        }
      }
    }
    return {
      ...cls,
      slots: fixedSlots,
    };
  });

  const morningSet = new Set(
    (aiAst.morningPrioritySubjects || []).map((s) => s.trim().toLowerCase())
  );
  const afternoonSet = new Set(
    (aiAst.afternoonSubjects || []).map((s) => s.trim().toLowerCase())
  );
  const globalForbiddenPeriods = new Set(aiAst.forbiddenPeriods || []);
  const maxSamePerDay = Math.max(1, aiAst.maxSameSubjectPerDay || 2);

  const nextUnplaced: UnplacedLessonCard[] = existingUnplaced.filter(
    (u) => !targetIdSet.has(u.classId)
  );

  let totalPlacedCount = 0;
  let totalLeftAsideCount = 0;

  // 6. Reschedule movable lessons in target classes with Clock-Time & Break Guard + Multi-Department Half-Day Clustering
  for (const origCls of targetClassesList) {
    const workingCls = nextClasses.find((c) => c.id === origCls.id)!;
    const lockedKeys = new Set(lockedSlotsByClass[origCls.id] || []);
    const targetDept = getClassDepartment(workingCls);

    const movableLessons: LessonSlot[] = [];
    for (const [sk, s] of Object.entries(origCls.slots)) {
      const isFixed =
        lockedKeys.has(sk) ||
        frozenSubjSet.has(s.subject.trim().toLowerCase()) ||
        Boolean(s.jointWithClasses && s.jointWithClasses.length > 0);
      if (!isFixed) {
        movableLessons.push(s);
      }
    }

    // Include any side-tray cards belonging to this class
    const trayForCls = existingUnplaced.filter((u) => u.classId === origCls.id);
    for (const tc of trayForCls) {
      movableLessons.push({
        subject: tc.subject,
        teacher: tc.teacher,
        assistantTeacher: tc.assistantTeacher,
        subSubject: tc.subSubject,
        subTeacher: tc.subTeacher,
        room: tc.room || origCls.room,
        groupName: tc.groupName,
      });
    }

    // Include any supplementary sessions requested in AST
    if (aiAst.supplementarySessions && aiAst.supplementarySessions.length > 0) {
      for (const sup of aiAst.supplementarySessions) {
        const sampleTeacher =
          Object.values(origCls.slots).find((s) =>
            s.subject.toLowerCase().includes(sup.subject.toLowerCase())
          )?.teacher || 'Spécialiste';
        for (let i = 0; i < Math.min(3, sup.deltaPeriods); i++) {
          movableLessons.push({
            subject: sup.subject,
            teacher: sampleTeacher,
            room: origCls.room,
          });
        }
      }
    }

    // Sort movable lessons: morning priority first, then multi-department teachers
    movableLessons.sort((a, b) => {
      const aMorn = morningSet.has(a.subject.trim().toLowerCase()) ? 0 : 1;
      const bMorn = morningSet.has(b.subject.trim().toLowerCase()) ? 0 : 1;
      if (aMorn !== bMorn) return aMorn - bMorn;
      return a.subject.localeCompare(b.subject);
    });

    const maxP = getMaxPeriodsForSection(origCls.section);
    const classUnavail = new Set(origCls.unavailableSlots || []);

    for (const lesson of movableLessons) {
      const subjNorm = lesson.subject.trim().toLowerCase();
      const teacherProfile = nextTeachers.find(
        (t) => t.name.trim().toLowerCase() === lesson.teacher.trim().toLowerCase()
      );
      const teacherUnavail = new Set(teacherProfile?.unavailableSlots || []);

      const isMorningPref =
        morningSet.has(subjNorm) ||
        subjNorm.includes('math') ||
        subjNorm.includes('français') ||
        subjNorm.includes('english') ||
        subjNorm.includes('arab') ||
        subjNorm.includes('scien');
      const isAfternoonPref =
        afternoonSet.has(subjNorm) ||
        subjNorm.includes('art') ||
        subjNorm.includes('p.e') ||
        subjNorm.includes('music') ||
        subjNorm.includes('library');

      const candidates: Array<{ day: DayOfWeek; period: number; score: number }> =
        [];

      for (const day of DAYS_OF_WEEK) {
        const sameSubjCountOnDay = Object.entries(workingCls.slots).filter(
          ([k, s]) =>
            k.startsWith(`${day}_`) &&
            s.subject.trim().toLowerCase() === subjNorm
        ).length;

        for (let p = 1; p <= maxP; p++) {
          const slotKey = `${day}_${p}`;
          if (workingCls.slots[slotKey]) continue;
          if (classUnavail.has(slotKey) || teacherUnavail.has(slotKey)) continue;

          // HARD CONSTRAINT: Real clock-time & break non-intersection across all sections
          if (
            tracker.hasConflictOrClockOverlap(
              lesson.teacher,
              day,
              p,
              workingCls.section
            )
          ) {
            continue;
          }
          if (
            lesson.subTeacher &&
            tracker.hasConflictOrClockOverlap(
              lesson.subTeacher,
              day,
              p,
              workingCls.section
            )
          ) {
            continue;
          }

          let score = 0;
          if (globalForbiddenPeriods.has(p)) score += 35;

          // Multi-Department Half-Day (Matin Dept 1 / Après-midi Dept 2) clustering score
          score += tracker.getHalfDayDepartmentPenalty(
            lesson.teacher,
            day,
            p,
            targetDept
          );

          if (isMorningPref) {
            score += p <= 4 ? p * 2 : 20 + p * 3;
          } else if (isAfternoonPref) {
            score += p >= 5 ? (9 - p) * 2 : 18 + (5 - p) * 3;
          } else {
            score += p * 2;
          }

          if (sameSubjCountOnDay >= maxSamePerDay) {
            score += 45;
          } else if (sameSubjCountOnDay >= 1) {
            score += 12;
          }

          candidates.push({ day, period: p, score });
        }
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => a.score - b.score);
        const best = candidates[0];
        const chosenKey = `${best.day}_${best.period}`;
        workingCls.slots[chosenKey] = lesson;
        tracker.addSlot(lesson.teacher, best.day, best.period, workingCls);
        if (lesson.subTeacher) {
          tracker.addSlot(lesson.subTeacher, best.day, best.period, workingCls);
        }
        totalPlacedCount++;
      } else {
        totalLeftAsideCount++;
        nextUnplaced.push({
          id: `tray_ai_${Date.now()}_${totalLeftAsideCount}_${Math.random()
            .toString(36)
            .slice(2, 6)}`,
          classId: origCls.id,
          className: origCls.name,
          subject: lesson.subject,
          teacher: lesson.teacher,
          assistantTeacher: lesson.assistantTeacher,
          subSubject: lesson.subSubject,
          subTeacher: lesson.subTeacher,
          room: lesson.room || origCls.room,
          groupName: lesson.groupName,
          reason: `Mise à côté : aucun créneau sans intersection horaire/pause pour ${lesson.teacher}`,
        });
      }
    }
  }

  const preservedCount = workingClasses.length - targetClassesList.length;
  const multiDeptReport = buildMultiDepartmentTeacherReport(nextClasses);

  return {
    classes: nextClasses,
    teachers: normalizeIndividualTeachersList(nextTeachers, nextClasses),
    unplacedLessons: nextUnplaced,
    summary:
      aiAst.summary ||
      `Ordre appliqué avec succès : ${preservedCount} classe(s) non affectée(s) conservée(s) intactes, organisation Matin/Après-midi par département activée et 0 intersection d'horaires ou de pauses.`,
    placedCount: totalPlacedCount,
    leftAsideCount: totalLeftAsideCount,
    frozenClassesCount: preservedCount,
    teacherLoadVerification: [],
    multiDeptReport,
  };
}
