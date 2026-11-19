# Jarvis

Påminnelse-kollega för Windows (Electron). Ersätter "Kom ihåg" och använder samma datafil:
`%APPDATA%\Kom ihåg\data.json`. Påminnelserna lämnar aldrig datorn.

## Mappar

- `app/` – källkoden. `main.js` och `preload.js` är motorn (kräver ny exe vid ändring).
  `index.html` och `popup.html` är gränssnittet och uppdateras automatiskt.
- `ui/` – det appen hämtar som uppdatering. `ui/manifest.json` anger version och sha256 för varje fil.

## Släppa en uppdatering (utan ny nedladdning)

1. Ändra `app/index.html` och/eller `app/popup.html`.
2. `cd app && node make-ui.js 2.1.1 "Vad som är nytt" && rm -rf ../ui && mv ui ../ui`
3. Committa och pusha till `main`. Jarvis hämtar den inom en timme (eller direkt med kommandot *uppdatera*).

Ändras `main.js`/`preload.js` (motorn): höj `version` i `app/package.json`, bygg ny exe
(`cd app && npm i && npx electron-builder --win portable --x64`), lägg den i `shell/` (ta bort den gamla)
och kör `make-ui.js` igen. Jarvis 2.3.0+ hämtar då nya motorn själv, startar den och tar bort den gamla.
