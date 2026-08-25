export default {
  expo: {
    name: "Handover",
    slug: "handover-voice-summarizer",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "handover",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.handovervoice.mobile",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false
      }
    },
    android: {
      package: "com.handovervoice.mobile",
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
      adaptiveIcon: {
        backgroundColor: "#12776d",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png"
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      permissions: [
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS"
      ]
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      "expo-notifications",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#f4f2ec",
          dark: {
            backgroundColor: "#f4f2ec"
          }
        }
      ],
      "expo-secure-store",
      [
        "expo-audio",
        {
          microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone to record handover notes."
        }
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "Allow $(PRODUCT_NAME) to access your photos to set your profile picture."
        }
      ],
      "expo-asset",
      [
        "expo-build-properties",
        {
          android: {
            usesCleartextTraffic: true
          }
        }
      ]
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: false
    },
    extra: {
      router: {},
      eas: {
        projectId: "155e01ed-9376-4653-9a26-c0fdbf2e7614"
      }
    }
  }
};
