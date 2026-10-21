import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Coffee,
  FileSpreadsheet,
  Layers,
  LayoutGrid,
  Lock,
  Play,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Unlock,
  UserCheck,
  UserPlus,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import {
  BellRow,
  BellScheduleGroup,
  DayOfWeek,
  SchoolCategory,
  SchoolClass,
  TeacherProfile,
} from '../types/timetable';
import { ConstraintRule, SubjectConfig } from '../engine/cspEngine';
import {
  CATEGORY_SHORT_LABELS,
  recalculateBellScheduleRows,
} from '../utils/timetableAnalytics';

export type AscModalType =
  | null
  | 'co_teaching_assistant'
  | 'constraints_timeoff'
  | 'horaires_bells'
  | 'breaks_recreations'
  | 'asc_lesson_creator'
  | 'all_settings';

interface AscTimetablesRibbonAndDialogsProps {
  classes: SchoolClass[];
  teachers: TeacherProfile[];
  subjectConfigs: SubjectConfig[];
  constraints: ConstraintRule[];
  bellScheduleGroups: BellScheduleGroup[];
  selectedCategory: SchoolCategory;
  schoolYear: string;
  scenario: 'standard' | 'ramadan' | 'summer' | 'exams';
  activeModal: AscModalType;
  onOpenModal: (modal: AscModalType) => void;
  onAssignAssistantToClassOrSubject: (params: {
    mode: 'whole_class' | 'subject_in_class' | 'single_slot';
    classId: string;
    subjectName?: string;
    mainTeacherName?: string;
    assistantTeacherName: string;
    day?: DayOfWeek;
    period?: number;
  }) => void;
  onRemoveAssistantFromClassOrSubject: (
    classId: string,
    subjectName?: string
  ) => void;
  onUpdateTeacherTimeOff: (
    teacherId: string,
    unavailableSlots: string[],
    questionableSlots: string[]
  ) => void;
  onUpdateClassTimeOff: (classId: string, unavailableSlots: string[]) => void;
  onUpdateConstraints: (next: ConstraintRule[]) => void;
  onUpdateBellScheduleGroups: (groups: BellScheduleGroup[]) => void;
  onCreateAscLessonContract: (params: {
    mainTeacher: string;
    assistantTeacher?: string;
    subject: string;
    classIds: string[];
    groupLabel: string;
    periodsPattern: string; // e.g. "1+1+1+1", "2+1+1", "2+2", "1+1"
    room?: string;
  }) => void;
  onChangeSchoolYear: (year: string) => void;
  onChangeScenario: (sc: 'standard' | 'ramadan' | 'summer' | 'exams') => void;
  onLockOrUnlockAllClasses: (lockAll: boolean) => void;
  onRunAutoCompleteAndOptimize: () => void;
  onSwitchToTab: (
    tab: 'editor' | 'teachers' | 'ai_csp' | 'resources' | 'reports_export',
    subMode?: 'ensemble' | 'single' | 'loads'
  ) => void;
  onPrintReport: (
    mode: 'teachers_load' | 'classes_load' | 'subjects_load' | 'ensemble'
  ) => void;
  canUndo?: boolean;
  onUndo?: () => void;
  undoCount?: number;
  onExportExcel?: (mode: 'teachers_load' | 'classes_load' | 'ensemble') => void;
  darkMode?: boolean;
}

const DAYS: DayOfWeek[] = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi'];

export const AscTimetablesRibbonAndDialogs: React.FC<
  AscTimetablesRibbonAndDialogsProps
> = ({
  classes,
  teachers,
  subjectConfigs,
  constraints,
  bellScheduleGroups,
  selectedCategory,
  schoolYear,
  scenario,
  activeModal,
  onOpenModal,
  onAssignAssistantToClassOrSubject,
  onRemoveAssistantFromClassOrSubject,
  onUpdateTeacherTimeOff,
  onUpdateClassTimeOff,
  onUpdateConstraints,
  onUpdateBellScheduleGroups,
  onCreateAscLessonContract,
  onChangeSchoolYear,
  onChangeScenario,
  onLockOrUnlockAllClasses,
  onRunAutoCompleteAndOptimize,
  onSwitchToTab,
  onPrintReport,
  canUndo = false,
  onUndo,
  undoCount = 0,
  onExportExcel,
  darkMode = false,
}) => {
  // 1. State for Co-Teaching (Enseignant + Assistant) modal
  const [assistMode, setAssistMode] = useState<
    'subject_in_class' | 'whole_class' | 'single_slot'
  >('subject_in_class');
  const [assistClassId, setAssistClassId] = useState(classes[0]?.id || 'ps');
  const [assistSubject, setAssistSubject] = useState('Français');
  const [assistMainTeacher, setAssistMainTeacher] = useState(
    teachers[0]?.name || 'Hajar'
  );
  const [assistName, setAssistName] = useState(
    teachers[1]?.name || 'Steffi'
  );
  const [assistCustomName, setAssistCustomName] = useState('');
  const [assistDay, setAssistDay] = useState<DayOfWeek>('Dimanche');
  const [assistPeriod, setAssistPeriod] = useState(1);

  // 2. State for Constraints & Time-Off (Vert / Jaune ? / Rouge X) modal
  const [timeOffEntityType, setTimeOffEntityType] = useState<
    'teacher' | 'class'
  >('teacher');
  const [timeOffTeacherId, setTimeOffTeacherId] = useState(
    teachers[0]?.id || ''
  );
  const [timeOffClassId, setTimeOffClassId] = useState(classes[0]?.id || 'ps');

  // 3. State for Horaires & Breaks modals
  const [selectedBellGroupId, setSelectedBellGroupId] = useState(
    bellScheduleGroups[0]?.id || 'grp_kg_maternelle'
  );
  const [startH, setStartH] = useState(7);
  const [startM, setStartM] = useState(50);
  const [pDur, setPDur] = useState(45);
  const [maxP, setMaxP] = useState(8);
  const [b1After, setB1After] = useState(3);
  const [b1Dur, setB1Dur] = useState(20);
  const [b2After, setB2After] = useState(6);
  const [b2Dur, setB2Dur] = useState(15);

  // New Break Creator state
  const [newBreakLabel, setNewBreakLabel] = useState(
    'Pause Récréation / Collation'
  );
  const [newBreakTime, setNewBreakTime] = useState('10h15 - 10h35');
  const [newBreakAfterPeriod, setNewBreakAfterPeriod] = useState(3);
  const [newBreakSupervisor, setNewBreakSupervisor] = useState('');

  // 4. State for aSc Lesson Contract Creator
  const [lesMainTeacher, setLesMainTeacher] = useState(
    teachers[0]?.name || 'Hajar'
  );
  const [lesAssistantTeacher, setLesAssistantTeacher] = useState('');
  const [lesSubject, setLesSubject] = useState('Français');
  const [lesClassIds, setLesClassIds] = useState<string[]>([
    classes[0]?.id || 'ps',
  ]);
  const [lesGroup, setLesGroup] = useState('Classe complète');
  const [lesPattern, setLesPattern] = useState('1+1+1+1');
  const [lesRoom, setLesRoom] = useState('');

  const allTeacherNames = useMemo(() => {
    const s = new Set<string>();
    teachers.forEach((t) => s.add(t.name));
    classes.forEach((c) =>
      Object.values(c.slots).forEach((sl) => {
        if (sl?.teacher) s.add(sl.teacher);
        if (sl?.assistantTeacher) s.add(sl.assistantTeacher);
      })
    );
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [teachers, classes]);

  const allSubjectNames = useMemo(() => {
    const s = new Set<string>();
    subjectConfigs.forEach((cfg) => s.add(cfg.name));
    classes.forEach((c) =>
      Object.values(c.slots).forEach((sl) => {
        if (sl?.subject) s.add(sl.subject);
      })
    );
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [subjectConfigs, classes]);

  // Active Co-Teaching (Enseignant + Assistant) assignments across the school
  const activeAssistantAssignments = useMemo(() => {
    const map = new Map<
      string,
      {
        classId: string;
        className: string;
        subject: string;
        mainTeacher: string;
        assistantTeacher: string;
        periodsCount: number;
      }
    >();

    for (const cls of classes) {
      for (const slot of Object.values(cls.slots)) {
        const effAssistant = slot.assistantTeacher || cls.defaultAssistant;
        if (!effAssistant) continue;
        const key = `${cls.id}__${slot.subject}__${slot.teacher}__${effAssistant}`;
        if (!map.has(key)) {
          map.set(key, {
            classId: cls.id,
            className: cls.name,
            subject: slot.subject,
            mainTeacher: slot.teacher,
            assistantTeacher: effAssistant,
            periodsCount: 0,
          });
        }
        map.get(key)!.periodsCount += 1;
      }
    }
    return Array.from(map.values());
  }, [classes]);

  const activeBellGroup = useMemo(() => {
    return (
      bellScheduleGroups.find((g) => g.id === selectedBellGroupId) ||
      bellScheduleGroups[0]
    );
  }, [bellScheduleGroups, selectedBellGroupId]);

  const selectedTimeOffTeacher = useMemo(
    () => teachers.find((t) => t.id === timeOffTeacherId) || teachers[0],
    [teachers, timeOffTeacherId]
  );

  const selectedTimeOffClass = useMemo(
    () => classes.find((c) => c.id === timeOffClassId) || classes[0],
    [classes, timeOffClassId]
  );

  // Cycle aSc 3-state Time-Off cell: Allowed (Green) -> Questionable ? (Yellow) -> Forbidden X (Red) -> Allowed
  const handleToggleTimeOffCell = (slotKey: string) => {
    if (timeOffEntityType === 'teacher' && selectedTimeOffTeacher) {
      const unavail = new Set(selectedTimeOffTeacher.unavailableSlots || []);
      const quest = new Set(selectedTimeOffTeacher.questionableSlots || []);

      if (!unavail.has(slotKey) && !quest.has(slotKey)) {
        // Green -> Yellow (?)
        quest.add(slotKey);
      } else if (quest.has(slotKey)) {
        // Yellow (?) -> Red (X)
        quest.delete(slotKey);
        unavail.add(slotKey);
      } else {
        // Red (X) -> Green (✓)
        unavail.delete(slotKey);
      }
      onUpdateTeacherTimeOff(
        selectedTimeOffTeacher.id,
        Array.from(unavail),
        Array.from(quest)
      );
    } else if (timeOffEntityType === 'class' && selectedTimeOffClass) {
      const unavail = new Set(selectedTimeOffClass.unavailableSlots || []);
      if (unavail.has(slotKey)) {
        unavail.delete(slotKey);
      } else {
        unavail.add(slotKey);
      }
      onUpdateClassTimeOff(selectedTimeOffClass.id, Array.from(unavail));
    }
  };

  return (
    <>
      {/* =====================================================================
          RIBBON BAR STYLE aSc TIMETABLES (ACCÈS DIRECT À TOUS LES RÉGLAGES)
         ===================================================================== */}
      <div
        className={`border-b px-4 py-2 no-print shadow-2xs ${
          darkMode
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-slate-100/90 border-slate-300 text-slate-900'
        }`}
      >
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2">
          {/* Left group: Précédent (Undo), Core aSc Data & Co-Teaching Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {onUndo && (
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:hover:bg-rose-600 text-white shadow-xs transition-all cursor-pointer"
                title="Précédent : Retourner en arrière / Annuler la dernière action (Ctrl+Z)"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-100" />
                <span>↩ Précédent {undoCount > 0 ? `(${undoCount})` : ''}</span>
              </button>
            )}

            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded bg-slate-800 text-amber-300 mr-1">
              Barre aSc TimeTables
            </span>

            <button
              type="button"
              onClick={() => onOpenModal('co_teaching_assistant')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold bg-teal-600 hover:bg-teal-700 text-white shadow-2xs transition-all cursor-pointer"
              title="Mettre 2 enseignants en même temps : un Enseignant Principal + un Assistant(e) avec lui"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Enseignant + Assistant(e) ({activeAssistantAssignments.length})</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenModal('asc_lesson_creator')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-sky-50 text-slate-800 border border-slate-300 shadow-2xs transition-all cursor-pointer"
              title="Créer un contrat de cours aSc (Simple, Double 2p, Multi-classes ou avec Assistant)"
            >
              <BookOpen className="w-3.5 h-3.5 text-sky-600" />
              <span>+ Contrat Leçon aSc</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenModal('constraints_timeoff')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-rose-50 text-slate-800 border border-slate-300 shadow-2xs transition-all cursor-pointer"
              title="Contraintes strictes/souples et Grille Temps Libre (Vert / Jaune ? / Rouge X)"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-rose-600" />
              <span>Contraintes & Temps Libre</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenModal('horaires_bells')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-amber-50 text-slate-800 border border-slate-300 shadow-2xs transition-all cursor-pointer"
              title="Gérer les horaires et durées des périodes par groupe de classes ou section"
            >
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Horaires / Sonneries</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenModal('breaks_recreations')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-orange-50 text-slate-800 border border-slate-300 shadow-2xs transition-all cursor-pointer"
              title="Configurer les Pauses (Breaks), Récréations, Prière et Surveillance"
            >
              <Coffee className="w-3.5 h-3.5 text-orange-600" />
              <span>Breaks / Pauses</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenModal('all_settings')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-violet-50 text-slate-800 border border-slate-300 shadow-2xs transition-all cursor-pointer"
              title="Tous les réglages généraux de l'école, verrouillage global et paramètres aSc"
            >
              <Settings className="w-3.5 h-3.5 text-violet-600" />
              <span>Tous les Réglages</span>
            </button>
          </div>

          {/* Right group: Direct Shortcuts to Load Teachers, Load Classes, Vue Ensemble & Auto-Generate */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSwitchToTab('editor', 'ensemble')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white cursor-pointer"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-sky-400" />
              <span>Vue Ensemble</span>
            </button>

            <button
              type="button"
              onClick={() => onSwitchToTab('editor', 'loads')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-700 hover:bg-indigo-800 text-white cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-200" />
              <span>Load Teachers & Classes</span>
            </button>

            {onExportExcel && (
              <button
                type="button"
                onClick={() => onExportExcel('teachers_load')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs cursor-pointer"
                title="Exporter les tableaux vers Excel avec le même design, couleurs et polices"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel (Design)</span>
              </button>
            )}

            <button
              type="button"
              onClick={onRunAutoCompleteAndOptimize}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs cursor-pointer"
              title="Générer et compléter automatiquement tous les emplois du temps"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Générer Auto (aSc)</span>
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
          MODAL 1: ENSEIGNANT + ASSISTANT(E) EN MÊME TEMPS (CO-TEACHING)
         ===================================================================== */}
      {activeModal === 'co_teaching_assistant' && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 bg-teal-900 text-white flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-teal-300" />
                  Mettre Deux Enseignants en Même Temps : Enseignant Principal + Assistant(e)
                </h2>
                <p className="text-xs text-teal-100 mt-0.5">
                  Associez un(e) Assistant(e) pédagogique (AT / Co-enseignant) à un enseignant sur une matière, sur toute une classe ou sur un créneau précis.
                </p>
              </div>
              <button
                onClick={() => onOpenModal(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {/* 3 Mode Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setAssistMode('subject_in_class')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    assistMode === 'subject_in_class'
                      ? 'bg-teal-50 border-teal-600 ring-2 ring-teal-500/20'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-xs font-extrabold text-slate-900">
                    1. Par Matière dans une Classe
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Ex: Toutes les séances de Français ou Montessori en PS auront l'enseignant + son assistant(e).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setAssistMode('whole_class')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    assistMode === 'whole_class'
                      ? 'bg-teal-50 border-teal-600 ring-2 ring-teal-500/20'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-xs font-extrabold text-slate-900">
                    2. Assistant(e) Attitré(e) Toute la Classe
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Ex: Affecter une assistante maternelle (ATSEM / AT) sur l'ensemble des cours d'une classe (Pre-KG, KG1, PS...).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setAssistMode('single_slot')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    assistMode === 'single_slot'
                      ? 'bg-teal-50 border-teal-600 ring-2 ring-teal-500/20'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-xs font-extrabold text-slate-900">
                    3. Sur un Créneau Horaire Précis
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Ex: Dimanche P2 en PEI1 — Enseignant principal + Assistant(e) de laboratoire ou soutien.
                  </p>
                </button>
              </div>

              {/* Assignment Form */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Classe concernée *
                    </label>
                    <select
                      value={assistClassId}
                      onChange={(e) => {
                        const cid = e.target.value;
                        setAssistClassId(cid);
                        const foundCls = classes.find((c) => c.id === cid);
                        if (foundCls) {
                          const firstSlot = Object.values(foundCls.slots)[0];
                          if (firstSlot) {
                            setAssistSubject(firstSlot.subject);
                            setAssistMainTeacher(firstSlot.teacher);
                          }
                        }
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold"
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.section})
                        </option>
                      ))}
                    </select>
                  </div>

                  {assistMode !== 'whole_class' && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Matière *
                      </label>
                      <select
                        value={assistSubject}
                        onChange={(e) => setAssistSubject(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold"
                      >
                        {allSubjectNames.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {assistMode !== 'whole_class' && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Enseignant Principal
                      </label>
                      <select
                        value={assistMainTeacher}
                        onChange={(e) => setAssistMainTeacher(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold"
                      >
                        {allTeacherNames.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block font-bold text-teal-800 mb-1">
                      Assistant(e) avec lui (2e Enseignant) *
                    </label>
                    <select
                      value={assistName}
                      onChange={(e) => setAssistName(e.target.value)}
                      className="w-full px-3 py-2 bg-teal-50 border border-teal-400 rounded-lg font-extrabold text-teal-950"
                    >
                      {allTeacherNames.map((t) => (
                        <option key={t} value={t}>
                          Ass. {t}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={assistCustomName}
                      onChange={(e) => setAssistCustomName(e.target.value)}
                      placeholder="Ou saisir nouveau nom d'assistant(e)..."
                      className="mt-1.5 w-full px-2.5 py-1 bg-white border border-slate-300 rounded text-[11px]"
                    />
                  </div>
                </div>

                {assistMode === 'single_slot' && (
                  <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Jour
                      </label>
                      <select
                        value={assistDay}
                        onChange={(e) =>
                          setAssistDay(e.target.value as DayOfWeek)
                        }
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-bold"
                      >
                        {DAYS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Période
                      </label>
                      <select
                        value={assistPeriod}
                        onChange={(e) =>
                          setAssistPeriod(Number(e.target.value))
                        }
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                          <option key={p} value={p}>
                            Période P{p}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const chosenAssistant =
                        assistCustomName.trim() || assistName.trim();
                      if (!chosenAssistant) return;
                      onAssignAssistantToClassOrSubject({
                        mode: assistMode,
                        classId: assistClassId,
                        subjectName: assistSubject,
                        mainTeacherName: assistMainTeacher,
                        assistantTeacherName: chosenAssistant,
                        day: assistDay,
                        period: assistPeriod,
                      });
                      setAssistCustomName('');
                    }}
                    className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs shadow-xs cursor-pointer flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Affecter l'Enseignant + Assistant(e) en même temps
                  </button>
                </div>
              </div>

              {/* Active Assistant Assignments Table */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  Binômes Enseignant + Assistant(e) Actifs ({activeAssistantAssignments.length})
                </h3>
                {activeAssistantAssignments.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
                    Aucun binôme Enseignant + Assistant(e) encore configuré. Utilisez le formulaire ci-dessus ou les colonnes du tableau Load Classes pour en ajouter.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-60">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-600">
                          <th className="py-2 px-3">Classe</th>
                          <th className="py-2 px-3">Matière</th>
                          <th className="py-2 px-3">Enseignant Principal</th>
                          <th className="py-2 px-3">Assistant(e) Associé(e)</th>
                          <th className="py-2 px-3 text-center">Séances</th>
                          <th className="py-2 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {activeAssistantAssignments.map((a, i) => (
                          <tr key={i} className="hover:bg-teal-50/30">
                            <td className="py-2 px-3 font-extrabold">
                              {a.className}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-800">
                              {a.subject}
                            </td>
                            <td className="py-2 px-3 font-semibold">
                              {a.mainTeacher}
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-900 font-extrabold text-[11px]">
                                + Ass. {a.assistantTeacher}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center font-mono font-bold">
                              {a.periodsCount}p
                            </td>
                            <td className="py-2 px-3 text-right">
                              <button
                                onClick={() =>
                                  onRemoveAssistantFromClassOrSubject(
                                    a.classId,
                                    a.subject
                                  )
                                }
                                className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                title="Retirer l'assistant(e) de cette matière"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: CONTRAINTES & GRILLE TEMPS LIBRE (STYLE aSc VERT / JAUNE ? / ROUGE X)
         ===================================================================== */}
      {activeModal === 'constraints_timeoff' && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 bg-rose-900 text-white flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-rose-300" />
                  Contraintes aSc TimeTables, Temps Libre (Time-Off) & Relations de Cartes
                </h2>
                <p className="text-xs text-rose-100 mt-0.5">
                  Cliquez sur les cases de la grille pour basculer entre Autorisé (Vert ✓), À éviter / Questionnable (Jaune ?) et Interdit (Rouge ✕).
                </p>
              </div>
              <button
                onClick={() => onOpenModal(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1">
              {/* Left 7 cols: Interactive aSc Time-Off Grid */}
              <div className="lg:col-span-7 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 p-2.5 rounded-xl">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTimeOffEntityType('teacher')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                        timeOffEntityType === 'teacher'
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-700'
                      }`}
                    >
                      Temps Libre Enseignant
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeOffEntityType('class')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                        timeOffEntityType === 'class'
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-700'
                      }`}
                    >
                      Temps Libre Classe
                    </button>
                  </div>

                  {timeOffEntityType === 'teacher' ? (
                    <select
                      value={timeOffTeacherId}
                      onChange={(e) => setTimeOffTeacherId(e.target.value)}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-extrabold"
                    >
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          Prof. {t.name} ({t.section})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={timeOffClassId}
                      onChange={(e) => setTimeOffClassId(e.target.value)}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-extrabold"
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          Classe {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 text-xs font-bold px-1">
                  <span className="inline-flex items-center gap-1.5 text-emerald-800">
                    <span className="w-4 h-4 rounded bg-emerald-500 text-white flex items-center justify-center text-[10px]">
                      ✓
                    </span>
                    Autorisé (Vert)
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-amber-800">
                    <span className="w-4 h-4 rounded bg-amber-400 text-slate-950 flex items-center justify-center text-[10px]">
                      ?
                    </span>
                    Conditionnel / Éviter (Jaune)
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-rose-800">
                    <span className="w-4 h-4 rounded bg-rose-600 text-white flex items-center justify-center text-[10px]">
                      ✕
                    </span>
                    Indisponible / Fermé (Rouge)
                  </span>
                </div>

                {/* 5 Days x 8 Periods aSc Time-off Matrix */}
                <div className="overflow-x-auto border border-slate-300 rounded-xl">
                  <table className="w-full border-collapse text-center text-xs">
                    <thead>
                      <tr className="bg-slate-200 border-b border-slate-300 font-extrabold text-slate-800">
                        <th className="py-2 px-2 border-r border-slate-300 text-left">
                          Jour
                        </th>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                          <th
                            key={p}
                            className="py-2 px-2 border-r border-slate-300"
                          >
                            P{p}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {DAYS.map((day) => (
                        <tr key={day}>
                          <td className="py-2.5 px-2.5 font-extrabold bg-slate-50 border-r border-slate-300 text-left">
                            {day}
                          </td>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => {
                            const key = `${day}_${p}`;
                            const isUnavail =
                              timeOffEntityType === 'teacher'
                                ? selectedTimeOffTeacher?.unavailableSlots?.includes(
                                    key
                                  )
                                : selectedTimeOffClass?.unavailableSlots?.includes(
                                    key
                                  );
                            const isQuest =
                              timeOffEntityType === 'teacher' &&
                              selectedTimeOffTeacher?.questionableSlots?.includes(
                                key
                              );

                            return (
                              <td
                                key={key}
                                onClick={() => handleToggleTimeOffCell(key)}
                                className={`py-2.5 px-2 border-r border-slate-300 font-mono font-black text-sm cursor-pointer select-none transition-colors ${
                                  isUnavail
                                    ? 'bg-rose-600 text-white hover:bg-rose-700'
                                    : isQuest
                                    ? 'bg-amber-400 text-slate-950 hover:bg-amber-500'
                                    : 'bg-emerald-500/90 text-white hover:bg-emerald-600'
                                }`}
                              >
                                {isUnavail ? '✕' : isQuest ? '?' : '✓'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right 5 cols: Strict & Soft Constraint Rules */}
              <div className="lg:col-span-5 space-y-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  Règles du Moteur CP-SAT & Relations de Cartes
                </h3>
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {constraints.map((rule) => (
                    <div
                      key={rule.id}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-slate-200 font-mono text-[10px] font-bold">
                            {rule.code}
                          </span>
                          <span className="text-xs font-extrabold text-slate-900">
                            {rule.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {rule.description}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() =>
                          onUpdateConstraints(
                            constraints.map((r) =>
                              r.id === rule.id
                                ? { ...r, enabled: !r.enabled }
                                : r
                            )
                          )
                        }
                        className="mt-1 h-4 w-4 accent-rose-600 cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: HORAIRES & SONNERIES PAR GROUPE DE CLASSES / SECTION
         ===================================================================== */}
      {activeModal === 'horaires_bells' && activeBellGroup && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 bg-amber-900 text-white flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-300" />
                  Réglages des Horaires & Sonneries par Groupe de Classes / Section
                </h2>
                <p className="text-xs text-amber-100 mt-0.5">
                  Configurez les horaires de chaque groupe de classes (Maternelle, KG3/GS, French Section, Primary, Girls, Boys).
                </p>
              </div>
              <button
                onClick={() => onOpenModal(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1">
              <div className="lg:col-span-4 space-y-2">
                <div className="text-xs font-extrabold uppercase text-slate-500 mb-1">
                  Sélectionner le Groupe de Classes :
                </div>
                {bellScheduleGroups.map((grp) => (
                  <button
                    key={grp.id}
                    type="button"
                    onClick={() => setSelectedBellGroupId(grp.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      grp.id === activeBellGroup.id
                        ? 'bg-amber-50 border-amber-500 shadow-xs'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-xs font-extrabold text-slate-900">
                      {grp.name}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      {grp.classNames.join(', ')}
                    </div>
                  </button>
                ))}
              </div>

              <div className="lg:col-span-8 space-y-4">
                {/* Auto-recalculator */}
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
                  <div className="text-xs font-extrabold text-amber-950">
                    Générateur Automatique d'Horaires pour « {activeBellGroup.name} »
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600">
                        Début P1 (Heure : Min)
                      </label>
                      <div className="flex items-center gap-1 mt-0.5">
                        <input
                          type="number"
                          value={startH}
                          onChange={(e) =>
                            setStartH(Number(e.target.value) || 7)
                          }
                          className="w-12 px-1.5 py-1 bg-white border border-amber-300 rounded font-mono font-bold text-center"
                        />
                        <span>h</span>
                        <input
                          type="number"
                          value={startM}
                          onChange={(e) =>
                            setStartM(Number(e.target.value) || 0)
                          }
                          className="w-12 px-1.5 py-1 bg-white border border-amber-300 rounded font-mono font-bold text-center"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600">
                        Durée Période (min)
                      </label>
                      <select
                        value={pDur}
                        onChange={(e) => setPDur(Number(e.target.value))}
                        className="mt-0.5 w-full px-2 py-1 bg-white border border-amber-300 rounded font-bold"
                      >
                        {[30, 35, 40, 45, 50, 55, 60].map((m) => (
                          <option key={m} value={m}>
                            {m} min
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600">
                        Périodes / Jour
                      </label>
                      <select
                        value={maxP}
                        onChange={(e) => setMaxP(Number(e.target.value))}
                        className="mt-0.5 w-full px-2 py-1 bg-white border border-amber-300 rounded font-bold"
                      >
                        {[5, 6, 7, 8, 9].map((p) => (
                          <option key={p} value={p}>
                            {p} périodes
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => {
                          const rows = recalculateBellScheduleRows({
                            startHour: startH,
                            startMinute: startM,
                            periodDurationMinutes: pDur,
                            maxPeriods: maxP,
                            break1AfterPeriod: b1After,
                            break1DurationMinutes: b1Dur,
                            break2AfterPeriod: b2After,
                            break2DurationMinutes: b2Dur,
                          });
                          onUpdateBellScheduleGroups(
                            bellScheduleGroups.map((g) =>
                              g.id === activeBellGroup.id
                                ? { ...g, maxPeriodsPerDay: maxP, rows }
                                : g
                            )
                          );
                        }}
                        className="w-full py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer"
                      >
                        Recalculer Grille
                      </button>
                    </div>
                  </div>
                </div>

                {/* Editable Rows */}
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-600">
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Libellé</th>
                        <th className="py-2 px-3">Horaire (Début - Fin)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {activeBellGroup.rows.map((r, idx) => (
                        <tr
                          key={idx}
                          className={
                            r.type === 'break' ? 'bg-amber-50/70' : 'bg-white'
                          }
                        >
                          <td className="py-2 px-3 font-bold">
                            {r.type === 'break'
                              ? '☕ PAUSE'
                              : `Période ${r.periodNumber}`}
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={r.label}
                              onChange={(e) => {
                                const nextRows = activeBellGroup.rows.map(
                                  (row, i) =>
                                    i === idx
                                      ? { ...row, label: e.target.value }
                                      : row
                                );
                                onUpdateBellScheduleGroups(
                                  bellScheduleGroups.map((g) =>
                                    g.id === activeBellGroup.id
                                      ? { ...g, rows: nextRows }
                                      : g
                                  )
                                );
                              }}
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-bold"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={r.time}
                              onChange={(e) => {
                                const nextRows = activeBellGroup.rows.map(
                                  (row, i) =>
                                    i === idx
                                      ? { ...row, time: e.target.value }
                                      : row
                                );
                                onUpdateBellScheduleGroups(
                                  bellScheduleGroups.map((g) =>
                                    g.id === activeBellGroup.id
                                      ? { ...g, rows: nextRows }
                                      : g
                                  )
                                );
                              }}
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono font-bold"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 4: RÉGLAGES DES BREAKS / PAUSES, RÉCRÉATIONS & SURVEILLANCE
         ===================================================================== */}
      {activeModal === 'breaks_recreations' && activeBellGroup && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 bg-orange-900 text-white flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold flex items-center gap-2">
                  <Coffee className="w-5 h-5 text-orange-300" />
                  Réglages des Breaks (Pauses, Récréations, Prière) & Surveillance
                </h2>
                <p className="text-xs text-orange-100 mt-0.5">
                  Configurez l'emplacement des pauses, leurs horaires et les enseignants/assistants de surveillance par groupe de classes.
                </p>
              </div>
              <button
                onClick={() => onOpenModal(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {/* Group selector */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-600">
                  Groupe de classes :
                </span>
                {bellScheduleGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedBellGroupId(g.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                      g.id === activeBellGroup.id
                        ? 'bg-orange-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {g.name.split('—')[1] || g.name}
                  </button>
                ))}
              </div>

              {/* Add a new Break */}
              <div className="p-4 rounded-xl bg-orange-50 border border-orange-200 space-y-3">
                <div className="text-xs font-extrabold text-orange-950">
                  + Insérer une Nouvelle Pause / Récréation dans ce Groupe
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Libellé de la Pause
                    </label>
                    <input
                      type="text"
                      value={newBreakLabel}
                      onChange={(e) => setNewBreakLabel(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-orange-300 rounded font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Placer après la période
                    </label>
                    <select
                      value={newBreakAfterPeriod}
                      onChange={(e) =>
                        setNewBreakAfterPeriod(Number(e.target.value))
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-orange-300 rounded font-bold"
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map((p) => (
                        <option key={p} value={p}>
                          Après la {p}e Période
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Horaire (Début - Fin)
                    </label>
                    <input
                      type="text"
                      value={newBreakTime}
                      onChange={(e) => setNewBreakTime(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-orange-300 rounded font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Surveillant(e) (Prof/Assistant)
                    </label>
                    <select
                      value={newBreakSupervisor}
                      onChange={(e) => setNewBreakSupervisor(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-orange-300 rounded font-semibold"
                    >
                      <option value="">Équipe de garde...</option>
                      {allTeacherNames.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const nextRows: BellRow[] = [];
                      let inserted = false;
                      for (const r of activeBellGroup.rows) {
                        nextRows.push(r);
                        if (
                          r.type === 'period' &&
                          r.periodNumber === newBreakAfterPeriod
                        ) {
                          nextRows.push({
                            type: 'break',
                            label: newBreakLabel.trim() || 'Pause / Récréation',
                            time: newBreakTime.trim() || '10h00 - 10h20',
                            supervisorTeacher:
                              newBreakSupervisor || undefined,
                          });
                          inserted = true;
                        }
                      }
                      if (!inserted) {
                        nextRows.push({
                          type: 'break',
                          label: newBreakLabel.trim() || 'Pause / Récréation',
                          time: newBreakTime.trim() || '10h00 - 10h20',
                          supervisorTeacher: newBreakSupervisor || undefined,
                        });
                      }
                      onUpdateBellScheduleGroups(
                        bellScheduleGroups.map((g) =>
                          g.id === activeBellGroup.id
                            ? { ...g, rows: nextRows }
                            : g
                        )
                      );
                    }}
                    className="px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs cursor-pointer"
                  >
                    + Ajouter ce Break
                  </button>
                </div>
              </div>

              {/* Active Breaks in this Group */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                  Pauses / Breaks Configurés pour « {activeBellGroup.name} »
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-600">
                        <th className="py-2 px-3">Libellé du Break</th>
                        <th className="py-2 px-3">Créneau Horaire</th>
                        <th className="py-2 px-3">
                          Surveillance (Enseignant / Assistant)
                        </th>
                        <th className="py-2 px-3 text-right">Supprimer</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {activeBellGroup.rows.map((r, rIdx) => {
                        if (r.type !== 'break') return null;
                        return (
                          <tr key={rIdx} className="bg-orange-50/40">
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={r.label}
                                onChange={(e) => {
                                  const nextRows = activeBellGroup.rows.map(
                                    (row, i) =>
                                      i === rIdx
                                        ? { ...row, label: e.target.value }
                                        : row
                                  );
                                  onUpdateBellScheduleGroups(
                                    bellScheduleGroups.map((g) =>
                                      g.id === activeBellGroup.id
                                        ? { ...g, rows: nextRows }
                                        : g
                                    )
                                  );
                                }}
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-bold"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={r.time}
                                onChange={(e) => {
                                  const nextRows = activeBellGroup.rows.map(
                                    (row, i) =>
                                      i === rIdx
                                        ? { ...row, time: e.target.value }
                                        : row
                                  );
                                  onUpdateBellScheduleGroups(
                                    bellScheduleGroups.map((g) =>
                                      g.id === activeBellGroup.id
                                        ? { ...g, rows: nextRows }
                                        : g
                                    )
                                  );
                                }}
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono font-bold"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <select
                                value={r.supervisorTeacher || ''}
                                onChange={(e) => {
                                  const nextRows = activeBellGroup.rows.map(
                                    (row, i) =>
                                      i === rIdx
                                        ? {
                                            ...row,
                                            supervisorTeacher:
                                              e.target.value || undefined,
                                          }
                                        : row
                                  );
                                  onUpdateBellScheduleGroups(
                                    bellScheduleGroups.map((g) =>
                                      g.id === activeBellGroup.id
                                        ? { ...g, rows: nextRows }
                                        : g
                                    )
                                  );
                                }}
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-semibold"
                              >
                                <option value="">Aucune garde spécifique</option>
                                {allTeacherNames.map((t) => (
                                  <option key={t} value={t}>
                                    Garde : {t}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <button
                                onClick={() => {
                                  const nextRows = activeBellGroup.rows.filter(
                                    (_, i) => i !== rIdx
                                  );
                                  onUpdateBellScheduleGroups(
                                    bellScheduleGroups.map((g) =>
                                      g.id === activeBellGroup.id
                                        ? { ...g, rows: nextRows }
                                        : g
                                    )
                                  );
                                }}
                                className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 5: CRÉATEUR DE CONTRAT DE LEÇON STYLE aSc TIMETABLES
         ===================================================================== */}
      {activeModal === 'asc_lesson_creator' && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col">
            <div className="px-5 py-4 bg-sky-900 text-white flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-sky-300" />
                  Nouveau Contrat de Leçon (Format Officiel aSc TimeTables)
                </h2>
                <p className="text-xs text-sky-100 mt-0.5">
                  Définissez l'enseignant, l'assistant(e), la matière, la ou les classes et le découpage hebdomadaire (séances simples ou doubles).
                </p>
              </div>
              <button
                onClick={() => onOpenModal(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Professeur Principal *
                  </label>
                  <select
                    value={lesMainTeacher}
                    onChange={(e) => setLesMainTeacher(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold"
                  >
                    {allTeacherNames.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-teal-800 mb-1">
                    + Assistant(e) / Co-Enseignant (Optionnel)
                  </label>
                  <select
                    value={lesAssistantTeacher}
                    onChange={(e) => setLesAssistantTeacher(e.target.value)}
                    className="w-full px-3 py-2 bg-teal-50 border border-teal-300 rounded-lg font-bold text-teal-950"
                  >
                    <option value="">Aucun assistant (Prof seul)</option>
                    {allTeacherNames.map((t) => (
                      <option key={t} value={t}>
                        + Ass. {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Matière *
                  </label>
                  <select
                    value={lesSubject}
                    onChange={(e) => setLesSubject(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-bold"
                  >
                    {allSubjectNames.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Format / Durée des séances (Style aSc) *
                  </label>
                  <select
                    value={lesPattern}
                    onChange={(e) => setLesPattern(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold"
                  >
                    <option value="1">1 (1 séance simple)</option>
                    <option value="1+1">1+1 (2 séances simples)</option>
                    <option value="2">2 (1 séance double consécutive)</option>
                    <option value="1+1+1">1+1+1 (3 séances simples)</option>
                    <option value="2+1">2+1 (1 double + 1 simple = 3p)</option>
                    <option value="1+1+1+1">1+1+1+1 (4 séances simples)</option>
                    <option value="2+2">2+2 (2 séances doubles = 4p)</option>
                    <option value="1+1+1+1+1">
                      1+1+1+1+1 (5 séances simples)
                    </option>
                    <option value="2+1+1+1">
                      2+1+1+1 (1 double + 3 simples = 5p)
                    </option>
                    <option value="2+2+2">2+2+2 (6 séances = 3 doubles)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Classe(s) (Sélectionnez 1 classe, ou plusieurs pour un cours rassemblé) :
                </label>
                <div className="max-h-32 overflow-y-auto flex flex-wrap gap-1.5 p-2.5 bg-slate-50 border border-slate-300 rounded-xl">
                  {classes.map((c) => {
                    const sel = lesClassIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setLesClassIds((prev) =>
                            prev.includes(c.id)
                              ? prev.filter((x) => x !== c.id)
                              : [...prev, c.id]
                          )
                        }
                        className={`px-2.5 py-1 rounded-md text-xs font-bold border cursor-pointer ${
                          sel
                            ? 'bg-sky-600 text-white border-sky-700'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => onOpenModal(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (lesClassIds.length === 0) return;
                    onCreateAscLessonContract({
                      mainTeacher: lesMainTeacher,
                      assistantTeacher: lesAssistantTeacher || undefined,
                      subject: lesSubject,
                      classIds: lesClassIds,
                      groupLabel: lesGroup,
                      periodsPattern: lesPattern,
                      room: lesRoom || undefined,
                    });
                    onOpenModal(null);
                  }}
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-extrabold cursor-pointer"
                >
                  Créer & Placer les Séances
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 6: TOUS LES RÉGLAGES GÉNÉRAUX & CENTRE DE CONTRÔLE aSc
         ===================================================================== */}
      {activeModal === 'all_settings' && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div className="bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold flex items-center gap-2">
                  <Settings className="w-5 h-5 text-violet-400" />
                  Tous les Réglages de l'École & Paramètres Avancés aSc TimeTables
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Panneau centralisé pour piloter l'établissement, les horaires, les pauses, les contraintes, le verrouillage et les impressions.
                </p>
              </div>
              <button
                onClick={() => onOpenModal(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="font-extrabold text-slate-900 uppercase text-[11px]">
                    1. Paramètres de l'Année Scolaire & Scénario
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">
                        Année Scolaire
                      </label>
                      <select
                        value={schoolYear}
                        onChange={(e) => onChangeSchoolYear(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded font-bold"
                      >
                        <option value="2025-2026">2025-2026</option>
                        <option value="2026-2027">2026-2027</option>
                        <option value="2027-2028">2027-2028</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">
                        Mode / Scénario Horaire
                      </label>
                      <select
                        value={scenario}
                        onChange={(e) =>
                          onChangeScenario(
                            e.target.value as
                              | 'standard'
                              | 'ramadan'
                              | 'summer'
                              | 'exams'
                          )
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded font-bold"
                      >
                        <option value="standard">Standard (40-45 min)</option>
                        <option value="ramadan">Horaire Ramadan (35 min)</option>
                        <option value="summer">Horaire d'Été</option>
                        <option value="exams">Semaine d'Examens</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="font-extrabold text-slate-900 uppercase text-[11px]">
                    2. Verrouillage Global des Emplois (Style aSc Lock/Unlock)
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Verrouillez toutes les séances validées pour les protéger lors des générations automatiques, ou déverrouillez tout.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onLockOrUnlockAllClasses(true)}
                      className="flex-1 py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Verrouiller Tout
                    </button>
                    <button
                      type="button"
                      onClick={() => onLockOrUnlockAllClasses(false)}
                      className="flex-1 py-2 px-3 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      Déverrouiller Tout
                    </button>
                  </div>
                </div>
              </div>

              {/* Direct Quick Launch Grid for All Modules */}
              <div className="space-y-2">
                <div className="font-extrabold text-slate-900 uppercase text-[11px]">
                  3. Accès Rapide à Tous les Modules & Rapports Officiels aSc
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <button
                    onClick={() => onOpenModal('co_teaching_assistant')}
                    className="p-3 rounded-xl border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-950 font-bold text-left cursor-pointer"
                  >
                    Enseignant + Assistant(e)
                    <span className="block text-[10px] font-normal text-teal-700 mt-0.5">
                      Gérer les binômes
                    </span>
                  </button>
                  <button
                    onClick={() => onOpenModal('constraints_timeoff')}
                    className="p-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-950 font-bold text-left cursor-pointer"
                  >
                    Contraintes & Temps Libre
                    <span className="block text-[10px] font-normal text-rose-700 mt-0.5">
                      Grille Vert / Jaune / Rouge
                    </span>
                  </button>
                  <button
                    onClick={() => onOpenModal('horaires_bells')}
                    className="p-3 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-950 font-bold text-left cursor-pointer"
                  >
                    Horaires par Groupe
                    <span className="block text-[10px] font-normal text-amber-700 mt-0.5">
                      6 groupes de sonneries
                    </span>
                  </button>
                  <button
                    onClick={() => onOpenModal('breaks_recreations')}
                    className="p-3 rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-950 font-bold text-left cursor-pointer"
                  >
                    Breaks & Récréations
                    <span className="block text-[10px] font-normal text-orange-700 mt-0.5">
                      Pauses & Surveillance
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      onPrintReport('teachers_load');
                      onOpenModal(null);
                    }}
                    className="p-3 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-950 font-bold text-left cursor-pointer"
                  >
                    Imprimer Load Teachers
                    <span className="block text-[10px] font-normal text-sky-700 mt-0.5">
                      Format groupé PDF
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      onPrintReport('classes_load');
                      onOpenModal(null);
                    }}
                    className="p-3 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-950 font-bold text-left cursor-pointer"
                  >
                    Imprimer Load Classes
                    <span className="block text-[10px] font-normal text-indigo-700 mt-0.5">
                      Somme des séances PDF
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      onPrintReport('subjects_load');
                      onOpenModal(null);
                    }}
                    className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 font-bold text-left cursor-pointer"
                  >
                    Imprimer Load Subjects
                    <span className="block text-[10px] font-normal text-emerald-700 mt-0.5">
                      Volumes par matière
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      onPrintReport('ensemble');
                      onOpenModal(null);
                    }}
                    className="p-3 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold text-left cursor-pointer"
                  >
                    Imprimer Vue Ensemble
                    <span className="block text-[10px] font-normal text-slate-600 mt-0.5">
                      Matrice 35 classes A3/A4
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
