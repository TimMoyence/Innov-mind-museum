/**
 * Expo config plugin — network security hardening for Musaium (Item 12 option B).
 *
 * Produces, at prebuild time:
 *   - `android/app/src/main/res/xml/network_security_config.xml`
 *     Enforces HTTPS (`cleartextTrafficPermitted="false"`) with the system
 *     trust store as anchor. In the development variant, localhost / 10.0.2.2
 *     (Android emulator host) are allowed cleartext so Metro dev server works.
 *   - Patches `AndroidManifest.xml` so the `<application>` references
 *     `android:networkSecurityConfig="@xml/network_security_config"`.
 *   - Rewrites `ios.infoPlist.NSAppTransportSecurity` so ATS is strict in prod
 *     (NSAllowsArbitraryLoads=false, NSAllowsLocalNetworking=false) and
 *     dev/preview keep NSAllowsLocalNetworking=true for Metro / Xcode Cloud.
 *
 * Why no public-key pinning? Pinning rotations take 24-48h to propagate via
 * the app stores; a bad pin bricks the app for every user until the next
 * update. Musaium is not a banking app and the upside (defense against a
 * hostile CA) does not justify the ops cost. See docs/security/network-hardening.md.
 */

const { withAndroidManifest, withDangerousMod, withInfoPlist } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const PROD_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

const DEV_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">localhost</domain>
    <domain includeSubdomains="true">10.0.2.2</domain>
    <domain includeSubdomains="true">127.0.0.1</domain>
  </domain-config>
</network-security-config>
`;

/**
 * @param {import('expo/config').ExpoConfig} config
 * @param {{ variant?: 'development' | 'preview' | 'production' }} [options]
 */
function withNetworkSecurity(config, options) {
  const variant = options && options.variant ? options.variant : 'development';
  const isDev = variant === 'development';

  // 1. Write XML into android/app/src/main/res/xml/
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const xmlDir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      const target = path.join(xmlDir, 'network_security_config.xml');
      const xml = isDev ? DEV_XML : PROD_XML;
      fs.writeFileSync(target, xml, 'utf8');
      return cfg;
    },
  ]);

  // 2. Patch AndroidManifest.xml so <application> points at the XML.
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    if (!manifest.application || manifest.application.length === 0) {
      return cfg;
    }
    const application = manifest.application[0];
    application.$ = application.$ || {};
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return cfg;
  });

  // 3. Lock down iOS ATS — allow localhost only in dev.
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: isDev,
    };
    return cfg;
  });

  return config;
}

module.exports = withNetworkSecurity;
