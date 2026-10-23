import React from 'react';
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpAZ,
  ArrowUpNarrowWide,
  Check,
  Filter,
  Layers,
  ListFilter,
  SlidersHorizontal,
} from 'lucide-react';

export type ClassSortField =
  | 'name'
  | 'total_periods'
  | 'fill_rate'
  | 'level'
  | 'room';

export type ClassGroupField = 'cycle' | 'section' | 'timing_group' | 'none';

export type TeacherSortField =
  | 'name'
  | 'total_periods'
  | 'utilization'
  | 'subject'
  | 'classes_count';

export type TeacherGroupField = 'subject' | 'status' | 'section' | 'none';

export type SortDirection = 'asc' | 'desc';

interface SortGroupControlBarProps {
  mode: 'classes' | 'teachers';
  // Sort state
  currentSortField: string;
  sortDirection: SortDirection;
  onSortChange: (field: string, direction: SortDirection) => void;
  // Group state
  currentGroupField: string;
  onGroupChange: (groupField: string) => void;
  // Item count for display
  totalCount: number;
  darkMode?: boolean;
}

export const SortGroupControlBar: React.FC<SortGroupControlBarProps> = ({
  mode,
  currentSortField,
  sortDirection,
  onSortChange,
  currentGroupField,
  onGroupChange,
  totalCount,
  darkMode = false,
}) => {
  const classSortOptions: Array<{ id: ClassSortField; label: string }> = [
    { id: 'name', label: 'Nom de la classe' },
    { id: 'total_periods', label: 'Nombre total de séances' },
    { id: 'fill_rate', label: 'Taux de remplissage (%)' },
    { id: 'level', label: 'Niveau / Cycle scolaire' },
    { id: 'room', label: 'Salle de classe' },
  ];

  const teacherSortOptions: Array<{ id: TeacherSortField; label: string }> = [
    { id: 'name', label: "Nom de l'enseignant" },
    { id: 'total_periods', label: 'Charge hebdomadaire (séances)' },
    { id: 'utilization', label: 'Taux de respect du contrat (%)' },
    { id: 'subject', label: 'Discipline / Matière' },
    { id: 'classes_count', label: 'Nombre de classes prises en charge' },
  ];

  const classGroupOptions: Array<{ id: ClassGroupField; label: string }> = [
    { id: 'cycle', label: 'Par Cycle (KG / Primaire / Secondaire)' },
    { id: 'section', label: 'Par Section (Filles / Garçons)' },
    { id: 'timing_group', label: 'Par Groupe de Sonnerie / Horaires' },
    { id: 'none', label: 'Aucun (Liste continue)' },
  ];

  const teacherGroupOptions: Array<{ id: TeacherGroupField; label: string }> = [
    { id: 'subject', label: 'Par Matière / Discipline' },
    { id: 'status', label: 'Par Statut de charge (Surcharge / Équilibré / Sous-charge)' },
    { id: 'section', label: 'Par Section' },
    { id: 'none', label: 'Aucun (Liste continue)' },
  ];

  const sortOptions = mode === 'classes' ? classSortOptions : teacherSortOptions;
  const groupOptions = mode === 'classes' ? classGroupOptions : teacherGroupOptions;

  const toggleDirection = () => {
    onSortChange(currentSortField, sortDirection === 'asc' ? 'desc' : 'asc');
  };

  return (
    <div
      className={`px-3 py-2 rounded-lg border flex flex-wrap items-center justify-between gap-3 text-xs ${
        darkMode
          ? 'bg-slate-900/90 border-slate-800 text-slate-200'
          : 'bg-slate-50 border-slate-200 text-slate-800'
      }`}
    >
      {/* LEFT: Sorting Criterion Selection & Direction Toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 uppercase tracking-wider">
          <SlidersHorizontal className="w-3.5 h-3.5 text-sky-600" />
          <span>Trier selon votre critère :</span>
        </span>

        {/* Sort Criterion Selector */}
        <select
          value={currentSortField}
          onChange={(e) => onSortChange(e.target.value, sortDirection)}
          className={`px-2.5 py-1 rounded border text-xs font-semibold ${
            darkMode
              ? 'bg-slate-800 border-slate-700 text-slate-100'
              : 'bg-white border-slate-300 text-slate-900 shadow-2xs'
          }`}
          aria-label="Critère de tri personnalisé"
        >
          {sortOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Direction Toggle Button */}
        <button
          type="button"
          onClick={toggleDirection}
          className={`px-2 py-1 rounded border flex items-center gap-1 font-semibold transition-colors cursor-pointer ${
            darkMode
              ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100 shadow-2xs'
          }`}
          title={sortDirection === 'asc' ? 'Ordre croissant (cliquer pour décroissant)' : 'Ordre décroissant (cliquer pour croissant)'}
        >
          {sortDirection === 'asc' ? (
            <>
              <ArrowDownAZ className="w-3.5 h-3.5 text-sky-600" />
              <span>Croissant (A→Z / 1→9)</span>
            </>
          ) : (
            <>
              <ArrowUpAZ className="w-3.5 h-3.5 text-sky-600" />
              <span>Décroissant (Z→A / 9→1)</span>
            </>
          )}
        </button>
      </div>

      {/* RIGHT: Grouping Criterion Selection */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 uppercase tracking-wider">
          <Layers className="w-3.5 h-3.5 text-teal-600" />
          <span>Regrouper :</span>
        </span>

        <select
          value={currentGroupField}
          onChange={(e) => onGroupChange(e.target.value)}
          className={`px-2.5 py-1 rounded border text-xs font-semibold ${
            darkMode
              ? 'bg-slate-800 border-slate-700 text-slate-100'
              : 'bg-white border-slate-300 text-slate-900 shadow-2xs'
          }`}
          aria-label="Critère de regroupement personnalisé"
        >
          {groupOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>

        <span className="text-[11px] text-slate-400 font-mono tabular-nums font-semibold px-1.5">
          {totalCount} {mode === 'classes' ? 'classes' : 'enseignants'}
        </span>
      </div>
    </div>
  );
};
