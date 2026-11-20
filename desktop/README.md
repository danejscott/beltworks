# Beltworks desktop build

A Windows app version of Beltworks (Electron), the first step toward a Steam release.

1. Build the game once in the parent folder: `npm run build`
2. Here: `npm install` (downloads Electron, ~150 MB, one time)
3. `npm start` runs it in a window. `npm run dist` makes `release/win-unpacked/Beltworks.exe`;
   `npm run dist:installer` makes a Setup .exe.

For Steam: create the app in Steamworks, upload `release/win-unpacked` as the depot, and set the launch option to
`Beltworks.exe`. Achievements/cloud saves via Steamworks would need the `steamworks.js` package later.
