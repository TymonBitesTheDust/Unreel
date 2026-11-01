<p align="center">
  <img src="docs/images/hero.png" alt="Unreel: block YouTube Shorts and Instagram Reels, keep the rest of both apps" width="880">
</p>

# Unreel

Unreel stops the **YouTube Shorts** and **Instagram Reels** feeds without blocking YouTube or Instagram. Search, long videos, posts, Stories and messages keep working; the endless swipe feed doesn't. Free, open source, no ads and no tracking.

| Your device | How it works | Get it |
|---|---|---|
| **iPhone or iPad** | Removes Shorts and Reels on **youtube.com** and **instagram.com** in Safari | **[Setup guide](https://tymonbitesthedust.github.io/Unreel/)** (open it on your iPhone) · [steps below](#iphone-and-ipad) |
| **Android** (8.0 or later) | An app that closes the Shorts and Reels feeds inside the YouTube and Instagram apps | **[Unreel.apk](../../releases/latest)** · [steps below](#android) |
| **Mac or PC** | The same script as iPhone, in your browser | [steps below](#mac-and-pc) |

> Unreel isn't affiliated with YouTube, Google, Instagram or Meta.

## iPhone and iPad

iPhone doesn't let apps look inside other apps, so no app can remove just the Shorts tab from the YouTube app. Unreel works on the **websites** in Safari instead, where everything else keeps working.

**Easiest:** open the **[setup guide](https://tymonbitesthedust.github.io/Unreel/)** on your iPhone. It has these steps with tap-to-open buttons.

<p align="center">
  <img src="docs/images/iphone-setup.png" alt="iPhone steps: install Userscripts, turn it on in Safari settings, install unreel.user.js, use the websites without Shorts and Reels" width="880">
</p>

1. **Get the free [Userscripts](https://apps.apple.com/app/id1463298887) app** from the App Store (iOS 15 or later) and open it once.
2. **Turn it on:** open **Settings → Apps → Safari → Extensions → Userscripts**, switch on **Allow Extension**, and set **All Websites** to **Allow**. (iOS 17 or earlier: **Settings → Safari → Extensions**.)
3. **Install the script:** in Safari, open **[unreel.user.js](../../raw/HEAD/iphone/unreel.user.js)**. A page of code appears; that's normal. Tap the **AA** or puzzle-piece button in the address bar, choose **Userscripts**, then **Install**.
4. **Use the websites:** type **youtube.com** or **instagram.com** into Safari's address bar. The Shorts tab, Shorts shelves and the Reels tab are gone. A Short or Reel a friend sends you still opens, as a normal video or post.

### Keep it working

The YouTube and Instagram **apps** still have their feeds. Pick one:

- **Delete the YouTube and Instagram apps (best).** Links then open in Safari, where Unreel works.
- **Add the websites to your Home Screen, with a pause.** In Safari, open the [YouTube pause](https://tymonbitesthedust.github.io/Unreel/pause/?app=youtube) or [Instagram pause](https://tymonbitesthedust.github.io/Unreel/pause/?app=instagram) page. Tap **⋯** next to the address bar → **Share** → **Add to Home Screen** (on older iPhones, the **Share** button is at the bottom). Turn **Open as Web App off**, so it opens in Safari where Unreel works, then tap **Add**. Each time you open it, it counts and waits 10 seconds before letting you in.
- **Keeping the apps? Send them to the pause page.** In the **Shortcuts** app, tap **Automation → +**, choose **App → YouTube → Is Opened → Run Immediately**, then **New Blank Automation**, add **Open URLs** and paste `https://tymonbitesthedust.github.io/Unreel/pause/?app=youtube&from=app`. Repeat for Instagram with `app=instagram`. The [setup guide](https://tymonbitesthedust.github.io/Unreel/) has copy buttons for both links.
- **Or lock the apps with Screen Time:** **Settings → Screen Time → App Limits → Add Limit**, choose YouTube and Instagram, set 1 minute, and ask a friend to set the Screen Time passcode.

**Updates** arrive by themselves through Userscripts. If you installed Unreel before version 1.1, install it once more from step 3 to get them.

## Android

1. On your phone, download **Unreel.apk** from the [releases page](../../releases/latest) and open it. If Android asks, allow your browser or Files app to install apps.
2. Open Unreel, tap **Set up Unreel**, then **Agree and open settings**, and switch Unreel on.
3. Check it works: open YouTube and tap **Shorts**. You should land back on Home.

**Stuck?** If Play Protect blocks the install or the switch is greyed out, see **[Android help](docs/ANDROID-HELP.md)**.

What the Android app does:

- **Blocks the feed, not the app.** Opening the Shorts or Reels tab takes you back to Home. One video a friend sends you still plays; swiping to the next is blocked.
- **Gives you a moment to think** with a short pause card, and **counts** what it stopped today and this week.
- **Makes giving in harder:** turning blocking off or loosening a setting waits behind an optional PIN and a 5-minute delay. Pauses end by themselves.

<p align="center">
  <img src="docs/images/how-it-works.png" alt="How it works: you open the Shorts tab, Unreel shows a pause screen, you're back on Home" width="880">
</p>

## Mac and PC

- **Safari on a Mac** (macOS 12 or later): install [Userscripts](https://apps.apple.com/app/id1463298887), turn it on in **Safari → Settings → Extensions**, then follow iPhone steps 3 and 4.
- **Chrome, Edge or Firefox:** install [Violentmonkey](https://violentmonkey.github.io), then open [unreel.user.js](../../raw/HEAD/iphone/unreel.user.js); it offers to install the script.

## Privacy

- **iPhone and computers:** the script runs only on youtube.com and instagram.com, inside your browser, and sends nothing anywhere.
- **Android:** Accessibility access is the only special permission. Android sends Unreel events only from YouTube and Instagram; it reads the names of on-screen layout elements (such as whether the Reels tab is selected), not your messages or typing. The app has no internet permission, so nothing can leave your phone.
- No accounts, ads or analytics anywhere.

## Something not working?

- **Shorts or Reels came back:** YouTube or Instagram changed their app or site. [Open an issue](../../issues) with your phone model and app versions.
- **Android:** see [Android help](docs/ANDROID-HELP.md#troubleshooting).
- **iPhone, the YouTube or Instagram app opens instead of the website:** the app is still installed. Delete it, or type the address into Safari yourself.

## For developers

How to build, test and publish: [docs/DEVELOPING.md](docs/DEVELOPING.md). Design and platform limits: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Licences: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
