# Studio Flow

A personal, iPad-first creative studio dashboard built as a static Progressive Web App. It works without a build step and can be published with GitHub Pages.

## Preview

Open `index.html` in a browser. For installable PWA features and offline caching, serve the folder over HTTPS (GitHub Pages does this) or from localhost; service workers do not run from a `file://` URL.

## Publish with GitHub Pages

1. Put the contents of this folder in a repository (or in a folder such as `docs/`).
2. In GitHub, open **Settings → Pages** and choose the branch and folder containing `index.html`.
3. Open the HTTPS site on iPad in Safari, choose **Share → Add to Home Screen**.

## Included

- Client and project management, hourly rates, and per-project count-up timers.
- Master tasks with nested steps, project filters, and completion states.
- Weekly time blocks, Google Calendar event links, and `.ics` export for Apple Calendar or Google Calendar import.
- Earnings estimates and project time analytics.
- Planned downtime alongside work blocks.
- Local browser storage, JSON backup/restore, offline app shell, and responsive touch-friendly layout.

## Current boundaries

Data stays in this browser on this device; there is no account, cloud sync, or server backup. Download a JSON backup periodically. Direct Google Calendar sync needs OAuth credentials and a deployed redirect URL. Apple Calendar does not expose its private account database directly to a website, so use `.ics` export/import. The app can request browser notification permission, but it does not schedule timed notifications yet. On iPad, web app notifications require iPadOS 16.4 or later and the app added to the Home Screen. Apple Pencil can interact with the touch-sized controls; handwriting-specific input is not included.
