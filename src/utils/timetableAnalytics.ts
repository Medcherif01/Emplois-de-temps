import {
  BELL_SCHEDULES,
  DAYS_OF_WEEK,
  SCHOOL_INFO,
  teacherMatchesSlot,
} from '../data/alkawtharDefaults';
import {
  DayOfWeek,
  IntercalatedSessionInfo,
  LessonSlot,
  SchoolCategory,
  SchoolClass,
  SectionType,
  TeacherProfile,
} from '../types/timetable';
import { isCoreSubject, SubjectConfig } from '../engine/cspEngine';

export const CATEGORY_LABELS: Record<SchoolCategory, string> = {
  ALL: 'Toutes les Sections (35 Classes)',
  French_Section: 'French Section (Maternelle PS-GS, PP1-PP5, PEI & DP)',
  Boys_Section: 'Boys Section (G4-G12 Boys, Am.Boys, PEI-DP Garçons)',
  Girls_Section: 'Girls Section (G4-G12 Girls, Am.Girls, PEI-DP Filles)',
  American_Section: 'American Section (10-12 Am.Girls & Am.Boys)',
  KG_Primary: 'KG & Primary International (Pre-KG à G6)',
};

export const CATEGORY_SHORT_LABELS: Record<SchoolCategory, string> = {
  ALL: 'Toutes Sections',
  French_Section: 'French Section',
  Boys_Section: 'Boys Section',
  Girls_Section: 'Girls Section',
  American_Section: 'American Section',
  KG_Primary: 'KG & Primary',
};

/**
 * Checks whether a class belongs to a requested SchoolCategory.
 * Note: A class like "PEI1 Garçons" belongs to both French_Section and Boys_Section.
 * A class like "11 Am.Girls" belongs to both Girls_Section and American_Section.
 */
export function classMatchesCategory(
  cls: SchoolClass,
  category: SchoolCategory
): boolean {
  if (category === 'ALL') return true;
  if (cls.category === category) return true;

  const n = cls.name.toLowerCase();

  const isFrench =
    n === 'ps' ||
    n === 'ms' ||
    n === 'gs' ||
    n.startsWith('pp') ||
    n.startsWith('pei') ||
    n.startsWith('dp');

  const isBoys =
    n.includes('boys') ||
    n.includes('garçons') ||
    n.includes('garcons') ||
    cls.section === 'Secondary_Boys';

  const isAmerican =
    n.includes('am.') || n.includes('american');

  const isKGPrimary =
    cls.section === 'KG' ||
    cls.section === 'KG3_GS' ||
    cls.section === 'Primary';

  const isGirls =
    n.includes('girls') ||
    (!isBoys &&
      (cls.section === 'Secondary_Girls' ||
        n.startsWith('pei') ||
        n.startsWith('dp')));

  switch (category) {
    case 'French_Section':
      return isFrench;
    case 'Boys_Section':
      return isBoys;
    case 'Girls_Section':
      return isGirls;
    case 'American_Section':
      return isAmerican;
    case 'KG_Primary':
      return isKGPrimary;
    default:
      return true;
  }
}

export function getPrimaryClassCategory(
  cls: SchoolClass
): Exclude<SchoolCategory, 'ALL'> {
  if (cls.category) return cls.category;
  const n = cls.name.toLowerCase();
  if (n.includes('am.') || n.includes('american')) return 'American_Section';
  if (
    n === 'ps' ||
    n === 'ms' ||
    n === 'gs' ||
    n.startsWith('pp') ||
    n.startsWith('pei') ||
    n.startsWith('dp')
  ) {
    return 'French_Section';
  }
  if (n.includes('boys') || n.includes('garçons') || cls.section === 'Secondary_Boys') {
    return 'Boys_Section';
  }
  if (n.includes('girls') || cls.section === 'Secondary_Girls') {
    return 'Girls_Section';
  }
  return 'KG_Primary';
}

export function teacherMatchesCategory(
  teacher: TeacherProfile,
  category: SchoolCategory,
  classes: SchoolClass[]
): boolean {
  if (category === 'ALL') return true;
  if (teacher.category === category) return true;

  // Check if the teacher teaches in any class belonging to this category
  for (const cls of classes) {
    if (!classMatchesCategory(cls, category)) continue;
    for (const slot of Object.values(cls.slots)) {
      if (
        teacherMatchesSlot(teacher.name, slot.teacher) ||
        (slot.subTeacher && teacherMatchesSlot(teacher.name, slot.subTeacher))
      ) {
        return true;
      }
    }
  }

  const sec = teacher.section.toLowerCase();
  if (category === 'Boys_Section' && sec.includes('boys')) return true;
  if (category === 'Girls_Section' && sec.includes('girls')) return true;
  if (category === 'KG_Primary' && (sec.includes('kg') || sec.includes('primary')))
    return true;

  return false;
}

export function subjectMatchesCategory(
  subjectName: string,
  category: SchoolCategory,
  classes: SchoolClass[],
  explicitCategory?: Exclude<SchoolCategory, 'ALL'>
): boolean {
  if (category === 'ALL') return true;
  if (explicitCategory === category) return true;

  const sLow = subjectName.toLowerCase();
  for (const cls of classes) {
    if (!classMatchesCategory(cls, category)) continue;
    for (const slot of Object.values(cls.slots)) {
      if (
        slot.subject.toLowerCase() === sLow ||
        slot.subSubject?.toLowerCase() === sLow
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Returns aSc Horaires 2024 authentic color styling for a given subject name,
 * matching the user's attached screenshot (`image_46d5a6f3.png`).
 */
export function getSubjectVisualStyle(subjectName: string): {
  bgHex: string;
  textHex: string;
  borderHex: string;
} {
  const s = (subjectName || '').trim().toLowerCase();

  if (s.includes('arabic easy') || s.includes('easy arabic')) {
    return { bgHex: '#67e8f9', textHex: '#0f172a', borderHex: '#0891b2' };
  }
  if (s.includes('arabic') || s.includes('arabe')) {
    return { bgHex: '#fde047', textHex: '#0f172a', borderHex: '#ca8a04' };
  }
  if (
    s.includes('ap-calculus') ||
    s.includes('ap-claculus') ||
    s.includes('pre-calculus') ||
    s.includes('ppre-calculus') ||
    s.includes('calculus')
  ) {
    return { bgHex: '#1d4ed8', textHex: '#ffffff', borderHex: '#1e3a8a' };
  }
  if (s.includes('algebra')) {
    return { bgHex: '#7e22ce', textHex: '#ffffff', borderHex: '#581c87' };
  }
  if (s.includes('statistics')) {
    return { bgHex: '#3730a3', textHex: '#ffffff', borderHex: '#1e1b4b' };
  }
  if (s.includes('physics') || s.includes('physique')) {
    return { bgHex: '#bae6fd', textHex: '#0f172a', borderHex: '#0284c7' };
  }
  if (s.includes('chemistry') || s.includes('chimie')) {
    return { bgHex: '#fb923c', textHex: '#0f172a', borderHex: '#c2410c' };
  }
  if (s.includes('biology') || s.includes('biologie')) {
    return { bgHex: '#d97706', textHex: '#ffffff', borderHex: '#92400e' };
  }
  if (s.includes('science')) {
    return { bgHex: '#f87171', textHex: '#0f172a', borderHex: '#b91c1c' };
  }
  if (s.includes('math')) {
    return { bgHex: '#22c55e', textHex: '#0f172a', borderHex: '#15803d' };
  }
  if (s.includes('english') || s.includes('anglais')) {
    return { bgHex: '#22d3ee', textHex: '#0f172a', borderHex: '#0891b2' };
  }
  if (s.includes('french') || s.includes('français') || s === 'l.l') {
    return { bgHex: '#fda4af', textHex: '#0f172a', borderHex: '#e11d48' };
  }
  if (s.includes('islamic') || s === 'is') {
    return { bgHex: '#6b21a8', textHex: '#ffffff', borderHex: '#4c1d95' };
  }
  if (s.includes('p.e') || s.includes('sport')) {
    return { bgHex: '#16a34a', textHex: '#ffffff', borderHex: '#14532d' };
  }
  if (
    s.includes('computer') ||
    s.includes('computing') ||
    s.includes('ict') ||
    s.includes('snt') ||
    s.includes('html')
  ) {
    return { bgHex: '#bef264', textHex: '#0f172a', borderHex: '#65a30d' };
  }
  if (
    s.includes('history') ||
    s.includes('ancient') ||
    s.includes('modern') ||
    s.includes('ksa') ||
    s.includes('social')
  ) {
    return { bgHex: '#86efac', textHex: '#0f172a', borderHex: '#16a34a' };
  }
  if (
    s.includes('accounting') ||
    s.includes('economics') ||
    s.includes('business') ||
    s.includes('ses')
  ) {
    return { bgHex: '#c084fc', textHex: '#0f172a', borderHex: '#7e22ce' };
  }
  if (s.includes('library')) {
    return { bgHex: '#f9a8d4', textHex: '#0f172a', borderHex: '#db2777' };
  }
  if (s.includes('design') || s.includes('art') || s.includes('music')) {
    return { bgHex: '#cbd5e1', textHex: '#0f172a', borderHex: '#64748b' };
  }

  // Deterministic vibrant fallback for custom subjects
  const palette = [
    { bgHex: '#fcd34d', textHex: '#0f172a', borderHex: '#b45309' },
    { bgHex: '#93c5fd', textHex: '#0f172a', borderHex: '#1d4ed8' },
    { bgHex: '#f9a8d4', textHex: '#0f172a', borderHex: '#be185d' },
    { bgHex: '#a7f3d0', textHex: '#0f172a', borderHex: '#047857' },
    { bgHex: '#ddd6fe', textHex: '#0f172a', borderHex: '#6d28d9' },
  ];
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) % palette.length;
  }
  return palette[Math.abs(hash) % palette.length];
}

export interface SwitchCandidateAssessment {
  targetKey: string; // e.g. "Lundi_2"
  day: DayOfWeek;
  period: number;
  targetSlot?: LessonSlot;
  status: 'optimal' | 'possible_warn' | 'blocked';
  scoreDelta: number;
  reason: string;
}

/**
 * Evaluates all 40 period slots in a class row to determine how intelligent & safe
 * a switch with `fromKey` is, checking all 35 classes for teacher collisions,
 * teacher unavailability, locked slots, and pedagogical morning/afternoon placement.
 */
export function evaluateRowSwitchCompatibility(
  targetClass: SchoolClass,
  fromKey: string,
  allClasses: SchoolClass[],
  teachers: TeacherProfile[],
  lockedSlotKeys: Set<string>
): Record<string, SwitchCandidateAssessment> {
  const results: Record<string, SwitchCandidateAssessment> = {};
  const slotA = targetClass.slots[fromKey];
  const [fromDay, fromPeriodStr] = fromKey.split('_');
  const fromPeriod = Number(fromPeriodStr);

  const teacherUnavail = new Map<string, Set<string>>();
  teachers.forEach((t) =>
    teacherUnavail.set(t.name.trim().toLowerCase(), new Set(t.unavailableSlots))
  );

  // Build teacher busy map across all OTHER classes
  const isTeacherBusyInOtherClass = (
    teacherRaw: string | undefined,
    slotKey: string
  ): string | null => {
    if (!teacherRaw) return null;
    const parts = teacherRaw
      .split(/[\/&+]/)
      .map((p) => p.trim())
      .filter(Boolean);

    for (const part of parts) {
      for (const cls of allClasses) {
        if (cls.id === targetClass.id) continue;
        // If this class is intentionally joined with targetClass at slotKey, allow
        const s = cls.slots[slotKey];
        if (!s) continue;
        if (
          teacherMatchesSlot(part, s.teacher) ||
          (s.subTeacher && teacherMatchesSlot(part, s.subTeacher))
        ) {
          return `${part} enseigne déjà en ${cls.name}`;
        }
      }
    }
    return null;
  };

  const isTeacherUnavailableAt = (
    teacherRaw: string | undefined,
    slotKey: string
  ): string | null => {
    if (!teacherRaw) return null;
    const parts = teacherRaw
      .split(/[\/&+]/)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    for (const part of parts) {
      if (teacherUnavail.get(part)?.has(slotKey)) {
        return `${teacherRaw} est déclaré(e) indisponible sur ${slotKey.replace('_', ' P')}`;
      }
    }
    return null;
  };

  for (const day of DAYS_OF_WEEK) {
    for (let period = 1; period <= 8; period++) {
      const targetKey = `${day}_${period}`;
      const slotB = targetClass.slots[targetKey];

      if (targetKey === fromKey) {
        results[targetKey] = {
          targetKey,
          day,
          period,
          targetSlot: slotB,
          status: 'optimal',
          scoreDelta: 0,
          reason: 'Séance actuellement sélectionnée',
        };
        continue;
      }

      if (lockedSlotKeys.has(fromKey) || lockedSlotKeys.has(targetKey)) {
        results[targetKey] = {
          targetKey,
          day,
          period,
          targetSlot: slotB,
          status: 'blocked',
          scoreDelta: -99,
          reason: 'Créneau verrouillé par la direction (HC_04)',
        };
        continue;
      }

      // Check if Teacher A can move to targetKey
      if (slotA) {
        const unavailA =
          isTeacherUnavailableAt(slotA.teacher, targetKey) ||
          isTeacherUnavailableAt(slotA.subTeacher, targetKey);
        if (unavailA) {
          results[targetKey] = {
            targetKey,
            day,
            period,
            targetSlot: slotB,
            status: 'blocked',
            scoreDelta: -50,
            reason: unavailA,
          };
          continue;
        }

        const busyA =
          isTeacherBusyInOtherClass(slotA.teacher, targetKey) ||
          isTeacherBusyInOtherClass(slotA.subTeacher, targetKey);
        if (busyA) {
          results[targetKey] = {
            targetKey,
            day,
            period,
            targetSlot: slotB,
            status: 'blocked',
            scoreDelta: -50,
            reason: `Collision : ${busyA}`,
          };
          continue;
        }
      }

      // Check if Teacher B can move to fromKey
      if (slotB) {
        const unavailB =
          isTeacherUnavailableAt(slotB.teacher, fromKey) ||
          isTeacherUnavailableAt(slotB.subTeacher, fromKey);
        if (unavailB) {
          results[targetKey] = {
            targetKey,
            day,
            period,
            targetSlot: slotB,
            status: 'blocked',
            scoreDelta: -50,
            reason: unavailB,
          };
          continue;
        }

        const busyB =
          isTeacherBusyInOtherClass(slotB.teacher, fromKey) ||
          isTeacherBusyInOtherClass(slotB.subTeacher, fromKey);
        if (busyB) {
          results[targetKey] = {
            targetKey,
            day,
            period,
            targetSlot: slotB,
            status: 'blocked',
            scoreDelta: -50,
            reason: `Collision : ${busyB}`,
          };
          continue;
        }
      }

      // Both teachers are 100% free! Compute pedagogical score delta
      let scoreDelta = 2;
      const reasons: string[] = ['100% sans conflit enseignant'];

      const aIsCore = slotA ? isCoreSubject(slotA.subject) : false;
      const bIsCore = slotB ? isCoreSubject(slotB.subject) : false;

      if (aIsCore && fromPeriod >= 5 && period <= 4 && !bIsCore) {
        scoreDelta += 5;
        reasons.push(`Place ${slotA?.subject} le matin (P${period})`);
      } else if (bIsCore && period >= 5 && fromPeriod <= 4 && !aIsCore) {
        scoreDelta += 5;
        reasons.push(`Place ${slotB?.subject} le matin (P${fromPeriod})`);
      } else if (aIsCore && fromPeriod <= 4 && period >= 6 && !bIsCore) {
        scoreDelta -= 3;
        reasons.push(`Attention : déplace ${slotA?.subject} l'après-midi`);
      }

      // Check daily repetition on target day for slotA
      if (slotA && day !== fromDay) {
        let countOnTargetDay = 0;
        for (let p = 1; p <= 8; p++) {
          if (p === period) continue;
          if (
            targetClass.slots[`${day}_${p}`]?.subject.toLowerCase() ===
            slotA.subject.toLowerCase()
          ) {
            countOnTargetDay++;
          }
        }
        if (countOnTargetDay >= 2) {
          scoreDelta -= 4;
          reasons.push(`Crée une 3e séance de ${slotA.subject} le ${day}`);
        }
      }

      results[targetKey] = {
        targetKey,
        day,
        period,
        targetSlot: slotB,
        status: scoreDelta >= 0 ? 'optimal' : 'possible_warn',
        scoreDelta,
        reason: reasons.join(' · '),
      };
    }
  }

  return results;
}

/**
 * Parses a time string like "9:50 - 10:35" into minutes from midnight [startMin, endMin].
 */
function parseTimeWindowMinutes(timeStr: string): [number, number] | null {
  const parts = timeStr.split('-').map((s) => s.trim());
  if (parts.length !== 2) return null;
  const parseOne = (hm: string) => {
    const [hStr, mStr] = hm.split(':');
    let h = Number(hStr);
    const m = Number(mStr);
    if (isNaN(h) || isNaN(m)) return null;
    if (h >= 1 && h <= 6) h += 12; // 1:05 -> 13:05 if written in 12h
    return h * 60 + m;
  };
  const start = parseOne(parts[0]);
  const end = parseOne(parts[1]);
  if (start === null || end === null) return null;
  return [start, end];
}

export function getPeriodClockTime(section: SectionType, period: number): string {
  const rows = BELL_SCHEDULES[section] || BELL_SCHEDULES.Primary;
  const found = rows.find(
    (r) => r.type === 'period' && r.periodNumber === period
  );
  return found?.time || '8:00 - 8:45';
}

/**
 * Detects all intercalated / split / joint / bell-overlapping sessions across the school
 * ("monter qu'il ya des seance qui s'intercale").
 */
export function detectIntercalatedSessions(
  classes: SchoolClass[]
): IntercalatedSessionInfo[] {
  const list: IntercalatedSessionInfo[] = [];
  const seenJoint = new Set<string>();

  // 1. In-class split groups / co-teaching & joint classes
  for (const cls of classes) {
    for (const [key, slot] of Object.entries(cls.slots)) {
      const [dayStr, pStr] = key.split('_');
      const day = dayStr as DayOfWeek;
      const period = Number(pStr);
      const timeWindow = getPeriodClockTime(cls.section, period);

      if (slot.jointWithClasses && slot.jointWithClasses.length > 0) {
        const allNames = [cls.name, ...slot.jointWithClasses].sort();
        const sig = `${key}__${allNames.join('+')}`;
        if (!seenJoint.has(sig)) {
          seenJoint.add(sig);
          list.push({
            id: `joint_${sig}`,
            kind: 'joint_classes',
            day,
            period,
            classNames: allNames,
            teachers: slot.subTeacher
              ? [slot.teacher, slot.subTeacher]
              : [slot.teacher],
            subjects: slot.subSubject
              ? [slot.subject, slot.subSubject]
              : [slot.subject],
            timeWindowA: timeWindow,
            description: `Classes rassemblées (${allNames.join(' + ')}) en simultané le ${day} P${period} (${timeWindow}) pour ${slot.subject}.`,
          });
        }
      }

      if (
        (slot.subSubject && slot.subTeacher) ||
        slot.teacher.includes('/') ||
        slot.teacher.includes('&') ||
        slot.isIntercalated
      ) {
        list.push({
          id: `split_${cls.id}_${key}`,
          kind: 'split_group',
          day,
          period,
          classNames: [cls.name],
          teachers: slot.subTeacher
            ? [slot.teacher, slot.subTeacher]
            : slot.teacher.split(/[\/&+]/).map((s) => s.trim()),
          subjects: slot.subSubject
            ? [slot.subject, slot.subSubject]
            : [slot.subject],
          timeWindowA: timeWindow,
          description: slot.subSubject
            ? `Séance intercalée / dédoublée en ${cls.name} (${day} P${period}) : ${slot.subject} (${slot.teacher}) ⇄ ${slot.subSubject} (${slot.subTeacher}).`
            : `Co-enseignement simultané en ${cls.name} (${day} P${period}) : ${slot.subject} animé par ${slot.teacher}.`,
        });
      }
    }
  }

  // 2. Cross-section bell schedule intercalation (when a teacher teaches in two sections on the same day
  // whose clock times overlap because of staggered breaks, e.g. Primary P3 9:50-10:35 vs Secondary P3 9:30-10:15 / P4 10:45-11:25)
  const teacherDayEntries = new Map<
    string,
    Array<{
      cls: SchoolClass;
      day: DayOfWeek;
      period: number;
      slot: LessonSlot;
      timeStr: string;
      minutes: [number, number];
    }>
  >();

  for (const cls of classes) {
    for (const [key, slot] of Object.entries(cls.slots)) {
      const [dayStr, pStr] = key.split('_');
      const day = dayStr as DayOfWeek;
      const period = Number(pStr);
      const timeStr = getPeriodClockTime(cls.section, period);
      const minutes = parseTimeWindowMinutes(timeStr);
      if (!minutes) continue;

      const teachersInSlot = [
        ...slot.teacher.split(/[\/&+]/).map((s) => s.trim()),
        ...(slot.subTeacher
          ? slot.subTeacher.split(/[\/&+]/).map((s) => s.trim())
          : []),
      ].filter(Boolean);

      for (const tName of teachersInSlot) {
        const mapKey = `${tName.toLowerCase()}__${day}`;
        if (!teacherDayEntries.has(mapKey)) {
          teacherDayEntries.set(mapKey, []);
        }
        teacherDayEntries.get(mapKey)!.push({
          cls,
          day,
          period,
          slot,
          timeStr,
          minutes,
        });
      }
    }
  }

  for (const [, entries] of teacherDayEntries.entries()) {
    if (entries.length < 2) continue;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        if (a.cls.section === b.cls.section && a.period === b.period) continue;
        if (a.cls.section === b.cls.section) continue;

        const [startA, endA] = a.minutes;
        const [startB, endB] = b.minutes;
        // Check if clock windows overlap (startA < endB && startB < endA)
        const overlapMinutes = Math.min(endA, endB) - Math.max(startA, startB);
        if (overlapMinutes > 0) {
          list.push({
            id: `bell_intercal_${a.cls.id}_${b.cls.id}_${a.day}_${a.period}_${b.period}`,
            kind: 'cross_section_bell_overlap',
            day: a.day,
            period: a.period,
            classNames: [a.cls.name, b.cls.name],
            teachers: [a.slot.teacher],
            subjects: [a.slot.subject, b.slot.subject],
            timeWindowA: `P${a.period} (${a.timeStr})`,
            timeWindowB: `P${b.period} (${b.timeStr})`,
            description: `Horaire intercalé inter-sections (${overlapMinutes} min de chevauchement dû aux pauses décalées) : ${a.slot.teacher} en ${a.cls.name} [P${a.period}: ${a.timeStr}] ⇄ ${b.cls.name} [P${b.period}: ${b.timeStr}].`,
          });
        }
      }
    }
  }

  return list;
}

export interface TeacherLoadRow {
  teacherId: string;
  teacherName: string;
  category: Exclude<SchoolCategory, 'ALL'>;
  sectionLabel: string;
  subjects: string[];
  totalPeriods: number;
  maxPeriods: number;
  utilizationPercent: number;
  classBreakdown: Array<{
    classId: string;
    className: string;
    subject: string;
    periods: number;
  }>;
  jointAndSplitCount: number;
}

export function computeTeachersLoadReport(
  teachers: TeacherProfile[],
  classes: SchoolClass[],
  categoryFilter: SchoolCategory = 'ALL'
): TeacherLoadRow[] {
  return teachers
    .filter((t) => teacherMatchesCategory(t, categoryFilter, classes))
    .map((t) => {
      const breakdownMap = new Map<
        string,
        { classId: string; className: string; subject: string; periods: number }
      >();
      let totalPeriods = 0;
      let jointAndSplitCount = 0;
      const catsCount = new Map<Exclude<SchoolCategory, 'ALL'>, number>();

      for (const cls of classes) {
        const clsCat = getPrimaryClassCategory(cls);
        for (const slot of Object.values(cls.slots)) {
          const matchPrimary = teacherMatchesSlot(t.name, slot.teacher);
          const matchSub =
            slot.subTeacher && teacherMatchesSlot(t.name, slot.subTeacher);

          if (matchPrimary || matchSub) {
            const subj = matchPrimary
              ? slot.subject
              : slot.subSubject || slot.subject;
            totalPeriods += 1;
            catsCount.set(clsCat, (catsCount.get(clsCat) || 0) + 1);
            if (
              slot.jointWithClasses?.length ||
              (slot.subSubject && slot.subTeacher) ||
              slot.teacher.includes('/') ||
              slot.teacher.includes('&')
            ) {
              jointAndSplitCount += 1;
            }
            const bKey = `${cls.id}__${subj}`;
            if (!breakdownMap.has(bKey)) {
              breakdownMap.set(bKey, {
                classId: cls.id,
                className: cls.name,
                subject: subj,
                periods: 0,
              });
            }
            breakdownMap.get(bKey)!.periods += 1;
          }
        }
      }

      let primaryCat: Exclude<SchoolCategory, 'ALL'> =
        t.category || 'KG_Primary';
      if (!t.category && catsCount.size > 0) {
        primaryCat = Array.from(catsCount.entries()).sort(
          (a, b) => b[1] - a[1]
        )[0][0];
      }

      const maxPeriods = t.maxPeriodsPerWeek || 24;
      return {
        teacherId: t.id,
        teacherName: t.name,
        category: primaryCat,
        sectionLabel: CATEGORY_SHORT_LABELS[primaryCat],
        subjects: t.subjects,
        totalPeriods,
        maxPeriods,
        utilizationPercent: Math.round((totalPeriods / maxPeriods) * 100),
        classBreakdown: Array.from(breakdownMap.values()).sort((a, b) =>
          a.className.localeCompare(b.className)
        ),
        jointAndSplitCount,
      };
    });
}

export interface SubjectLoadRow {
  subjectName: string;
  category: Exclude<SchoolCategory, 'ALL'>;
  totalPeriodsAcrossSchool: number;
  classesCount: number;
  teachersInvolved: string[];
  classAllocations: Array<{
    classId: string;
    className: string;
    category: Exclude<SchoolCategory, 'ALL'>;
    scheduledPeriods: number;
    targetPeriods: number;
    teachers: string[];
  }>;
}

export function computeSubjectsLoadReport(
  classes: SchoolClass[],
  subjectConfigs: SubjectConfig[],
  categoryFilter: SchoolCategory = 'ALL'
): SubjectLoadRow[] {
  const subjMap = new Map<
    string,
    {
      displayName: string;
      teachers: Set<string>;
      byClass: Map<
        string,
        {
          classId: string;
          className: string;
          category: Exclude<SchoolCategory, 'ALL'>;
          scheduledPeriods: number;
          targetPeriods: number;
          teachers: Set<string>;
        }
      >;
    }
  >();

  // Ensure configured subjects are present
  for (const cfg of subjectConfigs) {
    subjMap.set(cfg.name.toLowerCase(), {
      displayName: cfg.name,
      teachers: new Set(),
      byClass: new Map(),
    });
  }

  for (const cls of classes) {
    if (!classMatchesCategory(cls, categoryFilter)) continue;
    const clsCat = getPrimaryClassCategory(cls);

    // Also include explicit subjectLoads even if 0 scheduled slots
    if (cls.subjectLoads) {
      for (const [sName, targetLoad] of Object.entries(cls.subjectLoads)) {
        const sKey = sName.trim().toLowerCase();
        if (!subjMap.has(sKey)) {
          subjMap.set(sKey, {
            displayName: sName.trim(),
            teachers: new Set(),
            byClass: new Map(),
          });
        }
        const entry = subjMap.get(sKey)!;
        if (!entry.byClass.has(cls.id)) {
          entry.byClass.set(cls.id, {
            classId: cls.id,
            className: cls.name,
            category: clsCat,
            scheduledPeriods: 0,
            targetPeriods: targetLoad,
            teachers: new Set(),
          });
        }
      }
    }

    for (const slot of Object.values(cls.slots)) {
      const register = (sRaw?: string, tRaw?: string) => {
        if (!sRaw || !sRaw.trim()) return;
        const sKey = sRaw.trim().toLowerCase();
        if (!subjMap.has(sKey)) {
          subjMap.set(sKey, {
            displayName: sRaw.trim(),
            teachers: new Set(),
            byClass: new Map(),
          });
        }
        const entry = subjMap.get(sKey)!;
        if (tRaw) entry.teachers.add(tRaw.trim());

        if (!entry.byClass.has(cls.id)) {
          const defaultTarget =
            cls.subjectLoads?.[sRaw.trim()] ||
            subjectConfigs.find((c) => c.name.toLowerCase() === sKey)
              ?.weeklyPeriodsDefault ||
            0;
          entry.byClass.set(cls.id, {
            classId: cls.id,
            className: cls.name,
            category: clsCat,
            scheduledPeriods: 0,
            targetPeriods: defaultTarget,
            teachers: new Set(),
          });
        }
        const clsAlloc = entry.byClass.get(cls.id)!;
        clsAlloc.scheduledPeriods += 1;
        if (clsAlloc.targetPeriods === 0) {
          clsAlloc.targetPeriods = clsAlloc.scheduledPeriods;
        }
        if (tRaw) clsAlloc.teachers.add(tRaw.trim());
      };

      register(slot.subject, slot.teacher);
      if (slot.subSubject && slot.subTeacher) {
        register(slot.subSubject, slot.subTeacher);
      }
    }
  }

  const rows: SubjectLoadRow[] = [];
  for (const [, val] of subjMap.entries()) {
    const classAllocations = Array.from(val.byClass.values()).map((c) => ({
      classId: c.classId,
      className: c.className,
      category: c.category,
      scheduledPeriods: c.scheduledPeriods,
      targetPeriods: c.targetPeriods || c.scheduledPeriods,
      teachers: Array.from(c.teachers),
    }));

    if (categoryFilter !== 'ALL' && classAllocations.length === 0) continue;

    const totalPeriodsAcrossSchool = classAllocations.reduce(
      (acc, c) => acc + c.scheduledPeriods,
      0
    );

    const dominantCategory =
      classAllocations[0]?.category || 'French_Section';

    rows.push({
      subjectName: val.displayName,
      category: dominantCategory,
      totalPeriodsAcrossSchool,
      classesCount: classAllocations.length,
      teachersInvolved: Array.from(val.teachers),
      classAllocations,
    });
  }

  return rows.sort(
    (a, b) => b.totalPeriodsAcrossSchool - a.totalPeriodsAcrossSchool
  );
}

/**
 * Generates an official printable A4 Landscape HTML/PDF report for:
 * - Teachers Load ("Imprimer Load Teachers")
 * - Subjects Load ("Imprimer Load Subjects")
 */
export function generatePrintableLoadReportHtml(
  mode: 'teachers_load' | 'subjects_load',
  teacherRows: TeacherLoadRow[],
  subjectRows: SubjectLoadRow[],
  categoryFilter: SchoolCategory,
  schoolYear: string
): string {
  const esc = (s: string) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const title =
    mode === 'teachers_load'
      ? `ÉTAT OFFICIEL DES CHARGES HORAIRES ENSEIGNANTS (TEACHERS LOAD)`
      : `ÉTAT OFFICIEL DES VOLUMES HORAIRES PAR MATIÈRE & CLASSE (SUBJECTS LOAD)`;

  const tableHtml =
    mode === 'teachers_load'
      ? `
    <table>
      <thead>
        <tr>
          <th style="width: 40px;">#</th>
          <th style="width: 180px;">Enseignant(e)</th>
          <th style="width: 130px;">Catégorie / Section</th>
          <th style="width: 160px;">Matières Enseignées</th>
          <th>Détail des Séances par Classe (Load par Classe)</th>
          <th style="width: 95px; text-align: center;">Séances / Sem</th>
          <th style="width: 90px; text-align: center;">Max Autorisé</th>
          <th style="width: 95px; text-align: center;">Taux Charge</th>
        </tr>
      </thead>
      <tbody>
        ${teacherRows
          .map(
            (r, idx) => `
          <tr>
            <td style="text-align: center; font-family: monospace;">${idx + 1}</td>
            <td style="font-weight: 700;">${esc(r.teacherName)}</td>
            <td><span class="badge">${esc(r.sectionLabel)}</span></td>
            <td>${esc(r.subjects.join(', '))}</td>
            <td>
              ${r.classBreakdown
                .map(
                  (b) =>
                    `<span class="chip"><strong>${esc(b.className)}</strong> (${esc(
                      b.subject
                    )}: ${b.periods}p)</span>`
                )
                .join(' ')}
            </td>
            <td style="text-align: center; font-weight: 800; font-family: monospace; font-size: 13px;">
              ${r.totalPeriods} p
            </td>
            <td style="text-align: center; font-family: monospace;">
              ${r.maxPeriods} p
            </td>
            <td style="text-align: center; font-weight: 700; color: ${
              r.totalPeriods > r.maxPeriods
                ? '#b91c1c'
                : r.totalPeriods < 8
                ? '#b45309'
                : '#15803d'
            };">
              ${r.utilizationPercent}%
            </td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>`
      : `
    <table>
      <thead>
        <tr>
          <th style="width: 40px;">#</th>
          <th style="width: 160px;">Matière (Subject)</th>
          <th style="width: 130px;">Catégorie Principale</th>
          <th style="width: 95px; text-align: center;">Classes</th>
          <th style="width: 110px; text-align: center;">Volume Total</th>
          <th>Répartition du Load par Classe & Enseignants Affectés</th>
        </tr>
      </thead>
      <tbody>
        ${subjectRows
          .map((s, idx) => {
            const style = getSubjectVisualStyle(s.subjectName);
            return `
          <tr>
            <td style="text-align: center; font-family: monospace;">${idx + 1}</td>
            <td>
              <span style="display:inline-block;width:12px;height:12px;background:${
                style.bgHex
              };border:1px solid ${
              style.borderHex
            };border-radius:2px;margin-right:6px;vertical-align:middle;"></span>
              <strong>${esc(s.subjectName)}</strong>
            </td>
            <td><span class="badge">${esc(
              CATEGORY_SHORT_LABELS[s.category]
            )}</span></td>
            <td style="text-align: center; font-weight: 700; font-family: monospace;">
              ${s.classesCount}
            </td>
            <td style="text-align: center; font-weight: 800; font-family: monospace; font-size: 13px;">
              ${s.totalPeriodsAcrossSchool} p/sem
            </td>
            <td>
              ${s.classAllocations
                .map(
                  (c) =>
                    `<span class="chip"><strong>${esc(c.className)}</strong>: ${
                      c.scheduledPeriods
                    }p (${esc(c.teachers.join(', '))})</span>`
                )
                .join(' ')}
            </td>
          </tr>
        `;
          })
          .join('')}
      </tbody>
    </table>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)} — Al-Kawthar International Schools</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; color: #0f172a; margin: 0; padding: 12px; background: #fff; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; background: #0f172a; color: #fff; padding: 10px 16px; border-radius: 6px; margin-bottom: 14px; }
    .toolbar button { background: #0284c7; color: #fff; border: none; padding: 8px 16px; border-radius: 5px; font-weight: 700; cursor: pointer; }
    .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
    .header h1 { margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 0.4px; }
    .header p { margin: 3px 0 0; font-size: 11px; color: #475569; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #334155; padding: 6px 8px; text-align: left; vertical-align: middle; }
    th { background: #f1f5f9; font-weight: 800; text-transform: uppercase; font-size: 10px; color: #0f172a; }
    tr:nth-child(even) td { background: #f8fafc; }
    .badge { display: inline-block; padding: 2px 6px; background: #e0f2fe; color: #0369a1; border-radius: 4px; font-weight: 700; font-size: 10px; }
    .chip { display: inline-block; margin: 1px 3px 1px 0; padding: 2px 5px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 3px; font-size: 10px; }
    @media print { .toolbar { display: none !important; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <div><strong>${esc(title)}</strong> — Filtre : ${esc(
    CATEGORY_LABELS[categoryFilter]
  )}</div>
    <button onclick="window.print()">Imprimer / Enregistrer en PDF Paysage</button>
  </div>
  <div class="header">
    <div>
      <h1>${esc(title)}</h1>
      <p>${esc(SCHOOL_INFO.subtitle)} · Catégorie : ${esc(
    CATEGORY_LABELS[categoryFilter]
  )} · Année Scolaire ${esc(schoolYear)}</p>
    </div>
    <div style="text-align: right; font-size: 11px; font-weight: 600;">
      Généré le ${esc(SCHOOL_INFO.generatedDate)} · aSc Horaires & ChronoScolaire AI
    </div>
  </div>
  ${tableHtml}
</body>
</html>`;
}

/**
 * Generates a standalone printable A4/A3 Landscape HTML/PDF of the Master "Ensemble"
 * All-Classes color-coded timetable matrix.
 */
export function generatePrintableEnsembleHtml(
  classes: SchoolClass[],
  categoryFilter: SchoolCategory,
  schoolYear: string
): string {
  const esc = (s: string) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const filtered = classes.filter((c) =>
    classMatchesCategory(c, categoryFilter)
  );

  const dayHeaders = DAYS_OF_WEEK.map(
    (d) => `<th colspan="8" class="day-th">${esc(d)}</th>`
  ).join('');

  const periodSubHeaders = DAYS_OF_WEEK.map(() =>
    [1, 2, 3, 4, 5, 6, 7, 8]
      .map((p) => `<th class="p-th">${p}</th>`)
      .join('')
  ).join('');

  const rowsHtml = filtered
    .map((cls) => {
      const cells = DAYS_OF_WEEK.map((day) =>
        [1, 2, 3, 4, 5, 6, 7, 8]
          .map((p) => {
            const slot = cls.slots[`${day}_${p}`];
            if (!slot) return `<td class="empty-cell"></td>`;
            const st = getSubjectVisualStyle(slot.subject);
            return `<td style="background:${st.bgHex};color:${st.textHex};border:1px solid #1e293b;">
              <div class="s-name">${esc(slot.subject)}</div>
              <div class="t-name">${esc(slot.teacher)}</div>
            </td>`;
          })
          .join('')
      ).join('');

      return `<tr>
        <td class="cls-col">${esc(cls.name)}</td>
        ${cells}
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Vue Ensemble Toutes les Classes — Al-Kawthar International Schools</title>
  <style>
    @page { size: A3 landscape; margin: 5mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 8px; background: #fff; color: #0f172a; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; background: #0f172a; color: #fff; padding: 8px 14px; border-radius: 6px; margin-bottom: 8px; }
    .toolbar button { background: #0284c7; color: #fff; border: none; padding: 6px 14px; border-radius: 4px; font-weight: 700; cursor: pointer; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #334155; text-align: center; vertical-align: middle; overflow: hidden; padding: 1px; }
    .cls-col { width: 88px; background: #cbd5e1; font-weight: 800; font-size: 9px; text-align: left; padding-left: 4px; }
    .day-th { background: #cbd5e1; font-size: 10px; font-weight: 800; padding: 3px 0; }
    .p-th { background: #e2e8f0; font-size: 8px; font-weight: 700; padding: 2px 0; }
    .s-name { font-size: 7.5px; font-weight: 800; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .t-name { font-size: 6.5px; opacity: 0.85; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .empty-cell { background: #f8fafc; }
    @media print { .toolbar { display: none !important; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <div><strong>aSc Horaires & ChronoScolaire AI — Vue Ensemble (${esc(
      CATEGORY_LABELS[categoryFilter]
    )}) · ${esc(schoolYear)}</strong></div>
    <button onclick="window.print()">Imprimer / Exporter PDF Paysage</button>
  </div>
  <table>
    <thead>
      <tr>
        <th rowspan="2" class="cls-col">Classe</th>
        ${dayHeaders}
      </tr>
      <tr>
        ${periodSubHeaders}
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</body>
</html>`;
}
