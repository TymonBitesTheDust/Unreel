# Unreel on Android: help

Back to the [README](../README.md).

- [If Google Play Protect blocks the install](#if-google-play-protect-blocks-the-install)
- [If the Accessibility switch won't turn on](#if-the-accessibility-switch-wont-turn-on)
- [Using Unreel](#using-unreel)
- [Troubleshooting](#troubleshooting)

## If Google Play Protect blocks the install

Play Protect blocks apps installed from outside the Play Store that ask for Accessibility access, which Unreel needs to see when Shorts or Reels open. This is expected for any app like Unreel.

<p align="center">
  <img src="images/play-protect.png" alt="Play Protect steps: tap More details, turn off Play Protect scanning, install, turn scanning back on" width="880">
</p>

1. On the warning, tap **More details**. If you see **Install anyway**, tap it and you're done.
2. Otherwise, open the **Play Store**, tap your profile picture, then **Play Protect**, then the **gear icon**.
3. Turn off **Scan apps with Play Protect** and **Improve harmful app detection**.
4. Install `Unreel.apk` again.
5. Turn **Scan apps with Play Protect** back on.

If Play Protect later asks about Unreel, choose to keep it.

**On Samsung phones**, also check **Settings → Security and privacy → Auto Blocker**. If it's on, turn it off while you install, then turn it back on.

**Still blocked?** Install from a computer instead. Apps installed this way usually skip both Play Protect's install check and the Accessibility restriction below.

1. On the phone, open **Settings → About phone → Software information** and tap **Build number** seven times to unlock Developer options.
2. Turn on **Settings → Developer options → USB debugging**.
3. On the computer, install Google's free [Android SDK Platform-Tools](https://developer.android.com/tools/releases/platform-tools).
4. Connect the phone with a USB cable, accept the prompt on the phone, then run:
   ```bash
   adb install Unreel.apk
   ```

## If the Accessibility switch won't turn on

Android restricts Accessibility for apps installed from a file. You unlock it once in the app's App info page, but that option only appears **after you've tried the switch once**.

<p align="center">
  <img src="images/allow-accessibility.png" alt="Accessibility steps: tap the switch and OK, allow restricted settings in App info, switch Unreel on, check Blocking is on" width="880">
</p>

1. Go to **Settings → Accessibility → Installed apps → Unreel** and tap the switch. A **Restricted setting** message appears. Tap **OK**.
2. Go to **Settings → Apps → Unreel**, tap **⋮** in the top-right corner, then **Allow restricted settings**. Confirm with your PIN, pattern or fingerprint.
3. Go back to **Settings → Accessibility → Installed apps → Unreel**, switch it on and tap **Allow**.
4. Open Unreel. The blue box should say **Blocking is on**.

Menus differ slightly between phones. If you see something else:

| What you see | What to do |
|---|---|
| No **Allow restricted settings** in the ⋮ menu | Do step 1 first. If it's still missing (some recent Samsung updates hide it), install with `adb` as described above. |
| **Restricted by Advanced Protection** | Android's Advanced Protection mode blocks all apps like Unreel. The only way around it is turning that mode off in **Settings → Security and privacy**. |
| **Blocked by your admin** | The phone is managed by Family Link or a work profile. Whoever manages it has to allow Unreel. |

## Using Unreel

| Part of the screen | What it does |
|---|---|
| **Switch in the blue box** | Turning it off offers a 15-minute, 1-hour or until-tomorrow pause, or turning blocking off. All of them wait behind your PIN and delay. Turning it back on is instant. |
| **What to block** | YouTube Shorts and Instagram Reels separately, and whether one shared video may play. |
| **Make it harder to give in** | Set a PIN (give it to a friend if you don't trust yourself with it) and choose the unlock delay. Shortening the delay or removing the PIN also has to wait out the current delay. |
| **Show a pause screen** | The full-screen card after each block. Turn it off for a short message instead. |
| **Your numbers** | Everything Unreel has stopped, with a reset. |

## Troubleshooting

**Shorts or Reels aren't being blocked.** Open Unreel and look at the blue box.
- **Android stopped the blocker:** Android or a battery saver closed Unreel. Switch Unreel off and on again in Accessibility settings. On Samsung, also set **Settings → Apps → Unreel → Battery** to **Unrestricted** so it isn't closed again.
- **Blocking is on, but a feed still opens:** YouTube or Instagram probably changed their layout in an update. Please [open an issue](https://github.com/TymonBitesTheDust/Unreel/issues) with your app versions (shown in **Settings → Apps → YouTube/Instagram**) and your phone model.

**"App not installed" when updating.** The new APK was signed with a different key than the one you have. Uninstall Unreel first, then install the new one. This resets your counts and settings.

**Checking your download.** Release APKs are signed with this certificate, SHA-256:
```
620e999dd9e6ef6843e136eb524ae261d95bec3f2d0e720a536048d2ec97fc57
```
Compare it with `apksigner verify --print-certs Unreel.apk` (part of Android's build tools).
