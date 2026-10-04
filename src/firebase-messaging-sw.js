// Shows pushes from the notifier while the app is closed or in the background.
// Separate from Angular's ngsw-worker.js: Firebase registers this one under its
// own scope. Config values are the public web config from environment.ts.
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyANlSA4Gsum9NHYrf6JoQ33OETsGERulG4',
  authDomain: 'alex-todo-shopping.firebaseapp.com',
  projectId: 'alex-todo-shopping',
  storageBucket: 'alex-todo-shopping.firebasestorage.app',
  messagingSenderId: '835092070723',
  appId: '1:835092070723:web:b0f8cd9cd201fe87ad6ff6',
});
firebase.messaging();
