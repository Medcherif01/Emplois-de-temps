import { DAYS_OF_WEEK, SCHOOL_INFO } from '../data/alkawtharDefaults';
import { SchoolCategory, SchoolClass } from '../types/timetable';
import {
  CATEGORY_LABELS,
  ClassLoadBlock,
  getSubjectVisualStyle,
  SubjectLoadRow,
  TeacherLoadRow,
} from './timetableAnalytics';

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Builds an Excel-compliant HTML document with Microsoft Excel XML namespaces.
 * When saved with .xls or application/vnd.ms-excel, Excel opens it natively
 * and renders all colors, cell background colors, borders, font families, and merged cells!
 */
function buildExcelDocument(title: string, tableHtml: string): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>${esc(title.slice(0, 31))}</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
            <x:Print>
              <x:Orientation>Landscape</x:Orientation>
            </x:Print>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #0f172a; }
    .excel-header { background-color: #0f172a; color: #ffffff; font-weight: bold; font-size: 14pt; padding: 10px; }
    .excel-sub { background-color: #1e293b; color: #cbd5e1; font-size: 9pt; padding: 6px; }
    table { border-collapse: collapse; width: 100%; }
    th { background-color: #334155; color: #ffffff; font-weight: bold; border: 1.5pt solid #0f172a; padding: 6px 10px; text-align: center; vertical-align: middle; }
    td { border: 0.5pt solid #94a3b8; padding: 5px 8px; vertical-align: middle; }
    .merged-teacher { background-color: #e2e8f0; font-weight: bold; font-size: 11pt; text-align: center; border: 1.5pt solid #0f172a; }
    .merged-class { background-color: #e0e7ff; font-weight: bold; font-size: 11pt; text-align: center; border: 1.5pt solid #0f172a; }
    .merged-total { background-color: #f1f5f9; font-weight: bold; font-size: 14pt; text-align: center; font-family: 'Consolas', monospace; border: 1.5pt solid #0f172a; }
    .sep-row { background-color: #64748b; height: 4pt; }
    .subject-pill { font-weight: bold; padding: 3px 6px; text-align: center; }
  </style>
</head>
<body>
  <table>
    <tr>
      <td colspan="6" class="excel-header">${esc(title)}</td>
    </tr>
    <tr>
      <td colspan="6" class="excel-sub">${esc(SCHOOL_INFO.subtitle)} · Année Scolaire 2026-2027 · Export Officiel Excel Al-Kawthar</td>
    </tr>
    <tr><td colspan="6" style="height: 6pt; background-color: #ffffff;"></td></tr>
  </table>
  ${tableHtml}
</body>
</html>`;
}

/**
 * Generates Styled Excel for LOAD TEACHERS (Tableau officiel charges professeurs)
 * Matches screenshot Image 1: merged teacher name, class, group, colored subject, periods, bold total
 */
export function generateStyledExcelForLoadTeachers(
  teacherRows: TeacherLoadRow[],
  category: SchoolCategory,
  schoolYear: string
): string {
  const title = `Load Teachers (Charges Enseignants) — ${CATEGORY_LABELS[category] || category}`;

  const bodyRows = teacherRows
    .filter((r) => r.lineItems.length > 0)
    .map((r) => {
      const span = r.lineItems.length;
      return r.lineItems
        .map((item, idx) => {
          const st = getSubjectVisualStyle(item.subject);
          return `<tr>
            ${
              idx === 0
                ? `<td rowspan="${span}" class="merged-teacher">
                    <div style="font-size: 12pt; font-weight: bold; font-style: italic; color: #0f172a;">${esc(
                      r.teacherName
                    )}</div>
                    <div style="font-size: 8pt; color: #475569; margin-top: 3px;">${esc(
                      r.sectionLabel
                    )}</div>
                  </td>`
                : ''
            }
            <td style="font-weight: bold; color: #0f172a;">${esc(item.classesLabel)}</td>
            <td style="color: #334155;">${esc(item.groupLabel)}</td>
            <td style="background-color: ${st.bgHex}; color: ${st.textHex}; font-weight: bold; text-align: center; border: 1pt solid ${st.borderHex};">
              ${esc(item.subject)}
            </td>
            <td style="text-align: center; font-weight: bold; font-family: Consolas, monospace; font-size: 12pt;">
              ${item.periods}
            </td>
            ${
              idx === 0
                ? `<td rowspan="${span}" class="merged-total">
                    <div style="font-size: 16pt; font-weight: 900; color: #0f172a;">${r.totalPeriods}</div>
                    <div style="font-size: 8pt; color: #64748b;">Max : ${r.maxPeriods}p</div>
                  </td>`
                : ''
            }
          </tr>`;
        })
        .join('');
    })
    .join(
      `<tr><td colspan="6" class="sep-row" style="background-color: #94a3b8; height: 5pt;"></td></tr>`
    );

  const tableHtml = `<table>
    <thead>
      <tr>
        <th style="width: 180pt;">Professeur</th>
        <th style="width: 140pt;">Classe(s)</th>
        <th style="width: 160pt;">Groupe</th>
        <th style="width: 150pt;">Matière</th>
        <th style="width: 110pt;">Nombre par semaine</th>
        <th style="width: 100pt;">Somme Séances</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
  </table>`;

  return buildExcelDocument(title, tableHtml);
}

/**
 * Generates Styled Excel for LOAD CLASSES (Tableau des charges par classe)
 * Matches screenshot Image 2: merged class name, colored subject, teacher, group, periods, sum
 */
export function generateStyledExcelForLoadClasses(
  classBlocks: ClassLoadBlock[],
  category: SchoolCategory,
  schoolYear: string
): string {
  const title = `Load Classes (Charges par Classe) — ${CATEGORY_LABELS[category] || category}`;

  const bodyRows = classBlocks
    .filter((b) => b.items.length > 0)
    .map((b) => {
      const span = b.items.length;
      return b.items
        .map((item, idx) => {
          const st = getSubjectVisualStyle(item.subject);
          return `<tr>
            ${
              idx === 0
                ? `<td rowspan="${span}" class="merged-class">
                    <div style="font-size: 13pt; font-weight: bold; font-style: italic; color: #1e1b4b;">${esc(
                      b.className
                    )}</div>
                    <div style="font-size: 8pt; color: #4338ca; margin-top: 2px;">${esc(
                      b.categoryLabel
                    )} · ${esc(b.room)}</div>
                  </td>`
                : ''
            }
            <td style="background-color: ${st.bgHex}; color: ${st.textHex}; font-weight: bold; border: 1pt solid ${st.borderHex};">
              ${esc(item.subject)}
            </td>
            <td style="font-weight: bold; color: #1e293b;">
              ${esc(item.teacher)}${
                item.assistantTeacher ? ` <span style="color: #86198f;">(+ Ass. ${esc(item.assistantTeacher)})</span>` : ''
              }
            </td>
            <td style="color: #475569;">${esc(item.groupLabel)}</td>
            <td style="text-align: center; font-weight: bold; font-family: Consolas, monospace; font-size: 12pt;">
              ${item.periods}
            </td>
            ${
              idx === 0
                ? `<td rowspan="${span}" class="merged-total">
                    <div style="font-size: 16pt; font-weight: 900; color: #1e1b4b;">${b.totalPeriods}</div>
                    <div style="font-size: 8pt; color: #64748b;">Cible : ${b.targetWeeklyCapacity}p</div>
                  </td>`
                : ''
            }
          </tr>`;
        })
        .join('');
    })
    .join(
      `<tr><td colspan="6" class="sep-row" style="background-color: #6366f1; height: 5pt;"></td></tr>`
    );

  const tableHtml = `<table>
    <thead>
      <tr>
        <th style="width: 160pt; background-color: #1e1b4b;">Classe</th>
        <th style="width: 150pt; background-color: #1e1b4b;">Matière</th>
        <th style="width: 190pt; background-color: #1e1b4b;">Professeur Principal &amp; Assistant</th>
        <th style="width: 140pt; background-color: #1e1b4b;">Groupe / Mode</th>
        <th style="width: 110pt; background-color: #1e1b4b;">Nombre par semaine</th>
        <th style="width: 100pt; background-color: #1e1b4b;">Somme des séances</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
  </table>`;

  return buildExcelDocument(title, tableHtml);
}

/**
 * Generates Styled Excel for MASTER ENSEMBLE MATRIX (All Classes side-by-side color coded)
 */
export function generateStyledExcelForEnsembleMatrix(
  classes: SchoolClass[],
  categoryFilter: SchoolCategory,
  schoolYear: string
): string {
  const title = `Vue Ensemble Toutes Classes — ${CATEGORY_LABELS[categoryFilter] || categoryFilter}`;

  const dayHeaders = DAYS_OF_WEEK.map(
    (d) =>
      `<th colspan="8" style="background-color: #0f172a; color: #ffffff; font-size: 11pt; border: 1.5pt solid #000000;">${esc(
        d
      )}</th>`
  ).join('');

  const periodHeaders = DAYS_OF_WEEK.map(() =>
    [1, 2, 3, 4, 5, 6, 7, 8]
      .map(
        (p) =>
          `<th style="background-color: #334155; color: #f8fafc; font-size: 9pt; width: 45pt;">P${p}</th>`
      )
      .join('')
  ).join('');

  const rows = classes.map((cls) => {
    const cells = DAYS_OF_WEEK.map((day) =>
      [1, 2, 3, 4, 5, 6, 7, 8]
        .map((p) => {
          const slot = cls.slots[`${day}_${p}`];
          if (!slot) {
            return `<td style="background-color: #f8fafc; border: 0.5pt solid #cbd5e1;"></td>`;
          }
          const st = getSubjectVisualStyle(slot.subject);
          return `<td style="background-color: ${st.bgHex}; color: ${st.textHex}; border: 1pt solid ${st.borderHex}; font-size: 8pt; text-align: center; vertical-align: middle;">
            <div style="font-weight: bold;">${esc(slot.subject)}</div>
            <div style="font-size: 7pt; opacity: 0.9;">${esc(slot.teacher)}${
            slot.assistantTeacher ? ` (+Ass)` : ''
          }</div>
          </td>`;
        })
        .join('')
    ).join('');

    return `<tr>
      <td style="background-color: #cbd5e1; font-weight: bold; font-size: 10pt; color: #0f172a; border: 1.5pt solid #0f172a; white-space: nowrap;">
        ${esc(cls.name)}
      </td>
      ${cells}
    </tr>`;
  }).join('');

  const tableHtml = `<table>
    <thead>
      <tr>
        <th rowspan="2" style="background-color: #0f172a; color: #ffffff; font-size: 11pt; width: 90pt;">Classe</th>
        ${dayHeaders}
      </tr>
      <tr>
        ${periodHeaders}
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;

  return buildExcelDocument(title, tableHtml);
}

/**
 * Downloads generated Styled Excel as .xls
 */
export function downloadStyledExcelFile(content: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + content], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
