
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





const subscriberCount = document.getElementById("subscriber-count");
const moneyRaised = document.getElementById("money-raised");
const donorTotal = document.getElementById("donor-total");
const donorList = document.getElementById("donor-list");
const accountLink = document.getElementById("account-link");
const sourceData = new Map();
const subscriberSources = ["subscribers", "subscribers_velcrow", "users", "payments", "testPayments"];
let currentUser = null;
let currentUserPhone = "";
const BACKEND_URL = window.BACKEND_API_URL || "https://69rnsfw9-3000.inc1.devtunnels.ms";
let currentSubscription = null;
let currentUserPaymentRecords = [];
let monthlyRequestPending = false;
let detachMonthlyIntentListener = null;
let giftRecipients = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getRecordStatus(record) {
  if (!record || typeof record !== "object") return "unknown";
  if (record.isCancellation || record.type === "cancellation" || record.cancelledAt || record.endedAt) {
    return "cancelled";
  }
  const status = String(record.subscriptionStatus || record.status || "").trim().toLowerCase();
  if (["active", "authenticated"].includes(status)) return "active";
  if (["paused", "cancelled", "pending"].includes(status)) return status;
  return "unknown";
}

const confirmedPaymentStatuses = new Set(["paid", "completed", "success", "active"]);

function isConfirmedPaymentRecord(record) {
  if (!record || typeof record !== "object") return false;
  const status = String(record.status || record.subscriptionStatus || "").trim().toLowerCase();
  return confirmedPaymentStatuses.has(status);
}

function getActiveSubscribers() {
  const userSubs = new Map();

  // ONLY check actual subscription registries: subscribers (and subscribers_velcrow)
  ["subscribers", "subscribers_velcrow"].forEach((source) => {
    const data = sourceData.get(source);
    if (!data || typeof data !== "object") return;
    Object.entries(data).forEach(([id, record]) => {
      if (!record || typeof record !== "object") return;

      const email = String(record?.email || "").trim().toLowerCase();
      const phone = cleanIndianPhone(record?.phone);
      const userKey = (phone && phone.length === 10) ? phone : (email || `${source}:${id}`);

      const status = getRecordStatus(record);
      const timestamp = Number(record.updatedAt || record.cancelledAt || record.lastPaymentAt || record.subscribedAt || record.createdAt || 0);

      if (!userSubs.has(userKey)) {
        userSubs.set(userKey, []);
      }
      userSubs.get(userKey).push({
        id,
        source,
        name: String(record?.name || record?.donorName || "").trim(),
        anonymous: record?.anonymous === true,
        status,
        timestamp,
      });
    });
  });

  const activeSubscribers = new Map();

  // For each distinct subscriber, inspect their latest status
  userSubs.forEach((records, userKey) => {
    records.sort((a, b) => b.timestamp - a.timestamp);
    const latest = records[0];

    // Count strictly if they currently have an active subscription
    if (latest && latest.status === "active") {
      activeSubscribers.set(userKey, {
        name: latest.name,
        anonymous: latest.anonymous,
      });
    }
  });

  return activeSubscribers;
}

function calculateTotalRaised() {
  let total = 0;
  const processedPaymentKeys = new Set();
  const processedSubscribers = new Set();

  // 1. Process all payment transactions (payments & testPayments)
  const paymentSources = ["payments"];
  if (isDevelopmentMode || sourceData.has("testPayments")) {
    paymentSources.push("testPayments");
  }

  paymentSources.forEach((source) => {
    const data = sourceData.get(source);
    if (!data || typeof data !== "object") return;

    Object.entries(data).forEach(([uidOrId, recordOrGroup]) => {
      if (!recordOrGroup || typeof recordOrGroup !== "object") return;

      // Handle flat structure (e.g. testPayments/{id} or direct payment record)
      if (recordOrGroup.amount !== undefined && isConfirmedPaymentRecord(recordOrGroup)) {
        const key = `${source}/${uidOrId}`;
        if (!processedPaymentKeys.has(key)) {
          processedPaymentKeys.add(key);
          total += Number(recordOrGroup.amount) || 0;
          if (recordOrGroup.subscriptionId) {
            processedSubscribers.add(recordOrGroup.subscriptionId);
          }
        }
        return;
      }

      // Handle nested UID structure (e.g. payments/{uid}/{paymentId})
      Object.entries(recordOrGroup).forEach(([payId, record]) => {
        if (!record || typeof record !== "object") return;
        if (isConfirmedPaymentRecord(record)) {
          const key = `${source}/${uidOrId}/${payId}`;
          if (!processedPaymentKeys.has(key)) {
            processedPaymentKeys.add(key);
            total += Number(record.amount) || 0;
            if (record.subscriptionId) {
              processedSubscribers.add(record.subscriptionId);
            }
          }
        }
      });
    });
  });

  // 2. Also include subscribers from "subscribers" and "subscribers_velcrow"
  // For subscribers whose payments are not individually recorded in payments table
  ["subscribers", "subscribers_velcrow"].forEach((source) => {
    const data = sourceData.get(source);
    if (!data || typeof data !== "object") return;
    Object.entries(data).forEach(([id, record]) => {
      if (!record || typeof record !== "object") return;
      if (getRecordStatus(record) !== "active") return;
      if (!processedSubscribers.has(id)) {
        const amt = Number(record.amount) || 100;
        total += amt;
      }
    });
  });

  return total;
}

function getActiveDonors() {
  const donors = new Map();

  // Active subscribers
  ["subscribers", "subscribers_velcrow"].forEach((source) => {
    const data = sourceData.get(source);
    if (!data || typeof data !== "object") return;
    Object.entries(data).forEach(([id, record]) => {
      if (getRecordStatus(record) !== "active") return;
      const email = String(record?.email || "").trim().toLowerCase();
      const key = email || `${source}:${id}`;
      if (!donors.has(key)) donors.set(key, {
        name: String(record?.name || "").trim(),
        anonymous: record?.anonymous === true,
      });
    });
  });

  // Also include confirmed one-time & gift supporters
  const paymentSources = ["payments"];
  if (isDevelopmentMode || sourceData.has("testPayments")) {
    paymentSources.push("testPayments");
  }

  paymentSources.forEach((source) => {
    const data = sourceData.get(source);
    if (!data || typeof data !== "object") return;

    const processDonorRecord = (record, id) => {
      if (!record || typeof record !== "object") return;
      if (!isConfirmedPaymentRecord(record)) return;
      const name = String(record?.name || record?.donorName || record?.recipientName || record?.email?.split?.("@")?.[0] || "").trim();
      if (!name) return;
      const email = String(record?.email || "").trim().toLowerCase();
      const key = email || `${source}:${id}`;
      if (!donors.has(key)) {
        donors.set(key, {
          name,
          anonymous: record?.anonymous === true,
        });
      }
    };

    Object.entries(data).forEach(([uidOrId, recordOrGroup]) => {
      if (!recordOrGroup || typeof recordOrGroup !== "object") return;
      if (recordOrGroup.amount !== undefined) {
        processDonorRecord(recordOrGroup, uidOrId);
      } else {
        Object.entries(recordOrGroup).forEach(([payId, record]) => {
          processDonorRecord(record, payId);
        });
      }
    });
  });

  return donors;
}

function formatPublicDonorName(name, anonymous = false) {
  if (anonymous) return "Anonymous supporter";
  const cleaned = String(name || "").trim();
  if (!cleaned || /^(anonymous|anon|private|supporter)$/i.test(cleaned)) return "Anonymous supporter";
  return cleaned;
}

function renderPublicTotals() {
  const activeSubs = getActiveSubscribers().size;
  if (subscriberCount) subscriberCount.textContent = `${activeSubs} active subscribers`;

  const total = calculateTotalRaised();
  if (moneyRaised) {
    moneyRaised.textContent = total.toLocaleString("en-IN");
  }
}

function renderDonors() {
  const donors = [...getActiveDonors().values()]
    .map((donor) => {
      const label = formatPublicDonorName(donor.name, donor.anonymous);
      const isAnon = donor.anonymous || label === "Anonymous supporter";
      const avatar = isAnon ? "•" : (label.charAt(0) || "•").toUpperCase();
      return { label, avatar };
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  if (donorTotal) donorTotal.textContent = String(donors.length);
  if (!donorList) return;

  if (!donors.length) {
    donorList.innerHTML = '<span class="donor-placeholder">No donor names available yet.</span>';
    return;
  }

  donorList.innerHTML = donors.map((donor) => `<span class="donor-name"><b aria-hidden="true">${escapeHtml(donor.avatar)}</b><span>${escapeHtml(donor.label)}</span></span>`).join("");
}

function cleanIndianPhone(val) {
  if (!val) return "";
  let digits = String(val).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 13 && digits.startsWith("091")) digits = digits.slice(3);
  return digits;
}

function isValidIndianPhone(val) {
  const digits = cleanIndianPhone(val);
  return digits.length === 10 && /^[6-9]\d{9}$/.test(digits);
}

function formatIndianPhone(val) {
  const digits = cleanIndianPhone(val);
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return val || "";
}

let selectedGiftRecipient = null;
let activeGiftResults = [];
let focusedResultIndex = -1;

function highlightMatch(text, query) {
  if (!text) return "";
  const str = String(text);
  const q = String(query || "").trim();
  if (!q) return escapeHtml(str);

  const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  const parts = str.split(regex);

  return parts.map((part) => {
    if (part.toLowerCase() === q.toLowerCase()) {
      return `<mark>${escapeHtml(part)}</mark>`;
    }
    return escapeHtml(part);
  }).join("");
}

function getAllPotentialGiftRecipients() {
  const recipients = [];
  const seen = new Set();

  sourceData.forEach((data, source) => {
    if (!data || typeof data !== "object") return;
    Object.entries(data).forEach(([id, record]) => {
      const rawPhone = String(record?.phone || "").trim();
      const cleanPhone = cleanIndianPhone(rawPhone);
      if (!cleanPhone || cleanPhone.length < 5) return;

      const name = String(record?.fullName || record?.name || "").trim() || "Anonymous supporter";
      const email = String(record?.email || "").trim().toLowerCase();
      const dedupeKey = cleanPhone.length === 10 ? cleanPhone : (email || `${source}:${id}`);
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      const team = "Supporter";

      recipients.push({
        id,
        source,
        name,
        phone: cleanPhone,
        displayPhone: formatIndianPhone(cleanPhone),
        email,
        team,
      });
    });
  });

  return recipients;
}

function searchGiftRecipients(query) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return [];

  const rawDigits = trimmed.replace(/\D/g, "");
  const lowerText = trimmed.toLowerCase();
  const allRecipients = getAllPotentialGiftRecipients();

  return allRecipients.filter((r) => {
    const matchesPhone = rawDigits.length > 0 && r.phone.includes(rawDigits);
    const matchesName = r.name.toLowerCase().includes(lowerText);
    return matchesPhone || matchesName;
  }).sort((a, b) => {
    if (rawDigits.length > 0) {
      const aStarts = a.phone.startsWith(rawDigits);
      const bStarts = b.phone.startsWith(rawDigits);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
    }
    const aNameStarts = a.name.toLowerCase().startsWith(lowerText);
    const bNameStarts = b.name.toLowerCase().startsWith(lowerText);
    if (aNameStarts && !bNameStarts) return -1;
    if (!aNameStarts && bNameStarts) return 1;
    return a.name.localeCompare(b.name);
  });
}

function renderGiftSearchResults(query) {
  const resultsContainer = document.getElementById("gift-search-results");
  const clearBtn = document.getElementById("gift-search-clear");
  if (!resultsContainer) return;

  const trimmed = String(query || "").trim();
  if (!trimmed) {
    resultsContainer.innerHTML = "";
    resultsContainer.classList.add("is-hidden");
    clearBtn?.classList.add("is-hidden");
    activeGiftResults = [];
    focusedResultIndex = -1;
    return;
  }

  clearBtn?.classList.remove("is-hidden");
  const matches = searchGiftRecipients(trimmed);
  activeGiftResults = matches;
  focusedResultIndex = -1;

  if (matches.length === 0) {
    resultsContainer.innerHTML = `
      <div class="gift-search-empty">
        <strong>No supporters found</strong>
        <span>No registered supporter matches "${escapeHtml(trimmed)}". Try searching another number or name.</span>
      </div>
    `;
    resultsContainer.classList.remove("is-hidden");
    return;
  }

  const rawDigits = trimmed.replace(/\D/g, "");
  resultsContainer.innerHTML = matches.map((m, idx) => `
    <button type="button" class="gift-result-item" data-index="${idx}" role="option" aria-selected="false">
      <div class="gift-result-avatar">${escapeHtml((m.name[0] || "S").toUpperCase())}</div>
      <div class="gift-result-details">
        <span class="gift-result-name">${highlightMatch(m.name, trimmed)}</span>
        <span class="gift-result-phone">${highlightMatch(m.displayPhone, rawDigits)}</span>
      </div>
      <span class="gift-result-badge">Supporter</span>
    </button>
  `).join("");

  resultsContainer.classList.remove("is-hidden");
}

function selectGiftRecipient(recipient) {
  if (!recipient) return;
  selectedGiftRecipient = recipient;

  const selectedCard = document.getElementById("gift-selected-card");
  const searchInputBox = document.querySelector(".gift-search-input-box");
  const resultsContainer = document.getElementById("gift-search-results");
  const avatarEl = document.getElementById("gift-selected-avatar");
  const nameEl = document.getElementById("gift-selected-name");
  const phoneEl = document.getElementById("gift-selected-phone");
  const recipientSelect = document.getElementById("gift-recipient");
  const giftSubmitBtn = document.getElementById("gift-submit");

  if (avatarEl) avatarEl.textContent = (recipient.name[0] || "S").toUpperCase();
  if (nameEl) nameEl.textContent = recipient.name;
  if (phoneEl) phoneEl.textContent = recipient.displayPhone;

  selectedCard?.classList.remove("is-hidden");
  searchInputBox?.classList.add("is-hidden");
  resultsContainer?.classList.add("is-hidden");

  if (recipientSelect) {
    recipientSelect.innerHTML = `<option value="${escapeHtml(recipient.phone)}" selected>${escapeHtml(recipient.name)}</option>`;
  }

  if (giftSubmitBtn) {
    setPosButtonDisabled(giftSubmitBtn, false);
  }
  setModeMessage("gift-message", "");
}

function clearGiftSelection() {
  selectedGiftRecipient = null;
  const selectedCard = document.getElementById("gift-selected-card");
  const searchInputBox = document.querySelector(".gift-search-input-box");
  const searchInput = document.getElementById("gift-search-input");
  const clearBtn = document.getElementById("gift-search-clear");
  const resultsContainer = document.getElementById("gift-search-results");
  const recipientSelect = document.getElementById("gift-recipient");
  const giftSubmitBtn = document.getElementById("gift-submit");

  selectedCard?.classList.add("is-hidden");
  searchInputBox?.classList.remove("is-hidden");
  if (searchInput) searchInput.value = "";
  clearBtn?.classList.add("is-hidden");
  if (resultsContainer) {
    resultsContainer.innerHTML = "";
    resultsContainer.classList.add("is-hidden");
  }
  if (recipientSelect) {
    recipientSelect.innerHTML = '<option value="">No recipient selected</option>';
  }
  if (giftSubmitBtn) {
    setPosButtonDisabled(giftSubmitBtn, true);
  }
  searchInput?.focus();
}

function setModeMessage(id, message, isError = false) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function setMode(mode) {
  const validModes = ["monthly", "one-time", "gift"];
  const selectedMode = validModes.includes(mode) ? mode : "monthly";
  document.querySelectorAll(".mode-tab").forEach((tab) => {
    const active = tab.dataset.mode === selectedMode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  validModes.forEach((name) => {
    document.getElementById(`${name}-mode`)?.classList.toggle("is-hidden", name !== selectedMode);
  });
}

function findSubscriptionForUser(email) {
  if (!email) return null;
  const normalizedEmail = email.trim().toLowerCase();
  const matches = [];

  // ONLY check actual subscription nodes, NEVER raw payments/charges!
  for (const path of ["subscribers", "subscribers_velcrow"]) {
    const data = sourceData.get(path);
    if (!data || typeof data !== "object") continue;
    for (const [id, record] of Object.entries(data)) {
      if (!record || typeof record !== "object") continue;
      if (String(record.email || "").trim().toLowerCase() !== normalizedEmail) continue;
      const status = getRecordStatus(record);
      if (status === "unknown") continue;
      matches.push({
        id,
        path,
        ...record,
        status,
        timestamp: Number(record.updatedAt || record.cancelledAt || record.lastPaymentAt || record.subscribedAt || record.createdAt || 0),
      });
    }
  }

  if (matches.length) {
    const priority = { active: 0, paused: 1, pending: 2, cancelled: 3 };
    return matches.sort((a, b) => {
      const pDiff = (priority[a.status] ?? 4) - (priority[b.status] ?? 4);
      if (pDiff !== 0) return pDiff;
      return b.timestamp - a.timestamp;
    })[0];
  }

  return null;
}

function isAnonymousDonationSelected() {
  return document.getElementById("anonymous-donation")?.checked === true;
}

let selectedMonthlyAmount = 100;

function updateSelectedMonthlyPlan(amount) {
  selectedMonthlyAmount = Number(amount) || 100;

  const heroAmount = document.getElementById("hero-btn-amount");
  if (heroAmount) heroAmount.textContent = `₹${selectedMonthlyAmount.toLocaleString("en-IN")} Per Month`;

  const planLabel = document.getElementById("monthly-plan-label");
  if (planLabel) planLabel.textContent = `Monthly subscription · ₹${selectedMonthlyAmount.toLocaleString("en-IN")} / mo`;

  const radio = document.getElementById(`plan-tab-${selectedMonthlyAmount}`);
  if (radio) radio.checked = true;

  refreshSubscriptionMode();
}

function playPosTransactionAnimation(container, onComplete, reverse = false) {
  if (!container) {
    if (typeof onComplete === "function") onComplete();
    return;
  }
  if (container.classList.contains("is-animating") || container.classList.contains("is-animating-reverse")) {
    return;
  }
  container.classList.remove("is-animating", "is-animating-reverse");
  const card = container.querySelector(".card");
  const post = container.querySelector(".post");
  const dollar = container.querySelector(".dollar");
  if (card) card.style.animation = "none";
  if (post) post.style.animation = "none";
  if (dollar) dollar.style.animation = "none";
  void container.offsetWidth; // force reflow
  if (card) card.style.animation = "";
  if (post) post.style.animation = "";
  if (dollar) dollar.style.animation = "";

  const animClass = reverse ? "is-animating-reverse" : "is-animating";
  container.classList.add(animClass);
  setTimeout(() => {
    container.classList.remove("is-animating", "is-animating-reverse");
    if (typeof onComplete === "function") {
      onComplete();
    }
  }, 2100);
}

function setPosButtonDisabled(button, isDisabled) {
  if (!button) return;
  button.classList.toggle("is-disabled", Boolean(isDisabled));
  button.setAttribute("aria-disabled", String(Boolean(isDisabled)));
  if (button.tagName === "BUTTON") {
    button.disabled = Boolean(isDisabled);
  }
}

function isPosButtonDisabled(button) {
  if (!button) return true;
  return button.classList.contains("is-disabled") || button.getAttribute("aria-disabled") === "true" || button.disabled === true;
}

function setPosButtonText(button, text) {
  if (!button) return;
  const label = button.querySelector(".new") || button;
  label.textContent = text;
}

function getPosButtonText(button) {
  if (!button) return "";
  const label = button.querySelector(".new") || button;
  return label.textContent.trim();
}

function refreshSubscriptionMode() {
  const status = document.getElementById("subscription-mode-status");
  const button = document.getElementById("subscription-toggle");
  const accountAction = document.getElementById("subscription-account-link");
  const planLabel = document.getElementById("monthly-plan-label");
  if (planLabel) {
    planLabel.textContent = `Monthly subscription · ₹${selectedMonthlyAmount.toLocaleString("en-IN")} / mo`;
  }
  if (!status || !button) return;

  currentSubscription = currentUser ? findSubscriptionForUser(String(currentUser.email || "").trim().toLowerCase()) : null;
  if (!currentUser) {
    status.textContent = `Ready to start ₹${selectedMonthlyAmount.toLocaleString("en-IN")} per month support.`;
    setPosButtonText(button, "Subscribe");
    setPosButtonDisabled(button, false);
    accountAction?.classList.add("is-hidden");
    return;
  }

  if (!currentSubscription) {
    status.textContent = monthlyRequestPending
      ? "Your subscription request is pending payment confirmation."
      : `Ready to start ₹${selectedMonthlyAmount.toLocaleString("en-IN")} per month support.`;
    setPosButtonText(button, monthlyRequestPending ? "Payment pending" : "Subscribe");
    setPosButtonDisabled(button, monthlyRequestPending);
    accountAction?.classList.add("is-hidden");
    return;
  }

  if (currentSubscription.status === "cancelled") {
    status.textContent = monthlyRequestPending
      ? "Your new subscription request is pending payment confirmation."
      : `Ready to start ₹${selectedMonthlyAmount.toLocaleString("en-IN")}/mo support.`;
    setPosButtonText(button, monthlyRequestPending ? "Payment pending" : "Subscribe");
    setPosButtonDisabled(button, monthlyRequestPending);
    accountAction?.classList.remove("is-hidden");
    return;
  }

  const paused = currentSubscription.status === "paused";
  if (paused) {
    status.textContent = "Your subscription is paused. Click Resume to reactivate it.";
    setPosButtonText(button, "Resume");
    setPosButtonDisabled(button, false);
    accountAction?.classList.remove("is-hidden");
    return;
  }

  const currentSubAmount = Number(currentSubscription.amount) || 100;
  if (selectedMonthlyAmount === currentSubAmount) {
    status.textContent = `Active subscription · ₹${currentSubAmount.toLocaleString("en-IN")}/mo. Click Subscribe to renew or add a contribution.`;
  } else {
    status.textContent = `Current plan: ₹${currentSubAmount.toLocaleString("en-IN")}/mo. Switch or start ₹${selectedMonthlyAmount.toLocaleString("en-IN")}/mo below.`;
  }
  setPosButtonText(button, "Subscribe");
  setPosButtonDisabled(button, false);
  accountAction?.classList.remove("is-hidden");
}

let selectedGiftAmount = 100;

async function toggleSubscription(event) {
  event?.preventDefault?.();
  const button = document.getElementById("subscription-toggle");
  const status = document.getElementById("subscription-mode-status");
  if (!button || !status || isPosButtonDisabled(button)) return;

  if (currentSubscription && currentSubscription.status === "paused") {
    playPosTransactionAnimation(button, async () => {
      setPosButtonDisabled(button, true);
      try {
        const subId = String(currentSubscription.subscriptionId || currentSubscription.id || "").trim();
        if (subId.startsWith("sub_")) {
          await fetch(`${BACKEND_URL}/resume-subscription`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription_id: subId }),
          });
        }
        await update(ref(database, `${currentSubscription.path}/${currentSubscription.id}`), {
          subscriptionStatus: "active",
          status: "active",
          resumedAt: Date.now(),
        });
        currentSubscription.status = "active";
        status.textContent = "Your monthly subscription is active.";
      } catch (error) {
        console.error("Unable to resume subscription:", error);
        status.textContent = "Could not resume your subscription. Please try again.";
        setPosButtonDisabled(button, false);
        return;
      }
      refreshSubscriptionMode();
    }, false);
    return;
  }

  if (monthlyRequestPending) return;
  playPosTransactionAnimation(button, async () => {
    setPosButtonDisabled(button, true);
    status.textContent = "Connecting to payment gateway…";
    try {
      const res = await fetch(`${BACKEND_URL}/create-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: selectedMonthlyAmount,
          user_id: currentUser ? currentUser.uid : "",
          email: currentUser?.email || "",
          name: currentUser?.displayName || "",
          phone: currentUserPhone || "",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.subscription_id) {
        throw new Error(data?.error || "Subscription creation failed");
      }

      const options = {
        key: data.razorpay_key,
        subscription_id: data.subscription_id,
        name: "Manali Strays",
        description: `₹${selectedMonthlyAmount.toLocaleString("en-IN")} Monthly Support`,
        image: "https://cleanindiadrive.github.io/Group%201.png",
        prefill: {
          name: currentUser?.displayName || "",
          email: currentUser?.email || "",
          contact: currentUserPhone || "",
        },
        theme: { color: "#FFDD00" },
        handler: function (response) {
          console.log("Subscription mandate created:", response);
          status.textContent = "Mandate setup complete! Your recurring support is active. Thank you!";
          setPosButtonText(button, "Active subscription");
          setPosButtonDisabled(button, true);
          refreshSubscriptionMode();
        },
        modal: {
          ondismiss: function () {
            setPosButtonDisabled(button, false);
            status.textContent = "Payment window closed.";
          },
        },
      };

      if (typeof window.Razorpay === "function") {
        const rzp = new window.Razorpay(options);
        rzp.on("payment.failed", function (resp) {
          console.error("Subscription payment failed:", resp.error);
          status.textContent = `Payment failed: ${resp.error.description || resp.error.reason || "Please try again."}`;
          setPosButtonDisabled(button, false);
        });
        rzp.open();
      } else {
        throw new Error("Razorpay SDK is not loaded. Please refresh.");
      }
    } catch (error) {
      console.error("Unable to start subscription:", error);
      status.textContent = error.message || "Could not start the subscription. Please try again.";
      setPosButtonDisabled(button, false);
    }
  });
}

async function saveOneTimeIntent(event) {
  event?.preventDefault?.();
  const amountInput = document.getElementById("one-time-amount");
  const button = document.getElementById("one-time-submit");
  const amount = Number(amountInput?.value);
  if (!Number.isFinite(amount) || amount < 1 || amount > 1000000) {
    setModeMessage("one-time-message", "Enter an amount between ₹1 and ₹10,00,000.", true);
    return;
  }
  if (isPosButtonDisabled(button)) return;

  playPosTransactionAnimation(button, async () => {
    setPosButtonDisabled(button, true);
    setModeMessage("one-time-message", "Creating one-time payment order…");
    try {
      const res = await fetch(`${BACKEND_URL}/create-one-time-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          name: currentUser?.displayName || "",
          email: currentUser?.email || "",
          phone: currentUserPhone || "",
          user_id: currentUser ? currentUser.uid : "",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.order_id) {
        throw new Error(data?.error || "Payment order creation failed");
      }

      const options = {
        key: data.razorpay_key,
        amount: data.amount,
        currency: data.currency || "INR",
        order_id: data.order_id,
        name: "Manali Strays",
        description: `₹${amount.toLocaleString("en-IN")} One-time Donation`,
        image: "https://cleanindiadrive.github.io/Group%201.png",
        prefill: {
          name: currentUser?.displayName || "",
          email: currentUser?.email || "",
          contact: currentUserPhone || "",
        },
        theme: { color: "#FFDD00" },
        handler: function (response) {
          console.log("One-time payment completed:", response);
          setModeMessage("one-time-message", `Payment of ₹${amount.toLocaleString("en-IN")} received! Thank you for your generous contribution.`);
        },
        modal: {
          ondismiss: function () {
            setPosButtonDisabled(button, false);
            setModeMessage("one-time-message", "Payment window closed.");
          },
        },
      };

      if (typeof window.Razorpay === "function") {
        const rzp = new window.Razorpay(options);
        rzp.on("payment.failed", function (resp) {
          console.error("One-time payment failed:", resp.error);
          setModeMessage("one-time-message", `Payment failed: ${resp.error.description || "Please try again."}`, true);
          setPosButtonDisabled(button, false);
        });
        rzp.open();
      } else {
        throw new Error("Razorpay SDK is not loaded. Please refresh.");
      }
    } catch (error) {
      console.error("Unable to start one-time payment:", error);
      setModeMessage("one-time-message", error.message || "Could not process payment. Please try again.", true);
    } finally {
      setPosButtonDisabled(button, false);
    }
  });
}

async function saveGiftIntent(event) {
  event?.preventDefault?.();
  const button = document.getElementById("gift-submit");
  const recipient = selectedGiftRecipient;
  if (!recipient) {
    setModeMessage("gift-message", "Please search and select a supporter first.", true);
    return;
  }
  if (isPosButtonDisabled(button)) return;

  playPosTransactionAnimation(button, async () => {
    setPosButtonDisabled(button, true);
    setModeMessage("gift-message", `Setting up ₹${selectedGiftAmount.toLocaleString("en-IN")}/mo gift subscription for ${recipient.name}…`);
    try {
      const res = await fetch(`${BACKEND_URL}/create-gift-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: selectedGiftAmount,
          recipient_name: recipient.name,
          recipient_email: recipient.email || `${recipient.phone}@gift.manalistrays.org`,
          recipient_phone: recipient.phone,
          giver_id: currentUser ? currentUser.uid : "",
          giver_email: currentUser?.email || "",
          giver_name: currentUser?.displayName || "",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.subscription_id) {
        throw new Error(data?.error || "Gift subscription creation failed");
      }

      const options = {
        key: data.razorpay_key,
        subscription_id: data.subscription_id,
        name: "Manali Strays",
        description: `Gift ₹${selectedGiftAmount.toLocaleString("en-IN")}/mo subscription for ${recipient.name}`,
        image: "https://cleanindiadrive.github.io/Group%201.png",
        prefill: {
          name: currentUser?.displayName || "",
          email: currentUser?.email || "",
          contact: currentUserPhone || "",
        },
        theme: { color: "#FFDD00" },
        handler: function (response) {
          console.log("Gift subscription mandate created:", response);
          setModeMessage("gift-message", `Gift subscription for ${recipient.name} activated! Thank you for gifting hope.`);
        },
        modal: {
          ondismiss: function () {
            setPosButtonDisabled(button, false);
            setModeMessage("gift-message", "Payment window closed.");
          },
        },
      };

      if (typeof window.Razorpay === "function") {
        const rzp = new window.Razorpay(options);
        rzp.on("payment.failed", function (resp) {
          console.error("Gift subscription payment failed:", resp.error);
          setModeMessage("gift-message", `Payment failed: ${resp.error.description || "Please try again."}`, true);
          setPosButtonDisabled(button, false);
        });
        rzp.open();
      } else {
        throw new Error("Razorpay SDK is not loaded. Please refresh.");
      }
    } catch (error) {
      console.error("Unable to set up gift subscription:", error);
      setModeMessage("gift-message", error.message || "Could not set up gift subscription. Please try again.", true);
    } finally {
      setPosButtonDisabled(button, false);
    }
  });
}

document.querySelectorAll('input[name="gift-autopay-tier"]').forEach((input) => {
  input.addEventListener("change", (e) => {
    selectedGiftAmount = Number(e.target.value) || 100;
    const planLabel = document.getElementById("gift-plan-label");
    if (planLabel) {
      planLabel.textContent = `Gift a subscription · ₹${selectedGiftAmount.toLocaleString("en-IN")} / mo`;
    }
  });
});

const heroSubscribeBtn = document.getElementById("subscribe-btn");
heroSubscribeBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  const subBtn = document.getElementById("subscription-toggle");
  if (subBtn) {
    subBtn.click();
  }
});

document.querySelectorAll(".mode-tab").forEach((tab) => {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
});

const subToggleBtn = document.getElementById("subscription-toggle");
const oneTimeSubmitBtn = document.getElementById("one-time-submit");
const giftSubmitBtn = document.getElementById("gift-submit");

subToggleBtn?.addEventListener("click", toggleSubscription);
oneTimeSubmitBtn?.addEventListener("click", saveOneTimeIntent);
giftSubmitBtn?.addEventListener("click", saveGiftIntent);

[subToggleBtn, oneTimeSubmitBtn, giftSubmitBtn].forEach((btn) => {
  btn?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      btn.click();
    }
  });
});

const giftSearchInput = document.getElementById("gift-search-input") || document.getElementById("gift-phone");
const giftSearchClear = document.getElementById("gift-search-clear");
const giftSearchResults = document.getElementById("gift-search-results");
const giftChangeBtn = document.getElementById("gift-change-btn");

giftSearchInput?.addEventListener("input", (e) => {
  renderGiftSearchResults(e.target.value);
});

giftSearchInput?.addEventListener("focus", (e) => {
  if (e.target.value.trim() && !selectedGiftRecipient) {
    renderGiftSearchResults(e.target.value);
  }
});

giftSearchInput?.addEventListener("keydown", (e) => {
  if (!activeGiftResults.length) return;
  const items = giftSearchResults?.querySelectorAll(".gift-result-item");
  if (!items || !items.length) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    focusedResultIndex = (focusedResultIndex + 1) % items.length;
    items.forEach((item, idx) => item.classList.toggle("is-focused", idx === focusedResultIndex));
    items[focusedResultIndex]?.scrollIntoView({ block: "nearest" });
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    focusedResultIndex = (focusedResultIndex - 1 + items.length) % items.length;
    items.forEach((item, idx) => item.classList.toggle("is-focused", idx === focusedResultIndex));
    items[focusedResultIndex]?.scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (focusedResultIndex >= 0 && activeGiftResults[focusedResultIndex]) {
      selectGiftRecipient(activeGiftResults[focusedResultIndex]);
    } else if (activeGiftResults[0]) {
      selectGiftRecipient(activeGiftResults[0]);
    }
  } else if (e.key === "Escape") {
    giftSearchResults?.classList.add("is-hidden");
  }
});

giftSearchClear?.addEventListener("click", () => {
  if (giftSearchInput) {
    giftSearchInput.value = "";
    renderGiftSearchResults("");
    giftSearchInput.focus();
  }
});

giftSearchResults?.addEventListener("click", (e) => {
  const item = e.target.closest(".gift-result-item");
  if (!item) return;
  const idx = Number(item.dataset.index);
  if (Number.isFinite(idx) && activeGiftResults[idx]) {
    selectGiftRecipient(activeGiftResults[idx]);
  }
});

giftChangeBtn?.addEventListener("click", clearGiftSelection);

document.addEventListener("click", (e) => {
  const wrap = document.getElementById("gift-search-wrap");
  if (wrap && !wrap.contains(e.target)) {
    giftSearchResults?.classList.add("is-hidden");
  }
});


// Check initial plan amount from URL or sessionStorage
const initialUrlAmount = Number.parseInt(new URLSearchParams(window.location.search).get("amount"), 10);
if (Number.isFinite(initialUrlAmount) && initialUrlAmount > 0) {
  updateSelectedMonthlyPlan(initialUrlAmount);
} else {
  try {
    const saved = JSON.parse(sessionStorage.getItem("sillysensei_intended_plan") || "{}");
    if (saved?.plan === "monthly" && Number(saved.amount) > 0) {
      updateSelectedMonthlyPlan(Number(saved.amount));
    }
  } catch (_) {}
}

document.querySelectorAll('input[name="home-autopay-tier"]').forEach((input) => {
  input.addEventListener("change", (e) => {
    updateSelectedMonthlyPlan(Number(e.target.value));
  });
});

const requestedMode = new URLSearchParams(window.location.search).get("plan");
setMode(requestedMode === "one-time" ? "one-time" : requestedMode === "gift" ? "gift" : "monthly");
const initialGiftPhone = new URLSearchParams(window.location.search).get("phone");
if (initialGiftPhone) {
  setTimeout(() => {
    const matches = searchGiftRecipients(initialGiftPhone);
    if (matches[0]) selectGiftRecipient(matches[0]);
  }, 350);
}

onAuthStateChanged(auth, (user) => {
  detachMonthlyIntentListener?.();
  detachMonthlyIntentListener = null;
  currentUser = user?.emailVerified ? user : null;
  monthlyRequestPending = false;
  currentUserPhone = "";

  if (accountLink) {
    accountLink.href = "#dashboard";
    accountLink.setAttribute("aria-label", currentUser ? "Open your account" : "Log in to your account");
    const label = accountLink.querySelector("span");
    if (label) label.textContent = currentUser ? "My account" : "Account";
  }
  if (currentUser) {
    onValue(ref(database, `users/${currentUser.uid}`), (snapshot) => {
      const data = snapshot.val() || {};
      currentUserPhone = cleanIndianPhone(data.phone) || cleanIndianPhone(currentUser.phoneNumber) || "";
    });
    // Check if account has an exclusive custom autopay plan configured
    onValue(ref(database, `customPlans/${currentUser.uid}`), (snapshot) => {
      const custom = snapshot.val();
      if (custom && Number(custom.amount) > 0) {
        let exclusivePill = document.getElementById("exclusive-home-pill");
        if (!exclusivePill) {
          exclusivePill = document.createElement("button");
          exclusivePill.type = "button";
          exclusivePill.id = "exclusive-home-pill";
          exclusivePill.className = "tier-pill tier-pill-exclusive";
          exclusivePill.dataset.amount = String(custom.amount);
          exclusivePill.textContent = `⭐ ₹${Number(custom.amount).toLocaleString("en-IN")}/mo Exclusive`;
          exclusivePill.addEventListener("click", () => {
            updateSelectedMonthlyPlan(Number(custom.amount));
          });
          document.getElementById("home-tier-pills")?.appendChild(exclusivePill);
        }
      }
    }, { onlyOnce: true });

    const userPaymentPath = isDevelopmentMode ? "testPayments" : `paymentIntents/${currentUser.uid}`;
    detachMonthlyIntentListener = onValue(ref(database, userPaymentPath), (snapshot) => {
      const data = snapshot.val();
      currentUserPaymentRecords = data && typeof data === "object"
        ? Object.entries(data)
          .filter(([, record]) => String(record?.email || "").trim().toLowerCase() === String(currentUser.email || "").trim().toLowerCase())
          .map(([id, record]) => ({ id, ...(record || {}) }))
        : [];
      monthlyRequestPending = currentUserPaymentRecords.some((record) => record.type === "monthly" && record.status === "pending");
      refreshSubscriptionMode();
    }, () => {});
  }
  refreshSubscriptionMode();
});



subscriberSources.forEach((path) => {
  onValue(ref(database, path), (snapshot) => {
    const data = snapshot.val();
    sourceData.set(path, data);
    renderPublicTotals();
    renderDonors();
    if (giftSearchInput?.value && !selectedGiftRecipient) {
      renderGiftSearchResults(giftSearchInput.value);
    }
    refreshSubscriptionMode();
  }, (error) => {
    console.error(`Unable to load ${path}:`, error);
  });
});

