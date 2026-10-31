import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  GitMerge,
  Inbox,
  Layers,
  Lock,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Printer,
  Search,
  Sparkles,
  Trash2,
  Unlock,
  Wand2,
  X,
} from 'lucide-react';
import { DAYS_OF_WEEK } from '../data/alkawtharDefaults';
import {
  DayOfWeek,
  IntercalatedSessionInfo,
  LessonSlot,
  SchoolCategory,
  SchoolClass,
  TeacherProfile,
  UnplacedLessonCard,
} from '../types/timetable';
import {
  CATEGORY_SHORT_LABELS,
  classMatchesCategory,
  detectIntercalatedSessions,
  evaluateRowSwitchCompatibility,
  getPeriodClockTime,
  getPrimaryClassCategory,
  getSubjectVisualStyle,
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
  darkMode = false,
}) => {
  const [selectedSource, setSelectedSource] = useState<{
    classId: string;
    slotKey: string;
  } | null>(null);

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

  // Panels visibility
  const [showAiGeneratorPanel, setShowAiGeneratorPanel] = useState<boolean>(true);
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

  const filteredClasses = useMemo(
    () => classes.filter((c) => classMatchesCategory(c, selectedCategory)),
    [classes, selectedCategory]
  );

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
          Boolean(cand.targetSlot)
      )
      .sort((a, b) => b.scoreDelta - a.scoreDelta)
      .slice(0, 4);
  }, [rowCompatibilityMap, selectedSource]);

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

  // Auto-suggest teacher when user picks class + subject in the "Ajouter à côté" mini form
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
        // Switch selection to normal cell if user clicked a different class
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

  return (
    <div className="space-y-3 no-print">
      {/* =====================================================================
          1. STUDIO IA SIMPLIFIÉ : GÉNÉRER SELON IDÉE / ORDRE + GARDER POSITIONS DE CERTAINES CLASSES
         ===================================================================== */}
      <div
        className={`border rounded-xl overflow-hidden shadow-xs transition-all ${
          darkMode
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header Bar of the AI & Frozen Classes Studio */}
        <div
          className={`px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b ${
            darkMode
              ? 'bg-slate-900 border-slate-800'
              : 'bg-slate-50/90 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-sky-700 text-white flex items-center justify-center shrink-0">
              <Wand2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold tracking-tight flex items-center gap-2">
                <span>
                  Générer avec l'IA selon votre Idée / Ordre & Classes Figées
                </span>
                <span className="text-[11px] font-normal text-slate-500 hidden md:inline">
                  · Les matières sans place logique restent automatiquement à côté
                </span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFreezeSelector((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                frozenClassIds.length > 0 || frozenSubjects.length > 0
                  ? 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/60 dark:border-amber-700 dark:text-amber-200'
                  : darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              <span>
                Garder positions : {frozenClassIds.length} classe(s)
                {frozenSubjects.length > 0
                  ? ` · ${frozenSubjects.length} matière(s)`
                  : ''}
              </span>
              {showFreezeSelector ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowSideTray((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                unplacedLessons.length > 0
                  ? 'bg-indigo-600 text-white border-indigo-700'
                  : darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {showSideTray ? (
                <PanelRightClose className="w-3.5 h-3.5" />
              ) : (
                <PanelRightOpen className="w-3.5 h-3.5" />
              )}
              <span>Matières à Côté ({unplacedLessons.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAiGeneratorPanel((v) => !v)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 cursor-pointer"
              title={showAiGeneratorPanel ? 'Réduire' : 'Développer'}
            >
              {showAiGeneratorPanel ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {showAiGeneratorPanel && (
          <div className="p-3.5 space-y-3">
            {/* Row 1: Multi-line Order Textarea + Action Buttons */}
            <div className="flex flex-col lg:flex-row items-stretch gap-2.5">
              <div className="flex-1 relative">
                <textarea
                  rows={3}
                  value={aiOrderInput}
                  onChange={(e) => onChangeAiOrderInput(e.target.value)}
                  placeholder="Collez ou écrivez votre ordre complet (scission de classes Grade 3A/3B, répartition des matières et enseignantes, charges horaires, séances communes ou complémentaires...)"
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
                      ? 'Application de l’ordre en cours...'
                      : 'Traiter & Appliquer cet Ordre'}
                  </span>
                </button>
                <div className="text-[10px] text-slate-500 text-center">
                  Sans endommager les autres classes · 0 conflit
                </div>
              </div>
            </div>

            {/* Row 2: Quick Idea / Order Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 mr-1">
                Ordres rapides :
              </span>
              {PRESET_AI_ORDERS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onChangeAiOrderInput(preset.prompt)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
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

            {/* Collapsible Selector: Keep Positions for Specific Classes & Subjects */}
            {showFreezeSelector && (
              <div
                className={`p-3 rounded-lg border space-y-3 ${
                  darkMode
                    ? 'bg-slate-800/70 border-slate-700'
                    : 'bg-amber-50/50 border-amber-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-600" />
                      <span>
                        Sélectionnez les classes dont il faut GARDER les positions actuelles (Classes Figées) :
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      Les classes cochées ci-dessous (ou verrouillées avec 🔒 dans la colonne de gauche) ne changeront pas pendant la génération.
                    </p>
                  </div>

                  {/* Quick Group Freeze Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSetFrozenClassIds([])}
                      className="px-2 py-1 text-[11px] font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 cursor-pointer"
                    >
                      Tout libérer (0)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const kgIds = classes
                          .filter((c) =>
                            classMatchesCategory(c, 'KG_Maternelle')
                          )
                          .map((c) => c.id);
                        onSetFrozenClassIds(
                          Array.from(new Set([...frozenClassIds, ...kgIds]))
                        );
                      }}
                      className="px-2 py-1 text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 rounded hover:bg-amber-200 cursor-pointer"
                    >
                      + Figer Maternelle (KG)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const primIds = classes
                          .filter((c) => classMatchesCategory(c, 'Primaire'))
                          .map((c) => c.id);
                        onSetFrozenClassIds(
                          Array.from(new Set([...frozenClassIds, ...primIds]))
                        );
                      }}
                      className="px-2 py-1 text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 rounded hover:bg-amber-200 cursor-pointer"
                    >
                      + Figer Primaire
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const secIds = classes
                          .filter((c) => classMatchesCategory(c, 'Secondaire'))
                          .map((c) => c.id);
                        onSetFrozenClassIds(
                          Array.from(new Set([...frozenClassIds, ...secIds]))
                        );
                      }}
                      className="px-2 py-1 text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 rounded hover:bg-amber-200 cursor-pointer"
                    >
                      + Figer Secondaire
                    </button>
                  </div>
                </div>

                {/* Class Checkboxes Grid */}
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
                  {classes.map((cls) => {
                    const isFrozen = frozenSet.has(cls.id);
                    return (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => onToggleFreezeClass(cls.id)}
                        className={`px-2.5 py-1 rounded text-xs font-semibold border flex items-center gap-1.5 transition-all cursor-pointer ${
                          isFrozen
                            ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                            : darkMode
                            ? 'bg-slate-900 border-slate-700 text-slate-300 hover:border-amber-500'
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

                {/* Also allow keeping specific Subjects fixed across all classes */}
                <div className="pt-2 border-t border-amber-200/70 dark:border-slate-700">
                  <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">
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
                          className={`px-2 py-0.5 rounded text-[11px] font-medium border flex items-center gap-1 cursor-pointer ${
                            isSubjFrozen
                              ? 'bg-indigo-600 text-white border-indigo-700 font-semibold'
                              : darkMode
                              ? 'bg-slate-900 border-slate-700 text-slate-300'
                              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {isSubjFrozen && <Lock className="w-2.5 h-2.5" />}
                          <span>{subj}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Last Generation Summary Banner + Teacher Load Verification Table */}
            {lastGenerationReport && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Ordre appliqué avec succès :</strong>{' '}
                      {lastGenerationReport.summary}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px] shrink-0">
                    <span>
                      {lastGenerationReport.frozenClassesCount} classe(s) intacte(s) 🔒
                    </span>
                    <span>·</span>
                    <span className="text-emerald-700 font-bold">
                      {lastGenerationReport.placedCount} séances placées ✓
                    </span>
                    <span>·</span>
                    <span className="text-indigo-700 font-bold">
                      {lastGenerationReport.leftAsideCount} mise(s) à côté 👉
                    </span>
                  </div>
                </div>

                {lastGenerationReport.teacherLoadVerification &&
                  lastGenerationReport.teacherLoadVerification.length > 0 && (
                    <div className="pt-2 border-t border-emerald-200">
                      <div className="text-[11px] font-bold text-emerald-950 mb-1.5">
                        Vérification des Charges Horaires Cibles (Séances / Semaine) :
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        {lastGenerationReport.teacherLoadVerification.map(
                          (v) => (
                            <div
                              key={v.teacher}
                              className="bg-white/90 border border-emerald-200 rounded-md px-2.5 py-1.5 flex flex-col justify-between"
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-slate-900 text-[11px]">
                                  {v.teacher}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono font-bold text-[10px]">
                                  {v.actualPeriods} / {v.targetPeriods} séances ✓
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-600 mt-0.5 leading-snug">
                                {v.details}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                {lastGenerationReport.multiDeptReport &&
                  lastGenerationReport.multiDeptReport.length > 0 && (
                    <div className="pt-2 border-t border-emerald-200">
                      <div className="text-[11px] font-bold text-emerald-950 mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <span>
                          Enseignants Multi-Départements (Organisation Matin Dépt 1 / Après-midi Dépt 2 & Respect des Pauses Inter-Sections) :
                        </span>
                        <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-900 font-mono text-[10px] font-bold">
                          0 Intersection Horaire / Pause (Break) ✓
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        {lastGenerationReport.multiDeptReport.map((m) => (
                          <div
                            key={m.teacher}
                            className="bg-white/90 border border-sky-200 rounded-md px-2.5 py-1.5 flex flex-col justify-between"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold text-slate-900 text-[11px]">
                                {m.teacher}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-900 font-mono font-bold text-[10px]">
                                {m.departments.length} dépts · 0 chevauchement
                              </span>
                            </div>
                            <div className="text-[10px] text-sky-900 font-medium mt-0.5 truncate">
                              {m.departments.join(' ⇄ ')}
                            </div>
                            <div className="text-[10px] text-slate-600 mt-0.5 leading-snug">
                              {m.patternSummary}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* =====================================================================
          2. BARRE DE FILTRES RAPIDES VUE D'ENSEMBLE
         ===================================================================== */}
      <div
        className={`border rounded-lg p-3 space-y-2.5 ${
          darkMode
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-300 text-slate-900'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Category Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-sky-600" />
              <span>Section :</span>
            </span>
            {(
              [
                'ALL',
                'KG_Maternelle',
                'Primaire',
                'Secondaire',
                'Boys_Section',
                'Girls_Section',
                'French_Section',
                'American_Section',
              ] as SchoolCategory[]
            ).map((cat) => {
              const count = classes.filter((c) =>
                classMatchesCategory(c, cat)
              ).length;
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => onSelectCategory(cat)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-sky-700 text-white shadow-xs'
                      : darkMode
                      ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <span>{CATEGORY_SHORT_LABELS[cat]}</span>
                  <span
                    className={`text-[10px] font-mono px-1 rounded ${
                      isSelected
                        ? 'bg-sky-900/60 text-sky-100'
                        : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right Actions */}
          <div className="flex flex-wrap items-center gap-2">
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
              className="px-2.5 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <GitMerge className="w-3.5 h-3.5" />
              <span>Rassembler 2 Classes / 2 Profs</span>
            </button>

            <button
              type="button"
              onClick={() => setShowIntercalatedPanel((v) => !v)}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded border flex items-center gap-1.5 cursor-pointer ${
                showIntercalatedPanel || highlightIntercalatedOnly
                  ? 'bg-amber-600 text-white border-amber-700'
                  : darkMode
                  ? 'bg-slate-800 border-slate-700 text-amber-400'
                  : 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Intercalées ({intercalatedSessions.length})</span>
            </button>

            {onExportExcelEnsemble && (
              <button
                type="button"
                onClick={onExportExcelEnsemble}
                className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
            )}

            <button
              type="button"
              onClick={onPrintEnsemble}
              className="px-2.5 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
          </div>
        </div>

        {/* Second Row: Find / Highlight Filter + Display Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/70 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5" />
              <input
                type="text"
                value={highlightFilter}
                onChange={(e) => setHighlightFilter(e.target.value)}
                placeholder="Chercher matière ou enseignant..."
                className={`pl-8 pr-6 py-1 text-xs border rounded w-56 ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-white'
                    : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
              {highlightFilter && (
                <button
                  onClick={() => setHighlightFilter('')}
                  className="absolute right-2 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <select
              value={highlightFilter}
              onChange={(e) => setHighlightFilter(e.target.value)}
              aria-label="Filtrer par matière"
              className={`px-2 py-1 text-xs border rounded ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="">-- Surligner une Matière --</option>
              {allDistinctSubjects.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none ml-1">
              <input
                type="checkbox"
                checked={showTeacherSubtext}
                onChange={(e) => setShowTeacherSubtext(e.target.checked)}
                className="accent-sky-700"
              />
              <span className="text-[11px] font-medium">
                Afficher Enseignant
              </span>
            </label>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
              <Lock className="w-3 h-3" />
              Cliquez sur 🔒 à gauche d'une classe pour garder ses positions
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
              Vert = Place logique sans conflit
            </span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          INTERCALATED SESSIONS PANEL (Collapsible)
         ===================================================================== */}
      {showIntercalatedPanel && (
        <div className="border-2 border-amber-300 bg-amber-50/90 text-slate-900 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-amber-950 flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-amber-700" />
              <span>
                Séances qui s'Intercalent, Groupes Dédoublés & Chevauchements ({intercalatedSessions.length})
              </span>
            </h3>
            <button
              onClick={() => setShowIntercalatedPanel(false)}
              className="text-amber-900 hover:text-slate-950"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
            {intercalatedSessions.map((item) => (
              <div
                key={item.id}
                className="p-2.5 bg-white border border-amber-200 rounded text-xs flex flex-col justify-between gap-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-900">
                    {item.kind === 'joint_classes'
                      ? '⊕ Classes Rassemblées'
                      : '⇄ Groupe Intercalé / 2 Profs'}
                  </span>
                  <span className="font-mono text-[11px] font-bold text-slate-600">
                    {item.day} P{item.period}
                  </span>
                </div>
                <p className="text-[11px] text-slate-700 leading-snug">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =====================================================================
          3. SPLIT WORKSPACE: VUE D'ENSEMBLE (LEFT) + BAC MATIÈRES À CÔTÉ (RIGHT)
         ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* LEFT COLUMN: MASTER ENSEMBLE TABLE */}
        <div
          className={`${
            showSideTray ? 'lg:col-span-9' : 'lg:col-span-12'
          } border-2 border-slate-700 rounded-md overflow-hidden bg-[#cbd5e1] shadow-sm`}
        >
          {/* Active Manual Placement Banner when a Side Card is selected */}
          {selectedSideCard && (
            <div className="bg-emerald-900 text-white px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs border-b border-emerald-700">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-extrabold uppercase text-[10px]">
                  Placement Manuel Actif
                </span>
                <span>
                  Cliquez sur une case <strong>verte (✓)</strong> de la ligne{' '}
                  <strong className="underline text-yellow-300">
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
                className="px-2 py-0.5 rounded bg-emerald-950 hover:bg-slate-900 text-emerald-200 text-[11px] font-semibold cursor-pointer"
              >
                Annuler sélection
              </button>
            </div>
          )}

          <div className="overflow-x-auto max-h-[640px]">
            <table className="w-full border-collapse table-fixed min-w-[1260px] select-none">
              <thead className="sticky top-0 z-20">
                <tr className="bg-[#cbd5e1] text-slate-950 h-6">
                  <th
                    rowSpan={2}
                    className="w-[134px] sticky left-0 z-30 bg-[#cbd5e1] border border-slate-600 px-2 text-left text-xs font-extrabold tracking-tight"
                  >
                    Classe ({filteredClasses.length})
                  </th>
                  {DAYS_OF_WEEK.map((day) => (
                    <th
                      key={day}
                      colSpan={8}
                      className="border border-slate-600 bg-[#cbd5e1] text-center text-[11px] font-bold text-slate-900"
                    >
                      {day}
                    </th>
                  ))}
                </tr>
                <tr className="bg-[#d8dee9] text-slate-900 h-5">
                  {DAYS_OF_WEEK.map((day) =>
                    [1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                      <th
                        key={`${day}_p_${p}`}
                        className={`border border-slate-500 text-center text-[10px] font-bold tabular-nums ${
                          p === 8 ? 'border-r-2 border-r-slate-800' : ''
                        }`}
                      >
                        {p}
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
                  const catShort =
                    CATEGORY_SHORT_LABELS[getPrimaryClassCategory(cls)];
                  const unplacedForThisClass = unplacedLessons.filter(
                    (u) => u.classId === cls.id
                  ).length;

                  return (
                    <tr
                      key={cls.id}
                      className={`h-[44px] transition-colors ${
                        isSideCardTargetRow
                          ? 'ring-2 ring-emerald-500 z-10 relative'
                          : isRowActive
                          ? 'ring-2 ring-sky-500 z-10 relative'
                          : ''
                      }`}
                    >
                      {/* Sticky Left Column: Class Name + Freeze Position Button (🔒) */}
                      <td
                        className={`sticky left-0 z-10 border border-slate-600 px-1.5 py-0.5 text-left align-middle ${
                          isSideCardTargetRow
                            ? 'bg-emerald-950 text-white'
                            : isRowActive
                            ? 'bg-sky-950 text-white'
                            : isClassFrozen
                            ? 'bg-amber-100 text-slate-950'
                            : 'bg-[#cbd5e1] text-slate-950'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-extrabold leading-tight truncate flex items-center gap-1">
                              <span>{cls.name}</span>
                              {unplacedForThisClass > 0 && (
                                <span
                                  title={`${unplacedForThisClass} matière(s) à côté pour ${cls.name}`}
                                  className="px-1 rounded bg-indigo-600 text-white text-[9px] font-mono"
                                >
                                  +{unplacedForThisClass}
                                </span>
                              )}
                            </div>
                            <div
                              className={`text-[9px] leading-none mt-0.5 truncate ${
                                isRowActive || isSideCardTargetRow
                                  ? 'text-sky-300'
                                  : isClassFrozen
                                  ? 'text-amber-800 font-semibold'
                                  : 'text-slate-600'
                              }`}
                            >
                              {isClassFrozen ? '🔒 Positions gardées' : catShort}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleFreezeClass(cls.id);
                            }}
                            title={
                              isClassFrozen
                                ? `Positions gardées pour ${cls.name} (cliquer pour débloquer)`
                                : `Garder les positions des matières pour ${cls.name} lors de la génération`
                            }
                            className={`p-1 rounded transition-colors shrink-0 cursor-pointer ${
                              isClassFrozen
                                ? 'bg-amber-600 text-white hover:bg-amber-700'
                                : 'text-slate-600 hover:bg-slate-300/80'
                            }`}
                          >
                            {isClassFrozen ? (
                              <Lock className="w-3 h-3" />
                            ) : (
                              <Unlock className="w-3 h-3 opacity-60" />
                            )}
                          </button>
                        </div>
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
                                bgHex: '#e2e8f0',
                                textHex: '#64748b',
                                borderHex: '#94a3b8',
                              };

                          // Overlay for either Row Switch OR Side Card Manual Placement
                          let switchOverlayClass = '';
                          if (isSideCardTargetRow && sideCompat) {
                            if (sideCompat.status === 'free_logical') {
                              switchOverlayClass =
                                'ring-2 ring-inset ring-emerald-600 bg-emerald-100! cursor-pointer hover:brightness-95';
                            } else if (sideCompat.status === 'swap_logical') {
                              switchOverlayClass =
                                'ring-2 ring-inset ring-amber-500 cursor-pointer hover:brightness-105';
                            } else {
                              switchOverlayClass =
                                'opacity-30 cursor-not-allowed';
                            }
                          } else if (isRowActive && !isSourceCell && compat) {
                            if (compat.status === 'optimal') {
                              switchOverlayClass =
                                'ring-2 ring-inset ring-emerald-500 cursor-pointer hover:brightness-105';
                            } else if (compat.status === 'possible_warn') {
                              switchOverlayClass =
                                'ring-2 ring-inset ring-amber-500 cursor-pointer';
                            } else {
                              switchOverlayClass =
                                'opacity-35 cursor-not-allowed';
                            }
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
                                  : '#e2e8f0',
                                color: visual.textHex,
                              }}
                              title={
                                isSideCardTargetRow && sideCompat
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
                                    )})\nMatière : ${slot.subject} (${
                                      slot.teacher
                                    })\n(Clic = Sélectionner/Permuter · Glisser vers "Matières à côté" pour retirer · Double-clic = Éditer)`
                                  : `${cls.name} · ${day} P${period} — Libre`
                              }
                              className={`border border-slate-600 px-0.5 py-0.5 text-center align-middle relative transition-all cursor-pointer ${
                                period === 8
                                  ? 'border-r-2 border-r-slate-900'
                                  : ''
                              } ${
                                isSourceCell
                                  ? 'ring-3 ring-inset ring-slate-950 scale-[1.03] z-20 shadow-md'
                                  : switchOverlayClass
                              } ${isDimmed ? 'opacity-20' : ''}`}
                            >
                              {isLocked && (
                                <Lock className="w-2.5 h-2.5 absolute top-0.5 right-0.5 opacity-75" />
                              )}

                              {!isLocked && isAnyIntercalated && (
                                <span
                                  className={`absolute top-0 right-0 px-0.5 text-[8px] font-extrabold leading-none rounded-bl ${
                                    hasJointClass
                                      ? 'bg-indigo-900 text-white'
                                      : intercalInfo?.kind ===
                                        'cross_section_bell_overlap'
                                      ? 'bg-red-700 text-white'
                                      : 'bg-slate-900/80 text-amber-300'
                                  }`}
                                >
                                  {hasJointClass ? '⊕' : '⇄'}
                                </span>
                              )}

                              {/* Badge when placing a Side Card */}
                              {isSideCardTargetRow && sideCompat && (
                                <span
                                  className={`absolute bottom-0 right-0 px-0.5 text-[8px] font-mono font-extrabold leading-none ${
                                    sideCompat.status === 'free_logical'
                                      ? 'bg-emerald-700 text-white'
                                      : sideCompat.status === 'swap_logical'
                                      ? 'bg-amber-600 text-white'
                                      : 'bg-red-700 text-white'
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
                                    className={`absolute bottom-0 right-0 px-0.5 text-[8px] font-mono font-extrabold leading-none ${
                                      compat.status === 'optimal'
                                        ? 'bg-emerald-700 text-white'
                                        : compat.status === 'possible_warn'
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-red-700 text-white'
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
                                <div className="flex flex-col justify-center items-center h-full overflow-hidden leading-none">
                                  <div className="text-[10px] font-extrabold tracking-tight truncate w-full">
                                    {slot.subject}
                                  </div>
                                  {slot.subSubject && (
                                    <div className="text-[8.5px] font-bold truncate w-full border-t border-current/25 mt-0.5 pt-0.5">
                                      {slot.subSubject}
                                    </div>
                                  )}
                                  {showTeacherSubtext && !slot.subSubject && (
                                    <div className="text-[8.5px] font-medium opacity-85 truncate w-full mt-0.5">
                                      {slot.teacher}
                                      {slot.assistantTeacher
                                        ? ` +Ass.${slot.assistantTeacher}`
                                        : ''}
                                    </div>
                                  )}
                                </div>
                              ) : isSideCardTargetRow &&
                                sideCompat?.status === 'free_logical' ? (
                                <div className="text-[9px] font-extrabold text-emerald-800">
                                  + Placer
                                </div>
                              ) : (
                                <div className="text-[9px] text-slate-400">
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
        {showSideTray && (
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
            className={`lg:col-span-3 border-2 rounded-xl p-3 space-y-3 flex flex-col max-h-[680px] ${
              darkMode
                ? 'bg-slate-900 border-indigo-800 text-slate-100'
                : 'bg-white border-indigo-200 text-slate-900 shadow-xs'
            }`}
          >
            {/* Header of Side Tray */}
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Inbox className="w-3.5 h-3.5" />
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
                  className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
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
                  className={`px-2 py-1 text-xs border rounded ${
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
                    className={`w-12 px-1.5 py-1 text-xs border rounded text-center font-mono ${
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
                  className={`px-2 py-1 text-xs border rounded ${
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
                  className={`px-2 py-1 text-xs border rounded ${
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
                className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter à côté pour placer manuellement</span>
              </button>
            </div>

            {/* Filter by class inside Side Tray */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <select
                value={sideTrayFilterClassId}
                onChange={(e) => setSideTrayFilterClassId(e.target.value)}
                aria-label="Filtrer la réserve par classe"
                className={`flex-1 px-2 py-1 text-xs border rounded ${
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
                    Cliquez sur une séance de la grille puis sur{" "}
                    <strong>« Mettre à côté »</strong>, ou ajoutez une matière ci-dessus. Lors d'une génération, les séances sans place logique restent ici.
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
                      className={`p-2 rounded-lg border-2 transition-all cursor-pointer select-none ${
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
                            className="px-2 py-0.5 rounded text-[11px] font-extrabold truncate border border-black/15"
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
                          className="text-slate-400 hover:text-rose-600 p-0.5"
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

      {/* =====================================================================
          4. BOTTOM DOCK (Selected Slot Actions + "Mettre à côté" Button + Smart Switch)
         ===================================================================== */}
      <div className="bg-[#5c6470] text-white rounded-md p-3 shadow-md flex flex-wrap items-center justify-between gap-4">
        {selectedSource && activeSourceClass ? (
          <>
            {/* Left: Selected Subject Card */}
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
                className="w-16 h-14 rounded border-2 border-white flex flex-col items-center justify-center p-1 text-center shrink-0 shadow-sm"
              >
                <span className="text-[11px] font-extrabold leading-tight truncate w-full">
                  {activeSourceSlot?.subject || 'Libre'}
                </span>
                <span className="text-[9px] font-bold opacity-85 truncate w-full mt-0.5">
                  {activeSourceClass.name}
                </span>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-extrabold text-yellow-300 tracking-tight">
                    {activeSourceSlot?.subject || 'Créneau Libre'}
                  </span>
                  <span className="text-xs font-mono bg-slate-800/80 px-2 py-0.5 rounded text-sky-300">
                    {activeSourceClass.name} ·{' '}
                    {selectedSource.slotKey.replace('_', ' P')} (
                    {getPeriodClockTime(
                      activeSourceClass.section,
                      Number(selectedSource.slotKey.split('_')[1])
                    )}
                    )
                  </span>
                </div>
                <div className="text-xs text-slate-200 mt-0.5 flex flex-wrap items-center gap-2">
                  <span>
                    Enseignant :{' '}
                    <strong>{activeSourceSlot?.teacher || 'Aucun'}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Center: Hovered Candidate Diagnostics OR Top Recommended Switches */}
            <div className="flex-1 min-w-[260px]">
              {hoveredCandidate &&
              hoveredCandidate.targetKey !== selectedSource.slotKey ? (
                <div
                  className={`p-2 rounded border text-xs ${
                    hoveredCandidate.status === 'optimal'
                      ? 'bg-emerald-950/90 border-emerald-400 text-emerald-100'
                      : hoveredCandidate.status === 'possible_warn'
                      ? 'bg-amber-950/90 border-amber-400 text-amber-100'
                      : 'bg-red-950/90 border-red-400 text-red-100'
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>
                      Cible : {hoveredCandidate.day} P{hoveredCandidate.period}{' '}
                      ({hoveredCandidate.targetSlot?.subject || 'Libre'} —{' '}
                      {hoveredCandidate.targetSlot?.teacher || 'Aucun'})
                    </span>
                    <span className="font-mono">
                      {hoveredCandidate.status === 'blocked'
                        ? 'BLOQUÉ'
                        : `Score ${
                            hoveredCandidate.scoreDelta >= 0 ? '+' : ''
                          }${hoveredCandidate.scoreDelta}`}
                    </span>
                  </div>
                  <div className="text-[11px] mt-0.5">
                    {hoveredCandidate.reason}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-yellow-200 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      Cliquez sur une case verte de la ligne{' '}
                      {activeSourceClass.name} pour permuter, ou mettez cette matière à côté :
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
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                      >
                        <ArrowLeftRight className="w-3 h-3" />
                        <span>
                          {rec.day} P{rec.period} (
                          {rec.targetSlot?.subject || 'Libre'})
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
                  className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                  title="Retirer cette séance de la grille et la garder à côté de la Vue d'Ensemble pour la placer manuellement"
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
                className="px-3 py-1.5 bg-white text-slate-900 hover:bg-slate-100 rounded text-xs font-bold cursor-pointer"
              >
                Éditer
              </button>
              <button
                onClick={() => setSelectedSource(null)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium cursor-pointer"
              >
                Annuler
              </button>
            </div>
          </>
        ) : (
          <div className="w-full flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-extrabold text-yellow-300 text-sm">
                Vue d'Ensemble Interactive
              </span>
              <span className="text-slate-200">
                Cliquez sur une séance pour permuter ou la{' '}
                <strong>Mettre à côté</strong> · Cliquez sur une carte dans{' '}
                <strong>Matières à Côté</strong> à droite pour la placer manuellement · Cliquez sur{' '}
                <strong>🔒</strong> à gauche d'une classe pour garder ses positions.
              </span>
            </div>
            <div className="font-mono text-[11px] bg-slate-700/80 px-2.5 py-1 rounded text-slate-200">
              {filteredClasses.length} classes · {frozenClassIds.length} figée(s) ·{' '}
              {unplacedLessons.length} matière(s) à côté
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
