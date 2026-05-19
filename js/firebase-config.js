// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDcT0B7kutuHaPCCjpSC1CSv4Ab_y4GjYw",
  authDomain: "prent-13460.firebaseapp.com",
  projectId: "prent-13460",
  storageBucket: "prent-13460.firebasestorage.app",
  messagingSenderId: "307159723333",
  appId: "1:307159723333:web:5b60148bd2d4a68aa9e22c",
  measurementId: "G-FJKD3T0N8W"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);


// // js/firebase-config.js — P-rent Firebase Configuration
// // Replace all placeholder values with your actual Firebase project credentials
// // Get these from: https://console.firebase.google.com → Project Settings → Your Apps

// import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
// import { getAuth }       from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
// import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
// import { getStorage }    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
// import { getAnalytics }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

// // ── YOUR FIREBASE CONFIG ──────────────────────────────────────────────────────
// // Replace every value below with what you copied from Firebase Console
// const firebaseConfig = {
//     apiKey:            "YOUR_API_KEY",
//     authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
//     projectId:         "YOUR_PROJECT_ID",
//     storageBucket:     "YOUR_PROJECT_ID.appspot.com",
//     messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
//     appId:             "YOUR_APP_ID",
//     measurementId:     "YOUR_MEASUREMENT_ID",   // optional — remove if not using Analytics
// };

// // ── INITIALIZE FIREBASE ───────────────────────────────────────────────────────
// const app       = initializeApp(firebaseConfig);
// export const auth     = getAuth(app);
// export const db       = getFirestore(app);
// export const storage  = getStorage(app);
// export const analytics = getAnalytics(app);

// export default app;