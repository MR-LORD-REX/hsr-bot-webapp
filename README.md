# HSR Custom Team Webapp

A Telegram Mini App for selecting custom teams in the Honkai: Star Rail bot.

## Deployment (GitHub Pages)

1. Push the `webapp/` folder contents to the root of a GitHub repository (or `/docs` subfolder).
2. Enable GitHub Pages in the repo settings → point to the branch/folder.
3. The live URL will be: `https://<username>.github.io/<repo>/`

## Bot Integration

When registering the Mini App button in the bot, the URL must include `uid`, `slot`, and `tele_id` as query params:

```
https://<your-pages-url>/?uid={uid}&slot={slot}&tele_id={tele_id}
```

Example in the keyboard builder:
```python
from aiogram.types import InlineKeyboardButton, WebAppInfo

btn = InlineKeyboardButton(
    text="🎮 Custom Team",
    web_app=WebAppInfo(url=f"https://<your-pages-url>/?uid={uid}&slot={slot}&tele_id={tele_id}")
)
```

The `tele_id` param is used by the webapp to verify the Telegram user ID from `initData` matches the owner.
If someone else opens the URL, they see an error and cannot interact with the webapp.

## Data Flow

```
Bot opens webapp URL with ?uid=...&slot=...
  ↓
Webapp calls POST https://ilcapitano01-gi-card-api.hf.space/getcals
  { uid, slot, benchmark: true }
  ↓
Loads game_data.json from fribbels/hsr-optimizer CDN (cached in sessionStorage)
  ↓
User selects 3 teammates (character + light cone + E0–E6 + S1–S5)
  ↓
User presses "Generate Card"
  ↓
Telegram.WebApp.sendData(JSON) → bot receives via web_app_data update
  ↓
Bot calls get_custom_card() → sends photo reply
```

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
