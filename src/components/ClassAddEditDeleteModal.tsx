import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Layers,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  DayOfWeek,
  LessonSlot,
  SchoolCategory,
  SchoolClass,
  SectionType,
  TeacherProfile,
} from '../types/timetable';
import {
  CATEGORY_LABELS,
  CATEGORY_SHORT_LABELS,
  getSubjectVisualStyle,
} from '../utils/timetableAnalytics';
import {
  SortGroupControlBar,
  ClassSortField,
  ClassGroupField,
  SortDirection,
} from './SortGroupControlBar';

const DAYS: DayOfWeek[] = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi'];

interface ClassAddEditDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: SchoolClass[];
  teachers: TeacherProfile[];
  initialClassId?: string;
  onSaveClass: (updatedClass: SchoolClass) => void;
  onAddClass: (newClass: SchoolClass, initialSubjects?: Array<{ subject: string; teacher: string; periods: number; assistantTeacher?: string }>) => void;
  onDeleteClass: (classId: string) => void;
  darkMode?: boolean;
}

export const ClassAddEditDeleteModal: React.FC<ClassAddEditDeleteModalProps> = ({
  isOpen,
  onClose,
  classes,
  teachers,
  initialClassId,
  onSaveClass,
  onAddClass,
  onDeleteClass,
  darkMode = false,
}) => {
  // Modal Mode: 'edit' an existing class or 'create' a brand new class
  const [mode, setMode] = useState<'edit' | 'create'>('edit');
  const [selectedClassId, setSelectedClassId] = useState<string>(
    initialClassId || classes[0]?.id || ''
  );
  const [classFilter, setClassFilter] = useState('');

  // Creation State
  const [newClassName, setNewClassName] = useState('');
  const [newSection, setNewSection] = useState<SectionType>('Primary');
  const [newCategory, setNewCategory] = useState<Exclude<SchoolCategory, 'ALL'>>('French_Section');
  const [newRoom, setNewRoom] = useState('B101');
  const [newDefaultAssistant, setNewDefaultAssistant] = useState('');

  // New Subject Addition Form State
  const [newSubjName, setNewSubjName] = useState('Mathématiques');
  const [customSubjName, setCustomSubjName] = useState('');
  const [newSubjTeacher, setNewSubjTeacher] = useState(teachers[0]?.name || '');
  const [newSubjAssistant, setNewSubjAssistant] = useState('');
  const [newSubjPeriods, setNewSubjPeriods] = useState<number>(4);
  const [newSubjGroup, setNewSubjGroup] = useState('Classe complète');

  // Delete Confirmation State
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Active edited class
  const currentClass = useMemo(() => {
    return classes.find((c) => c.id === selectedClassId) || classes[0] || null;
  }, [classes, selectedClassId]);

  // Aggregate subjects in current class from its slots
  const classSubjectBreakdown = useMemo(() => {
    if (!currentClass) return [];
    const map = new Map<
      string,
      {
        key: string;
        subject: string;
        teacher: string;
        assistantTeacher?: string;
        groupName: string;
        periods: number;
      }
    >();

    for (const slot of Object.values(currentClass.slots)) {
      if (!slot.subject) continue;
      const compositeKey = `${slot.subject.trim().toLowerCase()}__${slot.teacher.trim().toLowerCase()}__${(slot.groupName || 'Classe complète').trim()}`;
      if (!map.has(compositeKey)) {
        map.set(compositeKey, {
          key: compositeKey,
          subject: slot.subject.trim(),
          teacher: slot.teacher.trim(),
          assistantTeacher: slot.assistantTeacher?.trim(),
          groupName: slot.groupName || 'Classe complète',
          periods: 1,
        });
      } else {
        const item = map.get(compositeKey)!;
        item.periods += 1;
        if (!item.assistantTeacher && slot.assistantTeacher) {
          item.assistantTeacher = slot.assistantTeacher.trim();
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.periods - a.periods);
  }, [currentClass]);

  // TOTAL SESSIONS DEJA AJOUTE DANS CETTE CLASSE
  const totalSessionsInClass = useMemo(() => {
    if (!currentClass) return 0;
    return Object.values(currentClass.slots).filter((s) => Boolean(s.subject)).length;
  }, [currentClass]);

  // Target maximum periods based on section
  const targetCapacity = useMemo(() => {
    if (!currentClass) return 30;
    if (currentClass.section === 'KG') return 30; // 5 days * 6 periods
    if (currentClass.section === 'KG3_GS') return 35; // 5 days * 7 periods
    return 40; // 5 days * 8 periods
  }, [currentClass]);

  // COUNT SESSIONS PER TEACHER IN THIS CLASS (exigence utilisateur)
  const teacherPeriodsInThisClass = useMemo(() => {
    if (!currentClass) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const slot of Object.values(currentClass.slots)) {
      if (slot.teacher) {
        const t = slot.teacher.trim();
        map.set(t, (map.get(t) || 0) + 1);
      }
      if (slot.assistantTeacher) {
        const at = slot.assistantTeacher.trim();
        map.set(at, (map.get(at) || 0) + 1);
      }
    }
    return map;
  }, [currentClass]);

  // COUNT SESSIONS FOR TEACHER ACROSS ENTIRE SCHOOL (context)
  const teacherTotalAcrossSchool = useMemo(() => {
    const map = new Map<string, number>();
    for (const cls of classes) {
      for (const slot of Object.values(cls.slots)) {
        if (slot.teacher) {
          const t = slot.teacher.trim();
          map.set(t, (map.get(t) || 0) + 1);
        }
        if (slot.assistantTeacher) {
          const at = slot.assistantTeacher.trim();
          map.set(at, (map.get(at) || 0) + 1);
        }
      }
    }
    return map;
  }, [classes]);

  // Filtered classes list
  const filteredClasses = useMemo(() => {
    const q = classFilter.toLowerCase().trim();
    if (!q) return classes;
    return classes.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.room.toLowerCase().includes(q) ||
        (c.category && c.category.toLowerCase().includes(q))
    );
  }, [classes, classFilter]);

  // User-selected class sorting & grouping state
  const [classSortField, setClassSortField] = useState<ClassSortField>('name');
  const [classSortDir, setClassSortDir] = useState<SortDirection>('asc');
  const [classGroupField, setClassGroupField] = useState<ClassGroupField>('none');

  const sortedAndGroupedClasses = useMemo(() => {
    const list = [...filteredClasses].sort((a, b) => {
      let cmp = 0;
      if (classSortField === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (classSortField === 'total_periods') {
        const countA = Object.values(a.slots).filter((s) => Boolean(s?.subject)).length;
        const countB = Object.values(b.slots).filter((s) => Boolean(s?.subject)).length;
        cmp = countA - countB;
      } else if (classSortField === 'fill_rate') {
        const targetA = a.section === 'KG' ? 30 : a.section === 'KG3_GS' ? 35 : 40;
        const targetB = b.section === 'KG' ? 30 : b.section === 'KG3_GS' ? 35 : 40;
        const fillA = Object.values(a.slots).filter((s) => Boolean(s?.subject)).length / targetA;
        const fillB = Object.values(b.slots).filter((s) => Boolean(s?.subject)).length / targetB;
        cmp = fillA - fillB;
      } else if (classSortField === 'level') {
        cmp = (a.category || '').localeCompare(b.category || '');
      } else if (classSortField === 'room') {
        cmp = (a.room || '').localeCompare(b.room || '');
      }
      return classSortDir === 'asc' ? cmp : -cmp;
    });

    if (classGroupField === 'none') {
      return [{ groupName: '', classes: list }];
    }

    const map = new Map<string, typeof list>();
    list.forEach((cls) => {
      let g = 'Autres';
      if (classGroupField === 'cycle') {
        g = CATEGORY_LABELS[cls.category || 'French_Section'] || 'Général';
      } else if (classGroupField === 'section') {
        g =
          cls.section === 'Secondary_Girls'
            ? 'Section Filles'
            : cls.section === 'Secondary_Boys'
            ? 'Section Garçons'
            : 'Section Mixte / Maternelle';
      } else if (classGroupField === 'timing_group') {
        g = cls.timingGroupId || 'Horaires Standards';
      }
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(cls);
    });

    return Array.from(map.entries()).map(([groupName, classes]) => ({
      groupName,
      classes,
    }));
  }, [filteredClasses, classSortField, classSortDir, classGroupField]);

  if (!isOpen) return null;

  // Handler: Add or update a subject load in the current class
  const handleAddOrUpdateSubjectInClass = (
    subjName: string,
    teacherName: string,
    periodsCount: number,
    assistantName?: string,
    groupName = 'Classe complète'
  ) => {
    if (!currentClass || !subjName.trim() || periodsCount <= 0) return;
    const finalSubj = subjName.trim();
    const finalTeacher = teacherName.trim() || 'Prof. Référent';

    const nextSlots = { ...currentClass.slots };
    // Find matching slots
    const matchingKeys = Object.entries(nextSlots)
      .filter(
        ([, s]) =>
          s.subject.toLowerCase() === finalSubj.toLowerCase() &&
          s.teacher.toLowerCase() === finalTeacher.toLowerCase()
      )
      .map(([k]) => k);

    const currentCount = matchingKeys.length;
    const delta = periodsCount - currentCount;

    if (delta > 0) {
      const maxP =
        currentClass.section === 'KG'
          ? 6
          : currentClass.section === 'KG3_GS'
          ? 7
          : 8;
      let added = 0;
      for (const day of DAYS) {
        for (let p = 1; p <= maxP; p++) {
          if (added >= delta) break;
          const k = `${day}_${p}`;
          if (!nextSlots[k]) {
            nextSlots[k] = {
              subject: finalSubj,
              teacher: finalTeacher,
              assistantTeacher: assistantName?.trim() || undefined,
              room: currentClass.room,
              groupName,
            };
            added++;
          }
        }
      }
    } else if (delta < 0) {
      const toRemove = Math.min(Math.abs(delta), matchingKeys.length);
      for (let i = 0; i < toRemove; i++) {
        const keyToDelete = matchingKeys[matchingKeys.length - 1 - i];
        delete nextSlots[keyToDelete];
      }
    }

    // Also update assistant or group name on existing slots if changed
    if (delta === 0) {
      for (const k of matchingKeys) {
        nextSlots[k] = {
          ...nextSlots[k],
          assistantTeacher: assistantName?.trim() || undefined,
          groupName,
        };
      }
    }

    onSaveClass({
      ...currentClass,
      slots: nextSlots,
      subjectLoads: {
        ...(currentClass.subjectLoads || {}),
        [finalSubj]: periodsCount,
      },
    });

    // Reset subject quick form
    setCustomSubjName('');
  };

  // Handler: Remove an entire subject from this class
  const handleRemoveSubjectFromClass = (subjName: string, teacherName: string) => {
    if (!currentClass) return;
    const nextSlots = { ...currentClass.slots };
    for (const [k, s] of Object.entries(nextSlots)) {
      if (
        s.subject.toLowerCase() === subjName.toLowerCase() &&
        s.teacher.toLowerCase() === teacherName.toLowerCase()
      ) {
        delete nextSlots[k];
      }
    }
    const nextLoads = { ...(currentClass.subjectLoads || {}) };
    delete nextLoads[subjName];

    onSaveClass({
      ...currentClass,
      slots: nextSlots,
      subjectLoads: nextLoads,
    });
  };

  // Handler: Create a new class
  const handleCreateNewClassSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;

    const newId = `cls_${Date.now()}_${newClassName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const newCls: SchoolClass = {
      id: newId,
      name: newClassName.trim(),
      section: newSection,
      category: newCategory,
      room: newRoom.trim() || 'Salle Principale',
      defaultAssistant: newDefaultAssistant.trim() || undefined,
      visibility: 'school',
      slots: {},
      subjectLoads: {},
      updatedBy: 'direction',
    };

    onAddClass(newCls);
    setSelectedClassId(newId);
    setMode('edit');
    setNewClassName('');
  };

  // Handler: Confirm delete class
  const handleConfirmDelete = () => {
    if (!confirmDeleteId) return;
    onDeleteClass(confirmDeleteId);
    setConfirmDeleteId(null);
    if (selectedClassId === confirmDeleteId) {
      const remaining = classes.filter((c) => c.id !== confirmDeleteId);
      if (remaining.length > 0) {
        setSelectedClassId(remaining[0].id);
      }
    }
  };

  const effectiveSubjectName =
    newSubjName === '__custom__' ? customSubjName : newSubjName;

  // Selected teacher's existing periods in this class for the form
  const selectedTeacherExistingPeriods =
    teacherPeriodsInThisClass.get(newSubjTeacher.trim()) || 0;
  const selectedTeacherSchoolTotal =
    teacherTotalAcrossSchool.get(newSubjTeacher.trim()) || 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 no-print overflow-y-auto">
      <div
        className={`w-full max-w-5xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
          darkMode
            ? 'bg-slate-900 border-slate-700 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header Bar */}
        <div className="px-6 py-4 bg-gradient-to-r from-sky-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-sky-500/20 text-sky-300 rounded-lg">
                <Layers className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-black tracking-tight">
                Gestionnaire de Classe · Ajouter, Configurer & Supprimer
              </h2>
            </div>
            <p className="text-xs text-sky-200 mt-1">
              Ajoutez ou supprimez une classe, configurez ses matières, enseignants et séances par semaine.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mode Selector: Configurer une classe existante vs + Créer une nouvelle classe */}
        <div className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode('edit')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                mode === 'edit'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Gérer / Modifier une Classe ({classes.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('create')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                mode === 'create'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>+ Créer une Nouvelle Classe</span>
            </button>
          </div>

          {mode === 'edit' && currentClass && (
            <button
              type="button"
              onClick={() => setConfirmDeleteId(currentClass.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Supprimer cette classe et archiver ses séances"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Supprimer {currentClass.name}</span>
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* ==========================================================
              SUB-VIEW A: CREATE A NEW CLASS
             ========================================================== */}
          {mode === 'create' && (
            <form onSubmit={handleCreateNewClassSubmit} className="max-w-2xl mx-auto space-y-5">
              <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20">
                <h3 className="text-sm font-bold text-emerald-950 dark:text-emerald-200 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-600" />
                  Création d'une nouvelle classe d'enseignement
                </h3>
                <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-1 leading-relaxed">
                  Renseignez le nom et les coordonnées de la classe. Vous pourrez ensuite ajouter immédiatement toutes ses matières, enseignants et séances.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nom de la classe <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 6ème B, G9 Girls, CM2 A..."
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Section / Cycle d'enseignement
                  </label>
                  <select
                    value={newSection}
                    onChange={(e) => setNewSection(e.target.value as SectionType)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                  >
                    <option value="KG">Maternelle / KG (6 périodes / jour = 30p)</option>
                    <option value="KG3_GS">Grande Section / KG3 (7 périodes / jour = 35p)</option>
                    <option value="Primary">Primaire / Elementary (8 périodes / jour = 40p)</option>
                    <option value="Secondary_Boys">Secondaire Garçons (8 périodes / jour = 40p)</option>
                    <option value="Secondary_Girls">Secondaire Filles (8 périodes / jour = 40p)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Catégorie d'organisation
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as Exclude<SchoolCategory, 'ALL'>)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                  >
                    <option value="French_Section">Section Française</option>
                    <option value="Primaire">Primaire Général</option>
                    <option value="Secondaire">Secondaire Général</option>
                    <option value="KG_Maternelle">KG / Maternelle</option>
                    <option value="Boys_Section">Section Garçons</option>
                    <option value="Girls_Section">Section Filles</option>
                    <option value="American_Section">Section Américaine</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Salle de classe par défaut
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: B204, Labo 2, Salle 105..."
                    value={newRoom}
                    onChange={(e) => setNewRoom(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Assistant(e) pédagogique de classe attitré(e) (Optionnel)
                </label>
                <select
                  value={newDefaultAssistant}
                  onChange={(e) => setNewDefaultAssistant(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                >
                  <option value="">Aucun(e) assistant(e) attitré(e)</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name} ({t.subjects.join(', ')})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Pratique pour les classes de Maternelle et Primaire ayant une assistante dédiée à temps plein.
                </p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setMode('edit')}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm flex items-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Créer la Classe & Configurer les Matières</span>
                </button>
              </div>
            </form>
          )}

          {/* ==========================================================
              SUB-VIEW B: CONFIGURE AN EXISTING CLASS
             ========================================================== */}
          {mode === 'edit' && currentClass && (
            <div className="space-y-6">
              {/* User-selected Class Sort & Group Controls */}
              <SortGroupControlBar
                mode="classes"
                currentSortField={classSortField}
                sortDirection={classSortDir}
                onSortChange={(f, d) => {
                  setClassSortField(f as ClassSortField);
                  setClassSortDir(d);
                }}
                currentGroupField={classGroupField}
                onGroupChange={(g) => setClassGroupField(g as ClassGroupField)}
                totalCount={filteredClasses.length}
                darkMode={darkMode}
              />

              {/* Class Switcher & Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40">
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 shrink-0">Classe active :</span>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="w-full max-w-sm px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {sortedAndGroupedClasses.map((group, idx) =>
                      group.groupName ? (
                        <optgroup key={group.groupName || idx} label={group.groupName}>
                          {group.classes.map((c) => {
                            const count = Object.values(c.slots).filter((s) => Boolean(s.subject)).length;
                            return (
                              <option key={c.id} value={c.id}>
                                {c.name} · {count} séances ({c.room})
                              </option>
                            );
                          })}
                        </optgroup>
                      ) : (
                        group.classes.map((c) => {
                          const count = Object.values(c.slots).filter((s) => Boolean(s.subject)).length;
                          return (
                            <option key={c.id} value={c.id}>
                              {c.name} · {count} séances ({c.room})
                            </option>
                          );
                        })
                      )
                    )}
                  </select>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filtrer classe..."
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* AUTOMATIC TOTALS AND TEACHERS SESSIONS BANNER (Exigence Utilisateur Fondamentale) */}
              <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/20 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-indigo-950 dark:text-indigo-200">
                        Classe {currentClass.name} ({currentClass.room})
                      </h3>
                      <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 font-semibold">
                        {CATEGORY_SHORT_LABELS[currentClass.category || 'French_Section']}
                      </span>
                    </div>
                    <p className="text-xs text-indigo-800/80 dark:text-indigo-300/80 mt-0.5">
                      Cycle : {currentClass.section} · Capacité recommandée : {targetCapacity} séances / semaine
                    </p>
                  </div>

                  {/* VITAL INDICATOR 1: NOMBRE TOTAL DE SEANCES DEJA AJOUTE */}
                  <div className="flex items-center gap-3 bg-white dark:bg-slate-900 px-4 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 shadow-2xs">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Total séances déjà ajoutées
                      </div>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-xl font-black font-mono text-indigo-700 dark:text-indigo-400 tabular-nums">
                          {totalSessionsInClass}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          / {targetCapacity} max
                        </span>
                      </div>
                    </div>
                    <div className="w-12 h-12 rounded-full border-4 border-indigo-100 dark:border-indigo-950 flex items-center justify-center font-bold text-xs text-indigo-700 dark:text-indigo-300 font-mono">
                      {Math.round((totalSessionsInClass / targetCapacity) * 100)}%
                    </div>
                  </div>
                </div>

                {/* VITAL INDICATOR 2: NOMBRE DE SEANCE POUR CHAQUE ENSEIGNANT DEJA DANS CETTE CLASSE */}
                <div className="pt-2 border-t border-indigo-200/80 dark:border-indigo-900/80">
                  <div className="text-[11px] font-bold text-indigo-900 dark:text-indigo-300 mb-2 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Séances attribuées à chaque enseignant dans cette classe :</span>
                  </div>

                  {teacherPeriodsInThisClass.size === 0 ? (
                    <div className="text-xs text-indigo-700/70 italic">
                      Aucune matière ni enseignant encore configuré pour cette classe.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {Array.from(teacherPeriodsInThisClass.entries()).map(([tName, pCount]) => {
                        const totalProf = teacherTotalAcrossSchool.get(tName) || pCount;
                        return (
                          <div
                            key={tName}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-xs shadow-2xs"
                          >
                            <span className="font-bold text-slate-800 dark:text-slate-100">
                              {tName}
                            </span>
                            <span className="font-mono font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded text-[11px] tabular-nums">
                              {pCount} séance{pCount > 1 ? 's' : ''} dans cette classe
                            </span>
                            <span className="text-[10px] text-slate-400 tabular-nums">
                              ({totalProf}p école)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ==========================================================
                  FORM: AJOUTER UNE MATIERE RAPIDEMENT DANS CETTE CLASSE
                 ========================================================== */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-sky-600" />
                  <span>Ajouter une matière & un enseignant dans {currentClass.name}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Select or Custom Subject */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Matière
                    </label>
                    <select
                      value={newSubjName}
                      onChange={(e) => setNewSubjName(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 font-semibold"
                    >
                      <option value="Français">Français</option>
                      <option value="Mathématiques">Mathématiques</option>
                      <option value="Arabe">Arabe</option>
                      <option value="Anglais">Anglais</option>
                      <option value="Sciences">Sciences / SVT</option>
                      <option value="Physique-Chimie">Physique-Chimie</option>
                      <option value="Histoire-Géo">Histoire-Géo</option>
                      <option value="Arts Plastiques">Arts Plastiques</option>
                      <option value="Éducation Musicale">Éducation Musicale</option>
                      <option value="EPS / Sport">EPS / Sport</option>
                      <option value="Informatique / Tech">Informatique / Tech</option>
                      <option value="Éducation Islamique">Éducation Islamique</option>
                      <option value="__custom__">+ Autre matière personnalisée...</option>
                    </select>

                    {newSubjName === '__custom__' && (
                      <input
                        type="text"
                        placeholder="Nom de la matière..."
                        value={customSubjName}
                        onChange={(e) => setCustomSubjName(e.target.value)}
                        className="w-full mt-1.5 px-2.5 py-1.5 text-xs border border-sky-400 rounded-lg bg-white dark:bg-slate-800 font-semibold"
                      />
                    )}
                  </div>

                  {/* Teacher Select with automatic period preview in this class */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Enseignant Principal
                    </label>
                    <select
                      value={newSubjTeacher}
                      onChange={(e) => setNewSubjTeacher(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 font-semibold"
                    >
                      {teachers.map((t) => {
                        const countInClass = teacherPeriodsInThisClass.get(t.name) || 0;
                        return (
                          <option key={t.id} value={t.name}>
                            {t.name} {countInClass > 0 ? `(${countInClass}p déjà dans cette classe)` : ''}
                          </option>
                        );
                      })}
                    </select>
                    {/* Live Badge for selected teacher */}
                    <div className="text-[10px] text-sky-700 dark:text-sky-300 font-medium mt-1">
                      {selectedTeacherExistingPeriods > 0
                        ? `ℹ️ ${newSubjTeacher} a déjà ${selectedTeacherExistingPeriods} séance(s) dans cette classe (${selectedTeacherSchoolTotal}p au total)`
                        : `ℹ️ 0 séance pour l'instant dans cette classe (${selectedTeacherSchoolTotal}p au total)`}
                    </div>
                  </div>

                  {/* Number of Sessions per Week */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Séances par semaine
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setNewSubjPeriods((p) => Math.max(1, p - 1))}
                        className="p-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={15}
                        value={newSubjPeriods}
                        onChange={(e) => setNewSubjPeriods(Math.max(1, Number(e.target.value) || 1))}
                        className="w-16 text-center font-mono font-bold text-xs px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() => setNewSubjPeriods((p) => p + 1)}
                        className="p-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs text-slate-500 font-medium ml-1">séances</span>
                    </div>
                  </div>

                  {/* Assistant & Submit button */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Assistant(e) optionnel(le)
                    </label>
                    <select
                      value={newSubjAssistant}
                      onChange={(e) => setNewSubjAssistant(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                    >
                      <option value="">Aucun(e)</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name} (Assistant)
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        handleAddOrUpdateSubjectInClass(
                          effectiveSubjectName,
                          newSubjTeacher,
                          newSubjPeriods,
                          newSubjAssistant,
                          newSubjGroup
                        )
                      }
                      className="w-full mt-2 px-3 py-1.5 text-xs font-black text-white bg-sky-700 hover:bg-sky-800 rounded-lg shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Ajouter à la classe</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* ==========================================================
                  TABLE: MATIERES DEJA CONFIGUREES DANS LA CLASSE
                 ========================================================== */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Matières configurées dans {currentClass.name} ({classSubjectBreakdown.length} matières · {totalSessionsInClass} séances au total)
                  </h4>
                </div>

                {classSubjectBreakdown.length === 0 ? (
                  <div className="p-8 text-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-slate-500 text-xs">
                    Aucune matière dans cette classe pour le moment. Utilisez le formulaire ci-dessus pour ajouter la première matière.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                          <th className="py-2.5 px-3">Matière</th>
                          <th className="py-2.5 px-3">Enseignant Principal</th>
                          <th className="py-2.5 px-3">Séances déjà dans cette classe</th>
                          <th className="py-2.5 px-3">Assistant(e)</th>
                          <th className="py-2.5 px-3">Groupe</th>
                          <th className="py-2.5 px-3 text-right">Séances/Sem</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {classSubjectBreakdown.map((row) => {
                          const style = getSubjectVisualStyle(row.subject);
                          const profInClass = teacherPeriodsInThisClass.get(row.teacher) || row.periods;
                          const profTotal = teacherTotalAcrossSchool.get(row.teacher) || profInClass;

                          return (
                            <tr
                              key={row.key}
                              className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                            >
                              <td className="py-2.5 px-3">
                                <span
                                  className="inline-block px-2.5 py-0.5 rounded font-bold text-xs"
                                  style={{
                                    backgroundColor: style.bgHex,
                                    color: style.textHex,
                                    border: `1px solid ${style.borderHex}`,
                                  }}
                                >
                                  {row.subject}
                                </span>
                              </td>

                              <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                                {row.teacher}
                              </td>

                              <td className="py-2.5 px-3">
                                <span className="inline-flex items-center gap-1 font-mono font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded text-[11px] tabular-nums">
                                  {profInClass} séance{profInClass > 1 ? 's' : ''} dans {currentClass.name}
                                </span>
                                <span className="text-[10px] text-slate-400 ml-1.5 tabular-nums">
                                  ({profTotal}p école)
                                </span>
                              </td>

                              <td className="py-2.5 px-3 text-slate-500">
                                {row.assistantTeacher ? (
                                  <span className="inline-flex items-center gap-1 font-medium text-teal-700 dark:text-teal-300">
                                    <UserPlus className="w-3 h-3" />
                                    {row.assistantTeacher}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>

                              <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                                {row.groupName}
                              </td>

                              <td className="py-2.5 px-3 text-right">
                                <div className="inline-flex items-center gap-1 justify-end">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAddOrUpdateSubjectInClass(
                                        row.subject,
                                        row.teacher,
                                        Math.max(1, row.periods - 1),
                                        row.assistantTeacher,
                                        row.groupName
                                      )
                                    }
                                    className="p-1 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100"
                                    title="Diminuer d'1 séance"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="font-mono font-black text-sm px-2 text-slate-900 dark:text-slate-100 tabular-nums">
                                    {row.periods}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAddOrUpdateSubjectInClass(
                                        row.subject,
                                        row.teacher,
                                        row.periods + 1,
                                        row.assistantTeacher,
                                        row.groupName
                                      )
                                    }
                                    className="p-1 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100"
                                    title="Ajouter 1 séance"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>

                              <td className="py-2.5 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSubjectFromClass(row.subject, row.teacher)}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors"
                                  title="Retirer cette matière de la classe"
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
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            💡 Toute modification ou suppression est immédiatement réversible avec le bouton <strong className="text-rose-600 font-bold">↩ Précédent (Ctrl+Z)</strong>.
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg cursor-pointer"
          >
            Fermer le gestionnaire
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Deleting Class */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-60 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-rose-300 dark:border-rose-900 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <span className="p-2 bg-rose-100 dark:bg-rose-950/60 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </span>
              <div>
                <h3 className="text-base font-black">Supprimer définitivement la classe ?</h3>
                <p className="text-xs text-slate-500">Action sécurisée avec historique d'annulation</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Êtes-vous sûr de vouloir supprimer la classe{' '}
              <strong>{classes.find((c) => c.id === confirmDeleteId)?.name}</strong> ?
              Toutes ses séances et matières associées seront retirées de la grille. Vous pourrez toujours annuler cette action via le bouton <strong>↩ Précédent</strong>.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm"
              >
                Confirmer la suppression
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
