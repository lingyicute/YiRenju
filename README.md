<br>
<br>
<br>
<h1 align="center">YiRenju</h1>
<h3 align="center">Five in a row, the Renju way.</h3>

<p align="center">A lightweight, self-contained browser game of Renju (连珠), the competitive Gomoku variant with forbidden moves for Black. Play against four AI levels or a friend on the same device.</p>
<p align="center">Made with ❤️ by <a href="https://github.com/lingyicute">lingyicute</a>.</p>
<br>
<br>
<p align="center">
  [🇺🇸 English] •
  <a href="https://github.com/lingyicute/YiRenju">🌐 Source Code</a> •
  <a href="https://github.com/lingyicute/YiRenju/issues">🐛 Report Bug</a>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-orange.svg" alt="License: AGPL-3.0"></a>
  <a href="./index.html"><img src="https://img.shields.io/badge/Single%20File-156%20KiB-blue" alt="Self-contained HTML, approximately 156 KiB"></a>
  <a href="https://github.com/lingyicute/YiRenju"><img src="https://img.shields.io/badge/Runtime%20Setup-None-brightgreen" alt="No runtime setup"></a>
  <a href="https://github.com/lingyicute/YiRenju"><img src="https://img.shields.io/badge/Network%20Requests-Zero-brightgreen" alt="Zero network requests"></a>
  <a href="https://github.com/lingyicute/YiRenju"><img src="https://img.shields.io/github/stars/lingyicute/YiRenju?style=flat&color=yellow" alt="GitHub Stars"></a>
</p>
<br>

## 📖 Overview

Gomoku is simple: get five stones in a row. **Renju** (连珠) is its competitive variant, which originated in Japan. To offset Black's first-move advantage, Black is held to three forbidden moves, while White is not.

**YiRenju** brings Renju to your browser: a 15 × 15 board, forbidden-move checks for Black, four AI difficulty levels, and a local two-player mode.

It is a **single, self-contained HTML file** with the markup, styles, and game logic built in. There is nothing to install, no account to create, and no network connection required to play.

<br>

## ✨ Features

- **⚖️ Renju Rules**
  - Black moves first. Black may not make a **double-three (三三)**, **double-four (四四)**, or **overline (长连, six or more in a row)**.
  - Black wins only with **exactly five** in a row. White has no forbidden moves, and five or more in a row wins for White.
  - Forbidden points are marked with **×** on Black's turn. Playing on one is refused, and it does not count as a loss.
  - The everyday "free opening" rule set is used. Tournament opening rules (such as swap openings) are not implemented.
  - A rules summary and a short Renju primer are available from the menu (☰).

- **🤖 Four AI Levels**
  - **Easy:** random moves near the action, weighted toward stronger points. It takes winning moves and always blocks an immediate win.
  - **Medium:** ranks moves by attack and defense value, with some randomness.
  - **Hard:** iteratively deepens 2 → 6 plies (its move and your reply), with a 1.2-second limit per move.
  - **Expert:** iteratively deepens 2 → 8 plies with a 3-second limit per move, and stops as soon as a forced win is proven.
  - Choose to play **Black (first)** or **White (second)**. Changing it starts a new game.

- **👥 Local Two-Player**
  - Two people take turns on the same device. Two-player games are not counted in the stats.

- **↩️ Undo, Restart, and Timer**
  - Undo with `Z`. Against the AI, undo also takes back the AI's last reply.
  - Restart at any time with `R`. A status panel shows the move number, whose turn it is, and the elapsed time.

- **💾 Resume Unfinished Games**
  - Your current game is saved in the browser and restored when you reopen the page, timer included.

- **🎯 Clear Board Display**
  - The last move is marked with a dot, and the winning five-in-a-row is highlighted.

- **📊 Local Win/Loss Records**
  - Track your results against the AI by difficulty and by the color you played.
  - Clear all records from the menu. This also discards the unfinished game.

- **🎨 Dark and Light Themes**
  - Switch themes with one click, and pick from eight accent colors: purple, blue, teal, green, yellow, orange, pink, and red.

- **📱 Mouse, Touch, and Keyboard**
  - Hover to preview a stone on desktop. Tap to place a stone on mobile; swiping still scrolls the page.
  - The board scales to fit your screen. The keyboard cursor works with arrow keys or WASD.

- **🔊 Stone Sounds and Haptics**
  - A crisp Web Audio click on every move — black and white stones sound different — plus a little arpeggio on your wins. Toggle it from the menu (☰).
  - On supported phones, moves give a short vibration pulse, and a win plays a celebratory rhythm.

- **🔒 Offline, Private, and Ad-Free**
  - `index.html` makes **zero external network requests**. No accounts, analytics, or ads.
  - Settings, records, and unfinished games stay in your browser's local storage.

<br>

## 🎮 Controls

| Action | Control |
| --- | --- |
| Place a stone | Click (mouse) or tap (touch) an intersection, or press `Space` / `Enter` on the keyboard cursor |
| Move the keyboard cursor | `↑` `↓` `←` `→` or `W` `A` `S` `D` (wraps around the edges) |
| Undo | `Z` or the undo button |
| Restart | `R` or the restart button |
| Close a dialog or the menu | `Esc` |

<br>

## 🛠️ Why YiRenju? (Under the Hood)

### 1. A Complete Game in One HTML File

`index.html` contains the markup, CSS, JavaScript, icon, and an embedded font subset, all inline. There is no build step, no package manager, and no backend to configure.

### 2. A Renju Rules Engine

Forbidden-move detection checks Black's candidate points against the three forbidden patterns. The same check marks forbidden points on the board and decides whether your move is accepted.

### 3. Search-Based AI

Hard and Expert use negamax search with alpha-beta pruning and a transposition table keyed by Zobrist hashing. Candidate moves are limited to empty points near existing stones. A threat search follows continuous fours (VCF) and lived-threes (VCT) to find forced wins and forced defenses, and a final guard pass vetoes any move that would hand the opponent a provable forced win. The engine bootstraps itself into a Web Worker carved from the same `index.html`, so the page never freezes while the AI thinks.

### 4. Your Data Stays on Your Device

Settings, records, and the unfinished game are stored in `localStorage`. Nothing is sent to a server. If browser storage is unavailable, the game still works, but nothing is saved.

<br>

## 🚀 Play It Now

There is nothing to install. `index.html` is the whole game.

### Option 1 — Open the file

Download `index.html` and open it directly in a modern browser. No server is needed.

### Option 2 — Serve it locally

```bash
git clone https://github.com/lingyicute/YiRenju.git
cd YiRenju
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

### Option 3 — Publish it anywhere

Host the repository as a static site with GitHub Pages, Cloudflare Pages, Netlify, or any static web host. The root `index.html` is the complete game.

### Requirements

- **Browser:** a current version of Chrome, Edge, Firefox, or Safari. The stylesheet uses CSS `color-mix()`.
- **Network:** not required to play. It is only needed to download the file.
- **Storage:** `localStorage` keeps your settings, records, and unfinished game. The game still works without it.
- **Permissions:** none.

<br>

## 🔨 Development

The whole game lives in one file. Edit `index.html`, save it, and reload the page.

### Embedded Font

The display font (Nebulove) ships inline as a base64 subset covering only the glyphs the UI actually renders (~50 KB), so the page never downloads a font. If you change any UI text, regenerate the subset or new characters will fall back to system fonts:

```bash
pip install fonttools brotli
python3 scripts/subset_font.py          # rewrites the @font-face block in index.html
python3 scripts/subset_font.py --check  # report which glyphs would change, write nothing
```

### Testing

The `tests/` directory holds plain Node.js scripts (ESM, no build step):

```bash
# Rule engine & AI unit tests — 63 assertions, zero dependencies
node tests/renju-core-test.mjs

# Full-game smoke through the real AI move path — zero dependencies
node tests/ai-selfplay-smoke.mjs

# AI strength benchmark (report only, ~1–2 min)
node tests/ai-tournament.mjs

# Browser end-to-end UI tests — 36 assertions (one-time setup required)
python3 -m http.server 8600     # serve this directory
npm i playwright-core @playwright/browser-chromium
npx playwright-core install chromium-headless-shell
node tests/renju-e2e.mjs
```

The unit and smoke suites assert on Renju rules, forbidden moves, and every AI search layer; the e2e suite additionally checks DOM behavior (foul markers, dialogs, records).

<br>

## 🤗 Contributing

Contributions are welcome!

- **Bug Reports & Feature Requests:** open an issue in the [GitHub Issue Tracker](https://github.com/lingyicute/YiRenju/issues).
- **Pull Requests:** fork the repository, make your changes, and open a pull request.

<br>

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See [LICENSE](./LICENSE) for the full text.
