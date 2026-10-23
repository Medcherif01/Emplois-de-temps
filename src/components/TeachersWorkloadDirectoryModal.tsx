import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  Filter,
  GraduationCap,
  Layers,
  Printer,
  Search,
  Sparkles,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  DayOfWeek,
  SchoolCategory,
  SchoolClass,
  TeacherProfile,
} from '../types/timetable';
import {
  CATEGORY_LABELS,
  CATEGORY_SHORT_LABELS,
  getSubjectVisualStyle,
  teacherMatchesCategory,
} from '../utils/timetableAnalytics';
import { DAYS_OF_WEEK } from '../data/alkawtharDefaults';
import {
  SortGroupControlBar,
  SortDirection,
  TeacherSortField,
  TeacherGroupField,
} from './SortGroupControlBar';

interface TeachersWorkloadDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  teachers: TeacherProfile[];
  classes: SchoolClass[];
  selectedCategory: SchoolCategory;
  onSelectCategory: (cat: SchoolCategory) => void;
  onSelectTeacherForTimetable?: (teacherId: string) => void;
  onOpenTeacherDetail?: (teacherId: string) => void;
  onPrintTeacherReport?: () => void;
  darkMode?: boolean;
}

export const TeachersWorkloadDirectoryModal: React.FC<
  TeachersWorkloadDirectoryModalProps
> = ({
  isOpen,
  onClose,
  teachers,
  classes,
  selectedCategory,
  onSelectCategory,
  onSelectTeacherForTimetable,
  onOpenTeacherDetail,
  onPrintTeacherReport,
  darkMode = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'normal' | 'overload' | 'underload'>('all');

  // Compute detailed teaching breakdown for each teacher
  const teacherCardsData = useMemo(() => {
    return teachers
      .filter((t) => teacherMatchesCategory(t, selectedCategory, classes))
      .map((t) => {
        const tLower = t.name.toLowerCase().trim();

        // 1. Map of Subject -> Map of ClassName -> periods count
        const subjectClassMap = new Map<
          string,
          {
            subject: string;
            totalSubjectPeriods: number;
            classes: Array<{ className: string; classId: string; periods: number; isAssistant: boolean }>;
          }
        >();

        // 2. Day by day periods distribution
        const dayDistribution: Record<DayOfWeek, number> = {
          Dimanche: 0,
          Lundi: 0,
          Mardi: 0,
          Mercredi: 0,
          Jeudi: 0,
        };

        const classesTaughtSet = new Set<string>();
        let totalSessionsCount = 0;

        for (const cls of classes) {
          for (const [slotKey, slot] of Object.entries(cls.slots)) {
            if (!slot.subject) continue;
            const isMain =
              slot.teacher && slot.teacher.toLowerCase().trim() === tLower;
            const isAss =
              slot.assistantTeacher &&
              slot.assistantTeacher.toLowerCase().trim() === tLower;

            if (isMain || isAss) {
              totalSessionsCount++;
              classesTaughtSet.add(cls.name);

              const [dayStr] = slotKey.split('_');
              if (dayStr in dayDistribution) {
                dayDistribution[dayStr as DayOfWeek]++;
              }

              const subj = slot.subject.trim();
              if (!subjectClassMap.has(subj)) {
                subjectClassMap.set(subj, {
                  subject: subj,
                  totalSubjectPeriods: 0,
                  classes: [],
                });
              }

              const subjEntry = subjectClassMap.get(subj)!;
              subjEntry.totalSubjectPeriods++;

              const existingCls = subjEntry.classes.find(
                (c) => c.classId === cls.id
              );
              if (existingCls) {
                existingCls.periods++;
              } else {
                subjEntry.classes.push({
                  className: cls.name,
                  classId: cls.id,
                  periods: 1,
                  isAssistant: Boolean(isAss && !isMain),
                });
              }
            }
          }
        }

        const subjectsList = Array.from(subjectClassMap.values()).sort(
          (a, b) => b.totalSubjectPeriods - a.totalSubjectPeriods
        );

        const maxCap = t.maxPeriodsPerWeek || 24;
        const utilization = Math.round((totalSessionsCount / maxCap) * 100);

        let workloadStatus: 'normal' | 'overload' | 'underload' = 'normal';
        if (totalSessionsCount > maxCap) {
          workloadStatus = 'overload';
        } else if (totalSessionsCount < 10) {
          workloadStatus = 'underload';
        }

        return {
          teacher: t,
          totalSessionsCount,
          maxCap,
          utilization,
          workloadStatus,
          classesTaught: Array.from(classesTaughtSet),
          subjectsList,
          dayDistribution,
        };
      });
  }, [teachers, classes, selectedCategory]);

  // Filtered teachers list based on search and status
  const filteredTeacherCards = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return teacherCardsData.filter((card) => {
      // Status filter
      if (statusFilter !== 'all' && card.workloadStatus !== statusFilter) {
        return false;
      }
      if (!q) return true;

      const matchName = card.teacher.name.toLowerCase().includes(q);
      const matchSection = card.teacher.section.toLowerCase().includes(q);
      const matchSubjects = card.teacher.subjects.some((s) =>
        s.toLowerCase().includes(q)
      );
      const matchTaughtSubjects = card.subjectsList.some((s) =>
        s.subject.toLowerCase().includes(q)
      );
      const matchClasses = card.classesTaught.some((c) =>
        c.toLowerCase().includes(q)
      );

      return (
        matchName ||
        matchSection ||
        matchSubjects ||
        matchTaughtSubjects ||
        matchClasses
      );
    });
  }, [teacherCardsData, searchQuery, statusFilter]);

  // User-selected sorting and grouping state
  const [sortField, setSortField] = useState<TeacherSortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [groupField, setGroupField] = useState<TeacherGroupField>('none');

  const sortedAndGroupedCards = useMemo(() => {
    const list = [...filteredTeacherCards].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.teacher.name.localeCompare(b.teacher.name);
      } else if (sortField === 'total_periods') {
        cmp = a.totalSessionsCount - b.totalSessionsCount;
      } else if (sortField === 'utilization') {
        cmp = a.utilization - b.utilization;
      } else if (sortField === 'subject') {
        cmp = (a.teacher.subjects[0] || '').localeCompare(b.teacher.subjects[0] || '');
      } else if (sortField === 'classes_count') {
        cmp = a.classesTaught.length - b.classesTaught.length;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    if (groupField === 'none') {
      return [{ groupName: '', cards: list }];
    }

    const groupsMap = new Map<string, typeof list>();
    list.forEach((item) => {
      let key = 'Autres';
      if (groupField === 'subject') {
        key = item.teacher.subjects[0] || 'Sans discipline';
      } else if (groupField === 'status') {
        key =
          item.workloadStatus === 'overload'
            ? 'En Surcharge (> quota)'
            : item.workloadStatus === 'underload'
            ? 'En Sous-charge (< 10 séances)'
            : 'Charge Normale';
      } else if (groupField === 'section') {
        key = item.teacher.section || 'Général';
      }
      if (!groupsMap.has(key)) {
        groupsMap.set(key, []);
      }
      groupsMap.get(key)!.push(item);
    });

    return Array.from(groupsMap.entries()).map(([groupName, cards]) => ({
      groupName,
      cards,
    }));
  }, [filteredTeacherCards, sortField, sortDirection, groupField]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 no-print overflow-y-auto">
      <div
        className={`w-full max-w-6xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
          darkMode
            ? 'bg-slate-900 border-slate-700 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header Bar */}
        <div className="px-6 py-4 bg-gradient-to-r from-teal-900 via-sky-900 to-indigo-950 text-white flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-teal-500/20 text-teal-300 rounded-lg">
                <GraduationCap className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-black tracking-tight">
                Répertoire des Enseignants · Matières Enseignées & Charges de Séances
              </h2>
            </div>
            <p className="text-xs text-teal-200 mt-1">
              Vue détaillée pour chaque enseignant : matières enseignées, classes prises en charge, et nombre total de séances par semaine.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onPrintTeacherReport && (
              <button
                onClick={onPrintTeacherReport}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimer le Répertoire</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="px-6 py-3 bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Category Pills */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" />
              <span>Section :</span>
            </span>
            {(
              [
                'ALL',
                'French_Section',
                'Primaire',
                'Secondaire',
                'KG_Maternelle',
                'Boys_Section',
                'Girls_Section',
              ] as SchoolCategory[]
            ).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => onSelectCategory(cat)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
                }`}
              >
                {CATEGORY_SHORT_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Quick Search & Status Filter */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Chercher prof, matière, classe..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              <option value="all">Tous statuts ({teacherCardsData.length})</option>
              <option value="normal">Charge équilibrée</option>
              <option value="overload">Surcharges (&gt; quota)</option>
              <option value="underload">Sous-charges (&lt; 10p)</option>
            </select>
          </div>
        </div>

        {/* User-selected Sort & Group Controller Bar */}
        <div className="px-6 pt-3 pb-1 border-b border-slate-200 dark:border-slate-800">
          <SortGroupControlBar
            mode="teachers"
            currentSortField={sortField}
            sortDirection={sortDirection}
            onSortChange={(field, dir) => {
              setSortField(field as TeacherSortField);
              setSortDirection(dir);
            }}
            currentGroupField={groupField}
            onGroupChange={(grp) => setGroupField(grp as TeacherGroupField)}
            totalCount={filteredTeacherCards.length}
            darkMode={darkMode}
          />
        </div>

        {/* Teachers Cards List */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {filteredTeacherCards.length === 0 ? (
            <div className="p-12 text-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl text-slate-500 text-xs">
              Aucun enseignant ne correspond à vos critères de recherche.
            </div>
          ) : (
            <div className="space-y-6">
              {sortedAndGroupedCards.map((group, grpIdx) => (
                <div key={group.groupName || grpIdx} className="space-y-3">
                  {group.groupName && (
                    <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-1.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                        {group.groupName}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                        ({group.cards.length} enseignant{group.cards.length > 1 ? 's' : ''})
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {group.cards.map((card) => {
                      const {
                        teacher,
                        totalSessionsCount,
                        maxCap,
                        utilization,
                        workloadStatus,
                        subjectsList,
                        dayDistribution,
                      } = card;

                      return (
                        <div
                          key={teacher.id}
                          className={`rounded-xl border p-4.5 transition-all flex flex-col justify-between shadow-2xs ${
                            darkMode
                              ? 'bg-slate-800/80 border-slate-700 hover:border-teal-500'
                              : 'bg-white border-slate-200 hover:border-teal-600 hover:shadow-sm'
                          }`}
                        >
                          <div>
                            {/* Top Header: Name, Section & Total Sessions Badge */}
                            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-700/80">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                                    {teacher.name}
                                  </h3>
                                  {teacher.isAssistant && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                                      Assistant(e)
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                  Section : {teacher.section} · Spécialité : {teacher.subjects.join(', ')}
                                </p>
                              </div>

                              {/* Total Sessions Count */}
                              <div className="text-right shrink-0">
                                <div className="inline-flex items-baseline gap-1 font-mono">
                                  <span className="text-lg font-black text-teal-700 dark:text-teal-400 tabular-nums">
                                    {totalSessionsCount}
                                  </span>
                                  <span className="text-xs text-slate-400 font-bold">
                                    / {maxCap}p
                                  </span>
                                </div>
                                <div className="text-[10px] font-bold mt-0.5">
                                  {workloadStatus === 'overload' ? (
                                    <span className="text-rose-600 dark:text-rose-400">⚠️ Surcharge ({utilization}%)</span>
                                  ) : workloadStatus === 'underload' ? (
                                    <span className="text-amber-600 dark:text-amber-400">Temps partiel ({utilization}%)</span>
                                  ) : (
                                    <span className="text-emerald-600 dark:text-emerald-400">Équilibré ({utilization}%)</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Visual Load Progress Bar */}
                            <div className="mt-2.5">
                              <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    workloadStatus === 'overload'
                                      ? 'bg-rose-500'
                                      : workloadStatus === 'underload'
                                      ? 'bg-amber-400'
                                      : 'bg-teal-500'
                                  }`}
                                  style={{ width: `${Math.min(100, utilization)}%` }}
                                />
                              </div>
                            </div>

                            {/* CE QU'IL ENSEIGNE */}
                            <div className="mt-3.5 space-y-2">
                              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                <BookOpen className="w-3.5 h-3.5 text-teal-600" />
                                <span>Matières & Classes enseignées :</span>
                              </div>

                              {subjectsList.length === 0 ? (
                                <div className="text-xs text-slate-400 italic">
                                  Aucune séance actuellement affectée dans l'emploi du temps.
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  {subjectsList.map((subj) => {
                                    const style = getSubjectVisualStyle(subj.subject);
                                    return (
                                      <div
                                        key={subj.subject}
                                        className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 text-xs"
                                      >
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                          <span
                                            className="inline-block px-2 py-0.5 rounded font-bold text-[11px]"
                                            style={{
                                              backgroundColor: style.bgHex,
                                              color: style.textHex,
                                              border: `1px solid ${style.borderHex}`,
                                            }}
                                          >
                                            {subj.subject}
                                          </span>
                                          <span className="font-mono font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                                            {subj.totalSubjectPeriods} séance{subj.totalSubjectPeriods > 1 ? 's' : ''}/sem
                                          </span>
                                        </div>

                                        {/* List of classes with their session count */}
                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                          {subj.classes.map((cls) => (
                                            <span
                                              key={cls.classId}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-medium text-slate-800 dark:text-slate-200"
                                            >
                                              <span className="font-bold">{cls.className}</span>
                                              <span className="font-mono font-black text-teal-700 dark:text-teal-400 tabular-nums">
                                                ({cls.periods}p)
                                              </span>
                                              {cls.isAssistant && (
                                                <span className="text-[9px] text-teal-600 font-semibold">(Assist.)</span>
                                              )}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Day by Day Breakdown */}
                            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                              <span className="font-bold text-slate-500">Répartition :</span>
                              <div className="flex items-center gap-2 font-mono">
                                {DAYS_OF_WEEK.map((d) => (
                                  <span key={d} className="tabular-nums text-slate-700 dark:text-slate-300">
                                    <span className="text-slate-400">{d.slice(0, 3)}:</span>{' '}
                                    <strong>{dayDistribution[d]}</strong>
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Dual Actions: Modify Teacher Sheet & Jump to Timetable */}
                          <div className="mt-4 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                            {onOpenTeacherDetail && (
                              <button
                                type="button"
                                onClick={() => {
                                  onOpenTeacherDetail(teacher.id);
                                  onClose();
                                }}
                                className="px-2.5 py-1.5 text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 dark:hover:bg-sky-900 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                                title="Modifier les attributions de cet enseignant, ses matières et séances"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-sky-600" />
                                <span>Fiche & Modifier</span>
                              </button>
                            )}

                            {onSelectTeacherForTimetable && (
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectTeacherForTimetable(teacher.id);
                                  onClose();
                                }}
                                className="px-2.5 py-1.5 text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ml-auto"
                              >
                                <Calendar className="w-3.5 h-3.5" />
                                <span>Voir Grille Hebdomadaire</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            Affichage de <strong>{filteredTeacherCards.length}</strong> enseignant(s) sur {teachers.length} au total de l'établissement.
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
