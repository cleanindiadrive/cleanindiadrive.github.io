// Public Firebase web configuration. Authorization is enforced by the deployed rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyD8Z8xnznFs-qSKZmgBATsqIbNPIpMCSe4',
  authDomain: 'shopatsillysensei.firebaseapp.com',
  projectId: 'shopatsillysensei',
  databaseURL: 'https://shopatsillysensei-default-rtdb.asia-southeast1.firebasedatabase.app',
  storageBucket: 'shopatsillysensei.firebasestorage.app',
  messagingSenderId: '1083210845304',
  appId: '1:1083210845304:web:0fe4d672a287ead9e2318d',
  measurementId: 'G-44V5H1KBH2',
};
// UI fallback; backend/core.js is authoritative for administrator access.
export const ADMIN_EMAILS = ['abhishekredddy500@gmail.com','vishnudeviprasadshetty@gmail.com','supritachat.25@gmail.com'];
// Public reCAPTCHA Enterprise site key (not a secret). Add after App Check registration.
export const APP_CHECK_SITE_KEY = '';
