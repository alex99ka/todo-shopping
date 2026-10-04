import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.alex99ka.todoshop',
  appName: 'Todo and Shopping',
  webDir: 'www',
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
    },
    FirebaseAuthentication: {
      // AuthService signs in through the JS SDK with the credential this plugin
      // returns, so the plugin must not establish a native session of its own.
      skipNativeAuth: true,
      providers: ['google.com'],
    },
    CapacitorUpdater: {
      // UpdateService drives updates from GitHub Releases; never talk to Capgo's cloud.
      autoUpdate: false,
      updateUrl: '',
      channelUrl: '',
      statsUrl: '',
    },
    FirebaseMessaging: {
      presentationOptions: ['alert', 'badge', 'sound'],
    },
  },
};

export default config;
