// "Мой план на неделю": the Radar turned into a checklist for the next 7 days (domain: buildWeeklyPlan).
// Ticks are saved to Firestore (users/{uid}/planState/current) — the same plan on every device.
import { useMemo, useState } from 'react';
import { ACADEMIC_TIME_ZONE, buildWeeklyPlan, type PlanItem } from '@aitu/domain';
import { savePlanTicks } from '@aitu/data';
import Icon from '../components/Icon.jsx';
import { useAppCtx } from '../appContext.ts';
import { useSignedInStudent, useStudentSession } from '../session.tsx';
import { courseLook } from './Radar.tsx';

type Nav = { pop: () => void; push: (o: Record<string, unknown>) => void };
type T = ReturnType<typeof useAppCtx>['t'];

function useFmt(lang: string) {
  return useMemo(() => {
    const loc = lang === 'en' ? 'en-GB' : 'ru-RU';
    const day = new Intl.DateTimeFormat(loc, { timeZone: ACADEMIC_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' });
    const dayTime = new Intl.DateTimeFormat(loc, { timeZone: ACADEMIC_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const range = new Intl.DateTimeFormat(loc, { timeZone: ACADEMIC_TIME_ZONE, day: 'numeric', month: 'long' });
    return { day: (ms: number) => day.format(ms), dayTime: (ms: number) => dayTime.format(ms), range: (ms: number) => range.format(ms) };
  }, [lang]);
}

export function planItemText(it: PlanItem, t: T, f: ReturnType<typeof useFmt>): { title: string; detail: string } {
  const d = it.data;
  const n = (v: unknown) => (v == null ? '…' : String(v));
  switch (it.kind) {
    case 'overdue': return { title: t('planOverdue', { title: it.subject ?? '' }), detail: t('planOverdueD', { date: it.at ? f.day(it.at) : '' }) };
    case 'register': return {
      title: t(d.register === 'midterm' ? 'planRegisterMid' : 'planRegisterEnd', { need: n(d.need) }),
      detail: d.avg == null ? t('planRegisterD0') : Number(d.avg) > 100 ? t('planRegisterDx') : t('planRegisterD', { avg: n(d.avg) }),
    };
    case 'deadline': return { title: t('planDeadline', { title: it.subject ?? '' }), detail: t('planDeadlineD', { date: it.at ? f.dayTime(it.at) : '' }) };
    case 'attend': return {
      title: t('planAttend', { type: t(`ses_${d.type}`), date: it.at ? f.dayTime(it.at) : '' }),
      detail: [d.room ? String(d.room) : null, d.percent != null ? t('planAttendD', { pct: n(d.percent), goal: n(d.goal) }) : null].filter(Boolean).join(' · '),
    };
    case 'scholarship': return { title: t('planScholarship', { avg: n(d.avg) }), detail: t('planScholarshipD', { target: n(d.target) }) };
    case 'contact': return { title: t('planContact'), detail: t('planContactD') };
    case 'review': return { title: t('planReview', { title: it.subject ?? '', pct: n(d.percent) }), detail: d.feedback ? `«${String(d.feedback)}»` : t('planReviewD') };
  }
}

const KIND_ICON: Record<PlanItem['kind'], string> = {
  overdue: 'alert', register: 'chart', deadline: 'clock', attend: 'calendar', scholarship: 'bulb', contact: 'chat', review: 'doc',
};

export default function WeeklyPlan({ nav }: { nav: Nav }) {
  const { t, lang, toast } = useAppCtx();
  const { radar, profile } = useSignedInStudent();
  const { planDone } = useStudentSession();
  const [optimistic, setOptimistic] = useState<Record<string, number | null>>({});
  const f = useFmt(lang);
  const plan = useMemo(() => buildWeeklyPlan(radar.courses, Date.now()), [radar.courses]);

  const isDone = (id: string) => (id in optimistic ? optimistic[id] != null : id in planDone);
  const doneCount = plan.items.filter((i) => isDone(i.id)).length;
  const toggle = async (id: string) => {
    const next = { ...planDone };
    for (const [k, v] of Object.entries(optimistic)) { if (v == null) delete next[k]; else next[k] = v; }
    if (isDone(id)) delete next[id]; else next[id] = Date.now();
    setOptimistic((o) => ({ ...o, [id]: next[id] ?? null }));
    try { await savePlanTicks(profile.uid, next); }
    catch { setOptimistic((o) => { const c = { ...o }; delete c[id]; return c; }); toast(t('planSaveError')); }
  };

  const groups: { p: 1 | 2 | 3; title: string }[] = [
    { p: 1, title: t('planP1') }, { p: 2, title: t('planP2') }, { p: 3, title: t('planP3') },
  ];
  const pct = plan.items.length ? Math.round((doneCount / plan.items.length) * 100) : 0;

  return (
    <div className="modal rdr" role="dialog" aria-label={t('planTitle')} style={{ animation: 'slide 0.25s ease' }}>
      <div className="rhdr">
        <button className="back" onClick={nav.pop} aria-label={t('back')}><Icon name="chevL" size={24} sw={2} /></button>
        <h1>{t('planTitle')}</h1>
      </div>
      <div className="rbody">
        {radar.status === 'loading' && <div className="page-empty">{t('loading')}</div>}
        {radar.status === 'ready' && radar.courses.length === 0 && (
          <div className="page-empty">
            <span className="tile"><Icon name="plan" size={30} sw={1.5} /></span>
            <div><b>{t('planNoCourses')}</b></div><div>{t('planNoCoursesText')}</div>
            <button className="cta-btn" onClick={() => nav.push({ type: 'join' })}><Icon name="plus" size={18} sw={2} />{t('joinTitle')}</button>
          </div>
        )}
        {radar.status === 'ready' && radar.courses.length > 0 && (
          <>
            <div className="rcard plan-head">
              <div className="plan-ring" style={{ ['--p' as string]: `${pct}%` }} aria-hidden="true"><b>{doneCount}</b><small>/{plan.items.length}</small></div>
              <div>
                <b>{t('planRange', { from: f.range(plan.from), to: f.range(plan.to) })}</b>
                <p className="muted-p">{plan.items.length === 0 ? t('planEmpty') : doneCount === plan.items.length ? t('planAllDone') : t('planProgress', { n: plan.items.length - doneCount })}</p>
              </div>
            </div>
            {plan.items.length === 0 && (
              <div className="alert ok"><span className="ai"><Icon name="check" size={20} sw={2.2} /></span><span><b>{t('planEmptyTitle')}</b><small>{t('planEmptyText')}</small></span></div>
            )}
            {groups.map((g) => {
              const items = plan.items.filter((i) => i.priority === g.p);
              if (!items.length) return null;
              return (
                <section key={g.p}>
                  <div className="rsec"><h2>{g.title}</h2><span className="plan-count">{items.filter((i) => isDone(i.id)).length}/{items.length}</span></div>
                  <ul className="plan-list">
                    {items.map((it) => {
                      const done = isDone(it.id);
                      const { title, detail } = planItemText(it, t, f);
                      const look = courseLook(it.courseCode);
                      return (
                        <li key={it.id} className={'plan-item' + (done ? ' done' : '') + ` k-${it.kind}`}>
                          <button className="plan-check" role="checkbox" aria-checked={done} aria-label={title} onClick={() => void toggle(it.id)}>
                            {done && <Icon name="check" size={16} sw={3} />}
                          </button>
                          <button className="plan-body" onClick={() => nav.push({ type: 'radar', course: it.offeringId })}>
                            <span className="plan-title"><Icon name={KIND_ICON[it.kind]} size={15} sw={2} />{title}</span>
                            <span className="plan-detail">{detail}</span>
                            <span className="plan-course"><i style={{ background: look.tint }} />{it.courseTitle}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
            <div className="note">{t('planNote')}</div>
          </>
        )}
      </div>
    </div>
  );
}

/** Small card for the Home tab: progress + the next item. */
export function PlanCard({ onOpen }: { onOpen: () => void }) {
  const { t, lang } = useAppCtx();
  const { radar } = useSignedInStudent();
  const { planDone } = useStudentSession();
  const f = useFmt(lang);
  const plan = useMemo(() => buildWeeklyPlan(radar.courses, Date.now()), [radar.courses]);
  if (radar.status !== 'ready') return null;
  const open = plan.items.filter((i) => !(i.id in planDone));
  const next = open[0];
  return (
    <button className="card plan-card" onClick={onOpen}>
      <span className="plan-card-ic"><Icon name="plan" size={22} sw={1.8} /></span>
      <span className="plan-card-tx">
        <b>{t('planTitle')}</b>
        <small>{radar.courses.length === 0 ? t('planNoCourses') : plan.items.length === 0 ? t('planEmptyTitle')
          : next ? `${planItemText(next, t, f).title} · ${next.courseTitle}` : t('planAllDone')}</small>
      </span>
      {plan.items.length > 0 && <span className="plan-card-n">{plan.items.length - open.length}/{plan.items.length}</span>}
      <Icon name="chevR" size={18} sw={2} />
    </button>
  );
}
