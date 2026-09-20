import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'it.powerbodyclub.app',
  appName: 'Power Body Club',
  // Cartella prodotta da "npm run build"
  webDir: 'dist/frontend/browser',
  android: {
    // Il backend in fase di prova gira su http, non https.
    // Android blocca il traffico in chiaro per impostazione predefinita.
    // Da rimettere a false quando il backend sara' su https.
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
