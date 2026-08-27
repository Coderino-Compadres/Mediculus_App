import { formatDeltaSentence } from '../utils/reports'
import type { ReportMetric } from '../types/report'

/**
 * One of the four figures at the top of a weekly report.
 *
 * The change line is never optional and never a verdict: it always states a
 * direction and a value ("+0,6 od poprzedniego tygodnia"), and says so plainly
 * when there is no previous week to compare with. The colour follows the tone
 * the metric itself defines — see `tone()` in utils/reports.ts for why only
 * these four metrics get one.
 */
function ReportMetricCard({ metric }: { metric: ReportMetric }) {
  return (
    <div className="report-metric-card">
      <p className="report-metric-label">{metric.label}</p>
      <p className="report-metric-value">{metric.value}</p>
      <p className={`report-metric-change report-metric-change-${metric.delta.tone}`}>
        {formatDeltaSentence(metric.delta)}
      </p>
    </div>
  )
}

export default ReportMetricCard
