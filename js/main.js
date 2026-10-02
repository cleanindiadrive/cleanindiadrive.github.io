import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { onValue, push, ref, set, update } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";
import { auth, database, isDevelopmentMode } from "./firebase-client.js";

const subscriberCount = document.getElementById("subscriber-count");
const moneyRaised = document.getElementById("money-raised");
const donorTotal = document.getElementById("donor-total");
const donorList = document.getElementById("donor-list");
const accountLink = document.getElementById("account-link");
const sourceData = new Map();
const subscriberSources = ["subscribers", "subscribers_velcrow"];
let currentUser = null;
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
  const status = String(record?.subscriptionStatus || record?.status || "").trim().toLowerCase();
  return ["active", "paused", "cancelled", "pending"].includes(status) ? status : "active";
}

function getActiveDonors() {
  const donors = new Map();

  sourceData.forEach((data, source) => {
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

  return donors;
}

function formatPublicDonorName(name, anonymous = false) {
  if (anonymous) return "Anonymous supporter";
  const cleaned = String(name || "").trim();
  if (!cleaned || /^(anonymous|anon|private|supporter)$/i.test(cleaned)) return "Anonymous supporter";
  return cleaned;
}

function renderPublicTotals() {
  const total = getActiveDonors().size;
  if (subscriberCount) subscriberCount.textContent = `${total} active subscribers`;
  if (moneyRaised) moneyRaised.textContent = String(total * 100);
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

function renderGiftRecipients() {
  const phoneInput = document.getElementById("gift-phone");
  const recipientSelect = document.getElementById("gift-recipient");
  const submitButton = document.getElementById("gift-submit");
  if (!phoneInput || !recipientSelect || !submitButton) return;

  const query = String(phoneInput.value || "").replace(/\D/g, "");
  const matches = [];
  const seen = new Set();

  if (query.length >= 4) {
    sourceData.forEach((data, source) => {
      if (!data || typeof data !== "object") return;
      Object.entries(data).forEach(([id, record]) => {
        const phone = String(record?.phone || "").replace(/\D/g, "");
        if (!phone || !(phone.endsWith(query) || phone.includes(query))) return;
        const key = String(record?.email || phone || `${source}:${id}`).trim().toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        matches.push({
          id,
          source,
          name: String(record?.name || "Anonymous supporter").trim() || "Anonymous supporter",
          phone: String(record?.phone || "Not provided").trim(),
          email: String(record?.email || "").trim(),
          team: String(record?.team || source).trim(),
        });
      });
    });
  }

  giftRecipients = matches;
  if (!query) {
    recipientSelect.innerHTML = '<option value="">Enter a phone number first</option>';
  } else if (matches.length) {
    recipientSelect.innerHTML = '<option value="">Select a donor</option>' + matches.map((recipient, index) => (
      `<option value="${index}">${escapeHtml(recipient.name)} · ${escapeHtml(recipient.phone)}</option>`
    )).join("");
  } else {
    recipientSelect.innerHTML = '<option value="">No donor found for this number</option>';
  }

  recipientSelect.disabled = !matches.length;
  submitButton.disabled = true;
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
  const matches = [];
  for (const [path, data] of sourceData.entries()) {
    if (!data || typeof data !== "object") continue;
    for (const [id, record] of Object.entries(data)) {
      if (String(record?.email || "").trim().toLowerCase() !== email) continue;
      matches.push({ id, path, ...record, status: getRecordStatus(record) });
    }
  }
  if (matches.length) {
    const priority = { active: 0, paused: 1, pending: 2, cancelled: 3 };
    return matches.sort((a, b) => (priority[a.status] ?? 4) - (priority[b.status] ?? 4))[0];
  }
  const devSubscription = currentUserPaymentRecords.find((record) => record.type === "monthly" && ["active", "paused", "cancelled"].includes(getRecordStatus(record)));
  if (devSubscription) return { ...devSubscription, path: "testPayments", status: getRecordStatus(devSubscription) };
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

function playPosTransactionAnimation(container, onComplete) {
  if (!container) {
    if (typeof onComplete === "function") onComplete();
    return;
  }
  if (container.classList.contains("is-disabled") || container.getAttribute("aria-disabled") === "true") {
    return;
  }
  container.classList.remove("is-animating");
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

  container.classList.add("is-animating");
  setTimeout(() => {
    container.classList.remove("is-animating");
    if (typeof onComplete === "function") {
      onComplete();
    }
  }, 1250);
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
    status.textContent = `Log in to start your ₹${selectedMonthlyAmount.toLocaleString("en-IN")}/mo support.`;
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
      : `You can start a new subscription at ₹${selectedMonthlyAmount.toLocaleString("en-IN")}/mo.`;
    setPosButtonText(button, monthlyRequestPending ? "Payment pending" : "Subscribe");
    setPosButtonDisabled(button, monthlyRequestPending);
    accountAction?.classList.remove("is-hidden");
    return;
  }

  const paused = currentSubscription.status === "paused";
  if (paused) {
    status.textContent = "Your subscription is paused. Resume it from your account.";
    setPosButtonText(button, "Resume");
    setPosButtonDisabled(button, false);
    accountAction?.classList.remove("is-hidden");
    return;
  }

  const currentSubAmount = Number(currentSubscription.amount) || 100;
  if (selectedMonthlyAmount === currentSubAmount) {
    status.textContent = `Active subscription · ₹${currentSubAmount.toLocaleString("en-IN")}/mo.`;
    setPosButtonText(button, "Active subscription");
    setPosButtonDisabled(button, true);
  } else {
    status.textContent = `Your active plan is ₹${currentSubAmount.toLocaleString("en-IN")}/mo. Manage or switch in your dashboard.`;
    setPosButtonText(button, "Manage in account");
    setPosButtonDisabled(button, false);
  }
  accountAction?.classList.remove("is-hidden");
}

async function toggleSubscription(event) {
  event?.preventDefault?.();
  const button = document.getElementById("subscription-toggle");
  const status = document.getElementById("subscription-mode-status");
  if (!button || !status || isPosButtonDisabled(button)) return;

  if (!currentUser) {
    playPosTransactionAnimation(button, () => {
      window.location.href = `user-login.html?return=index.html&plan=monthly&amount=${selectedMonthlyAmount}`;
    });
    return;
  }

  if (currentSubscription && currentSubscription.status === "active") {
    if (getPosButtonText(button) === "Manage in account") {
      playPosTransactionAnimation(button, () => {
        window.location.href = "user-dashboard.html";
      });
      return;
    }
  }

  if (!currentSubscription || currentSubscription.status === "cancelled") {
    if (monthlyRequestPending) return;
    setPosButtonDisabled(button, true);
    playPosTransactionAnimation(button);
    status.textContent = "Saving your subscription request…";
    try {
      const path = isDevelopmentMode ? "testPayments" : `paymentIntents/${currentUser.uid}`;
      const intent = push(ref(database, path));
      const now = Date.now();
      await set(intent, {
        type: "monthly",
        amount: selectedMonthlyAmount,
        anonymous: isAnonymousDonationSelected(),
        status: isDevelopmentMode ? "active" : "pending",
        ...(isDevelopmentMode ? { subscriptionStatus: "active", isTest: true, paidAt: now, reference: `DEV-SUBSCRIPTION-${now}` } : {}),
        createdAt: now,
        email: currentUser.email || "",
      });
      if (isDevelopmentMode) {
        status.textContent = `Development subscription for ₹${selectedMonthlyAmount.toLocaleString("en-IN")}/mo activated.`;
        setPosButtonText(button, "Active subscription");
        setPosButtonDisabled(button, true);
      } else {
        monthlyRequestPending = true;
        status.textContent = "Request saved. Complete payment confirmation to activate it.";
      }
    } catch (error) {
      console.error("Unable to start subscription:", error);
      status.textContent = "Could not start the subscription request. Please try again.";
      setPosButtonDisabled(button, false);
    }
    if (!isDevelopmentMode) refreshSubscriptionMode();
    return;
  }

  const nextStatus = currentSubscription.status === "paused" ? "active" : "paused";
  setPosButtonDisabled(button, true);
  playPosTransactionAnimation(button);
  try {
    await update(ref(database, `${currentSubscription.path}/${currentSubscription.id}`), {
      subscriptionStatus: nextStatus,
      ...(nextStatus === "paused" ? { pausedAt: Date.now() } : { resumedAt: Date.now() }),
    });
    currentSubscription.status = nextStatus;
    status.textContent = nextStatus === "paused" ? "Your monthly subscription is paused." : "Your monthly subscription is active.";
  } catch (error) {
    console.error("Unable to update subscription:", error);
    status.textContent = "Could not update your subscription. Please try again.";
    setPosButtonDisabled(button, false);
    return;
  }
  refreshSubscriptionMode();
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
  if (!currentUser) {
    playPosTransactionAnimation(button, () => {
      window.location.href = `user-login.html?mode=signup&plan=one-time&amount=${encodeURIComponent(amount)}`;
    });
    return;
  }
  if (isPosButtonDisabled(button)) return;

  setPosButtonDisabled(button, true);
  playPosTransactionAnimation(button);
  setModeMessage("one-time-message", "Saving your payment request…");
  try {
    const path = isDevelopmentMode ? "testPayments" : `paymentIntents/${currentUser.uid}`;
    const intent = push(ref(database, path));
    const now = Date.now();
    await set(intent, {
      type: "one-time",
      amount,
      anonymous: isAnonymousDonationSelected(),
      status: isDevelopmentMode ? "paid" : "pending",
      ...(isDevelopmentMode ? { isTest: true, paidAt: now, reference: `DEV-ONE-TIME-${now}` } : {}),
      createdAt: now,
      email: currentUser.email || "",
    });
    setModeMessage("one-time-message", isDevelopmentMode ? "Development payment recorded as successful." : "Payment request saved as pending. A payment gateway still needs to confirm it.");
  } catch (error) {
    console.error("Unable to save one-time payment request:", error);
    setModeMessage("one-time-message", "Could not save the request. Please try again.", true);
  } finally {
    setPosButtonDisabled(button, false);
  }
}

async function saveGiftIntent(event) {
  event?.preventDefault?.();
  const recipientSelect = document.getElementById("gift-recipient");
  const button = document.getElementById("gift-submit");
  const recipient = giftRecipients[Number(recipientSelect?.value)];
  if (!recipient) {
    setModeMessage("gift-message", "Select a donor first.", true);
    return;
  }
  if (!currentUser) {
    playPosTransactionAnimation(button, () => {
      window.location.href = `user-login.html?mode=signup&plan=gift&phone=${encodeURIComponent(recipient.phone)}`;
    });
    return;
  }
  if (isPosButtonDisabled(button)) return;

  setPosButtonDisabled(button, true);
  playPosTransactionAnimation(button);
  setModeMessage("gift-message", "Saving your gift request…");
  try {
    const path = isDevelopmentMode ? "testPayments" : `paymentIntents/${currentUser.uid}`;
    const intent = push(ref(database, path));
    const now = Date.now();
    await set(intent, {
      type: "gift-monthly",
      amount: 100,
      anonymous: isAnonymousDonationSelected(),
      status: isDevelopmentMode ? "paid" : "pending",
      ...(isDevelopmentMode ? { isTest: true, paidAt: now, reference: `DEV-GIFT-${now}` } : {}),
      createdAt: now,
      email: currentUser.email || "",
      recipientName: recipient.name,
      recipientEmail: recipient.email,
      recipientPhone: recipient.phone,
      recipientTeam: recipient.team,
    });
    setModeMessage("gift-message", isDevelopmentMode ? `Development gift payment recorded as successful for ${recipient.name}.` : `Gift request for ${recipient.name} saved as pending.`);
  } catch (error) {
    console.error("Unable to save gift request:", error);
    setModeMessage("gift-message", "Could not save the gift request. Please try again.", true);
  } finally {
    setPosButtonDisabled(button, false);
  }
}

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

document.getElementById("gift-phone")?.addEventListener("input", renderGiftRecipients);
document.getElementById("gift-recipient")?.addEventListener("change", (event) => {
  if (giftSubmitBtn) setPosButtonDisabled(giftSubmitBtn, !giftRecipients[Number(event.target.value)]);
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
renderGiftRecipients();

onAuthStateChanged(auth, (user) => {
  detachMonthlyIntentListener?.();
  detachMonthlyIntentListener = null;
  currentUser = user?.emailVerified ? user : null;
  monthlyRequestPending = false;

  if (accountLink) {
    accountLink.href = currentUser ? "user-dashboard.html" : "user-login.html";
    accountLink.setAttribute("aria-label", currentUser ? "Open your account" : "Log in to your account");
    const label = accountLink.querySelector("span");
    if (label) label.textContent = currentUser ? "My account" : "Account";
  }
  if (currentUser) {
    // Check if account has an exclusive custom autopay plan configured
    get(ref(database, `customPlans/${currentUser.uid}`)).then((snapshot) => {
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
    }).catch(() => {});

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
    renderGiftRecipients();
    refreshSubscriptionMode();
  }, (error) => {
    console.error(`Unable to load ${path}:`, error);
  });
});
