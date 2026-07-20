# Quest — RPG Task Manager (PWA)

A task manager with video-game-style RPG progression, designed with ADHD-friendly
principles in mind. Offline-first and installable as an app on desktop and mobile.

> **About this project**
> I'm building Quest as a **personal research and learning project**: an experiment
> in creating a real, non-trivial application with the help of AI, while sharpening
> my skills as a developer. It's a **long-term, evolving project** — I add features
> and refine it as I keep learning about modern web development, product design, and
> AI-assisted engineering. Feedback and ideas are welcome.

## Live demo
[View it live](https://quest-task-rpg-app.vercel.app/)

## Features

- **Tasks & lists** — Full CRUD with subtasks, colors, priorities, notes, comments,
  image/file attachments, and reusable tags. Views: Today, Upcoming, All, by list, by tag.
- **Calendar** — Continuous-scroll monthly calendar showing scheduled tasks; tap a day
  to view or create tasks with a specific time.
- **Smart quick-add** — Natural-language capture in Spanish: typing
  _"Gym on Monday at 8pm every week #health"_ auto-detects the date, time, recurrence, and tag.
- **RPG progression** — XP weighted by priority, rising level curve, per-list stats,
  non-punitive streaks, level titles, synthesized ASMR sounds, and a level-up animation.
- **Monthly Missions** — A "main quest" per month themed around a mythical creature
  (Dragon, Phoenix, Kraken…), broken into weekly missions with steps and big XP rewards.
- **Habits with COMBOS** — Turn a task into a recurring habit with scheduled days and an
  end date; it becomes a progress bar whose streak ("combo") climbs the rainbow and
  multiplies XP.
- **Focus mode (Pomodoro)** — Adjustable timer with ambient sounds, real focus-minute
  tracking via timestamps (accurate in the background), a minimizable floating timer, and XP.
- **Reports** — Charts for productivity, completed tasks, focus time, XP, priorities,
  tags, per-list attributes, and streaks, with week/month/year/custom ranges. All offline.
- **Liquid Glass theming** — Light/dark/system, customizable accent color, translucent
  "liquid glass" surfaces, and custom blurred backgrounds.
- **Your data** — JSON backup export/import. No account required; everything lives locally
  in IndexedDB (Dexie).

## Tech stack

Vite + React 19 + strict TypeScript · Tailwind CSS v4 · Dexie (IndexedDB) ·
vite-plugin-pwa (Workbox) · Recharts · Web Audio API · Supabase (Auth + Postgres + Storage).

Architecture: **local-first**. Dexie/IndexedDB is the immediate source of truth; the cloud
is optional backup and multi-device sync (last-write-wins). Business logic is kept separate
from the UI, and the notification layer is abstracted so it can move to native (Capacitor)
without rewriting app logic.

## Getting started

```bash
npm install       # install dependencies
npm run dev       # dev server → http://localhost:5173
npm run dev:lan   # dev server reachable on your local network (for phone testing)
npm run build     # production build (dist/)
npm run preview   # serve the production build
```

The app works fully **offline and without an account** — data is stored on-device.

## Optional cloud sync

1. Create a free project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql).
3. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (Dashboard → Settings → API).
4. Restart `npm run dev` and sign up from Settings → Account & sync.

Sync is local-first: Dexie is the source of truth, the cloud is backup/multi-device,
conflicts resolve by last-write-wins. Device settings (theme/sound) are not synced.

## Install as a PWA

- **Desktop (Edge/Chrome)** — open the app → install icon in the address bar → Install.
- **Android (Chrome)** — menu ⋮ → "Add to Home screen".
- **iPhone (Safari)** — Share → "Add to Home Screen".

## Roadmap

This is an ongoing project. Ideas on the list: habit statistics, native packaging via
Capacitor (with an eye on the App Store), richer animations, and more accessibility polish.
Since it's a learning project, the roadmap evolves as I explore new topics.

## License

MIT © 2026 Johnny E. Valverde Rodríguez — see [LICENSE](LICENSE).
