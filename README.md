# HSR Custom Team Webapp

A Telegram Mini App for selecting custom teams in the Honkai: Star Rail bot.

## Teammate Payload Schema

```json
{
  "slot": 1,
  "teammates": [
    {
      "characterId": "1306b1",
      "lightCone": "23003",
      "characterEidolon": 0,
      "lightConeSuperimposition": 1
    },
    { ... },
    { ... }
  ]
}
```

## Files

| File | Purpose |
|------|---------|
| `index.html` | HTML shell, Telegram SDK, font imports |
| `style.css` | HSR-themed dark design system |
| `game-data-loader.js` | Fetches & caches game_data.json from CDN |
| `app.js` | Full app logic (state, modals, pickers, submit) |
