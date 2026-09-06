# ByteCare — SIH26133 Demo

A working prototype for **SIH26133: Public Healthcare Accessibility & Quality**.
Built for rural/underserved patients and the facility staff who serve them.

## Features
- 🎫 Digital appointment & queue — patients get a token and see estimated wait
- 🩺 Basic digital triage — describe symptoms (typed or spoken), get routed to the right department/facility
- 📝 Patient feedback — ratings + comments per facility
- 💊 Medicine availability — live stock status (available / low / out)
- 🔄 Referral tracking — PHC → Hospital → Specialist, with status updates
- 📊 Facility dashboard — queue length, wait time, stock alerts, feedback, referrals
- 🌐 Multilingual (English/Hindi) + voice input for triage (browser's built-in mic — Chrome recommended)
- 🔒 **Staff login** — only logged-in facility staff can manage the queue, update stock,
  create referrals, or change referral status. Patients need no login at all.
- 🪪 **Persistent Health ID** — each patient gets a Health ID that links visits and referrals across facilities.
- 📋 **Patient records timeline** — patients can enter their Health ID to see past appointments, patient reports, staff notes, diagnoses, outcomes, and referrals in one timeline.
- 🩺 **Visit documentation** — staff can record a short diagnosis, visit note, and outcome/follow-up from the existing queue view.
- 👤 **Patient accounts** — patients can register and log in; their account is linked to a persistent Health ID shown in the header after authentication.

## Staff login (demo accounts)
| Facility | Username | Password |
|---|---|---|
| Ramnagar PHC | `ramnagar_staff` | `phc123` |
| Devipur PHC | `devipur_staff` | `phc123` |
| District General Hospital | `hosp_staff` | `hosp123` |
| City Specialty Centre | `spec_staff` | `spec123` |
| Admin (sees/manages every facility) | `admin` | `admin123` |

These are seeded in `db.js` for the demo. Sessions are kept in server memory
and expire after 8 hours or on server restart. For a real deployment, swap
plaintext passwords for hashed ones and move sessions to a proper store —
the API shape (`Authorization: Bearer <token>`) would stay the same.

## Why this stack
Built with **zero external dependencies** — only Node.js's built-in `http`
and `fs` modules, plus a JSON file as the database. That means:
- No `npm install` step, no internet needed to set up
- No native modules to compile (a common demo-day failure point)
- Runs identically on Windows/Mac/Linux, on any judge's laptop

## Prerequisites
- Node.js v14 or newer. Check with: `node -v`

## Running it
```bash
node server.js
```
Then open **http://localhost:3000** in a browser.

To reset demo data back to the original seed, delete `data.json` and restart
the server, or (while logged in as staff) call:
```bash
curl -X POST http://localhost:3000/api/reset-demo-data -H "Authorization: Bearer <your-token>"
```

## Project structure
```
healthaccess/
  server.js       -> HTTP server, all API routes, staff auth (no framework)
  db.js           -> JSON-file data store + seed data (facilities, staff accounts, etc.)
  data.json       -> auto-created on first run (your live demo data)
  public/
    index.html    -> single-page app shell (Patient view + Staff view + login gate)
    styles.css    -> design tokens & styling
    app.js        -> frontend logic (auth, fetch calls, rendering, tabs)
    icons.js      -> inline SVG icon set (no external icon library/CDN)
    i18n.js       -> English/Hindi translation dictionary
```

## Demo script (suggested for judges)
1. **Patient** → Home screen → Book Token → show the token + wait time
2. **Symptom Check** → type "chest pain" → routes to Cardiology/Hospital as
   HIGH urgency, vs "fever" which stays at PHC as LOW urgency
3. **Medicine Check** → show a facility with an out-of-stock medicine
4. Tap **Facility Staff** → note it asks for login, not just a free switch
5. Log in as `ramnagar_staff` / `phc123` → Dashboard → point out the alert
   banner and color-coded stock/queue stats
6. **Referrals** → create a new referral, then switch back to Patient to show
   it appear on the Referral Status tab in real time
7. **Health Record** → use the Health ID shown after booking (for example `HA-100001`) → show the cross-facility visit/referral timeline and patient report
8. Log out → try tapping Facility Staff again → show it asks to log in again
9. Register as a patient → show the generated Health ID in the header → log out and log back in to demonstrate persistence.


## 🚀 Deployment

The project is deployed on **Vercel** and can be accessed using the link below:

🔗 **Live Demo:** [[YOUR_VERCEL_LINK](https://byte-care-git-main-chaitanya6681s-projects.vercel.app/)]

Click the link above to access the live application.
