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
  Bell,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Database,
  Download,
  Edit3,
  FileText,
  Filter,
  LogIn,
  LogOut,
  Printer,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  UserCheck,
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
  SchoolClass,
  SectionType,
  TeacherProfile,
} from './types/timetable';
import {
  generateStandaloneLandscapeHtml,
  LandscapeTimetableSheet,
} from './components/LandscapeTimetableSheet';
import {
  generateMongoAtlasExport,
  generateMySqlDump,
} from './utils/exportDatabase';

type ActiveTab =
  | 'classes'
  | 'teachers_panel'
  | 'availability'
  | 'ai_optimizer'
  | 'print_export';

export default function App() {
  // Auth & Role State
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [roleMode, setRoleMode] = useState<'admin' | 'teacher'>('admin');
  const [activeTab, setActiveTab] = useState<ActiveTab>('classes');

  // Core Timetable & Teacher State (Initialized with Al-Kawthar 35 classes & 68 teachers)
  const [classes, setClasses] = useState<SchoolClass[]>(DEFAULT_CLASSES);
  const [teachers, setTeachers] = useState<TeacherProfile[]>(DEFAULT_TEACHERS);
  const [isSyncedWithCloud, setIsSyncedWithCloud] = useState(false);
  const [isSyncingDefaults, setIsSyncingDefaults] = useState(false);

  // Filters & Selection
  const [selectedSection, setSelectedSection] = useState<SectionType | 'ALL'>('ALL');
  const [selectedClassId, setSelectedClassId] = useState<string>(DEFAULT_CLASSES[0].id);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    DEFAULT_TEACHERS[0]?.id || ''
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Notifications & Real-Time WebSocket State
  const [notifications, setNotifications] = useState<NotificationEntry[]>([
    {
      id: 'welcome-notif',
      title: 'Emplois du temps par défaut Al-Kawthar appliqués',
      message:
        'Les 35 classes (Pre-KG à DP2 Garçons) et 68 enseignants sont chargés avec leurs horaires officiels.',
      type: 'teacher_assigned',
      targetTeacher: 'all',
      visibility: 'school',
      authorId: 'system',
      timestampMs: Date.now(),
    },
  ]);
  const [unreadCount, setUnreadCount] = useState(1);
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  const [liveToast, setLiveToast] = useState<NotificationEntry | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Cell Editing Modal State
  const [editingCell, setEditingCell] = useState<{
    classId: string;
    day: DayOfWeek;
    period: number;
    subject: string;
    teacher: string;
    subSubject: string;
    subTeacher: string;
  } | null>(null);

  // AI Optimization State
  const [aiCustomPrompt, setAiCustomPrompt] = useState(
    "Optimiser l'équilibre hebdomadaire des matières principales, éviter les doublons consécutifs et respecter strictement les indisponibilités des enseignants."
  );
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [aiResultSummary, setAiResultSummary] = useState<{
    summary: string;
    pedagogicalScore?: number;
  } | null>(null);
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);

  // Print Mode Selection
  const [printScope, setPrintScope] = useState<
    'current_class' | 'current_teacher' | 'section_classes'
  >('current_class');

  // 1. Firebase Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 2. Real-Time Firestore Listeners (when authenticated)
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
          // Merge loaded classes with default order
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

  // 3. Real-Time WebSocket Connection for Instant Notifications & Multi-User Sync
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
                const incoming = (msg.payload.notifications as NotificationEntry[]).filter(
                  (n) => !existingIds.has(n.id)
                );
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
                setLiveToast((curr) => (curr?.id === newNotif.id ? null : curr));
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

  // Helper: Trigger Real-Time Notification (WebSocket + Firestore if logged in)
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
      const notifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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
        handleFirestoreError(err, OperationType.CREATE, `notifications/${notifId}`);
      }
    }
  };

  // Persist a single class update to Firestore + WS
  const saveClassToStore = async (updatedClass: SchoolClass) => {
    setClasses((prev) =>
      prev.map((c) => (c.id === updatedClass.id ? updatedClass : c))
    );

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          event: 'schedule:mutated',
          payload: { classId: updatedClass.id, updatedSlots: updatedClass.slots },
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
        handleFirestoreError(err, OperationType.WRITE, `classes/${updatedClass.id}`);
      }
    }
  };

  // Persist a single teacher update to Firestore
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
          maxPeriodsPerWeek: Math.min(45, Math.max(1, updatedTeacher.maxPeriodsPerWeek)),
          unavailableSlots: updatedTeacher.unavailableSlots.slice(0, 40),
          defaultAssigned: updatedTeacher.defaultAssigned,
          visibility: 'school',
          updatedBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `teachers/${updatedTeacher.id}`);
      }
    }
  };

  // Batch Apply Default Timetables to All Teachers & Classes
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

  const selectedTeacherSchedule = useMemo(() => {
    if (!selectedTeacher) return { slots: {}, totalPeriods: 0, classesTaught: [] };
    return buildTeacherTimetable(selectedTeacher.name, classes);
  }, [selectedTeacher, classes]);

  const conflicts = useMemo(
    () => detectScheduleConflicts(classes, teachers),
    [classes, teachers]
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
      if (selectedSection !== 'ALL' && c.section !== selectedSection) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      if (c.name.toLowerCase().includes(q)) return true;
      return Object.values(c.slots).some(
        (s) =>
          s.subject.toLowerCase().includes(q) ||
          s.teacher.toLowerCase().includes(q)
      );
    });
  }, [classes, selectedSection, searchQuery]);

  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.subjects.some((s) => s.toLowerCase().includes(q)) ||
        t.section.toLowerCase().includes(q)
      );
    });
  }, [teachers, searchQuery]);

  // Handlers for Editing a Slot
  const handleOpenSlotEditor = (
    day: DayOfWeek,
    period: number,
    currentSlot?: LessonSlot
  ) => {
    setEditingCell({
      classId: selectedClass.id,
      day,
      period,
      subject: currentSlot?.subject || '',
      teacher: currentSlot?.teacher || '',
      subSubject: currentSlot?.subSubject || '',
      subTeacher: currentSlot?.subTeacher || '',
    });
  };

  const handleSaveSlotEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCell) return;
    const key = `${editingCell.day}_${editingCell.period}`;
    const newSlots = { ...selectedClass.slots };

    if (!editingCell.subject.trim() || !editingCell.teacher.trim()) {
      delete newSlots[key];
    } else {
      const updatedSlot: LessonSlot = {
        subject: editingCell.subject.trim(),
        teacher: editingCell.teacher.trim(),
      };
      if (editingCell.subSubject.trim() && editingCell.subTeacher.trim()) {
        updatedSlot.subSubject = editingCell.subSubject.trim();
        updatedSlot.subTeacher = editingCell.subTeacher.trim();
      }
      newSlots[key] = updatedSlot;
    }

    const updatedClass: SchoolClass = {
      ...selectedClass,
      slots: newSlots,
    };

    setEditingCell(null);
    await saveClassToStore(updatedClass);
    await triggerRealtimeNotification(
      `Modification : ${selectedClass.name} (${editingCell.day} P${editingCell.period})`,
      editingCell.subject.trim()
        ? `Cours "${editingCell.subject}" attribué à ${editingCell.teacher} en ${selectedClass.name}.`
        : `Créneau ${editingCell.day} P${editingCell.period} libéré en ${selectedClass.name}.`,
      'schedule_updated',
      editingCell.teacher || 'all'
    );
  };

  // Toggle Teacher Availability
  const handleToggleTeacherUnavailable = async (day: DayOfWeek, period: number) => {
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
    await triggerRealtimeNotification(
      `Disponibilité mise à jour : ${selectedTeacher.name}`,
      exists
        ? `${selectedTeacher.name} est de nouveau disponible le ${day} (Période ${period}).`
        : `${selectedTeacher.name} a déclaré une indisponibilité le ${day} (Période ${period}).`,
      'availability_changed',
      selectedTeacher.name
    );
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
        .filter((t) => classTeachers.has(t.name.toLowerCase()) && t.unavailableSlots.length > 0)
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
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Échec de l'optimisation Gemini AI");
      }

      if (Array.isArray(data.slots) && data.slots.length > 0) {
        const nextSlots: Record<string, LessonSlot> = {};
        for (const item of data.slots) {
          if (item.day && item.period && item.subject && item.teacher) {
            const slotObj: LessonSlot = {
              subject: item.subject,
              teacher: item.teacher,
            };
            if (item.subSubject && item.subTeacher) {
              slotObj.subSubject = item.subSubject;
              slotObj.subTeacher = item.subTeacher;
            }
            nextSlots[`${item.day}_${item.period}`] = slotObj;
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
        await saveClassToStore({
          ...targetClass,
          slots: nextSlots,
        });
      }
    } catch (e) {
      console.error('Conflict resolution error:', e);
    } finally {
      setResolvingConflictId(null);
    }
  };

  // Download Standalone Printable Landscape HTML (PDF Ready)
  const handleDownloadLandscapeHtml = (mode: 'single_class' | 'single_teacher' | 'all_classes') => {
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
          subtitle: SCHOOL_INFO.subtitle,
          section: selectedClass.section,
          slots: selectedClass.slots,
        },
      ];
    } else if (mode === 'single_teacher' && selectedTeacher) {
      sheets = [
        {
          title: `Enseignant : ${selectedTeacher.name}`,
          subtitle: `${SCHOOL_INFO.subtitle} · Matières : ${selectedTeacher.subjects.join(', ')}`,
          section: 'Primary',
          slots: selectedTeacherSchedule.slots,
        },
      ];
    } else {
      sheets = classes.map((c) => ({
        title: c.name,
        subtitle: SCHOOL_INFO.subtitle,
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

  const handleDownloadDatabaseExport = (format: 'mysql' | 'mongodb') => {
    const content =
      format === 'mysql'
        ? generateMySqlDump(classes, teachers)
        : generateMongoAtlasExport(classes, teachers);
    const mime = format === 'mysql' ? 'application/sql' : 'application/json';
    const ext = format === 'mysql' ? 'sql' : 'json';
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alkawthar_timetables_${format}_export.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* TOP BAR CONTRACT: 3 clean zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-white border-b border-slate-200 no-print sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('classes');
          }}
          className="text-lg font-bold tracking-tight text-slate-950 whitespace-nowrap shrink-0"
        >
          ChronoScolaire AI
        </a>

        {/* Zone 2: 5 concise single-line navigation links */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            onClick={() => setActiveTab('classes')}
            className={`hover:text-slate-950 transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeTab === 'classes'
                ? 'text-slate-950 border-b-2 border-slate-950 font-semibold'
                : ''
            }`}
          >
            Grilles des Classes
          </button>
          <button
            onClick={() => setActiveTab('teachers_panel')}
            className={`hover:text-slate-950 transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeTab === 'teachers_panel'
                ? 'text-slate-950 border-b-2 border-slate-950 font-semibold'
                : ''
            }`}
          >
            Affectation Enseignants
          </button>
          <button
            onClick={() => setActiveTab('availability')}
            className={`hover:text-slate-950 transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeTab === 'availability'
                ? 'text-slate-950 border-b-2 border-slate-950 font-semibold'
                : ''
            }`}
          >
            Disponibilités
          </button>
          <button
            onClick={() => setActiveTab('ai_optimizer')}
            className={`hover:text-slate-950 transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeTab === 'ai_optimizer'
                ? 'text-slate-950 border-b-2 border-slate-950 font-semibold'
                : ''
            }`}
          >
            Planificateur Gemini IA
          </button>
          <button
            onClick={() => setActiveTab('print_export')}
            className={`hover:text-slate-950 transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeTab === 'print_export'
                ? 'text-slate-950 border-b-2 border-slate-950 font-semibold'
                : ''
            }`}
          >
            Impression PDF & Export DB
          </button>
        </nav>

        {/* Zone 3: Primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 text-xs font-semibold text-white bg-sky-700 rounded-lg hover:bg-sky-800 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimer PDF Paysage</span>
          </button>
        </div>
      </header>

      {/* WORKSPACE SUB-TOOLBAR (Role Toggle, School Context, Notifications, Auth) */}
      <div className="bg-white border-b border-slate-200 px-6 py-2.5 no-print">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Left: School metadata with clean typographic separators (Zero-Pill discipline) */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-900">
              {SCHOOL_INFO.name}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{classes.length} Classes (Pre-KG à DP2)</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{teachers.length} Enseignants</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {conflicts.length === 0
                ? '0 conflit détecté'
                : `${conflicts.length} point(s) d'attention`}
            </span>
            {isSyncedWithCloud && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-700 font-medium">
                  Base persistante synchronisée
                </span>
              </>
            )}
          </div>

          {/* Right: Interactive Role Switcher, Notification Bell & User Auth */}
          <div className="flex items-center gap-3">
            {/* Segmented Functional Control: Admin vs Professeur */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                onClick={() => setRoleMode('admin')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  roleMode === 'admin'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                Vue Administrateur
              </button>
              <button
                onClick={() => {
                  setRoleMode('teacher');
                  setActiveTab('teachers_panel');
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  roleMode === 'teacher'
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                Portail Professeur
              </button>
            </div>

            {/* Real-Time Notifications Trigger */}
            <button
              onClick={() => {
                setShowNotifDrawer(true);
                setUnreadCount(0);
              }}
              className="relative px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              title="Notifications en temps réel"
            >
              <Bell className="w-3.5 h-3.5 text-slate-700" />
              <span>Notifications</span>
              {unreadCount > 0 && (
                <span className="font-mono text-[11px] font-bold text-sky-700 tabular-nums">
                  ({unreadCount})
                </span>
              )}
            </button>

            {/* Firebase Auth Sign-In / Sign-Out */}
            {user ? (
              <div className="flex items-center gap-2 text-xs text-slate-700">
                <span className="font-medium truncate max-w-[140px]">
                  {user.displayName || user.email}
                </span>
                <button
                  onClick={() => signOut(auth)}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Déconnexion</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => signInWithPopup(auth, googleProvider)}
                className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Connexion Cloud</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="flex lg:hidden items-center gap-2 overflow-x-auto pt-2 mt-2 border-t border-slate-100">
          {[
            { id: 'classes', label: 'Classes' },
            { id: 'teachers_panel', label: 'Enseignants' },
            { id: 'availability', label: 'Disponibilités' },
            { id: 'ai_optimizer', label: 'Gemini IA' },
            { id: 'print_export', label: 'PDF & Export' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as ActiveTab)}
              className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                activeTab === t.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* LIVE REAL-TIME TOAST BANNER */}
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

      {/* MAIN CONTENT VIEWPORT */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        {/* ===================================================================
            TAB 1: GRILLES DES CLASSES (35 CLASSES AL-KAWTHAR)
           =================================================================== */}
        {activeTab === 'classes' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Sidebar: Class Directory & Section Filter */}
            <aside className="lg:col-span-3 bg-white border border-slate-200 rounded-lg p-4 no-print">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  Classes Al-Kawthar
                </h2>
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  {filteredClasses.length}/{classes.length}
                </span>
              </div>

              {/* Search Input */}
              <div className="relative mb-3">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher classe, prof, matière..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-sky-600"
                />
              </div>

              {/* Section Filter Buttons */}
              <div className="flex flex-wrap gap-1 mb-3 pb-3 border-b border-slate-100">
                {(
                  [
                    ['ALL', 'Toutes'],
                    ['KG', 'KG / Mat.'],
                    ['KG3_GS', 'KG3 & GS'],
                    ['Primary', 'Primaire'],
                    ['Secondary_Girls', 'Sec. Filles'],
                    ['Secondary_Boys', 'Sec. Garçons'],
                  ] as const
                ).map(([secKey, label]) => (
                  <button
                    key={secKey}
                    onClick={() => setSelectedSection(secKey)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      selectedSection === secKey
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Scrollable Class List */}
              <div className="space-y-1 max-h-[540px] overflow-y-auto pr-1">
                {filteredClasses.map((cls) => {
                  const slotCount = Object.keys(cls.slots).length;
                  const isSelected = cls.id === selectedClass.id;
                  return (
                    <button
                      key={cls.id}
                      onClick={() => setSelectedClassId(cls.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center justify-between ${
                        isSelected
                          ? 'bg-sky-50 text-sky-950 font-semibold border border-sky-200'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">{cls.name}</span>
                      <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                        {slotCount}p
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Main Timetable Area */}
            <section className="lg:col-span-9 space-y-4">
              {/* Action & Context Bar above the sheet */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 no-print">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold text-slate-950">
                      Classe : {selectedClass.name}
                    </h1>
                    <span className="text-xs text-slate-400" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-xs text-slate-600">
                      {SECTION_LABELS[selectedClass.section]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Cliquez sur n'importe quelle case horaire pour modifier la matière, l'enseignant ou ajouter un sous-groupe (ex. Easy Arabic).
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setActiveTab('ai_optimizer')}
                    className="px-3.5 py-2 text-xs font-semibold text-sky-800 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Optimiser avec Gemini IA</span>
                  </button>
                  <button
                    onClick={() => handleDownloadLandscapeHtml('single_class')}
                    className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>HTML Paysage (PDF)</span>
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Imprimer cette grille</span>
                  </button>
                </div>
              </div>

              {/* Printable Landscape Timetable Sheet */}
              <LandscapeTimetableSheet
                title={selectedClass.name}
                section={selectedClass.section}
                slots={selectedClass.slots}
                editable={roleMode === 'admin'}
                conflictSlotKeys={selectedClassConflictKeys}
                onSlotClick={handleOpenSlotEditor}
              />
            </section>
          </div>
        )}

        {/* ===================================================================
            TAB 2: PANNEAU DE GESTION & AFFECTATION PAR DÉFAUT AUX ENSEIGNANTS
           =================================================================== */}
        {activeTab === 'teachers_panel' && (
          <div className="space-y-6">
            {/* Top Banner: Apply Default Timetables to Teachers */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4 no-print">
              <div className="max-w-2xl">
                <h1 className="text-xl font-bold text-slate-950">
                  Panneau de Gestion — Affectation des Emplois du Temps par Défaut aux Enseignants
                </h1>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Appliquez et consolidez automatiquement les emplois du temps officiels Al-Kawthar (Pre-KG à DP2 Garçons) pour chacun des {teachers.length} enseignants. Chaque professeur dispose immédiatement de sa grille individuelle consolidée, de son volume horaire et de ses notifications en temps réel.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleApplyAllDefaultTimetables}
                  disabled={isSyncingDefaults}
                  className="px-4 py-2.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>
                    {isSyncingDefaults
                      ? 'Application en cours...'
                      : `Appliquer par défaut aux ${teachers.length} enseignants`}
                  </span>
                </button>
                <button
                  onClick={() => handleDownloadLandscapeHtml('single_teacher')}
                  className="px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Exporter Grille Professeur (PDF Paysage)</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left: Teachers Directory Table */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden no-print">
                <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filtrer un enseignant ou une matière..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <span className="text-xs font-mono text-slate-500 tabular-nums shrink-0">
                    {filteredTeachers.length} profs
                  </span>
                </div>

                <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-100">
                  {filteredTeachers.map((t) => {
                    const stats = buildTeacherTimetable(t.name, classes);
                    const isSelected = selectedTeacher?.id === t.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => setSelectedTeacherId(t.id)}
                        className={`px-4 py-3 cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                          isSelected ? 'bg-sky-50/90' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {t.name}
                            </span>
                            {t.defaultAssigned && (
                              <span title="Emploi du temps par défaut affecté" className="inline-flex shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            {t.subjects.join(' · ')}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            Classes : {stats.classesTaught.join(', ') || 'Aucune'}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-xs font-mono font-semibold text-slate-900 tabular-nums">
                            {stats.totalPeriods} p/sem
                          </div>
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            {t.unavailableSlots.length > 0
                              ? `${t.unavailableSlots.length} indisp.`
                              : '100% dispo'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: Selected Teacher Consolidated Timetable */}
              <div className="lg:col-span-7 space-y-4">
                {selectedTeacher && (
                  <>
                    <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 no-print">
                      <div>
                        <h2 className="text-lg font-bold text-slate-950">
                          Emploi du Temps Individuel : {selectedTeacher.name}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-1">
                          <span>Matières : {selectedTeacher.subjects.join(', ')}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums font-medium text-slate-900">
                            Charge : {selectedTeacherSchedule.totalPeriods} périodes / semaine
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            Classes ({selectedTeacherSchedule.classesTaught.length}) :{' '}
                            {selectedTeacherSchedule.classesTaught.join(', ')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setActiveTab('availability')}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          Gérer disponibilités ({selectedTeacher.unavailableSlots.length})
                        </button>
                        <button
                          onClick={() => window.print()}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Imprimer PDF</span>
                        </button>
                      </div>
                    </div>

                    <LandscapeTimetableSheet
                      title={`Prof. ${selectedTeacher.name}`}
                      subtitle={`${SCHOOL_INFO.subtitle} — Matières : ${selectedTeacher.subjects.join(', ')}`}
                      section="Primary"
                      slots={selectedTeacherSchedule.slots}
                      isTeacherView={true}
                      unavailableSlotKeys={new Set(selectedTeacher.unavailableSlots)}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 3: DISPONIBILITÉS DES ENSEIGNANTS
           =================================================================== */}
        {activeTab === 'availability' && selectedTeacher && (
          <div className="space-y-6 no-print">
            <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-950">
                  Gestion des Disponibilités & Contraintes Horaires
                </h1>
                <p className="text-xs text-slate-600 mt-1">
                  Sélectionnez un enseignant et cliquez sur les créneaux pour basculer entre Disponible et Indisponible. Le moteur Gemini IA utilise ces contraintes pour éviter automatiquement tout conflit.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-slate-700">
                  Enseignant :
                </label>
                <select
                  value={selectedTeacher.id}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                >
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.subjects.join(', ')})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3 text-xs text-slate-600">
                  <span className="font-bold text-slate-900 text-sm">
                    {selectedTeacher.name}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    Cours assignés : {selectedTeacherSchedule.totalPeriods} périodes/semaine
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums font-medium text-amber-800">
                    Créneaux indisponibles : {selectedTeacher.unavailableSlots.length}
                  </span>
                </div>

                {selectedTeacher.unavailableSlots.length > 0 && (
                  <button
                    onClick={() =>
                      saveTeacherToStore({
                        ...selectedTeacher,
                        unavailableSlots: [],
                      })
                    }
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md"
                  >
                    Réinitialiser toutes les indisponibilités
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-200 table-fixed">
                  <thead>
                    <tr className="bg-slate-50 h-11">
                      <th className="w-32 border border-slate-200 px-3 py-2 text-left text-xs font-semibold text-slate-700">
                        Période
                      </th>
                      {DAYS_OF_WEEK.map((day) => (
                        <th
                          key={day}
                          className="border border-slate-200 px-3 py-2 text-center text-xs font-semibold text-slate-900"
                        >
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((period) => (
                      <tr key={period} className="h-16">
                        <td className="border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-xs font-bold text-slate-900 tabular-nums">
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
                          const assignedLesson = selectedTeacherSchedule.slots[key];
                          const isConflict = isUnavail && Boolean(assignedLesson);

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
                                <div className="flex items-center justify-between">
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
                                </div>
                                {assignedLesson && (
                                  <div className="mt-1 text-[11px] font-medium text-slate-800 truncate">
                                    {assignedLesson.subject} · {assignedLesson.teacher}
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
          </div>
        )}

        {/* ===================================================================
            TAB 4: PLANIFICATEUR AUTOMATIQUE GEMINI IA & RÉSOLVEUR DE CONFLITS
           =================================================================== */}
        {activeTab === 'ai_optimizer' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start no-print">
            {/* Left Column: Gemini AI Class Generator & Optimizer */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-sky-700" />
                  <span>Générateur & Optimiseur IA Gemini</span>
                </h2>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Automatisez la planification des cours selon les disponibilités des enseignants tout en minimisant les conflits d'horaire et la fatigue pédagogique.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Classe à planifier / optimiser
                  </label>
                  <select
                    value={selectedClass.id}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {SECTION_LABELS[c.section]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Directives pédagogiques & contraintes pour Gemini IA
                  </label>
                  <textarea
                    rows={4}
                    value={aiCustomPrompt}
                    onChange={(e) => setAiCustomPrompt(e.target.value)}
                    className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 leading-relaxed"
                    placeholder="Ex: Répartir les séances de Maths le matin, respecter les indisponibilités de Rayan et Walaa..."
                  />
                </div>

                <button
                  onClick={handleRunGeminiOptimizeClass}
                  disabled={isAiRunning}
                  className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {isAiRunning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Calcul de l'emploi du temps optimal par Gemini IA...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>
                        Lancer l'optimisation IA sur {selectedClass.name}
                      </span>
                    </>
                  )}
                </button>
              </div>

              {aiResultSummary && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">
                      Rapport d'optimisation Gemini AI
                    </span>
                    {aiResultSummary.pedagogicalScore !== undefined && (
                      <span className="text-xs font-mono font-semibold text-emerald-700 tabular-nums">
                        Équilibre : {aiResultSummary.pedagogicalScore}/100
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {aiResultSummary.summary}
                  </p>
                  <button
                    onClick={() => setActiveTab('classes')}
                    className="text-xs font-semibold text-sky-700 hover:underline pt-1 inline-block"
                  >
                    Voir la grille mise à jour de {selectedClass.name} →
                  </button>
                </div>
              )}
            </div>

            {/* Right Column: Live Conflict Radar & One-Click AI Resolution */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">
                    Radar de Conflits & Co-enseignements
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Analyse croisée en temps réel des {classes.length} classes et des indisponibilités déclarées.
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-slate-900 tabular-nums">
                  {conflicts.length} détecté(s)
                </span>
              </div>

              {conflicts.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-lg">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <div className="text-sm font-semibold text-slate-900">
                    Aucun conflit d'horaire détecté
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Toutes les classes et disponibilités enseignants sont parfaitement alignées.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                  {conflicts.map((conf) => (
                    <div
                      key={conf.id}
                      className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <AlertTriangle
                            className={`w-3.5 h-3.5 shrink-0 ${
                              conf.severity === 'critical'
                                ? 'text-red-600'
                                : 'text-amber-600'
                            }`}
                          />
                          <span className="font-bold text-slate-900">
                            {conf.teacher}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-slate-600 tabular-nums">
                            {conf.day} P{conf.period}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {conf.description}
                        </p>
                      </div>

                      <button
                        onClick={() => handleResolveConflictWithAi(conf)}
                        disabled={resolvingConflictId === conf.id}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          {resolvingConflictId === conf.id
                            ? 'Résolution...'
                            : 'Résoudre IA'}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 5: IMPRESSION PAYSAGE HTML / PDF & EXPORT BASE DE DONNÉES
           =================================================================== */}
        {activeTab === 'print_export' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 no-print">
              {/* Card 1: Landscape HTML & PDF Print Center */}
              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">
                    Impression & Export PDF Format Paysage (aSc Horaires)
                  </h2>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Générez des emplois du temps en orientation paysage A4 haute lisibilité fidèles au modèle officiel Al-Kawthar International Schools.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => setPrintScope('current_class')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      printScope === 'current_class'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Classe sélectionnée ({selectedClass.name})
                  </button>
                  <button
                    onClick={() => setPrintScope('current_teacher')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      printScope === 'current_teacher'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Enseignant sélectionné ({selectedTeacher?.name})
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                  <button
                    onClick={() => window.print()}
                    className="px-3.5 py-2.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg flex items-center justify-center gap-1.5"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Imprimer en PDF Paysage</span>
                  </button>
                  <button
                    onClick={() =>
                      handleDownloadLandscapeHtml(
                        printScope === 'current_teacher'
                          ? 'single_teacher'
                          : 'single_class'
                      )
                    }
                    className="px-3.5 py-2.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    <span>Télécharger Fiche HTML</span>
                  </button>
                  <button
                    onClick={() => handleDownloadLandscapeHtml('all_classes')}
                    className="px-3.5 py-2.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center gap-1.5"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Pack 35 Classes (PDF HTML)</span>
                  </button>
                </div>
              </div>

              {/* Card 2: Persistent Database Export (MySQL & MongoDB Atlas & Vercel) */}
              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">
                    Persistance Cloud, Export MySQL & MongoDB Atlas
                  </h2>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Vos données sont persistées en temps réel. Vous pouvez également exporter à tout moment la base complète vers MySQL ou MongoDB Atlas pour votre déploiement externe (ex. Vercel).
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => handleDownloadDatabaseExport('mysql')}
                    className="p-3 text-left bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        Exporter Base MySQL (.sql)
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Tables relationnelles + 35 classes + 68 profs
                      </div>
                    </div>
                    <Database className="w-4 h-4 text-slate-600 shrink-0" />
                  </button>

                  <button
                    onClick={() => handleDownloadDatabaseExport('mongodb')}
                    className="p-3 text-left bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        Exporter MongoDB Atlas (.json)
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Collections JSON prêtes pour Atlas / Vercel
                      </div>
                    </div>
                    <Download className="w-4 h-4 text-slate-600 shrink-0" />
                  </button>
                </div>
              </div>
            </div>

            {/* Live Printable Landscape Preview */}
            {printScope === 'current_teacher' && selectedTeacher ? (
              <LandscapeTimetableSheet
                title={`Prof. ${selectedTeacher.name}`}
                subtitle={`${SCHOOL_INFO.subtitle} — Matières : ${selectedTeacher.subjects.join(', ')}`}
                section="Primary"
                slots={selectedTeacherSchedule.slots}
                isTeacherView={true}
              />
            ) : (
              <LandscapeTimetableSheet
                title={selectedClass.name}
                section={selectedClass.section}
                slots={selectedClass.slots}
              />
            )}
          </div>
        )}
      </main>

      {/* =====================================================================
          MODAL: EDIT TIMETABLE SLOT
         ===================================================================== */}
      {editingCell && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-950">
                  Modifier le créneau — {selectedClass.name}
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

              <div className="pt-2 border-t border-slate-100">
                <span className="block text-[11px] font-semibold text-slate-500 mb-2">
                  Optionnel : Demi-groupe / Co-enseignement (ex: Easy Arabic)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      2e Matière
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
                      placeholder="Ex: Easy Arabic"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      2e Enseignant
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
          SLIDE-OVER DRAWER: REAL-TIME NOTIFICATIONS
         ===================================================================== */}
      {showNotifDrawer && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex justify-end no-print">
          <div className="bg-white w-full max-w-md h-full flex flex-col border-l border-slate-200 shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-950">
                  Journal des Notifications en Temps Réel
                </h3>
                <p className="text-[11px] text-slate-500">
                  Synchronisation WebSocket & Firestore instantanée
                </p>
              </div>
              <button
                onClick={() => setShowNotifDrawer(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-4 space-y-3">
              {notifications.map((n) => (
                <div key={n.id} className="pt-3 first:pt-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">{n.title}</span>
                    <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {n.timestampMs
                        ? new Date(n.timestampMs).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'En direct'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {n.message}
                  </p>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Cible : {n.targetTeacher === 'all' ? 'Tous les enseignants' : n.targetTeacher}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* QUIET FOOTER */}
      <footer className="bg-white border-t border-slate-200 px-6 py-4 text-xs text-slate-500 no-print mt-auto">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <span>
            {SCHOOL_INFO.subtitle} · ChronoScolaire AI
          </span>
          <span>
            Compatible format paysage aSc Horaires · Export PDF, MySQL & MongoDB Atlas
          </span>
        </div>
      </footer>
    </div>
  );
}
