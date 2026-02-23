# 🏫 Kindergarten Debt Manager

מערכת לניהול חובות משפחות בגן ילדים

## Quick Start

```bash
npm run dev
```
Opens at [http://localhost:3000](http://localhost:3000)

Or simply open `index.html` directly in a browser — no server required.

## Deployment

This is a **static site** (HTML + CSS + JS only). No build step needed.

### Deploy to any static host:

| Platform | Command / Steps |
|----------|----------------|
| **Netlify** | Drag & drop the project folder, or connect Git repo. Set publish directory to `.` |
| **Vercel** | `npx vercel --prod` (framework: Other, output: `.`) |
| **GitHub Pages** | Push to repo → Settings → Pages → Deploy from branch |
| **Any web server** | Copy `index.html`, `style.css`, `app.js` to your server's public directory |

### Environment Variables

**None required.** All data is stored in the browser's `localStorage`. The only external dependency is the SheetJS CDN for Excel export, loaded automatically.

## Files

| File | Purpose |
|------|---------|
| `index.html` | App structure and layout |
| `style.css` | Dark theme, RTL, glassmorphism design system |
| `app.js` | All application logic and data management |

## Features

- 👨‍👩‍👧 Family CRUD with code, parents, phone, location, debt
- 💬 Comments per family with timestamps
- 🔔 Notification system with WhatsApp integration
- ⚙️ Management panel: locations, data export/import, WhatsApp templates
- 📊 Excel export (families, comments, notifications)
- 🔍 Search, filter, and compact/full view toggle
- 🌙 Hebrew RTL dark theme
# kindergarten-debt-manager
