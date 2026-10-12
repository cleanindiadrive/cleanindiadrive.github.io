import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDma_UrBD5XQICj5LOu214Fu3va_7VnvDg",
  authDomain: "sillysensei-b251b.firebaseapp.com",
  databaseURL: "https://sillysensei-b251b-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sillysensei-b251b",
  storageBucket: "sillysensei-b251b.firebasestorage.app",
  messagingSenderId: "859697431303",
  appId: "1:859697431303:web:f91ce7535a3aff27cc7ba2",
  measurementId: "G-XGR07BYBGN",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);
const devHosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
export const isDevelopmentMode =
  devHosts.includes(window.location.hostname) ||
  window.location.hostname.endsWith(".devtunnels.ms") ||
  window.location.hostname.endsWith(".github.dev") ||
  window.location.hostname.endsWith(".gitpod.io") ||
  window.location.hostname.endsWith(".ngrok-free.app") ||
  window.location.hostname.endsWith(".ngrok.io") ||
  window.location.hostname.endsWith(".loca.lt") ||
  window.location.hostname.endsWith(".preview.app") ||
  new URLSearchParams(window.location.search).get("dev") === "1";
