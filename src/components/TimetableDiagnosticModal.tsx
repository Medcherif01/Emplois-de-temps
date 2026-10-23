import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  GraduationCap,
  Layers,
  Lock,
  Play,
  RefreshCw,
  Settings,
  ShieldAlert,
  Sparkles,
  Unlock,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import {
  DayOfWeek,
  SchoolCategory,
  SchoolClass,
  TeacherProfile,
} from '../types/timetable';
import { CATEGORY_SHORT_LABELS } from '../utils/timetableAnalytics';

interface DiagnosticIssue {
  id: string;
  type: 'overload' | 'underload' | 'class_unfilled' | 'tight_constraint' | 'conflict';
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  targetId: string;
  targetType: 'teacher' | 'class';
  actionLabel: string;
}

interface TimetableDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: SchoolClass[];
  teachers: TeacherProfile[];
  onOpenTeacherDetail: (teacherId: string) => void;
  onOpenClassManager: (classId?: string) => void;
  onRunGeneration: (options: {
    category: SchoolCategory;
    balanceMorningSubjects: boolean;
    minimizeGaps: boolean;
    respectOffDays: boolean;
  }) => void;
  onLockAll: () => void;
  onUnlockAll: () => void;
  isAllLocked: boolean;
  darkMode?: boolean;
}

export const TimetableDiagnosticModal: React.FC<TimetableDiagnosticModalProps> = ({
  isOpen,
  onClose,
  classes,
  teachers,
  onOpenTeacherDetail,
  onOpenClassManager,
  onRunGeneration,
  onLockAll,
  onUnlockAll,
  isAllLocked,
  darkMode = false,
}) => {
  // Generation Options State
  const [selectedTargetCategory, setSelectedTargetCategory] = useState<SchoolCategory>('ALL');
  const [balanceMorningSubjects, setBalanceMorningSubjects] = useState(true);
  const [minimizeGaps, setMinimizeGaps] = useState(true);
  const [respectOffDays, setRespectOffDays] = useState(true);
  const [activeTab, setActiveTab] = useState<'diagnostic' | 'generator_settings'>('diagnostic');

  // Compute live diagnostic issues
  const diagnosticReport = useMemo(() => {
    const issues: DiagnosticIssue[] = [];

    // 1. Check each teacher's assigned periods vs contract quota
    const teacherPeriodsMap = new Map<string, number>();
    classes.forEach((cls) => {
      Object.values(cls.slots).forEach((s) => {
        if (!s || !s.subject) return;
        if (s.teacher) {
          const tLower = s.teacher.trim().toLowerCase();
          teacherPeriodsMap.set(tLower, (teacherPeriodsMap.get(tLower) || 0) + 1);
        }
      });
    });

    teachers.forEach((t) => {
      const assigned = teacherPeriodsMap.get(t.name.trim().toLowerCase()) || 0;
      const maxQuota = t.maxPeriodsPerWeek || 24;

      if (assigned > maxQuota) {
        issues.push({
          id: `overload_${t.id}`,
          type: 'overload',
          severity: 'error',
          title: `Enseignant en surcharge : ${t.name}`,
          description: `${assigned} séances assignées pour un contrat max de ${maxQuota} séances (+${assigned - maxQuota} séances en trop).`,
          targetId: t.id,
          targetType: 'teacher',
          actionLabel: 'Modifier attributions',
        });
      } else if (assigned === 0 && !t.isAssistant) {
        issues.push({
          id: `zero_${t.id}`,
          type: 'underload',
          severity: 'warning',
          title: `Aucune séance attribuée : ${t.name}`,
          description: `Cet enseignant figure dans l'équipe (${t.subjects.join(', ')}) mais n'a aucun cours planifié (0 / ${maxQuota} séances).`,
          targetId: t.id,
          targetType: 'teacher',
          actionLabel: 'Attribuer des classes',
        });
      } else if (assigned < maxQuota * 0.5 && !t.isAssistant) {
        issues.push({
          id: `underload_${t.id}`,
          type: 'underload',
          severity: 'info',
          title: `Sous-charge importante : ${t.name}`,
          description: `Seulement ${assigned} séances assignées sur ${maxQuota} prévues (${Math.round((assigned / maxQuota) * 100)}% d'utilisation).`,
          targetId: t.id,
          targetType: 'teacher',
          actionLabel: 'Compléter la charge',
        });
      }

      // Check for overly restrictive unavailable slots
      const unavail = (t.unavailableSlots || []).length;
      if (unavail > 15) {
        issues.push({
          id: `tight_${t.id}`,
          type: 'tight_constraint',
          severity: 'warning',
          title: `Contraintes de temps libre très serrées : ${t.name}`,
          description: `${unavail} créneaux interdits (✕). Le solveur risque d'avoir des difficultés à placer ses ${assigned} séances.`,
          targetId: t.id,
          targetType: 'teacher',
          actionLabel: 'Ajuster temps libre',
        });
      }
    });

    // 2. Check each class fill rate
    classes.forEach((cls) => {
      const targetWeekly =
        cls.section === 'KG' ? 30 : cls.section === 'KG3_GS' ? 35 : 40;
      const placed = Object.values(cls.slots).filter((s) => Boolean(s?.subject)).length;

      if (placed < targetWeekly * 0.7) {
        issues.push({
          id: `unfilled_${cls.id}`,
          type: 'class_unfilled',
          severity: 'warning',
          title: `Classe incomplète : ${cls.name}`,
          description: `Seulement ${placed} séances placées sur une capacité de ${targetWeekly} séances/semaine.`,
          targetId: cls.id,
          targetType: 'class',
          actionLabel: 'Gérer matières classe',
        });
      }
    });

    return issues;
  }, [classes, teachers]);

  const errorCount = diagnosticReport.filter((i) => i.severity === 'error').length;
  const warningCount = diagnosticReport.filter((i) => i.severity === 'warning').length;
  const infoCount = diagnosticReport.filter((i) => i.severity === 'info').length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-xs">
      <div
        className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-xl shadow-2xl border overflow-hidden ${
          darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* MODAL HEADER */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/80 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-black text-base shadow-xs shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Assistant Génération & Diagnostic Pré-Vol
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded font-black bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300">
                  Moteur CP-SAT
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Vérifiez la faisabilité mathématique avant de lancer la génération pour garantir un emploi du temps 100% sans conflit.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SUB-TABS */}
        <div className="px-6 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('diagnostic')}
            className={`py-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'diagnostic'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Audit de Faisabilité & Anomalies</span>
            {errorCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-600 text-white font-mono">
                {errorCount}
              </span>
            ) : warningCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-mono">
                {warningCount}
              </span>
            ) : (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-600 text-white">✓</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('generator_settings')}
            className={`py-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'generator_settings'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Objectifs & Options de Génération</span>
          </button>
        </div>

        {/* TAB 1: DIAGNOSTIC & AUDIT */}
        {activeTab === 'diagnostic' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Summary score banner */}
            <div
              className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                errorCount > 0
                  ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900'
                  : warningCount > 0
                  ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900'
                  : 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900'
              }`}
            >
              <div className="flex items-center gap-3">
                {errorCount > 0 ? (
                  <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
                ) : warningCount > 0 ? (
                  <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                )}
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {errorCount > 0
                      ? `${errorCount} point(s) bloquant(s) détecté(s)`
                      : warningCount > 0
                      ? `Prêt pour la génération avec ${warningCount} point(s) d'attention`
                      : 'Structure 100% conforme et prête pour la génération automatique'}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    {errorCount > 0
                      ? 'Des enseignants dépassent leur quota contractuel. Ajustez les charges pour éviter les échecs du solveur.'
                      : 'Toutes les capacités contractuelles et les contraintes horaires sont respectées.'}
                  </div>
                </div>
              </div>

              {/* Fast lock / unlock controls */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={isAllLocked ? onUnlockAll : onLockAll}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isAllLocked
                      ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-50'
                  }`}
                  title={isAllLocked ? 'Déverrouiller tous les créneaux' : 'Verrouiller tous les cours placés'}
                >
                  {isAllLocked ? (
                    <>
                      <Unlock className="w-3.5 h-3.5 text-amber-700" />
                      <span>Déverrouiller Tout</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5 text-slate-600" />
                      <span>Verrouiller Tout</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* List of issues */}
            {diagnosticReport.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-emerald-200 dark:border-emerald-900/60 rounded-xl bg-emerald-50/20">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Aucun conflit ni incohérence détecté
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Tous les enseignants respectent leurs quotas hebdomadaires, aucune classe n'est sous-dotée et les contraintes sont cohérentes.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Détail des vérifications ({diagnosticReport.length})
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                  {diagnosticReport.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {item.severity === 'error' ? (
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        ) : item.severity === 'warning' ? (
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                        )}

                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {item.description}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (item.targetType === 'teacher') {
                            onOpenTeacherDetail(item.targetId);
                          } else {
                            onOpenClassManager(item.targetId);
                          }
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                      >
                        <span>{item.actionLabel}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: GENERATOR OBJECTIVES & OPTIONS */}
        {activeTab === 'generator_settings' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">
                Objectifs & Priorités de Génération Automatique
              </h3>
              <p className="text-xs text-slate-500">
                Configurez les pondérations que le solveur CP-SAT doit privilégier lors de l'assemblage de l'emploi du temps.
              </p>
            </div>

            {/* Scope Selection: All Campus vs Specific Section */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Périmètre de génération :
              </label>
              <select
                value={selectedTargetCategory}
                onChange={(e) => setSelectedTargetCategory(e.target.value as SchoolCategory)}
                className="w-full sm:w-80 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
              >
                <option value="ALL">Tout le Campus (35 classes · Maternelle, Primaire, Secondaire)</option>
                <option value="KG_Maternelle">Cycle Maternelle (KG1 à KG3)</option>
                <option value="Primaire">Cycle Primaire (CP à CM2)</option>
                <option value="Secondaire">Cycle Secondaire (Collège & Lycée)</option>
                <option value="Girls_Section">Section Filles</option>
                <option value="Boys_Section">Section Garçons</option>
              </select>
            </div>

            {/* Policy Toggles */}
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Critères Pédagogiques du Solveur
              </div>

              {/* 1. Daily Balance */}
              <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={balanceMorningSubjects}
                  onChange={(e) => setBalanceMorningSubjects(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    Équilibre pédagogique : Matières fondamentales le matin
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Positionne prioritairement les mathématiques, français, sciences et arabe sur les créneaux matinaux (P1 à P4).
                  </div>
                </div>
              </label>

              {/* 2. Gap Minimization */}
              <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={minimizeGaps}
                  onChange={(e) => setMinimizeGaps(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    Minimisation des heures creuses (anti-trous enseignants)
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Rapproche les cours d'un même professeur pour éviter qu'il n'ait des heures isolées sans cours dans la journée.
                  </div>
                </div>
              </label>

              {/* 3. Respect Off Days */}
              <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={respectOffDays}
                  onChange={(e) => setRespectOffDays(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    Respect strict des demi-journées libres et contraintes aSc (✕ et ?)
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Garantit zéro cours placé sur les créneaux marqués en rouge (✕) et minimise les créneaux en jaune (?).
                  </div>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* MODAL FOOTER WITH PRIMARY ACTION */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Fermer
          </button>

          <button
            type="button"
            onClick={() => {
              onRunGeneration({
                category: selectedTargetCategory,
                balanceMorningSubjects,
                minimizeGaps,
                respectOffDays,
              });
              onClose();
            }}
            className="px-5 py-2 rounded-lg text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Lancer la Génération Optimale ({CATEGORY_SHORT_LABELS[selectedTargetCategory]})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
