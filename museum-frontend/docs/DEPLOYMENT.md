# Deployment Notes

## Backend API URL

Set runtime API URL in one of two ways:

1. Build-time env: `EXPO_PUBLIC_API_BASE_URL`
2. In-app override: Settings screen (`/(stack)/settings`)

## Local commands

```bash
npm run lint
npm run typecheck
npm test
npm run dev
```

## EAS build

```bash
npx eas build --platform ios --profile preview
npx eas build --platform android --profile preview
```

## Store release checklist

- Confirm app identifiers (`com.museumia.mobile`) are correct
- Verify icon/splash assets in `assets/images`
- Verify camera/media permissions text in `app.json`
- Test API base URL in production build before submission
