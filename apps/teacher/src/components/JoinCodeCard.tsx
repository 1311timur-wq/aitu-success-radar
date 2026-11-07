// The course join code: what a teacher writes on the board / shows as a QR on the first lecture.
import { useState } from 'react';
import { formatJoinCode, type OfferingDTO } from '@aitu/domain';
import { rotateJoinCode, toDataError } from '@aitu/data';
import { useTeacher } from '../auth/AuthProvider.tsx';
import { useI18n } from '../i18n/index.tsx';
import { errorKey } from '../errors.ts';
import { Icon } from './Icon.tsx';
import { QrCode } from './QrCode.tsx';
import { ConfirmDialog, useToast } from './ui.tsx';
import { studentAppUrl } from '../pages/DoorDisplayPage.tsx';

export function JoinCodeCard({ offering, asAdmin = false }: { offering: OfferingDTO; asAdmin?: boolean }) {
  const { t } = useI18n();
  const { uid } = useTeacher();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const code = offering.joinCode ?? null;
  const link = code ? `${studentAppUrl()}?join=${code}` : '';

  const rotate = async () => {
    setBusy(true);
    try {
      const next = await rotateJoinCode(offering, uid, { asAdmin });
      toast(t('joinCodeRotated', { code: formatJoinCode(next) }));
      setConfirm(false);
    } catch (e) {
      toast(t(errorKey(toDataError(e))), 'error');
    } finally { setBusy(false); }
  };
  const copy = async (text: string, msg: string) => {
    try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast(text); }
  };

  return (
    <section className="panel join-card">
      <div className="section-head">
        <h2>{t('joinCodeTitle')}</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowQr(!showQr)} disabled={!code}><Icon name="qr" size={15} />{showQr ? t('joinCodeHideQr') : t('joinCodeShowQr')}</button>
      </div>
      {code ? (
        <>
          <div className="join-code-row">
            <button className="join-code" onClick={() => void copy(formatJoinCode(code), t('copied'))} title={t('copy')}>{formatJoinCode(code)}<Icon name="copy" size={16} /></button>
            <p className="muted small">{t('joinCodeHelp')}</p>
          </div>
          {showQr && (
            <div className="join-qr">
              <QrCode value={link} size={200} label={t('joinCodeQrLabel', { code: formatJoinCode(code) })} />
              <div>
                <p className="small">{t('joinCodeQrText')}</p>
                <button className="btn btn-sm" onClick={() => void copy(link, t('copied'))}><Icon name="copy" size={14} />{t('copyLink')}</button>
              </div>
            </div>
          )}
        </>
      ) : <p className="muted">{t('joinCodeNone')}</p>}
      <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn btn-sm" onClick={() => setConfirm(true)} disabled={busy}><Icon name="refresh" size={14} />{code ? t('joinCodeRotate') : t('joinCodeCreate')}</button>
      </div>
      {confirm && (
        <ConfirmDialog title={t('joinCodeRotateQ')} text={t('joinCodeRotateText')} confirm={code ? t('joinCodeRotate') : t('joinCodeCreate')} busy={busy}
          onConfirm={() => void rotate()} onClose={() => setConfirm(false)} />
      )}
    </section>
  );
}
