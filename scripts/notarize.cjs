/**
 * @file scripts/notarize.cjs
 * @description Hook executado após electron-builder assinar o app.
 * Notariza o .app na Apple (obrigatório para macOS 10.15+ com hardened runtime).
 *
 * Requer as variáveis de ambiente:
 *   APPLE_ID                        — ex: seu-email@icloud.com
 *   APPLE_APP_SPECIFIC_PASSWORD     — senha gerada em appleid.apple.com (app-specific)
 *   APPLE_TEAM_ID                   — ex: ABCDE12345 (Developer → Membership)
 *
 * Se qualquer uma faltar, a notarização é pulada silenciosamente
 * (útil em dev / CI sem secrets configurados).
 */
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.warn('⚠️  notarize.cjs: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID ausentes — pulando notarização.');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;
  console.log(`🍎  Notarizing ${appPath} …`);

  await notarize({
    tool: 'notarytool',
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });

  console.log('✅  Notarization complete.');
};
