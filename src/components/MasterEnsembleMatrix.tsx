import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Eye,
  Filter,
  GitMerge,
  Layers,
  Lock,
  Printer,
  Search,
  Sparkles,
  Users,
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
  darkMode?: boolean;
}

export const MasterEnsembleMatrix: React.FC<MasterEnsembleMatrixProps> = ({
  classes,
  teachers,
  lockedSlotsByClass,
  selectedCategory,
  onSelectCategory,
  onSwitchSlots,
  onEditCell,
  onOpenJointModal,
  onPrintEnsemble,
  darkMode = false,
}) => {
  const [selectedSource, setSelectedSource] = useState<{
    classId: string;
    slotKey: string;
  } | null>(null);

  const [highlightFilter, setHighlightFilter] = useState<string>('');
  const [showTeacherSubtext, setShowTeacherSubtext] = useState<boolean>(true);
  const [highlightIntercalatedOnly, setHighlightIntercalatedOnly] =
    useState<boolean>(false);
  const [showIntercalatedPanel, setShowIntercalatedPanel] =
    useState<boolean>(false);
  const [hoveredCandidate, setHoveredCandidate] =
    useState<SwitchCandidateAssessment | null>(null);

  const filteredClasses = useMemo(
    () => classes.filter((c) => classMatchesCategory(c, selectedCategory)),
    [classes, selectedCategory]
  );

  const intercalatedSessions = useMemo(
    () => detectIntercalatedSessions(classes),
    [classes]
  );

  // Build lookup set of (className__day_period) that have cross-section bell overlap or split/joint
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

  const handleCellClick = (cls: SchoolClass, day: DayOfWeek, period: number) => {
    const slotKey = `${day}_${period}`;

    // If no source is selected yet, or user clicked a different class row -> select this cell as source
    if (!selectedSource || selectedSource.classId !== cls.id) {
      setSelectedSource({ classId: cls.id, slotKey });
      return;
    }

    // If user clicked the exact same cell -> deselect
    if (selectedSource.slotKey === slotKey) {
      setSelectedSource(null);
      return;
    }

    // User clicked another cell in the SAME class row -> check compatibility and perform switch!
    const compat = rowCompatibilityMap?.[slotKey];
    if (compat && compat.status === 'blocked') {
      // Keep source selected so user sees why it's blocked in the dock, or allow double-click to edit
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
          RIBBON CONTROL BAR (aSc Horaires "Ensemble" Style + Smart Controls)
         ===================================================================== */}
      <div
        className={`border rounded-lg p-3 space-y-2.5 ${
          darkMode
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-300 text-slate-900'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Category Filter Tabs (French Section, Boys Section, Girls Section, American Section, KG/Primary) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-sky-600" />
              <span>Vue Ensemble :</span>
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
            ).map((cat) => {
              const count = classes.filter((c) =>
                classMatchesCategory(c, cat)
              ).length;
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => onSelectCategory(cat)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 ${
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

          {/* Right Actions: Rassembler 2 Classes/Profs, Intercalated Radar, Print */}
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
              className="px-2.5 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded flex items-center gap-1.5 shadow-xs"
            >
              <GitMerge className="w-3.5 h-3.5" />
              <span>Rassembler 2 Classes / 2 Enseignants</span>
            </button>

            <button
              type="button"
              onClick={() => setShowIntercalatedPanel((v) => !v)}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded border flex items-center gap-1.5 ${
                showIntercalatedPanel || highlightIntercalatedOnly
                  ? 'bg-amber-600 text-white border-amber-700'
                  : darkMode
                  ? 'bg-slate-800 border-slate-700 text-amber-400'
                  : 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>
                Séances Intercalées ({intercalatedSessions.length})
              </span>
            </button>

            <button
              type="button"
              onClick={onPrintEnsemble}
              className="px-2.5 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimer Ensemble PDF</span>
            </button>
          </div>
        </div>

        {/* Second Row: Find / Highlight Filter + Display Toggles + Instructions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/70 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5" />
              <input
                type="text"
                value={highlightFilter}
                onChange={(e) => setHighlightFilter(e.target.value)}
                placeholder="Find / Filtrer matière ou prof (ex: Biologie, Nadia)..."
                className={`pl-8 pr-6 py-1 text-xs border rounded w-64 ${
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
                Afficher Enseignant sous la matière
              </span>
            </label>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none ml-1">
              <input
                type="checkbox"
                checked={highlightIntercalatedOnly}
                onChange={(e) => setHighlightIntercalatedOnly(e.target.checked)}
                className="accent-amber-600"
              />
              <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                Isoler les séances qui s'intercalent (⇄ / ⊕)
              </span>
            </label>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
              Switch Optimal (0 conflit)
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
              Switch Possible
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
              Bloqué (Collision Prof)
            </span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          INTERCALATED SESSIONS & BELL OVERLAP RADAR PANEL (Collapsible)
         ===================================================================== */}
      {showIntercalatedPanel && (
        <div className="border-2 border-amber-300 bg-amber-50/90 text-slate-900 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-amber-700" />
                <span>
                  Détection des Séances qui s'Intercalent, Groupes Dédoublés & Chevauchements Horaires Inter-Sections ({intercalatedSessions.length})
                </span>
              </h3>
              <p className="text-xs text-amber-900 mt-0.5">
                Affiche les séances en co-enseignement / groupes alternés (ex: Arabic ⇄ Easy Arabic), les classes rassemblées (⊕), et les chevauchements d'horaires dus aux pauses décalées entre Primaire (Pause 9:30-9:50) et Secondaire (Pause 10:15-10:45).
              </p>
            </div>
            <button
              onClick={() => setShowIntercalatedPanel(false)}
              className="text-amber-900 hover:text-slate-950"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Bell Schedule Staggered Visual Comparison */}
          <div className="p-2.5 bg-white border border-amber-200 rounded text-[11px] grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <span className="font-bold text-sky-800">
                Primaire (P2-P4) :
              </span>{' '}
              P2 (8:45-9:30) → <strong>Pause (9:30-9:50)</strong> → P3{' '}
              <span className="underline font-bold text-amber-800">
                (9:50-10:35)
              </span>{' '}
              → P4 (10:35-11:15)
            </div>
            <div>
              <span className="font-bold text-purple-800">
                Secondaire Filles (P2-P4) :
              </span>{' '}
              P2 (8:45-9:30) → P3{' '}
              <span className="underline font-bold text-amber-800">
                (9:30-10:15)
              </span>{' '}
              → <strong>Pause (10:15-10:45)</strong> → P4 (10:45-11:25)
            </div>
            <div>
              <span className="font-bold text-emerald-800">
                Maternelle KG (P1-P3) :
              </span>{' '}
              P1 (8:00-8:45) → <strong>Pause (8:45-9:15)</strong> → P2{' '}
              <span className="underline font-bold text-amber-800">
                (9:15-10:00)
              </span>{' '}
              → P3 (10:00-10:45)
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
            {intercalatedSessions.map((item) => (
              <div
                key={item.id}
                className="p-2.5 bg-white border border-amber-200 rounded text-xs flex flex-col justify-between gap-1"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      item.kind === 'joint_classes'
                        ? 'bg-indigo-100 text-indigo-800'
                        : item.kind === 'cross_section_bell_overlap'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {item.kind === 'joint_classes'
                      ? '⊕ Classes Rassemblées'
                      : item.kind === 'cross_section_bell_overlap'
                      ? '⏱ Horaire Décalé Inter-Section'
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
          MASTER ENSEMBLE TABLE (All Classes × 5 Days × 8 Periods = 40 Columns)
         ===================================================================== */}
      <div className="border-2 border-slate-700 rounded-md overflow-hidden bg-[#cbd5e1] shadow-sm">
        <div className="overflow-x-auto max-h-[640px]">
          <table className="w-full border-collapse table-fixed min-w-[1360px] select-none">
            <thead className="sticky top-0 z-20">
              {/* Row 1: Day Headers */}
              <tr className="bg-[#cbd5e1] text-slate-950 h-6">
                <th
                  rowSpan={2}
                  className="w-[116px] sticky left-0 z-30 bg-[#cbd5e1] border border-slate-600 px-2 text-left text-xs font-extrabold tracking-tight"
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
              {/* Row 2: Period Numbers 1..8 under each day */}
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
                const lockedSet = new Set(lockedSlotsByClass[cls.id] || []);
                const catShort =
                  CATEGORY_SHORT_LABELS[getPrimaryClassCategory(cls)];

                return (
                  <tr
                    key={cls.id}
                    className={`h-[44px] transition-colors ${
                      isRowActive ? 'ring-2 ring-sky-500 z-10 relative' : ''
                    }`}
                  >
                    {/* Sticky Left Column: Class Name (aSc Grey Header Style) */}
                    <td
                      className={`sticky left-0 z-10 border border-slate-600 px-2 py-0.5 text-left align-middle ${
                        isRowActive
                          ? 'bg-sky-950 text-white'
                          : 'bg-[#cbd5e1] text-slate-950'
                      }`}
                    >
                      <div className="text-[11px] font-extrabold leading-tight truncate">
                        {cls.name}
                      </div>
                      <div
                        className={`text-[9px] leading-none mt-0.5 truncate ${
                          isRowActive ? 'text-sky-300' : 'text-slate-600'
                        }`}
                      >
                        {catShort}
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
                        const isLocked = lockedSet.has(slotKey);

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

                        // Filter dimming check
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

                        // Compatibility visual overlay when switching inside active row
                        let switchOverlayClass = '';
                        if (isRowActive && !isSourceCell && compat) {
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
                              backgroundColor: slot ? visual.bgHex : '#e2e8f0',
                              color: visual.textHex,
                            }}
                            title={
                              compat && isRowActive && !isSourceCell
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
                                  })${
                                    slot.subSubject
                                      ? `\n⇄ Groupe 2 : ${slot.subSubject} (${slot.subTeacher})`
                                      : ''
                                  }${
                                    slot.jointWithClasses?.length
                                      ? `\n⊕ Rassemblée avec : ${slot.jointWithClasses.join(
                                          ', '
                                        )}`
                                      : ''
                                  }\n(Clic = Switch Intelligent · Double-clic = Éditer)`
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
                            {/* Top-right indicators: Lock, Joint Class (⊕), Intercalated/Split (⇄), or Switch Badge */}
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

                            {/* Switch compatibility badge when row is in Switch Mode */}
                            {isRowActive && !isSourceCell && compat && (
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
                            ) : (
                              <div className="text-[9px] text-slate-400">—</div>
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

      {/* =====================================================================
          BOTTOM DOCK (Inspired by aSc Horaires Bottom Bar + Smart Switch Assistant)
         ===================================================================== */}
      <div className="bg-[#5c6470] text-white rounded-md p-3 shadow-md flex flex-wrap items-center justify-between gap-4">
        {selectedSource && activeSourceClass ? (
          <>
            {/* Left: Selected Subject Card (Exact style from bottom-left of screenshot) */}
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
                  {activeSourceSlot?.assistantTeacher && (
                    <span className="px-1.5 py-0.5 rounded bg-teal-600/80 text-white font-bold text-[10px]">
                      + Assistant(e) : {activeSourceSlot.assistantTeacher}
                    </span>
                  )}
                  {activeSourceSlot?.subTeacher && (
                    <span>
                      · 2e Prof (Intercalé) :{' '}
                      <strong>
                        {activeSourceSlot.subTeacher} (
                        {activeSourceSlot.subSubject})
                      </strong>
                    </span>
                  )}
                  {activeSourceSlot?.jointWithClasses?.length ? (
                    <span className="bg-indigo-600 px-1.5 py-0.5 rounded text-[10px] font-bold">
                      ⊕ Rassemblée avec :{' '}
                      {activeSourceSlot.jointWithClasses.join(', ')}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Center: Hovered Candidate Diagnostics OR Top Recommended Switches */}
            <div className="flex-1 min-w-[280px]">
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
                      Cliquez sur une case verte de la ligne {activeSourceClass.name} pour permuter, ou choisissez un Switch IA optimal :
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {topRecommendedSwitches.length === 0 ? (
                      <span className="text-xs text-slate-300">
                        Aucun autre créneau compatible sans conflit pour cet enseignant.
                      </span>
                    ) : (
                      topRecommendedSwitches.map((rec) => (
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
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors"
                        >
                          <ArrowLeftRight className="w-3 h-3" />
                          <span>
                            {rec.day} P{rec.period} (
                            {rec.targetSlot?.subject || 'Libre'})
                          </span>
                          <span className="text-[10px] font-mono bg-emerald-800 px-1 rounded">
                            +{rec.scoreDelta}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Edit / Co-Teach / Deselect Actions */}
            <div className="flex items-center gap-2 shrink-0">
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
                className="px-3 py-1.5 bg-white text-slate-900 hover:bg-slate-100 rounded text-xs font-bold"
              >
                Éditer / 2e Prof
              </button>
              <button
                onClick={() => setSelectedSource(null)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium"
              >
                Annuler
              </button>
            </div>
          </>
        ) : (
          <div className="w-full flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-extrabold text-yellow-300 text-sm">
                Mode Switch Intelligent Actif
              </span>
              <span className="text-slate-200">
                Cliquez sur n'importe quelle matière dans le tableau ci-dessus pour analyser instantanément les 40 périodes et permuter sans conflit, ou double-cliquez pour modifier.
              </span>
            </div>
            <div className="font-mono text-[11px] bg-slate-700/80 px-2.5 py-1 rounded text-slate-200">
              Filter: ({CATEGORY_SHORT_LABELS[selectedCategory]}) ·{' '}
              {filteredClasses.length} classes affichées
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
