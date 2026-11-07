/**
 * Grants (or revokes) the administrator role. Admin power = custom claim `admin: true` in the user's ID token,
 * which only the Admin SDK can set — no button in any app can make someone an admin.
 *
 *   npm run make-admin -- someone@astanait.edu.kz           grant
 *   npm run make-admin -- someone@astanait.edu.kz --revoke  revoke
 * The user must sign out and in again (or wait up to 1 h) for the new token.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { adminApp, flag, run } from './admin-app.ts';

run(async () => {
  const email = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!email) throw new Error('Usage: npm run make-admin -- <email> [--revoke]');
  const { auth, db, label } = adminApp();
  const user = await auth.getUserByEmail(email.trim().toLowerCase());
  const revoke = flag('revoke');
  await auth.setCustomUserClaims(user.uid, revoke ? { admin: false } : { admin: true });
  await auth.revokeRefreshTokens(user.uid); // forces a fresh token on next sign-in
  const ref = db.doc(`users/${user.uid}`);
  const snap = await ref.get();
  if (revoke) {
    if (snap.exists && snap.get('role') === 'admin') await ref.update({ role: 'teacher' });
  } else {
    await ref.set({ displayName: user.displayName ?? email, email: user.email ?? email, role: 'admin', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  console.log(`${revoke ? 'Revoked' : 'Granted'} admin for ${email} (${user.uid}) on ${label}. Sign out and in again to apply.`);
});
