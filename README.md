[![Install AES Bracket Viewer](https://img.shields.io/badge/Install-AES%20Bracket%20Viewer-342b55?style=for-the-badge)](https://github.com/BrandonDHaskell/aes-bracket-viewer/releases/latest/download/aes-bracket-viewer.user.js)
[![Latest release](https://img.shields.io/github/v/release/BrandonDHaskell/aes-bracket-viewer)](https://github.com/BrandonDHaskell/aes-bracket-viewer/releases/download/v3.0.0/aes-bracket-viewer.user.js)

# AES Bracket Viewer

**A free userscript that turns AES volleyball results into a coach's dashboard.**

AES Bracket Viewer adds a full-screen viewer to the AES Event Schedule view. It traces every pool and bracket from start to finish, and it plans your team's match day. It shows what your team needs to advance and scouts the teams you're about to play. It works at any AES event, for any division, and follows the teams you star on AES.

> [!IMPORTANT]
> **Before you install, you need two things:**
> 1. **A browser that allows extensions.** Desktop Chrome, Edge, Firefox, Safari, Brave, and Opera all work. Some mobile browsers do not (see [Browser support](#browser-support)).
> 2. **A userscript manager extension**, such as **[Tampermonkey](https://www.tampermonkey.net/)** or **[Greasemonkey](https://addons.mozilla.org/firefox/addon/greasemonkey/)**. The viewer is a userscript, and the userscript manager is what runs it on AES pages.

---

## Features

**Tournament map**
- Every pool, crossover, and bracket in the division, connected in order.
- Select any match to trace everything that feeds into it and everything it leads to.
- Your teams are starred. Likely opponents and courts that may be running late are highlighted.

**Match Day**
- Your team's day as a timeline of matches and work assignments, including breaks, meal windows, and court or venue changes.
- The next-up card shows an arrive-by time, a countdown, whether the court looks late, and your next work duty.
- An "After pool play" table shows where each pool finish leads, including crossover times, courts, and work duties.
- "All my teams" merges your teams' days and flags overlaps.

**Standings & Outlook**
- Plain-language outlook, for example: *"Win all 3 remaining pool matches to clinch Bronze A."*
- The range of next-round destinations, with the full route for every finish and result.
- Pool standings with tiebreaks, plus scenarios for every remaining result.
- Likely next opponents, each with a one-tap Scout button.

**Stats**
- Match and set records, point ratio, close sets, deciding sets, and results after winning or losing set 1.
- Record by match of the day, strength of schedule, and seed vs. finish.
- A by-weekend breakdown for league events. CSV export.

**Scouting**
- Next, scheduled, and possible opponents, with the reason each one is listed.
- Side-by-side comparison with your team, head-to-head results, and common opponents.
- Best win, worst loss, full results, and live status based on the schedule.

**Sharing and staying current**
- Copy a parent update for the team chat, or print a one-page game-day sheet.
- Add the schedule to your calendar (.ics).
- Shareable links that open a specific team and view.
- Optional notifications for new matches, results, court or time changes, and work assignments.
- Checks AES for updates automatically while the viewer is open.

---

## Browser support

| Device | Browser | Userscript manager | Notes |
|---|---|---|---|
| Windows, Mac, Linux | Chrome, Edge, Brave, Opera, Vivaldi | Tampermonkey or Violentmonkey | Turn on the **Allow User Scripts** toggle (see step 2 below). |
| Windows, Mac, Linux | Firefox | Tampermonkey, Greasemonkey, or Violentmonkey | Works as soon as the manager is installed. |
| Mac | Safari | Tampermonkey for Safari or Userscripts (Mac App Store) | Enable the extension in Safari's settings. |
| iPhone, iPad | Safari | Tampermonkey for Safari or Userscripts (App Store) | Enable it under Settings > Safari > Extensions. |
| Android | Firefox | Tampermonkey or Violentmonkey add-on | |
| Android | Microsoft Edge | Tampermonkey | Requires Edge's developer mode. |
| Android, iPhone | Chrome | Not supported | Chrome's mobile apps do not allow extensions. |

---

## Install

### 1. Install a userscript manager

Pick one for your browser:

- **[Tampermonkey](https://www.tampermonkey.net/):** Chrome, Edge, Firefox, Safari, Opera
- **[Userscripts](https://apps.apple.com/us/app/userscripts/id1463298887) is a free alternative for Safari mobile
- **[Greasemonkey](https://addons.mozilla.org/firefox/addon/greasemonkey/):** Firefox
- **[Violentmonkey](https://violentmonkey.github.io/):** Chrome, Edge, Firefox

### 2. Chrome, Edge, Brave, Opera: allow user scripts

Chromium-based browsers now require one extra permission before any userscript can run:

- **Chrome/Edge 138 and newer:** open `chrome://extensions` (or `edge://extensions`), click **Details** on your userscript manager, and turn on **Allow User Scripts**.
- **Older versions:** open the extensions page and turn on **Developer mode** (top right).

Firefox and Safari skip this step.

### 3. Install the script

**One click:** open the install link below. Your userscript manager shows an install page; click **Install**.

**[Install AES Bracket Viewer](https://github.com/BrandonDHaskell/aes-bracket-viewer/releases/latest/download/aes-bracket-viewer.user.js)**

**Manual install (if the link just shows code):**
1. Open your userscript manager's dashboard and create a new script.
2. Delete the placeholder text, paste in the contents of `aes-bracket-viewer.user.js`, and save.

### 4. Open it on AES

Go to any event on [advancedeventsystems.com](https://advancedeventsystems.com), and select an event schedule to view. A **Bracket Viewer** button appears in the bottom-right corner; click it to open the viewer. Press **Esc** or click **Close** to return to AES.

### 5. Star your teams

On AES, use the **star icon** to add your teams to Favorites. The viewer then follows them:
- It opens the right division and selects your team.
- It shows a "My teams" bar for switching between teams, including teams in other divisions.
- It remembers your teams for future events.

### Updating

Open the install link again. Your userscript manager will offer the new version. Your settings are kept.

---

## Using it

- **Tabs:** Tournament, Match Day, Standings & Outlook, Stats, and Scouting. On phones, the viewer opens on Match Day.
- **Filters:** Club, Team, and Group narrow the Tournament map. **Reset filters** clears them.
- **Settings:**
  - **Division:** switch divisions.
  - **Time zone:** by default, times use your device's time zone.
  - **Arrive before first match:** 15 to 90 minutes.
  - **Notifications:** turn change alerts on or off.
  - **Saved teams:** save the selected team, or clear the list.
  - **Links:** copy a link to the current view, or copy a starter link for other coaches.
- **Details:** the status bar's Details button shows data notes, such as when the data was last updated and any placeholders AES has not filled in yet.
- **Keyboard:** Tab to any match card and press Enter to trace it. Esc closes the viewer.

### Tips for clubs

- **Each coach stars their own teams on AES.** Nothing is configured per club, so one script works for everyone.
- **Starter link:** a club director can use Settings > **Copy starter link** to send new coaches a link that adds the club's teams to their saved teams.
- **View links:** any view (a team's Match Day, a scouting report) can be shared with **Copy link to this view**.

---

## Privacy

- Runs only on `results.advancedeventsystems.com`, in your browser.
- Reads the same public results data the AES pages already load. Nothing is sent anywhere else, and there are no accounts, analytics, or tracking.
- Preferences are stored in your browser. The viewer reads your AES favorites but never changes them.
- While the viewer is open, it checks AES for updates once a minute. It only checks in the background (every 2 minutes) if you turn on notifications.

---

## Troubleshooting

| Problem | Try this |
|---|---|
| No **Bracket Viewer** button | Make sure the userscript manager and the script are both enabled. Check that you're on an event page. On Chrome or Edge, turn on **Allow User Scripts** (step 2), then reload the page. |
| "AES data could not be loaded" | AES may be busy or down. Select **Refresh** in a moment. |
| Times look wrong | Settings > **Time zone**. Choose the event's time zone. |
| Print window doesn't open | Allow pop-ups for results.advancedeventsystems.com. |
| "Copy parent update" doesn't copy on a phone | The text appears selected on the page; copy it from there. |
| No notifications | Allow notifications for the AES site when asked. Notifications need the AES tab to stay open. |

---

## Good to know

- **Unofficial data source:** the viewer uses the public data behind the AES website, which is not an official API. If AES changes its site, parts of the viewer may stop working until the script is updated.
- **Estimates:** "On court now" and "court may be running late" are estimates based on the schedule and on results not yet posted. AES doesn't publish live match status.
- **Standings:** calculated standings use common tiebreaks (match win %, set win %, head-to-head, point ratio). Your event's rules may differ. Once a pool is complete, AES's published finish places are used.
- **Confirm times:** always check critical times and courts with the event desk.

---

## For developers

The repository includes automated tests that run the script in a simulated browser (jsdom).

```bash
npm install jsdom@24
node aes-bracket-viewer.smoke.test.cjs
```

The replay tests run the viewer against a saved copy of a real event:

1. On an AES event page, open DevTools > Console and run `aes-capture.js`. It downloads a JSON snapshot of one division.
2. Run a replay test against that snapshot, for example:

```bash
TZ=America/Los_Angeles node phase1.replay.test.cjs aes-capture-<event>.json
```

---

## Disclaimer

AES Bracket Viewer is an independent project. It is not affiliated with, endorsed by, or supported by Advanced Event Systems or SportsEngine. All results data belongs to its respective owners.
