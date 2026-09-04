import { Link } from 'react-router-dom'
import ReportChangeChips from './ReportChangeChips'
import ReportMetricCard from './ReportMetricCard'
import ReportRankingBars, { type RankingRow } from './ReportRankingBars'
import { fromIsoDate } from '../utils/days'
import { EMOTION_COLORS } from '../utils/emotions'
import { DAYS_IN_WEEK, pluralDays } from '../utils/reports'
import type { WeeklyReport } from '../types/report'

/**
 * The body of a weekly report: the four figures, the two rankings, the flagged
 * days and the summary.
 *
 * ONE DEFINITION, TWO READERS. The patient opens a report on /reports/:id and
 * their specialist opens the same report on
 * /specialist/patients/:id/reports/:reportId — and it has to be *the same
 * document*. The numbers already cannot drift (both screens fetch what
 * core/reports.py derives from the same rows), but the sections could have: a
 * threshold changed on one screen, a section added to the other, and the
 * conversation in the consulting room would be two people reading different
 * papers. So the body lives here and each screen supplies only its own frame —
 * the heading, the actions, and the note at the bottom, which genuinely differ.
 *
 * `riskyDayPath` is the one behavioural difference and it is a decision, not an
 * oversight. The patient's flagged days link into the diary entry behind them;
 * the specialist's do not, because the specialist's access is **reports and
 * nothing else** for now — whether a treating specialist may read the diary
 * itself is an open question with the client, and a link into it would answer
 * that question in markup. Omit the prop and the rows render as plain text.
 */

/** Triggers have no palette of their own, so they share one sage tone rather
 *  than borrowing colours that mean an emotion elsewhere in the app. */
const TRIGGER_BAR_COLOR = 'var(--color-sage-light)'

/**
 * The emotions ranking, whose bars measure average intensity — see
 * `ReportRankingBars`. `count` stays the day count: it is still on the row, as
 * the second number, it is simply not what the length draws any more.
 */
function emotionRows(report: WeeklyReport): RankingRow[] {
  return report.emotions.map((entry) => ({
    label: entry.emotion,
    count: entry.days,
    // The one palette, shared with the diary and the home chart.
    color: EMOTION_COLORS[entry.emotion],
    average: entry.avgIntensity,
  }))
}

function triggerRows(report: WeeklyReport): RankingRow[] {
  return report.triggers.map((entry) => ({
    label: entry.trigger,
    count: entry.days,
    color: TRIGGER_BAR_COLOR,
  }))
}

/** 'Środa, 19 sierpnia' — enough to find the day in the diary.
 *
 * The first letter is raised here rather than with `text-transform: capitalize`,
 * which would raise the month's too: Polish month names are lower case. */
function riskyDayLabel(date: string): string {
  const label = fromIsoDate(date).toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function RiskyDayRow({
  date,
  notePreview,
  to,
}: {
  date: string
  notePreview: string
  to: string | null
}) {
  const body = (
    <div>
      <span className="report-risky-date">{riskyDayLabel(date)}</span>
      <p className="report-risky-note">{notePreview || 'Dzień oznaczony bez opisu.'}</p>
    </div>
  )

  if (to === null) {
    // Same class, so the row looks the same in both places; a <div> rather than
    // a <Link>, so nothing suggests there is somewhere to go.
    return <div className="report-risky-row">{body}</div>
  }

  return (
    <Link to={to} className="report-risky-row">
      {body}
      <span className="journal-row-arrow" aria-hidden="true">
        →
      </span>
    </Link>
  )
}

function ReportSections({
  report,
  riskyDayPath,
}: {
  report: WeeklyReport
  riskyDayPath?: (entryId: string) => string
}) {
  return (
    <>
      <section className="report-metrics">
        {report.metrics.map((metric) => (
          <ReportMetricCard key={metric.key} metric={metric} />
        ))}
      </section>

      <section className="journal-detail-card">
        <h2>Najsilniej odczuwane emocje</h2>
        <ReportRankingBars
          rows={emotionRows(report)}
          measure="average"
          emptyText="W tym tygodniu żadna emocja nie została oceniona."
        />
      </section>

      <section className="journal-detail-card">
        <h2>Najczęstsze wyzwalacze</h2>
        <ReportRankingBars
          rows={triggerRows(report)}
          emptyText="W tym tygodniu żaden wpis nie wskazywał miejsca ani sytuacji."
        />
      </section>

      {/* The section stays visible even when it is empty: for a specialist, "no
          flagged days this week" is itself a reading, and a section that appears
          only on bad weeks would announce them from the table of contents. */}
      <section className="journal-detail-card">
        <h2>Zachowania ryzykowne</h2>
        {report.riskyDays.length === 0 ? (
          <p className="report-empty">Brak oznaczonych zachowań ryzykownych w tym tygodniu.</p>
        ) : (
          <>
            <p className="report-risky-count">
              <span className="risky-behavior-icon" aria-hidden="true">
                !
              </span>
              Zachowanie ryzykowne oznaczone w {report.riskyDays.length} z {DAYS_IN_WEEK}{' '}
              {pluralDays(DAYS_IN_WEEK)}.
            </p>
            <div className="report-risky-list">
              {report.riskyDays.map((day) => (
                <RiskyDayRow
                  key={day.entryId}
                  date={day.date}
                  notePreview={day.notePreview}
                  to={riskyDayPath ? riskyDayPath(day.entryId) : null}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* TODO: "Skuteczność technik" from the mockup goes here. It needs a way to
          rate a technique after applying it, which the app does not have yet
          (extension-priority feature) — a percentage computed from nothing would
          be a made-up number in a document a therapist reads. */}

      {/* TODO: "Realizacja celów" from the mockup goes here, after the techniques
          section. It needs the therapeutic-goals system, which does not exist yet
          either (also an extension). */}

      <section className="journal-detail-card">
        <h2>Podsumowanie tygodnia</h2>
        <p className="report-summary-text">{report.summary}</p>
        <ReportChangeChips changes={report.changes} />
      </section>
    </>
  )
}

export default ReportSections
