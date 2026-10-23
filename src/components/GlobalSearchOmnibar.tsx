import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Calendar,
  ChevronRight,
  GraduationCap,
  Layers,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { SchoolClass, TeacherProfile } from '../types/timetable';
import { CATEGORY_SHORT_LABELS } from '../utils/timetableAnalytics';

interface GlobalSearchOmnibarProps {
  classes: SchoolClass[];
  teachers: TeacherProfile[];
  onSelectClass: (classId: string) => void;
  onSelectTeacher: (teacherId: string) => void;
  onOpenClassManager: () => void;
  onOpenTeachersDirectory: () => void;
  darkMode?: boolean;
}

export const GlobalSearchOmnibar: React.FC<GlobalSearchOmnibarProps> = ({
  classes,
  teachers,
  onSelectClass,
  onSelectTeacher,
  onOpenClassManager,
  onOpenTeachersDirectory,
  darkMode = false,
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keyboard shortcut Ctrl+K or Cmd+K or / to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter Matching Classes
  const matchingClasses = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return classes.slice(0, 6);
    return classes
      .filter((c) => {
        const matchName = c.name.toLowerCase().includes(q);
        const matchRoom = c.room.toLowerCase().includes(q);
        const matchCat = c.category && c.category.toLowerCase().includes(q);
        const matchSec = c.section.toLowerCase().includes(q);
        const matchSubj = Object.values(c.slots).some((s) =>
          s.subject.toLowerCase().includes(q)
        );
        return matchName || matchRoom || matchCat || matchSec || matchSubj;
      })
      .slice(0, 8);
  }, [classes, query]);

  // Filter Matching Teachers
  const matchingTeachers = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return teachers.slice(0, 6);
    return teachers
      .filter((t) => {
        const matchName = t.name.toLowerCase().includes(q);
        const matchSec = t.section.toLowerCase().includes(q);
        const matchSubj = t.subjects.some((s) => s.toLowerCase().includes(q));
        return matchName || matchSec || matchSubj;
      })
      .slice(0, 8);
  }, [teachers, query]);

  // Count total sessions for each teacher
  const teacherPeriodsCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const cls of classes) {
      for (const slot of Object.values(cls.slots)) {
        if (slot.teacher) {
          const t = slot.teacher.trim();
          map.set(t, (map.get(t) || 0) + 1);
        }
      }
    }
    return map;
  }, [classes]);

  const totalResults = matchingClasses.length + matchingTeachers.length;

  const handleSelectClassItem = (classId: string) => {
    onSelectClass(classId);
    setIsOpen(false);
    setQuery('');
  };

  const handleSelectTeacherItem = (teacherId: string) => {
    onSelectTeacher(teacherId);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      {/* Search Bar Input */}
      <div
        className={`relative flex items-center rounded-lg border transition-all ${
          isOpen
            ? 'border-sky-500 ring-2 ring-sky-500/20 bg-white dark:bg-slate-800'
            : darkMode
            ? 'border-slate-700 bg-slate-800/80 hover:border-slate-600'
            : 'border-slate-300 bg-slate-50/90 hover:border-slate-400'
        }`}
      >
        <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />

        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          placeholder="Rechercher une classe ou un enseignant... (Ctrl+K)"
          className={`w-full pl-9 pr-16 py-1.5 text-xs font-semibold rounded-lg focus:outline-none ${
            darkMode ? 'text-white placeholder-slate-400' : 'text-slate-900 placeholder-slate-500'
          }`}
        />

        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-8 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}

        <kbd className="absolute right-2.5 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-200/60 dark:bg-slate-700 rounded border border-slate-300/80 dark:border-slate-600 pointer-events-none">
          ⌘K
        </kbd>
      </div>

      {/* Floating Dropdown Results Popup */}
      {isOpen && (
        <div
          className={`absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border shadow-2xl overflow-hidden backdrop-blur-md ${
            darkMode
              ? 'bg-slate-900/95 border-slate-700 text-slate-100'
              : 'bg-white/95 border-slate-200 text-slate-900'
          }`}
        >
          {/* Quick Action Buttons Header */}
          <div className="p-2 bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                onOpenClassManager();
                setIsOpen(false);
              }}
              className="px-2.5 py-1 rounded-md text-[11px] font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Ajouter / Gérer Classe</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenTeachersDirectory();
                setIsOpen(false);
              }}
              className="px-2.5 py-1 rounded-md text-[11px] font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Voir Tous les Enseignants</span>
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 p-1">
            {/* GROUP 1: CLASSES */}
            {matchingClasses.length > 0 && (
              <div className="py-1.5">
                <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3 h-3 text-sky-500" />
                    <span>Classes ({matchingClasses.length})</span>
                  </span>
                  <span className="text-[10px] text-slate-400 lowercase">cliquer pour ouvrir</span>
                </div>

                <div className="space-y-0.5 mt-0.5">
                  {matchingClasses.map((cls) => {
                    const sessionCount = Object.values(cls.slots).filter((s) =>
                      Boolean(s.subject)
                    ).length;

                    return (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => handleSelectClassItem(cls.id)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors flex items-center justify-between gap-3 group cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-sky-700 dark:group-hover:text-sky-300">
                              {cls.name}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                              {CATEGORY_SHORT_LABELS[cls.category || 'French_Section']}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            Salle : {cls.room} · Section : {cls.section}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-mono font-extrabold text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950 px-2 py-0.5 rounded tabular-nums">
                            {sessionCount} séances
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-sky-600 transition-colors" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* GROUP 2: ENSEIGNANTS */}
            {matchingTeachers.length > 0 && (
              <div className="py-1.5">
                <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <GraduationCap className="w-3 h-3 text-teal-500" />
                    <span>Enseignants ({matchingTeachers.length})</span>
                  </span>
                  <span className="text-[10px] text-slate-400 lowercase">cliquer pour emploi du temps</span>
                </div>

                <div className="space-y-0.5 mt-0.5">
                  {matchingTeachers.map((t) => {
                    const sessionCount = teacherPeriodsCountMap.get(t.name) || 0;
                    const maxQuota = t.maxPeriodsPerWeek || 24;

                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleSelectTeacherItem(t.id)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors flex items-center justify-between gap-3 group cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-teal-700 dark:group-hover:text-teal-300">
                              {t.name}
                            </span>
                            {t.isAssistant && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 font-bold">
                                Assist.
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            Matières : {t.subjects.join(', ')} · Section : {t.section}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-mono font-extrabold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950 px-2 py-0.5 rounded tabular-nums">
                            {sessionCount} / {maxQuota}p
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-teal-600 transition-colors" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {totalResults === 0 && (
              <div className="p-6 text-center text-xs text-slate-500">
                Aucun résultat pour "{query}". Essayez un nom de classe ou un enseignant.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
