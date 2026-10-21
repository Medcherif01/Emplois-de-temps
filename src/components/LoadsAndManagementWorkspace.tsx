import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  Check,
  Download,
  GitMerge,
  Layers,
  Minus,
  Plus,
  Printer,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { DAYS_OF_WEEK } from '../data/alkawtharDefaults';
import { RoomResource, SubjectConfig } from '../engine/cspEngine';
import {
  DayOfWeek,
  SchoolCategory,
  SchoolClass,
  TeacherProfile,
} from '../types/timetable';
import {
  CATEGORY_LABELS,
  CATEGORY_SHORT_LABELS,
  classMatchesCategory,
  computeSubjectsLoadReport,
  computeTeachersLoadReport,
  getPrimaryClassCategory,
  getSubjectVisualStyle,
  teacherMatchesCategory,
} from '../utils/timetableAnalytics';

interface LoadsAndManagementWorkspaceProps {
  classes: SchoolClass[];
  teachers: TeacherProfile[];
  subjectConfigs: SubjectConfig[];
  rooms: RoomResource[];
  selectedCategory: SchoolCategory;
  onSelectCategory: (cat: SchoolCategory) => void;
  onAddSubjectWithClasses: (payload: {
    subjectName: string;
    category: Exclude<SchoolCategory, 'ALL'>;
    weeklyPeriods: number;
    durationMinutes: 30 | 40 | 45 | 50 | 60;
    weight: number;
    preferMorning: boolean;
    teacherName: string;
    subTeacherName?: string;
    targetClassIds: string[];
    autoScheduleInClasses: boolean;
  }) => void;
  onAddNewTeacher: (payload: {
    name: string;
    category: Exclude<SchoolCategory, 'ALL'>;
    subjects: string[];
    maxPeriodsPerWeek: number;
    initialClassId?: string;
    initialSubject?: string;
    initialPeriods?: number;
  }) => void;
  onAdjustClassSubjectLoad: (
    classId: string,
    subjectName: string,
    delta: number,
    preferredTeacher?: string
  ) => void;
  onAssembleClassesOrTeachers: (payload: {
    mode: 'joint_classes' | 'co_teachers';
    classAId: string;
    classBId?: string;
    day: DayOfWeek;
    period: number;
    subjectA: string;
    teacherA: string;
    subjectB?: string;
    teacherB?: string;
    room?: string;
  }) => void;
  onRemoveTeacherSession: (
    classId: string,
    day: DayOfWeek,
    period: number
  ) => void;
  onUpdateTeacherMaxLoad: (teacherId: string, newMax: number) => void;
  onPrintLoadReport: (mode: 'teachers_load' | 'subjects_load') => void;
  darkMode?: boolean;
}

export const LoadsAndManagementWorkspace: React.FC<
  LoadsAndManagementWorkspaceProps
> = ({
  classes,
  teachers,
  subjectConfigs,
  rooms,
  selectedCategory,
  onSelectCategory,
  onAddSubjectWithClasses,
  onAddNewTeacher,
  onAdjustClassSubjectLoad,
  onAssembleClassesOrTeachers,
  onRemoveTeacherSession,
  onPrintLoadReport,
  onUpdateTeacherMaxLoad,
  darkMode = false,
}) => {
  const [subView, setSubView] = useState<
    | 'teachers_load'
    | 'subjects_load'
    | 'add_subject_classes'
    | 'add_teacher_sessions'
    | 'joint_and_intercalated'
  >('teachers_load');

  const [searchQuery, setSearchQuery] = useState('');

  // State for "Add Subject & Associate with 1 or Multiple Classes"
  const [newSubName, setNewSubName] = useState('');
  const [newSubCategory, setNewSubCategory] =
    useState<Exclude<SchoolCategory, 'ALL'>>('French_Section');
  const [newSubPeriods, setNewSubPeriods] = useState<number>(4);
  const [newSubDuration, setNewSubDuration] = useState<
    30 | 40 | 45 | 50 | 60
  >(45);
  const [newSubWeight, setNewSubWeight] = useState<number>(4);
  const [newSubMorning, setNewSubMorning] = useState<boolean>(true);
  const [newSubTeacher, setNewSubTeacher] = useState<string>(
    teachers[0]?.name || ''
  );
  const [newSubCoTeacher, setNewSubCoTeacher] = useState<string>('');
  const [selectedClassIdsForSub, setSelectedClassIdsForSub] = useState<
    string[]
  >([classes[0]?.id || '']);
  const [autoScheduleSub, setAutoScheduleSub] = useState<boolean>(true);

  // State for "Add Teacher & Manage Sessions"
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherCategory, setNewTeacherCategory] =
    useState<Exclude<SchoolCategory, 'ALL'>>('French_Section');
  const [newTeacherSubjects, setNewTeacherSubjects] = useState(
    'Maths, Physique'
  );
  const [newTeacherMaxLoad, setNewTeacherMaxLoad] = useState<number>(24);
  const [newTeacherInitClassId, setNewTeacherInitClassId] = useState<string>(
    classes[0]?.id || ''
  );
  const [newTeacherInitSubj, setNewTeacherInitSubj] = useState<string>('Maths');
  const [newTeacherInitPeriods, setNewTeacherInitPeriods] = useState<number>(4);

  const [focusedTeacherId, setFocusedTeacherId] = useState<string>(
    teachers[0]?.id || ''
  );
  const [assignClassId, setAssignClassId] = useState<string>(
    classes[0]?.id || ''
  );
  const [assignSubject, setAssignSubject] = useState<string>('Maths');
  const [assignPeriodsCount, setAssignPeriodsCount] = useState<number>(2);

  // State for "Rassembler 2 Classes ou 2 Enseignants"
  const [assembleMode, setAssembleMode] = useState<
    'joint_classes' | 'co_teachers'
  >('joint_classes');
  const [assembleClassA, setAssembleClassA] = useState<string>(
    classes.find((c) => c.name === '11 Am.Girls')?.id || classes[0]?.id || ''
  );
  const [assembleClassB, setAssembleClassB] = useState<string>(
    classes.find((c) => c.name === '12 Am.Girls')?.id || classes[1]?.id || ''
  );
  const [assembleDay, setAssembleDay] = useState<DayOfWeek>('Mardi');
  const [assemblePeriod, setAssemblePeriod] = useState<number>(4);
  const [assembleSubjectA, setAssembleSubjectA] = useState<string>('P.E');
  const [assembleTeacherA, setAssembleTeacherA] = useState<string>(
    teachers[0]?.name || ''
  );
  const [assembleSubjectB, setAssembleSubjectB] =
    useState<string>('Easy Arabic');
  const [assembleTeacherB, setAssembleTeacherB] = useState<string>(
    teachers[1]?.name || ''
  );
  const [assembleRoom, setAssembleRoom] = useState<string>(
    rooms[0]?.name || ''
  );

  // Computed Load Reports filtered by Category
  const teachersLoadRows = useMemo(() => {
    const rows = computeTeachersLoadReport(
      teachers,
      classes,
      selectedCategory
    );
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(
      (r) =>
        r.teacherName.toLowerCase().includes(q) ||
        r.subjects.some((s) => s.toLowerCase().includes(q)) ||
        r.classBreakdown.some((b) => b.className.toLowerCase().includes(q))
    );
  }, [teachers, classes, selectedCategory, searchQuery]);

  const subjectsLoadRows = useMemo(() => {
    const rows = computeSubjectsLoadReport(
      classes,
      subjectConfigs,
      selectedCategory
    );
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(
      (r) =>
        r.subjectName.toLowerCase().includes(q) ||
        r.teachersInvolved.some((t) => t.toLowerCase().includes(q)) ||
        r.classAllocations.some((c) => c.className.toLowerCase().includes(q))
    );
  }, [classes, subjectConfigs, selectedCategory, searchQuery]);

  const focusedTeacher = useMemo(
    () => teachers.find((t) => t.id === focusedTeacherId) || teachers[0],
    [teachers, focusedTeacherId]
  );

  const focusedTeacherSessions = useMemo(() => {
    if (!focusedTeacher) return [];
    const list: Array<{
      classId: string;
      className: string;
      day: DayOfWeek;
      period: number;
      subject: string;
      coTeacher?: string;
      jointWith?: string[];
    }> = [];
    for (const cls of classes) {
      for (const [key, slot] of Object.entries(cls.slots)) {
        const [dStr, pStr] = key.split('_');
        const tLow = focusedTeacher.name.toLowerCase();
        const isPrimary = slot.teacher.toLowerCase().includes(tLow);
        const isSub = slot.subTeacher?.toLowerCase().includes(tLow);
        if (isPrimary || isSub) {
          list.push({
            classId: cls.id,
            className: cls.name,
            day: dStr as DayOfWeek,
            period: Number(pStr),
            subject: isPrimary
              ? slot.subject
              : slot.subSubject || slot.subject,
            coTeacher: isPrimary ? slot.subTeacher : slot.teacher,
            jointWith: slot.jointWithClasses,
          });
        }
      }
    }
    return list;
  }, [focusedTeacher, classes]);

  const handleToggleClassSelection = (classId: string) => {
    setSelectedClassIdsForSub((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId]
    );
  };

  const handleSelectAllInCategory = (cat: SchoolCategory) => {
    const ids = classes
      .filter((c) => classMatchesCategory(c, cat))
      .map((c) => c.id);
    setSelectedClassIdsForSub(ids);
  };

  return (
    <div className="space-y-5 no-print">
      {/* =====================================================================
          TOP HEADER: CATEGORY CLASSIFIER + PRINT LOAD BUTTONS
         ===================================================================== */}
      <div
        className={`border rounded-lg p-4 space-y-3 ${
          darkMode
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Category Filter (French Section, Boys Section, Girls Section, American Section, KG/Primary) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-sky-600" />
              <span>Catégorie :</span>
            </span>
            {(
              [
                'ALL',
                'French_Section',
                'Boys_Section',
                'Girls_Section',
                'American_Section',
                'KG_Primary',
              ] as SchoolCategory[]
            ).map((cat) => (
              <button
                key={cat}
                onClick={() => onSelectCategory(cat)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  selectedCategory === cat
                    ? 'bg-sky-700 text-white'
                    : darkMode
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {CATEGORY_SHORT_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Dedicated Print Buttons: Imprimer Load Teachers & Imprimer Load Subjects */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onPrintLoadReport('teachers_load')}
              className="px-3.5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 text-sky-400" />
              <span>Imprimer Load Teachers (PDF)</span>
            </button>
            <button
              onClick={() => onPrintLoadReport('subjects_load')}
              className="px-3.5 py-2 text-xs font-bold text-white bg-sky-700 hover:bg-sky-800 rounded-lg flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimer Load Subjects (PDF)</span>
            </button>
          </div>
        </div>

        {/* Sub-navigation tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200/70">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['teachers_load', '1. Load Teachers (Charges Enseignants)'],
                ['subjects_load', '2. Load Subjects (Charges Matières)'],
                [
                  'add_subject_classes',
                  '3. + Ajouter Matière & Associer aux Classes',
                ],
                [
                  'add_teacher_sessions',
                  '4. + Ajouter Enseignant(e) & Gérer ses Séances',
                ],
                [
                  'joint_and_intercalated',
                  '5. ⊕ Rassembler 2 Classes / 2 Enseignants',
                ],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSubView(key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  subView === key
                    ? 'bg-slate-900 text-white'
                    : darkMode
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher prof, matière, classe..."
              className={`pl-8 pr-3 py-1 text-xs border rounded-md w-56 ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>
        </div>
      </div>

      {/* =====================================================================
          SUB-VIEW 1: INTERACTIVE TEACHERS LOAD TABLE (Modifier Load Enseignants)
         ===================================================================== */}
      {subView === 'teachers_load' && (
        <div
          className={`border rounded-lg overflow-hidden ${
            darkMode
              ? 'bg-slate-900 border-slate-800'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">
                Tableau des Charges Horaires Enseignants (Load Teachers) —{' '}
                {CATEGORY_LABELS[selectedCategory]}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Modifiez directement le nombre de séances (`-` / `+`) d'un enseignant dans chaque classe ou ajustez son plafond hebdomadaire.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSubView('add_teacher_sessions')}
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-md flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Ajouter Enseignant(e)</span>
              </button>
              <button
                onClick={() => onPrintLoadReport('teachers_load')}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-md flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimer ce tableau</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th className="py-2.5 px-3 font-bold">Enseignant(e)</th>
                  <th className="py-2.5 px-3 font-bold">Catégorie</th>
                  <th className="py-2.5 px-3 font-bold">Matières</th>
                  <th className="py-2.5 px-3 font-bold">
                    Répartition du Load par Classe (Cliquez - / + pour modifier le Load)
                  </th>
                  <th className="py-2.5 px-3 font-bold text-center">
                    Load Actuel
                  </th>
                  <th className="py-2.5 px-3 font-bold text-center">
                    Max / Sem
                  </th>
                  <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {teachersLoadRows.map((row) => {
                  const isOver = row.totalPeriods > row.maxPeriods;
                  return (
                    <tr
                      key={row.teacherId}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {row.teacherName}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 text-[11px] font-semibold">
                          {row.sectionLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {row.subjects.join(', ')}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1.5">
                          {row.classBreakdown.map((b) => (
                            <div
                              key={`${b.classId}_${b.subject}`}
                              className="inline-flex items-center gap-1 bg-slate-100 border border-slate-300 rounded px-2 py-0.5 text-[11px] text-slate-900"
                            >
                              <span className="font-bold">{b.className}</span>
                              <span className="text-slate-500">
                                ({b.subject})
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  onAdjustClassSubjectLoad(
                                    b.classId,
                                    b.subject,
                                    -1,
                                    row.teacherName
                                  )
                                }
                                title="Retirer 1 séance"
                                className="w-4 h-4 rounded bg-white border border-slate-300 flex items-center justify-center hover:bg-red-50 hover:text-red-600"
                              >
                                <Minus className="w-2.5 h-2.5" />
                              </button>
                              <span className="font-mono font-extrabold px-0.5">
                                {b.periods}p
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  onAdjustClassSubjectLoad(
                                    b.classId,
                                    b.subject,
                                    1,
                                    row.teacherName
                                  )
                                }
                                title="Ajouter 1 séance"
                                className="w-4 h-4 rounded bg-white border border-slate-300 flex items-center justify-center hover:bg-emerald-50 hover:text-emerald-700"
                              >
                                <Plus className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`font-mono font-extrabold text-sm ${
                            isOver ? 'text-red-600' : 'text-emerald-700'
                          }`}
                        >
                          {row.totalPeriods}p
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="number"
                          min={4}
                          max={40}
                          value={row.maxPeriods}
                          onChange={(e) =>
                            onUpdateTeacherMaxLoad(
                              row.teacherId,
                              Number(e.target.value) || 24
                            )
                          }
                          className="w-14 px-1.5 py-0.5 text-center font-mono text-xs border border-slate-300 rounded bg-white text-slate-900"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => {
                            setFocusedTeacherId(row.teacherId);
                            setSubView('add_teacher_sessions');
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded border border-sky-200"
                        >
                          Gérer séances
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-VIEW 2: INTERACTIVE SUBJECTS LOAD TABLE (Modifier Load Matières)
         ===================================================================== */}
      {subView === 'subjects_load' && (
        <div
          className={`border rounded-lg overflow-hidden ${
            darkMode
              ? 'bg-slate-900 border-slate-800'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">
                Tableau des Charges Horaires des Matières par Classe (Load Subjects) —{' '}
                {CATEGORY_LABELS[selectedCategory]}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ajustez le volume horaire hebdomadaire (`-` / `+`) de chaque matière classe par classe, ou associez une matière à de nouvelles classes.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSubView('add_subject_classes')}
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-md flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Associer Matière aux Classes</span>
              </button>
              <button
                onClick={() => onPrintLoadReport('subjects_load')}
                className="px-3 py-1.5 text-xs font-semibold bg-sky-700 hover:bg-sky-800 text-white rounded-md flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimer Load Subjects</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <th className="py-2.5 px-3 font-bold w-44">Matière</th>
                  <th className="py-2.5 px-3 font-bold w-36">Catégorie</th>
                  <th className="py-2.5 px-3 font-bold text-center w-24">
                    Classes
                  </th>
                  <th className="py-2.5 px-3 font-bold text-center w-28">
                    Total École
                  </th>
                  <th className="py-2.5 px-3 font-bold">
                    Classes Associées & Modification du Load (- / + séances/semaine)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {subjectsLoadRows.map((sub) => {
                  const visual = getSubjectVisualStyle(sub.subjectName);
                  return (
                    <tr
                      key={sub.subjectName}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            style={{
                              backgroundColor: visual.bgHex,
                              borderColor: visual.borderHex,
                            }}
                            className="w-3.5 h-3.5 rounded border shrink-0"
                          />
                          <span className="font-bold text-slate-900">
                            {sub.subjectName}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-semibold">
                          {CATEGORY_SHORT_LABELS[sub.category]}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold">
                        {sub.classesCount}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-extrabold text-sky-700">
                        {sub.totalPeriodsAcrossSchool}p/sem
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1.5">
                          {sub.classAllocations.map((alloc) => (
                            <div
                              key={alloc.classId}
                              className="inline-flex items-center gap-1 bg-slate-100 border border-slate-300 rounded px-2 py-0.5 text-[11px] text-slate-900"
                            >
                              <span className="font-bold">
                                {alloc.className}
                              </span>
                              <span className="text-slate-500 text-[10px]">
                                ({alloc.teachers[0] || 'Prof'})
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  onAdjustClassSubjectLoad(
                                    alloc.classId,
                                    sub.subjectName,
                                    -1,
                                    alloc.teachers[0]
                                  )
                                }
                                className="w-4 h-4 rounded bg-white border border-slate-300 flex items-center justify-center hover:bg-red-50 hover:text-red-600"
                              >
                                <Minus className="w-2.5 h-2.5" />
                              </button>
                              <span className="font-mono font-extrabold px-0.5">
                                {alloc.scheduledPeriods}p
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  onAdjustClassSubjectLoad(
                                    alloc.classId,
                                    sub.subjectName,
                                    1,
                                    alloc.teachers[0]
                                  )
                                }
                                className="w-4 h-4 rounded bg-white border border-slate-300 flex items-center justify-center hover:bg-emerald-50 hover:text-emerald-700"
                              >
                                <Plus className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-VIEW 3: ADD SUBJECT & ASSOCIATE WITH ONE OR MULTIPLE CLASSES
         ===================================================================== */}
      {subView === 'add_subject_classes' && (
        <div
          className={`border rounded-lg p-5 space-y-5 ${
            darkMode
              ? 'bg-slate-900 border-slate-800 text-slate-100'
              : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-sky-600" />
              <span>
                Ajouter une Matière & L'associer avec Une ou Plusieurs Classes
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Créez une nouvelle matière (ou sélectionnez une matière existante), définissez son volume horaire hebdomadaire (Load) et cochez toutes les classes concernées.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newSubName.trim() || selectedClassIdsForSub.length === 0)
                return;
              onAddSubjectWithClasses({
                subjectName: newSubName.trim(),
                category: newSubCategory,
                weeklyPeriods: newSubPeriods,
                durationMinutes: newSubDuration,
                weight: newSubWeight,
                preferMorning: newSubMorning,
                teacherName: newSubTeacher.trim() || 'Professeur Principal',
                subTeacherName: newSubCoTeacher.trim() || undefined,
                targetClassIds: selectedClassIdsForSub,
                autoScheduleInClasses: autoScheduleSub,
              });
              setNewSubName('');
            }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Left Column: Subject & Load Details */}
            <div className="lg:col-span-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Nom de la matière (nouvelle ou existante)
                </label>
                <input
                  type="text"
                  required
                  list="existing-subjects-datalist"
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  placeholder="Ex: Robotique, Philosophie, Biologie, AP-Calculus..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                />
                <datalist id="existing-subjects-datalist">
                  {subjectConfigs.map((s) => (
                    <option key={s.id} value={s.name} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Catégorie / Section
                  </label>
                  <select
                    value={newSubCategory}
                    onChange={(e) =>
                      setNewSubCategory(
                        e.target.value as Exclude<SchoolCategory, 'ALL'>
                      )
                    }
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                  >
                    <option value="French_Section">French Section</option>
                    <option value="Boys_Section">Boys Section</option>
                    <option value="Girls_Section">Girls Section</option>
                    <option value="American_Section">American Section</option>
                    <option value="KG_Primary">KG & Primary</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Load hebdomadaire (séances/sem)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={newSubPeriods}
                    onChange={(e) =>
                      setNewSubPeriods(Number(e.target.value) || 2)
                    }
                    className="w-full px-3 py-2 text-xs font-mono font-bold border border-slate-300 rounded-md bg-white text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Enseignant principal
                  </label>
                  <input
                    type="text"
                    list="teachers-datalist-load"
                    value={newSubTeacher}
                    onChange={(e) => setNewSubTeacher(e.target.value)}
                    placeholder="Nom de l'enseignant"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                  />
                  <datalist id="teachers-datalist-load">
                    {teachers.map((t) => (
                      <option key={t.id} value={t.name} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    2e Enseignant (Optionnel — Co-enseignement)
                  </label>
                  <input
                    type="text"
                    list="teachers-datalist-load"
                    value={newSubCoTeacher}
                    onChange={(e) => setNewSubCoTeacher(e.target.value)}
                    placeholder="Aucun (ou 2e prof)"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Durée de la séance
                  </label>
                  <select
                    value={newSubDuration}
                    onChange={(e) =>
                      setNewSubDuration(
                        Number(e.target.value) as 30 | 40 | 45 | 50 | 60
                      )
                    }
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                  >
                    {[30, 40, 45, 50, 60].map((m) => (
                      <option key={m} value={m}>
                        {m} minutes
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Coefficient / Importance (1 à 5)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={newSubWeight}
                    onChange={(e) =>
                      setNewSubWeight(Number(e.target.value) || 3)
                    }
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md bg-white text-slate-900"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={autoScheduleSub}
                  onChange={(e) => setAutoScheduleSub(e.target.checked)}
                  className="accent-sky-700"
                />
                <span>
                  Placer automatiquement les {newSubPeriods} séance(s)/semaine dans l'emploi du temps des classes cochées
                </span>
              </label>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs rounded-lg shadow-xs flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>
                  Associer la matière aux {selectedClassIdsForSub.length} classe(s) sélectionnée(s)
                </span>
              </button>
            </div>

            {/* Right Column: Multi-Class Selector grouped by Category */}
            <div className="lg:col-span-7 border border-slate-200 rounded-lg p-4 bg-slate-50 text-slate-900 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold">
                  Sélectionner une ou plusieurs classes ({selectedClassIdsForSub.length} cochée(s)) :
                </span>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ['French_Section', 'Tout French'],
                      ['Boys_Section', 'Tout Boys'],
                      ['Girls_Section', 'Tout Girls'],
                      ['American_Section', 'Tout American'],
                      ['KG_Primary', 'Tout KG/Prim'],
                    ] as const
                  ).map(([catKey, btnLabel]) => (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => handleSelectAllInCategory(catKey)}
                      className="px-2 py-1 text-[10px] font-semibold bg-white border border-slate-300 rounded hover:bg-sky-50"
                    >
                      {btnLabel}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSelectedClassIdsForSub([])}
                    className="px-2 py-1 text-[10px] font-semibold text-red-600 bg-white border border-red-200 rounded hover:bg-red-50"
                  >
                    Aucune
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-72 overflow-y-auto p-1">
                {classes.map((cls) => {
                  const checked = selectedClassIdsForSub.includes(cls.id);
                  const catShort =
                    CATEGORY_SHORT_LABELS[getPrimaryClassCategory(cls)];
                  return (
                    <label
                      key={cls.id}
                      className={`p-2 rounded border text-xs cursor-pointer flex items-center gap-2 transition-colors ${
                        checked
                          ? 'bg-sky-100 border-sky-500 font-bold text-sky-950'
                          : 'bg-white border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleClassSelection(cls.id)}
                        className="accent-sky-700"
                      />
                      <div className="min-w-0">
                        <div className="truncate">{cls.name}</div>
                        <div className="text-[9px] text-slate-500 truncate">
                          {catShort}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          SUB-VIEW 4: ADD TEACHER & MANAGE TEACHER SESSIONS / LOAD
         ===================================================================== */}
      {subView === 'add_teacher_sessions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Add New Teacher Form */}
          <div
            className={`lg:col-span-5 border rounded-lg p-5 space-y-4 ${
              darkMode
                ? 'bg-slate-900 border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-600" />
                <span>Ajouter un(e) Nouvel(le) Enseignant(e)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Créez un profil enseignant classé par catégorie (French, Boys, Girls, American) et attribuez ses premières séances.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTeacherName.trim()) return;
                const subjArr = newTeacherSubjects
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
                onAddNewTeacher({
                  name: newTeacherName.trim(),
                  category: newTeacherCategory,
                  subjects: subjArr.length > 0 ? subjArr : ['General'],
                  maxPeriodsPerWeek: newTeacherMaxLoad,
                  initialClassId: newTeacherInitClassId,
                  initialSubject: newTeacherInitSubj.trim(),
                  initialPeriods: newTeacherInitPeriods,
                });
                setNewTeacherName('');
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Nom complet de l'enseignant(e)
                </label>
                <input
                  type="text"
                  required
                  value={newTeacherName}
                  onChange={(e) => setNewTeacherName(e.target.value)}
                  placeholder="Ex: Mme Claire Laurent / M. Youssef..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Catégorie / Section
                  </label>
                  <select
                    value={newTeacherCategory}
                    onChange={(e) =>
                      setNewTeacherCategory(
                        e.target.value as Exclude<SchoolCategory, 'ALL'>
                      )
                    }
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                  >
                    <option value="French_Section">French Section</option>
                    <option value="Boys_Section">Boys Section</option>
                    <option value="Girls_Section">Girls Section</option>
                    <option value="American_Section">American Section</option>
                    <option value="KG_Primary">KG & Primary</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Charge Max (séances/sem)
                  </label>
                  <input
                    type="number"
                    min={4}
                    max={40}
                    value={newTeacherMaxLoad}
                    onChange={(e) =>
                      setNewTeacherMaxLoad(Number(e.target.value) || 24)
                    }
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md bg-white text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  Matières enseignées (séparées par virgule)
                </label>
                <input
                  type="text"
                  value={newTeacherSubjects}
                  onChange={(e) => setNewTeacherSubjects(e.target.value)}
                  placeholder="Ex: Maths, Physique, SNT"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-900"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2 text-slate-900">
                <div className="text-[11px] font-bold text-slate-700">
                  Affectation initiale de séances (Optionnel) :
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500">
                      Classe
                    </label>
                    <select
                      value={newTeacherInitClassId}
                      onChange={(e) => setNewTeacherInitClassId(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">
                      Matière
                    </label>
                    <input
                      type="text"
                      value={newTeacherInitSubj}
                      onChange={(e) => setNewTeacherInitSubj(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">
                      Nb séances
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={newTeacherInitPeriods}
                      onChange={(e) =>
                        setNewTeacherInitPeriods(Number(e.target.value) || 0)
                      }
                      className="w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded bg-white"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>Créer l'Enseignant(e) & Planifier ses Séances</span>
              </button>
            </form>
          </div>

          {/* Right: Manage Existing Teacher's Sessions & Load */}
          <div
            className={`lg:col-span-7 border rounded-lg p-5 space-y-4 ${
              darkMode
                ? 'bg-slate-900 border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">
                  Gérer les Séances & le Load d'un Enseignant
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ajoutez des séances dans n'importe quelle classe ou supprimez/modifiez les séances existantes.
                </p>
              </div>

              <select
                value={focusedTeacher?.id || ''}
                onChange={(e) => setFocusedTeacherId(e.target.value)}
                className="px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-md bg-slate-50 text-slate-900"
              >
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.subjects.join(', ')})
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Add Sessions to this Teacher */}
            {focusedTeacher && (
              <div className="p-3.5 bg-sky-50/70 border border-sky-200 rounded-lg flex flex-wrap items-end gap-3 text-slate-900">
                <div>
                  <label className="block text-[11px] font-semibold mb-1">
                    Attribuer une classe à {focusedTeacher.name}
                  </label>
                  <select
                    value={assignClassId}
                    onChange={(e) => setAssignClassId(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold mb-1">
                    Matière
                  </label>
                  <input
                    type="text"
                    value={assignSubject}
                    onChange={(e) => setAssignSubject(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white w-36"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold mb-1">
                    Séances à ajouter
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={assignPeriodsCount}
                    onChange={(e) =>
                      setAssignPeriodsCount(Number(e.target.value) || 1)
                    }
                    className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded bg-white w-20"
                  />
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onAdjustClassSubjectLoad(
                      assignClassId,
                      assignSubject,
                      assignPeriodsCount,
                      focusedTeacher.name
                    )
                  }
                  className="px-3.5 py-1.5 text-xs font-bold bg-sky-700 hover:bg-sky-800 text-white rounded flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ajouter {assignPeriodsCount} séance(s)</span>
                </button>
              </div>
            )}

            {/* List of all individual sessions of this teacher */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <span>
                  Séances hebdomadaires programmées pour {focusedTeacher?.name} (
                  {focusedTeacherSessions.length} périodes) :
                </span>
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-md">
                {focusedTeacherSessions.map((sess, i) => (
                  <div
                    key={`${sess.classId}_${sess.day}_${sess.period}_${i}`}
                    className="px-3 py-2 flex items-center justify-between text-xs bg-white text-slate-900 hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded">
                        {sess.day} P{sess.period}
                      </span>
                      <span className="font-bold">{sess.className}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-semibold text-slate-700">
                        {sess.subject}
                      </span>
                      {sess.coTeacher && (
                        <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-semibold">
                          ⇄ Co-Prof: {sess.coTeacher}
                        </span>
                      )}
                      {sess.jointWith?.length ? (
                        <span className="text-[10px] bg-indigo-100 text-indigo-900 px-1.5 py-0.5 rounded font-semibold">
                          ⊕ Avec {sess.jointWith.join(', ')}
                        </span>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        onRemoveTeacherSession(
                          sess.classId,
                          sess.day,
                          sess.period
                        )
                      }
                      className="text-red-600 hover:text-red-800 p-1"
                      title="Supprimer cette séance"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-VIEW 5: RASSEMBLER DEUX CLASSES OU DEUX ENSEIGNANTS EN MÊME TEMPS
         ===================================================================== */}
      {subView === 'joint_and_intercalated' && (
        <div
          className={`border rounded-lg p-5 space-y-5 ${
            darkMode
              ? 'bg-slate-900 border-slate-800 text-slate-100'
              : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-indigo-600" />
                <span>
                  Rassembler Deux Classes en Même Temps (⊕ Cours Commun) ou Deux Enseignants (⇄ Co-Enseignement / Séance Intercalée)
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Fusionnez deux classes sur le même créneau horaire (ex: P.E, Islamic, Art, Conférence) sans déclencher de faux conflit, ou associez deux enseignants simultanément sur une classe.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAssembleMode('joint_classes')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md ${
                  assembleMode === 'joint_classes'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                ⊕ Mode 1 : Rassembler 2 Classes
              </button>
              <button
                type="button"
                onClick={() => setAssembleMode('co_teachers')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md ${
                  assembleMode === 'co_teachers'
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                ⇄ Mode 2 : Rassembler 2 Enseignants (Séance Intercalée)
              </button>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAssembleClassesOrTeachers({
                mode: assembleMode,
                classAId: assembleClassA,
                classBId:
                  assembleMode === 'joint_classes' ? assembleClassB : undefined,
                day: assembleDay,
                period: assemblePeriod,
                subjectA: assembleSubjectA.trim() || 'P.E',
                teacherA: assembleTeacherA.trim() || 'Enseignant 1',
                subjectB:
                  assembleMode === 'co_teachers'
                    ? assembleSubjectB.trim() || assembleSubjectA.trim()
                    : undefined,
                teacherB: assembleTeacherB.trim() || undefined,
                room: assembleRoom,
              });
            }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
          >
            <div>
              <label className="block text-xs font-bold mb-1">
                1re Classe concernée
              </label>
              <select
                value={assembleClassA}
                onChange={(e) => setAssembleClassA(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded bg-white"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (
                    {CATEGORY_SHORT_LABELS[getPrimaryClassCategory(c)]})
                  </option>
                ))}
              </select>
            </div>

            {assembleMode === 'joint_classes' ? (
              <div>
                <label className="block text-xs font-bold mb-1 text-indigo-800">
                  2e Classe à rassembler en même temps (⊕)
                </label>
                <select
                  value={assembleClassB}
                  onChange={(e) => setAssembleClassB(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-indigo-300 rounded bg-white font-semibold"
                >
                  {classes
                    .filter((c) => c.id !== assembleClassA)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (
                        {CATEGORY_SHORT_LABELS[getPrimaryClassCategory(c)]})
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold mb-1 text-amber-800">
                  2e Matière / Sous-groupe intercalé (⇄)
                </label>
                <input
                  type="text"
                  value={assembleSubjectB}
                  onChange={(e) => setAssembleSubjectB(e.target.value)}
                  placeholder="Ex: Easy Arabic (ou même matière)"
                  className="w-full px-3 py-2 text-xs border border-amber-300 rounded bg-white"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold mb-1">Jour</label>
                <select
                  value={assembleDay}
                  onChange={(e) => setAssembleDay(e.target.value as DayOfWeek)}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded bg-white"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Période</label>
                <select
                  value={assemblePeriod}
                  onChange={(e) => setAssemblePeriod(Number(e.target.value))}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded bg-white"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                    <option key={p} value={p}>
                      Période {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">
                Matière principale
              </label>
              <input
                type="text"
                list="existing-subjects-datalist"
                value={assembleSubjectA}
                onChange={(e) => setAssembleSubjectA(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">
                1er Enseignant
              </label>
              <input
                type="text"
                list="teachers-datalist-load"
                value={assembleTeacherA}
                onChange={(e) => setAssembleTeacherA(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">
                2e Enseignant en même temps (Co-enseignement)
              </label>
              <input
                type="text"
                list="teachers-datalist-load"
                value={assembleTeacherB}
                onChange={(e) => setAssembleTeacherB(e.target.value)}
                placeholder="Optionnel en mode Classes, Requis en mode 2 Profs"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded bg-white"
              />
            </div>

            <div className="md:col-span-3 flex items-center justify-between pt-2 border-t border-slate-200">
              <div className="text-xs text-slate-600">
                Salle / Espace :{' '}
                <select
                  value={assembleRoom}
                  onChange={(e) => setAssembleRoom(e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded bg-white ml-1"
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name} ({r.capacity} pl.)
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center gap-2 shadow-xs"
              >
                <GitMerge className="w-4 h-4" />
                <span>
                  {assembleMode === 'joint_classes'
                    ? 'Rassembler les 2 Classes sur ce Créneau (⊕)'
                    : 'Créer la Séance Intercalée / 2 Enseignants (⇄)'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
