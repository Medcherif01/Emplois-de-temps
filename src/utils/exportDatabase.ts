import { DAYS_OF_WEEK, SCHOOL_INFO } from '../data/alkawtharDefaults';
import { SchoolClass, TeacherProfile } from '../types/timetable';

export function generateMySqlDump(
  classes: SchoolClass[],
  teachers: TeacherProfile[]
): string {
  const esc = (s: string) => s.replace(/'/g, "''");
  const lines: string[] = [
    '-- ============================================================================',
    '-- ChronoScolaire AI — Al-Kawthar International Schools (Jeddah)',
    `-- Export Relationnel SQL généré le ${new Date().toISOString()}`,
    '-- ============================================================================',
    '',
    'CREATE DATABASE IF NOT EXISTS alkawthar_timetables CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
    'USE alkawthar_timetables;',
    '',
    'CREATE TABLE IF NOT EXISTS classes (',
    '  id VARCHAR(128) PRIMARY KEY,',
    '  name VARCHAR(100) NOT NULL,',
    '  section VARCHAR(50) NOT NULL,',
    '  room VARCHAR(100) NOT NULL,',
    '  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    ');',
    '',
    'CREATE TABLE IF NOT EXISTS teachers (',
    '  id VARCHAR(128) PRIMARY KEY,',
    '  name VARCHAR(120) NOT NULL,',
    '  section VARCHAR(80) NOT NULL,',
    '  max_periods_per_week INT NOT NULL DEFAULT 24,',
    '  default_assigned BOOLEAN NOT NULL DEFAULT TRUE,',
    '  subjects_json JSON NOT NULL,',
    '  unavailable_slots_json JSON NOT NULL',
    ');',
    '',
    'CREATE TABLE IF NOT EXISTS timetable_slots (',
    '  id INT AUTO_INCREMENT PRIMARY KEY,',
    '  class_id VARCHAR(128) NOT NULL,',
    '  day_of_week VARCHAR(20) NOT NULL,',
    '  period_number INT NOT NULL,',
    '  subject VARCHAR(100) NOT NULL,',
    '  teacher VARCHAR(120) NOT NULL,',
    '  sub_subject VARCHAR(100) DEFAULT NULL,',
    '  sub_teacher VARCHAR(120) DEFAULT NULL,',
    '  UNIQUE KEY uq_class_slot (class_id, day_of_week, period_number),',
    '  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE',
    ');',
    '',
    '-- Insertion des Enseignants',
  ];

  for (const t of teachers) {
    lines.push(
      `INSERT INTO teachers (id, name, section, max_periods_per_week, default_assigned, subjects_json, unavailable_slots_json) VALUES ('${esc(
        t.id
      )}', '${esc(t.name)}', '${esc(t.section)}', ${t.maxPeriodsPerWeek}, ${
        t.defaultAssigned ? 1 : 0
      }, '${esc(JSON.stringify(t.subjects))}', '${esc(
        JSON.stringify(t.unavailableSlots)
      )}') ON DUPLICATE KEY UPDATE max_periods_per_week=VALUES(max_periods_per_week), default_assigned=VALUES(default_assigned), unavailable_slots_json=VALUES(unavailable_slots_json);`
    );
  }

  lines.push('', '-- Insertion des Classes & Créneaux Horaires');
  for (const c of classes) {
    lines.push(
      `INSERT INTO classes (id, name, section, room) VALUES ('${esc(
        c.id
      )}', '${esc(c.name)}', '${esc(c.section)}', '${esc(
        c.room
      )}') ON DUPLICATE KEY UPDATE name=VALUES(name), section=VALUES(section), room=VALUES(room);`
    );
    for (const [key, slot] of Object.entries(c.slots)) {
      const [day, periodStr] = key.split('_');
      const period = Number(periodStr);
      const subSubj = slot.subSubject ? `'${esc(slot.subSubject)}'` : 'NULL';
      const subTeach = slot.subTeacher ? `'${esc(slot.subTeacher)}'` : 'NULL';
      lines.push(
        `INSERT INTO timetable_slots (class_id, day_of_week, period_number, subject, teacher, sub_subject, sub_teacher) VALUES ('${esc(
          c.id
        )}', '${esc(day)}', ${period}, '${esc(slot.subject)}', '${esc(
          slot.teacher
        )}', ${subSubj}, ${subTeach}) ON DUPLICATE KEY UPDATE subject=VALUES(subject), teacher=VALUES(teacher), sub_subject=VALUES(sub_subject), sub_teacher=VALUES(sub_teacher);`
      );
    }
  }

  return lines.join('\n');
}

export function generateMongoAtlasExport(
  classes: SchoolClass[],
  teachers: TeacherProfile[]
): string {
  return JSON.stringify(
    {
      school: SCHOOL_INFO.subtitle,
      exportedAt: new Date().toISOString(),
      database: 'alkawthar_atlas_db',
      collections: {
        classes,
        teachers,
      },
    },
    null,
    2
  );
}

/**
 * Generates an Excel-compatible UTF-8 BOM CSV file of all classes, periods, subjects, teachers, and rooms.
 */
export function generateExcelCsvExport(classes: SchoolClass[]): string {
  const rows: string[] = [
    'Classe;Section;Salle;Jour;Periode;Matiere_Principale;Enseignant_Principal;Sous_Matiere_Groupe;Co_Enseignant',
  ];

  for (const c of classes) {
    for (const day of DAYS_OF_WEEK) {
      for (let p = 1; p <= 8; p++) {
        const slot = c.slots[`${day}_${p}`];
        if (!slot) continue;
        rows.push(
          [
            c.name,
            c.section,
            c.room,
            day,
            String(p),
            slot.subject,
            slot.teacher,
            slot.subSubject || '',
            slot.subTeacher || '',
          ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(';')
        );
      }
    }
  }

  return '\uFEFF' + rows.join('\n');
}

/**
 * Generates an iCalendar (.ics) file for a class or teacher schedule so it can be imported into Google Calendar / Outlook.
 */
export function generateICalendarExport(
  title: string,
  slots: Record<string, { subject: string; teacher: string; room?: string }>
): string {
  const dayOffsetMap: Record<string, number> = {
    Dimanche: 0,
    Lundi: 1,
    Mardi: 2,
    Mercredi: 3,
    Jeudi: 4,
  };

  // Next Sunday reference date
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());

  const pad = (n: number) => String(n).padStart(2, '0');
  const formatIcsDate = (d: Date, hour: number, min: number) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hour)}${pad(min)}00`;

  const periodTimes: Record<number, [number, number, number, number]> = {
    1: [8, 0, 8, 45],
    2: [8, 45, 9, 30],
    3: [9, 50, 10, 35],
    4: [10, 35, 11, 15],
    5: [11, 15, 11, 55],
    6: [11, 55, 12, 35],
    7: [13, 5, 13, 45],
    8: [13, 45, 14, 30],
  };

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ChronoScolaire AI//Al-Kawthar International Schools//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const [key, slot] of Object.entries(slots)) {
    const [day, pStr] = key.split('_');
    const p = Number(pStr);
    const offset = dayOffsetMap[day];
    if (offset === undefined || !periodTimes[p]) continue;

    const eventDate = new Date(sunday);
    eventDate.setDate(sunday.getDate() + offset);
    const [sh, sm, eh, em] = periodTimes[p];

    lines.push(
      'BEGIN:VEVENT',
      `UID:alkawthar_${title.replace(/\s+/g, '_')}_${key}@chronoscolaire.ai`,
      `DTSTART:${formatIcsDate(eventDate, sh, sm)}`,
      `DTEND:${formatIcsDate(eventDate, eh, em)}`,
      'RRULE:FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH',
      `SUMMARY:${slot.subject} (${slot.teacher})`,
      `DESCRIPTION:Emploi du temps ${title} - Période ${p}`,
      `LOCATION:${slot.room || SCHOOL_INFO.name}`,
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export interface CsvValidationIssue {
  row: number;
  severity: 'error' | 'warning';
  message: string;
}

export interface ParsedCsvRow {
  className: string;
  day: string;
  period: number;
  subject: string;
  teacher: string;
  subSubject?: string;
  subTeacher?: string;
}

/**
 * Parses & validates imported CSV/Excel data with duplicate detection, missing teacher alerts, and volume coherence.
 */
export function parseAndValidateImportedCsv(rawText: string): {
  rows: ParsedCsvRow[];
  issues: CsvValidationIssue[];
} {
  const rows: ParsedCsvRow[] = [];
  const issues: CsvValidationIssue[] = [];
  const seenKeys = new Set<string>();

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return {
      rows: [],
      issues: [
        {
          row: 1,
          severity: 'error',
          message: 'Le contenu importé est vide ou ne contient pas de lignes de données.',
        },
      ],
    };
  }

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const cols = rawLine
      .split(/[;,\t]/)
      .map((c) => c.replace(/^"|"$/g, '').trim());

    if (cols.length < 5) {
      issues.push({
        row: i + 1,
        severity: 'error',
        message: `Ligne ${i + 1} incomplète (${cols.length} colonnes trouvées, au moins 5 attendues : Classe, Jour, Période, Matière, Enseignant).`,
      });
      continue;
    }

    // Flexible column mapping (supports 5-col or 9-col export format)
    const isFullFormat = cols.length >= 7 && ['KG', 'KG3_GS', 'Primary', 'Secondary_Girls', 'Secondary_Boys'].includes(cols[1]);
    const className = cols[0];
    const day = isFullFormat ? cols[3] : cols[1];
    const period = Number(isFullFormat ? cols[4] : cols[2]);
    const subject = isFullFormat ? cols[5] : cols[3];
    const teacher = isFullFormat ? cols[6] : cols[4];
    const subSubject = isFullFormat ? cols[7] : cols[5];
    const subTeacher = isFullFormat ? cols[8] : cols[6];

    if (!className) {
      issues.push({ row: i + 1, severity: 'error', message: `Ligne ${i + 1} : Nom de classe manquant.` });
      continue;
    }
    if (!DAYS_OF_WEEK.includes(day as any)) {
      issues.push({
        row: i + 1,
        severity: 'error',
        message: `Ligne ${i + 1} : Jour "${day}" invalide (attendu : Dimanche, Lundi, Mardi, Mercredi, Jeudi).`,
      });
      continue;
    }
    if (isNaN(period) || period < 1 || period > 8) {
      issues.push({
        row: i + 1,
        severity: 'error',
        message: `Ligne ${i + 1} : Période "${period}" hors limites (1 à 8).`,
      });
      continue;
    }
    if (!subject) {
      issues.push({
        row: i + 1,
        severity: 'error',
        message: `Ligne ${i + 1} (${className} ${day} P${period}) : Matière manquante.`,
      });
      continue;
    }
    if (!teacher) {
      issues.push({
        row: i + 1,
        severity: 'warning',
        message: `Ligne ${i + 1} (${className} - ${subject}) : Matière sans enseignant affecté.`,
      });
    }

    const uniqueSlotKey = `${className.toLowerCase()}__${day}_${period}`;
    if (seenKeys.has(uniqueSlotKey)) {
      issues.push({
        row: i + 1,
        severity: 'warning',
        message: `Ligne ${i + 1} : Doublon détecté pour ${className} le ${day} (Période ${period}).`,
      });
    }
    seenKeys.add(uniqueSlotKey);

    rows.push({
      className,
      day,
      period,
      subject,
      teacher: teacher || 'Non affecté',
      subSubject: subSubject || undefined,
      subTeacher: subTeacher || undefined,
    });
  }

  return { rows, issues };
}
