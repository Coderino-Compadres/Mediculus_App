import { formatDelta } from '../utils/reports'
import type { ReportChangeChip } from '../types/report'

/**
 * The change chips under the narrative summary: "Nastrój +0,6", "Lęk −4 dni".
 *
 * Direction and value, never an assessment — and a chip with nothing to report
 * (no previous week, or no movement) is filtered out upstream rather than
 * rendered as an empty one.
 */
function ReportChangeChips({ changes }: { changes: ReportChangeChip[] }) {
  if (changes.length === 0) return null

  return (
    <div className="report-change-chips">
      {changes.map((change) => (
        <span
          key={change.label}
          className={`report-change-chip report-change-chip-${change.delta.tone}`}
        >
          {change.label} {formatDelta(change.delta)}
        </span>
      ))}
    </div>
  )
}

export default ReportChangeChips
