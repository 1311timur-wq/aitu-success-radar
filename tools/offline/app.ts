// Offline demo adapter for `firebase/app`.
export interface FirebaseOptions { apiKey?: string; authDomain?: string; projectId?: string; appId?: string }
export interface FirebaseApp { name: string; options: FirebaseOptions }
const apps: FirebaseApp[] = [];
export const getApps = () => apps;
export function initializeApp(options: FirebaseOptions, name = '[DEFAULT]'): FirebaseApp {
  const a = { name, options };
  apps.push(a);
  return a;
}
export async function deleteApp(app: FirebaseApp): Promise<void> {
  const i = apps.indexOf(app);
  if (i >= 0) apps.splice(i, 1);
}
