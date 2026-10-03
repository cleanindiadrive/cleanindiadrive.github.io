import fs from 'node:fs';

// Helper to normalize line endings
const norm = (str) => str.replace(/\r\n/g, '\n');

const siteCss = norm(fs.readFileSync('site.css', 'utf8'))
  .replace(/url\(["']?assets\/trees-texture\.webp["']?\)/g, 'url("https://cleanindiadrive.github.io/assets/trees-texture.webp")');

const indexHtml = norm(fs.readFileSync('index.html', 'utf8'));
const dashHtml = norm(fs.readFileSync('user-dashboard.html', 'utf8'));
const mainJs = norm(fs.readFileSync('js/main.js', 'utf8'));
const dashJs = norm(fs.readFileSync('js/user-dashboard.js', 'utf8'));

// Extract home body content between <body> and </body>, excluding loader and scripts
const homeBodyMatch = indexHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
let homeBody = homeBodyMatch ? homeBodyMatch[1] : '';
homeBody = homeBody.replace(/^[\s\S]*?(?=<header\b)/i, '');
homeBody = homeBody.replace(/<script[\s\S]*?<\/script>/gi, '');

// Extract dashboard body content between <body> and </body>, excluding loader and scripts
const dashBodyMatch = dashHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
let dashBody = dashBodyMatch ? dashBodyMatch[1] : '';
dashBody = dashBody.replace(/^[\s\S]*?(?=<header\b)/i, '');
dashBody = dashBody.replace(/<script[\s\S]*?<\/script>/gi, '');

// Disambiguate the toggle button in dashboard from homepage
dashBody = dashBody.replace('id="subscription-toggle"', 'id="dashboard-subscription-toggle"');
dashBody = dashBody.replace('id="subscription-toggle-text"', 'id="dashboard-subscription-toggle-text"');

// Fix internal navigation links to hash links
homeBody = homeBody.replace(/href=["']user-login\.html["']/g, 'href="#dashboard"');
homeBody = homeBody.replace(/href=["']user-dashboard\.html["']/g, 'href="#dashboard"');
dashBody = dashBody.replace(/href=["']index\.html["']/g, 'href="#home"');

// Fix relative image & policy URLs to absolute cleanindiadrive.github.io URLs so they load anywhere in Odoo
const fixAssetUrls = (str) => {
  return str
    .replace(/src="Group%201\.png"/g, 'src="https://cleanindiadrive.github.io/Group%201.png"')
    .replace(/src="Group 1\.png"/g, 'src="https://cleanindiadrive.github.io/Group%201.png"')
    .replace(/src="assets\//g, 'src="https://cleanindiadrive.github.io/assets/')
    .replace(/href="icons\/favicon\.svg"/g, 'href="https://cleanindiadrive.github.io/icons/favicon.svg"')
    .replace(/href="about\.html"/g, 'href="https://cleanindiadrive.github.io/about.html"')
    .replace(/href="contact\.html"/g, 'href="https://cleanindiadrive.github.io/contact.html"')
    .replace(/href="cancellation\.html"/g, 'href="https://cleanindiadrive.github.io/cancellation.html"')
    .replace(/href="terms\.html"/g, 'href="https://cleanindiadrive.github.io/terms.html"')
    .replace(/href="privacy\.html"/g, 'href="https://cleanindiadrive.github.io/privacy.html"');
};

homeBody = fixAssetUrls(homeBody);
dashBody = fixAssetUrls(dashBody);

// Default unauthenticated state: wrap all member sections inside dashboard-member-content and hide initially
dashBody = dashBody.replace(
  '<section class="dashboard-welcome">',
  '<div id="dashboard-member-content" class="dashboard-member-content is-hidden-auth">\n<section class="dashboard-welcome">'
);
dashBody = dashBody.replace('</main>', '</div>\n</main>');
dashBody = dashBody.replace('<div class="dashboard-user-badge">', '<div class="dashboard-user-badge is-hidden">');
dashBody = dashBody.replace('<button class="dashboard-logout"', '<button class="dashboard-logout is-hidden"');

// Common loader markup
const loaderMarkup = `
  <!-- Page Loading Screen -->
  <div id="page-loader" aria-hidden="true">
    <div class="main">
      <div class="dog">
        <div class="dog__paws">
          <div class="dog__bl-leg leg"><div class="dog__bl-paw paw"></div><div class="dog__bl-top top"></div></div>
          <div class="dog__fl-leg leg"><div class="dog__fl-paw paw"></div><div class="dog__fl-top top"></div></div>
          <div class="dog__fr-leg leg"><div class="dog__fr-paw paw"></div><div class="dog__fr-top top"></div></div>
        </div>
        <div class="dog__body"><div class="dog__tail"></div></div>
        <div class="dog__head">
          <div class="dog__snout">
            <div class="dog__eyes"><div class="dog__eye-l"></div><div class="dog__eye-r"></div></div>
          </div>
        </div>
        <div class="dog__head-c"><div class="dog__ear-r"></div><div class="dog__ear-l"></div></div>
      </div>
    </div>
    <span class="loader-label">Loading Manali Strays…</span>
  </div>
`;

// Insert inline login card for guest visitors on Dashboard
const dashboardAuthCardMarkup = `
  <!-- Embedded Login Card for Guest Users in Dashboard View -->
  <div id="dashboard-auth-card" class="auth-card dashboard-auth-card-centered">
    <div class="account-intro-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" />
      </svg>
    </div>
    <h2>Sign In to Your Account</h2>
    <p class="form-intro">Sign in with Google to view your recurring subscriptions, update payment preferences, and track your donation history.</p>
    <button class="button button-google" id="dashboard-google-login-btn" type="button" style="margin: 0 auto; display: flex; align-items: center; justify-content: center; gap: 0.75rem; padding: 0.75rem 1.6rem; font-size: 0.95rem; font-weight: 600; border-radius: 999px; border: 1.5px solid #dadce0; background: #fff; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 2px 6px rgba(0,0,0,0.06);">
      <svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid" viewBox="0 0 256 262" width="20" height="20">
        <path fill="#4285F4" d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"></path>
        <path fill="#34A853" d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"></path>
        <path fill="#FBBC05" d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782"></path>
        <path fill="#EB4335" d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"></path>
      </svg>
      <span>Sign In with Google</span>
    </button>
    <div id="dashboard-login-msg" class="auth-message" style="margin-top: 1rem;" role="status"></div>
  </div>
`;

// Insert the auth card inside dashboard main before welcome section
dashBody = dashBody.replace('<main class="dashboard-main">', '<main class="dashboard-main">\n' + dashboardAuthCardMarkup);

// Prepare Home JS
const homeJs = `
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getDatabase, onValue, push, ref, set, update } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

// Firebase Client Setup
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
const auth = getAuth(app);
const database = getDatabase(app);
const devHosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
const isDevelopmentMode =
  devHosts.includes(window.location.hostname) ||
  window.location.hostname.endsWith(".devtunnels.ms") ||
  window.location.hostname.endsWith(".github.dev") ||
  window.location.hostname.endsWith(".gitpod.io") ||
  window.location.hostname.endsWith(".ngrok-free.app") ||
  window.location.hostname.endsWith(".ngrok.io") ||
  window.location.hostname.endsWith(".loca.lt") ||
  window.location.hostname.endsWith(".preview.app") ||
  new URLSearchParams(window.location.search).get("dev") === "1";

${mainJs
  .replace(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g, '')
  .replace(/export\s+/g, '')
  .replace(/accountLink\.href\s*=\s*currentUser\s*\?\s*["']user-dashboard\.html["']\s*:\s*["']user-login\.html["'];/g, 'accountLink.href = "#dashboard";')
  .replace(/accountLink\.href\s*=\s*["']user-login\.html["'];/g, 'accountLink.href = "#dashboard";')
  .replace(/accountLink\.href\s*=\s*["']user-dashboard\.html["'];/g, 'accountLink.href = "#dashboard";')}
`;

// Prepare Dashboard JS
let preparedDashJs = dashJs
  .replace(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g, '')
  .replace(/export\s+/g, '')
  .replace(/get\("subscription-toggle"\)/g, 'get("dashboard-subscription-toggle")')
  .replace(/subscription-toggle-text/g, 'dashboard-subscription-toggle-text');

// Modify auth check so it doesn't force redirect to external user-login.html
const targetAuthCheck = `  onAuthStateChanged(auth, (user) => {
    if (!user || !user.emailVerified) {
      window.location.replace("user-login.html");
      return;
    }`;

const replacementAuthCheck = `  onAuthStateChanged(auth, (user) => {
    const authCard = get("dashboard-auth-card");
    const memberContent = get("dashboard-member-content");
    const userBadge = document.querySelector(".dashboard-user-badge");
    const logoutBtn = get("logout-button");

    if (!user || !user.emailVerified) {
      currentUser = null;
      if (authCard) authCard.classList.remove("is-hidden");
      if (memberContent) memberContent.classList.add("is-hidden-auth");
      if (userBadge) userBadge.classList.add("is-hidden");
      if (logoutBtn) logoutBtn.classList.add("is-hidden");
      return;
    }

    if (authCard) authCard.classList.add("is-hidden");
    if (memberContent) memberContent.classList.remove("is-hidden-auth");
    if (userBadge) userBadge.classList.remove("is-hidden");
    if (logoutBtn) logoutBtn.classList.remove("is-hidden");`;

preparedDashJs = preparedDashJs.replace(targetAuthCheck, replacementAuthCheck);

// Modify logout button so it signs out and stays inside the SPA
const targetLogout = `get("logout-button")?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.replace("user-login.html");
});`;

const replacementLogout = `get("logout-button")?.addEventListener("click", async () => {
  await signOut(auth);
  if (typeof window.showView === "function") {
    window.showView("home");
  } else {
    window.location.hash = "#home";
  }
});`;

preparedDashJs = preparedDashJs.replace(targetLogout, replacementLogout);

const dashboardJs = `
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getDatabase, onValue, push, ref, remove, set, update, get as fbGet } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

// Firebase Client Setup
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
const auth = getAuth(app);
const database = getDatabase(app);
const devHosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
const isDevelopmentMode =
  devHosts.includes(window.location.hostname) ||
  window.location.hostname.endsWith(".devtunnels.ms") ||
  window.location.hostname.endsWith(".github.dev") ||
  window.location.hostname.endsWith(".gitpod.io") ||
  window.location.hostname.endsWith(".ngrok-free.app") ||
  window.location.hostname.endsWith(".ngrok.io") ||
  window.location.hostname.endsWith(".loca.lt") ||
  window.location.hostname.endsWith(".preview.app") ||
  new URLSearchParams(window.location.search).get("dev") === "1";

${preparedDashJs}

// Google Sign-in Handler for Dashboard Auth Card
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
document.getElementById("dashboard-google-login-btn")?.addEventListener("click", async () => {
  const msgEl = document.getElementById("dashboard-login-msg");
  if (msgEl) {
    msgEl.textContent = "Connecting to Google...";
    msgEl.classList.remove("error");
  }
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    if (msgEl) {
      msgEl.textContent = err?.message || "Google sign-in could not be completed.";
      msgEl.classList.add("error");
    }
  }
});
`;

// Navigation / Router JS
const routerJs = `
function showView(viewName) {
  const homeView = document.getElementById("view-home");
  const dashView = document.getElementById("view-dashboard");
  if (!homeView || !dashView) return;

  if (viewName === "dashboard") {
    homeView.classList.add("is-hidden");
    dashView.classList.remove("is-hidden");
    document.body.classList.add("dashboard-page");
    if (window.location.hash !== "#dashboard") {
      window.location.hash = "#dashboard";
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    dashView.classList.add("is-hidden");
    homeView.classList.remove("is-hidden");
    document.body.classList.remove("dashboard-page");
    if (window.location.hash === "#dashboard") {
      history.pushState("", document.title, window.location.pathname + window.location.search);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}
window.showView = showView;

window.addEventListener("hashchange", () => {
  if (window.location.hash === "#dashboard") {
    showView("dashboard");
  } else {
    showView("home");
  }
});

// Intercept navigation links between home & dashboard inside the bundle
document.addEventListener("click", (e) => {
  const target = e.target.closest("a, button");
  if (!target) return;
  const href = target.getAttribute("href") || "";

  if (target.id === "account-link" || target.id === "subscription-account-link" || href === "#dashboard" || href === "user-dashboard.html" || href.includes("#dashboard")) {
    e.preventDefault();
    showView("dashboard");
  } else if (target.classList.contains("dashboard-home-link") || target.classList.contains("dashboard-nav-home") || (target.closest(".dashboard-header") && target.classList.contains("logo")) || href === "#home" || href === "index.html" || href.includes("#home")) {
    e.preventDefault();
    showView("home");
  }
});

// Initial Route Check
const initialParams = new URLSearchParams(window.location.search);
if (window.location.hash === "#dashboard" || initialParams.get("view") === "dashboard" || initialParams.get("preview") === "1") {
  showView("dashboard");
} else {
  showView("home");
}

// Loader dismissal
window.addEventListener("load", function() {
  const loader = document.getElementById("page-loader");
  if (loader) {
    setTimeout(function() { loader.classList.add("loader-hidden"); }, 1400);
  }
});
`;

const bundleHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Subscribe to Manali Strays | Silly Sensei</title>
  <meta name="description" content="Subscribe to support Manali Strays and track your support online." />
  <link rel="icon" href="https://cleanindiadrive.github.io/icons/favicon.svg" type="image/svg+xml" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;900&display=swap" rel="stylesheet" />
  <link rel="preload" as="image" href="https://cleanindiadrive.github.io/assets/trees-texture.webp" type="image/webp" fetchpriority="high" />

  <style>
${siteCss}

  /* Bundle SPA Views */
  .page-view {
    width: 100%;
    transition: opacity 0.25s ease;
  }
  .page-view.is-hidden {
    display: none !important;
  }
  .is-hidden-auth {
    display: none !important;
  }
  </style>
</head>
<body>
  ${loaderMarkup}

  <!-- View 1: Homepage -->
  <div id="view-home" class="page-view">
    ${homeBody}
  </div>

  <!-- View 2: User Dashboard -->
  <div id="view-dashboard" class="page-view is-hidden">
    ${dashBody}
  </div>

  <!-- Razorpay Checkout SDK -->
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>

  <!-- Router Script -->
  <script>
${routerJs}
  </script>

  <!-- Homepage Logic Module -->
  <script type="module" id="home-module">
${homeJs}
  </script>

  <!-- Dashboard Logic Module -->
  <script type="module" id="dashboard-module">
${dashboardJs}
  </script>
</body>
</html>
`;

fs.writeFileSync('bundle.html', bundleHtml, 'utf8');
fs.writeFileSync('odoo-bundle.html', bundleHtml, 'utf8');
fs.writeFileSync('temp-home-check.mjs', homeJs, 'utf8');
fs.writeFileSync('temp-dash-check.mjs', dashboardJs, 'utf8');

console.log('Successfully generated bundle.html and odoo-bundle.html!');
