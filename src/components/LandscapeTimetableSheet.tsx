import React from 'react';
import {
  BELL_SCHEDULES,
  DAYS_OF_WEEK,
  SCHOOL_INFO,
} from '../data/alkawtharDefaults';
import {
  DayOfWeek,
  LessonSlot,
  SectionType,
} from '../types/timetable';

interface LandscapeTimetableSheetProps {
  title: string;
  subtitle?: string;
  section: SectionType;
  slots: Record<string, LessonSlot>;
  isTeacherView?: boolean;
  editable?: boolean;
  conflictSlotKeys?: Set<string>;
  unavailableSlotKeys?: Set<string>;
  onSlotClick?: (day: DayOfWeek, period: number, currentSlot?: LessonSlot) => void;
}

export const AlKawtharCrestSvg: React.FC<{ className?: string }> = ({
  className = 'w-14 h-14',
}) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Logo Al-Kawthar International Schools"
  >
    <circle cx="50" cy="50" r="46" stroke="#0f172a" strokeWidth="2.5" fill="#ffffff" />
    <circle cx="50" cy="50" r="34" fill="#0284c7" />
    <path
      d="M32 58 C38 42, 62 42, 68 58"
      stroke="#ffffff"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <path
      d="M35 46 L50 32 L65 46"
      stroke="#bae6fd"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="50" cy="48" r="4.5" fill="#ffffff" />
    <text
      x="50"
      y="16"
      textAnchor="middle"
      fill="#0f172a"
      fontSize="7.5"
      fontWeight="700"
      letterSpacing="0.8"
    >
      AL KAWTHAR
    </text>
    <text
      x="50"
      y="91"
      textAnchor="middle"
      fill="#0f172a"
      fontSize="5.8"
      fontWeight="600"
      letterSpacing="0.4"
    >
      LES ÉCOLES INTERNATIONALES
    </text>
  </svg>
);

export const LandscapeTimetableSheet: React.FC<LandscapeTimetableSheetProps> = ({
  title,
  subtitle = SCHOOL_INFO.subtitle,
  section,
  slots,
  isTeacherView = false,
  editable = false,
  conflictSlotKeys,
  unavailableSlotKeys,
  onSlotClick,
}) => {
  const bellRows = BELL_SCHEDULES[section] || BELL_SCHEDULES.Primary;

  return (
    <div className="bg-white text-slate-950 border border-slate-300 p-5 print-only-landscape select-none">
      {/* Header matching Al-Kawthar aSc Horaires layout */}
      <div className="relative flex items-center justify-center pb-2 min-h-[68px]">
        <div className="absolute left-2 top-0 flex items-center gap-3">
          <AlKawtharCrestSvg className="w-14 h-14 shrink-0" />
        </div>
        <div className="text-center px-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-950 leading-none">
            {title}
          </h2>
          <p className="text-xs font-medium text-slate-700 mt-1.5">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Main Timetable Grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border-2 border-slate-900 table-fixed">
          <thead>
            <tr className="h-14">
              <th className="w-[125px] border border-slate-800 bg-white p-1 text-center text-xs font-semibold text-slate-700">
                Période / Heure
              </th>
              {DAYS_OF_WEEK.map((day) => (
                <th
                  key={day}
                  className="border border-slate-800 bg-white px-2 py-2 text-center text-lg font-medium text-slate-950"
                >
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bellRows.map((row, rIdx) => {
              if (row.type === 'break') {
                return (
                  <tr key={`break_${rIdx}`} className="h-11 bg-[#8ec5fe]">
                    <td className="border border-slate-800 bg-[#8ec5fe] px-1.5 py-1 text-center align-middle">
                      <div className="text-[11px] font-extrabold text-slate-950 leading-tight">
                        {row.label}
                      </div>
                      <div className="text-[11px] font-bold text-slate-900 tabular-nums leading-tight mt-0.5">
                        {row.time}
                      </div>
                    </td>
                    <td
                      colSpan={5}
                      className="border border-slate-800 bg-[#8ec5fe] text-center align-middle"
                    >
                      <span className="text-xs font-semibold text-slate-900/80 tracking-wide">
                        {row.label} ({row.time})
                      </span>
                    </td>
                  </tr>
                );
              }

              const periodNum = row.periodNumber!;
              // Alternate light cyan/blue tint on period column like the PDF
              const periodBg =
                periodNum % 2 === 1 ? 'bg-[#bceeff]' : 'bg-[#8ec5fe]';

              return (
                <tr key={`period_${periodNum}`} className="h-[64px]">
                  <td
                    className={`border border-slate-800 ${periodBg} px-1.5 py-1 text-center align-middle`}
                  >
                    <div className="text-base font-extrabold text-slate-950 leading-none tabular-nums">
                      {row.label}
                    </div>
                    <div className="text-[11px] font-bold text-slate-900 tabular-nums mt-1 leading-none">
                      {row.time}
                    </div>
                  </td>

                  {DAYS_OF_WEEK.map((day) => {
                    const slotKey = `${day}_${periodNum}`;
                    const cell = slots[slotKey];
                    const hasConflict = conflictSlotKeys?.has(slotKey);
                    const isUnavailable = unavailableSlotKeys?.has(slotKey);
                    const hasSplit = Boolean(cell?.subSubject && cell?.subTeacher);

                    return (
                      <td
                        key={slotKey}
                        onClick={() =>
                          editable && onSlotClick
                            ? onSlotClick(day, periodNum, cell)
                            : undefined
                        }
                        className={`border border-slate-800 p-0 align-stretch relative transition-colors ${
                          editable ? 'cursor-pointer hover:bg-sky-50/70' : ''
                        } ${
                          hasConflict
                            ? 'bg-red-50 ring-2 ring-inset ring-red-600'
                            : isUnavailable
                            ? 'bg-amber-50/70'
                            : 'bg-white'
                        }`}
                      >
                        {cell ? (
                          hasSplit ? (
                            <div className="grid grid-cols-2 h-[62px] divide-x divide-slate-800">
                              <div className="flex flex-col justify-between p-1.5 h-full">
                                <div className="text-center font-bold text-xs text-slate-950 leading-tight mt-1">
                                  {cell.subject}
                                </div>
                                <div className="text-[10px] font-medium text-slate-800 text-right truncate">
                                  {cell.teacher}
                                </div>
                              </div>
                              <div className="flex flex-col justify-between p-1.5 h-full">
                                <div className="text-center font-bold text-xs text-slate-950 leading-tight mt-1">
                                  {cell.subSubject}
                                </div>
                                <div className="text-[10px] font-medium text-slate-800 text-right truncate">
                                  {cell.subTeacher}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col justify-between px-2 py-1.5 h-[62px]">
                              <div className="text-center font-bold text-[15px] text-slate-950 leading-snug mt-1 truncate">
                                {cell.subject}
                              </div>
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[11px] font-medium text-slate-800 truncate">
                                  {cell.teacher}
                                </span>
                                {isTeacherView && cell.room && (
                                  <span className="text-[10px] text-slate-500 truncate">
                                    {cell.room}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        ) : (
                          <div className="h-[62px] flex items-center justify-center">
                            {isUnavailable ? (
                              <span className="text-[11px] font-medium text-amber-800">
                                Indisponible
                              </span>
                            ) : editable ? (
                              <span className="text-[11px] text-slate-300 opacity-0 hover:opacity-100 transition-opacity no-print">
                                + Ajouter
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer matching aSc Horaires */}
      <div className="flex items-center justify-between text-xs font-medium text-slate-900 mt-1.5 px-0.5">
        <span className="tabular-nums">
          Horaire généré:{new Date().toLocaleDateString('fr-FR')}
        </span>
        <span>aSc Horaires · ChronoScolaire AI</span>
      </div>
    </div>
  );
};

export function generateStandaloneLandscapeHtml(
  sheets: Array<{
    title: string;
    subtitle?: string;
    section: SectionType;
    slots: Record<string, LessonSlot>;
  }>
): string {
  const dateStr = new Date().toLocaleDateString('fr-FR');

  const pagesHtml = sheets
    .map((sheet, idx) => {
      const bellRows = BELL_SCHEDULES[sheet.section] || BELL_SCHEDULES.Primary;
      const rowsHtml = bellRows
        .map((row) => {
          if (row.type === 'break') {
            return `<tr class="break-row">
              <td class="period-col break-cell">
                <div class="break-title">${row.label}</div>
                <div class="break-time">${row.time}</div>
              </td>
              <td colspan="5" class="break-banner">${row.label} (${row.time})</td>
            </tr>`;
          }
          const p = row.periodNumber!;
          const bgClass = p % 2 === 1 ? 'period-odd' : 'period-even';
          const daysHtml = DAYS_OF_WEEK.map((day) => {
            const cell = sheet.slots[`${day}_${p}`];
            if (!cell) return `<td class="slot-cell"></td>`;
            if (cell.subSubject && cell.subTeacher) {
              return `<td class="slot-cell split-td">
                <div class="split-grid">
                  <div class="split-half">
                    <div class="subj-split">${cell.subject}</div>
                    <div class="teach-split">${cell.teacher}</div>
                  </div>
                  <div class="split-half">
                    <div class="subj-split">${cell.subSubject}</div>
                    <div class="teach-split">${cell.subTeacher}</div>
                  </div>
                </div>
              </td>`;
            }
            return `<td class="slot-cell">
              <div class="slot-inner">
                <div class="subj">${cell.subject}</div>
                <div class="teach">${cell.teacher}</div>
              </div>
            </td>`;
          }).join('');

          return `<tr class="period-row">
            <td class="period-col ${bgClass}">
              <div class="p-num">${row.label}</div>
              <div class="p-time">${row.time}</div>
            </td>
            ${daysHtml}
          </tr>`;
        })
        .join('');

      return `<div class="sheet ${idx < sheets.length - 1 ? 'page-break' : ''}">
        <div class="header">
          <div class="logo-box">
            <div class="logo-circle">AL KAWTHAR</div>
          </div>
          <div class="title-box">
            <h1>${sheet.title}</h1>
            <p>${sheet.subtitle || SCHOOL_INFO.subtitle}</p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th class="period-col"></th>
              ${DAYS_OF_WEEK.map((d) => `<th>${d}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="footer">
          <span>Horaire généré:${dateStr}</span>
          <span>aSc Horaires</span>
        </div>
      </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Emplois du Temps — Al-Kawthar International Schools (Paysage PDF)</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 7mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: Arial, Helvetica, sans-serif;
      margin: 0;
      padding: 12px;
      background: #ffffff;
      color: #000000;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #0f172a;
      color: #fff;
      padding: 10px 18px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    .toolbar button {
      background: #0284c7;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: bold;
      cursor: pointer;
    }
    @media print {
      .toolbar { display: none !important; }
      body { padding: 0; }
    }
    .sheet {
      width: 100%;
      margin-bottom: 24px;
    }
    .page-break {
      page-break-after: always;
      break-after: page;
    }
    .header {
      position: relative;
      text-align: center;
      padding-bottom: 6px;
      min-height: 58px;
    }
    .logo-box {
      position: absolute;
      left: 8px;
      top: 0;
    }
    .logo-circle {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      border: 2px solid #0f172a;
      background: #0284c7;
      color: #fff;
      font-size: 7px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .title-box h1 {
      margin: 0;
      font-size: 32px;
      font-weight: 700;
    }
    .title-box p {
      margin: 4px 0 0 0;
      font-size: 11px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 2px solid #000;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid #000;
    }
    thead th {
      height: 44px;
      font-size: 18px;
      font-weight: 500;
    }
    .period-col {
      width: 115px;
      text-align: center;
    }
    .period-odd { background: #bceeff; }
    .period-even { background: #8ec5fe; }
    .p-num { font-size: 15px; font-weight: bold; }
    .p-time { font-size: 11px; font-weight: bold; margin-top: 2px; }
    .break-row { height: 36px; background: #8ec5fe; }
    .break-cell { background: #8ec5fe; }
    .break-title, .break-time { font-size: 10px; font-weight: bold; }
    .break-banner {
      background: #8ec5fe;
      text-align: center;
      font-size: 11px;
      font-weight: bold;
    }
    .period-row { height: 54px; }
    .slot-cell { padding: 0; vertical-align: top; }
    .slot-inner {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 52px;
      padding: 4px 6px;
    }
    .subj {
      text-align: center;
      font-size: 14px;
      font-weight: bold;
      margin-top: 4px;
    }
    .teach {
      font-size: 10px;
      text-align: left;
    }
    .split-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      height: 52px;
    }
    .split-half {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 4px;
    }
    .split-half:first-child {
      border-right: 1px solid #000;
    }
    .subj-split {
      text-align: center;
      font-size: 11px;
      font-weight: bold;
      margin-top: 4px;
    }
    .teach-split {
      font-size: 9px;
      text-align: right;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div><strong>Al-Kawthar International Schools</strong> — Format Paysage A4 Optimisé pour PDF (${sheets.length} fiche(s))</div>
    <button onclick="window.print()">Imprimer / Enregistrer en PDF Paysage</button>
  </div>
  ${pagesHtml}
  <script>
    setTimeout(() => { window.print(); }, 400);
  </script>
</body>
</html>`;
}
