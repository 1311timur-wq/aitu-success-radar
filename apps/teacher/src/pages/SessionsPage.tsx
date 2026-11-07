import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { utcToZonedWallTime, zonedWallTimeToUtc, type SessionDTO, type SessionType } from '@aitu/domain';
import { createSession, updateSession } from '@aitu/data';
import { useCourse } from '../course/CourseContext.tsx';
import { useTeacher } from '../auth/AuthProvider.tsx';
import { useI18n } from '../i18n/index.tsx';
import { ConfirmDialog, EmptyState, PublicationChip, useToast } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { errorKey } from '../errors.ts';
import { formatDate, formatTimeRange } from '../format.ts';
import { toDataError } from '@aitu/data';
import { RoomPicker } from '../components/RoomPicker.tsx';

export function SessionsPage() {
  const c = useCourse();
  const { t } = useI18n();
  const [showForm, setShowForm] = useState(false);
  const now = Date.now();
  const upcoming = c.sessions.filter((s) => s.startsAt + s.durationMinutes * 60_000 >= now && s.status === 'scheduled').sort((a, b) => a.startsAt - b.startsAt);
  const past = c.sessions.filter((s) => !upcoming.includes(s));

  return (
    <div className="stack">
      <div className="section-head">
        <h2>{t('sessionsTitle')}</h2>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>
          <Icon name="plus" size={16} />{t('newSession')}
        </button>
      </div>
      {showForm && <NewSessionForm onDone={() => setShowForm(false)} />}
      {c.sessions.length === 0 && !showForm && <EmptyState icon="calendar" title={t('noSessions')} text={t('noSessionsText')} />}
      {upcoming.length > 0 && <SessionTable title={t('upcoming')} sessions={upcoming} />}
      {past.length > 0 && <SessionTable title={t('past')} sessions={past} />}
    </div>
  );
}

function SessionTable({ title, sessions }: { title: string; sessions: SessionDTO[] }) {
  const c = useCourse();
  const { t, locale } = useI18n();
  const { uid } = useTeacher();
  const toast = useToast();
  const [cancelling, setCancelling] = useState<SessionDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const total = c.activeRoster.length;

  const doCancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    try { await updateSession(c.offering.id, cancelling, { status: 'cancelled' }, uid); toast(t('sessionCancelled')); setCancelling(null); }
    catch (e) { toast(t(errorKey(toDataError(e))), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <section>
      <h3 className="table-title">{title}</h3>
      <div className="table-wrap">
        <table className="table sessions-table">
          <thead><tr><th>{t('date')}</th><th>{t('startTime')}</th><th>{t('type')}</th><th>{t('topic')}</th><th>{t('status')}</th><th>{t('tabAttendance')}</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {sessions.map((s) => {
              const marked = c.attendance.filter((r) => r.sessionId === s.id && r.status !== 'unmarked').length;
              return (
                <tr key={s.id} className={s.status === 'cancelled' ? 'row-muted' : ''}>
                  <td className="nowrap c-date">{formatDate(s.startsAt, locale)}</td>
                  <td className="nowrap num c-time">{formatTimeRange(s.startsAt, s.durationMinutes, locale)}</td>
                  <td className="c-type">{t(s.type)}</td>
                  <td className="c-topic">{s.topic ?? <span className="muted">—</span>}{s.room && <small className="muted block">{s.room}</small>}</td>
                  <td className="c-status"><span className={`chip chip-session-${s.status}`}>{t(s.status)}</span></td>
                  <td className="c-att">
                    {s.status === 'held'
                      ? <span className="cell-stack"><PublicationChip value={s.attendancePublication} /><small className="muted">{t('marksProgress', { n: marked, total })}</small></span>
                      : <span className="muted">—</span>}
                  </td>
                  <td className="actions c-actions">
                    {s.status !== 'cancelled' && <Link className="btn btn-sm" to={s.id}>{s.status === 'held' ? t('openSheet') : t('takeAttendance')}</Link>}
                    {s.status === 'scheduled' && <button className="btn btn-ghost btn-sm" onClick={() => setCancelling(s)}>{t('cancelSession')}</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {cancelling && <ConfirmDialog title={t('cancelSessionQ')} text={t('cancelSessionText')} confirm={t('cancelSession')} danger busy={busy}
        onConfirm={() => void doCancel()} onClose={() => setCancelling(null)} />}
    </section>
  );
}

function NewSessionForm({ onDone }: { onDone: () => void }) {
  const c = useCourse();
  const { uid } = useTeacher();
  const { t } = useI18n();
  const toast = useToast();
  const today = utcToZonedWallTime(Date.now());
  const [date, setDate] = useState(today.date);
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(50);
  const [type, setType] = useState<SessionType>('lecture');
  const [topic, setTopic] = useState('');
  const [room, setRoom] = useState('');
  const [maxPoints, setMaxPoints] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await createSession(c.offering.id, { type, topic, room, startsAt: zonedWallTimeToUtc(date, time), durationMinutes: duration, maxPoints }, uid);
      toast(t('sessionCreated'));
      onDone();
    } catch (err) { setError(t(errorKey(toDataError(err)))); } finally { setBusy(false); }
  };

  return (
    <form className="panel form-grid" onSubmit={submit}>
      <label className="field"><span className="field-label">{t('date')}</span><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="field"><span className="field-label">{t('startTime')}</span><input type="time" required value={time} onChange={(e) => setTime(e.target.value)} /></label>
      <label className="field"><span className="field-label">{t('duration')}</span><input type="number" min={10} max={600} step={5} required value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></label>
      <label className="field"><span className="field-label">{t('type')}</span>
        <select value={type} onChange={(e) => setType(e.target.value as SessionType)}>
          <option value="lecture">{t('lecture')}</option><option value="practice">{t('practice')}</option><option value="lab">{t('lab')}</option>
        </select>
      </label>
      <label className="field span-2"><span className="field-label">{t('topic')}</span><input maxLength={200} value={topic} onChange={(e) => setTopic(e.target.value)} /></label>
      <RoomPicker label={t('room')} value={room} onChange={setRoom} sessionType={type} />
      <label className="field"><span className="field-label">{t('maxPoints')}</span><input type="number" min={0} max={100} step={0.5} required value={maxPoints} onChange={(e) => setMaxPoints(Number(e.target.value))} /></label>
      {error && <p className="form-error span-all" role="alert"><Icon name="alert" size={16} />{error}</p>}
      <div className="form-actions span-all">
        <button type="button" className="btn" onClick={onDone}>{t('cancel')}</button>
        <button className="btn btn-primary" disabled={busy}>{t('createSession')}</button>
      </div>
    </form>
  );
}
