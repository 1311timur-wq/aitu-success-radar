import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRowEdits } from '../hooks/useRowEdits.ts';
import { Link, useBlocker, useParams } from 'react-router';
import { suggestedAttendancePoints, suggestedStatusForCheckin, utcToZonedWallTime, type AttendanceRecordDTO, type AttendanceStatus, type EnrollmentDTO } from '@aitu/domain';
import { publishAttendance, saveAttendance, toDataError, watchCheckins, type RowsResult } from '@aitu/data';
import { useLive } from '../hooks/useLive.ts';
import { useCourse } from '../course/CourseContext.tsx';
import { useTeacher } from '../auth/AuthProvider.tsx';
import { useI18n, type T } from '../i18n/index.tsx';
import { ATTENDANCE_KEYS, ConfirmDialog, EmptyState, PublicationChip, ReasonDialog, useToast } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { errorKey } from '../errors.ts';
import { formatDateLong, formatPoints, formatTimeRange } from '../format.ts';

type RowView = { status: AttendanceStatus; points: number | null; remark: string };

const HOTKEYS: Record<string, Exclude<AttendanceStatus, 'unmarked'>> = {
  p: 'present', l: 'late', e: 'excused', a: 'absent', '1': 'present', '2': 'late', '3': 'excused', '4': 'absent',
  'п': 'present', 'о': 'late', 'у': 'excused', 'н': 'absent', // Russian keyboard: same letters as the on-screen keys
};

const fromRecord = (r: AttendanceRecordDTO | undefined): RowView =>
  r ? { status: r.status, points: r.points, remark: r.remark } : { status: 'unmarked', points: null, remark: '' };
const sameValue = (a: RowView, b: RowView) => a.status === b.status && a.points === b.points && a.remark.trim() === b.remark.trim();

export function AttendanceSheetPage() {
  const { sessionId = '' } = useParams();
  const c = useCourse();
  const { t, locale } = useI18n();
  const { uid } = useTeacher();
  const toast = useToast();
  const session = c.sessions.find((s) => s.id === sessionId);

  const records = useMemo(() => new Map(c.attendance.filter((r) => r.sessionId === sessionId).map((r) => [r.studentUid, r])), [c.attendance, sessionId]);
  const rows = useRowEdits(records, fromRecord, sameValue);
  const { view, isDirty, isConflict } = rows;
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [askReason, setAskReason] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  // QR check-ins from the door display (IoT): a suggestion the teacher confirms, never a mark by itself.
  const checkinsLive = useLive(watchCheckins, c.offering.id, sessionId);
  const checkins = useMemo(() => new Map((checkinsLive.status === 'ready' ? checkinsLive.data : []).map((x) => [x.studentUid, x])), [checkinsLive]);

  const dirtyUids = c.activeRoster.map((s) => s.studentUid).filter(isDirty);
  const maxPoints = session?.maxPoints ?? 0;
  const invalidUids = dirtyUids.filter((u) => {
    const v = view(u);
    return v.status !== 'unmarked' && (v.points == null || v.points < 0 || v.points > maxPoints);
  });

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirtyUids.length > 0 && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirtyUids.length) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirtyUids.length]);

  if (!session) return <EmptyState icon="calendar" title={t('sessionNotFound')} action={<Link className="btn" to="../attendance">{t('back')}</Link>} />;
  if (session.status === 'cancelled') return <EmptyState icon="x" title={t('sessionIsCancelled')} action={<Link className="btn" to="../attendance">{t('back')}</Link>} />;

  const published = session.attendancePublication === 'published';

  const edit = rows.edit;
  const mark = (studentUid: string, status: AttendanceStatus) =>
    edit(studentUid, { status, points: suggestedAttendancePoints(status, session.maxPoints, c.offering.policy) });
  const markRest = (status: AttendanceStatus) => {
    for (const s of c.activeRoster) if (view(s.studentUid).status === 'unmarked') mark(s.studentUid, status);
  };

  const qrPending = c.activeRoster.filter((s) => checkins.has(s.studentUid) && view(s.studentUid).status === 'unmarked');
  const qrLate = [...checkins.values()].filter((x) => suggestedStatusForCheckin(x.at, session.startsAt) === 'late').length;
  const applyCheckins = () => {
    for (const s of qrPending) {
      const ci = checkins.get(s.studentUid)!;
      const status = suggestedStatusForCheckin(ci.at, session.startsAt);
      edit(s.studentUid, { status, points: suggestedAttendancePoints(status, session.maxPoints, c.offering.policy), remark: `QR ${utcToZonedWallTime(ci.at).time}` });
    }
    toast(t('qrApplied', { n: qrPending.length }));
  };

  const corrections = dirtyUids.filter((u) => {
    const r = records.get(u);
    return r?.publication === 'published' && (r.status !== view(u).status || r.points !== view(u).points);
  });

  const reportResult = (res: RowsResult, okText: string) => {
    if (res.committed.length) toast(okText);
    if (res.conflicts.length) toast(t('conflictsToast', { n: res.conflicts.length }), 'warn');
    if (res.failed.length) toast(t('failedToast', { n: res.failed.length, reason: t(errorKey(res.failed[0]!)) }), 'error');
  };

  const save = async (correctionReason?: string) => {
    setBusy('save'); setAskReason(false);
    const input = dirtyUids.map((u) => ({ studentUid: u, ...view(u), expectedRevision: rows.baseRevision(u) }));
    try {
      const res = await saveAttendance({ offeringId: c.offering.id, session, rows: input, actorUid: uid, correctionReason });
      rows.markSaved(res.committed);
      reportResult(res, t('saved', { n: res.committed.length }));
    } catch (e) {
      toast(t(errorKey(toDataError(e))), 'error');
    } finally { setBusy(null); }
  };

  const onSave = () => { if (corrections.length) setAskReason(true); else void save(); };

  const publish = async () => {
    setBusy('publish');
    try {
      const res = await publishAttendance({ offeringId: c.offering.id, session, records: [...records.values()], actorUid: uid });
      if (!res.conflicts.length && !res.failed.length) { toast(t('publishedToast')); setConfirmPublish(false); }
      else reportResult(res, t('saved', { n: res.committed.length }));
    } catch (e) { toast(t(errorKey(toDataError(e))), 'error'); }
    finally { setBusy(null); }
  };

  // ----- keyboard: P/L/E/A (П/О/У/Н, 1-4) mark the focused row and move on; arrows move -----
  const ordered = filterRoster(c.activeRoster, query);
  const focusRow = (index: number) => {
    const s = ordered[Math.max(0, Math.min(ordered.length - 1, index))];
    if (s) rowRefs.current.get(s.studentUid)?.focus();
  };
  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, index: number, studentUid: string) => {
    if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
    const status = HOTKEYS[e.key.toLowerCase()];
    if (status) { e.preventDefault(); mark(studentUid, status); focusRow(index + 1); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); focusRow(index + 1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); focusRow(index - 1); }
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); edit(studentUid, { status: 'unmarked', points: null }); }
  };

  const tally = tallyOf(c.activeRoster.map((s) => view(s.studentUid).status));
  const unmarkedCount = tally.unmarked;

  return (
    <div className="sheet">
      <section className="sheet-head">
        <div>
          <h2>{formatDateLong(session.startsAt, locale)}</h2>
          <p className="sheet-sub">
            <span className="num">{formatTimeRange(session.startsAt, session.durationMinutes, locale)}</span>
            <span>{t(session.type)}</span>
            {session.topic && <span>{session.topic}</span>}
            {session.room && <span>{session.room}</span>}
            <span>{t('maxPoints')}: {formatPoints(session.maxPoints)}</span>
          </p>
        </div>
        <div className="sheet-head-side">
          <PublicationChip value={session.status === 'held' ? session.attendancePublication : 'none'} />
          <a className="btn btn-sm" href={`/door/${c.offering.id}/${session.id}`} target="_blank" rel="noopener noreferrer"><Icon name="qr" size={15} />{t('qrDoorButton')}</a>
        </div>
      </section>

      {checkins.size > 0 && (
        <section className="checkin-panel" aria-live="polite">
          <span className="checkin-ic"><Icon name="qr" size={20} /></span>
          <div>
            <b>{t('qrPanelTitle', { n: checkins.size, total: c.activeRoster.length })}</b>
            <p className="muted small">{qrLate ? t('qrPanelLate', { n: qrLate }) + ' ' : ''}{t('qrPanelNote')}</p>
          </div>
          <button className="btn btn-primary btn-sm" disabled={!qrPending.length} onClick={applyCheckins}>
            {qrPending.length ? t('qrApply', { n: qrPending.length }) : t('qrAllApplied')}
          </button>
        </section>
      )}

      <Tally tally={tally} t={t} />

      <div className="sheet-toolbar">
        <label className="search">
          <Icon name="search" size={16} />
          <input type="search" placeholder={t('searchStudent')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('searchStudent')} />
        </label>
        <div className="bulk" role="group" aria-label={t('markRestAs')}>
          <span>{t('markRestAs')}</span>
          {ATTENDANCE_KEYS.map((k) => (
            <button key={k.status} className={`key key-sm key-${k.status}`} onClick={() => markRest(k.status)} disabled={unmarkedCount === 0} title={t(k.label)}>
              {t(k.key)}<span className="sr-only">{t(k.label)}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="hint"><Icon name="keyboard" size={15} />{t('keyboardHint')}</p>

      <div className="table-wrap">
        <table className="table sheet-table att-table">
          <thead>
            <tr><th className="col-n">№</th><th>{t('student')}</th><th>{t('status')}</th><th className="col-points">{t('points')}</th><th>{t('remark')}</th><th className="col-state"><span className="sr-only">{t('status')}</span></th></tr>
          </thead>
          <tbody>
            {ordered.map((s, i) => {
              const v = view(s.studentUid);
              const rec = records.get(s.studentUid);
              const dirty = isDirty(s.studentUid);
              const conflict = isConflict(s.studentUid);
              const invalid = invalidUids.includes(s.studentUid);
              return (
                <tr key={s.studentUid} tabIndex={0} ref={(el) => { if (el) rowRefs.current.set(s.studentUid, el); else rowRefs.current.delete(s.studentUid); }}
                  className={['sheet-row', dirty && 'is-dirty', conflict && 'is-conflict', `st-${v.status}`].filter(Boolean).join(' ')}
                  onKeyDown={(e) => onRowKey(e, i, s.studentUid)} aria-label={`${s.displayName}: ${t(v.status)}`}>
                  <td className="col-n num c-n">{i + 1}</td>
                  <td className="c-person"><span className="person"><b>{s.displayName}</b><small>{s.studentNumber}{checkins.has(s.studentUid) && <span className="qr-chip" title={t('qrChipTitle')}><Icon name="qr" size={11} />{utcToZonedWallTime(checkins.get(s.studentUid)!.at).time}</span>}</small></span></td>
                  <td className="c-keys">
                    <div className="keys" role="radiogroup" aria-label={`${t('status')}: ${s.displayName}`}>
                      {ATTENDANCE_KEYS.map((k) => (
                        <button key={k.status} role="radio" aria-checked={v.status === k.status} tabIndex={-1}
                          className={`key key-${k.status}${v.status === k.status ? ' on' : ''}`} title={t(k.label)}
                          onClick={() => mark(s.studentUid, v.status === k.status ? 'unmarked' : k.status)}>
                          {t(k.key)}<span className="sr-only">{t(k.label)}</span>
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="col-points c-points" data-label={t('points')}>
                    <input type="number" inputMode="decimal" className="points-input" min={0} max={session.maxPoints} step={0.5}
                      disabled={v.status === 'unmarked'} value={v.points ?? ''} aria-invalid={invalid}
                      aria-label={`${t('points')}: ${s.displayName}`} title={t('pointsOutOfRange', { max: formatPoints(session.maxPoints) })}
                      onChange={(e) => edit(s.studentUid, { points: e.target.value === '' ? null : Number(e.target.value) })} />
                  </td>
                  <td className="c-remark" data-label={t('remark')}>
                    <input className="remark-input" maxLength={500} value={v.remark} aria-label={`${t('remark')}: ${s.displayName}`}
                      onChange={(e) => edit(s.studentUid, { remark: e.target.value })} />
                  </td>
                  <td className="col-state c-state">
                    {conflict
                      ? <button className="chip chip-conflict" onClick={() => rows.reset(s.studentUid)} title={t('reloadRow')}><Icon name="alert" size={13} />{t('conflict')}</button>
                      : dirty ? <PublicationChip value="draft" dirty />
                        : rec ? <span className="cell-stack">{rec.publication !== session.attendancePublication && <PublicationChip value={rec.publication} />}{rec.correction && <small className="muted">{t('corrected')}</small>}</span>
                          : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={`actionbar${dirtyUids.length ? ' has-changes' : ''}`} role="region" aria-label={t('changedRows', { n: dirtyUids.length })}>
        <span aria-live="polite">{dirtyUids.length ? t('changedRows', { n: dirtyUids.length }) : null}</span>
        <div className="actionbar-buttons">
          <button className="btn" disabled={!dirtyUids.length || !!busy} onClick={rows.clear}>{t('discard')}</button>
          <button className="btn btn-primary" disabled={!dirtyUids.length || invalidUids.length > 0 || !!busy} onClick={onSave}>
            {busy === 'save' ? t('saving') : published || corrections.length ? t('saveCorrections') : t('saveDraft')}
          </button>
          {!published && (
            <button className="btn btn-accent" disabled={!!busy || dirtyUids.length > 0 || records.size === 0} onClick={() => setConfirmPublish(true)}
              title={dirtyUids.length ? t('saveBeforePublish') : undefined}>
              <Icon name="send" size={16} />{busy === 'publish' ? t('publishing') : t('publish')}
            </button>
          )}
        </div>
      </div>

      {askReason && <ReasonDialog count={corrections.length} busy={busy === 'save'} onSubmit={(r) => void save(r)} onClose={() => setAskReason(false)} />}
      {confirmPublish && (
        <ConfirmDialog title={t('publishAttendanceQ')} text={t('publishAttendanceText')} confirm={t('publish')} busy={busy === 'publish'}
          notes={unmarkedCount ? [t('publishUnmarkedNote', { n: unmarkedCount })] : []}
          onConfirm={() => void publish()} onClose={() => setConfirmPublish(false)} />
      )}
      {blocker.state === 'blocked' && (
        <ConfirmDialog title={t('leaveQ')} text={t('leaveText')} confirm={t('leave')} danger
          onConfirm={() => blocker.proceed()} onClose={() => blocker.reset()} />
      )}
    </div>
  );
}

function filterRoster(roster: EnrollmentDTO[], q: string) {
  const s = q.trim().toLowerCase();
  return s ? roster.filter((r) => r.displayName.toLowerCase().includes(s) || r.studentNumber.includes(s)) : roster;
}

type Tally = Record<AttendanceStatus, number>;
function tallyOf(statuses: AttendanceStatus[]): Tally {
  const t: Tally = { present: 0, late: 0, excused: 0, absent: 0, unmarked: 0 };
  for (const s of statuses) t[s]++;
  return t;
}

/** The group at a glance: one stacked bar, always with numbers and words next to the colours. */
function Tally({ tally, t }: { tally: Tally; t: T }) {
  const total = Object.values(tally).reduce((a, b) => a + b, 0) || 1;
  const order: AttendanceStatus[] = ['present', 'late', 'excused', 'absent', 'unmarked'];
  return (
    <section className="tally" aria-label={t('tallyLabel')}>
      <div className="tally-bar" aria-hidden="true">
        {order.map((s) => tally[s] > 0 && <span key={s} className={`tally-seg seg-${s}`} style={{ flexGrow: tally[s] / total }} />)}
      </div>
      <ul className="tally-legend">
        {order.map((s) => (
          <li key={s} className={tally[s] === 0 ? 'zero' : ''}><span className={`swatch seg-${s}`} aria-hidden="true" /><b className="num">{tally[s]}</b>{t(s)}</li>
        ))}
      </ul>
    </section>
  );
}
