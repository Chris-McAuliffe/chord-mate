# Chord Mate

Chord Mate is an Android-focused Expo app for entering lyrics, splitting them into syllables, assigning chords above syllables, saving songs locally, exporting songs as JSON, importing shared songs, and transposing chords up/down.

## Build as APK

This project is ready for an Expo/EAS Android APK build.

### Local command route

```bash
npm install
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview
```

The `preview` profile in `eas.json` is already configured to produce an APK.

## Required Expo packages

These are already included in `package.json`:

- expo-file-system
- expo-sharing
- expo-document-picker
- @react-native-async-storage/async-storage

## App name

Chord Mate
