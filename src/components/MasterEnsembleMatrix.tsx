import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  Eye,
  FileSpreadsheet,
  Filter,
  GitMerge,
  Inbox,
  Layers,
  Lock,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Printer,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Unlock,
  Wand2,
  Wrench,
  X,
} from 'lucide-react';
import { DAYS_OF_WEEK } from '../data/alkawtharDefaults';
import {
  DayOfWeek,
  IntercalatedSessionInfo,
  LessonSlot,
  SchoolCategory,
  SchoolClass,
  SectionType,
  TeacherProfile,
  UnplacedLessonCard,
} from '../types/timetable';
import {
  CATEGORY_SHORT_LABELS,
  classMatchesCategory,
  ConflictOrContradictionKind,
  CURRICULUM_SECTION_CATEGORIES,
  DetailedConflictItem,
  detectAllConflictsAndContradictions,
  detectIntercalatedSessions,
  evaluateRowSwitchCompatibility,
  getClassCurriculumSection,
  getClassOfficialDepartment,
  getCurriculumShortLabel,
  getPeriodClockTime,
  getSubjectVisualStyle,
  OFFICIAL_DEPARTMENT_CATEGORIES,
  SwitchCandidateAssessment,
} from '../utils/timetableAnalytics';

interface MasterEnsembleMatrixProps {
  classes: SchoolClass[];
  teachers: TeacherProfile[];
  lockedSlotsByClass: Record<string, string[]>;
  frozenClassIds: string[];
  onToggleFreezeClass: (classId: string) => void;
  onSetFrozenClassIds: (classIds: string[]) => void;
  frozenSubjects: string[];
  onToggleFreezeSubject: (subject: string) => void;
  unplacedLessons: UnplacedLessonCard[];
  onAddManualUnplacedLesson: (payload: {
    classId: string;
    subject: string;
    teacher: string;
    periodsCount: number;
  }) => void;
  onMoveSlotToSideTray: (classId: string, slotKey: string) => void;
  onPlaceCardFromSideTray: (
    cardId: string,
    targetClassId: string,
    targetSlotKey: string,
    allowSwapToTray?: boolean
  ) => void;
  onRemoveUnplacedCard: (cardId: string) => void;
  onAutoPlaceSideTrayCards: () => void;
  onClearSideTray: () => void;
  aiOrderInput: string;
  onChangeAiOrderInput: (val: string) => void;
  onGenerateWithAiOrder: () => void;
  isGeneratingAiOrder: boolean;
  lastGenerationReport: {
    summary: string;
    placedCount: number;
    leftAsideCount: number;
    frozenClassesCount: number;
    teacherLoadVerification?: Array<{
      teacher: string;
      targetPeriods: number;
      actualPeriods: number;
      details: string;
    }>;
    multiDeptReport?: Array<{
      teacher: string;
      departments: string[];
      patternSummary: string;
      clockConflicts: number;
    }>;
  } | null;
  selectedCategory: SchoolCategory;
  onSelectCategory: (cat: SchoolCategory) => void;
  onSwitchSlots: (classId: string, fromKey: string, toKey: string) => void;
  onEditCell: (
    classId: string,
    day: DayOfWeek,
    period: number,
    slot?: LessonSlot
  ) => void;
  onOpenJointModal: (prefill?: {
    classAId: string;
    day: DayOfWeek;
    period: number;
  }) => void;
  onPrintEnsemble: () => void;
  onExportExcelEnsemble?: () => void;
  onRenameOrModifyClass?: (params: {
    classId: string;
    newName: string;
    newRoom?: string;
    newCategory?: Exclude<SchoolCategory, 'ALL'>;
    newSection?: SectionType;
    newDefaultAssistant?: string;
  }) => void;
  onAutoResolveConflicts?: (targetConflictId?: string) => void;
  darkMode?: boolean;
}

const PRESET_AI_ORDERS = [
  {
    label: '★ Restructuration Garçons (G3A/3B, G4A/4B & Charges)',
    prompt: `1. Instructions Générales sur la Structure des Classes :
- Grade 3 Boys est scindé en : Grade 3A Boys (الصف الثالث أ) et Grade 3B Boys (الصف الثالث ب)
- Grade 4 Boys est scindé en : Grade 4A Boys (الصف الرابع أ) et Grade 4B Boys (الصف الرابع ب)
2. Répartition des Matières (Grade 3 & Grade 4) :
- Grade 3A & 3B Boys : Maths (New Teacher), Sciences (New Teacher), English (Ms. Mira), Library (Ms. Mira), Social Studies (Ms. Husnia), Computing (Ms. Husnia)
- Grade 4A Boys : Maths (New Teacher), Sciences (Ms. Elisa), English (Ms. Mira), Social Studies (Ms. Husnia), Computing (Ms. Ola), Library (Ms. Joudy - Séance commune avec Grade 4B)
- Grade 4B Boys : Maths (New Teacher), Sciences (Ms. Elisa), English (Ms. Fayrouz), Social Studies (Ms. Husnia), Computing (Ms. Ola), Library (Ms. Joudy - Séance commune avec Grade 4A)
3. Ajustements des Charges : New Teacher (28), Ms. Mira (25), Ms. Fayrouz (28), Ms. Elisa (25), Ms. Ola (26), Ms. Husnia (26 - retrait Computing G1/G2 vers Homeroom), Ms. Joudy (28 - Library groupée 4A+4B).
4. Séances Complémentaires : Musique (+2), Arts Plastiques (2), PE (+2), Montessori (+1), Français (+2).`,
  },
  {
    label: '★ Multi-Départements : Matin Dépt 1 / Après-midi Dépt 2 & 0 Pause',
    prompt:
      "Organiser le temps des enseignants qui enseignent dans deux départements de façon à ce qu'ils donnent cours le matin (P1 à P4) pour un département et l'après-midi (P5 à P8) pour l'autre département, sans affecter les autres classes et sans intersection d'horaires ni dépassement vers les pauses (breaks).",
  },
  {
    label: 'Fondamentaux le matin (P1-P4)',
    prompt:
      'Placer Maths, Français, Anglais, Arabe et Sciences le matin (P1 à P4), et mettre Sport, Art, Musique et Bibliothèque en fin de journée (P5 à P8).',
  },
  {
    label: 'Max 1 séance/jour par matière',
    prompt:
      'Répartir chaque matière sur des jours différents (maximum 1 séance par jour pour une même matière) afin d’équilibrer la semaine.',
  },
  {
    label: 'Zéro conflit & sans trou prof',
    prompt:
      'Éliminer tous les conflits enseignants, regrouper les cours des professeurs et laisser à côté toute séance qui n’a pas de place logique.',
  },
];

export const MasterEnsembleMatrix: React.FC<MasterEnsembleMatrixProps> = ({
  classes,
  teachers,
  lockedSlotsByClass,
  frozenClassIds,
  onToggleFreezeClass,
  onSetFrozenClassIds,
  frozenSubjects,
  onToggleFreezeSubject,
  unplacedLessons,
  onAddManualUnplacedLesson,
  onMoveSlotToSideTray,
  onPlaceCardFromSideTray,
  onRemoveUnplacedCard,
  onAutoPlaceSideTrayCards,
  onClearSideTray,
  aiOrderInput,
  onChangeAiOrderInput,
  onGenerateWithAiOrder,
  isGeneratingAiOrder,
  lastGenerationReport,
  selectedCategory,
  onSelectCategory,
  onSwitchSlots,
  onEditCell,
  onOpenJointModal,
  onPrintEnsemble,
  onExportExcelEnsemble,
  onRenameOrModifyClass,
  onAutoResolveConflicts,
  darkMode = false,
}) => {
  const [selectedSource, setSelectedSource] = useState<{
    classId: string;
    slotKey: string;
  } | null>(null);

  // Grid Size / Zoom & Fullscreen Mode for maximum clarity
  const [gridDensity, setGridDensity] = useState<'compact' | 'comfort' | 'large'>('comfort');
  const [isFullHeightGrid, setIsFullHeightGrid] = useState<boolean>(false);

  // Conflict & Contradiction Center state
  const [showConflictsPanel, setShowConflictsPanel] = useState<boolean>(true);
  const [onlyShowConflictCells, setOnlyShowConflictCells] = useState<boolean>(false);
  const [conflictKindFilter, setConflictKindFilter] = useState<ConflictOrContradictionKind | 'ALL'>('ALL');

  // Inline Class Rename / Modify state in Vue Ensemble
  const [editingClassMetaId, setEditingClassMetaId] = useState<string | null>(
    null
  );
  const [editClassNameVal, setEditClassNameVal] = useState('');
  const [editClassCatVal, setEditClassCatVal] =
    useState<Exclude<SchoolCategory, 'ALL'>>('Primaire_British_Garcons');
  const [editClassRoomVal, setEditClassRoomVal] = useState('');

  // Selected card from the side tray ("Matières à Côté") waiting to be clicked into the matrix
  const [selectedSideCardId, setSelectedSideCardId] = useState<string | null>(
    null
  );

  // Drag & Drop state
  const [draggedItem, setDraggedItem] = useState<
    | { type: 'side_card'; cardId: string; classId: string }
    | { type: 'grid_cell'; classId: string; slotKey: string }
    | null
  >(null);

  // Panels visibility (collapsed by default so Vue d'Ensemble is immediately clear and visible)
  const [showAiGeneratorPanel, setShowAiGeneratorPanel] = useState<boolean>(false);
  const [showFreezeSelector, setShowFreezeSelector] = useState<boolean>(false);
  const [showSideTray, setShowSideTray] = useState<boolean>(true);
  const [sideTrayFilterClassId, setSideTrayFilterClassId] =
    useState<string>('ALL');

  // Quick Add to Side Tray form state
  const [newTrayClassId, setNewTrayClassId] = useState<string>(
    classes[0]?.id || ''
  );
  const [newTraySubject, setNewTraySubject] = useState<string>('Maths');
  const [newTrayTeacher, setNewTrayTeacher] = useState<string>('');
  const [newTrayPeriods, setNewTrayPeriods] = useState<number>(1);

  const [highlightFilter, setHighlightFilter] = useState<string>('');
  const [showTeacherSubtext, setShowTeacherSubtext] = useState<boolean>(true);
  const [highlightIntercalatedOnly, setHighlightIntercalatedOnly] =
    useState<boolean>(false);
  const [showIntercalatedPanel, setShowIntercalatedPanel] =
    useState<boolean>(false);
  const [hoveredCandidate, setHoveredCandidate] =
    useState<SwitchCandidateAssessment | null>(null);

  const frozenSet = useMemo(() => new Set(frozenClassIds), [frozenClassIds]);

  // Comprehensive Conflict & Contradiction Detection across all classes
  const conflictAnalysis = useMemo(
    () => detectAllConflictsAndContradictions(classes, teachers),
    [classes, teachers]
  );

  const filteredConflicts = useMemo(() => {
    return conflictAnalysis.items.filter((item) => {
      if (conflictKindFilter !== 'ALL' && item.kind !== conflictKindFilter) {
        return false;
      }
      if (selectedCategory !== 'ALL' && item.classIds.length > 0) {
        const matchesCat = item.classIds.some((cid) => {
          const c = classes.find((cl) => cl.id === cid);
          return c ? classMatchesCategory(c, selectedCategory) : false;
        });
        if (!matchesCat) return false;
      }
      return true;
    });
  }, [conflictAnalysis.items, conflictKindFilter, selectedCategory, classes]);

  const criticalConflictsCount = useMemo(
    () => conflictAnalysis.items.filter((i) => i.severity === 'critical').length,
    [conflictAnalysis.items]
  );

  const warningContradictionsCount = useMemo(
    () => conflictAnalysis.items.filter((i) => i.severity === 'warning').length,
    [conflictAnalysis.items]
  );

  const filteredClasses = useMemo(() => {
    return classes.filter((c) => {
      if (!classMatchesCategory(c, selectedCategory)) return false;
      if (onlyShowConflictCells) {
        return (conflictAnalysis.classConflictCountMap.get(c.id) || 0) > 0;
      }
      return true;
    });
  }, [classes, selectedCategory, onlyShowConflictCells, conflictAnalysis.classConflictCountMap]);

  const intercalatedSessions = useMemo(
    () => detectIntercalatedSessions(classes),
    [classes]
  );

  const intercalatedCellMap = useMemo(() => {
    const map = new Map<string, IntercalatedSessionInfo>();
    for (const item of intercalatedSessions) {
      for (const cName of item.classNames) {
        map.set(`${cName}__${item.day}_${item.period}`, item);
      }
    }
    return map;
  }, [intercalatedSessions]);

  const activeSourceClass = useMemo(
    () =>
      selectedSource
        ? classes.find((c) => c.id === selectedSource.classId) || null
        : null,
    [classes, selectedSource]
  );

  const activeSourceSlot = useMemo(
    () =>
      activeSourceClass && selectedSource
        ? activeSourceClass.slots[selectedSource.slotKey]
        : undefined,
    [activeSourceClass, selectedSource]
  );

  const activeSourceConflicts = useMemo(() => {
    if (!selectedSource) return [];
    return (
      conflictAnalysis.cellConflictMap.get(
        `${selectedSource.classId}__${selectedSource.slotKey}`
      ) || []
    );
  }, [selectedSource, conflictAnalysis.cellConflictMap]);

  const selectedSideCard = useMemo(
    () => unplacedLessons.find((c) => c.id === selectedSideCardId) || null,
    [unplacedLessons, selectedSideCardId]
  );

  // Evaluate logical slot placement compatibility when a card from "Matières à Côté" is selected
  const sideCardCompatibilityBySlot = useMemo(() => {
    if (!selectedSideCard) return null;
    const targetCls = classes.find((c) => c.id === selectedSideCard.classId);
    if (!targetCls) return null;

    const maxP =
      targetCls.section === 'KG'
        ? 6
        : targetCls.section === 'KG3_GS'
        ? 7
        : 8;

    const teacherNorm = selectedSideCard.teacher.trim().toLowerCase();
    const teacherProfile = teachers.find(
      (t) => t.name.trim().toLowerCase() === teacherNorm
    );
    const unavailSet = new Set(teacherProfile?.unavailableSlots || []);
    const classUnavailSet = new Set(targetCls.unavailableSlots || []);
    const lockedSet = new Set(lockedSlotsByClass[targetCls.id] || []);

    const result: Record<
      string,
      {
        status: 'free_logical' | 'swap_logical' | 'blocked';
        reason: string;
      }
    > = {};

    for (const day of DAYS_OF_WEEK) {
      for (let p = 1; p <= 8; p++) {
        const slotKey = `${day}_${p}`;
        if (p > maxP) {
          result[slotKey] = {
            status: 'blocked',
            reason: `Hors horaire pour ${targetCls.name} (max P${maxP})`,
          };
          continue;
        }
        if (lockedSet.has(slotKey)) {
          result[slotKey] = {
            status: 'blocked',
            reason: 'Créneau verrouillé (🔒)',
          };
          continue;
        }
        if (classUnavailSet.has(slotKey)) {
          result[slotKey] = {
            status: 'blocked',
            reason: 'Classe fermée sur ce créneau',
          };
          continue;
        }
        if (unavailSet.has(slotKey)) {
          result[slotKey] = {
            status: 'blocked',
            reason: `${selectedSideCard.teacher} est indisponible le ${day} P${p}`,
          };
          continue;
        }

        // Check if teacher is busy in another class at this exact slot
        let busyInOtherClass: string | null = null;
        for (const other of classes) {
          if (other.id === targetCls.id) continue;
          const otherSlot = other.slots[slotKey];
          if (
            otherSlot &&
            (otherSlot.teacher.trim().toLowerCase() === teacherNorm ||
              otherSlot.subTeacher?.trim().toLowerCase() === teacherNorm ||
              otherSlot.assistantTeacher?.trim().toLowerCase() === teacherNorm)
          ) {
            busyInOtherClass = other.name;
            break;
          }
        }

        if (busyInOtherClass) {
          result[slotKey] = {
            status: 'blocked',
            reason: `${selectedSideCard.teacher} enseigne déjà en ${busyInOtherClass} (${day} P${p})`,
          };
          continue;
        }

        const existingSlot = targetCls.slots[slotKey];
        if (!existingSlot) {
          result[slotKey] = {
            status: 'free_logical',
            reason: `Place logique libre : ${selectedSideCard.teacher} est disponible`,
          };
        } else {
          result[slotKey] = {
            status: 'swap_logical',
            reason: `Remplacer ${existingSlot.subject} (qui ira à côté) — ${selectedSideCard.teacher} est libre`,
          };
        }
      }
    }
    return result;
  }, [selectedSideCard, classes, teachers, lockedSlotsByClass]);

  const rowCompatibilityMap = useMemo(() => {
    if (!activeSourceClass || !selectedSource) return null;
    const lockedSet = new Set(lockedSlotsByClass[activeSourceClass.id] || []);
    return evaluateRowSwitchCompatibility(
      activeSourceClass,
      selectedSource.slotKey,
      classes,
      teachers,
      lockedSet
    );
  }, [activeSourceClass, selectedSource, classes, teachers, lockedSlotsByClass]);

  const topRecommendedSwitches = useMemo(() => {
    if (!rowCompatibilityMap || !selectedSource) return [];
    return Object.values(rowCompatibilityMap)
      .filter(
        (cand) =>
          cand.targetKey !== selectedSource.slotKey &&
          cand.status !== 'blocked' &&
          Boolean(cand.targetSlot || activeSourceConflicts.length > 0)
      )
      .sort((a, b) => b.scoreDelta - a.scoreDelta)
      .slice(0, 5);
  }, [rowCompatibilityMap, selectedSource, activeSourceConflicts.length]);

  const allDistinctSubjects = useMemo(() => {
    const set = new Set<string>();
    for (const cls of classes) {
      for (const s of Object.values(cls.slots)) {
        if (s.subject) set.add(s.subject);
      }
    }
    return Array.from(set).sort();
  }, [classes]);

  const allTeacherNames = useMemo(() => {
    const set = new Set<string>();
    teachers.forEach((t) => set.add(t.name));
    classes.forEach((c) =>
      Object.values(c.slots).forEach((s) => {
        if (s.teacher) set.add(s.teacher);
      })
    );
    return Array.from(set).sort();
  }, [teachers, classes]);

  const handleSelectTraySubject = (subj: string) => {
    setNewTraySubject(subj);
    const targetCls = classes.find((c) => c.id === newTrayClassId);
    if (targetCls) {
      const existingMatch = Object.values(targetCls.slots).find(
        (s) => s.subject.toLowerCase() === subj.toLowerCase()
      );
      if (existingMatch) {
        setNewTrayTeacher(existingMatch.teacher);
        return;
      }
    }
    const matchingTeacher = teachers.find((t) =>
      t.subjects.some((s) => s.toLowerCase() === subj.toLowerCase())
    );
    if (matchingTeacher) {
      setNewTrayTeacher(matchingTeacher.name);
    }
  };

  const filteredSideCards = useMemo(() => {
    return unplacedLessons.filter((card) => {
      if (
        sideTrayFilterClassId !== 'ALL' &&
        card.classId !== sideTrayFilterClassId
      ) {
        return false;
      }
      const cls = classes.find((c) => c.id === card.classId);
      if (cls && !classMatchesCategory(cls, selectedCategory)) {
        return false;
      }
      return true;
    });
  }, [unplacedLessons, sideTrayFilterClassId, classes, selectedCategory]);

  const handleCellClick = (cls: SchoolClass, day: DayOfWeek, period: number) => {
    const slotKey = `${day}_${period}`;

    // MODE 1: A card from "Matières à Côté" is currently selected for manual placement!
    if (selectedSideCard) {
      if (selectedSideCard.classId !== cls.id) {
        setSelectedSideCardId(null);
        setSelectedSource({ classId: cls.id, slotKey });
        return;
      }
      const compat = sideCardCompatibilityBySlot?.[slotKey];
      if (compat && compat.status === 'blocked') {
        return;
      }
      onPlaceCardFromSideTray(
        selectedSideCard.id,
        cls.id,
        slotKey,
        compat?.status === 'swap_logical'
      );
      setSelectedSideCardId(null);
      return;
    }

    // MODE 2: Standard row switch / selection
    if (!selectedSource || selectedSource.classId !== cls.id) {
      setSelectedSource({ classId: cls.id, slotKey });
      return;
    }

    if (selectedSource.slotKey === slotKey) {
      setSelectedSource(null);
      return;
    }

    const compat = rowCompatibilityMap?.[slotKey];
    if (compat && compat.status === 'blocked') {
      setHoveredCandidate(compat);
      return;
    }

    onSwitchSlots(cls.id, selectedSource.slotKey, slotKey);
    setSelectedSource(null);
    setHoveredCandidate(null);
  };

  // Focus a conflict directly in the matrix
  const handleFocusConflictInMatrix = (conflict: DetailedConflictItem) => {
    if (conflict.cellKeys.length > 0) {
      const targetCell = conflict.cellKeys[conflict.cellKeys.length - 1];
      const [classId, slotKey] = targetCell.split('__');
      setSelectedSideCardId(null);
      setSelectedSource({ classId, slotKey });
      // Ensure category filter doesn't hide this class
      const cls = classes.find((c) => c.id === classId);
      if (cls && !classMatchesCategory(cls, selectedCategory)) {
        onSelectCategory('ALL');
      }
    } else if (conflict.teacher) {
      setHighlightFilter(conflict.teacher);
    }
  };

  const rowHeightClass =
    gridDensity === 'large'
      ? 'h-[66px]'
      : gridDensity === 'comfort'
      ? 'h-[54px]'
      : 'h-[42px]';

  const minTableWidthClass =
    gridDensity === 'large'
      ? 'min-w-[1680px]'
      : gridDensity === 'comfort'
      ? 'min-w-[1440px]'
      : 'min-w-[1220px]';

  return (
    <div className="space-y-3 no-print">
      {/* =====================================================================
          1. BARRE DE CONTRÔLE PRINCIPALE : FILTRES DÉPARTEMENTS + OPTIONS VISIBLES
         ===================================================================== */}
      <div
        className={`border rounded-xl p-3.5 space-y-3 shadow-2xs ${
          darkMode
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Top Row: Big Action Buttons (Conflicts, AI Order, Freeze, Side Tray, Export/Print) */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            {/* BUTTON 1: CONFLICTS & CONTRADICTIONS RADAR */}
            <button
              type="button"
              onClick={() => setShowConflictsPanel((v) => !v)}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold border flex items-center gap-2 transition-all cursor-pointer ${
                conflictAnalysis.items.length > 0
                  ? criticalConflictsCount > 0
                    ? 'bg-rose-600 text-white border-rose-700 shadow-xs hover:bg-rose-700'
                    : 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs hover:bg-amber-600'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-700 dark:text-emerald-200'
              }`}
            >
              {conflictAnalysis.items.length > 0 ? (
                <ShieldAlert className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              <span>
                {conflictAnalysis.items.length > 0
                  ? `Conflits & Contradictions (${conflictAnalysis.items.length})`
                  : '0 Conflit · Emploi 100% Cohérent'}
              </span>
              {showConflictsPanel ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {/* BUTTON 2: AI ORDER & GENERATION STUDIO */}
            <button
              type="button"
              onClick={() => setShowAiGeneratorPanel((v) => !v)}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold border flex items-center gap-2 transition-colors cursor-pointer ${
                showAiGeneratorPanel
                  ? 'bg-sky-700 text-white border-sky-800 shadow-xs'
                  : darkMode
                  ? 'bg-slate-800 border-slate-700 text-sky-300 hover:bg-slate-700'
                  : 'bg-sky-50 border-sky-300 text-sky-900 hover:bg-sky-100'
              }`}
            >
              <Wand2 className="w-4 h-4" />
              <span>Ordre IA & Générer</span>
              {showAiGeneratorPanel ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {/* BUTTON 3: KEEP POSITIONS (FROZEN CLASSES) */}
            <button
              type="button"
              onClick={() => setShowFreezeSelector((v) => !v)}
              className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                frozenClassIds.length > 0 || frozenSubjects.length > 0
                  ? 'bg-amber-100 border-amber-400 text-amber-950 dark:bg-amber-950/70 dark:border-amber-700 dark:text-amber-200'
                  : darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
              }`}
            >
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              <span>
                Garder positions ({frozenClassIds.length})
              </span>
            </button>

            {/* BUTTON 4: MATIÈRES À CÔTÉ (SIDE TRAY) */}
            <button
              type="button"
              onClick={() => setShowSideTray((v) => !v)}
              className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                showSideTray
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                  : darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200'
                  : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
              }`}
            >
              {showSideTray ? (
                <PanelRightClose className="w-3.5 h-3.5" />
              ) : (
                <PanelRightOpen className="w-3.5 h-3.5" />
              )}
              <span>Matières à Côté ({unplacedLessons.length})</span>
            </button>

            {/* BUTTON 5: RASSEMBLER 2 CLASSES / 2 PROFS */}
            <button
              type="button"
              onClick={() => {
                if (selectedSource) {
                  const [dStr, pStr] = selectedSource.slotKey.split('_');
                  onOpenJointModal({
                    classAId: selectedSource.classId,
                    day: dStr as DayOfWeek,
                    period: Number(pStr),
                  });
                } else {
                  onOpenJointModal();
                }
              }}
              className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
              }`}
            >
              <GitMerge className="w-3.5 h-3.5 text-indigo-600" />
              <span>Rassembler 2 Classes / 2 Profs</span>
            </button>

            {/* BUTTON 6: INTERCALATED SESSIONS */}
            <button
              type="button"
              onClick={() => setShowIntercalatedPanel((v) => !v)}
              className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                showIntercalatedPanel
                  ? 'bg-amber-600 text-white border-amber-700'
                  : darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-300'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-amber-600" />
              <span>Séances Partagées ({intercalatedSessions.length})</span>
            </button>
          </div>

          {/* Right: Export Excel + Print PDF + Fullscreen Grid */}
          <div className="flex flex-wrap items-center gap-2">
            {onExportExcelEnsemble && (
              <button
                type="button"
                onClick={onExportExcelEnsemble}
                className="px-3 py-2 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
            )}

            <button
              type="button"
              onClick={onPrintEnsemble}
              className="px-3 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimer PDF</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const next = !isFullHeightGrid;
                setIsFullHeightGrid(next);
                if (next) {
                  setShowSideTray(false);
                  setShowAiGeneratorPanel(false);
                }
              }}
              className={`px-3 py-2 text-xs font-bold rounded-lg border flex items-center gap-1.5 cursor-pointer ${
                isFullHeightGrid
                  ? 'bg-indigo-700 text-white border-indigo-800'
                  : darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200'
                  : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
              }`}
              title="Agrandir la Vue d'Ensemble sur toute la largeur et hauteur"
            >
              {isFullHeightGrid ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
              <span>{isFullHeightGrid ? 'Vue Normale' : 'Plein Écran Grille'}</span>
            </button>
          </div>
        </div>

        {/* Middle Row: 6 Official Departments & 3 Curriculum Sections Filter Bar */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-sky-600" />
              <span>Départements :</span>
            </span>
            {(
              ['ALL', ...OFFICIAL_DEPARTMENT_CATEGORIES] as SchoolCategory[]
            ).map((cat) => {
              const count = classes.filter((c) =>
                classMatchesCategory(c, cat)
              ).length;
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => onSelectCategory(cat)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-sky-700 text-white shadow-2xs'
                      : darkMode
                      ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <span>{CATEGORY_SHORT_LABELS[cat]}</span>
                  <span
                    className={`text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded ${
                      isSelected
                        ? 'bg-sky-900/70 text-sky-100'
                        : 'bg-slate-200/90 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 mr-1">
              3 Sections :
            </span>
            {CURRICULUM_SECTION_CATEGORIES.map((cat) => {
              const count = classes.filter((c) =>
                classMatchesCategory(c, cat)
              ).length;
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => onSelectCategory(cat)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-indigo-700 text-white border-indigo-800 shadow-2xs'
                      : darkMode
                      ? 'bg-slate-800 border-slate-700 text-indigo-300 hover:bg-slate-700'
                      : 'bg-indigo-50/80 border-indigo-200 text-indigo-900 hover:bg-indigo-100'
                  }`}
                >
                  <span>{CATEGORY_SHORT_LABELS[cat]}</span>
                  <span
                    className={`text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded ${
                      isSelected
                        ? 'bg-indigo-950/60 text-indigo-100'
                        : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Row: Search, Subject Filter, Conflict-Only Filter & Grid Size Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-200/80 dark:border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Teacher or Subject */}
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5" />
              <input
                type="text"
                value={highlightFilter}
                onChange={(e) => setHighlightFilter(e.target.value)}
                placeholder="Chercher un prof ou une matière..."
                className={`pl-8 pr-7 py-1.5 text-xs font-medium border rounded-lg w-60 ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-white'
                    : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
              {highlightFilter && (
                <button
                  onClick={() => setHighlightFilter('')}
                  className="absolute right-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter by Subject */}
            <select
              value={highlightFilter}
              onChange={(e) => setHighlightFilter(e.target.value)}
              aria-label="Filtrer par matière"
              className={`px-2.5 py-1.5 text-xs font-medium border rounded-lg ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="">-- Filtrer par Matière --</option>
              {allDistinctSubjects.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>

            {/* Filter by Teacher */}
            <select
              value={highlightFilter}
              onChange={(e) => setHighlightFilter(e.target.value)}
              aria-label="Filtrer par enseignant"
              className={`px-2.5 py-1.5 text-xs font-medium border rounded-lg ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="">-- Filtrer par Enseignant --</option>
              {allTeacherNames.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {/* Toggle: Show Only Classes/Cells with Conflicts */}
            <button
              type="button"
              onClick={() => setOnlyShowConflictCells((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                onlyShowConflictCells
                  ? 'bg-rose-600 text-white border-rose-700'
                  : darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  : 'bg-rose-50/70 border-rose-200 text-rose-900 hover:bg-rose-100'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>
                {onlyShowConflictCells
                  ? 'Afficher toutes les classes'
                  : `Isoler les conflits (${conflictAnalysis.items.length})`}
              </span>
            </button>
          </div>

          {/* Right: Display Options (Show Teacher + Grid Density Selector) */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none font-semibold">
              <input
                type="checkbox"
                checked={showTeacherSubtext}
                onChange={(e) => setShowTeacherSubtext(e.target.checked)}
                className="accent-sky-700 w-3.5 h-3.5"
              />
              <span>Afficher nom du prof</span>
            </label>

            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] font-semibold text-slate-500 px-1.5">
                Taille :
              </span>
              {(
                [
                  ['compact', 'Compact'],
                  ['comfort', 'Clair & Lisible'],
                  ['large', 'Grand XL'],
                ] as const
              ).map(([modeKey, label]) => (
                <button
                  key={modeKey}
                  type="button"
                  onClick={() => setGridDensity(modeKey)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                    gridDensity === modeKey
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          2. CENTRE DES CONFLITS & CONTRADICTIONS (TRÈS CLAIR ET BIEN SIGNALÉ)
         ===================================================================== */}
      {showConflictsPanel && (
        <div
          className={`border-2 rounded-xl overflow-hidden shadow-xs transition-all ${
            conflictAnalysis.items.length > 0
              ? criticalConflictsCount > 0
                ? darkMode
                  ? 'bg-rose-950/30 border-rose-700 text-slate-100'
                  : 'bg-rose-50/70 border-rose-400 text-slate-900'
                : darkMode
                ? 'bg-amber-950/30 border-amber-700 text-slate-100'
                : 'bg-amber-50/70 border-amber-400 text-slate-900'
              : darkMode
              ? 'bg-emerald-950/20 border-emerald-800 text-slate-100'
              : 'bg-emerald-50/60 border-emerald-300 text-slate-900'
          }`}
        >
          {/* Header of the Conflict Center */}
          <div
            className={`px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b ${
              conflictAnalysis.items.length > 0
                ? criticalConflictsCount > 0
                  ? darkMode
                    ? 'bg-rose-950/60 border-rose-800'
                    : 'bg-rose-100/90 border-rose-300'
                  : darkMode
                  ? 'bg-amber-950/60 border-amber-800'
                  : 'bg-amber-100/90 border-amber-300'
                : darkMode
                ? 'bg-emerald-950/40 border-emerald-800'
                : 'bg-emerald-100/80 border-emerald-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold ${
                  conflictAnalysis.items.length > 0
                    ? criticalConflictsCount > 0
                      ? 'bg-rose-600 text-white'
                      : 'bg-amber-500 text-slate-950'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {conflictAnalysis.items.length > 0 ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-extrabold tracking-tight flex flex-wrap items-center gap-2">
                  <span>
                    {conflictAnalysis.items.length > 0
                      ? `Radar des Conflits & Contradictions Détectés (${conflictAnalysis.items.length})`
                      : 'Aucun Conflit ni Contradiction Détecté'}
                  </span>
                  {criticalConflictsCount > 0 && (
                    <span className="text-xs font-mono font-bold text-rose-800 dark:text-rose-200">
                      · {criticalConflictsCount} conflit(s) critique(s)
                    </span>
                  )}
                  {warningContradictionsCount > 0 && (
                    <span className="text-xs font-mono font-bold text-amber-900 dark:text-amber-300">
                      · {warningContradictionsCount} contradiction(s) d'organisation
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {conflictAnalysis.items.length > 0
                    ? 'Chaque conflit est encadré en ROUGE ou ORANGE directement sur la Vue d’Ensemble ci-dessous. Cliquez sur un conflit pour le localiser ou le résoudre automatiquement.'
                    : 'Tous les cours respectent les disponibilités des enseignants, les pauses inter-sections et la séparation des départements.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {conflictAnalysis.items.some((i) => i.canAutoResolve) &&
                onAutoResolveConflicts && (
                  <button
                    type="button"
                    onClick={() => onAutoResolveConflicts()}
                    className="px-3.5 py-2 rounded-lg text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>
                      Résoudre Automatiquement Tous les Conflits (
                      {conflictAnalysis.items.filter((i) => i.canAutoResolve).length})
                    </span>
                  </button>
                )}

              <button
                type="button"
                onClick={() => setShowConflictsPanel(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white/60 cursor-pointer"
                title="Masquer ce panneau"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {conflictAnalysis.items.length > 0 && (
            <div className="p-3.5 space-y-3">
              {/* Filter Tabs by Type of Contradiction */}
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ['ALL', 'Tous', conflictAnalysis.items.length],
                    [
                      'double_booking',
                      'Doublons Enseignant (2 classes en même temps)',
                      conflictAnalysis.items.filter(
                        (i) => i.kind === 'double_booking'
                      ).length,
                    ],
                    [
                      'bell_break_overlap',
                      'Chevauchement Pause / Horaire Inter-Sections',
                      conflictAnalysis.items.filter(
                        (i) => i.kind === 'bell_break_overlap'
                      ).length,
                    ],
                    [
                      'unavailable_slot',
                      'Indisponibilités (✕)',
                      conflictAnalysis.items.filter(
                        (i) => i.kind === 'unavailable_slot'
                      ).length,
                    ],
                    [
                      'multi_dept_half_day',
                      '2 Départements même demi-journée (Matin/PM)',
                      conflictAnalysis.items.filter(
                        (i) => i.kind === 'multi_dept_half_day'
                      ).length,
                    ],
                    [
                      'teacher_overload',
                      'Dépassement Charge Max',
                      conflictAnalysis.items.filter(
                        (i) => i.kind === 'teacher_overload'
                      ).length,
                    ],
                  ] as const
                ).map(([k, label, cnt]) => {
                  if (k !== 'ALL' && cnt === 0) return null;
                  const active = conflictKindFilter === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setConflictKindFilter(k)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                          : 'bg-white/90 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white'
                      }`}
                    >
                      <span>{label}</span>
                      <span className="font-mono text-[11px] tabular-nums opacity-80">
                        ({cnt})
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Grid of Clear Conflict Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {filteredConflicts.map((item) => {
                  const isCrit = item.severity === 'critical';
                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-lg border bg-white dark:bg-slate-900 flex flex-col justify-between gap-2 shadow-2xs ${
                        isCrit
                          ? 'border-rose-300 dark:border-rose-800'
                          : 'border-amber-300 dark:border-amber-800'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wide ${
                              isCrit
                                ? 'bg-rose-600 text-white'
                                : 'bg-amber-500 text-slate-950'
                            }`}
                          >
                            ⚠️ {item.badgeLabel}
                          </span>
                          {item.day && item.period && (
                            <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                              {item.day} · P{item.period}
                            </span>
                          )}
                        </div>

                        <div className="text-xs font-extrabold text-slate-900 dark:text-white leading-snug">
                          {item.title}
                        </div>

                        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                          {item.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleFocusConflictInMatrix(item)}
                          className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3 text-sky-600" />
                          <span>Localiser dans la grille</span>
                        </button>

                        {item.canAutoResolve && onAutoResolveConflicts && (
                          <button
                            type="button"
                            onClick={() => onAutoResolveConflicts(item.id)}
                            className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 cursor-pointer"
                          >
                            <Wrench className="w-3 h-3" />
                            <span>Résoudre auto</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          3. TIROIR : STUDIO IA (GÉNÉRER SELON IDÉE / ORDRE)
         ===================================================================== */}
      {showAiGeneratorPanel && (
        <div
          className={`border rounded-xl p-4 space-y-3 shadow-xs ${
            darkMode
              ? 'bg-slate-900 border-slate-800 text-slate-100'
              : 'bg-white border-sky-200 text-slate-900'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-bold">
                Générer ou Modifier avec l'IA selon votre Ordre
              </h3>
              <span className="text-xs text-slate-500">
                · Sans endommager les autres classes ni créer d'intersection horaire
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowAiGeneratorPanel(false)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col lg:flex-row items-stretch gap-2.5">
            <div className="flex-1 relative">
              <textarea
                rows={3}
                value={aiOrderInput}
                onChange={(e) => onChangeAiOrderInput(e.target.value)}
                placeholder="Écrivez votre ordre (ex: scinder Grade 3 Boys en 3A/3B, répartir les matières, organiser les profs sur 2 départements Matin / Après-midi...)"
                className={`w-full pl-3.5 pr-9 py-2 text-xs leading-relaxed border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600 resize-y ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-white placeholder:text-slate-400'
                    : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                }`}
              />
              {aiOrderInput && (
                <button
                  type="button"
                  onClick={() => onChangeAiOrderInput('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  title="Effacer l'ordre"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-col justify-between gap-1.5 shrink-0">
              <button
                type="button"
                disabled={isGeneratingAiOrder}
                onClick={onGenerateWithAiOrder}
                className="px-4 py-2.5 bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {isGeneratingAiOrder
                    ? 'Application en cours...'
                    : 'Traiter & Appliquer cet Ordre'}
                </span>
              </button>
              <div className="text-[11px] text-slate-500 text-center">
                Respecte les pauses & les classes figées
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 mr-1">
              Exemples d'ordres :
            </span>
            {PRESET_AI_ORDERS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => onChangeAiOrderInput(preset.prompt)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                  aiOrderInput === preset.prompt
                    ? 'bg-sky-50 border-sky-400 text-sky-900 font-semibold dark:bg-sky-950 dark:border-sky-600 dark:text-sky-200'
                    : darkMode
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200/80'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Last Generation Report Banner */}
      {lastGenerationReport && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100 text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Ordre appliqué avec succès :</strong>{' '}
                {lastGenerationReport.summary}
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs tabular-nums shrink-0">
              <span>{lastGenerationReport.frozenClassesCount} classe(s) intacte(s)</span>
              <span>·</span>
              <span className="text-emerald-700 dark:text-emerald-300 font-bold">
                {lastGenerationReport.placedCount} séances placées
              </span>
              <span>·</span>
              <span className="text-indigo-700 dark:text-indigo-300 font-bold">
                {lastGenerationReport.leftAsideCount} mise(s) à côté
              </span>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          4. TIROIR : GARDER LES POSITIONS DE CERTAINES CLASSES (CLASSES FIGÉES)
         ===================================================================== */}
      {showFreezeSelector && (
        <div
          className={`p-4 rounded-xl border space-y-3 ${
            darkMode
              ? 'bg-slate-900 border-slate-700'
              : 'bg-amber-50/70 border-amber-300'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span>
                  Sélectionnez les classes dont il faut GARDER les positions actuelles :
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Les classes cochées ci-dessous ne seront jamais modifiées lors d'une génération automatique.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onSetFrozenClassIds([])}
                className="px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                Tout débloquer (0)
              </button>
              {OFFICIAL_DEPARTMENT_CATEGORIES.map((dept) => (
                <button
                  key={dept}
                  type="button"
                  onClick={() => {
                    const deptIds = classes
                      .filter((c) => classMatchesCategory(c, dept))
                      .map((c) => c.id);
                    onSetFrozenClassIds(
                      Array.from(new Set([...frozenClassIds, ...deptIds]))
                    );
                  }}
                  className="px-2.5 py-1 text-xs font-semibold bg-amber-100 text-amber-950 border border-amber-300 rounded-lg hover:bg-amber-200 cursor-pointer"
                >
                  + Figer {CATEGORY_SHORT_LABELS[dept]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowFreezeSelector(false)}
                className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
            {classes.map((cls) => {
              const isFrozen = frozenSet.has(cls.id);
              return (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => onToggleFreezeClass(cls.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
                    isFrozen
                      ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                      : darkMode
                      ? 'bg-slate-800 border-slate-700 text-slate-300 hover:border-amber-500'
                      : 'bg-white border-slate-300 text-slate-700 hover:border-amber-500'
                  }`}
                >
                  {isFrozen ? (
                    <Lock className="w-3 h-3" />
                  ) : (
                    <Unlock className="w-3 h-3 opacity-40" />
                  )}
                  <span>{cls.name}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-amber-200/70 dark:border-slate-700">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Optionnel — Garder aussi la position actuelle de certaines matières dans toutes les classes :
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allDistinctSubjects.map((subj) => {
                const isSubjFrozen = frozenSubjects.includes(subj);
                return (
                  <button
                    key={subj}
                    type="button"
                    onClick={() => onToggleFreezeSubject(subj)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border flex items-center gap-1 cursor-pointer ${
                      isSubjFrozen
                        ? 'bg-indigo-600 text-white border-indigo-700 font-semibold'
                        : darkMode
                        ? 'bg-slate-800 border-slate-700 text-slate-300'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {isSubjFrozen && <Lock className="w-3 h-3" />}
                    <span>{subj}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          INTERCALATED SESSIONS PANEL (Collapsible)
         ===================================================================== */}
      {showIntercalatedPanel && (
        <div className="border-2 border-amber-300 bg-amber-50/90 text-slate-900 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-amber-950 flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-amber-700" />
              <span>
                Séances Partagées, Groupes Dédoublés & Classes Rassemblées ({intercalatedSessions.length})
              </span>
            </h3>
            <button
              onClick={() => setShowIntercalatedPanel(false)}
              className="text-amber-900 hover:text-slate-950 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
            {intercalatedSessions.map((item) => (
              <div
                key={item.id}
                className="p-2.5 bg-white border border-amber-200 rounded-lg text-xs flex flex-col justify-between gap-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-900">
                    {item.kind === 'joint_classes'
                      ? '⊕ Classes Rassemblées'
                      : '⇄ Séance Partagée / 2 Profs'}
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-600 tabular-nums">
                    {item.day} P{item.period}
                  </span>
                </div>
                <p className="text-xs text-slate-700 leading-snug">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =====================================================================
          5. BARRE D'ACTION CONTEXTUELLE (QUAND UNE SÉANCE OU CARTE EST SÉLECTIONNÉE)
         ===================================================================== */}
      {selectedSource && activeSourceClass && (
        <div className="bg-slate-900 text-white rounded-xl p-3.5 shadow-md flex flex-wrap items-center justify-between gap-4 border border-slate-700">
          {/* Left: Selected Subject Card + Any Conflict Alert */}
          <div className="flex items-center gap-3">
            <div
              style={{
                backgroundColor: activeSourceSlot
                  ? getSubjectVisualStyle(activeSourceSlot.subject).bgHex
                  : '#94a3b8',
                color: activeSourceSlot
                  ? getSubjectVisualStyle(activeSourceSlot.subject).textHex
                  : '#0f172a',
              }}
              className="w-20 h-14 rounded-lg border-2 border-white flex flex-col items-center justify-center p-1 text-center shrink-0 shadow-xs"
            >
              <span className="text-xs font-extrabold leading-tight truncate w-full">
                {activeSourceSlot?.subject || 'Libre'}
              </span>
              <span className="text-[10px] font-bold opacity-85 truncate w-full mt-0.5">
                {activeSourceClass.name}
              </span>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-extrabold text-amber-300 tracking-tight">
                  {activeSourceSlot?.subject || 'Créneau Libre'}
                </span>
                <span className="text-xs font-mono bg-slate-800 px-2.5 py-0.5 rounded-md text-sky-300 tabular-nums">
                  {activeSourceClass.name} ·{' '}
                  {selectedSource.slotKey.replace('_', ' P')} (
                  {getPeriodClockTime(
                    activeSourceClass.section,
                    Number(selectedSource.slotKey.split('_')[1])
                  )}
                  )
                </span>
                {activeSourceConflicts.map((c) => (
                  <span
                    key={c.id}
                    className="px-2 py-0.5 rounded bg-rose-600 text-white text-xs font-extrabold"
                  >
                    ⚠️ {c.title}
                  </span>
                ))}
              </div>
              <div className="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-3">
                <span>
                  Enseignant :{' '}
                  <strong className="text-white">
                    {activeSourceSlot?.teacher || 'Aucun'}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Center: Recommended Conflict-Free Switches */}
          <div className="flex-1 min-w-[260px]">
            {hoveredCandidate &&
            hoveredCandidate.targetKey !== selectedSource.slotKey ? (
              <div
                className={`p-2.5 rounded-lg border text-xs ${
                  hoveredCandidate.status === 'optimal'
                    ? 'bg-emerald-950/90 border-emerald-400 text-emerald-100'
                    : hoveredCandidate.status === 'possible_warn'
                    ? 'bg-amber-950/90 border-amber-400 text-amber-100'
                    : 'bg-rose-950/90 border-rose-400 text-rose-100'
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>
                    Cible : {hoveredCandidate.day} P{hoveredCandidate.period} (
                    {hoveredCandidate.targetSlot?.subject || 'Libre'} —{' '}
                    {hoveredCandidate.targetSlot?.teacher || 'Aucun'})
                  </span>
                  <span className="font-mono tabular-nums">
                    {hoveredCandidate.status === 'blocked'
                      ? 'BLOQUÉ (CONFLIT)'
                      : '✓ 100% COMPATIBLE'}
                  </span>
                </div>
                <div className="text-xs mt-0.5">{hoveredCandidate.reason}</div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    Cliquez sur une case encadrée en VERT (✓) sur la ligne{' '}
                    {activeSourceClass.name} pour déplacer/permuter sans conflit :
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {topRecommendedSwitches.map((rec) => (
                    <button
                      key={rec.targetKey}
                      onClick={() => {
                        onSwitchSlots(
                          activeSourceClass.id,
                          selectedSource.slotKey,
                          rec.targetKey
                        );
                        setSelectedSource(null);
                      }}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                    >
                      <ArrowLeftRight className="w-3 h-3" />
                      <span>
                        {rec.day} P{rec.period} (
                        {rec.targetSlot?.subject || 'Créneau Libre'})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: "Mettre à côté" + Edit + Cancel Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {activeSourceSlot && (
              <button
                type="button"
                onClick={() => {
                  onMoveSlotToSideTray(
                    activeSourceClass.id,
                    selectedSource.slotKey
                  );
                  setShowSideTray(true);
                  setSelectedSource(null);
                }}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="Retirer cette séance de la grille et la garder à côté"
              >
                <span>Mettre à côté</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={() => {
                const [dStr, pStr] = selectedSource.slotKey.split('_');
                onEditCell(
                  activeSourceClass.id,
                  dStr as DayOfWeek,
                  Number(pStr),
                  activeSourceSlot
                );
              }}
              className="px-3 py-2 bg-white text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-bold cursor-pointer"
            >
              Modifier séance
            </button>
            <button
              onClick={() => setSelectedSource(null)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          6. ESPACE PRINCIPAL : VUE D'ENSEMBLE ULTRA-CLAIRE (GAUCHE) + MATIÈRES À CÔTÉ (DROITE)
         ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* LEFT COLUMN: MASTER ENSEMBLE TABLE */}
        <div
          className={`${
            showSideTray && !isFullHeightGrid ? 'lg:col-span-9' : 'lg:col-span-12'
          } border rounded-xl overflow-hidden shadow-xs ${
            darkMode
              ? 'bg-slate-900 border-slate-700'
              : 'bg-white border-slate-300'
          }`}
        >
          {/* Active Manual Placement Banner when a Side Card is selected */}
          {selectedSideCard && (
            <div className="bg-emerald-800 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs border-b border-emerald-700">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-emerald-400 text-slate-950 font-extrabold uppercase text-[10px]">
                  Placement Manuel Actif
                </span>
                <span>
                  Cliquez sur une case <strong>verte (✓ LIBRE)</strong> de la ligne{' '}
                  <strong className="underline text-amber-300">
                    {selectedSideCard.className}
                  </strong>{' '}
                  pour placer{' '}
                  <strong>
                    {selectedSideCard.subject} ({selectedSideCard.teacher})
                  </strong>
                  , ou sur une case <strong>ambre (⇄)</strong> pour échanger.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSideCardId(null)}
                className="px-2.5 py-1 rounded bg-emerald-950 hover:bg-slate-900 text-emerald-100 text-xs font-bold cursor-pointer"
              >
                Annuler sélection
              </button>
            </div>
          )}

          {/* Legend strip right above table */}
          <div
            className={`px-4 py-2 border-b flex flex-wrap items-center justify-between gap-3 text-xs ${
              darkMode
                ? 'bg-slate-900 border-slate-800 text-slate-300'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-extrabold text-slate-900 dark:text-white">
                Vue d'Ensemble ({filteredClasses.length} classes affichées)
              </span>
              <span className="text-slate-400">·</span>
              <span className="inline-flex items-center gap-1.5 font-bold text-rose-700 dark:text-rose-400">
                <span className="w-3 h-3 rounded-xs bg-rose-600 inline-block" />
                Cadre Rouge = Conflit (Doublon / Pause / Indispo)
              </span>
              <span className="inline-flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-400">
                <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block" />
                Cadre Orange = Contradiction 2 Départements
              </span>
              <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-400">
                <span className="w-3 h-3 rounded-xs bg-emerald-600 inline-block" />
                Cadre Vert = Place logique 100% libre
              </span>
            </div>

            <div className="text-[11px] text-slate-500">
              1 clic = Sélectionner / Permuter · Double-clic = Éditer la séance
            </div>
          </div>

          <div
            className={`overflow-x-auto ${
              isFullHeightGrid ? 'max-h-[82vh]' : 'max-h-[680px]'
            }`}
          >
            <table
              className={`w-full border-collapse table-fixed ${minTableWidthClass} select-none`}
            >
              <thead className="sticky top-0 z-20">
                {/* Day Header Row */}
                <tr
                  className={
                    darkMode
                      ? 'bg-slate-900 text-slate-100 h-8'
                      : 'bg-slate-100 text-slate-900 h-8'
                  }
                >
                  <th
                    rowSpan={2}
                    className={`w-[178px] sticky left-0 z-30 border-b border-r-2 px-3 text-left text-xs font-extrabold tracking-tight ${
                      darkMode
                        ? 'bg-slate-900 border-slate-700 text-white'
                        : 'bg-slate-100 border-slate-300 text-slate-950'
                    }`}
                  >
                    <div>Classe ({filteredClasses.length})</div>
                    <div className="text-[10px] font-medium text-slate-500 mt-0.5">
                      Département · Section
                    </div>
                  </th>
                  {DAYS_OF_WEEK.map((day, dIdx) => (
                    <th
                      key={day}
                      colSpan={8}
                      className={`border-b border-r-2 text-center text-xs font-extrabold tracking-wide ${
                        darkMode
                          ? dIdx % 2 === 0
                            ? 'bg-slate-900 border-slate-700 text-sky-300'
                            : 'bg-slate-800/90 border-slate-700 text-indigo-300'
                          : dIdx % 2 === 0
                          ? 'bg-slate-100 border-slate-400 text-slate-900'
                          : 'bg-slate-200/75 border-slate-400 text-slate-950'
                      }`}
                    >
                      {day}
                    </th>
                  ))}
                </tr>

                {/* Period Numbers Row (P1..P8 with half-day divider after P4) */}
                <tr
                  className={
                    darkMode
                      ? 'bg-slate-800 text-slate-200 h-6'
                      : 'bg-slate-50 text-slate-700 h-6'
                  }
                >
                  {DAYS_OF_WEEK.map((day) =>
                    [1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                      <th
                        key={`${day}_p_${p}`}
                        className={`border-b border-r text-center text-[10px] font-bold font-mono tabular-nums ${
                          darkMode ? 'border-slate-700' : 'border-slate-300'
                        } ${
                          p === 8
                            ? darkMode
                              ? 'border-r-2 border-r-slate-600'
                              : 'border-r-2 border-r-slate-400'
                            : p === 4
                            ? darkMode
                              ? 'border-r-2 border-r-sky-900/70'
                              : 'border-r-2 border-r-slate-300'
                            : ''
                        }`}
                        title={
                          p <= 4
                            ? `Matin — Période ${p}`
                            : `Après-midi — Période ${p}`
                        }
                      >
                        P{p}
                      </th>
                    ))
                  )}
                </tr>
              </thead>

              <tbody>
                {filteredClasses.map((cls) => {
                  const isRowActive = selectedSource?.classId === cls.id;
                  const isSideCardTargetRow =
                    selectedSideCard?.classId === cls.id;
                  const isClassFrozen = frozenSet.has(cls.id);
                  const lockedSet = new Set(lockedSlotsByClass[cls.id] || []);
                  const officialDept = getClassOfficialDepartment(cls);
                  const currSec = getClassCurriculumSection(cls);
                  const catShort = `${CATEGORY_SHORT_LABELS[officialDept]} · ${getCurriculumShortLabel(currSec)}`;
                  const unplacedForThisClass = unplacedLessons.filter(
                    (u) => u.classId === cls.id
                  ).length;
                  const classConflictsCount =
                    conflictAnalysis.classConflictCountMap.get(cls.id) || 0;

                  return (
                    <tr
                      key={cls.id}
                      className={`${rowHeightClass} transition-colors ${
                        isSideCardTargetRow
                          ? 'ring-2 ring-emerald-500 z-10 relative'
                          : isRowActive
                          ? 'ring-2 ring-sky-500 z-10 relative'
                          : ''
                      }`}
                    >
                      {/* Sticky Left Column: Class Name + Conflict Badge + Rename (✏️) + Freeze (🔒) */}
                      <td
                        className={`sticky left-0 z-10 border-b border-r-2 px-2.5 py-1 text-left align-middle ${
                          isSideCardTargetRow
                            ? 'bg-emerald-950 text-white border-emerald-700'
                            : isRowActive
                            ? 'bg-sky-950 text-white border-sky-700'
                            : isClassFrozen
                            ? darkMode
                              ? 'bg-amber-950/60 text-amber-100 border-slate-700'
                              : 'bg-amber-50 text-slate-950 border-slate-300'
                            : darkMode
                            ? 'bg-slate-900 text-slate-100 border-slate-700'
                            : 'bg-white text-slate-950 border-slate-300'
                        }`}
                      >
                        {editingClassMetaId === cls.id ? (
                          <div className="p-1.5 bg-white text-slate-900 rounded-lg border border-indigo-500 space-y-1 shadow-md">
                            <input
                              type="text"
                              value={editClassNameVal}
                              onChange={(e) =>
                                setEditClassNameVal(e.target.value)
                              }
                              placeholder="Nom classe"
                              className="w-full px-1.5 py-0.5 text-xs font-bold border border-slate-300 rounded"
                            />
                            <select
                              value={editClassCatVal}
                              onChange={(e) =>
                                setEditClassCatVal(
                                  e.target.value as Exclude<
                                    SchoolCategory,
                                    'ALL'
                                  >
                                )
                              }
                              className="w-full px-1 py-0.5 text-[10px] font-semibold border border-slate-300 rounded bg-white"
                            >
                              {OFFICIAL_DEPARTMENT_CATEGORIES.map((d) => (
                                <option key={d} value={d}>
                                  {CATEGORY_SHORT_LABELS[d]}
                                </option>
                              ))}
                            </select>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  if (onRenameOrModifyClass) {
                                    onRenameOrModifyClass({
                                      classId: cls.id,
                                      newName:
                                        editClassNameVal.trim() || cls.name,
                                      newCategory: editClassCatVal,
                                      newRoom:
                                        editClassRoomVal.trim() || cls.room,
                                    });
                                  }
                                  setEditingClassMetaId(null);
                                }}
                                className="flex-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold cursor-pointer"
                              >
                                Enregistrer
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingClassMetaId(null)}
                                className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-1">
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-extrabold leading-tight truncate flex items-center gap-1.5">
                                <span className="truncate">{cls.name}</span>
                                {classConflictsCount > 0 && (
                                  <span
                                    title={`${classConflictsCount} conflit(s) ou contradiction(s) dans ${cls.name}`}
                                    className="px-1.5 py-0.2 rounded bg-rose-600 text-white text-[9px] font-mono font-extrabold shrink-0"
                                  >
                                    ⚠️ {classConflictsCount}
                                  </span>
                                )}
                                {unplacedForThisClass > 0 && (
                                  <span
                                    title={`${unplacedForThisClass} matière(s) à côté pour ${cls.name}`}
                                    className="px-1 rounded bg-indigo-600 text-white text-[9px] font-mono shrink-0"
                                  >
                                    +{unplacedForThisClass}
                                  </span>
                                )}
                              </div>
                              <div
                                className={`text-[10px] leading-tight mt-0.5 truncate ${
                                  isRowActive || isSideCardTargetRow
                                    ? 'text-sky-200'
                                    : isClassFrozen
                                    ? 'text-amber-700 dark:text-amber-300 font-semibold'
                                    : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {isClassFrozen
                                  ? '🔒 Positions gardées'
                                  : catShort}
                              </div>
                            </div>

                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingClassMetaId(cls.id);
                                  setEditClassNameVal(cls.name);
                                  setEditClassCatVal(officialDept);
                                  setEditClassRoomVal(cls.room);
                                }}
                                title={`Renommer ou modifier le département de ${cls.name}`}
                                className="p-1 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-indigo-600 transition-colors cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleFreezeClass(cls.id);
                                }}
                                title={
                                  isClassFrozen
                                    ? `Positions gardées pour ${cls.name} (cliquer pour débloquer)`
                                    : `Garder les positions des matières pour ${cls.name}`
                                }
                                className={`p-1 rounded transition-colors shrink-0 cursor-pointer ${
                                  isClassFrozen
                                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                                    : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-700'
                                }`}
                              >
                                {isClassFrozen ? (
                                  <Lock className="w-3 h-3" />
                                ) : (
                                  <Unlock className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 40 Period Cells (5 Days × 8 Periods) */}
                      {DAYS_OF_WEEK.map((day) =>
                        [1, 2, 3, 4, 5, 6, 7, 8].map((period) => {
                          const slotKey = `${day}_${period}`;
                          const slot = cls.slots[slotKey];
                          const isSourceCell =
                            isRowActive && selectedSource?.slotKey === slotKey;
                          const compat = isRowActive
                            ? rowCompatibilityMap?.[slotKey]
                            : undefined;
                          const sideCompat = isSideCardTargetRow
                            ? sideCardCompatibilityBySlot?.[slotKey]
                            : undefined;
                          const isLocked =
                            lockedSet.has(slotKey) ||
                            isClassFrozen ||
                            Boolean(
                              slot && frozenSubjects.includes(slot.subject)
                            );

                          // Check if this exact cell has any conflict or contradiction!
                          const cellConflicts =
                            conflictAnalysis.cellConflictMap.get(
                              `${cls.id}__${slotKey}`
                            ) || [];
                          const primaryConflict = cellConflicts[0];
                          const hasCriticalConflict = cellConflicts.some(
                            (c) => c.severity === 'critical'
                          );
                          const hasWarningConflict =
                            !hasCriticalConflict && cellConflicts.length > 0;

                          const intercalInfo = intercalatedCellMap.get(
                            `${cls.name}__${slotKey}`
                          );
                          const hasSplitOrCoTeach = Boolean(
                            slot &&
                              ((slot.subSubject && slot.subTeacher) ||
                                slot.teacher.includes('/') ||
                                slot.teacher.includes('&') ||
                                slot.isIntercalated)
                          );
                          const hasJointClass = Boolean(
                            slot?.jointWithClasses &&
                              slot.jointWithClasses.length > 0
                          );
                          const isAnyIntercalated =
                            hasSplitOrCoTeach ||
                            hasJointClass ||
                            Boolean(intercalInfo);

                          let isDimmed = false;
                          if (highlightFilter.trim()) {
                            const q = highlightFilter.toLowerCase();
                            const match =
                              slot &&
                              (slot.subject.toLowerCase().includes(q) ||
                                slot.teacher.toLowerCase().includes(q) ||
                                slot.subSubject?.toLowerCase().includes(q) ||
                                slot.subTeacher?.toLowerCase().includes(q));
                            if (!match) isDimmed = true;
                          }
                          if (highlightIntercalatedOnly && !isAnyIntercalated) {
                            isDimmed = true;
                          }

                          const visual = slot
                            ? getSubjectVisualStyle(slot.subject)
                            : {
                                bgHex: darkMode ? '#0f172a' : '#f8fafc',
                                textHex: darkMode ? '#64748b' : '#94a3b8',
                                borderHex: '#cbd5e1',
                              };

                          // Overlay for Row Switch, Side Card Placement, OR Conflict Signaling
                          let cellRingClass = '';
                          if (isSideCardTargetRow && sideCompat) {
                            if (sideCompat.status === 'free_logical') {
                              cellRingClass =
                                'ring-2 ring-inset ring-emerald-600 bg-emerald-100! cursor-pointer hover:brightness-95';
                            } else if (sideCompat.status === 'swap_logical') {
                              cellRingClass =
                                'ring-2 ring-inset ring-amber-500 cursor-pointer hover:brightness-105';
                            } else {
                              cellRingClass = 'opacity-30 cursor-not-allowed';
                            }
                          } else if (isRowActive && !isSourceCell && compat) {
                            if (compat.status === 'optimal') {
                              cellRingClass =
                                'ring-2 ring-inset ring-emerald-600 cursor-pointer hover:brightness-105';
                            } else if (compat.status === 'possible_warn') {
                              cellRingClass =
                                'ring-2 ring-inset ring-amber-500 cursor-pointer';
                            } else {
                              cellRingClass = 'opacity-35 cursor-not-allowed';
                            }
                          } else if (hasCriticalConflict) {
                            cellRingClass =
                              'ring-3 ring-inset ring-rose-600 z-10';
                          } else if (hasWarningConflict) {
                            cellRingClass =
                              'ring-2 ring-inset ring-amber-500 z-10';
                          }

                          return (
                            <td
                              key={slotKey}
                              draggable={Boolean(slot)}
                              onDragStart={() => {
                                if (slot) {
                                  setDraggedItem({
                                    type: 'grid_cell',
                                    classId: cls.id,
                                    slotKey,
                                  });
                                }
                              }}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (!draggedItem) return;
                                if (
                                  draggedItem.type === 'side_card' &&
                                  draggedItem.classId === cls.id
                                ) {
                                  onPlaceCardFromSideTray(
                                    draggedItem.cardId,
                                    cls.id,
                                    slotKey,
                                    true
                                  );
                                  setSelectedSideCardId(null);
                                } else if (
                                  draggedItem.type === 'grid_cell' &&
                                  draggedItem.classId === cls.id &&
                                  draggedItem.slotKey !== slotKey
                                ) {
                                  onSwitchSlots(
                                    cls.id,
                                    draggedItem.slotKey,
                                    slotKey
                                  );
                                }
                                setDraggedItem(null);
                              }}
                              onClick={() => handleCellClick(cls, day, period)}
                              onDoubleClick={() =>
                                onEditCell(cls.id, day, period, slot)
                              }
                              onMouseEnter={() => {
                                if (isRowActive && compat) {
                                  setHoveredCandidate(compat);
                                }
                              }}
                              onMouseLeave={() => {
                                if (hoveredCandidate?.targetKey === slotKey) {
                                  setHoveredCandidate(null);
                                }
                              }}
                              style={{
                                backgroundColor: slot
                                  ? visual.bgHex
                                  : darkMode
                                  ? '#0f172a'
                                  : '#f8fafc',
                                color: visual.textHex,
                              }}
                              title={
                                cellConflicts.length > 0
                                  ? `⚠️ CONFLIT DÉTECTÉ :\n${cellConflicts
                                      .map((c) => `• ${c.title}: ${c.description}`)
                                      .join('\n')}\n(Cliquez sur la case pour voir les solutions vertes sans conflit)`
                                  : isSideCardTargetRow && sideCompat
                                  ? `[Placement ${selectedSideCard?.subject}] ${sideCompat.reason}`
                                  : compat && isRowActive && !isSourceCell
                                  ? `[Switch ${
                                      compat.status === 'blocked'
                                        ? 'BLOQUÉ'
                                        : 'COMPATIBLE'
                                    }] ${compat.reason}`
                                  : slot
                                  ? `${cls.name} · ${day} P${period} (${getPeriodClockTime(
                                      cls.section,
                                      period
                                    )})\nMatière : ${slot.subject}\nEnseignant : ${
                                      slot.teacher
                                    }`
                                  : `${cls.name} · ${day} P${period} — Créneau libre`
                              }
                              className={`border-b border-r px-1 py-0.5 text-center align-middle relative transition-all cursor-pointer ${
                                darkMode
                                  ? 'border-slate-700'
                                  : 'border-slate-300'
                              } ${
                                period === 8
                                  ? darkMode
                                    ? 'border-r-2 border-r-slate-500'
                                    : 'border-r-2 border-r-slate-400'
                                  : period === 4
                                  ? darkMode
                                    ? 'border-r-2 border-r-slate-700'
                                    : 'border-r-2 border-r-slate-300'
                                  : ''
                              } ${
                                isSourceCell
                                  ? 'ring-3 ring-inset ring-slate-950 scale-[1.03] z-20 shadow-md'
                                  : cellRingClass
                              } ${isDimmed ? 'opacity-20' : ''}`}
                            >
                              {/* Top-Left / Top-Full Alert Banner when Cell has a Conflict or Contradiction */}
                              {primaryConflict && (
                                <div
                                  className={`w-full text-[8.5px] font-extrabold leading-none py-0.5 px-0.5 rounded-t truncate mb-0.5 ${
                                    hasCriticalConflict
                                      ? 'bg-rose-600 text-white'
                                      : 'bg-amber-500 text-slate-950'
                                  }`}
                                >
                                  ⚠️ {primaryConflict.badgeLabel}
                                </div>
                              )}

                              {isLocked && !primaryConflict && (
                                <Lock className="w-2.5 h-2.5 absolute top-0.5 right-0.5 opacity-60" />
                              )}

                              {!isLocked && !primaryConflict && isAnyIntercalated && (
                                <span
                                  className={`absolute top-0 right-0 px-1 text-[8px] font-extrabold leading-none rounded-bl ${
                                    hasJointClass
                                      ? 'bg-indigo-800 text-white'
                                      : 'bg-slate-800/85 text-amber-200'
                                  }`}
                                >
                                  {hasJointClass ? '⊕' : '⇄'}
                                </span>
                              )}

                              {/* Badge when placing a Side Card */}
                              {isSideCardTargetRow && sideCompat && (
                                <span
                                  className={`absolute bottom-0 right-0 px-1 text-[8.5px] font-mono font-extrabold leading-none ${
                                    sideCompat.status === 'free_logical'
                                      ? 'bg-emerald-700 text-white'
                                      : sideCompat.status === 'swap_logical'
                                      ? 'bg-amber-600 text-white'
                                      : 'bg-rose-700 text-white'
                                  }`}
                                >
                                  {sideCompat.status === 'free_logical'
                                    ? '✓'
                                    : sideCompat.status === 'swap_logical'
                                    ? '⇄'
                                    : '✕'}
                                </span>
                              )}

                              {/* Switch compatibility badge when row is in Switch Mode */}
                              {!isSideCardTargetRow &&
                                isRowActive &&
                                !isSourceCell &&
                                compat && (
                                  <span
                                    className={`absolute bottom-0 right-0 px-1 text-[8.5px] font-mono font-extrabold leading-none ${
                                      compat.status === 'optimal'
                                        ? 'bg-emerald-700 text-white'
                                        : compat.status === 'possible_warn'
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-rose-700 text-white'
                                    }`}
                                  >
                                    {compat.status === 'optimal'
                                      ? '✓'
                                      : compat.status === 'possible_warn'
                                      ? '!'
                                      : '✕'}
                                  </span>
                                )}

                              {slot ? (
                                <div className="flex flex-col justify-center items-center h-full overflow-hidden leading-tight">
                                  <div
                                    className={`${
                                      gridDensity === 'large'
                                        ? 'text-xs'
                                        : gridDensity === 'comfort'
                                        ? 'text-[11px]'
                                        : 'text-[10px]'
                                    } font-extrabold tracking-tight truncate w-full`}
                                  >
                                    {slot.subject}
                                  </div>
                                  {slot.subSubject && (
                                    <div className="text-[9px] font-bold truncate w-full border-t border-current/25 mt-0.5 pt-0.5">
                                      {slot.subSubject}
                                    </div>
                                  )}
                                  {showTeacherSubtext && !slot.subSubject && (
                                    <div
                                      className={`${
                                        gridDensity === 'large'
                                          ? 'text-[10.5px]'
                                          : 'text-[9.5px]'
                                      } font-semibold opacity-90 truncate w-full mt-0.5`}
                                    >
                                      {slot.teacher}
                                      {slot.assistantTeacher
                                        ? ` +${slot.assistantTeacher}`
                                        : ''}
                                    </div>
                                  )}
                                </div>
                              ) : isSideCardTargetRow &&
                                sideCompat?.status === 'free_logical' ? (
                                <div className="text-[10px] font-extrabold text-emerald-800">
                                  + Placer
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-300 dark:text-slate-700">
                                  —
                                </div>
                              )}
                            </td>
                          );
                        })
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN: BAC DES MATIÈRES À CÔTÉ (RÉSERVE MANUELLE & SANS PLACE LOGIQUE) */}
        {showSideTray && !isFullHeightGrid && (
          <aside
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (draggedItem && draggedItem.type === 'grid_cell') {
                onMoveSlotToSideTray(draggedItem.classId, draggedItem.slotKey);
                setDraggedItem(null);
                setSelectedSource(null);
              }
            }}
            className={`lg:col-span-3 border rounded-xl p-3.5 space-y-3 flex flex-col max-h-[680px] ${
              darkMode
                ? 'bg-slate-900 border-slate-700 text-slate-100'
                : 'bg-white border-slate-300 text-slate-900 shadow-2xs'
            }`}
          >
            {/* Header of Side Tray */}
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Inbox className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold tracking-tight">
                    Matières à Côté ({unplacedLessons.length})
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    Réserve manuelle & sans place logique
                  </p>
                </div>
              </div>

              {unplacedLessons.length > 0 && (
                <button
                  type="button"
                  onClick={onAutoPlaceSideTrayCards}
                  title="Placer automatiquement toutes les cartes qui ont une place logique libre"
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Check className="w-3 h-3" />
                  <span>Placer Auto</span>
                </button>
              )}
            </div>

            {/* Quick Form: Add a Subject Manually to Side Tray */}
            <div
              className={`p-2.5 rounded-lg border space-y-2 ${
                darkMode
                  ? 'bg-slate-800/80 border-slate-700'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                <span>+ Mettre une matière à côté :</span>
                <span className="text-[10px] font-normal text-slate-400">
                  ou glisser depuis la grille
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={newTrayClassId}
                  onChange={(e) => setNewTrayClassId(e.target.value)}
                  aria-label="Classe pour matière à côté"
                  className={`px-2 py-1 text-xs border rounded-md ${
                    darkMode
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={newTrayPeriods}
                    onChange={(e) =>
                      setNewTrayPeriods(
                        Math.max(1, Math.min(10, Number(e.target.value) || 1))
                      )
                    }
                    className={`w-12 px-1.5 py-1 text-xs border rounded-md text-center font-mono tabular-nums ${
                      darkMode
                        ? 'bg-slate-900 border-slate-700 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                    title="Nombre de séances à mettre à côté"
                  />
                  <span className="text-[10px] text-slate-500">séance(s)</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  list="side-tray-subjects-list"
                  value={newTraySubject}
                  onChange={(e) => handleSelectTraySubject(e.target.value)}
                  placeholder="Matière (ex: Maths)"
                  className={`px-2 py-1 text-xs border rounded-md ${
                    darkMode
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <datalist id="side-tray-subjects-list">
                  {allDistinctSubjects.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>

                <input
                  type="text"
                  list="side-tray-teachers-list"
                  value={newTrayTeacher}
                  onChange={(e) => setNewTrayTeacher(e.target.value)}
                  placeholder="Enseignant"
                  className={`px-2 py-1 text-xs border rounded-md ${
                    darkMode
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <datalist id="side-tray-teachers-list">
                  {allTeacherNames.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!newTraySubject.trim() || !newTrayClassId) return;
                  onAddManualUnplacedLesson({
                    classId: newTrayClassId,
                    subject: newTraySubject.trim(),
                    teacher: newTrayTeacher.trim() || 'Enseignant',
                    periodsCount: newTrayPeriods,
                  });
                }}
                className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter à côté pour placer</span>
              </button>
            </div>

            {/* Filter by class inside Side Tray */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <select
                value={sideTrayFilterClassId}
                onChange={(e) => setSideTrayFilterClassId(e.target.value)}
                aria-label="Filtrer la réserve par classe"
                className={`flex-1 px-2 py-1 text-xs border rounded-md ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-slate-200'
                    : 'bg-slate-50 border-slate-300 text-slate-800'
                }`}
              >
                <option value="ALL">
                  Toutes les classes ({filteredSideCards.length})
                </option>
                {classes.map((c) => {
                  const cnt = unplacedLessons.filter(
                    (u) => u.classId === c.id
                  ).length;
                  if (cnt === 0) return null;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name} ({cnt} à côté)
                    </option>
                  );
                })}
              </select>

              {unplacedLessons.length > 0 && (
                <button
                  type="button"
                  onClick={onClearSideTray}
                  title="Vider la réserve"
                  className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* List of Unplaced / Side-Tray Subject Cards */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[180px]">
              {filteredSideCards.length === 0 ? (
                <div className="h-44 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-4 flex flex-col items-center justify-center text-center text-xs text-slate-500">
                  <Inbox className="w-6 h-6 text-slate-400 mb-1.5" />
                  <div className="font-semibold text-slate-700 dark:text-slate-300">
                    Aucune matière en attente à côté
                  </div>
                  <p className="text-[11px] mt-1">
                    Cliquez sur une séance de la grille puis sur{' '}
                    <strong>« Mettre à côté »</strong>, ou ajoutez une matière ci-dessus.
                  </p>
                </div>
              ) : (
                filteredSideCards.map((card) => {
                  const visual = getSubjectVisualStyle(card.subject);
                  const isCardSelected = selectedSideCardId === card.id;
                  return (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={() => {
                        setSelectedSideCardId(card.id);
                        setDraggedItem({
                          type: 'side_card',
                          cardId: card.id,
                          classId: card.classId,
                        });
                      }}
                      onClick={() => {
                        setSelectedSource(null);
                        setSelectedSideCardId(
                          isCardSelected ? null : card.id
                        );
                      }}
                      className={`p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
                        isCardSelected
                          ? 'ring-2 ring-emerald-500 border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40'
                          : darkMode
                          ? 'bg-slate-800 border-slate-700 hover:border-indigo-500'
                          : 'bg-white border-slate-200 hover:border-indigo-400'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            style={{
                              backgroundColor: visual.bgHex,
                              color: visual.textHex,
                            }}
                            className="px-2 py-0.5 rounded text-[11px] font-extrabold truncate border border-black/10"
                          >
                            {card.subject}
                          </span>
                          <span className="font-mono text-xs font-extrabold text-indigo-700 dark:text-indigo-300">
                            {card.className}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (selectedSideCardId === card.id) {
                              setSelectedSideCardId(null);
                            }
                            onRemoveUnplacedCard(card.id);
                          }}
                          title="Supprimer cette carte"
                          className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                        <span className="truncate">
                          Prof : <strong>{card.teacher}</strong>
                        </span>
                        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                          {isCardSelected
                            ? '✓ Cliquer case verte'
                            : 'Cliquer pour placer'}
                        </span>
                      </div>

                      {card.reason && (
                        <div className="mt-1 text-[10px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded">
                          {card.reason}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
