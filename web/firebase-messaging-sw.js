// Push notifications for the web app (the iPad, added to its Home Screen).
// Firebase shows a message that arrives while the app is closed. The config
// is the web app's own, the same values as lib/firebase_options.dart (web);
// the SDK version matches FlutterFire's.
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyANlSA4Gsum9NHYrf6JoQ33OETsGERulG4",
  appId: "1:835092070723:web:b0f8cd9cd201fe87ad6ff6",
  messagingSenderId: "835092070723",
  projectId: "alex-todo-shopping",
  authDomain: "alex-todo-shopping.firebaseapp.com",
  storageBucket: "alex-todo-shopping.firebasestorage.app",
});
firebase.messaging();
