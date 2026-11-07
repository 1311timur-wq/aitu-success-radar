# My DU (student app)

The My DU replica connected to the shared Firebase backend. Run it from the repository root:

```powershell
npm run dev:student      # http://localhost:5173
```

- The design comes from the original replica. `DESIGN-NOTES.md` lists the values measured from the screenshots.
- Sign-in uses Firebase Auth (email/password demo accounts). The passcode and Face ID screens are only a visual demo.
- The profile comes from `users/{uid}`. Radar shows the student's **own published** data only (`@aitu/data` → `watchStudentRadar`) and computes the risk with `@aitu/domain`.
- Production build goes to `dist/hosting/my-du`. It is served at `https://<projectId>.web.app/my-du/`.
