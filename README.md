# BoardVerse

A browser-based board game hub built for desktop. Four classic titles — each with a configurable menu, multiple visual themes, and a fully playable game screen.

## Games

| Game | Players | Themes | Opponents |
|------|---------|--------|-----------|
| Snakes & Ladders | 2–4 | Classic · Neon · Retro | Human vs computer |
| Chess | 2 | Classic · Neon · Retro | Human vs computer |
| Checkers | 2 | Classic · Neon · Retro | Human vs computer |
| Ludo | 2–4 | Classic · Neon · Retro | Human vs computer |

## Features

- Dark glassmorphic UI designed for 1080p and above
- Three visual themes per game switchable from the menu
- Consistent three-column layout across all games — controls on the left, board in the centre, rules and actions on the right
- Player name editing on all games so nobody loses track of whose token is whose
- Full game rules displayed in-game on every screen
- Game logs and move history on relevant games
- SVG snake and ladder overlays that scale cleanly at any resolution

## Gameplay Previews

![Snakes and Ladders](assets/images/snakes-gameplay.png)

## Project Structure

```
.
├── index.html                   # Hub landing page — game card grid
├── assets/
│   └── images/                  # Game card artwork and screenshots
├── js/
│   ├── data/games.js            # Central game registry
│   ├── main.js                  # Hub grid rendering
│   ├── gameMenu.js              # Shared menu chip selection logic
│   └── gameRuntime.js           # Legacy placeholder runtime
├── games/
│   ├── chess/
│   │   ├── chessMenu.html       # Menu — players, difficulty, theme
│   │   ├── chessGame.html       # Game screen
│   │   ├── chessGame.css        # Styles + themes
│   │   └── chessGame.js         # Full engine (castling, en passant, promotion, checkmate)
│   ├── checkers/
│   │   ├── checkersMenu.html    # Menu
│   │   ├── checkersGame.html    # Game screen
│   │   ├── checkersGame.css     # Styles + themes
│   │   └── checkersGame.js      # Full engine (forced captures, multi-jump, king promotion)
│   ├── ludo/
│   │   ├── ludoMenu.html        # Custom menu with player count steppers
│   │   ├── ludoGame.html        # Game screen
│   │   ├── ludoGame.css         # Styles + themes
│   │   └── ludoGame.js          # Full engine (token release, captures, home stretch, win)
│   └── snakes/
│       ├── snakesMenu.html      # Custom menu with player count steppers
│       ├── snakesGame.html      # Game screen
│       └── snakesGame.js        # Full engine (SVG overlays, snake/ladder logic, win detection)
└── styles/
    ├── main.css                 # Hub styling
    ├── menu.css                 # Shared menu styling
    ├── gamePlaceholder.css      # Legacy placeholder styling
    └── snakesGame.css           # Snakes & Ladders game screen styling
```

## Getting Started

1. Serve the project from any static file server:
   ```
   npx http-server .
   # or
   python -m http.server
   # or use the Live Server extension in VS Code
   ```
2. Open `index.html` in your browser.
3. Pick a game, configure players and theme, and play.

## Tech Stack

- HTML5
- CSS (Flexbox, Grid, custom properties, transitions)
- Vanilla JavaScript — no frameworks, no build step

---

Made by Faiz · eezydoes@hotmail.com
