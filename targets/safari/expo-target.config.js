/**
 * Safari Web Extension. On iOS this is the only way to remove *just* Shorts and Reels — but only
 * on the websites, not inside the native apps. Users enable it in
 * Settings → Apps → Safari → Extensions → Unreel, and allow it on youtube.com and instagram.com.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = () => ({
  type: 'safari',
  name: 'UnreelSafari',
  bundleIdentifier: '.safari',
  deploymentTarget: '16.4',
  icon: '../../assets/icon.png',
});
