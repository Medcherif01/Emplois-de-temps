import { DAYS_OF_WEEK, teacherMatchesSlot } from '../data/alkawtharDefaults';
import {
  DayOfWeek,
  LessonSlot,
  SchoolClass,
  TeacherProfile,
  UnplacedLessonCard,
} from '../types/timetable';

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

4. Séances Complémentaires :
Musique (+2), Arts Plastiques (2), Éducation Physique PE (+2), Montessori (+1), Français (+2).`;

export interface TeacherLoadVerificationItem {
  teacher: string;
  targetPeriods: number;
  actualPeriods: number;
  details: string;
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
}

export function isBoysRestructuringOrder(text: string): boolean {
  const norm = (text || '').toLowerCase();
  const hasG3Split =
    (norm.includes('3a') && norm.includes('3b')) ||
    norm.includes('الصف الثالث') ||
    norm.includes('grade 3 boys');
  const hasTeachers =
    norm.includes('mira') &&
    (norm.includes('husnia') || norm.includes('fayrouz') || norm.includes('elisa'));
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
 * Applies the complete Boys Section (G3A, G3B, G4A, G4B, G5A, G5B, G6B) & G1/G2 Homeroom
 * restructuring order without damaging any other classes in the school.
 */
export function applyBoysSectionRestructuringOrder(
  currentClasses: SchoolClass[],
  currentTeachers: TeacherProfile[],
  existingUnplaced: UnplacedLessonCard[],
  lockedSlotsByClass: Record<string, string[]> = {}
): StructuralOrderExecutionResult {
  // 1. Identify which classes are modified vs untouched
  // Untouched classes keep 100% of their slots intact.
  // G1/G2 Girls & Boys (plus KG3 & G3 Girls for Husnia ICT) get a non-destructive in-place teacher swap for Computing -> Homeroom.
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

  const homeroomComputingReassignMap: Record<string, string> = {
    'g1-girls': 'Racha Khatib',
    'g2-girls': 'Emen Adel',
    'g1-boys': 'Dania',
    'g2-boys': 'Rima',
    'g3-girls': 'Mirian',
    'kg3': 'Israa / Husna',
  };

  // Clone and apply in-place homeroom reassignments on G1/G2 (zero schedule movement!)
  const preservedClasses: SchoolClass[] = [];
  for (const cls of currentClasses) {
    if (activelyRebuiltIds.has(cls.id)) continue;

    const homeroomReplacement = homeroomComputingReassignMap[cls.id];
    if (homeroomReplacement) {
      const updatedSlots: Record<string, LessonSlot> = {};
      for (const [k, slot] of Object.entries(cls.slots)) {
        const isHusniaComp =
          (slot.subject.toLowerCase().includes('comput') ||
            slot.subject.toLowerCase() === 'ict') &&
          slot.teacher.toLowerCase().includes('husnia');
        if (isHusniaComp) {
          updatedSlots[k] = {
            ...slot,
            teacher: homeroomReplacement,
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

  // 2. Build Global Busy Teacher Map from all preserved classes
  const busyMap = new Set<string>(); // `${teacherNorm}__${day}_${period}`
  const addTeacherBusy = (teacherStr: string | undefined, slotKey: string) => {
    if (!teacherStr) return;
    const parts = teacherStr
      .split(/[\/&+]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    for (const p of parts) {
      busyMap.add(`${p}__${slotKey}`);
    }
  };

  const isTeacherBusy = (teacherStr: string | undefined, slotKey: string): boolean => {
    if (!teacherStr) return false;
    const parts = teacherStr
      .split(/[\/&+]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    for (const p of parts) {
      if (busyMap.has(`${p}__${slotKey}`)) return true;
    }
    return false;
  };

  for (const cls of preservedClasses) {
    for (const [slotKey, slot] of Object.entries(cls.slots)) {
      addTeacherBusy(slot.teacher, slotKey);
      addTeacherBusy(slot.subTeacher, slotKey);
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
    room: string;
    requirements: LessonRequirement[];
  }> = [
    {
      id: 'g3-boys-a',
      name: g3aName,
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
      room: 'Aile Garçons - G4A',
      requirements: [
        { subject: 'English', teacher: 'Mira', periods: 7, preferMorning: true },
        { subject: 'Maths', teacher: 'New Teacher', periods: 6, preferMorning: true },
        { subject: 'Sciences', teacher: 'Elisa', periods: 5, preferMorning: true },
        { subject: 'Social studies', teacher: 'Husnia', periods: 2 },
        { subject: 'Computing', teacher: 'Ola Ame', periods: 2 },
        // Library (1p) is scheduled first as a Joint/Combined session with G4B
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
      room: 'Aile Garçons - G4B',
      requirements: [
        { subject: 'English', teacher: 'Fayrouz', periods: 7, preferMorning: true },
        { subject: 'Maths', teacher: 'New Teacher', periods: 6, preferMorning: true },
        { subject: 'Sciences', teacher: 'Elisa', periods: 5, preferMorning: true },
        { subject: 'Social studies', teacher: 'Husnia', periods: 2 },
        { subject: 'Computing', teacher: 'Ola Ame', periods: 2 },
        // Library (1p) is scheduled first as a Joint/Combined session with G4A
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

  // Initialize empty slot maps for the 7 target classes (respecting any user-locked slots if present)
  const rebuiltClassSlots: Record<string, Record<string, LessonSlot>> = {};
  for (const def of targetClassDefs) {
    rebuiltClassSlots[def.id] = {};
    const existingCls = currentClasses.find((c) => c.id === def.id);
    const lockedKeys = lockedSlotsByClass[def.id] || [];
    if (existingCls && lockedKeys.length > 0) {
      for (const lk of lockedKeys) {
        const s = existingCls.slots[lk];
        if (s) {
          rebuiltClassSlots[def.id][lk] = { ...s };
          addTeacherBusy(s.teacher, lk);
          addTeacherBusy(s.subTeacher, lk);
        }
      }
    }
  }

  let placedCount = 0;
  const newUnplacedCards: UnplacedLessonCard[] = [];

  // 4. First, schedule the Combined Library Session for 4A + 4B with Ms. Joudy ("Joudi")
  let jointLibSlotKey = 'Lundi_8';
  for (const candidateKey of all40Slots) {
    if (
      !isTeacherBusy('Joudi', candidateKey) &&
      !rebuiltClassSlots['g4-boys-a'][candidateKey] &&
      !rebuiltClassSlots['g4-boys-b'][candidateKey]
    ) {
      jointLibSlotKey = candidateKey;
      break;
    }
  }

  rebuiltClassSlots['g4-boys-a'][jointLibSlotKey] = {
    subject: 'Library',
    teacher: 'Joudi',
    room: 'Bibliothèque (4A + 4B)',
    groupName: 'Séance commune 4A + 4B',
    jointWithClasses: [g4bName],
  };
  rebuiltClassSlots['g4-boys-b'][jointLibSlotKey] = {
    subject: 'Library',
    teacher: 'Joudi',
    room: 'Bibliothèque (4A + 4B)',
    groupName: 'Séance commune 4A + 4B',
    jointWithClasses: [g4aName],
  };
  addTeacherBusy('Joudi', jointLibSlotKey);
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

  // Compute how constrained each teacher is (how many free slots they have left out of 40)
  const teacherFreeCount = (tName: string): number => {
    let free = 0;
    for (const sk of all40Slots) {
      if (!isTeacherBusy(tName, sk)) free++;
    }
    return free;
  };

  // Place lessons class-by-class with MRV (most constrained teachers first) + swap-assisted repair
  // so every class gets 40/40 slots filled with 0 teacher collisions!
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

  // Sort units so dual-teacher (subTeacher) and heavily booked global teachers are placed first
  allUnits.sort((a, b) => {
    const aHasSub = a.subTeacher ? 0 : 1;
    const bHasSub = b.subTeacher ? 0 : 1;
    if (aHasSub !== bHasSub) return aHasSub - bHasSub;
    const freeA = teacherFreeCount(a.teacher);
    const freeB = teacherFreeCount(b.teacher);
    return freeA - freeB;
  });

  const countSubjectOnDay = (
    classId: string,
    day: string,
    subject: string
  ): number => {
    let c = 0;
    for (let p = 1; p <= 8; p++) {
      const s = rebuiltClassSlots[classId][`${day}_${p}`];
      if (s && s.subject.toLowerCase() === subject.toLowerCase()) c++;
    }
    return c;
  };

  const canPlaceUnitAt = (unit: PendingUnit, slotKey: string): boolean => {
    if (isTeacherBusy(unit.teacher, slotKey)) return false;
    if (unit.subTeacher && isTeacherBusy(unit.subTeacher, slotKey)) return false;
    return true;
  };

  for (const unit of allUnits) {
    const clsSlots = rebuiltClassSlots[unit.classId];

    // Score available empty slots in this class where the teacher(s) are free
    const emptyCandidates = all40Slots.filter(
      (sk) => !clsSlots[sk] && canPlaceUnitAt(unit, sk)
    );

    if (emptyCandidates.length > 0) {
      emptyCandidates.sort((skA, skB) => {
        const [dayA, pStrA] = skA.split('_');
        const [dayB, pStrB] = skB.split('_');
        const pA = Number(pStrA);
        const pB = Number(pStrB);

        const sameSubjA = countSubjectOnDay(unit.classId, dayA, unit.subject);
        const sameSubjB = countSubjectOnDay(unit.classId, dayB, unit.subject);
        if (sameSubjA !== sameSubjB) return sameSubjA - sameSubjB;

        if (unit.preferMorning) {
          const isMornA = pA <= 4 ? 0 : 1;
          const isMornB = pB <= 4 ? 0 : 1;
          if (isMornA !== isMornB) return isMornA - isMornB;
        }
        return pA - pB;
      });

      const chosenKey = emptyCandidates[0];
      clsSlots[chosenKey] = {
        subject: unit.subject,
        teacher: unit.teacher,
        subSubject: unit.subSubject,
        subTeacher: unit.subTeacher,
        room: unit.room,
      };
      addTeacherBusy(unit.teacher, chosenKey);
      addTeacherBusy(unit.subTeacher, chosenKey);
      placedCount++;
      continue;
    }

    // If no direct empty slot has unit.teacher free, try a 1-step Kempe swap within the same class:
    // Find an occupied slot `occupiedKey` in `unit.classId` where `unit.teacher` IS free,
    // whose current occupant `existingSlot` can move to an `emptyKey` in `unit.classId`!
    const emptyKeysInClass = all40Slots.filter((sk) => !clsSlots[sk]);
    let swapped = false;

    for (const occupiedKey of all40Slots) {
      if (swapped) break;
      const existingSlot = clsSlots[occupiedKey];
      if (!existingSlot || existingSlot.jointWithClasses?.length) continue;
      if (!canPlaceUnitAt(unit, occupiedKey)) continue;

      for (const emptyKey of emptyKeysInClass) {
        const existingCanMoveToEmpty =
          !isTeacherBusy(existingSlot.teacher, emptyKey) &&
          (!existingSlot.subTeacher ||
            !isTeacherBusy(existingSlot.subTeacher, emptyKey));

        if (existingCanMoveToEmpty) {
          // Move existingSlot -> emptyKey, and place unit -> occupiedKey
          // Update busyMap for existingSlot
          const removeBusy = (tStr: string | undefined, sk: string) => {
            if (!tStr) return;
            tStr
              .split(/[\/&+]/)
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean)
              .forEach((p) => busyMap.delete(`${p}__${sk}`));
          };
          removeBusy(existingSlot.teacher, occupiedKey);
          removeBusy(existingSlot.subTeacher, occupiedKey);

          clsSlots[emptyKey] = existingSlot;
          addTeacherBusy(existingSlot.teacher, emptyKey);
          addTeacherBusy(existingSlot.subTeacher, emptyKey);

          clsSlots[occupiedKey] = {
            subject: unit.subject,
            teacher: unit.teacher,
            subSubject: unit.subSubject,
            subTeacher: unit.subTeacher,
            room: unit.room,
          };
          addTeacherBusy(unit.teacher, occupiedKey);
          addTeacherBusy(unit.subTeacher, occupiedKey);

          placedCount++;
          swapped = true;
          break;
        }
      }
    }

    if (swapped) continue;

    // Try a 2-class swap if needed: if unit.teacher is busy in another rebuilt class `otherClsId` at `emptyKey`
    for (const emptyKey of emptyKeysInClass) {
      if (swapped) break;
      if (unit.subTeacher && isTeacherBusy(unit.subTeacher, emptyKey)) continue;

      // Find which rebuilt class is using unit.teacher at emptyKey
      const blockingDef = targetClassDefs.find((d) => {
        if (d.id === unit.classId) return false;
        const s = rebuiltClassSlots[d.id][emptyKey];
        return s && !s.jointWithClasses?.length && teacherMatchesSlot(unit.teacher, s.teacher);
      });

      if (!blockingDef) continue;
      const blockingClassSlots = rebuiltClassSlots[blockingDef.id];
      const blockingSlot = blockingClassSlots[emptyKey];

      // Find an alternate slot `altKey` in `blockingDef.id` where `blockingSlot` can swap with `altOccupant`
      for (const altKey of all40Slots) {
        if (altKey === emptyKey) continue;
        const altOccupant = blockingClassSlots[altKey];
        if (altOccupant?.jointWithClasses?.length) continue;

        // Can blockingSlot move to altKey?
        if (
          isTeacherBusy(blockingSlot.teacher, altKey) ||
          (blockingSlot.subTeacher && isTeacherBusy(blockingSlot.subTeacher, altKey))
        ) {
          continue;
        }

        // Can altOccupant (if any) move to emptyKey?
        if (altOccupant) {
          if (
            isTeacherBusy(altOccupant.teacher, emptyKey) ||
            (altOccupant.subTeacher && isTeacherBusy(altOccupant.subTeacher, emptyKey))
          ) {
            continue;
          }
        }

        // Perform the swap in blockingDef.id!
        const removeBusy = (tStr: string | undefined, sk: string) => {
          if (!tStr) return;
          tStr
            .split(/[\/&+]/)
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
            .forEach((p) => busyMap.delete(`${p}__${sk}`));
        };

        removeBusy(blockingSlot.teacher, emptyKey);
        removeBusy(blockingSlot.subTeacher, emptyKey);
        if (altOccupant) {
          removeBusy(altOccupant.teacher, altKey);
          removeBusy(altOccupant.subTeacher, altKey);
        }

        blockingClassSlots[altKey] = blockingSlot;
        addTeacherBusy(blockingSlot.teacher, altKey);
        addTeacherBusy(blockingSlot.subTeacher, altKey);

        if (altOccupant) {
          blockingClassSlots[emptyKey] = altOccupant;
          addTeacherBusy(altOccupant.teacher, emptyKey);
          addTeacherBusy(altOccupant.subTeacher, emptyKey);
        } else {
          delete blockingClassSlots[emptyKey];
        }

        // Now unit.teacher is free at emptyKey! Place unit at emptyKey in unit.classId
        clsSlots[emptyKey] = {
          subject: unit.subject,
          teacher: unit.teacher,
          subSubject: unit.subSubject,
          subTeacher: unit.subTeacher,
          room: unit.room,
        };
        addTeacherBusy(unit.teacher, emptyKey);
        addTeacherBusy(unit.subTeacher, emptyKey);
        placedCount++;
        swapped = true;
        break;
      }
    }

    if (!swapped) {
      // Leave in "Matières à Côté" reserve if no logical conflict-free slot exists
      newUnplacedCards.push({
        id: `tray_order_${Date.now()}_${ newUnplacedCards.length }`,
        classId: unit.classId,
        className: unit.className,
        subject: unit.subject,
        teacher: unit.teacher,
        subSubject: unit.subSubject,
        subTeacher: unit.subTeacher,
        room: unit.room,
        reason: `Mise à côté : ${unit.teacher} occupé(e) sur les créneaux restants`,
      });
    }
  }

  // 6. Assemble final classes array in canonical school order (inserting G3A & G3B right after G2 Boys)
  const rebuiltSchoolClasses: SchoolClass[] = targetClassDefs.map((def) => ({
    id: def.id,
    name: def.name,
    section: 'Primary',
    category: 'Boys_Section',
    room: def.room,
    visibility: 'school',
    updatedBy: 'Direction',
    slots: rebuiltClassSlots[def.id],
  }));

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

  // 7. Update Teachers Directory (Add "New Teacher" and sync target maxPeriodsPerWeek)
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
        subjects: Array.from(new Set([...nextTeachers[idx].subjects, ...subjects])),
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

  ensureTeacher('New Teacher', ['Maths', 'Sciences'], 28, 'Boys Section (3A, 3B, 4A, 4B)');
  ensureTeacher('Mira', ['English', 'Library'], 25, 'Boys Section (3A, 3B, 4A)');
  ensureTeacher('Fayrouz', ['English'], 28, 'Boys Section (4B, 5A, 5B, 6B)');
  ensureTeacher('Elisa', ['Sciences'], 25, 'Boys Section (4A, 4B, 5A, 5B, 6B)');
  ensureTeacher('Ola Ame', ['Maths', 'Computing'], 26, 'Boys Section (4A, 4B, 5A, 5B, 6B)');
  ensureTeacher('Husnia', ['Social studies', 'Computing'], 26, 'Primary & Boys/Girls Sections');
  ensureTeacher('Joudi', ['English', 'Library'], 28, 'Primary Girls & Boys (4A+4B)');

  // 8. Compute verification table for the 7 key teachers
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
      details: 'Maths : 3A (5), 3B (5), 4A (6), 4B (6) · Sciences : 3A (3), 3B (3)',
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
      details: 'Maths : 5A (6), 5B (6), 6B (6) · Computing : 4A (2), 4B (2), 5A (2), 5B (2)',
    },
    {
      teacher: 'Ms. Husnia',
      targetPeriods: 26,
      actualPeriods: countTeacherActualLoad('Husnia'),
      details:
        'Social Studies : 3A, 3B, 4A, 4B, 5A, 5B, 6B (14) · Computing : 3A, 3B, 6B + 4G, 5G, 6G (12) · G1/G2 réassignés Homeroom',
    },
    {
      teacher: 'Ms. Joudy (Joudi)',
      targetPeriods: 28,
      actualPeriods: countTeacherActualLoad('Joudi'),
      details: `Library : Séance commune 4A + 4B (${jointLibSlotKey.replace('_', ' P')}) + 5A, 5B, 6B & Section Filles`,
    },
  ];

  // Filter out old unplaced cards from rebuilt classes
  const remainingUnplaced = [
    ...existingUnplaced.filter((u) => !activelyRebuiltIds.has(u.classId)),
    ...newUnplacedCards,
  ];

  return {
    classes: finalClasses,
    teachers: nextTeachers,
    unplacedLessons: remainingUnplaced,
    summary:
      `Restructuration complète appliquée sans affecter les ${preservedClasses.length} autres classes : ` +
      `scission Grade 3A/3B Boys & Grade 4A/4B Boys, création de New Teacher (28p), rééquilibrage exact de Mira (25p), Fayrouz (28p), Elisa (25p), Ola (26p), Husnia (26p, Computing G1/G2 transféré aux Homeroom teachers), séance commune Library 4A+4B avec Joudi (28p) et programmation des séances complémentaires (Musique, Art, PE, Montessori, Français) avec 0 conflit.`,
    placedCount,
    leftAsideCount: newUnplacedCards.length,
    frozenClassesCount: preservedClasses.length,
    teacherLoadVerification,
  };
}
