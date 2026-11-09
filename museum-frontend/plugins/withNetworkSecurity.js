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

function withNetworkSecurity(config, options) {
  const variant = options && options.variant ? options.variant : 'development';
  const isDev = variant === 'development';

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
