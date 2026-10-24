# Third-party notices

Everything below is free to use, including commercially. This file lists what Unreel ships or uses and what each licence asks in return.

## Fonts

| Font | Where it's used | Licence | What the licence asks |
|---|---|---|---|
| **Barlow Condensed** (SemiBold, Bold), © 2017 The Barlow Project Authors (Jeremy Tribby) | Bundled in the Android APK and the Expo app for headings and numbers | [SIL Open Font License 1.1](https://openfontlicense.org) | Ship the licence with the font files; don't sell the font on its own. The APK includes it at `assets/licenses/BarlowCondensed-OFL-1.1.txt`. |
| **Inter**, © 2016 The Inter Project Authors | Only to draw the pictures in `docs/images/`. Not shipped in the app | SIL Open Font License 1.1 | Nothing for images made with it. |
| System fonts (Roboto, Samsung One, San Francisco) | Body text in the app | Provided by the phone | Nothing: they aren't shipped with Unreel. |

The font files aren't stored in this repository; `npm install` fetches them from the `@expo-google-fonts/barlow-condensed` package (code MIT, fonts OFL 1.1).

## Code inside the Android APK

| Component | Licence |
|---|---|
| Kotlin standard library, © JetBrains | [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). A copy ships in the APK at `assets/licenses/Kotlin-stdlib-Apache-2.0.txt`. |

## Expo app dependencies

Expo, React Native, Expo Router and the other packages in `package.json` are MIT-licensed (a few are BSD or Apache 2.0). Their licence files arrive with them in `node_modules` when you run `npm install`.

## Build tools (not shipped)

`native-android/build-apk.sh` uses `aapt2`, `dx` and `apksigner` from the Android Open Source Project (Apache License 2.0) and the Kotlin compiler (Apache License 2.0). They build the APK but aren't included in it.

## Acknowledgements

The YouTube and Instagram view identifiers in `unreel_rules.json` were cross-checked against the open-source Android blockers [Nudge](https://github.com/astraedus/nudge), [Tapback](https://github.com/ruhani-j/tapback) and [Shorts Blocker](https://github.com/atick-faisal/Shorts-Blocker). No code was copied from them.

YouTube is a trademark of Google LLC. Instagram is a trademark of Meta Platforms, Inc. Unreel isn't affiliated with either.
