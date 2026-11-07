// In-app notification when the teacher publishes a new grade or a course changes risk level.
// Accessibility (Assignment 4, B3): the information is ALWAYS shown visually (banner with icon and
// text, announced by screen readers via aria-live); the chime is an optional extra that is OFF by
// default, enabled by the student in Profile -> Notification sound, and never autoplays on load.
import { useEffect, useRef, useState } from 'react';
import type { RiskLevel } from '@aitu/domain';
import Icon from './Icon.jsx';
import { useAppCtx } from '../appContext.ts';
import { useApp } from '../i18n.js';
import { useSignedInStudent } from '../session.tsx';
import { levelKey, makeRadarT } from '../radarText.ts';

let audio: HTMLAudioElement | null = null;
/** Plays the own-work chime (assets/notify.mp3, 0.9 s, 8 KB). Silently ignored if the browser blocks it. */
export function playNotifySound(): void {
  try {
    audio ??= new Audio('./assets/notify.mp3');
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch { /* no audio support */ }
}

interface Notice { id: number; text: string; course: string; tone: RiskLevel | 'info' }

export default function GradeNotifier({ onOpen }: { onOpen: (offeringId: string) => void }) {
  const { lang, t } = useAppCtx();
  const { sound } = useApp() as unknown as { sound: boolean };
  const { radar } = useSignedInStudent();
  const seen = useRef(new Map<string, { grades: Set<string>; level: RiskLevel }>());
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (radar.status !== 'ready') return;
    const rt = makeRadarT(lang);
    let next: Notice | null = null;
    for (const c of radar.courses) {
      const graded = c.grades.filter((g) => g.gradeState === 'graded' && g.points != null);
      const prev = seen.current.get(c.offeringId);
      seen.current.set(c.offeringId, { grades: new Set(graded.map((g) => g.assessmentId)), level: c.risk.level });
      if (!prev) continue; // first time we see this course: baseline, no notification
      const fresh = graded.find((g) => !prev.grades.has(g.assessmentId));
      if (fresh) next = { id: Date.now(), course: c.offeringId, tone: 'info', text: t('newGrade', { title: fresh.title, course: c.title, points: fresh.points ?? 0, max: fresh.maxPoints }) };
      else if (prev.level !== c.risk.level) next = { id: Date.now(), course: c.offeringId, tone: c.risk.level, text: t('levelChanged', { course: c.title, level: rt(levelKey(c.risk.level)) }) };
    }
    if (next) {
      setNotice(next);
      if (sound) playNotifySound();
    }
  }, [radar, lang, t, sound]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 9000);
    return () => clearTimeout(id);
  }, [notice]);

  return (
    <div className="notice-region" role="status" aria-live="polite">
      {notice && (
        <div key={notice.id} className={'notice ' + notice.tone}>
          <span className="notice-ic" aria-hidden="true"><Icon name="bell" size={20} sw={1.8} /></span>
          <span className="notice-text">{notice.text}</span>
          <button type="button" className="notice-open" onClick={() => { onOpen(notice.course); setNotice(null); }}>{t('openCourse')}</button>
          <button type="button" className="notice-x" aria-label={t('close')} onClick={() => setNotice(null)}><Icon name="x" size={16} sw={2.2} /></button>
        </div>
      )}
    </div>
  );
}
