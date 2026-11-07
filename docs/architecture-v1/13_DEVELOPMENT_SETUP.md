# 13 — Developer setup checklist

## Already runnable
- Node.js >=20, `cd packages/domain && npm test` (no package installation needed) checks computation.
- Root `npm test` runs the same domain suite.
- `diagrams/*.mmd` viewable in GitHub Mermaid extensions or Mermaid Live Editor.

## Firebase target configuration (NOT configured automatically)
1. Install Firebase CLI locally using an approved npm release (`npm install -g firebase-tools` or project-scoped devDependency); `firebase login` with a development account.
2. Create **demo** local environment and run `firebase emulators:start --project demo-aitu-radar --only auth,firestore` from this package root (`firebase.json` and rules included).
3. For Cloud Functions, create `functions/package.json` with compatible Node runtime and Firebase Admin/Functions SDKs, implement the reviewed callable commands. The `functions` folder currently documents the design; it is not a deployed service.
4. Set up an automated seed script through Emulator Admin SDK; create synthetic teacher/student accounts and trusted staff/enrollment relations. Seed file is a scenario manifest, not a working seed script.
5. Add Firestore Emulator Rules tests before implementing UI; use separate Emulator project IDs to avoid accidentally touching live services.
6. After server integration, create `apps/teacher` Vite/React app and port `mydu-replica` to `apps/student`, retaining design but replacing demo Auth and `RADAR` constants.
7. Create real Firebase project only after team security review; configure allowed auth provider, function region, index rules, monitoring and budget.

## Firebase configs
`firebase.json` has Firestore rules/index location and Auth/Firestore emulator ports. It deliberately does NOT enable Functions deployment because no completed functions package is included.

## Data protection
Never commit `.env`, service-account `.json`, access tokens, private student roster, university passwords, profile screenshot metadata or extracted SSO cookie. Use fake IDs from `seed/demo-scenarios.json` only.
