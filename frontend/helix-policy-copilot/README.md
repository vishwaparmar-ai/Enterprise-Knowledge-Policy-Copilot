# Helix Policy Copilot: authentication UI

Next.js 14 (App Router) + TypeScript + Tailwind CSS 3 + Inter.

```bash
npm install
npm run dev   # http://localhost:3000
```

Demo login: `admin@helixsolutions.com` / `Helix1234` (any other pair shows the incorrect-credentials state).
Replace the mocked calls in each page with your API.

## Preview every screen
| Screen | URL |
|---|---|
| Login: default / validation / credentials / loading | `/login` · `?state=validation` · `?state=credentials` · `?state=loading` |
| Login: success | `/login?state=success` |
| Register: default / password / mismatch / success | `/register` · `?state=password` · `?state=mismatch` · `?state=success` |
| Forgot password: default / sent | `/forgot-password` · `?state=sent` |
| Verify email: default / resend | `/verify-email` · `?state=resend` |

Design tokens live in `tailwind.config.ts`; shared components in `components/ui.tsx`.
