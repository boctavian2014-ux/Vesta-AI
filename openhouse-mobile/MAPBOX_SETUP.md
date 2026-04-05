# Mapbox – migrare de la react-native-maps

## Expo Go vs development build

**`@rnmapbox/maps` folosește cod nativ** (iOS/Android). În **Expo Go** acest cod nu există → apare eroarea „native code not available” și aplicația poate cădea cu „App entry not found”.

- **Expo Go** (rapid, fără build): folosește **MapScreen** (react-native-maps, harta Google). Setare curentă în `App.js`.
- **Harta Mapbox** (SatelliteStreets, pitch 45°): necesită **development build** (binary nativ compilat local).

### Pași pentru trecerea la Mapbox (development build)

1. **Pachetul e deja în proiect** – `@rnmapbox/maps` este în `package.json`. Dacă lipsește: `cd openhouse-mobile && npm install @rnmapbox/maps`.

2. **Token Mapbox** – Ia un Access Token de pe [mapbox.com](https://account.mapbox.com/). În `openhouse-mobile` setează variabila de mediu (ex. în `.env`):
   ```bash
   EXPO_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...
   ```
   Sau în `app.config.js` / `app.json` (extra) dacă folosești config Expo.

3. **Development build** (din `openhouse-mobile`):
   ```bash
   cd openhouse-mobile
   npx expo prebuild
   npx expo run:ios
   ```
   Pentru Android: `npx expo run:android`.

4. **Comutare ecran în App.js** – Înlocuiești harta cu Mapbox:
   - Import: `import MapScreenMapbox from "./screens/MapScreenMapbox";` (în loc de `MapScreen`).
   - Stack: `<Stack.Screen name="Map" component={MapScreenMapbox} />`.

5. **Revenire la Expo Go** (opțional) – Dacă vrei să rulezi din nou în Expo Go, revino la `MapScreen` în `App.js` (import + component), altfel app-ul va cădea la pornire.

---

## Sfat: conflicte native (iOS)

Dacă ai deja **react-native-maps** instalat, trebuie să îl dezinstalezi sau să cureți **Podfile**-ul (iOS) înainte de a rula Mapbox, pentru a evita conflicte de librării native.

```bash
# Dezinstalare react-native-maps (după ce treci pe Mapbox)
npm uninstall react-native-maps
# sau
yarn remove react-native-maps
```

Pe iOS, după dezinstalare rulează `cd ios && pod install`.

## Instalare Mapbox

**Important:** Rulează din folderul **openhouse-mobile** (nu din rădăcina repo-ului), altfel Metro nu găsește modulul.

```bash
cd openhouse-mobile
npm install @rnmapbox/maps
# sau
yarn add @rnmapbox/maps
```

**Token:** Ia un Access Token de pe [mapbox.com](https://account.mapbox.com/). Setează-l în app (ex. `config.js` sau variabilă de mediu) și folosește-l cu `Mapbox.setAccessToken('...')` înainte de a randa harta.

**Expo:** `@rnmapbox/maps` necesită de obicei un **development build** (nu merge în Expo Go). Rulează `npx expo prebuild` apoi build native.

## Integrare cu Bottom Sheet (offset camera)

Pentru ca markerul să nu fie acoperit de panoul de jos, folosește `setCamera` cu `padding`:

```javascript
// Când Bottom Sheet-ul se ridică la jumătatea ecranului:
cameraRef.current?.setCamera({
  centerCoordinate: propertyCoords,
  padding: { paddingBottom: 300 }, // Împinge centrul hărții în sus cu 300px
  animationDuration: 500,
});
```

## De ce Mapbox (SatelliteStreets + pitch 45°)

- **Pitch 45°:** Perspectivă 3D, look profesional de analiză.
- **SatelliteStreets:** Mai clar decât satelitul standard, evidențiază limitele acoperișurilor („apasă pe acoperiș”).
- **Markeri vectoriali:** Nu se pixelizează la zoom.

După instalare:

1. Setează token-ul: în `MapScreenMapbox.tsx` sau în `config.js` / `.env` (ex. `EXPO_PUBLIC_MAPBOX_TOKEN`).
2. Înregistrează ecranul în navigator: în `App.js` înlocuiești importul de `MapScreen` cu `MapScreenMapbox` pentru stack-ul care conține harta (ex. `<Stack.Screen name="Map" component={MapScreenMapbox} />`).
