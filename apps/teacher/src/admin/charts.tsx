// Small, dependency-free charts for the admin statistics (Endterm Part C / C5).
// One measure per chart (no dual axes), thin bars with rounded data-ends, text in ink colours,
// a hover title on every mark, and a "Table" toggle so nothing depends on colour or hover alone.
import { useState, type ReactNode } from 'react';
import { useI18n } from '../i18n/index.tsx';

export interface Bar { label: string; value: number | null; note?: string }

/** "Nice" axis: steps of 1, 2, 2.5 or 5 × 10^k, so ticks read 0 / 5 / 10 / 15 % instead of 0 / 2.6 / 5.3 %. */
function scale(maxValue: number): { top: number; ticks: number[] } {
  const raw = Math.max(maxValue, 1) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  const n = Math.max(1, Math.ceil(maxValue / step));
  return { top: step * n, ticks: Array.from({ length: n + 1 }, (_, i) => Math.round(step * i * 100) / 100) };
}

function ChartFrame({ title, subtitle, source, table, children }: { title: string; subtitle?: string; source: string; table: ReactNode; children: ReactNode }) {
  const { t } = useI18n();
  const [asTable, setAsTable] = useState(false);
  return (
    <figure className="chart panel">
      <div className="section-head">
        <figcaption><h3>{title}</h3>{subtitle && <p className="muted small">{subtitle}</p>}</figcaption>
        <button className="btn btn-ghost btn-sm" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}>{asTable ? t('chartShowChart') : t('chartShowTable')}</button>
      </div>
      {asTable ? <div className="table-wrap">{table}</div> : children}
      <p className="chart-source">{source}</p>
    </figure>
  );
}

/** Vertical bars, one series. `unit` is appended to values (e.g. "%"). */
export function BarChart({ title, subtitle, source, bars, unit = '', max, yLabel, xLabel, horizontal = false }: {
  title: string; subtitle?: string; source: string; bars: Bar[]; unit?: string; max?: number; yLabel: string; xLabel: string;
  /** Long category names (courses): one row per bar instead of columns. */
  horizontal?: boolean;
}) {
  const { top, ticks } = scale(max ?? Math.max(...bars.map((b) => b.value ?? 0)));
  const table = (
    <table className="table"><thead><tr><th>{xLabel}</th><th className="num">{yLabel}</th></tr></thead>
      <tbody>{bars.map((b) => <tr key={b.label}><td>{b.label}</td><td className="num">{b.value == null ? '—' : `${b.value}${unit}`}{b.note ? <small className="muted block">{b.note}</small> : null}</td></tr>)}</tbody></table>
  );
  const fmt = (v: number | null) => (v == null ? '—' : `${v}${unit}`);
  if (horizontal) {
    return (
      <ChartFrame title={title} subtitle={subtitle} source={source} table={table}>
        <div className="hbars" role="img" aria-label={`${title}: ${bars.map((b) => `${b.label} ${fmt(b.value)}`).join(', ')}`}>
          {bars.map((b) => (
            <div key={b.label} className="hbar-row" title={`${b.label}: ${fmt(b.value)}${b.note ? ` (${b.note})` : ''}`}>
              <span className="hbar-label">{b.label}</span>
              <span className="hbar-track"><i style={{ width: `${b.value == null ? 0 : Math.max(0.5, (b.value / top) * 100)}%` }} /></span>
              <span className="hbar-val">{fmt(b.value)}</span>
            </div>
          ))}
        </div>
        <p className="bars-axis muted small">{xLabel} · {yLabel}</p>
      </ChartFrame>
    );
  }
  return (
    <ChartFrame title={title} subtitle={subtitle} source={source} table={table}>
      <div className="bars" role="img" aria-label={`${title}: ${bars.map((b) => `${b.label} ${b.value ?? '—'}${unit}`).join(', ')}`}>
        <div className="bars-y" aria-hidden="true">{ticks.map((v) => <span key={v} style={{ bottom: `${(v / top) * 100}%` }}>{v}{unit}</span>)}</div>
        <div className="bars-plot">
          {ticks.map((v) => <i key={v} className="bars-grid" style={{ bottom: `${(v / top) * 100}%` }} />)}
          {bars.map((b) => (
            <div key={b.label} className="bars-col" title={`${b.label}: ${b.value == null ? '—' : `${b.value}${unit}`}${b.note ? ` (${b.note})` : ''}`}>
              <span className={'bars-bar' + (b.value == null ? ' is-empty' : '')} style={{ height: `${b.value == null ? 0 : Math.max(1, (b.value / top) * 100)}%` }}>
                <span className="bars-val">{b.value == null ? '—' : `${b.value}${unit}`}</span>
              </span>
            </div>
          ))}
        </div>
        <span aria-hidden="true" />
        <div className="bars-x" aria-hidden="true">{bars.map((b) => <span key={b.label}>{b.label}</span>)}</div>
      </div>
      <p className="bars-axis muted small">{xLabel} · {yLabel}</p>
    </ChartFrame>
  );
}

/** Horizontal 100 % stacked bars: risk distribution per course (status colours + labels, never colour alone). */
export function RiskStack({ title, subtitle, source, rows }: {
  title: string; subtitle?: string; source: string;
  rows: { label: string; high: number; medium: number; low: number; unknown: number }[];
}) {
  const { t } = useI18n();
  const keys = ['high', 'medium', 'low', 'unknown'] as const;
  const table = (
    <table className="table"><thead><tr><th>{t('adminCourse')}</th>{keys.map((k) => <th key={k} className="num">{t(`level_${k}`)}</th>)}</tr></thead>
      <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td>{keys.map((k) => <td key={k} className="num">{r[k]}</td>)}</tr>)}</tbody></table>
  );
  return (
    <ChartFrame title={title} subtitle={subtitle} source={source} table={table}>
      <ul className="stack-legend">{keys.map((k) => <li key={k}><i className={`sw-${k}`} />{t(`level_${k}`)}</li>)}</ul>
      <div className="stack-rows">
        {rows.map((r) => {
          const total = keys.reduce((s, k) => s + r[k], 0) || 1;
          return (
            <div key={r.label} className="stack-row">
              <span className="stack-label">{r.label}</span>
              <span className="stack-bar">
                {keys.map((k) => r[k] > 0 && (
                  <i key={k} className={`sw-${k}`} style={{ width: `${(r[k] / total) * 100}%` }} title={`${r.label} · ${t(`level_${k}`)}: ${r[k]}`}>
                    {r[k] / total >= 0.12 ? r[k] : ''}
                  </i>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </ChartFrame>
  );
}
