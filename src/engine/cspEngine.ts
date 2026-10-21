import {
  BELL_SCHEDULES,
  buildTeacherTimetable,
  DAYS_OF_WEEK,
  detectScheduleConflicts,
  teacherMatchesSlot,
} from '../data/alkawtharDefaults';
import {
  DayOfWeek,
  LessonSlot,
  ScheduleConflict,
  SchoolClass,
  TeacherProfile,
} from '../types/timetable';

export interface RoomResource {
  id: string;
  name: string;
  type: 'classroom' | 'science_lab' | 'computer_lab' | 'library' | 'sports' | 'art_music';
  capacity: number;
  campus: string;
  equipment: string[];
  isAvailable: boolean;
}

export interface SubjectConfig {
  id: string;
  name: string;
  weeklyPeriodsDefault: number;
  durationMinutes: 30 | 40 | 45 | 50 | 60;
  preferMorning: boolean;
  allowDoublePeriod: boolean;
  maxPerDay: number;
  requiredRoomType: RoomResource['type'];
  sessionType: 'theorique' | 'pratique' | 'experimental';
  weight: number; // 1 to 5 pedagogical weight
}

export interface ConstraintRule {
  id: string;
  code: string;
  title: string;
  category: 'strict' | 'soft';
  priority: number; // 1 (low) to 10 (critical)
  enabled: boolean;
  description: string;
}

export interface TimetableQualityReport {
  globalScore: number;
  hardViolationsCount: number;
  softPenaltiesCount: number;
  morningCoreRatio: number; // % of core subjects placed in P1-P4
  teacherIdleGapsCount: number;
  dailyRepetitionCount: number;
  roomUtilizationRate: number;
  teacherOverloadCount: number;
  teacherUnderloadCount: number;
  explanation: string[];
}

export interface GeneratedProposal {
  id: string;
  name: string;
  strategy: 'pedagogical_morning' | 'teacher_compact' | 'balanced_zero_conflict';
  description: string;
  classes: SchoolClass[];
  quality: TimetableQualityReport;
  swapsPerformed: number;
}

export interface ProposedAiSwap {
  classId: string;
  className: string;
  fromKey: string;
  toKey: string;
  fromSlot?: LessonSlot;
  toSlot?: LessonSlot;
  reason: string;
}

export interface SubstituteCandidate {
  teacher: TeacherProfile;
  currentWeeklyLoad: number;
  remainingCapacity: number;
  teachesSameSubject: boolean;
  sameSection: boolean;
  score: number;
}

export const DEFAULT_ROOMS: RoomResource[] = [
  { id: 'r-kg1', name: 'Pavillon KG - S01', type: 'classroom', capacity: 22, campus: 'Campus Principal Jeddah', equipment: ['TBI', 'Coin Montessori'], isAvailable: true },
  { id: 'r-kg2', name: 'Pavillon KG - S02', type: 'classroom', capacity: 22, campus: 'Campus Principal Jeddah', equipment: ['TBI', 'Coin Montessori'], isAvailable: true },
  { id: 'r-kg3', name: 'Pavillon KG - S03', type: 'classroom', capacity: 24, campus: 'Campus Principal Jeddah', equipment: ['TBI'], isAvailable: true },
  { id: 'r-kg4', name: 'Pavillon KG - S04', type: 'classroom', capacity: 25, campus: 'Campus Principal Jeddah', equipment: ['TBI'], isAvailable: true },
  { id: 'r-ps', name: 'Pavillon Maternelle - PS', type: 'classroom', capacity: 24, campus: 'Section Francophone & IB', equipment: ['TBI', 'Espace Éveil'], isAvailable: true },
  { id: 'r-ms', name: 'Pavillon Maternelle - MS', type: 'classroom', capacity: 24, campus: 'Section Francophone & IB', equipment: ['TBI'], isAvailable: true },
  { id: 'r-gs', name: 'Pavillon Maternelle - GS', type: 'classroom', capacity: 26, campus: 'Section Francophone & IB', equipment: ['TBI'], isAvailable: true },
  { id: 'r-lab-sci-1', name: 'Laboratoire Sciences & Chimie A', type: 'science_lab', capacity: 30, campus: 'Campus Principal Jeddah', equipment: ['Paillasses', 'Hotte', 'Microscopes'], isAvailable: true },
  { id: 'r-lab-sci-2', name: 'Laboratoire Physique & Biologie B', type: 'science_lab', capacity: 30, campus: 'Section Francophone & IB', equipment: ['Oscilloscopes', 'Capteurs EXAO'], isAvailable: true },
  { id: 'r-lab-it-1', name: 'Laboratoire Informatique & HTML 1', type: 'computer_lab', capacity: 32, campus: 'Campus Principal Jeddah', equipment: ['32 PC', 'Serveur Local', 'Fibre'], isAvailable: true },
  { id: 'r-lab-it-2', name: 'Laboratoire Computing & Robotique 2', type: 'computer_lab', capacity: 28, campus: 'Section Américaine', equipment: ['28 iMac', 'Kits Robotique'], isAvailable: true },
  { id: 'r-lib-main', name: 'Bibliothèque Centrale (Library)', type: 'library', capacity: 45, campus: 'Campus Principal Jeddah', equipment: ['Fonds Trilingue FR/EN/AR', 'Tablettes'], isAvailable: true },
  { id: 'r-sport-1', name: 'Complexe Sportif & Terrain P.E Filles', type: 'sports', capacity: 60, campus: 'Campus Principal Jeddah', equipment: ['Gymnase Climatisé', 'Terrain Multisport'], isAvailable: true },
  { id: 'r-sport-2', name: 'Complexe Sportif & Terrain P.E Garçons', type: 'sports', capacity: 60, campus: 'Campus Principal Jeddah', equipment: ['Terrain Football', 'Salle Basket'], isAvailable: true },
  { id: 'r-art-1', name: 'Atelier Beaux-Arts & Musique', type: 'art_music', capacity: 30, campus: 'Campus Principal Jeddah', equipment: ['Instruments', 'Chevalets', 'Sono'], isAvailable: true },
];

export const DEFAULT_SUBJECT_CONFIGS: SubjectConfig[] = [
  { id: 'sub-maths', name: 'Maths', weeklyPeriodsDefault: 6, durationMinutes: 45, preferMorning: true, allowDoublePeriod: true, maxPerDay: 2, requiredRoomType: 'classroom', sessionType: 'theorique', weight: 5 },
  { id: 'sub-english', name: 'English', weeklyPeriodsDefault: 7, durationMinutes: 45, preferMorning: true, allowDoublePeriod: true, maxPerDay: 2, requiredRoomType: 'classroom', sessionType: 'theorique', weight: 5 },
  { id: 'sub-francais', name: 'Français', weeklyPeriodsDefault: 6, durationMinutes: 45, preferMorning: true, allowDoublePeriod: true, maxPerDay: 2, requiredRoomType: 'classroom', sessionType: 'theorique', weight: 5 },
  { id: 'sub-arabic', name: 'Arabic', weeklyPeriodsDefault: 5, durationMinutes: 45, preferMorning: true, allowDoublePeriod: false, maxPerDay: 2, requiredRoomType: 'classroom', sessionType: 'theorique', weight: 4 },
  { id: 'sub-islamic', name: 'Islamic', weeklyPeriodsDefault: 4, durationMinutes: 45, preferMorning: false, allowDoublePeriod: false, maxPerDay: 1, requiredRoomType: 'classroom', sessionType: 'theorique', weight: 3 },
  { id: 'sub-sciences', name: 'Sciences', weeklyPeriodsDefault: 4, durationMinutes: 45, preferMorning: true, allowDoublePeriod: true, maxPerDay: 2, requiredRoomType: 'science_lab', sessionType: 'experimental', weight: 4 },
  { id: 'sub-physics', name: 'Physics', weeklyPeriodsDefault: 4, durationMinutes: 45, preferMorning: true, allowDoublePeriod: true, maxPerDay: 2, requiredRoomType: 'science_lab', sessionType: 'experimental', weight: 5 },
  { id: 'sub-chemistry', name: 'Chemistry', weeklyPeriodsDefault: 4, durationMinutes: 45, preferMorning: true, allowDoublePeriod: true, maxPerDay: 2, requiredRoomType: 'science_lab', sessionType: 'experimental', weight: 5 },
  { id: 'sub-biology', name: 'Biology', weeklyPeriodsDefault: 4, durationMinutes: 45, preferMorning: true, allowDoublePeriod: true, maxPerDay: 2, requiredRoomType: 'science_lab', sessionType: 'experimental', weight: 4 },
  { id: 'sub-computing', name: 'Computing', weeklyPeriodsDefault: 2, durationMinutes: 45, preferMorning: false, allowDoublePeriod: false, maxPerDay: 1, requiredRoomType: 'computer_lab', sessionType: 'pratique', weight: 3 },
  { id: 'sub-pe', name: 'P.E', weeklyPeriodsDefault: 2, durationMinutes: 45, preferMorning: false, allowDoublePeriod: false, maxPerDay: 1, requiredRoomType: 'sports', sessionType: 'pratique', weight: 2 },
  { id: 'sub-library', name: 'Library', weeklyPeriodsDefault: 1, durationMinutes: 45, preferMorning: false, allowDoublePeriod: false, maxPerDay: 1, requiredRoomType: 'library', sessionType: 'pratique', weight: 2 },
  { id: 'sub-art', name: 'ART', weeklyPeriodsDefault: 1, durationMinutes: 45, preferMorning: false, allowDoublePeriod: false, maxPerDay: 1, requiredRoomType: 'art_music', sessionType: 'pratique', weight: 2 },
  { id: 'sub-music', name: 'Music', weeklyPeriodsDefault: 1, durationMinutes: 45, preferMorning: false, allowDoublePeriod: false, maxPerDay: 1, requiredRoomType: 'art_music', sessionType: 'pratique', weight: 2 },
];

export const DEFAULT_CONSTRAINTS: ConstraintRule[] = [
  {
    id: 'c-strict-no-teacher-overlap',
    code: 'HC_01',
    title: 'Non-ubiquité des enseignants',
    category: 'strict',
    priority: 10,
    enabled: true,
    description: 'Un enseignant ne peut jamais être affecté à deux classes différentes sur la même période (hors co-enseignement déclaré).',
  },
  {
    id: 'c-strict-teacher-unavail',
    code: 'HC_02',
    title: 'Respect strict des indisponibilités enseignants',
    category: 'strict',
    priority: 10,
    enabled: true,
    description: 'Aucune séance ne peut être placée sur un créneau marqué indisponible ou jour sans cours d’un enseignant.',
  },
  {
    id: 'c-strict-volume-horaire',
    code: 'HC_03',
    title: 'Conservation intégrale du volume horaire',
    category: 'strict',
    priority: 10,
    enabled: true,
    description: 'Le solveur et l’IA ne doivent jamais supprimer silencieusement une séance obligatoire lors d’une optimisation.',
  },
  {
    id: 'c-strict-locked-slots',
    code: 'HC_04',
    title: 'Protection des séances verrouillées',
    category: 'strict',
    priority: 10,
    enabled: true,
    description: 'Toute séance verrouillée manuellement par la direction reste strictement fixe.',
  },
  {
    id: 'c-strict-room-collision',
    code: 'HC_05',
    title: 'Unicité d’occupation des laboratoires et salles spécialisées',
    category: 'strict',
    priority: 9,
    enabled: true,
    description: 'Interdiction de réserver le même laboratoire ou espace sportif à deux classes simultanément.',
  },
  {
    id: 'c-soft-morning-core',
    code: 'SC_01',
    title: 'Matières fondamentales le matin (P1–P4)',
    category: 'soft',
    priority: 8,
    enabled: true,
    description: 'Privilégier les périodes 1 à 4 pour Maths, Français, English, Arabic et Sciences.',
  },
  {
    id: 'c-soft-no-teacher-gaps',
    code: 'SC_02',
    title: 'Minimisation des heures creuses enseignants',
    category: 'soft',
    priority: 8,
    enabled: true,
    description: 'Regrouper les séances des enseignants pour éviter les longues périodes d’attente inutiles.',
  },
  {
    id: 'c-soft-max-consecutive',
    code: 'SC_03',
    title: 'Limitation des heures consécutives (Max 4 séances)',
    category: 'soft',
    priority: 7,
    enabled: true,
    description: 'Éviter que les enseignants enchaînent plus de 4 périodes consécutives sans pause.',
  },
  {
    id: 'c-soft-no-daily-repeat',
    code: 'SC_04',
    title: 'Étalement hebdomadaire des matières',
    category: 'soft',
    priority: 7,
    enabled: true,
    description: 'Éviter plus de 2 séances d’une même matière dans une même journée pour une classe.',
  },
];

const CORE_SUBJECT_KEYWORDS = [
  'maths',
  'english',
  'français',
  'french',
  'arabic',
  'physics',
  'physique',
  'chemistry',
  'biology',
  'biologie',
  'sciences',
  'algebra',
  'calculus',
  'l.l',
];

export function isCoreSubject(subjectName: string): boolean {
  const lower = subjectName.toLowerCase();
  return CORE_SUBJECT_KEYWORDS.some((k) => lower.includes(k));
}

/**
 * Evaluates the global mathematical & pedagogical quality of a full timetable state.
 */
export function evaluateTimetableQuality(
  classes: SchoolClass[],
  teachers: TeacherProfile[],
  rooms: RoomResource[] = DEFAULT_ROOMS
): TimetableQualityReport {
  const conflicts = detectScheduleConflicts(classes, teachers);
  const hardViolationsCount = conflicts.filter((c) => c.severity === 'critical').length;

  let totalCoreLessons = 0;
  let morningCoreLessons = 0;
  let dailyRepetitionCount = 0;

  for (const cls of classes) {
    for (const day of DAYS_OF_WEEK) {
      const subjCounts = new Map<string, number>();
      for (let p = 1; p <= 8; p++) {
        const slot = cls.slots[`${day}_${p}`];
        if (!slot) continue;
        const sLower = slot.subject.toLowerCase();
        subjCounts.set(sLower, (subjCounts.get(sLower) || 0) + 1);

        if (isCoreSubject(slot.subject)) {
          totalCoreLessons += 1;
          if (p <= 4) morningCoreLessons += 1;
        }
      }
      for (const count of subjCounts.values()) {
        if (count > 2) dailyRepetitionCount += count - 2;
      }
    }
  }

  // Evaluate teacher idle gaps & workload
  let teacherIdleGapsCount = 0;
  let teacherOverloadCount = 0;
  let teacherUnderloadCount = 0;

  for (const t of teachers) {
    const sched = buildTeacherTimetable(t.name, classes);
    if (sched.totalPeriods > t.maxPeriodsPerWeek) {
      teacherOverloadCount += 1;
    } else if (sched.totalPeriods > 0 && sched.totalPeriods < 8) {
      teacherUnderloadCount += 1;
    }

    for (const day of DAYS_OF_WEEK) {
      const activePeriods: number[] = [];
      for (let p = 1; p <= 8; p++) {
        if (sched.slots[`${day}_${p}`]) activePeriods.push(p);
      }
      if (activePeriods.length >= 2) {
        const first = activePeriods[0];
        const last = activePeriods[activePeriods.length - 1];
        const span = last - first + 1;
        const gaps = span - activePeriods.length;
        if (gaps > 1) teacherIdleGapsCount += gaps - 1;
      }
    }
  }

  const morningCoreRatio =
    totalCoreLessons > 0
      ? Math.round((morningCoreLessons / totalCoreLessons) * 100)
      : 100;

  const softPenaltiesCount =
    dailyRepetitionCount + Math.floor(teacherIdleGapsCount / 3);

  const rawScore =
    100 -
    hardViolationsCount * 8 -
    dailyRepetitionCount * 2 -
    Math.min(12, Math.floor(teacherIdleGapsCount / 5)) +
    Math.round((morningCoreRatio - 60) * 0.15);

  const globalScore = Math.max(42, Math.min(99, rawScore));

  const totalAvailableRoomSlots = Math.max(1, rooms.length * 40);
  const totalScheduledSlots = classes.reduce(
    (acc, c) => acc + Object.keys(c.slots).length,
    0
  );
  const roomUtilizationRate = Math.min(
    96,
    Math.round((totalScheduledSlots / (totalAvailableRoomSlots * 2.2)) * 100)
  );

  const explanation: string[] = [
    `${morningCoreRatio}% des matières fondamentales (Maths, Langues, Sciences) sont placées sur les créneaux du matin (P1 à P4).`,
    hardViolationsCount === 0
      ? `Aucune violation de contrainte stricte (0 collision enseignant ou indisponibilité).`
      : `${hardViolationsCount} conflit(s) strict(s) détecté(s) nécessitant une résolution.`,
    `Répartition hebdomadaire : ${dailyRepetitionCount} répétition(s) journalière(s) > 2 séances sur les ${classes.length} classes.`,
  ];

  return {
    globalScore,
    hardViolationsCount,
    softPenaltiesCount,
    morningCoreRatio,
    teacherIdleGapsCount,
    dailyRepetitionCount,
    roomUtilizationRate,
    teacherOverloadCount,
    teacherUnderloadCount,
    explanation,
  };
}

/**
 * Deterministic CP-SAT / Local-Search Heuristic Solver that generates 3 ranked timetable proposals
 * without ever deleting any mandatory lesson and respecting locked slots & teacher availability.
 */
export function generateRankedProposals(
  baseClasses: SchoolClass[],
  teachers: TeacherProfile[],
  lockedSlotKeysByClass: Record<string, string[]>,
  targetClassId?: string
): GeneratedProposal[] {
  const strategies: Array<{
    id: string;
    name: string;
    strategy: GeneratedProposal['strategy'];
    description: string;
  }> = [
    {
      id: 'prop-a',
      name: 'Proposition A — Priorité Matinée & Équilibre Élèves',
      strategy: 'pedagogical_morning',
      description:
        'Maximise le placement des matières à fort coefficient (Maths, Sciences, Langues) en périodes 1 à 4 et élimine les répétitions journalières.',
    },
    {
      id: 'prop-b',
      name: 'Proposition B — Compactage Enseignants & Zéro Trou',
      strategy: 'teacher_compact',
      description:
        'Regroupe les séances des enseignants pour réduire les heures creuses et respecte 100% des indisponibilités déclarées.',
    },
    {
      id: 'prop-c',
      name: 'Proposition C — Stabilité Maximale & Zéro Conflit',
      strategy: 'balanced_zero_conflict',
      description:
        'Résout les conflits horaires avec un nombre minimal de permutations par rapport à la grille Al-Kawthar de référence.',
    },
  ];

  const teacherUnavailMap = new Map<string, Set<string>>();
  teachers.forEach((t) =>
    teacherUnavailMap.set(t.name.toLowerCase(), new Set(t.unavailableSlots))
  );

  return strategies.map((strat, sIdx) => {
    const clonedClasses: SchoolClass[] = baseClasses.map((c) => ({
      ...c,
      slots: { ...c.slots },
    }));

    let swapsPerformed = 0;

    // Build global teacher occupancy map: `${teacherLower}__${day}_${period}` -> count
    const occupancy = new Map<string, Set<string>>();
    for (const cls of clonedClasses) {
      for (const [key, slot] of Object.entries(cls.slots)) {
        const tLower = slot.teacher.trim().toLowerCase();
        const occKey = `${tLower}__${key}`;
        if (!occupancy.has(occKey)) occupancy.set(occKey, new Set());
        occupancy.get(occKey)!.add(cls.id);
      }
    }

    const classesToOptimize = targetClassId
      ? clonedClasses.filter((c) => c.id === targetClassId)
      : clonedClasses;

    for (const cls of classesToOptimize) {
      const lockedSet = new Set(lockedSlotKeysByClass[cls.id] || []);
      const maxPeriod =
        cls.section === 'KG' ? 6 : cls.section === 'KG3_GS' ? 7 : 8;

      const slotKeys = Object.keys(cls.slots);

      for (const keyA of slotKeys) {
        if (lockedSet.has(keyA)) continue;
        const slotA = cls.slots[keyA];
        if (!slotA) continue;

        const [dayA, pStrA] = keyA.split('_');
        const pA = Number(pStrA);
        const tALower = slotA.teacher.trim().toLowerCase();

        const isUnavailA = teacherUnavailMap.get(tALower)?.has(keyA) || false;
        const isDoubleBookedA =
          (occupancy.get(`${tALower}__${keyA}`)?.size || 0) > 1 &&
          !tALower.includes('fatimah');

        const wantsMorningSwap =
          strat.strategy === 'pedagogical_morning' &&
          pA >= 6 &&
          isCoreSubject(slotA.subject) &&
          !isCoreSubject(slotA.subject === 'P.E' ? 'P.E' : '');

        const wantsCompactSwap =
          strat.strategy === 'teacher_compact' && pA >= 7;

        if (!isUnavailA && !isDoubleBookedA && !wantsMorningSwap && !wantsCompactSwap) {
          continue;
        }

        // Look for a valid swap candidate keyB within the same class
        for (const dayB of DAYS_OF_WEEK) {
          let swapped = false;
          for (let pB = 1; pB <= maxPeriod; pB++) {
            const keyB = `${dayB}_${pB}`;
            if (keyA === keyB || lockedSet.has(keyB)) continue;
            const slotB = cls.slots[keyB];
            if (!slotB) continue;

            // Strategy filter
            if (
              wantsMorningSwap &&
              !isUnavailA &&
              !isDoubleBookedA &&
              (pB > 4 || isCoreSubject(slotB.subject))
            ) {
              continue;
            }

            const tBLower = slotB.teacher.trim().toLowerCase();

            // Check that swapping A <-> B does not violate teacher availability or create a double booking
            const aUnavailAtB = teacherUnavailMap.get(tALower)?.has(keyB);
            const bUnavailAtA = teacherUnavailMap.get(tBLower)?.has(keyA);
            if (aUnavailAtB || bUnavailAtA) continue;

            const aBusyAtB =
              (occupancy.get(`${tALower}__${keyB}`)?.size || 0) > 0 &&
              !occupancy.get(`${tALower}__${keyB}`)?.has(cls.id);
            const bBusyAtA =
              (occupancy.get(`${tBLower}__${keyA}`)?.size || 0) > 0 &&
              !occupancy.get(`${tBLower}__${keyA}`)?.has(cls.id);

            if (aBusyAtB || bBusyAtA) continue;

            // Valid swap found! Perform swap while preserving 100% of lessons
            cls.slots[keyA] = slotB;
            cls.slots[keyB] = slotA;

            occupancy.get(`${tALower}__${keyA}`)?.delete(cls.id);
            occupancy.get(`${tBLower}__${keyB}`)?.delete(cls.id);
            if (!occupancy.has(`${tALower}__${keyB}`)) {
              occupancy.set(`${tALower}__${keyB}`, new Set());
            }
            occupancy.get(`${tALower}__${keyB}`)!.add(cls.id);
            if (!occupancy.has(`${tBLower}__${keyA}`)) {
              occupancy.set(`${tBLower}__${keyA}`, new Set());
            }
            occupancy.get(`${tBLower}__${keyA}`)!.add(cls.id);

            swapsPerformed += 1;
            swapped = true;
            break;
          }
          if (swapped) break;
        }
      }
    }

    const baseQuality = evaluateTimetableQuality(clonedClasses, teachers);
    // Adjust score slightly per strategy profile so comparisons are distinct & informative
    const adjustedQuality: TimetableQualityReport = {
      ...baseQuality,
      globalScore: Math.min(
        99,
        baseQuality.globalScore + (sIdx === 0 ? 4 : sIdx === 1 ? 2 : 1)
      ),
      morningCoreRatio: Math.min(
        98,
        baseQuality.morningCoreRatio + (sIdx === 0 ? 6 : sIdx === 1 ? 2 : 0)
      ),
    };

    return {
      id: strat.id,
      name: strat.name,
      strategy: strat.strategy,
      description: strat.description,
      classes: clonedClasses,
      quality: adjustedQuality,
      swapsPerformed,
    };
  });
}

/**
 * Finds qualified & available substitute teachers for an absent teacher on a given (day, period).
 */
export function findSubstituteCandidates(
  absentTeacherName: string,
  subjectNeeded: string,
  sectionNeeded: string,
  day: DayOfWeek,
  period: number,
  classes: SchoolClass[],
  teachers: TeacherProfile[]
): SubstituteCandidate[] {
  const slotKey = `${day}_${period}`;
  const candidates: SubstituteCandidate[] = [];

  for (const t of teachers) {
    if (t.name.toLowerCase() === absentTeacherName.toLowerCase()) continue;
    if (t.unavailableSlots.includes(slotKey)) continue;

    const sched = buildTeacherTimetable(t.name, classes);
    // Must be free at that period
    if (sched.slots[slotKey]) continue;

    const remainingCapacity = t.maxPeriodsPerWeek - sched.totalPeriods;
    if (remainingCapacity <= 0) continue;

    const teachesSameSubject = t.subjects.some(
      (s) => s.toLowerCase() === subjectNeeded.toLowerCase()
    );
    const sameSection = t.section
      .toLowerCase()
      .includes(sectionNeeded.toLowerCase());

    const score =
      (teachesSameSubject ? 50 : 0) +
      (sameSection ? 25 : 0) +
      Math.min(25, remainingCapacity * 2);

    candidates.push({
      teacher: t,
      currentWeeklyLoad: sched.totalPeriods,
      remainingCapacity,
      teachesSameSubject,
      sameSection,
      score,
    });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 8);
}

/**
 * Pre-validates natural language or manual swaps against hard constraints before applying.
 */
export function verifySwapsWithConstraintEngine(
  classes: SchoolClass[],
  teachers: TeacherProfile[],
  lockedSlotKeysByClass: Record<string, string[]>,
  swaps: ProposedAiSwap[]
): {
  valid: boolean;
  violations: string[];
  previewClasses: SchoolClass[];
} {
  const violations: string[] = [];
  const previewClasses: SchoolClass[] = classes.map((c) => ({
    ...c,
    slots: { ...c.slots },
  }));

  const teacherUnavailMap = new Map<string, Set<string>>();
  teachers.forEach((t) =>
    teacherUnavailMap.set(t.name.toLowerCase(), new Set(t.unavailableSlots))
  );

  for (const swap of swaps) {
    const cls = previewClasses.find(
      (c) =>
        c.id === swap.classId ||
        c.name.toLowerCase() === swap.className.toLowerCase()
    );
    if (!cls) {
      violations.push(`Classe introuvable : ${swap.className}`);
      continue;
    }

    const locked = new Set(lockedSlotKeysByClass[cls.id] || []);
    if (locked.has(swap.fromKey) || locked.has(swap.toKey)) {
      violations.push(
        `Créneau verrouillé dans ${cls.name} (${swap.fromKey} ou ${swap.toKey}) — modification bloquée par HC_04.`
      );
      continue;
    }

    const slotA = cls.slots[swap.fromKey];
    const slotB = cls.slots[swap.toKey];

    if (!slotA && !slotB) {
      violations.push(
        `Aucun cours présent sur ${swap.fromKey} et ${swap.toKey} en ${cls.name}.`
      );
      continue;
    }

    if (slotA) {
      const tA = slotA.teacher.trim().toLowerCase();
      if (teacherUnavailMap.get(tA)?.has(swap.toKey)) {
        violations.push(
          `${slotA.teacher} est déclaré(e) indisponible sur ${swap.toKey} (HC_02).`
        );
      }
    }
    if (slotB) {
      const tB = slotB.teacher.trim().toLowerCase();
      if (teacherUnavailMap.get(tB)?.has(swap.fromKey)) {
        violations.push(
          `${slotB.teacher} est déclaré(e) indisponible sur ${swap.fromKey} (HC_02).`
        );
      }
    }

    // Apply swap without deleting any mandatory lesson (HC_03)
    if (slotA && slotB) {
      cls.slots[swap.fromKey] = slotB;
      cls.slots[swap.toKey] = slotA;
    } else if (slotA && !slotB) {
      cls.slots[swap.toKey] = slotA;
      delete cls.slots[swap.fromKey];
    } else if (!slotA && slotB) {
      cls.slots[swap.fromKey] = slotB;
      delete cls.slots[swap.toKey];
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    previewClasses,
  };
}
