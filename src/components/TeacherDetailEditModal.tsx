import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Edit2,
  FileSpreadsheet,
  GraduationCap,
  Layers,
  Minus,
  Plus,
  Printer,
  Save,
  ShieldAlert,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import {
  DayOfWeek,
  LessonSlot,
  SchoolCategory,
  SchoolClass,
  TeacherProfile,
} from '../types/timetable';
import {
  CATEGORY_SHORT_LABELS,
  getSubjectVisualStyle,
} from '../utils/timetableAnalytics';
import { DAYS_OF_WEEK } from '../data/alkawtharDefaults';

interface TeacherAssignmentItem {
  id: string; // unique key: `${classId}___${subject}`
  classId: string;
  className: string;
  classCategory?: SchoolCategory;
  subject: string;
  periods: number;
  room?: string;
  assistantTeacher?: string;
  isAssistantForThisClass?: boolean;
}

interface TeacherDetailEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacherId: string | null;
  teachers: TeacherProfile[];
  classes: SchoolClass[];
  onSaveTeacher: (updatedTeacher: TeacherProfile) => void;
  onSaveClass: (updatedClass: SchoolClass) => void;
  onViewTeacherTimetable: (teacherId: string) => void;
  onOpenTimeOffSettings?: (teacherId: string) => void;
  darkMode?: boolean;
}

export const TeacherDetailEditModal: React.FC<TeacherDetailEditModalProps> = ({
  isOpen,
  onClose,
  teacherId,
  teachers,
  classes,
  onSaveTeacher,
  onSaveClass,
  onViewTeacherTimetable,
  onOpenTimeOffSettings,
  darkMode = false,
}) => {
  if (!isOpen || !teacherId) return null;

  const teacher = teachers.find((t) => t.id === teacherId);

  // Local state for editing teacher profile metadata
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(teacher?.name || '');
  const [profileMainSubject, setProfileMainSubject] = useState(teacher?.subjects?.[0] || '');
  const [profileMaxQuota, setProfileMaxQuota] = useState(teacher?.maxPeriodsPerWeek || 24);
  const [profileIsAssistant, setProfileIsAssistant] = useState(teacher?.isAssistant || false);

  // Local state for adding a new assignment to this teacher
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAssignClassId, setNewAssignClassId] = useState(classes[0]?.id || '');
  const [newAssignSubject, setNewAssignSubject] = useState(teacher?.subjects?.[0] || 'Français');
  const [newAssignPeriods, setNewAssignPeriods] = useState<number>(4);
  const [newAssignAssistant, setNewAssignAssistant] = useState<string>('');

  // Extract all existing assignments for this teacher across all classes
  const assignments: TeacherAssignmentItem[] = useMemo(() => {
    if (!teacher) return [];
    const tLower = teacher.name.trim().toLowerCase();
    const list: TeacherAssignmentItem[] = [];

    classes.forEach((cls) => {
      // Map of subject -> periods count
      const subjectMap = new Map<
        string,
        {
          periods: number;
          room?: string;
          assistantTeacher?: string;
          isAssistantForThisClass: boolean;
        }
      >();

      Object.values(cls.slots).forEach((slot) => {
        if (!slot || !slot.subject) return;
        const mainMatch = slot.teacher?.trim().toLowerCase() === tLower;
        const subMatch = slot.subTeacher?.trim().toLowerCase() === tLower;
        const assistMatch = slot.assistantTeacher?.trim().toLowerCase() === tLower;

        if (mainMatch) {
          const prev = subjectMap.get(slot.subject) || {
            periods: 0,
            room: slot.room || cls.room,
            assistantTeacher: slot.assistantTeacher,
            isAssistantForThisClass: false,
          };
          subjectMap.set(slot.subject, {
            ...prev,
            periods: prev.periods + 1,
            room: slot.room || prev.room,
            assistantTeacher: slot.assistantTeacher || prev.assistantTeacher,
          });
        } else if (subMatch) {
          const subjName = slot.subSubject || slot.subject;
          const prev = subjectMap.get(subjName) || {
            periods: 0,
            room: slot.room || cls.room,
            assistantTeacher: undefined,
            isAssistantForThisClass: false,
          };
          subjectMap.set(subjName, {
            ...prev,
            periods: prev.periods + 1,
            room: slot.room || prev.room,
          });
        } else if (assistMatch) {
          const assistSubjKey = `${slot.subject} (Co-assistant)`;
          const prev = subjectMap.get(assistSubjKey) || {
            periods: 0,
            room: slot.room || cls.room,
            assistantTeacher: undefined,
            isAssistantForThisClass: true,
          };
          subjectMap.set(assistSubjKey, {
            ...prev,
            periods: prev.periods + 1,
            room: slot.room || prev.room,
          });
        }
      });

      subjectMap.forEach((val, subjKey) => {
        list.push({
          id: `${cls.id}___${subjKey}`,
          classId: cls.id,
          className: cls.name,
          classCategory: cls.category,
          subject: subjKey,
          periods: val.periods,
          room: val.room,
          assistantTeacher: val.assistantTeacher,
          isAssistantForThisClass: val.isAssistantForThisClass,
        });
      });
    });

    return list.sort((a, b) => a.className.localeCompare(b.className));
  }, [teacher, classes]);

  if (!teacher) return null;

  const totalAssignedPeriods = assignments.reduce((acc, a) => acc + a.periods, 0);
  const maxQuota = teacher.maxPeriodsPerWeek || 24;
  const utilizationPercent = Math.min(100, Math.round((totalAssignedPeriods / maxQuota) * 100));
  const isOverloaded = totalAssignedPeriods > maxQuota;
  const isUnderloaded = totalAssignedPeriods < maxQuota * 0.7;

  // Handler: Change periods for a specific assignment in a class
  const handleUpdatePeriods = (item: TeacherAssignmentItem, targetPeriods: number) => {
    if (targetPeriods < 0) return;
    const targetClass = classes.find((c) => c.id === item.classId);
    if (!targetClass) return;

    const tLower = teacher.name.trim().toLowerCase();
    const cleanSubj = item.subject.replace(' (Co-assistant)', '').trim();
    const nextSlots = { ...targetClass.slots };

    // Find slots currently taught by this teacher for this subject
    const matchingSlotKeys = Object.entries(nextSlots)
      .filter(([_, s]) => {
        if (!s) return false;
        const subjMatch = s.subject?.trim().toLowerCase() === cleanSubj.toLowerCase();
        const teacherMatch =
          s.teacher?.trim().toLowerCase() === tLower ||
          s.assistantTeacher?.trim().toLowerCase() === tLower;
        return subjMatch && teacherMatch;
      })
      .map(([k]) => k);

    const currentCount = matchingSlotKeys.length;
    const delta = targetPeriods - currentCount;

    if (delta > 0) {
      // Add `delta` slots in available slots
      const maxP =
        targetClass.section === 'KG' ? 6 : targetClass.section === 'KG3_GS' ? 7 : 8;
      let added = 0;
      for (const day of DAYS_OF_WEEK) {
        for (let p = 1; p <= maxP; p++) {
          if (added >= delta) break;
          const k = `${day}_${p}`;
          if (!nextSlots[k] || !nextSlots[k].subject) {
            nextSlots[k] = {
              subject: cleanSubj,
              teacher: item.isAssistantForThisClass ? (nextSlots[k]?.teacher || 'Enseignant') : teacher.name,
              assistantTeacher: item.isAssistantForThisClass ? teacher.name : item.assistantTeacher,
              room: item.room || targetClass.room,
              groupName: 'Classe complète',
            };
            added++;
          }
        }
      }
    } else if (delta < 0) {
      // Remove excess slots
      const toRemove = Math.min(Math.abs(delta), matchingSlotKeys.length);
      for (let i = 0; i < toRemove; i++) {
        const keyToDelete = matchingSlotKeys[matchingSlotKeys.length - 1 - i];
        delete nextSlots[keyToDelete];
      }
    }

    onSaveClass({
      ...targetClass,
      slots: nextSlots,
    });
  };

  // Handler: Delete an assignment entirely from a class
  const handleDeleteAssignment = (item: TeacherAssignmentItem) => {
    handleUpdatePeriods(item, 0);
  };

  // Handler: Add a new assignment
  const handleAddNewAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssignClassId || !newAssignSubject.trim() || newAssignPeriods <= 0) return;

    const targetClass = classes.find((c) => c.id === newAssignClassId);
    if (!targetClass) return;

    const nextSlots = { ...targetClass.slots };
    const maxP =
      targetClass.section === 'KG' ? 6 : targetClass.section === 'KG3_GS' ? 7 : 8;
    let added = 0;

    for (const day of DAYS_OF_WEEK) {
      for (let p = 1; p <= maxP; p++) {
        if (added >= newAssignPeriods) break;
        const k = `${day}_${p}`;
        if (!nextSlots[k] || !nextSlots[k].subject) {
          nextSlots[k] = {
            subject: newAssignSubject.trim(),
            teacher: teacher.name,
            assistantTeacher: newAssignAssistant.trim() || undefined,
            room: targetClass.room,
            groupName: 'Classe complète',
          };
          added++;
        }
      }
    }

    onSaveClass({
      ...targetClass,
      slots: nextSlots,
    });

    // Reset add form
    setShowAddForm(false);
    setNewAssignPeriods(4);
  };

  // Handler: Save profile metadata changes
  const handleSaveProfile = () => {
    onSaveTeacher({
      ...teacher,
      name: profileName.trim() || teacher.name,
      subjects: [profileMainSubject.trim() || teacher.subjects[0] || 'Général'],
      maxPeriodsPerWeek: Number(profileMaxQuota) || 24,
      isAssistant: profileIsAssistant,
    });
    setIsEditingProfile(false);
  };

  const unavailableCount = (teacher.unavailableSlots || []).length;
  const questionableCount = (teacher.questionableSlots || []).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-xs">
      <div
        className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-xl shadow-2xl border overflow-hidden ${
          darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* MODAL TOP BAR */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/80 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-600 text-white flex items-center justify-center font-black text-base shadow-xs shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Fiche de l'Enseignant : <span className="text-teal-700 dark:text-teal-400">{teacher.name}</span>
                </h2>
                {teacher.isAssistant && (
                  <span className="text-[10px] px-2 py-0.5 rounded font-extrabold bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300">
                    Assistant(e)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                <span>Matière : {teacher.subjects.join(', ')}</span>
                <span aria-hidden="true">·</span>
                <span>Section : {teacher.section}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums font-semibold">
                  {assignments.length} classe(s) assignée(s)
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onViewTeacherTimetable(teacher.id);
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 border border-sky-200 dark:border-sky-800 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Voir la grille horaire hebdomadaire de cet enseignant"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Voir l'Emploi du Temps</span>
            </button>

            {onOpenTimeOffSettings && (
              <button
                type="button"
                onClick={() => {
                  onOpenTimeOffSettings(teacher.id);
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Gérer les créneaux interdits (✕) ou à éviter (?)"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Temps Libre aSc</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* WORKLOAD METRICS & CONTRACT CAPACITY STRIP */}
        <div className="px-6 py-3 bg-slate-100/60 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[11px] text-slate-500 uppercase font-semibold">Volume Hebdomadaire</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {totalAssignedPeriods}
                </span>
                <span className="text-xs text-slate-500 font-mono">/ {maxQuota} séances max</span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    isOverloaded
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                      : isUnderloaded
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  }`}
                >
                  {isOverloaded
                    ? `Surcharge (+${totalAssignedPeriods - maxQuota}p)`
                    : isUnderloaded
                    ? `Sous-charge (-${maxQuota - totalAssignedPeriods}p)`
                    : 'Charge Optimale'}
                </span>
              </div>
            </div>

            {/* Visual utilization bar */}
            <div className="w-36 hidden sm:block">
              <div className="flex justify-between text-[10px] text-slate-400 font-mono mb-1">
                <span>Remplissage</span>
                <span>{utilizationPercent}%</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isOverloaded ? 'bg-rose-500' : isUnderloaded ? 'bg-amber-500' : 'bg-teal-500'
                  }`}
                  style={{ width: `${Math.min(100, (totalAssignedPeriods / maxQuota) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Quick constraints reminder */}
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>{unavailableCount} créneau(x) bloqué(s)</span>
            </div>
            {questionableCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span>{questionableCount} à éviter</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsEditingProfile(!isEditingProfile)}
              className="text-xs text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 ml-2 font-medium"
            >
              <Edit2 className="w-3 h-3" />
              <span>{isEditingProfile ? 'Fermer réglages' : 'Modifier contrat'}</span>
            </button>
          </div>
        </div>

        {/* PROFILE METADATA QUICK EDIT ACCORDION */}
        {isEditingProfile && (
          <div className="p-4 bg-sky-50/50 dark:bg-sky-950/20 border-b border-sky-200 dark:border-sky-800 text-xs">
            <div className="font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-sky-600" />
              <span>Paramètres du profil & du contrat enseignant</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Nom officiel
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Discipline / Matière
                </label>
                <input
                  type="text"
                  value={profileMainSubject}
                  onChange={(e) => setProfileMainSubject(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Quota Max Hebdo (séances)
                </label>
                <input
                  type="number"
                  min="1"
                  max="40"
                  value={profileMaxQuota}
                  onChange={(e) => setProfileMaxQuota(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Enregistrer</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MAIN BODY: ASSIGNMENTS TABLE + ADD BUTTON */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-teal-600" />
                <span>Attributions de Cours & Classes Enseignées ({assignments.length})</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Modifiez directement le nombre de séances par semaine pour chaque classe ou ajoutez une nouvelle matière.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showAddForm ? 'Masquer formulaire' : '+ Attribuer une nouvelle classe'}</span>
            </button>
          </div>

          {/* ADD ASSIGNMENT FORM INLINE */}
          {showAddForm && (
            <form
              onSubmit={handleAddNewAssignment}
              className="p-4 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/20 text-xs space-y-3"
            >
              <div className="font-bold text-teal-900 dark:text-teal-200 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-teal-600" />
                <span>Ajouter une attribution de cours pour {teacher.name}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Classe cible
                  </label>
                  <select
                    value={newAssignClassId}
                    onChange={(e) => setNewAssignClassId(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({CATEGORY_SHORT_LABELS[c.category || 'French_Section']})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Matière enseignée
                  </label>
                  <input
                    type="text"
                    value={newAssignSubject}
                    onChange={(e) => setNewAssignSubject(e.target.value)}
                    placeholder="Ex: Maths, Français, Arabe..."
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Séances par semaine
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="15"
                    value={newAssignPeriods}
                    onChange={(e) => setNewAssignPeriods(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-1.5 rounded bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirmer l'attribution</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* TABLE OF ASSIGNMENTS */}
          {assignments.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <div className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                Aucune classe n'est actuellement attribuée à {teacher.name}.
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Cliquez sur le bouton ci-dessus pour lui attribuer une classe et définir son nombre de séances par semaine.
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Matière</th>
                    <th className="py-2.5 px-4">Classe</th>
                    <th className="py-2.5 px-4">Cycle / Section</th>
                    <th className="py-2.5 px-4">Salle & Co-assistant</th>
                    <th className="py-2.5 px-4 text-center">Séances / Semaine</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {assignments.map((item) => {
                    const style = getSubjectVisualStyle(item.subject);

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {/* Subject */}
                        <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-slate-100">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: style.borderHex }}
                            />
                            <span>{item.subject}</span>
                          </div>
                        </td>

                        {/* Class */}
                        <td className="py-2.5 px-4 font-bold text-sky-700 dark:text-sky-300">
                          {item.className}
                        </td>

                        {/* Category */}
                        <td className="py-2.5 px-4 text-slate-500">
                          {CATEGORY_SHORT_LABELS[item.classCategory || 'French_Section']}
                        </td>

                        {/* Room & Co-assistant */}
                        <td className="py-2.5 px-4 text-slate-500">
                          <div className="truncate max-w-[180px]">
                            {item.room ? `Salle ${item.room}` : 'Salle principale'}
                            {item.assistantTeacher && (
                              <span className="ml-1 text-[10px] text-teal-600 font-medium">
                                (AT: {item.assistantTeacher})
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Periods Modifier with - / + buttons & direct input */}
                        <td className="py-2.5 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleUpdatePeriods(item, Math.max(0, item.periods - 1))}
                              className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center transition-colors cursor-pointer"
                              title="Retirer une séance (-1)"
                            >
                              <Minus className="w-3 h-3" />
                            </button>

                            <input
                              type="number"
                              min="0"
                              max="20"
                              value={item.periods}
                              onChange={(e) =>
                                handleUpdatePeriods(
                                  item,
                                  Math.max(0, parseInt(e.target.value, 10) || 0)
                                )
                              }
                              className="w-12 text-center py-0.5 rounded border border-slate-300 dark:border-slate-700 font-mono font-bold text-xs tabular-nums bg-white dark:bg-slate-900"
                            />

                            <button
                              type="button"
                              onClick={() => handleUpdatePeriods(item, item.periods + 1)}
                              className="w-6 h-6 rounded bg-teal-50 dark:bg-teal-950 hover:bg-teal-100 text-teal-700 dark:text-teal-300 font-bold flex items-center justify-center transition-colors cursor-pointer"
                              title="Ajouter une séance (+1)"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <span className="text-[11px] text-slate-400 font-medium">séances</span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteAssignment(item)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Supprimer cette attribution de la classe"
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

        {/* MODAL FOOTER */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/60">
          <div className="text-xs text-slate-500">
            Toutes les modifications sont enregistrées en temps réel et réversibles via le bouton <span className="font-bold text-rose-600">↩ Précédent</span>.
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer"
          >
            Terminer & Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
