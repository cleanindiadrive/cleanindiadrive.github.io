import { onValue, ref, remove, set, update } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";
import { database } from "./firebase-client.js";

// =======================================================
// ADMIN PASSCODE & AUTHENTICATION
// =======================================================
const DEFAULT_PASSCODE = "admin123";
const lockScreen = document.getElementById("lock-screen");
const adminApp = document.getElementById("admin-app");
const passcodeInput = document.getElementById("passcode-input");
const unlockBtn = document.getElementById("unlock-btn");
const lockError = document.getElementById("lock-error");
const lockBtn = document.getElementById("lock-btn");

function isUnlocked() {
  return sessionStorage.getItem("ms_admin_auth") === "unlocked";
}

function unlockPortal() {
  sessionStorage.setItem("ms_admin_auth", "unlocked");
  lockScreen.classList.add("is-hidden");
  adminApp.classList.remove("is-hidden");
}

function lockPortal() {
  sessionStorage.removeItem("ms_admin_auth");
  adminApp.classList.add("is-hidden");
  lockScreen.classList.remove("is-hidden");
  if (passcodeInput) {
    passcodeInput.value = "";
    passcodeInput.focus();
  }
}

unlockBtn?.addEventListener("click", () => {
  const entered = (passcodeInput?.value || "").trim();
  const configured = localStorage.getItem("ms_admin_pin") || DEFAULT_PASSCODE;
  if (entered === configured || entered === "sillysensei2026") {
    lockError.textContent = "";
    unlockPortal();
  } else {
    lockError.textContent = "Incorrect passcode. Try 'admin123' or 'sillysensei2026'.";
    passcodeInput?.focus();
  }
});

passcodeInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") unlockBtn?.click();
});

lockBtn?.addEventListener("click", lockPortal);

if (isUnlocked()) {
  unlockPortal();
} else {
  lockPortal();
}

// =======================================================
// TOAST NOTIFICATIONS
// =======================================================
const toastEl = document.getElementById("toast");
let toastTimer = null;

function showToast(message, type = "success") {
  if (!toastEl) return;
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.className = `show ${type}`;
  toastTimer = setTimeout(() => {
    toastEl.className = "";
  }, 3500);
}

// =======================================================
// STATE & DATA
// =======================================================
let usersMap = new Map();
let customPlansMap = new Map();
let subscriptionsMap = new Map();
let currentFilter = "all";
let searchQuery = "";
let modalTargetUser = null;

// Helper to escape HTML safely
function escapeHtml(val) {
  return String(val ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatAmount(val) {
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return "—";
  return `₹${num.toLocaleString("en-IN")}`;
}

// =======================================================
// FIREBASE REALTIME LISTENERS
// =======================================================

// 1. Users list
onValue(ref(database, "users"), (snapshot) => {
  const data = snapshot.val() || {};
  usersMap.clear();
  Object.entries(data).forEach(([uid, user]) => {
    usersMap.set(uid, {
      uid,
      name: user?.name || user?.fullName || "Supporter",
      email: (user?.email || "").toLowerCase(),
      provider: user?.provider || "google.com",
      updatedAt: user?.updatedAt || null,
      customAutopayAmount: user?.customAutopayAmount || null,
      customPlanTitle: user?.customPlanTitle || null,
    });
  });
  renderApp();
}, (err) => {
  console.error("Error loading users:", err);
  showToast("Could not sync users from database", "error");
});

// 2. Custom Plans
onValue(ref(database, "customPlans"), (snapshot) => {
  const data = snapshot.val() || {};
  customPlansMap.clear();
  Object.entries(data).forEach(([uid, plan]) => {
    if (plan && typeof plan === "object") {
      customPlansMap.set(uid, {
        uid,
        amount: Number(plan.amount) || 0,
        title: plan.title || "Special Patron Autopay",
        note: plan.note || "",
        enabled: plan.enabled !== false,
        updatedAt: plan.updatedAt || null,
      });
    }
  });
  renderApp();
});

// 3. Subscriptions (BCBB & Velcrow)
function normalizeSubs(val, source) {
  if (!val || typeof val !== "object") return;
  Object.entries(val).forEach(([id, record]) => {
    const email = String(record?.email || "").trim().toLowerCase();
    if (!email) return;
    const status = String(record?.subscriptionStatus || record?.status || "").trim().toLowerCase();
    const existing = subscriptionsMap.get(email);
    if (!existing || status === "active") {
      subscriptionsMap.set(email, {
        id,
        source,
        amount: Number(record.amount) || 100,
        status: status || "active",
        date: record.date || record.createdAt || null,
      });
    }
  });
}

onValue(ref(database, "subscribers"), (snapshot) => {
  normalizeSubs(snapshot.val(), "BCBB");
  renderApp();
});

onValue(ref(database, "subscribers_velcrow"), (snapshot) => {
  normalizeSubs(snapshot.val(), "Velcrow");
  renderApp();
});

onValue(ref(database, "testPayments"), (snapshot) => {
  const data = snapshot.val() || {};
  Object.values(data).forEach((pay) => {
    if (pay?.type === "monthly" && pay?.email) {
      const email = String(pay.email).trim().toLowerCase();
      const status = String(pay.subscriptionStatus || pay.status || "").toLowerCase();
      if (!subscriptionsMap.has(email) || status === "active") {
        subscriptionsMap.set(email, {
          source: "Test",
          amount: Number(pay.amount) || 100,
          status: status || "active",
        });
      }
    }
  });
  renderApp();
});

// =======================================================
// RENDER STATS & TABLE
// =======================================================
function renderApp() {
  renderStats();
  renderTable();
}

function renderStats() {
  const totalUsers = usersMap.size;
  document.getElementById("stat-total-users").textContent = totalUsers.toLocaleString();

  let activeSubsCount = 0;
  let totalMRR = 0;

  subscriptionsMap.forEach((sub) => {
    if (sub.status === "active") {
      activeSubsCount++;
      totalMRR += Number(sub.amount) || 100;
    }
  });

  document.getElementById("stat-active-subs").textContent = activeSubsCount.toLocaleString();
  document.getElementById("stat-custom-plans").textContent = customPlansMap.size.toLocaleString();
  document.getElementById("stat-total-mrr").textContent = formatAmount(totalMRR);
}

function renderTable() {
  const tbody = document.getElementById("user-table-body");
  if (!tbody) return;

  const usersList = Array.from(usersMap.values());
  const query = searchQuery.toLowerCase().trim();

  const filtered = usersList.filter((user) => {
    const matchesSearch = !query ||
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.uid.toLowerCase().includes(query);

    if (!matchesSearch) return false;

    const customPlan = customPlansMap.get(user.uid);
    const sub = subscriptionsMap.get(user.email);
    const hasCustom = customPlan && customPlan.amount > 0 && customPlan.enabled !== false;
    const isActiveSub = sub && sub.status === "active";

    if (currentFilter === "custom") return hasCustom;
    if (currentFilter === "active") return isActiveSub;
    if (currentFilter === "none") return !isActiveSub;
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-row">No accounts match the current search &amp; filter criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((user) => {
    const customPlan = customPlansMap.get(user.uid);
    const sub = subscriptionsMap.get(user.email);
    const hasCustom = customPlan && customPlan.amount > 0 && customPlan.enabled !== false;

    const avatarInitial = (user.name || "S").charAt(0).toUpperCase();

    // Subscription status badge
    let subHtml = `<span class="status-pill none">None</span>`;
    if (sub) {
      const isActive = sub.status === "active";
      subHtml = `<span class="status-pill ${isActive ? "active" : "none"}">
        ${isActive ? "● Active" : "○ " + sub.status} · ${formatAmount(sub.amount)}/mo
      </span>`;
    }

    // Custom Plan badge
    let customHtml = `<span class="no-custom-plan">Standard plans only</span>`;
    if (hasCustom) {
      customHtml = `
        <div class="custom-plan-badge">
          <span class="custom-plan-pill">
            ⭐ ${formatAmount(customPlan.amount)}/mo
          </span>
          <span class="custom-plan-sub">${escapeHtml(customPlan.title)}</span>
        </div>
      `;
    }

    return `
      <tr data-uid="${escapeHtml(user.uid)}">
        <td>
          <div class="user-cell">
            <div class="user-avatar">${escapeHtml(avatarInitial)}</div>
            <div>
              <div class="user-meta-name">${escapeHtml(user.name)}</div>
              <div class="user-meta-email">${escapeHtml(user.email)}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="uid-tag" title="Click to copy UID" onclick="navigator.clipboard.writeText('${escapeHtml(user.uid)}'); window.showAdminToast('Copied UID to clipboard');">
            ${escapeHtml(user.uid.slice(0, 10))}… 📋
          </span>
        </td>
        <td>${subHtml}</td>
        <td>${customHtml}</td>
        <td style="text-align: right;">
          <div class="action-buttons" style="justify-content: flex-end;">
            <button type="button" class="btn-action ${hasCustom ? "btn-edit-custom" : "btn-set-custom"}" onclick="window.openCustomModal('${escapeHtml(user.uid)}')">
              ${hasCustom ? "✏️ Edit Plan" : "⚡ Set Custom"}
            </button>
            ${hasCustom ? `
              <button type="button" class="btn-action btn-remove-custom" onclick="window.removeCustomPlan('${escapeHtml(user.uid)}')">
                🗑️
              </button>
            ` : ""}
            <a href="user-dashboard.html?preview=1&demo=1&customAmount=${hasCustom ? customPlan.amount : "2500"}" target="_blank" rel="noopener" class="btn-action btn-view-user" title="Preview dashboard as this user">
              👁️ View
            </a>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Expose toast to window for inline onclick handlers
window.showAdminToast = (msg) => showToast(msg, "success");

// =======================================================
// SEARCH & FILTER TABS
// =======================================================
const searchInput = document.getElementById("user-search");
searchInput?.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderTable();
});

document.querySelectorAll(".filter-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".filter-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentFilter = tab.dataset.filter;
    renderTable();
  });
});

// =======================================================
// CUSTOM AUTOPAY PLAN MODAL
// =======================================================
const modalBackdrop = document.getElementById("custom-modal-backdrop");
const modalCloseX = document.getElementById("modal-close-x");
const modalCancelBtn = document.getElementById("modal-cancel-btn");
const modalSaveBtn = document.getElementById("modal-save-btn");
const amountInput = document.getElementById("custom-amount-input");
const titleInput = document.getElementById("custom-title-input");
const noteInput = document.getElementById("custom-note-input");
const enabledInput = document.getElementById("custom-enabled-input");
const manualAddBtn = document.getElementById("btn-manual-add");

function openModalForUser(uid) {
  let user = usersMap.get(uid);
  if (!user) {
    user = {
      uid,
      name: "Custom Account",
      email: uid.includes("@") ? uid : "account@custom.plan",
    };
  }
  modalTargetUser = user;

  const existingPlan = customPlansMap.get(uid);

  document.getElementById("modal-user-avatar").textContent = (user.name || "U").charAt(0).toUpperCase();
  document.getElementById("modal-user-name").textContent = user.name;
  document.getElementById("modal-user-email").textContent = user.email;
  document.getElementById("modal-user-uid").textContent = user.uid;

  amountInput.value = existingPlan?.amount || 2500;
  titleInput.value = existingPlan?.title || "Special Patron Autopay";
  noteInput.value = existingPlan?.note || "Custom recurring support tier configured exclusively for your account.";
  enabledInput.checked = existingPlan ? existingPlan.enabled !== false : true;

  modalBackdrop.classList.remove("is-hidden");
  amountInput.focus();
}

window.openCustomModal = openModalForUser;

function closeModal() {
  modalBackdrop.classList.add("is-hidden");
  modalTargetUser = null;
}

modalCloseX?.addEventListener("click", closeModal);
modalCancelBtn?.addEventListener("click", closeModal);
modalBackdrop?.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

// Preset chips
document.querySelectorAll(".preset-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    amountInput.value = chip.dataset.preset;
  });
});

// Save Custom Plan
modalSaveBtn?.addEventListener("click", async () => {
  if (!modalTargetUser) return;
  const amount = Number(amountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast("Please enter a valid amount greater than ₹0", "error");
    return;
  }

  const title = (titleInput.value || "Special Patron Autopay").trim();
  const note = (noteInput.value || "Custom recurring support tier configured exclusively for your account.").trim();
  const enabled = enabledInput.checked;
  const now = Date.now();

  modalSaveBtn.disabled = true;
  modalSaveBtn.textContent = "Saving to Database…";

  try {
    const planPayload = {
      amount,
      title,
      note,
      enabled,
      updatedAt: now,
      email: modalTargetUser.email || "",
      name: modalTargetUser.name || "",
    };

    // 1. Save to customPlans/${uid}
    await set(ref(database, `customPlans/${modalTargetUser.uid}`), planPayload);

    // 2. Also update users/${uid} if user exists
    if (usersMap.has(modalTargetUser.uid)) {
      await update(ref(database, `users/${modalTargetUser.uid}`), {
        customAutopayAmount: amount,
        customPlanTitle: title,
        customPlanEnabled: enabled,
        updatedAt: now,
      });
    }

    // Update local map optimistically
    customPlansMap.set(modalTargetUser.uid, {
      uid: modalTargetUser.uid,
      amount,
      title,
      note,
      enabled,
      updatedAt: now,
    });

    renderApp();
    closeModal();
    showToast(`⭐ Exclusive ₹${amount.toLocaleString("en-IN")}/mo plan configured for ${modalTargetUser.name}!`, "success");
  } catch (err) {
    console.error("Unable to save custom plan:", err);
    showToast(`Error saving plan: ${err.message}`, "error");
  } finally {
    modalSaveBtn.disabled = false;
    modalSaveBtn.innerHTML = `<span>💾</span> Save Exclusive Plan`;
  }
});

// Remove Custom Plan
window.removeCustomPlan = async (uid) => {
  const user = usersMap.get(uid);
  const name = user ? user.name : uid;
  if (!confirm(`Are you sure you want to remove the custom autopay plan for ${name}? The account will revert to standard plans.`)) {
    return;
  }

  try {
    await remove(ref(database, `customPlans/${uid}`));
    if (usersMap.has(uid)) {
      await update(ref(database, `users/${uid}`), {
        customAutopayAmount: null,
        customPlanTitle: null,
        customPlanEnabled: false,
      });
    }
    customPlansMap.delete(uid);
    renderApp();
    showToast(`Removed custom plan for ${name}. Reverted to standard tiers.`, "success");
  } catch (err) {
    console.error("Error removing plan:", err);
    showToast(`Failed to remove plan: ${err.message}`, "error");
  }
};

// Manual Plan by Email or UID
manualAddBtn?.addEventListener("click", () => {
  const identifier = prompt("Enter the Supporter's Firebase UID or Email address to assign an exclusive custom plan:");
  if (!identifier) return;
  const clean = identifier.trim();

  // Check if existing user matches UID or email
  let matchedUser = usersMap.get(clean);
  if (!matchedUser) {
    for (const u of usersMap.values()) {
      if (u.email.toLowerCase() === clean.toLowerCase()) {
        matchedUser = u;
        break;
      }
    }
  }

  const targetUid = matchedUser ? matchedUser.uid : clean;
  openModalForUser(targetUid);
});
