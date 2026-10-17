// Firebase project `alex-todo-shopping`: the same values the Ionic app shipped
// (src/environments/environment.ts and google-services.json). Public by
// design: they name the project; the Firestore rules guard the data. The web
// config serves Windows too.
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart';

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) return web;
    return switch (defaultTargetPlatform) {
      TargetPlatform.android => android,
      TargetPlatform.windows => web,
      _ => throw UnsupportedError('No Firebase config for $defaultTargetPlatform'),
    };
  }

  static const web = FirebaseOptions(
    apiKey: 'AIzaSyANlSA4Gsum9NHYrf6JoQ33OETsGERulG4',
    appId: '1:835092070723:web:b0f8cd9cd201fe87ad6ff6',
    messagingSenderId: '835092070723',
    projectId: 'alex-todo-shopping',
    authDomain: 'alex-todo-shopping.firebaseapp.com',
    storageBucket: 'alex-todo-shopping.firebasestorage.app',
  );

  static const android = FirebaseOptions(
    apiKey: 'AIzaSyCSyYbnHqekB4ld3nmCY0NGxkSDsRe6rYI',
    appId: '1:835092070723:android:f70cc2d947288566ad6ff6',
    messagingSenderId: '835092070723',
    projectId: 'alex-todo-shopping',
    storageBucket: 'alex-todo-shopping.firebasestorage.app',
  );
}
