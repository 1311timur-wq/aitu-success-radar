// Student Success Radar on real data: the student's OWN published records, computed by @aitu/domain.
// Visual language of the original My DU replica is kept (same CSS classes); the numbers are now real.
import { useMemo, useState } from 'react';
import {
  ACADEMIC_TIME_ZONE, type ActionCode, type AttendanceStatus, type CourseHealth, type CourseStanding, type GradeItem, type Millis, type RiskLevel,
} from '@aitu/domain';
import Icon from '../components/Icon.jsx';
import { useAppCtx } from '../appContext.ts';
import { useSignedInStudent } from '../session.tsx';
import { actionKey, actionSubKey, levelKey, makeRadarT, reasonKey, worksWord, type RadarT } from '../radarText.ts';

type Nav = { pop: () => void; push: (o: Record<string, unknown>) => void };
type TabKey = 'overview' | 'attendance' | 'assignments' | 'results' | 'recs';

const COLORS: Record<RiskLevel, string> = { high: '#ef4444', medium: '#f5b301', low: '#22c55e', unknown: '#8b9099' };
const COURSE_LOOK: Record<string, { icon: string; tint: string }> = {
  MATH101: { icon: 'sigma', tint: '#4b3fd8' },
  MATH102: { icon: 'wave', tint: '#5a45e0' },
  CSE104: { icon: 'route', tint: '#0e7c86' },
  SE101: { icon: 'code', tint: '#1f9d63' },
  ENG101: { icon: 'book', tint: '#1d6fe0' },
};
const look = (code: string) => COURSE_LOOK[code] ?? { icon: 'book', tint: '#3d4756' };
export const courseLook = look;
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v)}%`);
/** Exact register score, or "~pace" while the register is still open. */
const score = (value: number | null | undefined, pace: number | null | undefined) =>
  value != null ? value.toFixed(1) : pace != null ? `~${pace.toFixed(1)}` : '—';
const need = (v: number | null | undefined, t: RadarT) => (v == null ? '—' : v > 100 ? t('unreachable') : String(Math.ceil(v)));
const pts = (v: number | null | undefined) => (v == null ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(1));

function useFormat(lang: string) {
  return useMemo(() => {
    const locale = lang === 'en' ? 'en-GB' : 'ru-RU';
    const date = new Intl.DateTimeFormat(locale, { timeZone: ACADEMIC_TIME_ZONE, day: 'numeric', month: 'short', weekday: 'short' });
    const dateTime = new Intl.DateTimeFormat(locale, { timeZone: ACADEMIC_TIME_ZONE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return { date: (ms: Millis) => date.format(ms), dateTime: (ms: Millis) => dateTime.format(ms) };
  }, [lang]);
}

function Risk({ level, t }: { level: RiskLevel; t: RadarT }) {
  return <span className={'risk ' + level}>{t(levelKey(level))}</span>;
}

/** Done / total among published works whose deadline has passed (quizzes included). */
function workProgress(c: CourseHealth, now: Millis) {
  const due = c.grades.filter((g) => g.dueAt != null && g.dueAt < now && g.submission !== 'pending' && g.submission !== 'excused');
  const done = due.filter((g) => g.submission === 'submitted' || g.submission === 'late_submitted').length;
  return { done, total: due.length };
}

export default function Radar({ nav, initialCourse }: { nav: Nav; initialCourse?: string }) {
  const { lang } = useAppCtx();
  const t = useMemo(() => makeRadarT(lang), [lang]);
  const { radar } = useSignedInStudent();
  const [courseId, setCourseId] = useState<string | null>(initialCourse ?? null);
  const [tab, setTab] = useState<TabKey>('overview');
  const course = radar.courses.find((c) => c.offeringId === courseId) ?? null;
  const term = radar.courses[0]?.termLabel ?? '';
  const open = (id: string, startTab: TabKey = 'overview') => { setCourseId(id); setTab(startTab); };

  return (
    <div className="modal rdr" role="dialog" aria-label={t('title')} style={{ animation: 'slide 0.25s ease' }}>
      <div className="rhdr">
        <button className="back" onClick={() => (course ? setCourseId(null) : nav.pop())} aria-label="Back">
          <Icon name="chevL" size={24} sw={2} />
        </button>
        <h1 className={course ? 'center' : ''}>{course ? course.title : t('title')}</h1>
        {course ? <span style={{ width: 40 }} /> : term && <span className="term">{term}</span>}
      </div>
      <div className="rbody" aria-live="polite">
        {radar.status === 'loading' && <RadarSkeleton label={t('loading')} />}
        {radar.status === 'error' && (
          <div className="page-empty"><span className="tile"><Icon name="alert" size={30} sw={1.5} /></span><div><b>{t('errorTitle')}</b></div><div>{t('errorText')}</div></div>
        )}
        {radar.status === 'ready' && radar.stale && <div className="r-banner"><Icon name="alert" size={16} />{t('stale')}</div>}
        {radar.status === 'ready' && (course
          ? <Detail c={course} tab={tab} setTab={setTab} t={t} lang={lang} />
          : <Dashboard t={t} lang={lang} open={open} nav={nav} />)}
      </div>
    </div>
  );
}

function RadarSkeleton({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} role="status">
      <span className="sr-only">{label}</span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skel-card"><div className="skel" style={{ width: '40%' }} /><div className="skel" style={{ width: '85%' }} /><div className="skel" style={{ width: '60%' }} /></div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- dashboard
function Dashboard({ t, lang, open, nav }: { t: RadarT; lang: string; open: (id: string, tab?: TabKey) => void; nav: Nav }) {
  const { t: tApp } = useAppCtx();
  const { radar } = useSignedInStudent();
  const f = useFormat(lang);
  const { counts, ordered, focus } = radar.summary;
  const now = Date.now();
  if (ordered.length === 0) {
    return (
      <div className="page-empty">
        <span className="tile"><Icon name="book" size={30} sw={1.5} /></span><div><b>{t('noCourses')}</b></div><div>{tApp('noCoursesJoin')}</div>
        <button className="cta-btn" onClick={() => nav.push({ type: 'join' })}><Icon name="plus" size={18} sw={2} />{tApp('joinTitle')}</button>
      </div>
    );
  }
  const attention = counts.high + counts.medium;
  const allUnknown = counts.unknown === ordered.length;
  const updated = ordered.reduce<Millis | null>((m, c) => (c.dataAsOf != null && (m == null || c.dataAsOf > m) ? c.dataAsOf : m), null);
  const firstReason = focus?.risk.reasons[0];

  return (
    <>
      <div className="rcard">
        <div className="status-card">
          <Donut counts={counts} center={attention} label={t('needAttention')} />
          <div>
            {focus ? <Risk level={focus.risk.level} t={t} /> : <Risk level={allUnknown ? 'unknown' : 'low'} t={t} />}
            <p><b>{focus ? t('headlineFocus', { title: focus.title }) : allUnknown ? t('headlineUnknown') : t('headlineAllGood')}</b></p>
            <p className="muted-p">{focus ? (focus.risk.level === 'high' ? t('textFocusHigh') : t('textFocusMedium')) : allUnknown ? t('textUnknown') : t('textAllGood')}</p>
          </div>
        </div>
      </div>
      <div className="stats">
        <div className="stat"><div className="v"><Icon name="book" size={20} sw={1.8} style={{ color: '#3b82f6' }} />{ordered.length}</div><small>{t('sTotal')}</small></div>
        <div className="stat"><div className="v"><i style={{ background: COLORS.low }} />{counts.low}</div><small>{t('sLow')}</small></div>
        <div className="stat"><div className="v"><i style={{ background: COLORS.medium }} />{counts.medium}</div><small>{t('sMedium')}</small></div>
        <div className="stat"><div className="v"><i style={{ background: COLORS.high }} />{counts.high}</div><small>{t('sHigh')}</small></div>
      </div>
      {counts.unknown > 0 && <div className="note" style={{ marginTop: 8 }}>{t('unknownCount', { n: counts.unknown })}</div>}

      <button className="plan-link" onClick={() => nav.push({ type: 'plan' })}>
        <Icon name="plan" size={22} sw={1.8} />
        <span><b>{tApp('planTitle')}</b><small>{tApp('planLinkText')}</small></span>
        <Icon name="chevR" size={18} sw={2} />
      </button>

      <div className="rsec"><h2>{t('myCourses')}</h2><button onClick={() => nav.push({ type: 'join' })}><Icon name="plus" size={16} sw={2.2} />{tApp('joinShort')}</button></div>
      {ordered.map((c) => {
        const l = look(c.courseCode);
        const w = workProgress(c, now);
        return (
          <button key={c.offeringId} className="course" onClick={() => open(c.offeringId)}>
            <div className="top">
              <span className="cicon" style={{ background: l.tint }}><Icon name={l.icon} size={22} sw={1.8} /></span>
              <span className="nm"><b>{c.title}</b><small>{c.courseCode}</small></span>
              <Risk level={c.risk.level} t={t} />
              <Icon name="chevR" size={18} sw={2} style={{ color: 'var(--muted)' }} />
            </div>
            <div className="mini">
              <div><Icon name="user" size={22} className="ic" /><span><b>{pct(c.risk.metrics.attendancePercent)}</b><small>{t('attendance')}</small></span></div>
              <div><Icon name="doc" size={22} className="ic" /><span><b>{w.total ? `${w.done}/${w.total}` : '—'}</b><small>{t('assignments')}</small></span></div>
              {c.risk.standing
                ? <div><Icon name="chart" size={22} className="ic" /><span><b>{score(c.risk.standing.regTerm.value, c.risk.standing.regTerm.estimate)}</b><small>{t('regTermShort')}</small></span></div>
                : <div><Icon name="chart" size={22} className="ic" /><span><b>{pct(c.risk.metrics.recentGradePercent)}</b><small>{t('result')}</small></span></div>}
            </div>
          </button>
        );
      })}

      {focus && (
        <button className="rec" onClick={() => open(focus.offeringId, 'recs')}>
          <Icon name="bulb" size={34} sw={1.5} className="bulb" />
          <span><b>{t('recTitle')}</b><small>{focus.title}: {firstReason ? reasonText(firstReason, t) : t('textFocusMedium')}</small></span>
          <Icon name="chevR" size={18} sw={2} />
        </button>
      )}
      {updated != null && <div className="note">{t('updated', { when: f.dateTime(updated) })}</div>}
      <div className="note">{t('demoPolicy')}</div>
    </>
  );
}

/** Ring split by risk state; centre = courses that need attention. Text labels always accompany colour. */
function Donut({ counts, center, label }: { counts: Record<RiskLevel, number>; center: number; label: string }) {
  const r = 38, c = 2 * Math.PI * r;
  const total = counts.high + counts.medium + counts.low + counts.unknown || 1;
  let offset = 0;
  const order: RiskLevel[] = ['high', 'medium', 'low', 'unknown'];
  return (
    <div className="ring" role="img" aria-label={`${center} ${label}`}>
      <svg width="92" height="92" viewBox="0 0 92 92">
        <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(128,128,128,.22)" strokeWidth="8" />
        {order.map((l) => {
          const len = (c * counts[l]) / total;
          if (!len) return null;
          const seg = <circle key={l} cx="46" cy="46" r={r} fill="none" stroke={COLORS[l]} strokeWidth="8"
            strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-offset} />;
          offset += len;
          return seg;
        })}
      </svg>
      <div className="n"><b>{center}</b><small className="ring-label">{label}</small></div>
    </div>
  );
}

function reasonText(r: CourseHealth['risk']['reasons'][number], t: RadarT): string {
  const observed = r.code === 'OVERDUE_WORK' ? String(r.observed) : String(Math.round(r.observed));
  return t(reasonKey(r.code), { observed, threshold: r.threshold, count: r.evidenceCount, works: worksWord(r.observed, t) });
}

// ---------------------------------------------------------------- course detail
function Detail({ c, tab, setTab, t, lang }: { c: CourseHealth; tab: TabKey; setTab: (k: TabKey) => void; t: RadarT; lang: string }) {
  const l = look(c.courseCode);
  const tabs: [TabKey, string][] = [['overview', t('overview')], ['attendance', t('attendance')], ['assignments', t('assignments')], ['results', t('results')], ['recs', t('recommendations')]];
  return (
    <>
      <div className="chead">
        <span className="cicon" style={{ background: l.tint, width: 52, height: 52 }}><Icon name={l.icon} size={26} /></span>
        <span className="nm"><b>{c.title}</b><small>{c.courseCode} · {c.termLabel}</small></span>
        <Risk level={c.risk.level} t={t} />
      </div>
      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      {tab === 'overview' && <Overview c={c} t={t} />}
      {tab === 'attendance' && <AttendanceTab c={c} t={t} lang={lang} />}
      {tab === 'assignments' && <AssignmentsTab c={c} t={t} lang={lang} />}
      {tab === 'results' && <ResultsTab c={c} t={t} lang={lang} />}
      {tab === 'recs' && <RecsTab c={c} t={t} />}
      <div className="note">{t('demoPolicy')}</div>
    </>
  );
}

function Overview({ c, t }: { c: CourseHealth; t: RadarT }) {
  const m = c.risk.metrics;
  const level = c.risk.level;
  const tone = level === 'high' || level === 'medium' ? 'bad' : level === 'low' ? 'ok' : 'neutral';
  const attGoal = c.policy.attendanceLowBelowPercent;
  const gradeGoal = c.policy.recentGradeLowBelowPercent;
  const overdue = c.tasks.overdue.length;
  const work = workProgress(c, Date.now());
  const reasonsClass = tone === 'bad' ? 'reasons' : tone === 'ok' ? 'reasons okc' : 'reasons neutral';
  return (
    <>
      <div className={'alert ' + tone}>
        <span className="ai"><Icon name={tone === 'bad' ? 'alert' : tone === 'ok' ? 'check' : 'chart'} size={22} /></span>
        <span><b className={tone === 'bad' ? 'bad-t' : ''}>{t(`alert_${level}`)}</b><small>{t(`alertSub_${level}`)}</small></span>
      </div>
      {c.risk.standing && <AituCard st={c.risk.standing} t={t} />}
      <div className="rsec"><h2>{t('keyMetrics')}</h2></div>
      <div className="metrics">
        <div className="metric">
          <div className="mh"><Icon name="user" size={16} />{t('attendance')}</div>
          <div className="mv">{pct(m.attendancePercent)}</div>
          <div className="bar"><i className={m.attendancePercent != null && m.attendancePercent >= attGoal ? 'green' : 'red'} style={{ width: `${m.attendancePercent ?? 0}%` }} /></div>
          <small>{t('goal', { n: attGoal })}</small>
        </div>
        <div className="metric">
          <div className="mh"><Icon name="doc" size={16} />{t('assignments')}</div>
          <div className="mv">{work.total ? `${work.done}/${work.total}` : '—'}</div>
          <div className="bar"><i className={overdue ? 'red' : 'blue'} style={{ width: work.total ? `${(work.done / work.total) * 100}%` : '0%' }} /></div>
          <small>{overdue ? t('notSubmittedN', { n: overdue }) : t('allSubmitted')}</small>
        </div>
        <div className="metric">
          <div className="mh"><Icon name="chart" size={16} />{t('result')}</div>
          <div className="mv">{pct(m.recentGradePercent)}</div>
          <div className="bar"><i className={m.recentGradePercent != null && m.recentGradePercent >= gradeGoal ? 'green' : 'red'} style={{ width: `${m.recentGradePercent ?? 0}%` }} /></div>
          <small>{t('goal', { n: gradeGoal })}</small>
        </div>
      </div>
      <div className="rsec"><h2 style={{ fontSize: 16 }}>{tone === 'bad' ? t('whyRisk') : tone === 'ok' ? t('whyOk') : t('whyUnknown')}</h2></div>
      <div className={reasonsClass}>
        <ol>
          {c.risk.reasons.length
            ? c.risk.reasons.map((r) => <li key={r.code}>{reasonText(r, t)}</li>)
            : <li>{level === 'unknown' ? t('unknownReason') : t('okReason')}</li>}
        </ol>
      </div>
      <div className="rsec"><h2>{t('dynamics')}</h2></div>
      <div className="rcard"><Chart grades={c.grades} goal={gradeGoal} t={t} /></div>
    </>
  );
}

function Chart({ grades, goal, t }: { grades: GradeItem[]; goal: number; t: RadarT }) {
  const points = grades.filter((g) => g.percent != null).sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0)).slice(-8);
  if (points.length < 2) return <div className="note" style={{ margin: 0 }}>{t('dynamicsEmpty')}</div>;
  const W = 320, H = 170, L = 28, B = 24, T = 8, R = 8;
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, points.length - 1);
  const y = (v: number) => T + ((100 - v) * (H - T - B)) / 100;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.percent!)}`).join(' ');
  return (
    <>
      <div className="legend"><span><i style={{ background: '#3b82f6' }} />{t('yourResult')}</span><span><i style={{ background: '#9aa0a6' }} />{t('threshold', { n: goal })}</span></div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('dynamics')}>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}><line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="rgba(128,128,128,.25)" strokeWidth="1" /><text x={L - 6} y={y(g) + 4} textAnchor="end" fontSize="10" fill="#8b9099">{g}</text></g>
        ))}
        <line x1={L} x2={W - R} y1={y(goal)} y2={y(goal)} stroke="#9aa0a6" strokeWidth="2" strokeDasharray="5 4" />
        {points.map((p, i) => <text key={p.assessmentId} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#8b9099">{shortTitle(p.title)}</text>)}
        <path d={path} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinejoin="round" />
        {points.map((p, i) => <circle key={p.assessmentId} cx={x(i)} cy={y(p.percent!)} r="4" fill={p.percent! < goal ? '#ef4444' : '#3b82f6'} />)}
      </svg>
    </>
  );
}
const shortTitle = (title: string) => (title.split(':')[0] ?? title).replace('Assignment', 'A').replace('Quiz', 'Q').replace('Essay', 'E').trim();

const MARK: Record<AttendanceStatus, { letter: { ru: string; en: string }; color: string }> = {
  present: { letter: { ru: 'П', en: 'P' }, color: '#178a4a' },
  late: { letter: { ru: 'О', en: 'L' }, color: '#b57900' },
  excused: { letter: { ru: 'У', en: 'E' }, color: '#5b5fd6' },
  absent: { letter: { ru: 'Н', en: 'A' }, color: '#d93a3a' },
  unmarked: { letter: { ru: '·', en: '·' }, color: '#6b7280' },
};

function AttendanceTab({ c, t, lang }: { c: CourseHealth; t: RadarT; lang: string }) {
  const f = useFormat(lang);
  const m = c.risk.metrics;
  const goal = c.policy.attendanceLowBelowPercent;
  const items = c.attendance.timeline;
  return (
    <>
      <div className="rcard" style={{ marginTop: 10 }}>
        <div className="metric" style={{ background: 'none', padding: 0 }}>
          <div className="mv" style={{ fontSize: 34 }}>{pct(m.attendancePercent)}</div>
          <div className="bar" style={{ height: 8 }}><i className={m.attendancePercent != null && m.attendancePercent >= goal ? 'green' : 'red'} style={{ width: `${m.attendancePercent ?? 0}%` }} /></div>
          <small style={{ fontSize: 13 }}>{t('goal', { n: goal })} · {t('points', { earned: pts(c.attendance.pointsEarned), possible: pts(c.attendance.pointsPossible) })}</small>
        </div>
      </div>
      {items.length === 0
        ? <div className="note">{t('noSessions')}</div>
        : (
          <div className="group" style={{ marginTop: 10 }}>
            {items.map((s) => {
              const mk = MARK[s.status];
              return (
                <div key={s.sessionId} className="lrow">
                  <span className="ci" style={{ background: mk.color }} aria-hidden="true"><b style={{ fontSize: 13 }}>{lang === 'en' ? mk.letter.en : mk.letter.ru}</b></span>
                  <span className="lt">
                    <b>{f.date(s.startsAt)} · {t(s.type)}</b>
                    <small>{[s.topic, s.remark, s.corrected ? t('corrected') : null].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span className="r-side"><b>{t(`att_${s.status}`)}</b><small>{s.points != null ? `${pts(s.points)}/${pts(s.maxPoints)}` : ''}</small></span>
                </div>
              );
            })}
          </div>
        )}
    </>
  );
}

function AssignmentsTab({ c, t, lang }: { c: CourseHealth; t: RadarT; lang: string }) {
  const f = useFormat(lang);
  const done = c.grades.filter((g) => g.submission === 'submitted' || g.submission === 'late_submitted');
  const sections: { title: string; rows: { id: string; title: string; sub: string; bad: boolean; icon: string }[] }[] = [
    { title: t('overdueTitle'), rows: c.tasks.overdue.map((x) => ({ id: x.assessmentId, title: x.title, sub: t('due', { when: f.dateTime(x.dueAt) }), bad: true, icon: 'x' })) },
    { title: t('upcomingTitle'), rows: c.tasks.upcoming.map((x) => ({ id: x.assessmentId, title: x.title, sub: t('due', { when: f.dateTime(x.dueAt) }), bad: false, icon: 'calendar' })) },
    { title: t('doneTitle'), rows: done.map((g) => ({ id: g.assessmentId, title: g.title, sub: t(`sub_${g.submission}`), bad: false, icon: 'check' })) },
  ];
  if (sections.every((s) => s.rows.length === 0)) return <div className="note">{t('noTasks')}</div>;
  return (
    <>
      {sections.filter((s) => s.rows.length).map((s) => (
        <div key={s.title}>
          <div className="rsec"><h2 style={{ fontSize: 16 }}>{s.title}</h2></div>
          <div className="group">
            {s.rows.map((r) => (
              <div key={r.id} className="lrow">
                <span className={'ci' + (r.bad ? ' bad' : r.icon === 'calendar' ? ' ico' : '')}><Icon name={r.icon} size={16} sw={2.4} /></span>
                <span className="lt"><b>{r.title}</b><small>{r.sub}</small></span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function ResultsTab({ c, t, lang }: { c: CourseHealth; t: RadarT; lang: string }) {
  const f = useFormat(lang);
  if (c.grades.length === 0) return <div className="note">{t('noGrades')}</div>;
  return (
    <>
      <div className="group" style={{ marginTop: 10 }}>
        {c.grades.map((g) => {
          const graded = g.gradeState === 'graded';
          const low = graded && g.percent != null && g.percent < c.policy.recentGradeLowBelowPercent;
          return (
            <div key={g.assessmentId} className="lrow">
              <span className={'ci ' + (graded ? (low ? 'bad' : '') : 'ico')}><Icon name={graded ? 'chart' : 'doc'} size={16} /></span>
              <span className="lt">
                <b>{g.title}</b>
                <small>{[g.dueAt ? f.date(g.dueAt) : null, g.feedback || null, g.corrected ? t('corrected') : null].filter(Boolean).join(' · ')}</small>
              </span>
              <span className="r-side">
                <b>{graded ? `${pts(g.points)}/${pts(g.maxPoints)}` : t(`grade_${g.gradeState}`)}</b>
                <small>{graded ? pct(g.percent) : ''}</small>
              </span>
            </div>
          );
        })}
      </div>
      <div className="note">{t('pendingNote')}</div>
    </>
  );
}

function actionText(a: ActionCode, c: CourseHealth, t: RadarT): [string, string] {
  const st = c.risk.standing;
  if (a === 'RAISE_REGISTER' && st) {
    if (st.admission === 'not-admitted') return [t('act_RAISE_REGISTER_final'), t('act_RAISE_REGISTER_final_s')];
    const midOpen = st.regMid.value == null;
    const target = midOpen ? st.scheme.admissionRegisterMin : st.needs.regEndForAdmission;
    return [
      t('act_RAISE_REGISTER', { n: need(target, t), register: midOpen ? t('regMid') : t('regEnd') }),
      t('act_RAISE_REGISTER_s', { avg: need(st.needs.remainingForAdmission, t) }),
    ];
  }
  if (a === 'PROTECT_SCHOLARSHIP' && st) {
    if (st.needs.finalForScholarship != null) {
      return [t('act_PROTECT_SCHOLARSHIP_final', { n: need(st.needs.finalForScholarship, t) }), t('act_PROTECT_SCHOLARSHIP_final_s')];
    }
    return [t('act_PROTECT_SCHOLARSHIP'), t('act_PROTECT_SCHOLARSHIP_s', { avg: need(st.needs.remainingForScholarship, t) })];
  }
  return [t(actionKey(a)), t(actionSubKey(a), { n: c.policy.attendanceLowBelowPercent })];
}

function RecsTab({ c, t }: { c: CourseHealth; t: RadarT }) {
  const { toast } = useAppCtx();
  const level = c.risk.level;
  const actions: [string, string][] = c.risk.actions.length
    ? c.risk.actions.map((a) => actionText(a, c, t))
    : level === 'unknown' ? [[t('act_wait'), t('act_wait_s')]] : [[t('act_keep'), t('act_keep_s')]];
  return (
    <>
      <div className="rsec"><h2>{t('recActions')}</h2></div>
      <div className="group">
        {actions.map(([title, sub]) => (
          <button key={title} className="lrow" onClick={() => toast(t('actionHint'))}>
            <span className="ci"><Icon name="check" size={16} sw={2.4} /></span>
            <span className="lt"><b>{title}</b><small>{sub}</small></span>
            <Icon name="chevR" size={16} sw={2} style={{ color: 'var(--muted)' }} />
          </button>
        ))}
      </div>
      <div className="note">{t('actionHint')}</div>
    </>
  );
}

const ADM_KEY: Record<CourseStanding['admission'], 'adm_admitted' | 'adm_on_track' | 'adm_at_risk' | 'adm_not_admitted' | 'adm_unknown'> = {
  admitted: 'adm_admitted', 'on-track': 'adm_on_track', 'at-risk': 'adm_at_risk', 'not-admitted': 'adm_not_admitted', unknown: 'adm_unknown',
};
const SCH_KEY: Record<CourseStanding['scholarship'], 'sch_safe' | 'sch_at_risk' | 'sch_lost' | 'sch_unknown'> = {
  safe: 'sch_safe', 'at-risk': 'sch_at_risk', lost: 'sch_lost', unknown: 'sch_unknown',
};

/** Registers, admission to the final, what is needed, GPA forecast and scholarship — the AITU rules made visible. */
function AituCard({ st, t }: { st: CourseStanding; t: RadarT }) {
  const [how, setHow] = useState(false);
  const tone = st.outcome === 'pass' || st.admission === 'admitted' || st.admission === 'on-track' ? 'ok'
    : st.admission === 'unknown' ? 'neutral' : 'bad';
  let sub = '';
  if (st.outcome) sub = '';
  else if (st.admission === 'not-admitted') sub = st.regTerm.value != null ? t('admSub_not_admitted') : t('admSub_unreachable');
  else if (st.admission === 'admitted') sub = t('admSub_admitted', { pass: need(st.needs.finalToPass, t), s70: need(st.needs.finalForScholarship, t), s80: need(st.needs.finalForRecommended, t) });
  else if (st.admission === 'at-risk') sub = st.regMid.value != null
    ? t('admSub_at_risk_end', { n: need(st.needs.regEndForAdmission, t), avg: need(st.needs.remainingForAdmission, t) })
    : t('admSub_at_risk_mid', { avg: need(st.needs.remainingForAdmission, t) });
  else if (st.admission === 'on-track') sub = st.needs.regEndForAdmission != null
    ? t('admSub_at_risk_end', { n: need(st.needs.regEndForAdmission, t), avg: need(st.needs.remainingForAdmission, t) })
    : t('admSub_on_track');
  const reg = (label: string, r: CourseStanding['regMid']) => (
    <div className="metric">
      <div className="mh">{label}</div>
      <div className="mv">{score(r.value, r.current)}</div>
      <div className="bar"><i className={(r.value ?? r.current ?? 0) >= st.scheme.admissionRegTermMin ? 'green' : (r.value ?? r.current ?? 0) >= st.scheme.admissionRegisterMin ? '' : 'red'} style={{ width: `${r.value ?? r.current ?? 0}%` }} /></div>
      <small>{r.complete ? t('regDone') : r.itemCount ? t('regOpen', { w: Math.round(r.decidedWeight * 100) }) : '—'}</small>
    </div>
  );
  return (
    <>
      <div className="rsec"><h2>{t('aituTitle')}</h2></div>
      <div className="metrics">
        {reg(t('regMid'), st.regMid)}
        {reg(t('regEnd'), st.regEnd)}
        <div className="metric">
          <div className="mh">{t('regTerm')}</div>
          <div className="mv">{score(st.regTerm.value, st.regTerm.estimate)}</div>
          <div className="bar"><i className={(st.regTerm.value ?? st.regTerm.estimate ?? 0) >= st.scheme.admissionRegTermMin ? 'green' : 'red'} style={{ width: `${st.regTerm.value ?? st.regTerm.estimate ?? 0}%` }} /></div>
          <small>{t('goal', { n: st.scheme.admissionRegTermMin })}</small>
        </div>
      </div>
      <div className={'alert ' + tone}>
        <span className="ai"><Icon name={tone === 'ok' ? 'check' : tone === 'bad' ? 'alert' : 'chart'} size={22} /></span>
        <span>
          <b className={tone === 'bad' ? 'bad-t' : ''}>{st.outcome ? t(`outcome_${st.outcome}`, { letter: st.grade?.letter ?? '', gpa: st.grade?.gpa.toFixed(2) ?? '' }) : t(ADM_KEY[st.admission])}</b>
          {sub && <small>{sub}</small>}
        </span>
      </div>
      <div className="aitu-lines">
        {!st.outcome && st.grade && <div><Icon name="chart" size={16} />{t('forecast', { letter: st.grade.letter, gpa: st.grade.gpa.toFixed(2) })}</div>}
        <div className={'sch-' + st.scholarship}><Icon name={st.scholarship === 'safe' ? 'check' : 'alert'} size={16} />{t(SCH_KEY[st.scholarship])}</div>
      </div>
      <button className="how-toggle" onClick={() => setHow((v) => !v)} aria-expanded={how}>
        {t('howTitle')}<Icon name={how ? 'chevD' : 'chevR'} size={16} sw={2} />
      </button>
      {how && <ul className="how-list">{(['how1', 'how2', 'how3', 'how4', 'how5'] as const).map((k) => <li key={k}>{t(k)}</li>)}</ul>}
    </>
  );
}
