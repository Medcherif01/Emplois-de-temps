import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Globe,
  History,
  Layers,
  LayoutGrid,
  Lock,
  LogIn,
  LogOut,
  MessageSquare,
  Moon,
  Printer,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  Send,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  Upload,
  UserCheck,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  BELL_SCHEDULES,
  buildTeacherTimetable,
  DAYS_OF_WEEK,
  DEFAULT_CLASSES,
  DEFAULT_TEACHERS,
  detectScheduleConflicts,
  SCHOOL_INFO,
  SECTION_LABELS,
} from './data/alkawtharDefaults';
import {
  DayOfWeek,
  LessonSlot,
  NotificationEntry,
  ScheduleConflict,
  SchoolCategory,
  SchoolClass,
  SectionType,
  TeacherProfile,
} from './types/timetable';
import {
  generateStandaloneLandscapeHtml,
  LandscapeTimetableSheet,
} from './components/LandscapeTimetableSheet';
import { MasterEnsembleMatrix } from './components/MasterEnsembleMatrix';
import { LoadsAndManagementWorkspace } from './components/LoadsAndManagementWorkspace';
import {
  CATEGORY_SHORT_LABELS,
  classMatchesCategory,
  computeSubjectsLoadReport,
  computeTeachersLoadReport,
  generatePrintableEnsembleHtml,
  generatePrintableLoadReportHtml,
  teacherMatchesCategory,
} from './utils/timetableAnalytics';
import {
  CsvValidationIssue,
  generateExcelCsvExport,
  generateICalendarExport,
  generateMongoAtlasExport,
  generateMySqlDump,
  parseAndValidateImportedCsv,
  ParsedCsvRow,
} from './utils/exportDatabase';
import {
  ConstraintRule,
  DEFAULT_CONSTRAINTS,
  DEFAULT_ROOMS,
  DEFAULT_SUBJECT_CONFIGS,
  evaluateTimetableQuality,
  findSubstituteCandidates,
  GeneratedProposal,
  generateRankedProposals,
  ProposedAiSwap,
  RoomResource,
  SubjectConfig,
  verifySwapsWithConstraintEngine,
} from './engine/cspEngine';

type ActiveTab =
  | 'editor'
  | 'teachers'
  | 'ai_csp'
  | 'resources'
  | 'reports_export';

type GridViewMode = 'class' | 'teacher' | 'room' | 'subject';
type UserRole = 'admin' | 'section_head' | 'coordinator' | 'teacher';
type AppLang = 'fr' | 'ar' | 'en';
type ScheduleScenario = 'standard' | 'ramadan' | 'summer' | 'exams';

interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
  details: string;
}

const I18N: Record<
  AppLang,
  {
    navEditor: string;
    navTeachers: string;
    navAiCsp: string;
    navResources: string;
    navReports: string;
    printPdfBtn: string;
  }
> = {
  fr: {
    navEditor: 'Vue Ensemble & Éditeur',
    navTeachers: 'Matières, Enseignants & Loads',
    navAiCsp: 'Moteur CSP & IA',
    navResources: 'Salles & Horaires',
    navReports: 'Rapports, Load & PDF',
    printPdfBtn: 'Imprimer PDF Paysage',
  },
  ar: {
    navEditor: 'العرض الشامل والمحرر',
    navTeachers: 'المواد والمعلمون والنصاب',
    navAiCsp: 'محرك القيود والذكاء الاصطناعي',
    navResources: 'القاعات والمواقيت',
    navReports: 'التقارير والطباعة PDF',
    printPdfBtn: 'طباعة PDF أفقي',
  },
  en: {
    navEditor: 'Ensemble View & Editor',
    navTeachers: 'Subjects, Teachers & Loads',
    navAiCsp: 'CSP Engine & AI',
    navResources: 'Rooms & Timings',
    navReports: 'Reports, Load & PDF',
    printPdfBtn: 'Print Landscape PDF',
  },
};

export default function App() {
  // UI Preferences (Language, RTL, Dark Mode, Role, Campus, Scenario, Publication Status)
  const [lang, setLang] = useState<AppLang>('fr');
  const [darkMode, setDarkMode] = useState(false);
  const [roleMode, setRoleMode] = useState<UserRole>('admin');
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const [editorSubMode, setEditorSubMode] = useState<
    'ensemble' | 'single' | 'loads'
  >('ensemble');
  const [selectedCategory, setSelectedCategory] =
    useState<SchoolCategory>('ALL');
  const [selectedCampus, setSelectedCampus] = useState(
    'Al-Kawthar — Campus Principal Jeddah'
  );
  const [schoolYear, setSchoolYear] = useState('2026-2027');
  const [scenario, setScenario] = useState<ScheduleScenario>('standard');
  const [publicationStatus, setPublicationStatus] = useState<
    'draft' | 'published'
  >('published');

  // Auth & Cloud State
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isSyncedWithCloud, setIsSyncedWithCloud] = useState(false);
  const [isSyncingDefaults, setIsSyncingDefaults] = useState(false);

  // Core Data State
  const [classes, setClasses] = useState<SchoolClass[]>(DEFAULT_CLASSES);
  const [teachers, setTeachers] = useState<TeacherProfile[]>(DEFAULT_TEACHERS);
  const [rooms, setRooms] = useState<RoomResource[]>(DEFAULT_ROOMS);
  const [subjectConfigs, setSubjectConfigs] = useState<SubjectConfig[]>(
    DEFAULT_SUBJECT_CONFIGS
  );
  const [constraints, setConstraints] =
    useState<ConstraintRule[]>(DEFAULT_CONSTRAINTS);

  // Undo / Redo History Stack & Best Snapshot
  const [historyPast, setHistoryPast] = useState<SchoolClass[][]>([]);
  const [historyFuture, setHistoryFuture] = useState<SchoolClass[][]>([]);
  const [bestVersionSnapshot, setBestVersionSnapshot] =
    useState<SchoolClass[]>(DEFAULT_CLASSES);

  // Locked Slots & Modified Slots Tracking
  const [lockedSlotsByClass, setLockedSlotsByClass] = useState<
    Record<string, string[]>
  >({});
  const [modifiedSlotsByClass, setModifiedSlotsByClass] = useState<
    Record<string, string[]>
  >({});

  // Visual Editor View Mode & Filters
  const [gridViewMode, setGridViewMode] = useState<GridViewMode>('class');
  const [selectedSection, setSelectedSection] = useState<SectionType | 'ALL'>(
    'ALL'
  );
  const [selectedClassId, setSelectedClassId] = useState<string>(
    DEFAULT_CLASSES[0].id
  );
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    DEFAULT_TEACHERS[0]?.id || ''
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string>(
    DEFAULT_ROOMS[0].id
  );
  const [selectedSubjectFilter, setSelectedSubjectFilter] =
    useState<string>('Maths');
  const [searchQuery, setSearchQuery] = useState('');

  // Sub-tabs inside Teachers & Loads Module
  const [teacherSubTab, setTeacherSubTab] = useState<
    'directory' | 'loads_subjects' | 'availability' | 'substitutes'
  >('directory');

  // Substitute / Absence Finder State
  const [absentTeacherId, setAbsentTeacherId] = useState<string>(
    DEFAULT_TEACHERS[0]?.id || ''
  );
  const [absentDay, setAbsentDay] = useState<DayOfWeek>('Dimanche');
  const [absentPeriod, setAbsentPeriod] = useState<number>(1);

  // Conversational AI & Multi-Proposal State
  const [chatInput, setChatInput] = useState(
    'Déplace les cours de sciences ou biologie de l’après-midi vers le matin pour PEI2 sans violer les contraintes.'
  );
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [pendingAiProposal, setPendingAiProposal] = useState<{
    reply: string;
    warning: string;
    swaps: ProposedAiSwap[];
    engineValid: boolean;
    engineViolations: string[];
    previewClasses: SchoolClass[];
  } | null>(null);

  const [generatedProposals, setGeneratedProposals] = useState<
    GeneratedProposal[]
  >([]);
  const [isGeneratingProposals, setIsGeneratingProposals] = useState(false);

  const [aiCustomPrompt, setAiCustomPrompt] = useState(
    "Optimiser l'équilibre hebdomadaire des matières principales le matin (P1-P4), éliminer les heures creuses et respecter 100% des indisponibilités."
  );
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [aiResultSummary, setAiResultSummary] = useState<{
    summary: string;
    pedagogicalScore?: number;
  } | null>(null);
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(
    null
  );

  // Import CSV Modal / State
  const [csvImportText, setCsvImportText] = useState('');
  const [csvValidationResult, setCsvValidationResult] = useState<{
    rows: ParsedCsvRow[];
    issues: CsvValidationIssue[];
  } | null>(null);

  // Print Scope
  const [printScope, setPrintScope] = useState<
    'current_class' | 'current_teacher'
  >('current_class');

  // Notifications, Audit Log & WebSocket
  const [notifications, setNotifications] = useState<NotificationEntry[]>([
    {
      id: 'welcome-notif',
      title: 'Système Al-Kawthar Initialisé (35 Classes · 68 Enseignants)',
      message:
        'Toutes les grilles horaires par défaut, matières, salles et contraintes CP-SAT sont actives.',
      type: 'teacher_assigned',
      targetTeacher: 'all',
      visibility: 'school',
      authorId: 'system',
      timestampMs: Date.now(),
    },
  ]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([
    {
      id: 'aud-1',
      timestamp: new Date().toLocaleTimeString('fr-FR'),
      actor: 'Système Initialisation',
      role: 'Administrateur Principal',
      action: 'Chargement des emplois du temps officiels Al-Kawthar',
      details: '35 classes (Pre-KG à DP2 Garçons) et 68 enseignants affectés.',
    },
  ]);
  const [unreadCount, setUnreadCount] = useState(1);
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  const [liveToast, setLiveToast] = useState<NotificationEntry | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Cell Editor Modal
  const [editingCell, setEditingCell] = useState<{
    classId: string;
    day: DayOfWeek;
    period: number;
    subject: string;
    teacher: string;
    subSubject: string;
    subTeacher: string;
    room: string;
    jointWithClassName: string;
  } | null>(null);

  const appendAuditLog = (action: string, details: string) => {
    setAuditLogs((prev) => [
      {
        id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toLocaleTimeString('fr-FR'),
        actor: user?.displayName || user?.email || 'Direction Al-Kawthar',
        role: roleMode,
        action,
        details,
      },
      ...prev.slice(0, 99),
    ]);
  };

  // Push current state to Undo stack before mutating classes
  const recordHistoryAndSetClasses = (nextClasses: SchoolClass[]) => {
    setHistoryPast((prev) => [...prev.slice(-19), classes]);
    setHistoryFuture([]);
    setClasses(nextClasses);
  };

  const handleUndo = () => {
    if (historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    setHistoryPast((prev) => prev.slice(0, -1));
    setHistoryFuture((prev) => [classes, ...prev]);
    setClasses(previous);
    appendAuditLog('Annulation (Undo)', 'Retour à l’état précédent de la grille.');
  };

  const handleRedo = () => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[0];
    setHistoryFuture((prev) => prev.slice(1));
    setHistoryPast((prev) => [...prev, classes]);
    setClasses(next);
    appendAuditLog('Rétablissement (Redo)', 'Restauration de la modification.');
  };

  // 1. Firebase Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 2. Real-Time Firestore Listeners
  useEffect(() => {
    if (!authReady || !user) return;

    const classesPath = 'classes';
    const unsubClasses = onSnapshot(
      collection(db, classesPath),
      (snapshot) => {
        if (!snapshot.empty) {
          const loaded: SchoolClass[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as Omit<SchoolClass, 'id'>;
            loaded.push({ ...data, id: docSnap.id });
          });
          const byId = new Map(loaded.map((c) => [c.id, c]));
          const merged = DEFAULT_CLASSES.map((def) => byId.get(def.id) || def);
          setClasses(merged);
          setIsSyncedWithCloud(true);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, classesPath);
      }
    );

    const teachersPath = 'teachers';
    const unsubTeachers = onSnapshot(
      collection(db, teachersPath),
      (snapshot) => {
        if (!snapshot.empty) {
          const loaded: TeacherProfile[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as Omit<TeacherProfile, 'id'>;
            loaded.push({ ...data, id: docSnap.id });
          });
          const byId = new Map(loaded.map((t) => [t.id, t]));
          const merged = DEFAULT_TEACHERS.map((def) => byId.get(def.id) || def);
          setTeachers(merged);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, teachersPath);
      }
    );

    return () => {
      unsubClasses();
      unsubTeachers();
    };
  }, [authReady, user]);

  // 3. Real-Time WebSocket Connection
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      try {
        socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.event === 'init' && msg.payload?.notifications) {
              setNotifications((prev) => {
                const existingIds = new Set(prev.map((n) => n.id));
                const incoming = (
                  msg.payload.notifications as NotificationEntry[]
                ).filter((n) => !existingIds.has(n.id));
                return [...incoming, ...prev].slice(0, 40);
              });
            } else if (msg.event === 'notification:created' && msg.payload) {
              const newNotif = msg.payload as NotificationEntry;
              setNotifications((prev) => {
                if (prev.some((n) => n.id === newNotif.id)) return prev;
                return [newNotif, ...prev].slice(0, 40);
              });
              setUnreadCount((c) => c + 1);
              setLiveToast(newNotif);
              setTimeout(() => {
                setLiveToast((curr) =>
                  curr?.id === newNotif.id ? null : curr
                );
              }, 5000);
            } else if (msg.event === 'schedule:mutated' && msg.payload) {
              const { classId, updatedSlots } = msg.payload;
              if (classId && updatedSlots) {
                setClasses((prev) =>
                  prev.map((c) =>
                    c.id === classId ? { ...c, slots: updatedSlots } : c
                  )
                );
              }
            }
          } catch (e) {
            console.error('WS parse error:', e);
          }
        };

        socket.onclose = () => {
          reconnectTimer = setTimeout(connect, 4000);
        };
      } catch (e) {
        console.error('WS connection error:', e);
      }
    };

    connect();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, []);

  const triggerRealtimeNotification = async (
    title: string,
    message: string,
    type: NotificationEntry['type'],
    targetTeacher = 'all'
  ) => {
    try {
      await fetch('/api/notifications/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, type, targetTeacher }),
      });
    } catch (e) {
      console.error('Notification broadcast error:', e);
    }

    if (user) {
      const notifId = `notif_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      try {
        await setDoc(doc(db, 'notifications', notifId), {
          title: title.slice(0, 150),
          message: message.slice(0, 500),
          type,
          targetTeacher: targetTeacher.slice(0, 120),
          visibility: 'school',
          authorId: user.uid,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.CREATE,
          `notifications/${notifId}`
        );
      }
    }
  };

  const saveClassToStore = async (
    updatedClass: SchoolClass,
    modifiedKeys: string[] = []
  ) => {
    const nextClasses = classes.map((c) =>
      c.id === updatedClass.id ? updatedClass : c
    );
    recordHistoryAndSetClasses(nextClasses);

    if (modifiedKeys.length > 0) {
      setModifiedSlotsByClass((prev) => ({
        ...prev,
        [updatedClass.id]: Array.from(
          new Set([...(prev[updatedClass.id] || []), ...modifiedKeys])
        ),
      }));
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          event: 'schedule:mutated',
          payload: {
            classId: updatedClass.id,
            updatedSlots: updatedClass.slots,
          },
        })
      );
    }

    if (user) {
      try {
        await setDoc(doc(db, 'classes', updatedClass.id), {
          name: updatedClass.name.slice(0, 100),
          section: updatedClass.section,
          room: updatedClass.room.slice(0, 100),
          visibility: 'school',
          slots: updatedClass.slots,
          updatedBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.WRITE,
          `classes/${updatedClass.id}`
        );
      }
    }
  };

  const saveTeacherToStore = async (updatedTeacher: TeacherProfile) => {
    setTeachers((prev) =>
      prev.map((t) => (t.id === updatedTeacher.id ? updatedTeacher : t))
    );

    if (user) {
      try {
        await setDoc(doc(db, 'teachers', updatedTeacher.id), {
          name: updatedTeacher.name.slice(0, 120),
          subjects: updatedTeacher.subjects.slice(0, 10),
          section: updatedTeacher.section.slice(0, 80),
          maxPeriodsPerWeek: Math.min(
            45,
            Math.max(1, updatedTeacher.maxPeriodsPerWeek)
          ),
          unavailableSlots: updatedTeacher.unavailableSlots.slice(0, 40),
          defaultAssigned: updatedTeacher.defaultAssigned,
          visibility: 'school',
          updatedBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.WRITE,
          `teachers/${updatedTeacher.id}`
        );
      }
    }
  };

  const handleApplyAllDefaultTimetables = async () => {
    setIsSyncingDefaults(true);
    try {
      const updatedTeachers = teachers.map((t) => ({
        ...t,
        defaultAssigned: true,
      }));
      setTeachers(updatedTeachers);

      if (user) {
        const batch = writeBatch(db);
        for (const cls of classes) {
          const ref = doc(db, 'classes', cls.id);
          batch.set(ref, {
            name: cls.name.slice(0, 100),
            section: cls.section,
            room: cls.room.slice(0, 100),
            visibility: 'school',
            slots: cls.slots,
            updatedBy: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        for (const t of updatedTeachers) {
          const ref = doc(db, 'teachers', t.id);
          batch.set(ref, {
            name: t.name.slice(0, 120),
            subjects: t.subjects.slice(0, 10),
            section: t.section.slice(0, 80),
            maxPeriodsPerWeek: Math.min(45, Math.max(1, t.maxPeriodsPerWeek)),
            unavailableSlots: t.unavailableSlots.slice(0, 40),
            defaultAssigned: true,
            visibility: 'school',
            updatedBy: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
        setIsSyncedWithCloud(true);
      }

      appendAuditLog(
        'Affectation par défaut aux enseignants',
        `Synchronisation globale des ${classes.length} classes et ${teachers.length} enseignants.`
      );

      await triggerRealtimeNotification(
        'Emplois par défaut affectés aux enseignants',
        `Les grilles horaires officielles Al-Kawthar (${classes.length} classes) ont été appliquées et synchronisées pour les ${teachers.length} enseignants.`,
        'teacher_assigned',
        'all'
      );
    } catch (err) {
      if (user) {
        handleFirestoreError(err, OperationType.WRITE, 'batch_default_sync');
      }
    } finally {
      setIsSyncingDefaults(false);
    }
  };

  // Computed Data
  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || classes[0],
    [classes, selectedClassId]
  );

  const selectedTeacher = useMemo(
    () => teachers.find((t) => t.id === selectedTeacherId) || teachers[0],
    [teachers, selectedTeacherId]
  );

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) || rooms[0],
    [rooms, selectedRoomId]
  );

  const selectedTeacherSchedule = useMemo(() => {
    if (!selectedTeacher)
      return { slots: {}, totalPeriods: 0, classesTaught: [] };
    return buildTeacherTimetable(selectedTeacher.name, classes);
  }, [selectedTeacher, classes]);

  // Build Room Timetable across all classes
  const selectedRoomSchedule = useMemo(() => {
    const slots: Record<string, LessonSlot> = {};
    for (const cls of classes) {
      for (const [key, slot] of Object.entries(cls.slots)) {
        const sLower = slot.subject.toLowerCase();
        const matchesRoom =
          slot.room === selectedRoom.name ||
          cls.room === selectedRoom.name ||
          (selectedRoom.type === 'science_lab' &&
            (sLower.includes('phys') ||
              sLower.includes('chem') ||
              sLower.includes('biol') ||
              sLower.includes('scien'))) ||
          (selectedRoom.type === 'computer_lab' &&
            (sLower.includes('comput') ||
              sLower.includes('html') ||
              sLower.includes('ict') ||
              sLower.includes('inform'))) ||
          (selectedRoom.type === 'library' && sLower.includes('librar')) ||
          (selectedRoom.type === 'sports' && sLower.includes('p.e')) ||
          (selectedRoom.type === 'art_music' &&
            (sLower.includes('art') || sLower.includes('music')));

        if (matchesRoom && !slots[key]) {
          slots[key] = {
            subject: `${slot.subject} (${cls.name})`,
            teacher: slot.teacher,
            room: selectedRoom.name,
          };
        }
      }
    }
    return slots;
  }, [classes, selectedRoom]);

  // Build Subject Timetable across classes
  const selectedSubjectSchedule = useMemo(() => {
    const slots: Record<string, LessonSlot> = {};
    for (const cls of classes) {
      for (const [key, slot] of Object.entries(cls.slots)) {
        if (
          slot.subject
            .toLowerCase()
            .includes(selectedSubjectFilter.toLowerCase()) &&
          !slots[key]
        ) {
          slots[key] = {
            subject: `${cls.name} — ${slot.subject}`,
            teacher: slot.teacher,
            room: cls.room,
          };
        }
      }
    }
    return slots;
  }, [classes, selectedSubjectFilter]);

  const conflicts = useMemo(
    () => detectScheduleConflicts(classes, teachers),
    [classes, teachers]
  );

  const qualityReport = useMemo(
    () => evaluateTimetableQuality(classes, teachers, rooms),
    [classes, teachers, rooms]
  );

  const selectedClassConflictKeys = useMemo(() => {
    const set = new Set<string>();
    for (const c of conflicts) {
      if (c.classesInvolved.includes(selectedClass.name)) {
        set.add(`${c.day}_${c.period}`);
      }
    }
    return set;
  }, [conflicts, selectedClass]);

  const filteredClasses = useMemo(() => {
    return classes.filter((c) => {
      if (selectedSection !== 'ALL' && c.section !== selectedSection)
        return false;
      if (!classMatchesCategory(c, selectedCategory)) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      if (c.name.toLowerCase().includes(q)) return true;
      return Object.values(c.slots).some(
        (s) =>
          s.subject.toLowerCase().includes(q) ||
          s.teacher.toLowerCase().includes(q)
      );
    });
  }, [classes, selectedSection, selectedCategory, searchQuery]);

  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      if (!teacherMatchesCategory(t, selectedCategory, classes)) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.subjects.some((s) => s.toLowerCase().includes(q)) ||
        t.section.toLowerCase().includes(q)
      );
    });
  }, [teachers, classes, selectedCategory, searchQuery]);

  // Drag & Drop Slot Swap Handler in Visual Editor
  const handleDragDropSlotSwap = async (fromKey: string, toKey: string) => {
    const locked = new Set(lockedSlotsByClass[selectedClass.id] || []);
    if (locked.has(fromKey) || locked.has(toKey)) {
      await triggerRealtimeNotification(
        'Déplacement refusé (Séance verrouillée)',
        `Le créneau ${fromKey} ou ${toKey} est verrouillé par la direction (HC_04).`,
        'schedule_updated',
        'all'
      );
      return;
    }

    const nextSlots = { ...selectedClass.slots };
    const slotA = nextSlots[fromKey];
    const slotB = nextSlots[toKey];

    if (!slotA && !slotB) return;

    if (slotA && slotB) {
      nextSlots[fromKey] = slotB;
      nextSlots[toKey] = slotA;
    } else if (slotA && !slotB) {
      nextSlots[toKey] = slotA;
      delete nextSlots[fromKey];
    } else if (!slotA && slotB) {
      nextSlots[fromKey] = slotB;
      delete nextSlots[toKey];
    }

    await saveClassToStore(
      { ...selectedClass, slots: nextSlots },
      [fromKey, toKey]
    );
    appendAuditLog(
      `Glisser-déposer (${selectedClass.name})`,
      `Permutation ${fromKey} ↔ ${toKey}`
    );
    await triggerRealtimeNotification(
      `Permutation : ${selectedClass.name}`,
      `Séances permutées entre ${fromKey.replace('_', ' P')} et ${toKey.replace(
        '_',
        ' P'
      )} en ${selectedClass.name}.`,
      'schedule_updated',
      slotA?.teacher || 'all'
    );
  };

  // Intelligent Switch Handler inside Vue Ensemble (Any Class)
  const handleSwitchSlotsInAnyClass = async (
    classId: string,
    fromKey: string,
    toKey: string
  ) => {
    const targetCls = classes.find((c) => c.id === classId);
    if (!targetCls) return;
    const locked = new Set(lockedSlotsByClass[classId] || []);
    if (locked.has(fromKey) || locked.has(toKey)) {
      await triggerRealtimeNotification(
        'Switch refusé (Séance verrouillée)',
        `Le créneau ${fromKey} ou ${toKey} est verrouillé en ${targetCls.name}.`,
        'schedule_updated',
        'all'
      );
      return;
    }

    const nextSlots = { ...targetCls.slots };
    const slotA = nextSlots[fromKey];
    const slotB = nextSlots[toKey];
    if (!slotA && !slotB) return;

    if (slotA && slotB) {
      nextSlots[fromKey] = slotB;
      nextSlots[toKey] = slotA;
    } else if (slotA && !slotB) {
      nextSlots[toKey] = slotA;
      delete nextSlots[fromKey];
    } else if (!slotA && slotB) {
      nextSlots[fromKey] = slotB;
      delete nextSlots[toKey];
    }

    await saveClassToStore({ ...targetCls, slots: nextSlots }, [fromKey, toKey]);
    appendAuditLog(
      `Switch Intelligent (${targetCls.name})`,
      `Permutation ${fromKey} (${slotA?.subject || 'Libre'}) ↔ ${toKey} (${
        slotB?.subject || 'Libre'
      })`
    );
    await triggerRealtimeNotification(
      `Switch Intelligent : ${targetCls.name}`,
      `${slotA?.subject || 'Libre'} (${fromKey.replace(
        '_',
        ' P'
      )}) ↔ ${slotB?.subject || 'Libre'} (${toKey.replace('_', ' P')}).`,
      'schedule_updated',
      slotA?.teacher || slotB?.teacher || 'all'
    );
  };

  // Toggle Lock on a Slot
  const handleToggleLockSlot = (slotKey: string) => {
    setLockedSlotsByClass((prev) => {
      const curr = new Set(prev[selectedClass.id] || []);
      if (curr.has(slotKey)) {
        curr.delete(slotKey);
      } else {
        curr.add(slotKey);
      }
      return {
        ...prev,
        [selectedClass.id]: Array.from(curr),
      };
    });
    appendAuditLog(
      `Verrouillage séance (${selectedClass.name})`,
      `Créneau ${slotKey} basculé.`
    );
  };

  // Open Slot Editor Modal
  const handleOpenSlotEditor = (
    day: DayOfWeek,
    period: number,
    currentSlot?: LessonSlot,
    overrideClassId?: string
  ) => {
    const targetCls =
      classes.find((c) => c.id === overrideClassId) || selectedClass;
    const slotToUse = currentSlot || targetCls.slots[`${day}_${period}`];
    setEditingCell({
      classId: targetCls.id,
      day,
      period,
      subject: slotToUse?.subject || '',
      teacher: slotToUse?.teacher || '',
      subSubject: slotToUse?.subSubject || '',
      subTeacher: slotToUse?.subTeacher || '',
      room: slotToUse?.room || targetCls.room,
      jointWithClassName: slotToUse?.jointWithClasses?.[0] || '',
    });
  };

  const handleSaveSlotEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCell) return;
    const targetCls =
      classes.find((c) => c.id === editingCell.classId) || selectedClass;
    const key = `${editingCell.day}_${editingCell.period}`;
    const newSlots = { ...targetCls.slots };

    if (!editingCell.subject.trim() || !editingCell.teacher.trim()) {
      delete newSlots[key];
    } else {
      const updatedSlot: LessonSlot = {
        subject: editingCell.subject.trim(),
        teacher: editingCell.teacher.trim(),
        room: editingCell.room.trim() || targetCls.room,
      };
      if (editingCell.subSubject.trim() && editingCell.subTeacher.trim()) {
        updatedSlot.subSubject = editingCell.subSubject.trim();
        updatedSlot.subTeacher = editingCell.subTeacher.trim();
        updatedSlot.isIntercalated = true;
      }
      if (editingCell.jointWithClassName.trim()) {
        updatedSlot.jointWithClasses = [editingCell.jointWithClassName.trim()];
      }
      newSlots[key] = updatedSlot;
    }

    const updatedClass: SchoolClass = {
      ...targetCls,
      slots: newSlots,
    };

    // If jointWithClassName is specified, mirror the joint session into the partner class
    if (
      editingCell.jointWithClassName.trim() &&
      editingCell.subject.trim() &&
      editingCell.teacher.trim()
    ) {
      const partnerCls = classes.find(
        (c) =>
          c.name.toLowerCase() ===
          editingCell.jointWithClassName.trim().toLowerCase()
      );
      if (partnerCls && partnerCls.id !== targetCls.id) {
        const partnerSlots = {
          ...partnerCls.slots,
          [key]: {
            subject: editingCell.subject.trim(),
            teacher: editingCell.teacher.trim(),
            room: editingCell.room.trim() || targetCls.room,
            jointWithClasses: [targetCls.name],
          },
        };
        const nextAll = classes.map((c) => {
          if (c.id === targetCls.id) return updatedClass;
          if (c.id === partnerCls.id) return { ...partnerCls, slots: partnerSlots };
          return c;
        });
        recordHistoryAndSetClasses(nextAll);
      } else {
        await saveClassToStore(updatedClass, [key]);
      }
    } else {
      await saveClassToStore(updatedClass, [key]);
    }

    setEditingCell(null);
    appendAuditLog(
      `Modification manuelle (${targetCls.name})`,
      `${key} : ${editingCell.subject} (${editingCell.teacher})`
    );
    await triggerRealtimeNotification(
      `Modification : ${targetCls.name} (${editingCell.day} P${editingCell.period})`,
      editingCell.subject.trim()
        ? `Cours "${editingCell.subject}" attribué à ${editingCell.teacher} en ${targetCls.name}.`
        : `Créneau ${editingCell.day} P${editingCell.period} libéré en ${targetCls.name}.`,
      'schedule_updated',
      editingCell.teacher || 'all'
    );
  };

  // Add Subject Associated with One or Multiple Classes + Auto-Schedule Load
  const handleAddSubjectWithClasses = async (payload: {
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
  }) => {
    const cleanSubject = payload.subjectName.trim();
    const cleanTeacher = payload.teacherName.trim() || 'À affecter';
    if (!cleanSubject || payload.targetClassIds.length === 0) return;

    setSubjectConfigs((prev) => {
      const exists = prev.some(
        (s) => s.name.toLowerCase() === cleanSubject.toLowerCase()
      );
      if (exists) return prev;
      return [
        ...prev,
        {
          id: `sub_${Date.now()}`,
          name: cleanSubject,
          durationMinutes: payload.durationMinutes,
          weight: payload.weight,
          preferMorning: payload.preferMorning,
          allowDoublePeriod: false,
          maxPerDay: 2,
          requiredRoomType: 'classroom',
          sessionType: 'theorique',
          weeklyPeriodsDefault: payload.weeklyPeriods,
          category: payload.category,
        },
      ];
    });

    const nextClasses = classes.map((cls) => {
      if (!payload.targetClassIds.includes(cls.id)) return cls;
      const nextSlots = { ...cls.slots };
      const nextLoads = {
        ...(cls.subjectLoads || {}),
        [cleanSubject]: payload.weeklyPeriods,
      };

      if (payload.autoScheduleInClasses) {
        let currentCount = Object.values(nextSlots).filter(
          (s) =>
            s.subject.toLowerCase() === cleanSubject.toLowerCase() ||
            s.subSubject?.toLowerCase() === cleanSubject.toLowerCase()
        ).length;

        const maxP =
          cls.section === 'KG' ? 6 : cls.section === 'KG3_GS' ? 7 : 8;

        for (const day of DAYS_OF_WEEK) {
          for (let p = 1; p <= maxP; p++) {
            if (currentCount >= payload.weeklyPeriods) break;
            const k = `${day}_${p}`;
            if (!nextSlots[k]) {
              const slotObj: LessonSlot = {
                subject: cleanSubject,
                teacher: cleanTeacher,
                room: cls.room,
              };
              if (payload.subTeacherName?.trim()) {
                slotObj.subSubject = cleanSubject;
                slotObj.subTeacher = payload.subTeacherName.trim();
                slotObj.isIntercalated = true;
              }
              nextSlots[k] = slotObj;
              currentCount++;
            }
          }
        }
      }

      return {
        ...cls,
        slots: nextSlots,
        subjectLoads: nextLoads,
      };
    });

    recordHistoryAndSetClasses(nextClasses);
    appendAuditLog(
      `Ajout Matière Multi-Classes (${cleanSubject})`,
      `${payload.weeklyPeriods}p/sem associé à ${payload.targetClassIds.length} classe(s) avec ${cleanTeacher}.`
    );
    await triggerRealtimeNotification(
      `Matière associée : ${cleanSubject}`,
      `${cleanSubject} (${payload.weeklyPeriods}p/sem) ajoutée à ${payload.targetClassIds.length} classe(s) avec ${cleanTeacher}.`,
      'schedule_updated',
      cleanTeacher
    );
  };

  // Add New Teacher & Optionally Generate Initial Sessions
  const handleAddNewTeacher = async (payload: {
    name: string;
    category: Exclude<SchoolCategory, 'ALL'>;
    subjects: string[];
    maxPeriodsPerWeek: number;
    initialClassId?: string;
    initialSubject?: string;
    initialPeriods?: number;
  }) => {
    const cleanName = payload.name.trim();
    if (!cleanName) return;

    const sectionMap: Record<Exclude<SchoolCategory, 'ALL'>, string> = {
      French_Section: 'Section Française',
      Boys_Section: 'Boys Section',
      Girls_Section: 'Girls Section',
      American_Section: 'American Section',
      KG_Primary: 'KG & Primary',
    };

    const newTeacher: TeacherProfile = {
      id: `teacher_custom_${Date.now()}`,
      name: cleanName,
      subjects: payload.subjects.length > 0 ? payload.subjects : ['Général'],
      section: sectionMap[payload.category] || 'Primary',
      category: payload.category,
      maxPeriodsPerWeek: payload.maxPeriodsPerWeek || 24,
      unavailableSlots: [],
      defaultAssigned: true,
      visibility: 'school',
      updatedBy: 'Direction',
    };

    await saveTeacherToStore(newTeacher);
    setSelectedTeacherId(newTeacher.id);

    if (
      payload.initialClassId &&
      payload.initialSubject &&
      payload.initialPeriods &&
      payload.initialPeriods > 0
    ) {
      const targetCls = classes.find((c) => c.id === payload.initialClassId);
      if (targetCls) {
        const nextSlots = { ...targetCls.slots };
        const maxP =
          targetCls.section === 'KG'
            ? 6
            : targetCls.section === 'KG3_GS'
            ? 7
            : 8;
        let placed = 0;
        for (const day of DAYS_OF_WEEK) {
          for (let p = 1; p <= maxP; p++) {
            if (placed >= payload.initialPeriods) break;
            const k = `${day}_${p}`;
            if (!nextSlots[k]) {
              nextSlots[k] = {
                subject: payload.initialSubject,
                teacher: cleanName,
                room: targetCls.room,
              };
              placed++;
            }
          }
        }
        await saveClassToStore({
          ...targetCls,
          slots: nextSlots,
        });
      }
    }

    appendAuditLog(
      `Nouvel enseignant ajouté (${cleanName})`,
      `Catégorie : ${payload.category} · Max : ${payload.maxPeriodsPerWeek}p/sem.`
    );
    await triggerRealtimeNotification(
      `Enseignant(e) ajouté(e) : ${cleanName}`,
      `Profil créé (${payload.subjects.join(', ')}) avec plafond de ${
        payload.maxPeriodsPerWeek
      }p/semaine.`,
      'teacher_assigned',
      cleanName
    );
  };

  // Adjust Subject Load (+/- periods per week in a class)
  const handleAdjustClassSubjectLoad = async (
    classId: string,
    subjectName: string,
    delta: number,
    preferredTeacher?: string
  ) => {
    const cls = classes.find((c) => c.id === classId);
    if (!cls) return;
    const nextSlots = { ...cls.slots };
    const matchingKeys = Object.entries(nextSlots)
      .filter(
        ([, s]) => s.subject.toLowerCase() === subjectName.toLowerCase()
      )
      .map(([k]) => k);

    const sampleTeacher =
      preferredTeacher ||
      (matchingKeys.length > 0
        ? nextSlots[matchingKeys[0]].teacher
        : teachers.find((t) =>
            t.subjects.some(
              (sub) => sub.toLowerCase() === subjectName.toLowerCase()
            )
          )?.name || 'Prof. Référent');

    if (delta > 0) {
      const maxP =
        cls.section === 'KG' ? 6 : cls.section === 'KG3_GS' ? 7 : 8;
      let added = 0;
      for (const day of DAYS_OF_WEEK) {
        for (let p = 1; p <= maxP; p++) {
          if (added >= delta) break;
          const k = `${day}_${p}`;
          if (!nextSlots[k]) {
            nextSlots[k] = {
              subject: subjectName,
              teacher: sampleTeacher,
              room: cls.room,
            };
            added++;
          }
        }
      }
    } else if (delta < 0 && matchingKeys.length > 0) {
      const toRemove = Math.min(Math.abs(delta), matchingKeys.length);
      for (let i = 0; i < toRemove; i++) {
        const keyToDelete = matchingKeys[matchingKeys.length - 1 - i];
        delete nextSlots[keyToDelete];
      }
    }

    const updatedCount = Object.values(nextSlots).filter(
      (s) => s.subject.toLowerCase() === subjectName.toLowerCase()
    ).length;

    await saveClassToStore({
      ...cls,
      slots: nextSlots,
      subjectLoads: {
        ...(cls.subjectLoads || {}),
        [subjectName]: updatedCount,
      },
    });

    appendAuditLog(
      `Modification Load (${cls.name})`,
      `${subjectName} -> ${updatedCount}p/sem (${delta > 0 ? `+${delta}` : delta})`
    );
  };

  // Assemble 2 Classes Together (Joint Course) OR 2 Teachers Together (Intercalated / Co-teaching)
  const handleAssembleClassesOrTeachers = async (payload: {
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
  }) => {
    const clsA = classes.find((c) => c.id === payload.classAId);
    if (!clsA) return;
    const slotKey = `${payload.day}_${payload.period}`;

    if (payload.mode === 'joint_classes' && payload.classBId) {
      const clsB = classes.find((c) => c.id === payload.classBId);
      if (!clsB) return;

      const sharedRoom =
        payload.room?.trim() || `${clsA.name} + ${clsB.name}`;

      const nextAll = classes.map((c) => {
        if (c.id === clsA.id) {
          return {
            ...c,
            slots: {
              ...c.slots,
              [slotKey]: {
                subject: payload.subjectA,
                teacher: payload.teacherA,
                room: sharedRoom,
                jointWithClasses: [clsB.name],
              },
            },
          };
        }
        if (c.id === clsB.id) {
          return {
            ...c,
            slots: {
              ...c.slots,
              [slotKey]: {
                subject: payload.subjectA,
                teacher: payload.teacherA,
                room: sharedRoom,
                jointWithClasses: [clsA.name],
              },
            },
          };
        }
        return c;
      });

      recordHistoryAndSetClasses(nextAll);
      appendAuditLog(
        `Classes rassemblées (${clsA.name} ⊕ ${clsB.name})`,
        `${payload.day} P${payload.period} : ${payload.subjectA} avec ${payload.teacherA}`
      );
      await triggerRealtimeNotification(
        `Classes rassemblées : ${clsA.name} ⊕ ${clsB.name}`,
        `Cours commun de ${payload.subjectA} (${payload.teacherA}) programmé le ${payload.day} P${payload.period}.`,
        'schedule_updated',
        payload.teacherA
      );
    } else {
      const nextSlots = {
        ...clsA.slots,
        [slotKey]: {
          subject: payload.subjectA,
          teacher: payload.teacherA,
          subSubject: payload.subjectB || payload.subjectA,
          subTeacher: payload.teacherB || '',
          room: payload.room || clsA.room,
          isIntercalated: true,
        },
      };

      await saveClassToStore({ ...clsA, slots: nextSlots }, [slotKey]);
      appendAuditLog(
        `Séance intercalée / Co-enseignement (${clsA.name})`,
        `${payload.day} P${payload.period} : ${payload.subjectA} (${payload.teacherA}) ⇄ ${
          payload.subjectB || payload.subjectA
        } (${payload.teacherB})`
      );
      await triggerRealtimeNotification(
        `Séance intercalée : ${clsA.name} (${payload.day} P${payload.period})`,
        `${payload.teacherA} (${payload.subjectA}) & ${payload.teacherB} (${
          payload.subjectB || payload.subjectA
        }) rassemblés sur ${payload.day} P${payload.period}.`,
        'schedule_updated',
        payload.teacherA
      );
    }
  };

  // Remove a specific session from a class
  const handleRemoveTeacherSession = async (
    classId: string,
    day: DayOfWeek,
    period: number
  ) => {
    const cls = classes.find((c) => c.id === classId);
    if (!cls) return;
    const key = `${day}_${period}`;
    const nextSlots = { ...cls.slots };
    delete nextSlots[key];
    await saveClassToStore({ ...cls, slots: nextSlots }, [key]);
  };

  // Print or Download Official Load Report (Load Teachers / Load Subjects)
  const handlePrintLoadReport = (mode: 'teachers_load' | 'subjects_load') => {
    const teacherRows = computeTeachersLoadReport(
      teachers,
      classes,
      selectedCategory
    );
    const subjectRows = computeSubjectsLoadReport(
      classes,
      subjectConfigs,
      selectedCategory
    );
    const html = generatePrintableLoadReportHtml(
      mode,
      teacherRows,
      subjectRows,
      selectedCategory,
      schoolYear
    );
    const filename =
      mode === 'teachers_load'
        ? `AlKawthar_Load_Teachers_${selectedCategory}_${schoolYear}.html`
        : `AlKawthar_Load_Subjects_${selectedCategory}_${schoolYear}.html`;
    handleDownloadFile(html, filename, 'text/html');
    appendAuditLog(
      `Impression ${mode === 'teachers_load' ? 'Load Teachers' : 'Load Subjects'}`,
      `Rapport HTML/PDF Paysage généré (${CATEGORY_SHORT_LABELS[selectedCategory]}).`
    );
  };

  // Print or Download Master Ensemble View (All Classes Together)
  const handlePrintEnsembleMatrix = () => {
    const html = generatePrintableEnsembleHtml(
      classes,
      selectedCategory,
      schoolYear
    );
    handleDownloadFile(
      html,
      `AlKawthar_Vue_Ensemble_${selectedCategory}_${schoolYear}.html`,
      'text/html'
    );
    appendAuditLog(
      `Impression Vue Ensemble (${CATEGORY_SHORT_LABELS[selectedCategory]})`,
      `Matrice complète multi-classes exportée en HTML/PDF Paysage.`
    );
  };

  // Toggle Teacher Availability
  const handleToggleTeacherUnavailable = async (
    day: DayOfWeek,
    period: number
  ) => {
    if (!selectedTeacher) return;
    const key = `${day}_${period}`;
    const exists = selectedTeacher.unavailableSlots.includes(key);
    const nextUnavail = exists
      ? selectedTeacher.unavailableSlots.filter((k) => k !== key)
      : [...selectedTeacher.unavailableSlots, key];

    const updated: TeacherProfile = {
      ...selectedTeacher,
      unavailableSlots: nextUnavail,
    };

    await saveTeacherToStore(updated);
    appendAuditLog(
      `Disponibilité enseignant (${selectedTeacher.name})`,
      `${key} -> ${exists ? 'Disponible' : 'Indisponible'}`
    );
    await triggerRealtimeNotification(
      `Disponibilité mise à jour : ${selectedTeacher.name}`,
      exists
        ? `${selectedTeacher.name} est de nouveau disponible le ${day} (Période ${period}).`
        : `${selectedTeacher.name} a déclaré une indisponibilité le ${day} (Période ${period}).`,
      'availability_changed',
      selectedTeacher.name
    );
  };

  // Generate 3 Ranked Proposals using CSP Solver
  const handleGenerateMultiProposals = (scope: 'all' | 'current_class') => {
    setIsGeneratingProposals(true);
    setTimeout(() => {
      const proposals = generateRankedProposals(
        classes,
        teachers,
        lockedSlotsByClass,
        scope === 'current_class' ? selectedClass.id : undefined
      );
      setGeneratedProposals(proposals);
      setIsGeneratingProposals(false);
      appendAuditLog(
        'Génération Multi-Propositions CP-SAT',
        `3 solutions classées générées (${
          scope === 'all' ? 'Toutes les classes' : selectedClass.name
        }).`
      );
    }, 250);
  };

  const handleApplyProposal = async (proposal: GeneratedProposal) => {
    setBestVersionSnapshot(classes);
    recordHistoryAndSetClasses(proposal.classes);
    appendAuditLog(
      `Application ${proposal.name}`,
      `Score qualité ${proposal.quality.globalScore}/100 (${proposal.swapsPerformed} permutations).`
    );
    await triggerRealtimeNotification(
      `${proposal.name} appliquée`,
      `Nouveau score de qualité globale : ${proposal.quality.globalScore}/100 (${proposal.swapsPerformed} optimisations validées).`,
      'ai_generated',
      'all'
    );
  };

  // Run Conversational AI Assistant + Constraint Verification
  const handleAskConversationalAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setIsChatLoading(true);
    setPendingAiProposal(null);

    try {
      const lockedSlots = lockedSlotsByClass[selectedClass.id] || [];
      const classTeachers = new Set<string>();
      Object.values(selectedClass.slots).forEach((s) =>
        classTeachers.add(s.teacher.toLowerCase())
      );
      const relevantConstraints = teachers
        .filter(
          (t) =>
            classTeachers.has(t.name.toLowerCase()) &&
            t.unavailableSlots.length > 0
        )
        .map((t) => ({
          teacher: t.name,
          unavailableSlots: t.unavailableSlots,
        }));

      const response = await fetch('/api/gemini/conversational-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInstruction: chatInput,
          targetClass: selectedClass,
          lockedSlots,
          teacherConstraints: relevantConstraints,
          qualitySummary: qualityReport,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erreur de l'assistant IA.");
      }

      const rawSwaps: ProposedAiSwap[] = (data.proposedSwaps || []).map(
        (s: any) => {
          const cls =
            classes.find(
              (c) =>
                c.name.toLowerCase() === String(s.className || '').toLowerCase()
            ) || selectedClass;
          return {
            classId: cls.id,
            className: cls.name,
            fromKey: s.fromKey,
            toKey: s.toKey,
            fromSlot: cls.slots[s.fromKey],
            toSlot: cls.slots[s.toKey],
            reason: s.reason,
          };
        }
      );

      // Verify proposed swaps with the deterministic Constraint Engine before allowing validation
      const verification = verifySwapsWithConstraintEngine(
        classes,
        teachers,
        lockedSlotsByClass,
        rawSwaps
      );

      setPendingAiProposal({
        reply: data.assistantReply || 'Analyse terminée.',
        warning: data.incompatibleConstraintsWarning || '',
        swaps: rawSwaps,
        engineValid: verification.valid,
        engineViolations: verification.violations,
        previewClasses: verification.previewClasses,
      });
    } catch (err: unknown) {
      setPendingAiProposal({
        reply:
          err instanceof Error
            ? err.message
            : "Erreur lors de l'analyse conversationnelle.",
        warning: '',
        swaps: [],
        engineValid: false,
        engineViolations: [],
        previewClasses: classes,
      });
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleConfirmPendingAiProposal = async () => {
    if (!pendingAiProposal || pendingAiProposal.swaps.length === 0) return;
    recordHistoryAndSetClasses(pendingAiProposal.previewClasses);
    appendAuditLog(
      'Assistant IA — Modifications validées',
      `${pendingAiProposal.swaps.length} permutation(s) vérifiées par le moteur de contraintes.`
    );
    await triggerRealtimeNotification(
      'Modifications Assistant IA appliquées',
      `${pendingAiProposal.swaps.length} permutation(s) validées après contrôle du moteur de contraintes.`,
      'ai_generated',
      'all'
    );
    setPendingAiProposal(null);
  };

  // Run Gemini AI Class Optimization
  const handleRunGeminiOptimizeClass = async () => {
    setIsAiRunning(true);
    setAiResultSummary(null);
    try {
      const classTeachers = new Set<string>();
      Object.values(selectedClass.slots).forEach((s) => {
        classTeachers.add(s.teacher.toLowerCase());
        if (s.subTeacher) classTeachers.add(s.subTeacher.toLowerCase());
      });

      const relevantConstraints = teachers
        .filter(
          (t) =>
            classTeachers.has(t.name.toLowerCase()) &&
            t.unavailableSlots.length > 0
        )
        .map((t) => ({
          teacher: t.name,
          unavailableSlots: t.unavailableSlots,
        }));

      const maxPeriods =
        selectedClass.section === 'KG'
          ? 6
          : selectedClass.section === 'KG3_GS'
          ? 7
          : 8;

      const response = await fetch('/api/gemini/optimize-class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          className: selectedClass.name,
          section: selectedClass.section,
          currentSlots: selectedClass.slots,
          teacherConstraints: relevantConstraints,
          customInstructions: aiCustomPrompt,
          maxPeriodsPerDay: maxPeriods,
          lockedSlots: lockedSlotsByClass[selectedClass.id] || [],
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Échec de l'optimisation Gemini AI");
      }

      if (Array.isArray(data.slots) && data.slots.length > 0) {
        const nextSlots: Record<string, LessonSlot> = {
          ...selectedClass.slots,
        };
        const locked = new Set(lockedSlotsByClass[selectedClass.id] || []);
        for (const item of data.slots) {
          const k = `${item.day}_${item.period}`;
          if (locked.has(k)) continue; // Strictly protect locked slots (HC_04)
          if (item.day && item.period && item.subject && item.teacher) {
            const slotObj: LessonSlot = {
              subject: item.subject,
              teacher: item.teacher,
            };
            if (item.subSubject && item.subTeacher) {
              slotObj.subSubject = item.subSubject;
              slotObj.subTeacher = item.subTeacher;
            }
            nextSlots[k] = slotObj;
          }
        }
        await saveClassToStore({
          ...selectedClass,
          slots: nextSlots,
        });
      }

      setAiResultSummary({
        summary: data.summary,
        pedagogicalScore: data.pedagogicalScore,
      });
      appendAuditLog(
        `Optimisation Gemini IA (${selectedClass.name})`,
        data.summary || 'Grille optimisée.'
      );
    } catch (err: unknown) {
      setAiResultSummary({
        summary:
          err instanceof Error
            ? err.message
            : "Une erreur est survenue lors de l'appel à Gemini AI.",
      });
    } finally {
      setIsAiRunning(false);
    }
  };

  // Resolve a Specific Conflict via Gemini AI
  const handleResolveConflictWithAi = async (conflict: ScheduleConflict) => {
    setResolvingConflictId(conflict.id);
    try {
      const targetClassName = conflict.classesInvolved[0];
      const targetClass = classes.find((c) => c.name === targetClassName);
      if (!targetClass) return;

      const teacherSched = buildTeacherTimetable(conflict.teacher, classes);
      const teacherProfile = teachers.find(
        (t) => t.name.toLowerCase() === conflict.teacher.toLowerCase()
      );

      const response = await fetch('/api/gemini/resolve-conflict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conflict,
          classData: targetClass,
          teacherBusySlots: Object.keys(teacherSched.slots),
          teacherUnavailableSlots: teacherProfile?.unavailableSlots || [],
        }),
      });

      const data = await response.json();
      if (response.ok && data.fromSlotKey && data.toSlotKey) {
        const nextSlots = { ...targetClass.slots };
        const temp = nextSlots[data.fromSlotKey];
        if (nextSlots[data.toSlotKey]) {
          nextSlots[data.fromSlotKey] = nextSlots[data.toSlotKey];
        } else {
          delete nextSlots[data.fromSlotKey];
        }
        if (temp) {
          nextSlots[data.toSlotKey] = temp;
        }
        await saveClassToStore(
          {
            ...targetClass,
            slots: nextSlots,
          },
          [data.fromSlotKey, data.toSlotKey]
        );
        appendAuditLog(
          `Conflit résolu (${conflict.teacher})`,
          `${targetClass.name} : ${data.fromSlotKey} ↔ ${data.toSlotKey}`
        );
      }
    } catch (e) {
      console.error('Conflict resolution error:', e);
    } finally {
      setResolvingConflictId(null);
    }
  };

  // Repair ALL conflicts automatically using the CP-SAT solver
  const handleRepairAllConflicts = async () => {
    const proposals = generateRankedProposals(
      classes,
      teachers,
      lockedSlotsByClass
    );
    const best = proposals[0];
    if (best) {
      await handleApplyProposal(best);
    }
  };

  // Absent Teacher & Substitute Candidates
  const absentTeacherObj = useMemo(
    () => teachers.find((t) => t.id === absentTeacherId) || teachers[0],
    [teachers, absentTeacherId]
  );

  const absentTeacherLessonAtSlot = useMemo(() => {
    if (!absentTeacherObj) return null;
    const sched = buildTeacherTimetable(absentTeacherObj.name, classes);
    return sched.slots[`${absentDay}_${absentPeriod}`] || null;
  }, [absentTeacherObj, absentDay, absentPeriod, classes]);

  const substituteCandidates = useMemo(() => {
    if (!absentTeacherObj) return [];
    const subjNeeded =
      absentTeacherLessonAtSlot?.subject ||
      absentTeacherObj.subjects[0] ||
      'English';
    return findSubstituteCandidates(
      absentTeacherObj.name,
      subjNeeded,
      absentTeacherObj.section,
      absentDay,
      absentPeriod,
      classes,
      teachers
    );
  }, [
    absentTeacherObj,
    absentTeacherLessonAtSlot,
    absentDay,
    absentPeriod,
    classes,
    teachers,
  ]);

  const handleAssignSubstitute = async (subTeacherName: string) => {
    if (!absentTeacherObj) return;
    const slotKey = `${absentDay}_${absentPeriod}`;
    // Find the class where absentTeacherObj teaches at slotKey
    const targetClass = classes.find((c) => {
      const s = c.slots[slotKey];
      return (
        s &&
        s.teacher.trim().toLowerCase() ===
          absentTeacherObj.name.trim().toLowerCase()
      );
    });

    if (!targetClass) {
      await triggerRealtimeNotification(
        `Remplacement préventif enregistré`,
        `${subTeacherName} est désigné(e) remplaçant(e) de ${absentTeacherObj.name} le ${absentDay} (P${absentPeriod}).`,
        'teacher_assigned',
        subTeacherName
      );
      return;
    }

    const nextSlots = {
      ...targetClass.slots,
      [slotKey]: {
        ...targetClass.slots[slotKey],
        teacher: subTeacherName,
      },
    };

    await saveClassToStore(
      { ...targetClass, slots: nextSlots },
      [slotKey]
    );
    appendAuditLog(
      `Remplacement absence (${targetClass.name})`,
      `${subTeacherName} remplace ${absentTeacherObj.name} le ${absentDay} P${absentPeriod}.`
    );
    await triggerRealtimeNotification(
      `Remplacement validé : ${targetClass.name} (${absentDay} P${absentPeriod})`,
      `${subTeacherName} remplace ${absentTeacherObj.name} pour le cours de ${targetClass.slots[slotKey].subject}.`,
      'teacher_assigned',
      subTeacherName
    );
  };

  // Duplicate School Year Handler
  const handleDuplicateSchoolYear = async () => {
    const nextYear = schoolYear === '2026-2027' ? '2027-2028' : '2028-2029';
    setSchoolYear(nextYear);
    setBestVersionSnapshot(classes);
    appendAuditLog(
      `Duplication d'année scolaire`,
      `Données, enseignants, salles et grilles clonés vers l'année ${nextYear}.`
    );
    await triggerRealtimeNotification(
      `Année scolaire dupliquée vers ${nextYear}`,
      `Les ${classes.length} classes, ${teachers.length} enseignants et contraintes ont été conservés pour ${nextYear}.`,
      'schedule_updated',
      'all'
    );
  };

  // Apply Validated CSV Import
  const handleApplyValidatedCsvImport = async () => {
    if (!csvValidationResult || csvValidationResult.rows.length === 0) return;
    const nextClasses = classes.map((c) => ({ ...c, slots: { ...c.slots } }));

    for (const row of csvValidationResult.rows) {
      const target = nextClasses.find(
        (c) => c.name.toLowerCase() === row.className.toLowerCase()
      );
      if (target) {
        target.slots[`${row.day}_${row.period}`] = {
          subject: row.subject,
          teacher: row.teacher,
          subSubject: row.subSubject,
          subTeacher: row.subTeacher,
        };
      }
    }

    recordHistoryAndSetClasses(nextClasses);
    appendAuditLog(
      'Importation Excel / CSV validée',
      `${csvValidationResult.rows.length} séances importées et contrôlées.`
    );
    await triggerRealtimeNotification(
      'Importation Excel/CSV appliquée',
      `${csvValidationResult.rows.length} séances mises à jour après validation.`,
      'schedule_updated',
      'all'
    );
    setCsvValidationResult(null);
    setCsvImportText('');
  };

  // Export Handlers
  const handleDownloadLandscapeHtml = (
    mode: 'single_class' | 'single_teacher' | 'all_classes'
  ) => {
    let sheets: Array<{
      title: string;
      subtitle?: string;
      section: SectionType;
      slots: Record<string, LessonSlot>;
    }> = [];

    if (mode === 'single_class') {
      sheets = [
        {
          title: selectedClass.name,
          subtitle: `${SCHOOL_INFO.subtitle} · Année ${schoolYear}`,
          section: selectedClass.section,
          slots: selectedClass.slots,
        },
      ];
    } else if (mode === 'single_teacher' && selectedTeacher) {
      sheets = [
        {
          title: `Enseignant : ${selectedTeacher.name}`,
          subtitle: `${SCHOOL_INFO.subtitle} · Matières : ${selectedTeacher.subjects.join(
            ', '
          )}`,
          section: 'Primary',
          slots: selectedTeacherSchedule.slots,
        },
      ];
    } else {
      sheets = classes.map((c) => ({
        title: c.name,
        subtitle: `${SCHOOL_INFO.subtitle} · Année ${schoolYear}`,
        section: c.section,
        slots: c.slots,
      }));
    }

    const htmlContent = generateStandaloneLandscapeHtml(sheets);
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Emploi_du_Temps_${
      mode === 'single_class'
        ? selectedClass.name.replace(/\s+/g, '_')
        : mode === 'single_teacher'
        ? selectedTeacher.name.replace(/\s+/g, '_')
        : 'AlKawthar_35_Classes'
    }_Paysage_PDF.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadFile = (
    content: string,
    filename: string,
    mimeType: string
  ) => {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const tStrings = I18N[lang];

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className={`min-h-screen flex flex-col transition-colors ${
        darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* =====================================================================
          TOP BAR CONTRACT: 3 clean zones separated by gap-8
         ===================================================================== */}
      <header
        className={`flex items-center justify-between gap-8 px-6 py-3.5 border-b no-print sticky top-0 z-30 ${
          darkMode
            ? 'bg-slate-900 border-slate-800 text-white'
            : 'bg-white border-slate-200 text-slate-950'
        }`}
      >
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('editor');
          }}
          className="text-lg font-bold tracking-tight whitespace-nowrap shrink-0"
        >
          ChronoScolaire AI
        </a>

        {/* Zone 2: 5 concise single-line navigation links */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
          {(
            [
              ['editor', tStrings.navEditor],
              ['teachers', tStrings.navTeachers],
              ['ai_csp', tStrings.navAiCsp],
              ['resources', tStrings.navResources],
              ['reports_export', tStrings.navReports],
            ] as const
          ).map(([tabKey, label]) => (
            <button
              key={tabKey}
              onClick={() => setActiveTab(tabKey)}
              className={`transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
                activeTab === tabKey
                  ? darkMode
                    ? 'text-white border-b-2 border-sky-400 font-semibold'
                    : 'text-slate-950 border-b-2 border-slate-950 font-semibold'
                  : darkMode
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 text-xs font-semibold text-white bg-sky-700 rounded-lg hover:bg-sky-800 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{tStrings.printPdfBtn}</span>
          </button>
        </div>
      </header>

      {/* =====================================================================
          WORKSPACE GOVERNANCE BAR (Multi-Campus, Scenario, Undo/Redo, Role, Lang, Theme)
         ===================================================================== */}
      <div
        className={`border-b px-6 py-2.5 no-print ${
          darkMode
            ? 'bg-slate-900/80 border-slate-800'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Left: Multi-Campus, Year, Scenario & Quality Score */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={selectedCampus}
              onChange={(e) => setSelectedCampus(e.target.value)}
              aria-label="Sélectionner l'établissement"
              className={`px-2.5 py-1 rounded border text-xs font-medium ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-100'
                  : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}
            >
              <option value="Al-Kawthar — Campus Principal Jeddah">
                Al-Kawthar — Campus Principal Jeddah
              </option>
              <option value="Al-Kawthar — Section Francophone & IB">
                Al-Kawthar — Section Francophone & IB
              </option>
              <option value="Al-Kawthar — Section Américaine & Internationale">
                Al-Kawthar — Section Américaine & Internationale
              </option>
            </select>

            <span aria-hidden="true" className="text-slate-400">
              ·
            </span>

            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value as ScheduleScenario)}
              aria-label="Scénario horaire"
              className={`px-2.5 py-1 rounded border text-xs font-medium ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-100'
                  : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}
            >
              <option value="standard">Scénario : Standard ({schoolYear})</option>
              <option value="ramadan">Scénario : Horaire Ramadan (35m)</option>
              <option value="summer">Scénario : Horaire d'Été</option>
              <option value="exams">Scénario : Semaine d'Examens</option>
            </select>

            <span aria-hidden="true" className="text-slate-400">
              ·
            </span>

            <span className="tabular-nums font-medium">
              Qualité : {qualityReport.globalScore}/100
            </span>

            <span aria-hidden="true" className="text-slate-400">
              ·
            </span>

            <span className="tabular-nums">
              {conflicts.length === 0
                ? '0 conflit'
                : `${conflicts.length} alerte(s)`}
            </span>

            <span aria-hidden="true" className="text-slate-400">
              ·
            </span>

            <button
              onClick={() =>
                setPublicationStatus((s) =>
                  s === 'published' ? 'draft' : 'published'
                )
              }
              className={`underline font-medium ${
                publicationStatus === 'published'
                  ? 'text-emerald-600'
                  : 'text-amber-600'
              }`}
            >
              {publicationStatus === 'published'
                ? 'Statut : Publié & Validé'
                : 'Statut : Version Provisoire'}
            </button>
          </div>

          {/* Right: Undo/Redo, Role Selector, Language FR/AR/EN, Dark Mode, Notifications, Auth */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Undo / Redo */}
            <div className="flex items-center gap-1">
              <button
                onClick={handleUndo}
                disabled={historyPast.length === 0}
                title="Annuler la dernière modification (Undo)"
                className={`p-1.5 rounded border disabled:opacity-40 ${
                  darkMode
                    ? 'border-slate-700 hover:bg-slate-800'
                    : 'border-slate-200 hover:bg-slate-100'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRedo}
                disabled={historyFuture.length === 0}
                title="Rétablir la modification (Redo)"
                className={`p-1.5 rounded border disabled:opacity-40 ${
                  darkMode
                    ? 'border-slate-700 hover:bg-slate-800'
                    : 'border-slate-200 hover:bg-slate-100'
                }`}
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Role Selector */}
            <select
              value={roleMode}
              onChange={(e) => {
                const nextRole = e.target.value as UserRole;
                setRoleMode(nextRole);
                if (nextRole === 'teacher') {
                  setGridViewMode('teacher');
                }
              }}
              aria-label="Rôle utilisateur"
              className={`px-2.5 py-1 rounded border text-xs font-medium ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-100'
                  : 'bg-slate-100 border-slate-200 text-slate-800'
              }`}
            >
              <option value="admin">Rôle : Administrateur Principal</option>
              <option value="section_head">Rôle : Responsable de Section</option>
              <option value="coordinator">Rôle : Coordinateur Pédagogique</option>
              <option value="teacher">Rôle : Portail Enseignant</option>
            </select>

            {/* Language Selector FR / AR / EN */}
            <div
              className={`flex items-center p-0.5 rounded border text-xs ${
                darkMode
                  ? 'bg-slate-800 border-slate-700'
                  : 'bg-slate-100 border-slate-200'
              }`}
            >
              {(['fr', 'ar', 'en'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase transition-colors ${
                    lang === l
                      ? 'bg-sky-700 text-white'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {l === 'ar' ? 'عربي' : l.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Dark Mode Toggle */}
            <button
              onClick={() => setDarkMode((d) => !d)}
              className={`p-1.5 rounded border ${
                darkMode
                  ? 'border-slate-700 text-amber-400 hover:bg-slate-800'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              title={darkMode ? 'Mode Clair' : 'Mode Sombre'}
            >
              {darkMode ? (
                <Sun className="w-3.5 h-3.5" />
              ) : (
                <Moon className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Notifications & Audit Log Button */}
            <button
              onClick={() => {
                setShowNotifDrawer(true);
                setUnreadCount(0);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded border flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Journal</span>
              {unreadCount > 0 && (
                <span className="font-mono text-[11px] font-bold text-sky-600 tabular-nums">
                  ({unreadCount})
                </span>
              )}
            </button>

            {/* Cloud Auth */}
            {user ? (
              <button
                onClick={() => signOut(auth)}
                className="px-2.5 py-1 text-xs font-medium border border-slate-300 rounded flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Déconnexion</span>
              </button>
            ) : (
              <button
                onClick={() => signInWithPopup(auth, googleProvider)}
                className="px-2.5 py-1 text-xs font-medium border border-slate-300 rounded flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Cloud Sync</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* LIVE TOAST NOTIFICATION */}
      {liveToast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg border border-slate-700 flex items-start gap-3 no-print">
          <Bell className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white">
              {liveToast.title}
            </div>
            <div className="text-xs text-slate-300 mt-0.5 leading-relaxed">
              {liveToast.message}
            </div>
          </div>
          <button
            onClick={() => setLiveToast(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =====================================================================
          MAIN WORKSPACE CONTENT
         ===================================================================== */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        {/* ===================================================================
            MODULE 1: ÉDITEUR VISUEL INTERACTIF & VUE ENSEMBLE (TOUTES LES CLASSES)
           =================================================================== */}
        {activeTab === 'editor' && (
          <div className="space-y-4">
            {/* Top Mode Switcher: Vue Ensemble (Toutes les classes) vs Grille Individuelle vs Loads & Matières */}
            <div
              className={`border rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 no-print ${
                darkMode
                  ? 'bg-slate-900 border-slate-800'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditorSubMode('ensemble')}
                  className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                    editorSubMode === 'ensemble'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4 text-sky-400" />
                  <span>
                    Vue Ensemble (Toutes les Classes · Switch Intelligent)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditorSubMode('single')}
                  className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                    editorSubMode === 'single'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  <span>
                    Grille Individuelle (Classe / Prof / Salle / Matière)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditorSubMode('loads')}
                  className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                    editorSubMode === 'loads'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  <span>
                    Matières, Enseignants, Loads & Cours Communs / Intercalés
                  </span>
                </button>
              </div>

              {/* Quick Print Load Reports */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintLoadReport('teachers_load')}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5 text-sky-700" />
                  <span>Imprimer Load Teachers</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintLoadReport('subjects_load')}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Imprimer Load Subjects</span>
                </button>
              </div>
            </div>

            {/* SUB-MODE A: VUE ENSEMBLE (ALL CLASSES TOGETHER + SMART SWITCH) */}
            {editorSubMode === 'ensemble' && (
              <MasterEnsembleMatrix
                classes={classes}
                teachers={teachers}
                lockedSlotsByClass={lockedSlotsByClass}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                onSwitchSlots={handleSwitchSlotsInAnyClass}
                onEditCell={(classId, day, period, slot) => {
                  setSelectedClassId(classId);
                  handleOpenSlotEditor(day, period, slot, classId);
                }}
                onOpenJointModal={() => {
                  setEditorSubMode('loads');
                }}
                onPrintEnsemble={handlePrintEnsembleMatrix}
                darkMode={darkMode}
              />
            )}

            {/* SUB-MODE B: LOADS, MATIÈRES, ENSEIGNANTS & COURS COMMUNS / INTERCALÉS */}
            {editorSubMode === 'loads' && (
              <LoadsAndManagementWorkspace
                classes={classes}
                teachers={teachers}
                subjectConfigs={subjectConfigs}
                rooms={rooms}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                onAddSubjectWithClasses={handleAddSubjectWithClasses}
                onAddNewTeacher={handleAddNewTeacher}
                onAdjustClassSubjectLoad={handleAdjustClassSubjectLoad}
                onAssembleClassesOrTeachers={handleAssembleClassesOrTeachers}
                onRemoveTeacherSession={handleRemoveTeacherSession}
                onUpdateTeacherMaxLoad={(teacherId, maxLoad) => {
                  const found = teachers.find((t) => t.id === teacherId);
                  if (found) {
                    saveTeacherToStore({
                      ...found,
                      maxPeriodsPerWeek: maxLoad,
                    });
                  }
                }}
                onPrintLoadReport={handlePrintLoadReport}
                darkMode={darkMode}
              />
            )}

            {/* SUB-MODE C: SINGLE TIMETABLE GRID (CLASSE / PROF / SALLE / MATIÈRE) */}
            {editorSubMode === 'single' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Sidebar: View Mode Selector + Entity Directory */}
                <aside
                  className={`lg:col-span-3 border rounded-lg p-4 no-print ${
                    darkMode
                      ? 'bg-slate-900 border-slate-800'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  {/* 4 View Modes: Classe, Enseignant, Salle, Matière */}
                  <div className="mb-3">
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                      Mode d'affichage de la grille
                    </label>
                    <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                      {(
                        [
                          ['class', 'Par Classe'],
                          ['teacher', 'Par Professeur'],
                          ['room', 'Par Salle'],
                          ['subject', 'Par Matière'],
                        ] as const
                      ).map(([mKey, mLabel]) => (
                        <button
                          key={mKey}
                          onClick={() => setGridViewMode(mKey)}
                          className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                            gridViewMode === mKey
                              ? 'bg-white text-slate-950 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {mLabel}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category Filter Pills (French Section, Boys Section, Girls Section...) */}
                  <div className="mb-3">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Catégorie (French / Boys / Girls)
                    </label>
                    <div className="flex flex-wrap gap-1">
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
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
                            selectedCategory === cat
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {CATEGORY_SHORT_LABELS[cat]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Search Input */}
                  <div className="relative mb-3">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Recherche instantanée..."
                      className={`w-full pl-8 pr-3 py-1.5 text-xs border rounded-md focus:outline-none focus:border-sky-600 ${
                        darkMode
                          ? 'bg-slate-800 border-slate-700 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-900'
                      }`}
                    />
                  </div>

                  {/* Directory List depending on gridViewMode */}
                  {gridViewMode === 'class' && (
                    <>
                      <div className="flex flex-wrap gap-1 mb-3 pb-3 border-b border-slate-200/60">
                        {(
                          [
                            ['ALL', 'Toutes'],
                            ['KG', 'KG'],
                            ['KG3_GS', 'KG3/GS'],
                            ['Primary', 'Primaire'],
                            ['Secondary_Girls', 'Sec. Filles'],
                            ['Secondary_Boys', 'Sec. Garçons'],
                          ] as const
                        ).map(([secKey, label]) => (
                          <button
                            key={secKey}
                            onClick={() => setSelectedSection(secKey)}
                            className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                              selectedSection === secKey
                                ? 'bg-sky-700 text-white'
                                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
                        {filteredClasses.map((cls) => {
                          const slotCount = Object.keys(cls.slots).length;
                          const isSelected = cls.id === selectedClass.id;
                          const lockedCount = (
                            lockedSlotsByClass[cls.id] || []
                          ).length;
                          return (
                            <button
                              key={cls.id}
                              onClick={() => setSelectedClassId(cls.id)}
                              className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center justify-between ${
                                isSelected
                                  ? 'bg-sky-50 text-sky-950 font-semibold border border-sky-200'
                                  : 'hover:bg-slate-100/60'
                              }`}
                            >
                              <span className="truncate">{cls.name}</span>
                              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                                {slotCount}p{' '}
                                {lockedCount > 0 ? `· ${lockedCount}v` : ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {gridViewMode === 'teacher' && (
                    <div className="space-y-1 max-h-[540px] overflow-y-auto pr-1">
                      {filteredTeachers.map((t) => {
                        const stats = buildTeacherTimetable(t.name, classes);
                        const isSelected = t.id === selectedTeacher?.id;
                        return (
                          <button
                            key={t.id}
                            onClick={() => setSelectedTeacherId(t.id)}
                            className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center justify-between ${
                              isSelected
                                ? 'bg-sky-50 text-sky-950 font-semibold border border-sky-200'
                                : 'hover:bg-slate-100/60'
                            }`}
                          >
                            <span className="truncate">{t.name}</span>
                            <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                              {stats.totalPeriods}p/sem
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {gridViewMode === 'room' && (
                    <div className="space-y-1 max-h-[540px] overflow-y-auto pr-1">
                      {rooms.map((r) => {
                        const isSelected = r.id === selectedRoom.id;
                        return (
                          <button
                            key={r.id}
                            onClick={() => setSelectedRoomId(r.id)}
                            className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center justify-between ${
                              isSelected
                                ? 'bg-sky-50 text-sky-950 font-semibold border border-sky-200'
                                : 'hover:bg-slate-100/60'
                            }`}
                          >
                            <span className="truncate">{r.name}</span>
                            <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                              {r.capacity} pl.
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {gridViewMode === 'subject' && (
                    <div className="space-y-1 max-h-[540px] overflow-y-auto pr-1">
                      {subjectConfigs.map((sub) => {
                        const isSelected =
                          sub.name.toLowerCase() ===
                          selectedSubjectFilter.toLowerCase();
                        return (
                          <button
                            key={sub.id}
                            onClick={() => setSelectedSubjectFilter(sub.name)}
                            className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center justify-between ${
                              isSelected
                                ? 'bg-sky-50 text-sky-950 font-semibold border border-sky-200'
                                : 'hover:bg-slate-100/60'
                            }`}
                          >
                            <span className="truncate">{sub.name}</span>
                            <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                              Coeff {sub.weight}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </aside>

                {/* Right Main Column: Interactive Toolbar + Landscape Timetable Grid */}
                <section className="lg:col-span-9 space-y-4">
                  {/* Post-Modification Smart Optimization Toolbar (Point 8) */}
                  <div
                    className={`border rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 no-print ${
                      darkMode
                        ? 'bg-slate-900 border-slate-800'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-lg font-bold">
                          {gridViewMode === 'class' &&
                            `Classe : ${selectedClass.name}`}
                          {gridViewMode === 'teacher' &&
                            `Enseignant : ${selectedTeacher?.name}`}
                          {gridViewMode === 'room' &&
                            `Salle : ${selectedRoom.name}`}
                          {gridViewMode === 'subject' &&
                            `Matière : ${selectedSubjectFilter}`}
                        </h1>
                        <span aria-hidden="true" className="text-slate-400">
                          ·
                        </span>
                        <span className="text-xs text-slate-500">
                          Glisser-déposer pour permuter · Cadenas pour verrouiller une séance
                        </span>
                      </div>
                    </div>

                    {/* Smart Post-Modification Actions (Point 8) */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setEditorSubMode('ensemble')}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
                      >
                        Retour Vue Ensemble (35 classes)
                      </button>

                      <button
                        onClick={handleRunGeminiOptimizeClass}
                        disabled={isAiRunning}
                        className="px-3 py-1.5 text-xs font-semibold text-sky-800 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Optimiser cette classe</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveTab('ai_csp');
                          handleGenerateMultiProposals('all');
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                      >
                        Optimiser tout l'établissement
                      </button>

                      {conflicts.length > 0 && (
                        <button
                          onClick={handleRepairAllConflicts}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          Réparer tous les conflits ({conflicts.length})
                        </button>
                      )}

                      <button
                        onClick={() => {
                          recordHistoryAndSetClasses(bestVersionSnapshot);
                          appendAuditLog(
                            'Restauration meilleure version',
                            'Retour à la version de référence validée.'
                          );
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                      >
                        Restaurer version de référence
                      </button>
                    </div>
                  </div>

                  {/* Timetable Grid Sheet */}
                  {gridViewMode === 'class' && (
                    <LandscapeTimetableSheet
                      title={selectedClass.name}
                      subtitle={`${selectedCampus} · ${SCHOOL_INFO.subtitle} · Scénario ${scenario.toUpperCase()}`}
                      section={selectedClass.section}
                      slots={selectedClass.slots}
                      editable={roleMode !== 'teacher'}
                      conflictSlotKeys={selectedClassConflictKeys}
                      lockedSlotKeys={
                        new Set(lockedSlotsByClass[selectedClass.id] || [])
                      }
                      modifiedSlotKeys={
                        new Set(modifiedSlotsByClass[selectedClass.id] || [])
                      }
                      onSlotClick={handleOpenSlotEditor}
                      onSlotSwap={handleDragDropSlotSwap}
                      onToggleLockSlot={handleToggleLockSlot}
                    />
                  )}

                  {gridViewMode === 'teacher' && selectedTeacher && (
                    <LandscapeTimetableSheet
                      title={`Prof. ${selectedTeacher.name}`}
                      subtitle={`${SCHOOL_INFO.subtitle} · Matières : ${selectedTeacher.subjects.join(
                        ', '
                      )} · Charge : ${selectedTeacherSchedule.totalPeriods}p/sem`}
                      section="Primary"
                      slots={selectedTeacherSchedule.slots}
                      isTeacherView={true}
                      unavailableSlotKeys={
                        new Set(selectedTeacher.unavailableSlots)
                      }
                    />
                  )}

                  {gridViewMode === 'room' && (
                    <LandscapeTimetableSheet
                      title={selectedRoom.name}
                      subtitle={`${selectedRoom.campus} · Capacité : ${selectedRoom.capacity} élèves · Équipements : ${selectedRoom.equipment.join(
                        ', '
                      )}`}
                      section="Primary"
                      slots={selectedRoomSchedule}
                      isTeacherView={true}
                    />
                  )}

                  {gridViewMode === 'subject' && (
                    <LandscapeTimetableSheet
                      title={`Matière : ${selectedSubjectFilter}`}
                      subtitle={`Répartition hebdomadaire inter-classes — ${SCHOOL_INFO.name}`}
                      section="Primary"
                      slots={selectedSubjectSchedule}
                      isTeacherView={true}
                    />
                  )}
                </section>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            MODULE 2: GESTION DES ENSEIGNANTS, LOADS, DISPONIBILITÉS & REMPLACEMENTS
           =================================================================== */}
        {activeTab === 'teachers' && (
          <div className="space-y-6">
            {/* Sub-Navigation Bar for Teachers Module */}
            <div
              className={`border rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 no-print ${
                darkMode
                  ? 'bg-slate-900 border-slate-800'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ['directory', '1. Affectation par Défaut & Charges Horaires'],
                    ['loads_subjects', '2. Loads Matières/Profs, Ajouts & Cours Communs'],
                    ['availability', '3. Disponibilités & Jours sans cours'],
                    ['substitutes', '4. Absences & Remplacements Automatiques'],
                  ] as const
                ).map(([subKey, subLabel]) => (
                  <button
                    key={subKey}
                    onClick={() => setTeacherSubTab(subKey)}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                      teacherSubTab === subKey
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {subLabel}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handlePrintLoadReport('teachers_load')}
                  className="px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5 text-sky-700" />
                  <span>Imprimer Load Teachers</span>
                </button>
                <button
                  onClick={() => handlePrintLoadReport('subjects_load')}
                  className="px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Imprimer Load Subjects</span>
                </button>
                <button
                  onClick={handleApplyAllDefaultTimetables}
                  disabled={isSyncingDefaults}
                  className="px-4 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>
                    {isSyncingDefaults
                      ? 'Synchronisation...'
                      : `Appliquer par défaut (${teachers.length} profs)`}
                  </span>
                </button>
              </div>
            </div>

            {/* SUB-TAB: LOADS, MATIÈRES, ENSEIGNANTS & COURS COMMUNS */}
            {teacherSubTab === 'loads_subjects' && (
              <LoadsAndManagementWorkspace
                classes={classes}
                teachers={teachers}
                subjectConfigs={subjectConfigs}
                rooms={rooms}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                onAddSubjectWithClasses={handleAddSubjectWithClasses}
                onAddNewTeacher={handleAddNewTeacher}
                onAdjustClassSubjectLoad={handleAdjustClassSubjectLoad}
                onAssembleClassesOrTeachers={handleAssembleClassesOrTeachers}
                onRemoveTeacherSession={handleRemoveTeacherSession}
                onUpdateTeacherMaxLoad={(teacherId, maxLoad) => {
                  const found = teachers.find((t) => t.id === teacherId);
                  if (found) {
                    saveTeacherToStore({
                      ...found,
                      maxPeriodsPerWeek: maxLoad,
                    });
                  }
                }}
                onPrintLoadReport={handlePrintLoadReport}
                darkMode={darkMode}
              />
            )}

            {/* SUB-TAB 1: DIRECTORY & WORKLOAD BALANCING */}
            {teacherSubTab === 'directory' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div
                  className={`lg:col-span-5 border rounded-lg overflow-hidden no-print ${
                    darkMode
                      ? 'bg-slate-900 border-slate-800'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="p-3 border-b border-slate-200 space-y-2">
                    <div className="flex flex-wrap gap-1">
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
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
                            selectedCategory === cat
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {CATEGORY_SHORT_LABELS[cat]}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filtrer enseignant, matière, section..."
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900"
                      />
                      <span className="text-xs font-mono text-slate-500 tabular-nums shrink-0">
                        {filteredTeachers.length} profs
                      </span>
                    </div>
                  </div>

                  <div className="max-h-[580px] overflow-y-auto divide-y divide-slate-100">
                    {filteredTeachers.map((t) => {
                      const stats = buildTeacherTimetable(t.name, classes);
                      const isSelected = selectedTeacher?.id === t.id;
                      const isOverloaded =
                        stats.totalPeriods > t.maxPeriodsPerWeek;
                      const isUnderloaded = stats.totalPeriods < 8;

                      return (
                        <div
                          key={t.id}
                          onClick={() => setSelectedTeacherId(t.id)}
                          className={`px-4 py-3 cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                            isSelected ? 'bg-sky-50/90 text-slate-950' : 'hover:bg-slate-50/60'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold truncate">
                                {t.name}
                              </span>
                              {t.defaultAssigned && (
                                <span
                                  title="Emploi du temps par défaut affecté"
                                  className="inline-flex shrink-0"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate mt-0.5">
                              {t.subjects.join(' · ')} · Section : {t.section}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div
                              className={`text-xs font-mono font-semibold tabular-nums ${
                                isOverloaded
                                  ? 'text-red-600'
                                  : isUnderloaded
                                  ? 'text-amber-600'
                                  : ''
                              }`}
                            >
                              {stats.totalPeriods} / {t.maxPeriodsPerWeek}p
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {isOverloaded
                                ? 'Surcharge'
                                : isUnderloaded
                                ? 'Temps partiel / Sous-charge'
                                : 'Charge équilibrée'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="lg:col-span-7 space-y-4">
                  {selectedTeacher && (
                    <>
                      <div
                        className={`border rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 no-print ${
                          darkMode
                            ? 'bg-slate-900 border-slate-800'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div>
                          <h2 className="text-base font-bold">
                            Grille Consolidée : {selectedTeacher.name}
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                            {selectedTeacherSchedule.totalPeriods} périodes/semaine ·{' '}
                            {selectedTeacherSchedule.classesTaught.length} classe(s) :{' '}
                            {selectedTeacherSchedule.classesTaught.join(', ')}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-xs text-slate-600">
                            Max p/sem :
                          </label>
                          <input
                            type="number"
                            min={4}
                            max={40}
                            value={selectedTeacher.maxPeriodsPerWeek}
                            onChange={(e) =>
                              saveTeacherToStore({
                                ...selectedTeacher,
                                maxPeriodsPerWeek:
                                  Number(e.target.value) || 24,
                              })
                            }
                            className="w-16 px-2 py-1 text-xs border border-slate-300 rounded font-mono tabular-nums text-slate-900 bg-white"
                          />
                          <button
                            onClick={() =>
                              handleDownloadLandscapeHtml('single_teacher')
                            }
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-md flex items-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>PDF Paysage Prof</span>
                          </button>
                        </div>
                      </div>

                      <LandscapeTimetableSheet
                        title={`Prof. ${selectedTeacher.name}`}
                        subtitle={`${SCHOOL_INFO.subtitle} — Matières : ${selectedTeacher.subjects.join(
                          ', '
                        )}`}
                        section="Primary"
                        slots={selectedTeacherSchedule.slots}
                        isTeacherView={true}
                        unavailableSlotKeys={
                          new Set(selectedTeacher.unavailableSlots)
                        }
                      />
                    </>
                  )}
                </div>
              </div>
            )}

            {/* SUB-TAB 2: AVAILABILITY MATRIX */}
            {teacherSubTab === 'availability' && selectedTeacher && (
              <div
                className={`border rounded-lg p-5 space-y-4 no-print ${
                  darkMode
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold">
                      Disponibilités & Horaires Autorisés : {selectedTeacher.name}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Cliquez sur un créneau ou sur l'en-tête d'une journée entière pour définir un jour sans cours.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <select
                      value={selectedTeacher.id}
                      onChange={(e) => setSelectedTeacherId(e.target.value)}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                    >
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.subjects.join(', ')})
                        </option>
                      ))}
                    </select>
                    {selectedTeacher.unavailableSlots.length > 0 && (
                      <button
                        onClick={() =>
                          saveTeacherToStore({
                            ...selectedTeacher,
                            unavailableSlots: [],
                          })
                        }
                        className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-md"
                      >
                        Tout rendre disponible
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-200 table-fixed text-slate-900 bg-white">
                    <thead>
                      <tr className="bg-slate-50 h-11">
                        <th className="w-32 border border-slate-200 px-3 py-2 text-left text-xs font-semibold">
                          Période
                        </th>
                        {DAYS_OF_WEEK.map((day) => (
                          <th
                            key={day}
                            className="border border-slate-200 px-3 py-2 text-center text-xs font-semibold"
                          >
                            <div>{day}</div>
                            <button
                              type="button"
                              onClick={() => {
                                const dayKeys = [1, 2, 3, 4, 5, 6, 7, 8].map(
                                  (p) => `${day}_${p}`
                                );
                                const allBlocked = dayKeys.every((k) =>
                                  selectedTeacher.unavailableSlots.includes(k)
                                );
                                const next = allBlocked
                                  ? selectedTeacher.unavailableSlots.filter(
                                      (k) => !dayKeys.includes(k)
                                    )
                                  : Array.from(
                                      new Set([
                                        ...selectedTeacher.unavailableSlots,
                                        ...dayKeys,
                                      ])
                                    );
                                saveTeacherToStore({
                                  ...selectedTeacher,
                                  unavailableSlots: next,
                                });
                              }}
                              className="text-[10px] font-medium text-sky-700 hover:underline mt-0.5"
                            >
                              Basculer journée entière
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((period) => (
                        <tr key={period} className="h-14">
                          <td className="border border-slate-200 bg-slate-50 px-3 py-1.5">
                            <div className="text-xs font-bold tabular-nums">
                              Période {period}
                            </div>
                            <div className="text-[11px] text-slate-500 tabular-nums">
                              {BELL_SCHEDULES.Primary.find(
                                (b) => b.periodNumber === period
                              )?.time || ''}
                            </div>
                          </td>
                          {DAYS_OF_WEEK.map((day) => {
                            const key = `${day}_${period}`;
                            const isUnavail =
                              selectedTeacher.unavailableSlots.includes(key);
                            const assignedLesson =
                              selectedTeacherSchedule.slots[key];
                            const isConflict =
                              isUnavail && Boolean(assignedLesson);

                            return (
                              <td
                                key={key}
                                onClick={() =>
                                  handleToggleTeacherUnavailable(day, period)
                                }
                                className={`border border-slate-200 p-2 cursor-pointer transition-colors ${
                                  isConflict
                                    ? 'bg-red-50 hover:bg-red-100'
                                    : isUnavail
                                    ? 'bg-amber-50 hover:bg-amber-100'
                                    : assignedLesson
                                    ? 'bg-sky-50/60 hover:bg-sky-100/60'
                                    : 'bg-white hover:bg-slate-50'
                                }`}
                              >
                                <div className="flex flex-col justify-between h-full">
                                  <span
                                    className={`text-[11px] font-semibold ${
                                      isConflict
                                        ? 'text-red-700'
                                        : isUnavail
                                        ? 'text-amber-800'
                                        : 'text-emerald-700'
                                    }`}
                                  >
                                    {isConflict
                                      ? 'Conflit Horaire'
                                      : isUnavail
                                      ? 'Indisponible'
                                      : 'Disponible'}
                                  </span>
                                  {assignedLesson && (
                                    <div className="text-[11px] font-medium text-slate-800 truncate">
                                      {assignedLesson.subject} ·{' '}
                                      {assignedLesson.teacher}
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUB-TAB 3: ABSENCES & AUTOMATIC SUBSTITUTE SEARCH (Point 12) */}
            {teacherSubTab === 'substitutes' && (
              <div
                className={`border rounded-lg p-5 space-y-5 no-print ${
                  darkMode
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div>
                  <h2 className="text-base font-bold">
                    Gestion des Absences & Recherche Automatique d'un Remplaçant Qualifié
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Sélectionnez l'enseignant absent et le créneau concerné. Le moteur identifie tous les professeurs libres à cette heure, qualifiés dans la même matière ou section, et sous leur plafond hebdomadaire.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg text-slate-900">
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Enseignant absent
                    </label>
                    <select
                      value={absentTeacherId}
                      onChange={(e) => setAbsentTeacherId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
                    >
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.subjects.join(', ')})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Jour d'absence
                    </label>
                    <select
                      value={absentDay}
                      onChange={(e) =>
                        setAbsentDay(e.target.value as DayOfWeek)
                      }
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
                    >
                      {DAYS_OF_WEEK.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Période concernée
                    </label>
                    <select
                      value={absentPeriod}
                      onChange={(e) => setAbsentPeriod(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                        <option key={p} value={p}>
                          Période {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Course affected banner */}
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 flex items-center justify-between">
                  <div>
                    <span className="font-bold">Séance à remplacer : </span>
                    {absentTeacherLessonAtSlot ? (
                      <span>
                        Cours de <strong>{absentTeacherLessonAtSlot.subject}</strong> en classe de{' '}
                        <strong>{absentTeacherLessonAtSlot.teacher}</strong> ({absentDay} P{absentPeriod})
                      </span>
                    ) : (
                      <span>
                        {absentTeacherObj?.name} n'a pas de classe assignée sur {absentDay} P{absentPeriod} (remplacement préventif).
                      </span>
                    )}
                  </div>
                </div>

                {/* Ranked Substitute Candidates */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Enseignants Remplaçants Disponibles & Qualifiés ({substituteCandidates.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {substituteCandidates.map((cand) => (
                      <div
                        key={cand.teacher.id}
                        className="p-3.5 border border-slate-200 rounded-lg flex items-center justify-between gap-3 bg-white text-slate-900"
                      >
                        <div>
                          <div className="text-xs font-bold">
                            {cand.teacher.name}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Matières : {cand.teacher.subjects.join(', ')} · Charge :{' '}
                            <span className="font-mono tabular-nums">
                              {cand.currentWeeklyLoad}/{cand.teacher.maxPeriodsPerWeek}p
                            </span>
                          </div>
                          <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
                            {cand.teachesSameSubject
                              ? 'Même spécialité matière'
                              : 'Disponible sur ce créneau'}{' '}
                            · Score compatibilité : {cand.score}/100
                          </div>
                        </div>

                        <button
                          onClick={() =>
                            handleAssignSubstitute(cand.teacher.name)
                          }
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap shrink-0"
                        >
                          Affecter & Notifier
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            MODULE 3: MOTEUR DE CONTRAINTES (CP-SAT) + MULTI-PROPOSITIONS + ASSISTANT IA
           =================================================================== */}
        {activeTab === 'ai_csp' && (
          <div className="space-y-6 no-print">
            {/* Top Row: Conversational AI Assistant + Constraint Engine Verification (Point 5) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div
                className={`lg:col-span-7 border rounded-lg p-5 space-y-4 ${
                  darkMode
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-sky-600" />
                    <span>
                      Assistant IA Conversationnel & Vérificateur de Contraintes
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Formulez vos instructions en langage naturel. Chaque modification proposée par Gemini AI est obligatoirement contrôlée par le moteur de contraintes strictes avant validation, sans jamais supprimer de séance obligatoire.
                  </p>
                </div>

                {/* Preset Natural Language Prompts */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Déplace les cours de sciences de l’après-midi vers le matin pour PEI2',
                    'Évite les séances répétitives de Maths le même jour pour G1 Girls',
                    'Analyse les conflits et propose la meilleure permutation pour KG3',
                  ].map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => setChatInput(sample)}
                      className="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
                    >
                      « {sample} »
                    </button>
                  ))}
                </div>

                <form onSubmit={handleAskConversationalAi} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600">
                      Classe active :
                    </span>
                    <select
                      value={selectedClass.id}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-slate-50 text-slate-900"
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ex: Déplace les cours de sciences du matin vers l’après-midi pour PEI2..."
                      className="flex-1 px-3.5 py-2 text-xs border border-slate-300 rounded-lg text-slate-900 bg-white focus:outline-none focus:border-sky-600"
                    />
                    <button
                      type="submit"
                      disabled={isChatLoading}
                      className="px-4 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {isChatLoading ? 'Vérification...' : 'Analyser & Simuler'}
                      </span>
                    </button>
                  </div>
                </form>

                {/* Pending AI Proposal with Constraint Engine Verification Gate */}
                {pendingAiProposal && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-slate-900">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">
                        Proposition de l'Assistant IA & Contrôle Moteur CP-SAT
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          pendingAiProposal.engineValid
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {pendingAiProposal.engineValid
                          ? 'Vérifié : 0 violation stricte'
                          : `${pendingAiProposal.engineViolations.length} alerte(s) contrainte`}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed">
                      {pendingAiProposal.reply}
                    </p>

                    {pendingAiProposal.warning && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900">
                        <strong>Note de compatibilité :</strong>{' '}
                        {pendingAiProposal.warning}
                      </div>
                    )}

                    {pendingAiProposal.swaps.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold text-slate-600">
                          Permutations simulées (conservation 100% du volume horaire) :
                        </div>
                        {pendingAiProposal.swaps.map((sw, idx) => (
                          <div
                            key={idx}
                            className="p-2 bg-white border border-slate-200 rounded text-xs flex items-center justify-between"
                          >
                            <span>
                              <strong>{sw.className}</strong> : {sw.fromKey} (
                              {sw.fromSlot?.subject || 'Libre'}) ↔ {sw.toKey} (
                              {sw.toSlot?.subject || 'Libre'})
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {sw.reason}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={() => setPendingAiProposal(null)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-300 rounded-md"
                      >
                        Refuser / Annuler
                      </button>
                      {pendingAiProposal.swaps.length > 0 && (
                        <button
                          type="button"
                          onClick={handleConfirmPendingAiProposal}
                          className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Accepter & Valider les modifications</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Multi-Proposal Generator & Comparator (Points 4 & 17) */}
              <div
                className={`lg:col-span-5 border rounded-lg p-5 space-y-4 ${
                  darkMode
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold">
                      Générateur Multi-Propositions Classées
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Comparez 3 propositions d'emplois du temps selon leur score pédagogique et technique.
                    </p>
                  </div>
                  <button
                    onClick={() => handleGenerateMultiProposals('all')}
                    disabled={isGeneratingProposals}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0"
                  >
                    {isGeneratingProposals
                      ? 'Calcul CP-SAT...'
                      : 'Générer 3 Propositions'}
                  </button>
                </div>

                {generatedProposals.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-xs">
                    Cliquez sur <strong>« Générer 3 Propositions »</strong> pour lancer le solveur de contraintes et comparer les solutions A, B et C.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {generatedProposals.map((prop) => (
                      <div
                        key={prop.id}
                        className="p-3.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-900 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">{prop.name}</span>
                          <span className="text-xs font-mono font-bold text-emerald-700 tabular-nums">
                            Score : {prop.quality.globalScore}/100
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          {prop.description}
                        </p>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-700 pt-1">
                          <span className="tabular-nums">
                            Matières matin : {prop.quality.morningCoreRatio}% · Permutations : {prop.swapsPerformed}
                          </span>
                          <button
                            onClick={() => handleApplyProposal(prop)}
                            className="px-3 py-1 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded"
                          >
                            Appliquer cette proposition
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Row: Advanced Constraints Manager (Strict vs Soft) + Live Conflict Radar */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Constraints Governance Table (Point 6) */}
              <div
                className={`lg:col-span-7 border rounded-lg p-5 space-y-4 ${
                  darkMode
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div>
                  <h2 className="text-base font-bold">
                    Gestion Avancée des Contraintes (Strictes & Souples)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Les contraintes strictes (HC) ne sont jamais violées par le solveur. Les contraintes souples (SC) sont pondérées par niveau de priorité.
                  </p>
                </div>

                <div className="divide-y divide-slate-100">
                  {constraints.map((rule) => (
                    <div
                      key={rule.id}
                      className="py-3 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-bold text-slate-500">
                            {rule.code}
                          </span>
                          <span className="font-bold">{rule.title}</span>
                          <span className="text-slate-400" aria-hidden="true">
                            ·
                          </span>
                          <span
                            className={`text-[11px] font-semibold ${
                              rule.category === 'strict'
                                ? 'text-red-700'
                                : 'text-sky-700'
                            }`}
                          >
                            {rule.category === 'strict'
                              ? 'Stricte (Obligatoire)'
                              : `Souple (Priorité ${rule.priority}/10)`}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {rule.description}
                        </p>
                      </div>

                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        disabled={rule.category === 'strict'}
                        onChange={() =>
                          setConstraints((prev) =>
                            prev.map((r) =>
                              r.id === rule.id
                                ? { ...r, enabled: !r.enabled }
                                : r
                            )
                          )
                        }
                        className="h-4 w-4 accent-sky-700 shrink-0"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Conflict Radar */}
              <div
                className={`lg:col-span-5 border rounded-lg p-5 space-y-4 ${
                  darkMode
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold">
                    Radar des Conflits & Impossibilités
                  </h2>
                  <span className="text-xs font-mono font-bold tabular-nums">
                    {conflicts.length} détecté(s)
                  </span>
                </div>

                {conflicts.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50 border border-slate-200 rounded-lg text-slate-900">
                    <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto mb-2" />
                    <div className="text-xs font-bold">
                      Aucune contrainte stricte violée
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Les 35 classes respectent les disponibilités et l'unicité des enseignants.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {conflicts.map((conf) => (
                      <div
                        key={conf.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3 text-slate-900"
                      >
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold">
                            {conf.teacher} · {conf.day} P{conf.period}
                          </div>
                          <p className="text-[11px] text-slate-600">
                            {conf.description}
                          </p>
                        </div>
                        <button
                          onClick={() => handleResolveConflictWithAi(conf)}
                          disabled={resolvingConflictId === conf.id}
                          className="px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 rounded shrink-0"
                        >
                          {resolvingConflictId === conf.id
                            ? '...'
                            : 'Corriger IA'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            MODULE 4: GESTION DES SALLES, LABORATOIRES, MATIÈRES & GROUPES (Points 3, 9, 10)
           =================================================================== */}
        {activeTab === 'resources' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start no-print">
            {/* Rooms & Labs Management */}
            <div
              className={`lg:col-span-6 border rounded-lg p-5 space-y-4 ${
                darkMode
                  ? 'bg-slate-900 border-slate-800'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold">
                    Salles de Classe, Laboratoires, Bibliothèques & Terrains P.E
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Gérez la capacité, les équipements et l'état de disponibilité de chaque espace.
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  {rooms.length} salles
                </span>
              </div>

              <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto pr-1">
                {rooms.map((room) => (
                  <div
                    key={room.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-xs font-bold">{room.name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {room.campus} · Capacité :{' '}
                        <span className="font-mono tabular-nums">
                          {room.capacity} places
                        </span>{' '}
                        · {room.equipment.join(', ')}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setSelectedRoomId(room.id);
                          setGridViewMode('room');
                          setActiveTab('editor');
                        }}
                        className="px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 rounded hover:bg-sky-100"
                      >
                        Voir planning
                      </button>
                      <button
                        onClick={() =>
                          setRooms((prev) =>
                            prev.map((r) =>
                              r.id === room.id
                                ? { ...r, isAvailable: !r.isAvailable }
                                : r
                            )
                          )
                        }
                        className={`px-2.5 py-1 text-xs font-medium rounded ${
                          room.isAvailable
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {room.isAvailable ? 'Active' : 'En maintenance'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Subjects, Coefficients & Durations Management */}
            <div
              className={`lg:col-span-6 border rounded-lg p-5 space-y-4 ${
                darkMode
                  ? 'bg-slate-900 border-slate-800'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div>
                <h2 className="text-base font-bold">
                  Matières, Coefficients Horaires, Durées & Séances Spécialisées
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configurez la durée (30, 40, 45, 50 ou 60 min), la priorité du matin et le type de salle requis.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-2">Matière</th>
                      <th className="py-2 px-2">Durée</th>
                      <th className="py-2 px-2">Type</th>
                      <th className="py-2 px-2">Matin (P1-P4)</th>
                      <th className="py-2 pl-2 text-right">Coeff</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subjectConfigs.map((sub) => (
                      <tr key={sub.id}>
                        <td className="py-2.5 pr-2 font-bold">{sub.name}</td>
                        <td className="py-2.5 px-2">
                          <select
                            value={sub.durationMinutes}
                            onChange={(e) =>
                              setSubjectConfigs((prev) =>
                                prev.map((s) =>
                                  s.id === sub.id
                                    ? {
                                        ...s,
                                        durationMinutes: Number(
                                          e.target.value
                                        ) as SubjectConfig['durationMinutes'],
                                      }
                                    : s
                                )
                              )
                            }
                            className="px-2 py-1 border border-slate-200 rounded bg-slate-50 text-slate-900 font-mono tabular-nums"
                          >
                            {[30, 40, 45, 50, 60].map((m) => (
                              <option key={m} value={m}>
                                {m} min
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 px-2 text-slate-500 capitalize">
                          {sub.sessionType}
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="checkbox"
                            checked={sub.preferMorning}
                            onChange={() =>
                              setSubjectConfigs((prev) =>
                                prev.map((s) =>
                                  s.id === sub.id
                                    ? { ...s, preferMorning: !s.preferMorning }
                                    : s
                                )
                              )
                            }
                            className="accent-sky-700"
                          />
                        </td>
                        <td className="py-2.5 pl-2 text-right font-mono tabular-nums font-semibold">
                          {sub.weight}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            MODULE 5: RAPPORTS, STATISTIQUES, IMPORT EXCEL/CSV & IMPRESSION PDF
           =================================================================== */}
        {activeTab === 'reports_export' && (
          <div className="space-y-6">
            {/* KPI Summary Row (Point 13) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 no-print">
              <div
                className={`p-4 border rounded-lg ${
                  darkMode
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="text-xs text-slate-500">
                  Qualité Globale de l'Emploi du Temps
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-emerald-600">
                  {qualityReport.globalScore} / 100
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Calculé par le moteur CP-SAT
                </div>
              </div>

              <div
                className={`p-4 border rounded-lg ${
                  darkMode
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="text-xs text-slate-500">
                  Matières Principales le Matin (P1–P4)
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-sky-600">
                  {qualityReport.morningCoreRatio}%
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Maths, Français, English, Sciences
                </div>
              </div>

              <div
                className={`p-4 border rounded-lg ${
                  darkMode
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="text-xs text-slate-500">
                  Taux d'Occupation des Salles & Labs
                </div>
                <div className="text-2xl font-bold font-mono tabular-nums mt-1">
                  {qualityReport.roomUtilizationRate}%
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Sur les {rooms.length} espaces configurés
                </div>
              </div>

              <div
                className={`p-4 border rounded-lg ${
                  darkMode
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="text-xs text-slate-500">
                  Année Scolaire & Duplication
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xl font-bold font-mono tabular-nums">
                    {schoolYear}
                  </span>
                  <button
                    onClick={handleDuplicateSchoolYear}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-900 text-white rounded flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Dupliquer</span>
                  </button>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Conservation des données utiles
                </div>
              </div>
            </div>

            {/* Row 2: Export Center (PDF Paysage, Excel CSV, iCalendar .ics, MySQL, MongoDB) + Excel Import Validator */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 no-print">
              {/* Left: Impression & Multi-Format Export */}
              <div
                className={`lg:col-span-6 border rounded-lg p-5 space-y-4 ${
                  darkMode
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div>
                  <h2 className="text-base font-bold">
                    Centre d'Impression PDF Paysage, Excel, Calendrier iCal & Cloud DB
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Exportez les emplois du temps aux formats muraux A4 paysage, tableurs Excel/CSV, calendriers numériques (.ics) et bases de données.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    onClick={() => window.print()}
                    className="px-3.5 py-2.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg flex items-center justify-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Imprimer PDF Paysage (Actif)</span>
                  </button>

                  <button
                    onClick={() => handlePrintEnsembleMatrix()}
                    className="px-3.5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center justify-center gap-2"
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span>Imprimer Vue Ensemble (HTML/PDF)</span>
                  </button>

                  <button
                    onClick={() => handlePrintLoadReport('teachers_load')}
                    className="px-3.5 py-2.5 text-xs font-semibold text-sky-900 bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-lg flex items-center justify-center gap-2"
                  >
                    <Printer className="w-4 h-4 text-sky-700" />
                    <span>Imprimer Load Teachers (PDF)</span>
                  </button>

                  <button
                    onClick={() => handlePrintLoadReport('subjects_load')}
                    className="px-3.5 py-2.5 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg flex items-center justify-center gap-2"
                  >
                    <Printer className="w-4 h-4 text-emerald-700" />
                    <span>Imprimer Load Subjects (PDF)</span>
                  </button>

                  <button
                    onClick={() => handleDownloadLandscapeHtml('all_classes')}
                    className="px-3.5 py-2.5 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Pack 35 Classes (HTML/PDF)</span>
                  </button>

                  <button
                    onClick={() =>
                      handleDownloadFile(
                        generateExcelCsvExport(classes),
                        `AlKawthar_Emplois_du_Temps_${schoolYear}.csv`,
                        'text/csv'
                      )
                    }
                    className="px-3.5 py-2.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center gap-2"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Exporter vers Excel (.CSV)</span>
                  </button>

                  <button
                    onClick={() =>
                      handleDownloadFile(
                        generateICalendarExport(
                          selectedClass.name,
                          selectedClass.slots
                        ),
                        `Calendrier_${selectedClass.name.replace(
                          /\s+/g,
                          '_'
                        )}.ics`,
                        'text/calendar'
                      )
                    }
                    className="px-3.5 py-2.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center gap-2"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Exporter Calendrier (.ICS)</span>
                  </button>

                  <button
                    onClick={() =>
                      handleDownloadFile(
                        generateMySqlDump(classes, teachers),
                        'alkawthar_mysql_dump.sql',
                        'application/sql'
                      )
                    }
                    className="px-3.5 py-2.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center gap-2"
                  >
                    <Database className="w-4 h-4" />
                    <span>Export SQL Relationnel (.SQL)</span>
                  </button>

                  <button
                    onClick={() =>
                      handleDownloadFile(
                        generateMongoAtlasExport(classes, teachers),
                        'alkawthar_mongodb_atlas.json',
                        'application/json'
                      )
                    }
                    className="px-3.5 py-2.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center gap-2 sm:col-span-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Sauvegarde JSON / Atlas</span>
                  </button>
                </div>
              </div>

              {/* Right: Smart Excel / CSV Importer & Validator (Point 11) */}
              <div
                className={`lg:col-span-6 border rounded-lg p-5 space-y-4 ${
                  darkMode
                    ? 'bg-slate-900 border-slate-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold">
                      Importation & Validation Intelligente Excel / CSV
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Détection automatique des colonnes, doublons, matières sans enseignant et aperçu avant enregistrement.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const sample =
                        'Classe;Jour;Periode;Matiere;Enseignant\nPre-KG;Dimanche;1;English;Fareen - Najah PreKG\nKG1;Lundi;2;Montessori;Fatimah / Nour / Quodsiya';
                      setCsvImportText(sample);
                      setCsvValidationResult(
                        parseAndValidateImportedCsv(sample)
                      );
                    }}
                    className="text-xs text-sky-700 hover:underline font-medium shrink-0"
                  >
                    Charger exemple CSV
                  </button>
                </div>

                <textarea
                  rows={3}
                  value={csvImportText}
                  onChange={(e) => {
                    setCsvImportText(e.target.value);
                    if (e.target.value.trim()) {
                      setCsvValidationResult(
                        parseAndValidateImportedCsv(e.target.value)
                      );
                    } else {
                      setCsvValidationResult(null);
                    }
                  }}
                  placeholder="Collez ici vos lignes Excel ou CSV (Classe;Jour;Periode;Matiere;Enseignant)..."
                  className="w-full p-2.5 text-xs font-mono border border-slate-300 rounded-lg text-slate-900 bg-slate-50"
                />

                {csvValidationResult && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">
                        Aperçu : {csvValidationResult.rows.length} séance(s) valide(s)
                      </span>
                      <span className="font-mono text-[11px] tabular-nums">
                        {csvValidationResult.issues.length} anomalie(s)
                      </span>
                    </div>
                    {csvValidationResult.issues.slice(0, 3).map((iss, idx) => (
                      <div
                        key={idx}
                        className={`text-[11px] ${
                          iss.severity === 'error'
                            ? 'text-red-600'
                            : 'text-amber-700'
                        }`}
                      >
                        • {iss.message}
                      </div>
                    ))}
                    {csvValidationResult.rows.length > 0 && (
                      <button
                        onClick={handleApplyValidatedCsvImport}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded"
                      >
                        Enregistrer les {csvValidationResult.rows.length} séances validées
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Printable Preview */}
            <LandscapeTimetableSheet
              title={selectedClass.name}
              section={selectedClass.section}
              slots={selectedClass.slots}
            />
          </div>
        )}
      </main>

      {/* =====================================================================
          MODAL: EDIT TIMETABLE SLOT
         ===================================================================== */}
      {editingCell && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-5 space-y-4 shadow-xl text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-950">
                  Modifier la séance —{' '}
                  {classes.find((c) => c.id === editingCell.classId)?.name ||
                    selectedClass.name}
                </h3>
                <p className="text-xs text-slate-500 tabular-nums">
                  {editingCell.day} · Période {editingCell.period}
                </p>
              </div>
              <button
                onClick={() => setEditingCell(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSlotEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Matière principale
                </label>
                <input
                  type="text"
                  value={editingCell.subject}
                  onChange={(e) =>
                    setEditingCell({ ...editingCell, subject: e.target.value })
                  }
                  placeholder="Ex: Maths, English, Français, Sciences..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-sky-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Enseignant principal
                </label>
                <input
                  type="text"
                  list="alkawthar-teachers-list"
                  value={editingCell.teacher}
                  onChange={(e) =>
                    setEditingCell({ ...editingCell, teacher: e.target.value })
                  }
                  placeholder="Sélectionner ou saisir un enseignant..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-sky-600"
                />
                <datalist id="alkawthar-teachers-list">
                  {teachers.map((t) => (
                    <option key={t.id} value={t.name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Salle ou Laboratoire affecté
                </label>
                <input
                  type="text"
                  list="alkawthar-rooms-list"
                  value={editingCell.room}
                  onChange={(e) =>
                    setEditingCell({ ...editingCell, room: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-sky-600"
                />
                <datalist id="alkawthar-rooms-list">
                  {rooms.map((r) => (
                    <option key={r.id} value={r.name} />
                  ))}
                </datalist>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-indigo-800 mb-1">
                    Rassembler avec une 2e classe (Cours commun au même créneau)
                  </label>
                  <select
                    value={editingCell.jointWithClassName || ''}
                    onChange={(e) =>
                      setEditingCell({
                        ...editingCell,
                        jointWithClassName: e.target.value,
                      })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-indigo-200 bg-indigo-50/40 rounded-md"
                  >
                    <option value="">
                      — Aucune (Classe unique sur ce créneau) —
                    </option>
                    {classes
                      .filter((c) => c.id !== editingCell.classId)
                      .map((c) => (
                        <option key={c.id} value={c.name}>
                          ⊕ Rassembler avec {c.name} ({c.section})
                        </option>
                      ))}
                  </select>
                </div>

                <span className="block text-[11px] font-semibold text-amber-800 pt-1">
                  Optionnel : Séance Intercalée / Co-enseignement (2 profs ou 2 demi-groupes)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      2e Matière (Intercalée)
                    </label>
                    <input
                      type="text"
                      value={editingCell.subSubject}
                      onChange={(e) =>
                        setEditingCell({
                          ...editingCell,
                          subSubject: e.target.value,
                        })
                      }
                      placeholder="Ex: Easy Arabic / Lab G2"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      2e Enseignant (Co-prof)
                    </label>
                    <input
                      type="text"
                      list="alkawthar-teachers-list"
                      value={editingCell.subTeacher}
                      onChange={(e) =>
                        setEditingCell({
                          ...editingCell,
                          subTeacher: e.target.value,
                        })
                      }
                      placeholder="Ex: Abeer"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() =>
                    setEditingCell({
                      ...editingCell,
                      subject: '',
                      teacher: '',
                      subSubject: '',
                      subTeacher: '',
                      jointWithClassName: '',
                    })
                  }
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Vider la case
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingCell(null)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md"
                  >
                    Enregistrer & Notifier
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          SLIDE-OVER DRAWER: REAL-TIME NOTIFICATIONS & AUDIT TRAIL (Point 15)
         ===================================================================== */}
      {showNotifDrawer && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex justify-end no-print">
          <div className="bg-white w-full max-w-md h-full flex flex-col border-l border-slate-200 shadow-xl text-slate-900">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-950">
                  Notifications Temps Réel & Journal d'Audit Direction
                </h3>
                <p className="text-[11px] text-slate-500">
                  Traçabilité complète des modifications et validations
                </p>
              </div>
              <button
                onClick={() => setShowNotifDrawer(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Notifications en direct ({notifications.length})
                </h4>
                <div className="divide-y divide-slate-100 space-y-2.5">
                  {notifications.slice(0, 10).map((n) => (
                    <div key={n.id} className="pt-2.5 first:pt-0">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-900">
                          {n.title}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                          {n.timestampMs
                            ? new Date(n.timestampMs).toLocaleTimeString(
                                'fr-FR',
                                {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                }
                              )
                            : 'En direct'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                        {n.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Journal d'Audit Détaillé ({auditLogs.length})
                </h4>
                <div className="divide-y divide-slate-100 space-y-2">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="pt-2 first:pt-0 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">
                          {log.action}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                          {log.timestamp}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        {log.details}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Par {log.actor} ({log.role})
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUIET FOOTER */}
      <footer
        className={`border-t px-6 py-4 text-xs no-print mt-auto ${
          darkMode
            ? 'bg-slate-900 border-slate-800 text-slate-400'
            : 'bg-white border-slate-200 text-slate-500'
        }`}
      >
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <span>
            {selectedCampus} · {SCHOOL_INFO.subtitle} · ChronoScolaire AI
          </span>
          <span>
            Moteur Hybride CP-SAT & Gemini AI · Format Paysage PDF aSc Horaires · Excel, iCal, SQL & Atlas
          </span>
        </div>
      </footer>
    </div>
  );
}
