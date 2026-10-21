import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  FileSpreadsheet,
  Layers,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wand2,
} from 'lucide-react';
import {
  BellRow,
  BellScheduleGroup,
  DayOfWeek,
  IntercalatedSessionInfo,
  SchoolCategory,
  SchoolClass,
  SectionType,
  TeacherProfile,
} from '../types/timetable';
import {
  CATEGORY_LABELS,
  CATEGORY_SHORT_LABELS,
  ClassLoadBlock,
  SubjectLoadRow,
  TeacherLoadLineItem,
  TeacherLoadRow,
  classMatchesCategory,
  getSubjectVisualStyle,
  recalculateBellScheduleRows,
} from '../utils/timetableAnalytics';

interface LoadsAndManagementWorkspaceProps {
  classes: SchoolClass[];
  teachers: TeacherProfile[];
  teacherLoadRows: TeacherLoadRow[];
  classLoadBlocks: ClassLoadBlock[];
  subjectLoadRows: SubjectLoadRow[];
  intercalatedSessions: IntercalatedSessionInfo[];
  bellScheduleGroups: BellScheduleGroup[];
  selectedCategory: SchoolCategory;
  onSelectCategory: (cat: SchoolCategory) => void;
  onUpdateSubjectClassLoad: (
    classId: string,
    subjectName: string,
    teacherName: string,
    targetPeriods: number,
    groupName?: string,
    assistantTeacher?: string
  ) => void;
  onModifyClassLoadItem: (params: {
    classId: string;
    oldSubject: string;
    oldTeacher: string;
    newSubject: string;
    newTeacher: string;
    newPeriods: number;
    newGroupLabel: string;
    newAssistantTeacher?: string;
  }) => void;
  onModifyTeacherLoadLine: (params: {
    teacherName: string;
    oldItem: TeacherLoadLineItem;
    newClassIds: string[];
    newSubject: string;
    newGroupLabel: string;
    newPeriodsPerClass: number;
  }) => void;
  onCloneClassLoadToClasses: (
    sourceClassId: string,
    targetClassIds: string[],
    keepTeachers: boolean
  ) => void;
  onGlobalReplaceTeacherOrSubject: (params: {
    mode: 'teacher' | 'subject';
    fromValue: string;
    toValue: string;
    categoryFilter: SchoolCategory;
  }) => void;
  onAutoCompleteAllClassesSchedules: (categoryFilter: SchoolCategory) => void;
  onUpdateBellScheduleGroups: (groups: BellScheduleGroup[]) => void;
  onAddSubjectToClasses: (payload: {
    subjectName: string;
    category: SchoolCategory;
    teacherName: string;
    weeklyPeriods: number;
    classIds: string[];
    isJointCourse: boolean;
    coTeacherName?: string;
    subSubjectName?: string;
    groupName?: string;
  }) => void;
  onAddOrUpdateTeacherWithSessions: (payload: {
    id?: string;
    name: string;
    primarySubject: string;
    section: string;
    maxPeriodsPerWeek: number;
    maxPeriodsPerDay: number;
    allocations: Array<{
      classId: string;
      subject: string;
      periods: number;
      jointWithClassId?: string;
      coTeacher?: string;
      subSubject?: string;
      groupName?: string;
    }>;
  }) => void;
  onCreateJointOrIntercalatedSession: (payload: {
    mode: 'joint_classes' | 'co_teaching_intercalated';
    classIdA: string;
    classIdB?: string;
    day: DayOfWeek;
    period: number;
    subjectA: string;
    teacherA: string;
    subjectB?: string;
    teacherB?: string;
    room: string;
  }) => void;
  onPrintLoadTeachers: () => void;
  onPrintLoadClasses: () => void;
  onPrintLoadSubjects: () => void;
  onExportExcelLoadTeachers?: () => void;
  onExportExcelLoadClasses?: () => void;
  onExportExcelLoadSubjects?: () => void;
}

const CATEGORIES: SchoolCategory[] = [
  'ALL',
  'KG_Maternelle',
  'Primaire',
  'Secondaire',
  'Boys_Section',
  'Girls_Section',
  'French_Section',
  'American_Section',
];

const DAYS: DayOfWeek[] = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi'];

const GROUP_PRESETS = [
  'Classe complète',
  'Classe entière :Classe complète',
  'Groupe 1',
  'Groupe 2',
  'Demi-groupe alterné (G1/G2)',
  'Co-enseignement (2 profs)',
  'Cours commun multi-classes',
];

export const LoadsAndManagementWorkspace: React.FC<
  LoadsAndManagementWorkspaceProps
> = ({
  classes,
  teachers,
  teacherLoadRows,
  classLoadBlocks,
  subjectLoadRows,
  intercalatedSessions,
  bellScheduleGroups,
  selectedCategory,
  onSelectCategory,
  onUpdateSubjectClassLoad,
  onModifyClassLoadItem,
  onModifyTeacherLoadLine,
  onCloneClassLoadToClasses,
  onGlobalReplaceTeacherOrSubject,
  onAutoCompleteAllClassesSchedules,
  onUpdateBellScheduleGroups,
  onAddSubjectToClasses,
  onAddOrUpdateTeacherWithSessions,
  onCreateJointOrIntercalatedSession,
  onPrintLoadTeachers,
  onPrintLoadClasses,
  onPrintLoadSubjects,
  onExportExcelLoadTeachers,
  onExportExcelLoadClasses,
  onExportExcelLoadSubjects,
}) => {
  const [subTab, setSubTab] = useState<
    | 'load_teachers'
    | 'load_classes'
    | 'horaires_groupes'
    | 'load_subjects'
    | 'manager_tools'
    | 'joint_intercalated'
  >('load_teachers');
  const [searchQuery, setSearchQuery] = useState('');

  // Inline editing state for Load Teachers (Image 1 table)
  const [editingTeacherLineKey, setEditingTeacherLineKey] = useState<
    string | null
  >(null);
  const [editTClassIds, setEditTClassIds] = useState<string[]>([]);
  const [editTSubject, setEditTSubject] = useState('');
  const [editTGroup, setEditTGroup] = useState('Classe complète');
  const [editTPeriods, setEditTPeriods] = useState(2);

  // Quick Add Line for a specific Teacher inside Load Teachers
  const [addingLineForTeacher, setAddingLineForTeacher] = useState<
    string | null
  >(null);
  const [addLineClassIds, setAddLineClassIds] = useState<string[]>([]);
  const [addLineSubject, setAddLineSubject] = useState('');
  const [addLineGroup, setAddLineGroup] = useState('Classe complète');
  const [addLinePeriods, setAddLinePeriods] = useState(2);

  // Quick Add Line for a specific Class inside Load Classes (Image 2 table)
  const [addingSubjectForClassId, setAddingSubjectForClassId] = useState<
    string | null
  >(null);
  const [newClassSubjName, setNewClassSubjName] = useState('');
  const [newClassSubjTeacher, setNewClassSubjTeacher] = useState('');
  const [newClassSubjAssistant, setNewClassSubjAssistant] = useState('');
  const [newClassSubjGroup, setNewClassSubjGroup] = useState('Classe complète');
  const [newClassSubjPeriods, setNewClassSubjPeriods] = useState(4);

  // Clone Class Modal / Drawer state
  const [cloningSourceClassId, setCloningSourceClassId] = useState<
    string | null
  >(null);
  const [cloneTargetClassIds, setCloneTargetClassIds] = useState<string[]>([]);
  const [cloneKeepTeachers, setCloneKeepTeachers] = useState(true);

  // Global Replace state (Manager Express Tools)
  const [replaceMode, setReplaceMode] = useState<'teacher' | 'subject'>(
    'teacher'
  );
  const [replaceFrom, setReplaceFrom] = useState('');
  const [replaceTo, setReplaceTo] = useState('');

  // Bell Schedule Group state
  const [selectedBellGroupId, setSelectedBellGroupId] = useState<string>(
    bellScheduleGroups[0]?.id || 'grp_kg_maternelle'
  );
  const [genStartHour, setGenStartHour] = useState(7);
  const [genStartMinute, setGenStartMinute] = useState(50);
  const [genPeriodDuration, setGenPeriodDuration] = useState(45);
  const [genMaxPeriods, setGenMaxPeriods] = useState(8);
  const [genBreak1After, setGenBreak1After] = useState(3);
  const [genBreak1Dur, setGenBreak1Dur] = useState(20);
  const [genBreak2After, setGenBreak2After] = useState(6);
  const [genBreak2Dur, setGenBreak2Dur] = useState(15);

  // Form 1: Add Subject to multiple classes
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjCategory, setNewSubjCategory] =
    useState<SchoolCategory>('French_Section');
  const [newSubjTeacher, setNewSubjTeacher] = useState(
    teachers[0]?.name || 'Hajar'
  );
  const [newSubjPeriods, setNewSubjPeriods] = useState(4);
  const [newSubjClasses, setNewSubjClasses] = useState<string[]>([]);
  const [newSubjIsJoint, setNewSubjIsJoint] = useState(false);
  const [newSubjCoTeacher, setNewSubjCoTeacher] = useState('');
  const [newSubjSubSubject, setNewSubjSubSubject] = useState('');

  // Form 2: Add/Manage Teacher + Sessions
  const [tName, setTName] = useState('');
  const [tPrimarySubject, setTPrimarySubject] = useState('Français');
  const [tSection, setTSection] = useState('French Section');
  const [tMaxWeek, setTMaxWeek] = useState(24);
  const [tMaxDay, setTMaxDay] = useState(6);
  const [tAllocations, setTAllocations] = useState<
    Array<{
      classId: string;
      subject: string;
      periods: number;
      jointWithClassId?: string;
      coTeacher?: string;
      subSubject?: string;
    }>
  >([
    {
      classId: classes[0]?.id || 'ps',
      subject: 'Français',
      periods: 4,
    },
  ]);

  // Form 3: Joint Class / Intercalated Session
  const [jointMode, setJointMode] = useState<
    'joint_classes' | 'co_teaching_intercalated'
  >('joint_classes');
  const [jointClassA, setJointClassA] = useState(classes[0]?.id || 'ps');
  const [jointClassB, setJointClassB] = useState(classes[1]?.id || 'ms');
  const [jointDay, setJointDay] = useState<DayOfWeek>('Dimanche');
  const [jointPeriod, setJointPeriod] = useState(1);
  const [jointSubjectA, setJointSubjectA] = useState('Montessori');
  const [jointTeacherA, setJointTeacherA] = useState('Steffi');
  const [jointSubjectB, setJointSubjectB] = useState('Activité Manuelle');
  const [jointTeacherB, setJointTeacherB] = useState('Hajar');
  const [jointRoom, setJointRoom] = useState('Salle Polyvalente');

  // Distinct subject names across school for dropdowns
  const allSubjectNames = useMemo(() => {
    const set = new Set<string>();
    subjectLoadRows.forEach((s) => set.add(s.subjectName));
    classes.forEach((c) =>
      Object.values(c.slots).forEach((s) => {
        if (s?.subject) set.add(s.subject);
      })
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [subjectLoadRows, classes]);

  const allTeacherNames = useMemo(() => {
    const set = new Set<string>();
    teachers.forEach((t) => set.add(t.name));
    teacherLoadRows.forEach((r) => set.add(r.teacherName));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [teachers, teacherLoadRows]);

  const filteredClassesForPicker = useMemo(() => {
    return classes.filter((c) => classMatchesCategory(c, selectedCategory));
  }, [classes, selectedCategory]);

  const filteredTeacherRows = useMemo(() => {
    return teacherLoadRows.filter((r) => {
      if (r.lineItems.length === 0 && searchQuery.trim() === '') return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.teacherName.toLowerCase().includes(q) ||
        r.subjects.some((s) => s.toLowerCase().includes(q)) ||
        r.classBreakdown.some((c) => c.className.toLowerCase().includes(q)) ||
        r.lineItems.some(
          (li) =>
            li.classesLabel.toLowerCase().includes(q) ||
            li.subject.toLowerCase().includes(q)
        )
      );
    });
  }, [teacherLoadRows, searchQuery]);

  const filteredClassBlocks = useMemo(() => {
    return classLoadBlocks.filter((b) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        b.className.toLowerCase().includes(q) ||
        b.items.some(
          (i) =>
            i.subject.toLowerCase().includes(q) ||
            i.teacher.toLowerCase().includes(q)
        )
      );
    });
  }, [classLoadBlocks, searchQuery]);

  const filteredSubjectRows = useMemo(() => {
    return subjectLoadRows.filter((s) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        s.subjectName.toLowerCase().includes(q) ||
        s.teachersInvolved.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [subjectLoadRows, searchQuery]);

  const activeBellGroup = useMemo(() => {
    return (
      bellScheduleGroups.find((g) => g.id === selectedBellGroupId) ||
      bellScheduleGroups[0]
    );
  }, [bellScheduleGroups, selectedBellGroupId]);

  const startEditingTeacherLine = (
    teacherName: string,
    item: TeacherLoadLineItem
  ) => {
    setEditingTeacherLineKey(`${teacherName}__${item.id}`);
    setEditTClassIds(item.classIds);
    setEditTSubject(item.subject);
    setEditTGroup(item.groupLabel);
    setEditTPeriods(item.periods);
  };

  const saveEditingTeacherLine = (
    teacherName: string,
    oldItem: TeacherLoadLineItem
  ) => {
    if (editTClassIds.length === 0 || !editTSubject.trim()) return;
    onModifyTeacherLoadLine({
      teacherName,
      oldItem,
      newClassIds: editTClassIds,
      newSubject: editTSubject.trim(),
      newGroupLabel: editTGroup.trim() || 'Classe complète',
      newPeriodsPerClass: Math.max(0, editTPeriods),
    });
    setEditingTeacherLineKey(null);
  };

  const toggleClassInList = (
    id: string,
    list: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Category Classification Bar + Print Buttons */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-1">
            Section / Groupe :
          </span>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => onSelectCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {CATEGORY_SHORT_LABELS[cat]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onExportExcelLoadTeachers && (
            <button
              onClick={onExportExcelLoadTeachers}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs cursor-pointer"
              title="Exporter le tableau Load Teachers vers Microsoft Excel avec le même design et les couleurs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-100" />
              Excel Load Teachers
            </button>
          )}
          {onExportExcelLoadClasses && (
            <button
              onClick={onExportExcelLoadClasses}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs cursor-pointer"
              title="Exporter le tableau Load Classes vers Microsoft Excel avec le même design et les couleurs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-100" />
              Excel Load Classes
            </button>
          )}
          <button
            onClick={onPrintLoadTeachers}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-700 text-white hover:bg-sky-800 shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimer Load Teachers
          </button>
          <button
            onClick={onPrintLoadClasses}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-900 text-white hover:bg-indigo-950 shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimer Load Classes
          </button>
          <button
            onClick={onPrintLoadSubjects}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-white hover:bg-slate-900 shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimer Load Subjects
          </button>
        </div>
      </div>

      {/* Navigation Tabs + Quick Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setSubTab('load_teachers')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              subTab === 'load_teachers'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            1. Tableau Load Teachers ({teacherLoadRows.filter((r) => r.lineItems.length > 0).length})
          </button>
          <button
            onClick={() => setSubTab('load_classes')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              subTab === 'load_classes'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            2. Load Classes & Somme Séances ({classLoadBlocks.length})
          </button>
          <button
            onClick={() => setSubTab('horaires_groupes')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              subTab === 'horaires_groupes'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            3. Horaires par Groupe / Section ({bellScheduleGroups.length})
          </button>
          <button
            onClick={() => setSubTab('load_subjects')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              subTab === 'load_subjects'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            4. Load Matières ({subjectLoadRows.length})
          </button>
          <button
            onClick={() => setSubTab('manager_tools')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              subTab === 'manager_tools'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            5. Outils Gérant Express (Cloner / Auto-Compléter)
          </button>
          <button
            onClick={() => setSubTab('joint_intercalated')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              subTab === 'joint_intercalated'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            6. Cours Rassemblés & Intercalés ({intercalatedSessions.length})
          </button>
        </div>

        <div className="relative min-w-[230px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrer prof, classe, matière..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* =====================================================================
          TAB 1: TABLEAU LOAD TEACHERS (EXACT IMAGE 1 FORMAT + EDITABLE)
         ===================================================================== */}
      {subTab === 'load_teachers' && (
        <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-400" />
                Tableau Officiel des Charges Enseignants (Load Teachers — Style aSc Horaires)
              </h3>
              <p className="text-[11px] text-slate-300">
                Affichage groupé par Professeur avec Classes combinées (ex: MS,GS,PS), Groupe, Matière, Nombre par semaine et Somme totale. Cliquez sur une ligne pour modifier les classes, la matière ou le volume horaire.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSubTab('manager_tools')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-500 hover:bg-sky-400 text-white cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                + Nouvel Enseignant / Affectation
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-200 border-b-2 border-slate-900 text-[11px] font-extrabold uppercase tracking-wider text-slate-900">
                  <th className="py-2.5 px-3 border-r border-slate-400 w-52">
                    Professeur
                  </th>
                  <th className="py-2.5 px-3 border-r border-slate-400 w-56">
                    Classe(s)
                  </th>
                  <th className="py-2.5 px-3 border-r border-slate-400 w-56">
                    Groupe
                  </th>
                  <th className="py-2.5 px-3 border-r border-slate-400 text-center">
                    Matière
                  </th>
                  <th className="py-2.5 px-3 border-r border-slate-400 text-center w-44">
                    Nombre par semaine
                  </th>
                  <th className="py-2.5 px-3 text-center w-36">
                    Somme Séances
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTeacherRows.map((row) => {
                  const items: TeacherLoadLineItem[] =
                    row.lineItems.length > 0
                      ? row.lineItems
                      : [
                          {
                            id: 'empty',
                            classesLabel: 'Aucune classe',
                            classIds: [],
                            groupLabel: 'Classe complète',
                            subject: row.subjects[0] || 'Non affecté',
                            periods: 0,
                            isJointOrGrouped: false,
                          },
                        ];
                  const span = items.length;

                  return (
                    <React.Fragment key={row.teacherId}>
                      {/* Thick separator row matching reference screenshot */}
                      <tr className="bg-slate-300/90 h-2 border-y border-slate-500">
                        <td colSpan={6} className="p-0" />
                      </tr>

                      {items.map((item, idx) => {
                        const editKey = `${row.teacherName}__${item.id}`;
                        const isEditing = editingTeacherLineKey === editKey;
                        const subjStyle = getSubjectVisualStyle(item.subject);

                        return (
                          <tr
                            key={item.id}
                            className="border-b border-slate-300 hover:bg-sky-50/40 transition-colors text-xs"
                          >
                            {/* Merged Professeur cell (rowSpan) */}
                            {idx === 0 && (
                              <td
                                rowSpan={span}
                                className="p-3 bg-slate-200/85 border-r-2 border-slate-400 align-middle text-center select-none"
                              >
                                <div className="font-extrabold italic text-sm text-slate-900 tracking-tight">
                                  {row.teacherName}
                                </div>
                                <div className="text-[10px] font-semibold text-slate-600 mt-0.5">
                                  {row.sectionLabel}
                                </div>
                                <div className="mt-2 flex flex-col items-center gap-1">
                                  <button
                                    onClick={() => {
                                      setAddingLineForTeacher(row.teacherName);
                                      setAddLineClassIds([
                                        classes[0]?.id || 'ps',
                                      ]);
                                      setAddLineSubject(
                                        row.subjects[0] ||
                                          allSubjectNames[0] ||
                                          'Français'
                                      );
                                      setAddLineGroup('Classe complète');
                                      setAddLinePeriods(2);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-sky-700 text-white text-[10px] font-bold transition-colors cursor-pointer"
                                    title="Ajouter une matière ou classe à cet enseignant"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Ajouter cours
                                  </button>
                                </div>
                              </td>
                            )}

                            {/* Column 2: Classe(s) */}
                            <td className="py-2 px-3 border-r border-slate-300 font-bold text-slate-900 align-middle">
                              {isEditing ? (
                                <div className="space-y-1.5">
                                  <div className="text-[10px] font-bold text-sky-700 uppercase">
                                    Sélectionner les classes (1 ou plusieurs) :
                                  </div>
                                  <div className="max-h-28 overflow-y-auto grid grid-cols-2 gap-1 p-1.5 bg-slate-50 border border-slate-300 rounded">
                                    {classes.map((cls) => {
                                      const checked = editTClassIds.includes(
                                        cls.id
                                      );
                                      return (
                                        <label
                                          key={cls.id}
                                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                                            checked
                                              ? 'bg-sky-600 text-white'
                                              : 'hover:bg-slate-200 text-slate-700'
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() =>
                                              toggleClassInList(
                                                cls.id,
                                                editTClassIds,
                                                setEditTClassIds
                                              )
                                            }
                                            className="sr-only"
                                          />
                                          <span className="truncate">
                                            {cls.name}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-2 group">
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-xs font-extrabold text-slate-900">
                                      {item.classesLabel}
                                    </span>
                                    {item.isJointOrGrouped && (
                                      <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[9px] font-bold">
                                        Multi-classes
                                      </span>
                                    )}
                                  </div>
                                  {item.id !== 'empty' && (
                                    <button
                                      onClick={() =>
                                        startEditingTeacherLine(
                                          row.teacherName,
                                          item
                                        )
                                      }
                                      className="opacity-70 group-hover:opacity-100 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-sky-100 text-slate-600 hover:text-sky-700 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                      title="Modifier les classes ou la matière"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      Modifier
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Column 3: Groupe */}
                            <td className="py-2 px-3 border-r border-slate-300 text-slate-700 font-medium align-middle">
                              {isEditing ? (
                                <select
                                  value={editTGroup}
                                  onChange={(e) => setEditTGroup(e.target.value)}
                                  className="w-full px-2 py-1 text-xs bg-white border border-sky-400 rounded font-semibold"
                                >
                                  {GROUP_PRESETS.map((g) => (
                                    <option key={g} value={g}>
                                      {g}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span
                                  onClick={() =>
                                    item.id !== 'empty' &&
                                    startEditingTeacherLine(
                                      row.teacherName,
                                      item
                                    )
                                  }
                                  className="cursor-pointer hover:text-sky-700 hover:underline"
                                >
                                  {item.groupLabel}
                                </span>
                              )}
                            </td>

                            {/* Column 4: Matière */}
                            <td className="py-2 px-3 border-r border-slate-300 text-center align-middle">
                              {isEditing ? (
                                <div className="flex flex-col gap-1">
                                  <select
                                    value={editTSubject}
                                    onChange={(e) =>
                                      setEditTSubject(e.target.value)
                                    }
                                    className="w-full px-2 py-1 text-xs bg-white border border-sky-400 rounded font-bold text-slate-900"
                                  >
                                    {allSubjectNames.map((s) => (
                                      <option key={s} value={s}>
                                        {s}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="text"
                                    value={editTSubject}
                                    onChange={(e) =>
                                      setEditTSubject(e.target.value)
                                    }
                                    placeholder="Ou saisir une nouvelle matière..."
                                    className="w-full px-2 py-1 text-[11px] bg-slate-50 border border-slate-300 rounded"
                                  />
                                </div>
                              ) : (
                                <span
                                  onClick={() =>
                                    item.id !== 'empty' &&
                                    startEditingTeacherLine(
                                      row.teacherName,
                                      item
                                    )
                                  }
                                  style={{
                                    backgroundColor: subjStyle.bgHex,
                                    color: subjStyle.textHex,
                                    borderColor: subjStyle.borderHex,
                                  }}
                                  className="inline-block px-2.5 py-0.5 rounded border text-xs font-extrabold cursor-pointer hover:opacity-85 transition-opacity"
                                  title="Cliquer pour changer la matière ou les classes"
                                >
                                  {item.subject}
                                </span>
                              )}
                            </td>

                            {/* Column 5: Nombre par semaine */}
                            <td className="py-2 px-3 border-r border-slate-300 text-center align-middle">
                              {isEditing ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <input
                                    type="number"
                                    min={0}
                                    max={15}
                                    value={editTPeriods}
                                    onChange={(e) =>
                                      setEditTPeriods(
                                        Number(e.target.value) || 0
                                      )
                                    }
                                    className="w-16 px-2 py-1 text-center font-mono font-extrabold text-xs border border-sky-500 rounded"
                                  />
                                  <button
                                    onClick={() =>
                                      saveEditingTeacherLine(
                                        row.teacherName,
                                        item
                                      )
                                    }
                                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold cursor-pointer"
                                  >
                                    OK
                                  </button>
                                  <button
                                    onClick={() =>
                                      setEditingTeacherLineKey(null)
                                    }
                                    className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold cursor-pointer"
                                  >
                                    Annuler
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1.5">
                                  {item.id !== 'empty' && (
                                    <button
                                      onClick={() =>
                                        onModifyTeacherLoadLine({
                                          teacherName: row.teacherName,
                                          oldItem: item,
                                          newClassIds: item.classIds,
                                          newSubject: item.subject,
                                          newGroupLabel: item.groupLabel,
                                          newPeriodsPerClass: Math.max(
                                            0,
                                            item.periods - 1
                                          ),
                                        })
                                      }
                                      className="w-5 h-5 rounded bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 font-bold text-xs flex items-center justify-center cursor-pointer"
                                      title="Réduire d'1 séance"
                                    >
                                      -
                                    </button>
                                  )}
                                  <span className="font-mono font-extrabold text-sm text-slate-900 min-w-[24px] text-center">
                                    {item.periods}
                                  </span>
                                  {item.id !== 'empty' && (
                                    <button
                                      onClick={() =>
                                        onModifyTeacherLoadLine({
                                          teacherName: row.teacherName,
                                          oldItem: item,
                                          newClassIds: item.classIds,
                                          newSubject: item.subject,
                                          newGroupLabel: item.groupLabel,
                                          newPeriodsPerClass: item.periods + 1,
                                        })
                                      }
                                      className="w-5 h-5 rounded bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-700 font-bold text-xs flex items-center justify-center cursor-pointer"
                                      title="Ajouter 1 séance"
                                    >
                                      +
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Column 6: Merged Total / Somme par Enseignant */}
                            {idx === 0 && (
                              <td
                                rowSpan={span}
                                className="p-3 bg-slate-50 border-l-2 border-slate-400 align-middle text-center"
                              >
                                <div className="font-mono font-black text-xl text-slate-900">
                                  {row.totalPeriods}
                                </div>
                                <div className="text-[10px] font-bold text-slate-500">
                                  Max: {row.maxPeriods}p ({row.utilizationPercent}
                                  %)
                                </div>
                                <div className="mt-1">
                                  {row.totalPeriods > row.maxPeriods ? (
                                    <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 text-rose-700">
                                      Surcharge
                                    </span>
                                  ) : row.totalPeriods < 8 ? (
                                    <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700">
                                      Sous-charge
                                    </span>
                                  ) : (
                                    <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700">
                                      Équilibré
                                    </span>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}

                      {/* Inline Quick-Add Course row for this teacher if open */}
                      {addingLineForTeacher === row.teacherName && (
                        <tr className="bg-sky-50 border-b-2 border-sky-300 text-xs">
                          <td colSpan={6} className="p-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="font-bold text-sky-950">
                                + Nouvelle affectation pour{' '}
                                <span className="underline">
                                  {row.teacherName}
                                </span>{' '}
                                :
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  value={addLineClassIds[0] || ''}
                                  onChange={(e) =>
                                    setAddLineClassIds([e.target.value])
                                  }
                                  className="px-2.5 py-1.5 bg-white border border-sky-300 rounded font-bold text-xs"
                                >
                                  {classes.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      Classe : {c.name}
                                    </option>
                                  ))}
                                </select>

                                <select
                                  value={addLineSubject}
                                  onChange={(e) =>
                                    setAddLineSubject(e.target.value)
                                  }
                                  className="px-2.5 py-1.5 bg-white border border-sky-300 rounded font-bold text-xs"
                                >
                                  {allSubjectNames.map((s) => (
                                    <option key={s} value={s}>
                                      Matière : {s}
                                    </option>
                                  ))}
                                </select>

                                <input
                                  type="text"
                                  value={addLineSubject}
                                  onChange={(e) =>
                                    setAddLineSubject(e.target.value)
                                  }
                                  placeholder="Ou saisir matière..."
                                  className="px-2.5 py-1.5 bg-white border border-sky-300 rounded text-xs w-36"
                                />

                                <select
                                  value={addLineGroup}
                                  onChange={(e) =>
                                    setAddLineGroup(e.target.value)
                                  }
                                  className="px-2.5 py-1.5 bg-white border border-sky-300 rounded text-xs"
                                >
                                  {GROUP_PRESETS.map((g) => (
                                    <option key={g} value={g}>
                                      {g}
                                    </option>
                                  ))}
                                </select>

                                <div className="flex items-center gap-1">
                                  <span className="text-[11px] font-bold text-sky-900">
                                    Séances/sem:
                                  </span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={12}
                                    value={addLinePeriods}
                                    onChange={(e) =>
                                      setAddLinePeriods(
                                        Number(e.target.value) || 1
                                      )
                                    }
                                    className="w-14 px-2 py-1 text-center font-mono font-bold bg-white border border-sky-300 rounded"
                                  />
                                </div>

                                <button
                                  onClick={() => {
                                    if (
                                      addLineClassIds.length > 0 &&
                                      addLineSubject.trim()
                                    ) {
                                      onUpdateSubjectClassLoad(
                                        addLineClassIds[0],
                                        addLineSubject.trim(),
                                        row.teacherName,
                                        addLinePeriods,
                                        addLineGroup
                                      );
                                      setAddingLineForTeacher(null);
                                    }
                                  }}
                                  className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs cursor-pointer"
                                >
                                  Ajouter au Load
                                </button>
                                <button
                                  onClick={() => setAddingLineForTeacher(null)}
                                  className="px-2.5 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
                                >
                                  Fermer
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: TABLEAU LOAD CLASSES & SOMME DES SÉANCES (EXACT IMAGE 2 FORMAT)
         ===================================================================== */}
      {subTab === 'load_classes' && (
        <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-indigo-950 text-white flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-300" />
                Tableau des Charges par Classe (Load Classes — Matières, Enseignants & Somme des Séances)
              </h3>
              <p className="text-[11px] text-indigo-200">
                Pour chaque classe : liste des matières suivie de l'enseignant responsable, du groupe et du nombre de séances hebdomadaires, avec la somme totale des séances de la classe et modification directe.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onAutoCompleteAllClassesSchedules(selectedCategory)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Compléter automatiquement les séances manquantes
              </button>
              <button
                onClick={onPrintLoadClasses}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/15 hover:bg-white/25 text-white cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimer Load Classes
              </button>
            </div>
          </div>

          {/* Clone Class Load Drawer if active */}
          {cloningSourceClassId && (
            <div className="p-4 bg-indigo-50 border-b-2 border-indigo-300 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5">
                  <Copy className="w-4 h-4 text-indigo-600" />
                  Dupliquer le programme (matières & volumes horaires) de la classe{' '}
                  <span className="px-2 py-0.5 rounded bg-indigo-600 text-white">
                    {classes.find((c) => c.id === cloningSourceClassId)?.name}
                  </span>{' '}
                  vers d'autres classes :
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {classes
                    .filter((c) => c.id !== cloningSourceClassId)
                    .map((c) => {
                      const sel = cloneTargetClassIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            toggleClassInList(
                              c.id,
                              cloneTargetClassIds,
                              setCloneTargetClassIds
                            )
                          }
                          className={`px-2 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                            sel
                              ? 'bg-indigo-600 text-white border-indigo-700'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cloneKeepTeachers}
                    onChange={(e) => setCloneKeepTeachers(e.target.checked)}
                    className="rounded border-indigo-400"
                  />
                  Conserver les mêmes enseignants
                </label>
                <button
                  onClick={() => {
                    if (cloneTargetClassIds.length > 0) {
                      onCloneClassLoadToClasses(
                        cloningSourceClassId,
                        cloneTargetClassIds,
                        cloneKeepTeachers
                      );
                      setCloningSourceClassId(null);
                      setCloneTargetClassIds([]);
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                >
                  Appliquer aux {cloneTargetClassIds.length} classe(s)
                </button>
                <button
                  onClick={() => {
                    setCloningSourceClassId(null);
                    setCloneTargetClassIds([]);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-200 border-b-2 border-slate-900 text-[11px] font-extrabold uppercase tracking-wider text-slate-900">
                  <th className="py-2.5 px-3 border-r border-slate-400 w-48">
                    Classe
                  </th>
                  <th className="py-2.5 px-3 border-r border-slate-400 w-60">
                    Matière
                  </th>
                  <th className="py-2.5 px-3 border-r border-slate-400 w-72">
                    Professeur Principal &amp; Assistant(e)
                  </th>
                  <th className="py-2.5 px-3 border-r border-slate-400 w-52">
                    Groupe / Mode
                  </th>
                  <th className="py-2.5 px-3 border-r border-slate-400 text-center w-44">
                    Nombre par semaine
                  </th>
                  <th className="py-2.5 px-3 text-center w-44">
                    Somme des séances
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredClassBlocks.map((block) => {
                  const items =
                    block.items.length > 0
                      ? block.items
                      : [
                          {
                            id: 'empty_cls',
                            subject: 'Aucune matière',
                            teacher: 'Non affecté',
                            assistantTeacher: undefined as string | undefined,
                            groupLabel: 'Classe complète',
                            periods: 0,
                            isIntercalated: false,
                            isJointClass: false,
                          },
                        ];
                  const span = items.length;
                  const diff = block.totalPeriods - block.targetWeeklyCapacity;

                  return (
                    <React.Fragment key={block.classId}>
                      {/* Thick block separator matching Image 2 */}
                      <tr className="bg-slate-300/90 h-2.5 border-y border-slate-500">
                        <td colSpan={6} className="p-0" />
                      </tr>

                      {items.map((item, idx) => {
                        const subjStyle = getSubjectVisualStyle(item.subject);
                        return (
                          <tr
                            key={item.id}
                            className="border-b border-slate-300 hover:bg-indigo-50/30 transition-colors text-xs"
                          >
                            {/* Column 1: Merged Classe cell */}
                            {idx === 0 && (
                              <td
                                rowSpan={span}
                                className="p-3 bg-slate-200/85 border-r-2 border-slate-400 align-middle text-center"
                              >
                                <div className="font-extrabold italic text-base text-slate-900">
                                  {block.className}
                                </div>
                                <div className="text-[10px] font-bold text-slate-600 mt-0.5">
                                  {block.categoryLabel} · {block.room}
                                </div>
                                <div className="mt-2.5 flex flex-col items-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      setAddingSubjectForClassId(block.classId);
                                      setNewClassSubjName(
                                        allSubjectNames[0] || 'Français'
                                      );
                                      setNewClassSubjTeacher(
                                        allTeacherNames[0] || 'Hajar'
                                      );
                                      setNewClassSubjGroup('Classe complète');
                                      setNewClassSubjPeriods(4);
                                    }}
                                    className="w-full inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-indigo-700 text-white text-[10px] font-bold cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" />
                                    + Ajouter matière
                                  </button>
                                  <button
                                    onClick={() => {
                                      setCloningSourceClassId(block.classId);
                                      setCloneTargetClassIds([]);
                                    }}
                                    className="w-full inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-white hover:bg-indigo-50 text-slate-700 border border-slate-300 text-[10px] font-bold cursor-pointer"
                                    title="Copier toutes les matières de cette classe vers d'autres classes"
                                  >
                                    <Copy className="w-3 h-3" />
                                    Cloner classe
                                  </button>
                                </div>
                              </td>
                            )}

                            {/* Column 2: Matière (Editable inline) */}
                            <td className="py-1.5 px-3 border-r border-slate-300 align-middle">
                              {item.id === 'empty_cls' ? (
                                <span className="text-slate-400 italic">
                                  Aucune matière
                                </span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-3 h-3 rounded-xs shrink-0 border"
                                    style={{
                                      backgroundColor: subjStyle.bgHex,
                                      borderColor: subjStyle.borderHex,
                                    }}
                                  />
                                  <select
                                    value={item.subject}
                                    onChange={(e) =>
                                      onModifyClassLoadItem({
                                        classId: block.classId,
                                        oldSubject: item.subject,
                                        oldTeacher: item.teacher,
                                        newSubject: e.target.value,
                                        newTeacher: item.teacher,
                                        newPeriods: item.periods,
                                        newGroupLabel: item.groupLabel,
                                      })
                                    }
                                    className="w-full bg-transparent font-extrabold text-slate-900 hover:bg-white focus:bg-white px-1.5 py-1 rounded border border-transparent hover:border-slate-300 focus:border-indigo-500 text-xs cursor-pointer"
                                  >
                                    {allSubjectNames.map((s) => (
                                      <option key={s} value={s}>
                                        {s}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </td>

                            {/* Column 3: Professeur / Enseignant + Assistant(e) (Editable inline) */}
                            <td className="py-1.5 px-3 border-r border-slate-300 align-middle">
                              {item.id === 'empty_cls' ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <div className="space-y-1">
                                  <select
                                    value={item.teacher}
                                    onChange={(e) =>
                                      onModifyClassLoadItem({
                                        classId: block.classId,
                                        oldSubject: item.subject,
                                        oldTeacher: item.teacher,
                                        newSubject: item.subject,
                                        newTeacher: e.target.value,
                                        newPeriods: item.periods,
                                        newGroupLabel: item.groupLabel,
                                        newAssistantTeacher:
                                          item.assistantTeacher,
                                      })
                                    }
                                    className="w-full bg-transparent font-bold text-slate-800 hover:bg-white focus:bg-white px-1.5 py-0.5 rounded border border-transparent hover:border-slate-300 focus:border-indigo-500 text-xs cursor-pointer"
                                  >
                                    {allTeacherNames.map((t) => (
                                      <option key={t} value={t}>
                                        Prof : {t}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[9px] font-extrabold uppercase text-fuchsia-700 bg-fuchsia-50 px-1.5 py-0.5 rounded border border-fuchsia-200 shrink-0">
                                      + Ass.
                                    </span>
                                    <select
                                      value={item.assistantTeacher || ''}
                                      onChange={(e) =>
                                        onModifyClassLoadItem({
                                          classId: block.classId,
                                          oldSubject: item.subject,
                                          oldTeacher: item.teacher,
                                          newSubject: item.subject,
                                          newTeacher: item.teacher,
                                          newPeriods: item.periods,
                                          newGroupLabel:
                                            e.target.value &&
                                            item.groupLabel ===
                                              'Classe complète'
                                              ? `Avec Ass. ${e.target.value}`
                                              : item.groupLabel,
                                          newAssistantTeacher: e.target.value,
                                        })
                                      }
                                      className={`w-full px-1.5 py-0.5 rounded border text-[10px] font-bold cursor-pointer ${
                                        item.assistantTeacher
                                          ? 'bg-fuchsia-100/80 text-fuchsia-900 border-fuchsia-300'
                                          : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'
                                      }`}
                                    >
                                      <option value="">
                                        — Aucun assistant(e) —
                                      </option>
                                      {allTeacherNames
                                        .filter((t) => t !== item.teacher)
                                        .map((t) => (
                                          <option key={t} value={t}>
                                            + Ass. {t}
                                          </option>
                                        ))}
                                    </select>
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Column 4: Groupe / Mode (Editable inline) */}
                            <td className="py-1.5 px-3 border-r border-slate-300 align-middle">
                              {item.id === 'empty_cls' ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <select
                                  value={item.groupLabel}
                                  onChange={(e) =>
                                    onModifyClassLoadItem({
                                      classId: block.classId,
                                      oldSubject: item.subject,
                                      oldTeacher: item.teacher,
                                      newSubject: item.subject,
                                      newTeacher: item.teacher,
                                      newPeriods: item.periods,
                                      newGroupLabel: e.target.value,
                                    })
                                  }
                                  className="w-full bg-transparent text-slate-600 font-medium hover:bg-white focus:bg-white px-1.5 py-1 rounded border border-transparent hover:border-slate-300 text-xs cursor-pointer"
                                >
                                  {GROUP_PRESETS.map((g) => (
                                    <option key={g} value={g}>
                                      {g}
                                    </option>
                                  ))}
                                  {!GROUP_PRESETS.includes(item.groupLabel) && (
                                    <option value={item.groupLabel}>
                                      {item.groupLabel}
                                    </option>
                                  )}
                                </select>
                              )}
                            </td>

                            {/* Column 5: Nombre par semaine (Stepper + Delete) */}
                            <td className="py-1.5 px-3 border-r border-slate-300 text-center align-middle">
                              {item.id !== 'empty_cls' && (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    onClick={() =>
                                      onModifyClassLoadItem({
                                        classId: block.classId,
                                        oldSubject: item.subject,
                                        oldTeacher: item.teacher,
                                        newSubject: item.subject,
                                        newTeacher: item.teacher,
                                        newPeriods: Math.max(
                                          0,
                                          item.periods - 1
                                        ),
                                        newGroupLabel: item.groupLabel,
                                      })
                                    }
                                    className="w-5 h-5 rounded bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 font-bold text-xs flex items-center justify-center cursor-pointer"
                                    title="Retirer 1 séance"
                                  >
                                    -
                                  </button>
                                  <span className="font-mono font-extrabold text-sm text-slate-900 min-w-[24px] text-center">
                                    {item.periods}
                                  </span>
                                  <button
                                    onClick={() =>
                                      onModifyClassLoadItem({
                                        classId: block.classId,
                                        oldSubject: item.subject,
                                        oldTeacher: item.teacher,
                                        newSubject: item.subject,
                                        newTeacher: item.teacher,
                                        newPeriods: item.periods + 1,
                                        newGroupLabel: item.groupLabel,
                                      })
                                    }
                                    className="w-5 h-5 rounded bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-700 font-bold text-xs flex items-center justify-center cursor-pointer"
                                    title="Ajouter 1 séance"
                                  >
                                    +
                                  </button>
                                  <button
                                    onClick={() =>
                                      onModifyClassLoadItem({
                                        classId: block.classId,
                                        oldSubject: item.subject,
                                        oldTeacher: item.teacher,
                                        newSubject: item.subject,
                                        newTeacher: item.teacher,
                                        newPeriods: 0,
                                        newGroupLabel: item.groupLabel,
                                      })
                                    }
                                    className="ml-1 p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                    title="Supprimer cette matière de la classe"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>

                            {/* Column 6: Merged Somme des séances pour chaque classe */}
                            {idx === 0 && (
                              <td
                                rowSpan={span}
                                className="p-3 bg-slate-50 border-l-2 border-slate-400 align-middle text-center"
                              >
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  Somme Classe
                                </div>
                                <div className="font-mono font-black text-2xl text-slate-900 my-0.5">
                                  {block.totalPeriods}
                                </div>
                                <div className="text-[10px] font-bold text-slate-500">
                                  Cible : {block.targetWeeklyCapacity} séances
                                </div>
                                <div className="mt-1.5">
                                  {diff === 0 ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800">
                                      <CheckCircle2 className="w-2.5 h-2.5" />
                                      Complet ({block.totalPeriods}p)
                                    </span>
                                  ) : diff < 0 ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800">
                                      Reste {Math.abs(diff)}p à placer
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 text-rose-800">
                                      +{diff}p (Crén. doublés)
                                    </span>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}

                      {/* Inline Quick-Add Subject Row for this Class */}
                      {addingSubjectForClassId === block.classId && (
                        <tr className="bg-indigo-50 border-b-2 border-indigo-300 text-xs">
                          <td colSpan={6} className="p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="font-extrabold text-indigo-950">
                                + Ajouter une matière dans la classe{' '}
                                <span className="underline">
                                  {block.className}
                                </span>{' '}
                                :
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  value={newClassSubjName}
                                  onChange={(e) =>
                                    setNewClassSubjName(e.target.value)
                                  }
                                  className="px-2.5 py-1.5 bg-white border border-indigo-300 rounded font-bold text-xs"
                                >
                                  {allSubjectNames.map((s) => (
                                    <option key={s} value={s}>
                                      Matière : {s}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  value={newClassSubjName}
                                  onChange={(e) =>
                                    setNewClassSubjName(e.target.value)
                                  }
                                  placeholder="Ou nouvelle matière..."
                                  className="px-2.5 py-1.5 bg-white border border-indigo-300 rounded text-xs w-36"
                                />
                                <select
                                  value={newClassSubjTeacher}
                                  onChange={(e) =>
                                    setNewClassSubjTeacher(e.target.value)
                                  }
                                  className="px-2.5 py-1.5 bg-white border border-indigo-300 rounded font-bold text-xs"
                                >
                                  {allTeacherNames.map((t) => (
                                    <option key={t} value={t}>
                                      Prof : {t}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={newClassSubjAssistant}
                                  onChange={(e) =>
                                    setNewClassSubjAssistant(e.target.value)
                                  }
                                  className="px-2.5 py-1.5 bg-fuchsia-50 border border-fuchsia-300 text-fuchsia-900 rounded font-bold text-xs"
                                >
                                  <option value="">
                                    + Assistant(e) : Aucun
                                  </option>
                                  {allTeacherNames
                                    .filter((t) => t !== newClassSubjTeacher)
                                    .map((t) => (
                                      <option key={t} value={t}>
                                        + Ass. {t}
                                      </option>
                                    ))}
                                </select>
                                <select
                                  value={newClassSubjGroup}
                                  onChange={(e) =>
                                    setNewClassSubjGroup(e.target.value)
                                  }
                                  className="px-2.5 py-1.5 bg-white border border-indigo-300 rounded text-xs"
                                >
                                  {GROUP_PRESETS.map((g) => (
                                    <option key={g} value={g}>
                                      {g}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  min={1}
                                  max={12}
                                  value={newClassSubjPeriods}
                                  onChange={(e) =>
                                    setNewClassSubjPeriods(
                                      Number(e.target.value) || 1
                                    )
                                  }
                                  className="w-16 px-2 py-1.5 text-center font-mono font-bold bg-white border border-indigo-300 rounded"
                                />
                                <button
                                  onClick={() => {
                                    if (
                                      newClassSubjName.trim() &&
                                      newClassSubjTeacher.trim()
                                    ) {
                                      onUpdateSubjectClassLoad(
                                        block.classId,
                                        newClassSubjName.trim(),
                                        newClassSubjTeacher.trim(),
                                        newClassSubjPeriods,
                                        newClassSubjGroup,
                                        newClassSubjAssistant.trim() || undefined
                                      );
                                      setAddingSubjectForClassId(null);
                                      setNewClassSubjAssistant('');
                                    }
                                  }}
                                  className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer"
                                >
                                  Ajouter
                                </button>
                                <button
                                  onClick={() =>
                                    setAddingSubjectForClassId(null)
                                  }
                                  className="px-2.5 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
                                >
                                  Fermer
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: HORAIRES PAR GROUPE DE CLASSES OU SECTION
         ===================================================================== */}
      {subTab === 'horaires_groupes' && activeBellGroup && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left column: List of Class Timing Groups / Sections */}
          <div className="lg:col-span-4 space-y-2.5">
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Groupes d'Horaires par Section / Niveau
                </h3>
                <button
                  onClick={() => {
                    const newId = `grp_custom_${Date.now()}`;
                    const newGrp: BellScheduleGroup = {
                      id: newId,
                      name: `Nouveau Groupe Horaire #${
                        bellScheduleGroups.length + 1
                      }`,
                      category:
                        selectedCategory === 'ALL'
                          ? 'French_Section'
                          : selectedCategory,
                      sectionKey: 'Primary',
                      description:
                        'Groupe personnalisé de classes partageant la même sonnerie et les mêmes pauses.',
                      classNames: [],
                      maxPeriodsPerDay: 8,
                      rows: [...activeBellGroup.rows],
                    };
                    onUpdateBellScheduleGroups([...bellScheduleGroups, newGrp]);
                    setSelectedBellGroupId(newId);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold cursor-pointer"
                >
                  + Nouveau Groupe
                </button>
              </div>

              <div className="space-y-2">
                {bellScheduleGroups.map((grp) => {
                  const isSel = grp.id === activeBellGroup.id;
                  return (
                    <div
                      key={grp.id}
                      onClick={() => setSelectedBellGroupId(grp.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        isSel
                          ? 'bg-amber-50/90 border-amber-500 shadow-xs'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-xs text-slate-900">
                          {grp.name}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900">
                          {grp.maxPeriodsPerDay} p/jour
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {grp.description}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {grp.classNames.map((cn) => (
                          <span
                            key={cn}
                            className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-bold text-slate-700"
                          >
                            {cn}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right column: Bell Schedule Editor + Class Group Assignment */}
          <div className="lg:col-span-8 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex-1">
                  <input
                    type="text"
                    value={activeBellGroup.name}
                    onChange={(e) => {
                      const updated = bellScheduleGroups.map((g) =>
                        g.id === activeBellGroup.id
                          ? { ...g, name: e.target.value }
                          : g
                      );
                      onUpdateBellScheduleGroups(updated);
                    }}
                    className="text-base font-extrabold text-slate-900 bg-transparent border-b border-dashed border-slate-300 focus:border-amber-600 focus:outline-none w-full"
                  />
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configurez les horaires de début/fin de chaque période, les récréations et les classes rattachées à ce groupe.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-lg bg-amber-100 text-amber-900 text-xs font-extrabold">
                  {activeBellGroup.classNames.length} classes rattachées
                </span>
              </div>

              {/* Automatic Bell Schedule Calculator */}
              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3">
                <div className="text-xs font-extrabold text-amber-950 flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-amber-700" />
                  Calculateur Automatique de Grille Horaire pour ce Groupe de Classes
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                      Début 1ère période
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={6}
                        max={12}
                        value={genStartHour}
                        onChange={(e) =>
                          setGenStartHour(Number(e.target.value) || 7)
                        }
                        className="w-14 px-2 py-1 bg-white border border-amber-300 rounded font-mono font-bold text-center"
                      />
                      <span>h</span>
                      <input
                        type="number"
                        min={0}
                        max={55}
                        step={5}
                        value={genStartMinute}
                        onChange={(e) =>
                          setGenStartMinute(Number(e.target.value) || 0)
                        }
                        className="w-14 px-2 py-1 bg-white border border-amber-300 rounded font-mono font-bold text-center"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                      Durée Séance (min)
                    </label>
                    <select
                      value={genPeriodDuration}
                      onChange={(e) =>
                        setGenPeriodDuration(Number(e.target.value))
                      }
                      className="w-full px-2 py-1 bg-white border border-amber-300 rounded font-bold"
                    >
                      {[30, 35, 40, 45, 50, 55, 60].map((m) => (
                        <option key={m} value={m}>
                          {m} minutes
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                      Nb Périodes / Jour
                    </label>
                    <select
                      value={genMaxPeriods}
                      onChange={(e) => setGenMaxPeriods(Number(e.target.value))}
                      className="w-full px-2 py-1 bg-white border border-amber-300 rounded font-bold"
                    >
                      {[5, 6, 7, 8, 9].map((p) => (
                        <option key={p} value={p}>
                          {p} périodes / jour ({p * 5}/sem)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                      1ère Pause & 2ème Pause
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={5}
                        max={45}
                        step={5}
                        value={genBreak1Dur}
                        onChange={(e) =>
                          setGenBreak1Dur(Number(e.target.value) || 15)
                        }
                        className="w-14 px-1.5 py-1 bg-white border border-amber-300 rounded font-mono text-center"
                        title="Durée 1ère pause (min)"
                      />
                      <span className="text-[10px]">min /</span>
                      <input
                        type="number"
                        min={0}
                        max={45}
                        step={5}
                        value={genBreak2Dur}
                        onChange={(e) =>
                          setGenBreak2Dur(Number(e.target.value) || 15)
                        }
                        className="w-14 px-1.5 py-1 bg-white border border-amber-300 rounded font-mono text-center"
                        title="Durée 2ème pause (min)"
                      />
                      <span className="text-[10px]">min</span>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      const newRows = recalculateBellScheduleRows({
                        startHour: genStartHour,
                        startMinute: genStartMinute,
                        periodDurationMinutes: genPeriodDuration,
                        maxPeriods: genMaxPeriods,
                        break1AfterPeriod: genBreak1After,
                        break1DurationMinutes: genBreak1Dur,
                        break2AfterPeriod: genBreak2After,
                        break2DurationMinutes: genBreak2Dur,
                      });
                      const updated = bellScheduleGroups.map((g) =>
                        g.id === activeBellGroup.id
                          ? {
                              ...g,
                              maxPeriodsPerDay: genMaxPeriods,
                              rows: newRows,
                            }
                          : g
                      );
                      onUpdateBellScheduleGroups(updated);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer shadow-xs"
                  >
                    Générer / Recalculer les Horaires de ce Groupe
                  </button>
                </div>
              </div>

              {/* Classes assigned to this timing group */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Classes rattachées à ce groupe d'horaires (cliquez pour activer/désactiver) :
                </label>
                <div className="flex flex-wrap gap-1.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  {classes.map((cls) => {
                    const assigned = activeBellGroup.classNames.includes(
                      cls.name
                    );
                    return (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => {
                          const updated = bellScheduleGroups.map((g) => {
                            if (g.id === activeBellGroup.id) {
                              const exists = g.classNames.includes(cls.name);
                              return {
                                ...g,
                                classNames: exists
                                  ? g.classNames.filter((n) => n !== cls.name)
                                  : [...g.classNames, cls.name],
                              };
                            }
                            // Remove from other groups if we assign it here
                            if (!assigned) {
                              return {
                                ...g,
                                classNames: g.classNames.filter(
                                  (n) => n !== cls.name
                                ),
                              };
                            }
                            return g;
                          });
                          onUpdateBellScheduleGroups(updated);
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold border transition-all cursor-pointer ${
                          assigned
                            ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {cls.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Editable Bell Rows Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-600">
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3">Libellé de la Période / Pause</th>
                      <th className="py-2 px-3">Créneau Horaire (Début - Fin)</th>
                      <th className="py-2 px-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {activeBellGroup.rows.map((r, rIdx) => (
                      <tr
                        key={rIdx}
                        className={
                          r.type === 'break' ? 'bg-amber-50/70' : 'bg-white'
                        }
                      >
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              r.type === 'break'
                                ? 'bg-amber-200 text-amber-900'
                                : 'bg-sky-100 text-sky-800'
                            }`}
                          >
                            {r.type === 'break'
                              ? 'PAUSE / RÉCRÉ'
                              : `PÉRIODE ${r.periodNumber || ''}`}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={r.label}
                            onChange={(e) => {
                              const newRows: BellRow[] =
                                activeBellGroup.rows.map((row, idx) =>
                                  idx === rIdx
                                    ? { ...row, label: e.target.value }
                                    : row
                                );
                              onUpdateBellScheduleGroups(
                                bellScheduleGroups.map((g) =>
                                  g.id === activeBellGroup.id
                                    ? { ...g, rows: newRows }
                                    : g
                                )
                              );
                            }}
                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-bold text-slate-800"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={r.time}
                            onChange={(e) => {
                              const newRows: BellRow[] =
                                activeBellGroup.rows.map((row, idx) =>
                                  idx === rIdx
                                    ? { ...row, time: e.target.value }
                                    : row
                                );
                              onUpdateBellScheduleGroups(
                                bellScheduleGroups.map((g) =>
                                  g.id === activeBellGroup.id
                                    ? { ...g, rows: newRows }
                                    : g
                                )
                              );
                            }}
                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono font-bold text-slate-900"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            onClick={() => {
                              const newRows = activeBellGroup.rows.filter(
                                (_, idx) => idx !== rIdx
                              );
                              onUpdateBellScheduleGroups(
                                bellScheduleGroups.map((g) =>
                                  g.id === activeBellGroup.id
                                    ? { ...g, rows: newRows }
                                    : g
                                )
                              );
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                            title="Supprimer cette ligne horaire"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: LOAD MATIÈRES (SUBJECTS LOAD MATRIX)
         ===================================================================== */}
      {subTab === 'load_subjects' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold">
                Matrice Globale des Charges Matières (Load Subjects) —{' '}
                {CATEGORY_LABELS[selectedCategory]}
              </h3>
              <p className="text-[11px] text-slate-300">
                Ajustez directement avec (-) / (+) le nombre de séances hebdomadaires de chaque matière dans chaque classe.
              </p>
            </div>
            <button
              onClick={onPrintLoadSubjects}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimer Load Subjects
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                  <th className="py-2.5 px-3">Matière</th>
                  <th className="py-2.5 px-3">Catégorie</th>
                  <th className="py-2.5 px-3 text-center">Classes</th>
                  <th className="py-2.5 px-3 text-center">Total École</th>
                  <th className="py-2.5 px-3">
                    Ajustement Direct du Load par Classe (- / + séances)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredSubjectRows.map((s) => {
                  const st = getSubjectVisualStyle(s.subjectName);
                  return (
                    <tr key={s.subjectName} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-sm shrink-0 border"
                            style={{
                              backgroundColor: st.bgHex,
                              borderColor: st.borderHex,
                            }}
                          />
                          <span>{s.subjectName}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                          {CATEGORY_SHORT_LABELS[s.category]}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold">
                        {s.classesCount}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2.5 py-1 rounded-md font-mono font-extrabold bg-sky-50 text-sky-800 border border-sky-200">
                          {s.totalPeriodsAcrossSchool} p/sem
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1.5">
                          {s.classAllocations.map((alloc) => {
                            const primaryTeacher =
                              alloc.teachers[0] || 'Enseignant';
                            return (
                              <div
                                key={alloc.classId}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px]"
                              >
                                <span className="font-bold text-slate-800">
                                  {alloc.className}
                                </span>
                                <span className="text-slate-400">
                                  ({primaryTeacher})
                                </span>
                                <div className="inline-flex items-center gap-1 ml-1 bg-white px-1 rounded border border-slate-200">
                                  <button
                                    onClick={() =>
                                      onUpdateSubjectClassLoad(
                                        alloc.classId,
                                        s.subjectName,
                                        primaryTeacher,
                                        Math.max(0, alloc.scheduledPeriods - 1)
                                      )
                                    }
                                    className="text-slate-500 hover:text-rose-600 font-bold px-1 cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <span className="font-mono font-extrabold text-sky-700 min-w-[18px] text-center">
                                    {alloc.scheduledPeriods}p
                                  </span>
                                  <button
                                    onClick={() =>
                                      onUpdateSubjectClassLoad(
                                        alloc.classId,
                                        s.subjectName,
                                        primaryTeacher,
                                        alloc.scheduledPeriods + 1
                                      )
                                    }
                                    className="text-slate-500 hover:text-emerald-600 font-bold px-1 cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            );
                          })}
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
          TAB 5: OUTILS GÉRANT EXPRESS (PRÉPARATION ULTRA-RAPIDE DES EMPLOIS)
         ===================================================================== */}
      {subTab === 'manager_tools' && (
        <div className="space-y-4">
          {/* Row 1: Fast Automation Cards for the School Manager */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Card 1: Auto-Complete & Repair Timetables */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  <Sparkles className="w-3 h-3" /> Auto-Génération & Équilibrage
                </span>
                <h4 className="text-sm font-extrabold text-slate-900">
                  Compléter & Optimiser tous les Emplois du Temps
                </h4>
                <p className="text-xs text-slate-500">
                  Analyse chaque classe de la section sélectionnée ({CATEGORY_SHORT_LABELS[selectedCategory]}), complète les créneaux vides jusqu'à la somme cible (30p, 35p ou 40p) et évite les conflits d'enseignants.
                </p>
              </div>
              <button
                onClick={() => onAutoCompleteAllClassesSchedules(selectedCategory)}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer flex items-center justify-center gap-2"
              >
                <Wand2 className="w-4 h-4" />
                Lancer l'Auto-Complétion ({CATEGORY_SHORT_LABELS[selectedCategory]})
              </button>
            </div>

            {/* Card 2: Global Teacher / Subject Replacement */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-800">
                  <ArrowRightLeft className="w-3 h-3" /> Remplacement Global Express
                </span>
                <h4 className="text-sm font-extrabold text-slate-900">
                  Remplacer un Enseignant ou une Matière partout
                </h4>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setReplaceMode('teacher');
                      setReplaceFrom(allTeacherNames[0] || '');
                      setReplaceTo(allTeacherNames[1] || '');
                    }}
                    className={`flex-1 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                      replaceMode === 'teacher'
                        ? 'bg-violet-600 text-white border-violet-700'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    Remplacer Professeur
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReplaceMode('subject');
                      setReplaceFrom(allSubjectNames[0] || '');
                      setReplaceTo(allSubjectNames[1] || '');
                    }}
                    className={`flex-1 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                      replaceMode === 'subject'
                        ? 'bg-violet-600 text-white border-violet-700'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    Renommer Matière
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500">
                      Actuel :
                    </label>
                    <select
                      value={replaceFrom}
                      onChange={(e) => setReplaceFrom(e.target.value)}
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded font-semibold"
                    >
                      <option value="">Choisir...</option>
                      {(replaceMode === 'teacher'
                        ? allTeacherNames
                        : allSubjectNames
                      ).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500">
                      Nouveau :
                    </label>
                    <input
                      type="text"
                      value={replaceTo}
                      onChange={(e) => setReplaceTo(e.target.value)}
                      placeholder="Nouveau nom..."
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded font-semibold"
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  if (replaceFrom.trim() && replaceTo.trim()) {
                    onGlobalReplaceTeacherOrSubject({
                      mode: replaceMode,
                      fromValue: replaceFrom.trim(),
                      toValue: replaceTo.trim(),
                      categoryFilter: selectedCategory,
                    });
                  }
                }}
                className="w-full py-2 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs cursor-pointer"
              >
                Appliquer le Remplacement Global
              </button>
            </div>

            {/* Card 3: Add Subject to 1 or Multiple Classes */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">
                  <BookOpen className="w-3 h-3" /> Affectation Multi-Classes
                </span>
                <h4 className="text-sm font-extrabold text-slate-900">
                  Affecter une Matière à plusieurs Classes d'un coup
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <input
                    type="text"
                    value={newSubjName}
                    onChange={(e) => setNewSubjName(e.target.value)}
                    placeholder="Nom matière (ex: Robotique)"
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded font-semibold"
                  />
                  <select
                    value={newSubjTeacher}
                    onChange={(e) => setNewSubjTeacher(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded font-semibold"
                  >
                    {allTeacherNames.map((t) => (
                      <option key={t} value={t}>
                        Prof : {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[11px] font-semibold text-slate-600">
                    Séances/semaine :
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={newSubjPeriods}
                    onChange={(e) =>
                      setNewSubjPeriods(Number(e.target.value) || 1)
                    }
                    className="w-16 px-2 py-1 text-center font-mono font-bold bg-slate-50 border border-slate-200 rounded"
                  />
                  <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newSubjIsJoint}
                      onChange={(e) => setNewSubjIsJoint(e.target.checked)}
                    />
                    Cours commun
                  </label>
                </div>
                <div className="max-h-24 overflow-y-auto flex flex-wrap gap-1 p-1.5 bg-slate-50 rounded border border-slate-200">
                  {filteredClassesForPicker.map((c) => {
                    const sel = newSubjClasses.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          toggleClassInList(
                            c.id,
                            newSubjClasses,
                            setNewSubjClasses
                          )
                        }
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          sel
                            ? 'bg-sky-600 text-white'
                            : 'bg-white text-slate-700 border border-slate-200'
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                onClick={() => {
                  if (newSubjName.trim() && newSubjClasses.length > 0) {
                    onAddSubjectToClasses({
                      subjectName: newSubjName.trim(),
                      category: newSubjCategory,
                      teacherName: newSubjTeacher,
                      weeklyPeriods: newSubjPeriods,
                      classIds: newSubjClasses,
                      isJointCourse: newSubjIsJoint,
                      coTeacherName: newSubjCoTeacher || undefined,
                      subSubjectName: newSubjSubSubject || undefined,
                    });
                    setNewSubjName('');
                    setNewSubjClasses([]);
                  }
                }}
                className="w-full py-2 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs cursor-pointer"
              >
                Ajouter aux {newSubjClasses.length} classe(s)
              </button>
            </div>
          </div>

          {/* Row 2: Full Teacher Creator & Multi-Class Session Allocator */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-sky-600" />
                  Ajouter / Configurer un Enseignant(e) et Distribuer toutes ses Séances
                </h3>
                <p className="text-xs text-slate-500">
                  Créez un profil enseignant ou sélectionnez un enseignant existant pour lui affecter plusieurs classes et matières simultanément.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nom de l'enseignant(e) *
                </label>
                <input
                  type="text"
                  value={tName}
                  onChange={(e) => setTName(e.target.value)}
                  placeholder="Ex: Mme Nadia, M. Karim..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Matière principale
                </label>
                <input
                  type="text"
                  value={tPrimarySubject}
                  onChange={(e) => setTPrimarySubject(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Section principale
                </label>
                <select
                  value={tSection}
                  onChange={(e) => setTSection(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold"
                >
                  <option value="French Section">French Section</option>
                  <option value="KG & Primary Section">
                    KG & Primary Section
                  </option>
                  <option value="Girls Section">Girls Section</option>
                  <option value="Boys Section">Boys Section</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Max Périodes / Semaine
                </label>
                <input
                  type="number"
                  min={4}
                  max={40}
                  value={tMaxWeek}
                  onChange={(e) => setTMaxWeek(Number(e.target.value) || 24)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Max Périodes / Jour
                </label>
                <input
                  type="number"
                  min={2}
                  max={8}
                  value={tMaxDay}
                  onChange={(e) => setTMaxDay(Number(e.target.value) || 6)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Lignes de cours à affecter ({tAllocations.reduce((s, a) => s + a.periods, 0)} séances au total)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setTAllocations((prev) => [
                      ...prev,
                      {
                        classId: classes[0]?.id || 'ps',
                        subject: tPrimarySubject || 'Français',
                        periods: 3,
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + Ajouter une classe
                </button>
              </div>

              {tAllocations.map((alloc, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                >
                  <div className="md:col-span-3">
                    <select
                      value={alloc.classId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTAllocations((prev) =>
                          prev.map((a, i) =>
                            i === idx ? { ...a, classId: val } : a
                          )
                        );
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded font-bold"
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <input
                      type="text"
                      value={alloc.subject}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTAllocations((prev) =>
                          prev.map((a, i) =>
                            i === idx ? { ...a, subject: val } : a
                          )
                        );
                      }}
                      placeholder="Matière"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded font-semibold"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={alloc.periods}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 1;
                        setTAllocations((prev) =>
                          prev.map((a, i) =>
                            i === idx ? { ...a, periods: val } : a
                          )
                        );
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded font-mono font-bold text-center"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <select
                      value={alloc.jointWithClassId || ''}
                      onChange={(e) => {
                        const val = e.target.value || undefined;
                        setTAllocations((prev) =>
                          prev.map((a, i) =>
                            i === idx ? { ...a, jointWithClassId: val } : a
                          )
                        );
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-[11px]"
                    >
                      <option value="">Classe seule (standard)</option>
                      {classes
                        .filter((c) => c.id !== alloc.classId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            Rassembler avec {c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="md:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setTAllocations((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                      className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!tName.trim()) return;
                  onAddOrUpdateTeacherWithSessions({
                    name: tName.trim(),
                    primarySubject: tPrimarySubject.trim() || 'Général',
                    section: tSection,
                    maxPeriodsPerWeek: tMaxWeek,
                    maxPeriodsPerDay: tMaxDay,
                    allocations: tAllocations,
                  });
                  setTName('');
                }}
                className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                Enregistrer l'Enseignant & Générer ses Séances
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 6: COURS RASSEMBLÉS (2 CLASSES) & SÉANCES INTERCALÉES (2 PROFS)
         ===================================================================== */}
      {subTab === 'joint_intercalated' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-rose-600" />
              Rassembler 2 Classes ou 2 Enseignants (Séance Intercalée ⇄)
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setJointMode('joint_classes')}
                className={`p-2 rounded-lg border text-xs font-bold text-left cursor-pointer ${
                  jointMode === 'joint_classes'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-900'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                1. Rassembler 2 Classes
                <span className="block text-[10px] font-normal opacity-80">
                  Ex: PS + MS ou G9 + 10 Boys
                </span>
              </button>
              <button
                type="button"
                onClick={() => setJointMode('co_teaching_intercalated')}
                className={`p-2 rounded-lg border text-xs font-bold text-left cursor-pointer ${
                  jointMode === 'co_teaching_intercalated'
                    ? 'bg-amber-50 border-amber-500 text-amber-900'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                2. 2 Enseignants / Intercalé
                <span className="block text-[10px] font-normal opacity-80">
                  Demi-groupes ou Co-enseignement
                </span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Classe principale
                </label>
                <select
                  value={jointClassA}
                  onChange={(e) => setJointClassA(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded font-bold"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {jointMode === 'joint_classes' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    2ème Classe rassemblée
                  </label>
                  <select
                    value={jointClassB}
                    onChange={(e) => setJointClassB(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 rounded font-bold text-indigo-900"
                  >
                    {classes
                      .filter((c) => c.id !== jointClassA)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Jour
                </label>
                <select
                  value={jointDay}
                  onChange={(e) => setJointDay(e.target.value as DayOfWeek)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded font-semibold"
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
                  value={jointPeriod}
                  onChange={(e) => setJointPeriod(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded font-mono font-bold"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                    <option key={p} value={p}>
                      Période P{p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Matière 1
                </label>
                <input
                  type="text"
                  value={jointSubjectA}
                  onChange={(e) => setJointSubjectA(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Enseignant 1
                </label>
                <input
                  type="text"
                  value={jointTeacherA}
                  onChange={(e) => setJointTeacherA(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  2ème Matière (optionnel)
                </label>
                <input
                  type="text"
                  value={jointSubjectB}
                  onChange={(e) => setJointSubjectB(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  2ème Enseignant (Co-Prof)
                </label>
                <input
                  type="text"
                  value={jointTeacherB}
                  onChange={(e) => setJointTeacherB(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded font-semibold"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                onCreateJointOrIntercalatedSession({
                  mode: jointMode,
                  classIdA: jointClassA,
                  classIdB:
                    jointMode === 'joint_classes' ? jointClassB : undefined,
                  day: jointDay,
                  period: jointPeriod,
                  subjectA: jointSubjectA.trim() || 'Cours Commun',
                  teacherA: jointTeacherA.trim() || 'Enseignant',
                  subjectB: jointSubjectB.trim() || undefined,
                  teacherB: jointTeacherB.trim() || undefined,
                  room: jointRoom.trim() || 'Salle Commune',
                })
              }
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer"
            >
              Appliquer la Séance Rassemblée / Intercalée
            </button>
          </div>

          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">
                Séances Intercalées & Cours Rassemblés Actifs ({intercalatedSessions.length})
              </h3>
            </div>
            <div className="overflow-x-auto max-h-[460px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                    <th className="py-2 px-3">Créneau</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Classe(s)</th>
                    <th className="py-2 px-3">Matière(s) & Enseignant(s)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {intercalatedSessions.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono font-bold">
                        {item.day} · P{item.period}
                      </td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900">
                          {item.kind === 'joint_classes'
                            ? 'Classes Rassemblées'
                            : item.kind === 'split_group'
                            ? 'Séance Intercalée ⇄'
                            : 'Chevauchement Horaire'}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-bold">
                        {item.classNames.join(' + ')}
                      </td>
                      <td className="py-2 px-3">
                        <span className="font-bold">
                          {item.subjects.join(' / ')}
                        </span>{' '}
                        ({item.teachers.join(' ⇄ ')})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
