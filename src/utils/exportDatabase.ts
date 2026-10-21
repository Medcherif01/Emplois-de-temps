import { SchoolClass, TeacherProfile } from '../types/timetable';

export function generateMySqlDump(
  classes: SchoolClass[],
  teachers: TeacherProfile[]
): string {
  const esc = (s: string) => s.replace(/'/g, "''");
  const lines: string[] = [
    '-- ============================================================================',
    '-- ChronoScolaire AI — Al-Kawthar International Schools (Jeddah)',
    `-- Export MySQL Persistant généré le ${new Date().toISOString()}`,
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
      school: 'Al-Kawthar International Schools, 7983 King Abdulaziz Rd, Jeddah',
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
