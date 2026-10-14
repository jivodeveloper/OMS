# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Android release builds

Android reads versionName and versionCode directly from app.json. This release is 1.1.8 (18), package com.jivo.oms.

Run in Windows PowerShell from the OMS directory:

```powershell
cd C:\Users\JIVO\Desktop\PROJECT\OMS
# Stop daemons before clearing native caches.
cd android
.\gradlew.bat --stop
cd ..
# Clean generated native caches, then build both signed release artifacts.
npm run build:android
```

Separate builds after cleaning:

```powershell
npm run clean:android
npm run build:apk
npm run build:aab
```

Outputs:

- APK: android/app/build/outputs/apk/release/app-release.apk
- AAB (Google Play): android/app/build/outputs/bundle/release/app-release.aab

Requires Node dependencies, JDK 17, Android SDK, google-services.json and the existing release key configured in android/keystore.properties (storeFile, storePassword, keyAlias, keyPassword). Use the existing upload key for store updates. Do not commit signing credentials. Cleanup preserves source files and signing keys.

EAS profiles are preview (APK) and production (AAB), with local version management and automatic increments disabled. The local Gradle commands above use the release signing configuration already present on this machine.

Before upload, verify artifact versions and signatures. Google Play requires an unused versionCode greater than previously uploaded releases; if 18 has already been used, choose a higher code in app.json and rebuild. Changing the version does not resolve unrelated Play policy rejection reasons.
