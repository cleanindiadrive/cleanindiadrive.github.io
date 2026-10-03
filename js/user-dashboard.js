import { onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { onValue, push, ref, remove, set, update } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";
import { auth, database, isDevelopmentMode } from "./firebase-client.js";

const BACKEND_URL = (window.BACKEND_API_URL || "https://sillypayement.onrender.com").replace(/\/+$/, "");
let currentUserPhone = "";
const get = (id) => document.getElementById(id);

function playPosTransactionAnimation(container, onComplete, reverse = false) {
  if (!container) {
    if (typeof onComplete === "function") onComplete();
    return;
  }
  if (container.classList.contains("is-disabled") || container.getAttribute("aria-disabled") === "true") {
    return;
  }
  container.classList.remove("is-animating");
  container.classList.remove("is-animating-reverse");
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

  container.classList.add(reverse ? "is-animating-reverse" : "is-animating");
  setTimeout(() => {
    container.classList.remove("is-animating");
    container.classList.remove("is-animating-reverse");
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

const subscriberRecords = new Map();
let paymentRecords = [];
let testPaymentRecords = [];
let paymentIntents = [];
let primarySubscription = null;
let cancelledSubscription = null;
let monthlyIntent = null;
let currentUser = null;
let selectedDashboardPlanAmount = 100;
let userCustomPlan = null;

function renderCustomPlanBanner() {
  const card = get("dash-exclusive-card");
  if (!card) return;
  if (userCustomPlan && Number(userCustomPlan.amount) > 0 && userCustomPlan.enabled !== false) {
    card.classList.remove("is-hidden");
    setText("dash-exclusive-amount", `₹${Number(userCustomPlan.amount).toLocaleString("en-IN")} / mo`);
    setText("dash-exclusive-title", userCustomPlan.title || "Special Patron Autopay");
    setText("dash-exclusive-note", userCustomPlan.note || "Custom recurring support tier configured exclusively for your account.");
    setText("dash-exclusive-btn-amount", Number(userCustomPlan.amount).toLocaleString("en-IN"));
  } else {
    card.classList.add("is-hidden");
  }
}

const confirmedStatuses = new Set(["paid", "completed", "success", "active"]);


function setText(id, value) {
  const element = get(id);
  if (element) element.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatAmount(value) {
  const num = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(num) || num <= 0) {
    return "—";
  }
  return `₹${num.toLocaleString("en-IN")}`;
}

function formatDateTime(value) {
  if (!value) return "—";
  const numericValue = Number(value);
  const date = new Date(numericValue && numericValue < 100000000000 ? numericValue * 1000 : value);
  if (Number.isNaN(date.getTime())) return "—";
  const datePart = date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const timePart = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${datePart}, ${timePart.toUpperCase()}`;
}

function formatDateOnly(value) {
  if (!value) return "—";
  const numericValue = Number(value);
  const date = new Date(numericValue && numericValue < 100000000000 ? numericValue * 1000 : value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDate(value) {
  return formatDateTime(value);
}

function cleanNote(record) {
  if (!record) return "";
  if (record.isCancellation || record.type === "cancellation") return "Subscription cancelled";
  const note = String(record.note || "").trim();
  if (!note) return "";
  if (/development-mode.*simulation|simulated recurring/i.test(note)) return "Monthly renewal";
  if (/development-mode.*sphere|initial charge/i.test(note)) return "Initial contribution";
  if (/recurring/i.test(note)) return "Monthly renewal";
  if (/sphere/i.test(note)) return note.replace(/sphere/gi, "subscription");
  return note;
}

function cleanReference(ref) {
  if (!ref || ref === "—") return "—";
  const str = String(ref).trim();
  if (str.startsWith("DEV-MONTHLY-")) return `MS-REC-${str.slice(-4)}`;
  if (str.startsWith("DEV-SUBSCRIPTION-")) return `MS-SUB-${str.slice(-4)}`;
  if (str.startsWith("REQ-SUB-")) return `REQ-${str.slice(-4)}`;
  if (str.startsWith("-") && str.length >= 10) return `REQ-${str.slice(-4).toUpperCase()}`;
  return str;
}

function nextMonthTimestamp(timestamp) {
  const date = new Date(timestamp);
  date.setMonth(date.getMonth() + 1);
  return date.getTime();
}

function normalizedStatus(record, fallback = "unknown") {
  if (!record) return fallback;
  if (record.isCancellation || record.type === "cancellation") return "cancelled";
  if (record.isSubscriptionRoot) {
    const rootStatus = String(record.subscriptionStatus || record.status || "").trim().toLowerCase();
    return rootStatus || fallback;
  }
  const status = String(record.status || record.subscriptionStatus || "").trim().toLowerCase();
  return status || fallback;
}

function normalizeSubscriberRecords(data, source, path, email) {
  if (!data || typeof data !== "object") return [];
  return Object.entries(data)
    .filter(([, record]) => String(record?.email || "").trim().toLowerCase() === email)
    .map(([id, record]) => {
      const normalizedRecord = record && typeof record === "object" ? record : {};
      const explicitStatus = normalizedStatus(normalizedRecord);
      const status = ["active", "paused", "cancelled", "pending"].includes(explicitStatus)
        ? explicitStatus
        : normalizedRecord.lastPaymentAt || normalizedRecord.subscribedAt
          ? "active"
          : "pending";
      return {
        ...normalizedRecord,
        id,
        source,
        path,
        type: "monthly",
        amount: Number(normalizedRecord.amount) || 100,
        status,
        date: normalizedRecord.subscribedAt || normalizedRecord.createdAt || normalizedRecord.lastPaymentAt,
        reference: normalizedRecord.orderId || normalizedRecord.reference || id,
        isSubscriptionRoot: true,
      };
    });
}

function normalizeUidRecords(data, source, path = "") {
  if (!data || typeof data !== "object") return [];
  return Object.entries(data).map(([id, record]) => {
    const normalizedRecord = record && typeof record === "object" ? record : {};
    return {
      id,
      source,
      path,
      ...normalizedRecord,
      status: normalizedStatus(normalizedRecord, source === "intent" ? "pending" : "unknown"),
      date: normalizedRecord.paidAt || normalizedRecord.createdAt || normalizedRecord.subscribedAt || normalizedRecord.lastPaymentAt,
      reference: normalizedRecord.reference || normalizedRecord.transactionId || normalizedRecord.orderId || id,
      isSubscriptionRoot: Boolean(normalizedRecord.subscriptionStatus) && !normalizedRecord.subscriptionId,
    };
  });
}

function isSubscriptionRecord(record) {
  const type = String(record?.type || "").trim().toLowerCase().replaceAll("_", "-");
  if (type === "gift-monthly" || type === "gift-subscription") return false;
  const billingReason = String(record?.billingReason || record?.billing_type || "").toLowerCase();
  const metadata = [record?.reference, record?.orderId, record?.note, record?.description, record?.paymentType, record?.category]
    .filter(Boolean).join(" ").toLowerCase();
  return type === "monthly"
    || type === "cancellation"
    || Boolean(record?.isCancellation)
    || type.includes("subscription")
    || type.includes("renewal")
    || type.includes("recurring")
    || billingReason.includes("subscription")
    || billingReason.includes("recurring")
    || /subscription|recurring|renewal|chargeback/.test(metadata)
    || Boolean(record?.subscriptionId || record?.subscriptionPath || record?.parentSubscriptionId || record?.subscriptionStatus || record?.isSubscription || record?.recurring);
}

function isSubscriptionRootRecord(record) {
  if (!isSubscriptionRecord(record)) return false;
  if (record?.isSubscriptionRoot) return true;
  if (record?.subscriptionId || record?.parentSubscriptionId || record?.subscriptionPath) return false;
  return ["active", "paused", "cancelled", "pending"].includes(normalizedStatus(record));
}

function isConfirmedPayment(record) {
  if (!record) return false;
  if (record.isCancellation || record.type === "cancellation") return false;
  if (record.isSubscriptionRoot) return false;
  const amount = Number(record.amount);
  if (amount <= 0 || Number.isNaN(amount) || record.amount == null) return false;
  const status = normalizedStatus(record);
  if (status === "cancelled" || status === "failed" || status === "pending") return false;
  return ["paid", "completed", "success", "active"].includes(status);
}

function getSubscriptionReference(record) {
  return String(record?.subscriptionId || record?.parentSubscriptionId || record?.subscriptionPath || "").trim();
}

function subscriptionRootCandidates(record) {
  return [record?.id, record?.reference, record?.orderId, record?.path && record?.id ? `${record.path}/${record.id}` : ""]
    .filter(Boolean).map(String);
}

function buildSubscriptionGroups(records) {
  const subscriptionRecords = records.filter(isSubscriptionRecord);
  const roots = subscriptionRecords.filter(isSubscriptionRootRecord);
  const groups = roots.map((subscription, index) => ({
    key: `subscription:${subscription.path || subscription.source || "record"}:${subscription.id || subscription.reference || index}`,
    subscription,
    charges: [],
  }));

  const findGroup = (record) => {
    const reference = getSubscriptionReference(record);
    if (reference) {
      const matching = groups.find((group) => subscriptionRootCandidates(group.subscription)
        .some((candidate) => candidate === reference || candidate.endsWith(`/${reference}`) || reference.endsWith(`/${candidate}`)));
      if (matching) return matching;
    }
    if (record?.subscriptionId) {
      const matching = groups.find((group) => String(group.subscription.id) === String(record.subscriptionId));
      if (matching) return matching;
    }
    if (groups.length === 1) return groups[0];
    const recordTime = Number(record?.date || record?.createdAt || record?.paidAt || 0);
    if (recordTime > 0) {
      const matching = groups.find((group) => {
        const startTime = Number(group.subscription.date || group.subscription.createdAt || 0);
        const endTime = Number(group.subscription.cancelledAt || group.subscription.endedAt || Infinity);
        return recordTime >= startTime - 60000 && recordTime <= endTime + 60000;
      });
      if (matching) return matching;
    }
    return null;
  };

  subscriptionRecords.filter((record) => !roots.includes(record)).forEach((record) => {
    const group = findGroup(record);
    if (group) {
      group.charges.push(record);
      return;
    }
    const reference = getSubscriptionReference(record);
    groups.push({
      key: `subscription:${reference || record.path || record.source || "record"}:${record.id || record.reference || groups.length}`,
      subscription: record,
      charges: [record],
    });
  });

  groups.forEach((group) => {
    const root = group.subscription;
    const isCancelled = normalizedStatus(root) === "cancelled";
    const isPending = normalizedStatus(root) === "pending";
    const rootTime = Number(root.date || root.createdAt || 0);
    const cancelledTime = Number(root.cancelledAt || root.endedAt || 0);

    // 1. Initial deduction / request entry:
    // If pending, payment has not been confirmed yet (status: pending, not paid).
    // If active, paused, or cancelled, ₹100 was deducted (status: paid).
    const hasInitialPayment = group.charges.some((c) => {
      if (c.isCancellation || c.type === "cancellation") return false;
      const cTime = Number(c.date || c.paidAt || c.createdAt || 0);
      return Math.abs(cTime - rootTime) < 60000 || /initial|first/i.test(c.note || "");
    });

    if (!hasInitialPayment) {
      group.charges.push({
        id: `${root.id || root.reference}-initial`,
        subscriptionId: root.id,
        type: "monthly",
        reference: cleanReference(root.reference) || (isPending ? `REQ-${String(root.id || "").slice(-4).toUpperCase()}` : "MS-SUB-1001"),
        amount: Number(root.amount) || 100,
        status: isPending ? "pending" : "paid",
        date: rootTime || Date.now(),
        paidAt: isPending ? null : (rootTime || Date.now()),
        createdAt: rootTime || Date.now(),
        note: isPending ? "Subscription request (Payment pending)" : "Initial contribution",
      });
    }

    // 2. Cancellation entry: if they cancel, create an entry with no price and status cancelled
    if (isCancelled) {
      const hasCancellationEntry = group.charges.some((c) => c.isCancellation || c.type === "cancellation");
      if (!hasCancellationEntry) {
        group.charges.push({
          id: `${root.id || root.reference}-cancellation`,
          subscriptionId: root.id,
          type: "cancellation",
          isCancellation: true,
          reference: "—",
          amount: null,
          status: "cancelled",
          date: cancelledTime || rootTime || Date.now(),
          createdAt: cancelledTime || rootTime || Date.now(),
          note: "Subscription cancelled",
        });
      }
    }

    // 3. Remove raw root container from charges
    group.charges = group.charges.filter((c) => {
      if (c === root) return false;
      if (c.id === root.id && c.isSubscriptionRoot) return false;
      return true;
    });

    // 4. Sort charges newest to oldest
    group.charges.sort((a, b) => Number(b.date || b.paidAt || b.createdAt || 0) - Number(a.date || a.paidAt || a.createdAt || 0));
  });

  const statusPriority = { active: 0, paused: 1, pending: 2, cancelled: 3 };
  return groups.sort((a, b) => {
    const priorityDiff = (statusPriority[normalizedStatus(a.subscription)] ?? 4) - (statusPriority[normalizedStatus(b.subscription)] ?? 4);
    if (priorityDiff !== 0) return priorityDiff;
    return Number(b.subscription.date || b.subscription.createdAt || 0) - Number(a.subscription.date || a.subscription.createdAt || 0);
  });
}

function paymentStatusClass(status) {
  if (["active", "paid", "completed", "success"].includes(status)) return "status-active";
  if (status === "paused") return "status-paused";
  if (status === "cancelled") return "status-cancelled";
  if (["chargeback", "refunded", "reversed", "failed"].includes(status)) return "status-failed";
  if (status === "pending") return "status-pending";
  return "status-failed";
}

function statusLabel(status) {
  const labels = {
    active: "Active",
    paused: "Paused",
    cancelled: "Cancelled",
    paid: "Paid",
    completed: "Paid",
    success: "Paid",
    pending: "Pending",
    failed: "Failed",
    refunded: "Refunded",
    reversed: "Reversed",
    chargeback: "Chargeback",
  };
  return labels[status] || "Unconfirmed";
}

function paymentTypeLabel(record) {
  if (record.isCancellation || record.type === "cancellation") return "Subscription cancellation";
  if (isSubscriptionRecord(record)) return `Monthly subscription · ${formatAmount(record.amount || 100)}/mo`;
  if (["one-time", "one_time"].includes(record.type)) return "One-time support";
  if (["gift-monthly", "gift-subscription"].includes(record.type)) return `Gift subscription${record.recipientName ? ` · ${record.recipientName}` : ""}`;
  return "Other payment";
}

function renderRecordCard(record) {
  const status = normalizedStatus(record);
  const type = paymentTypeLabel(record);
  const date = formatDateTime(record.date || record.paidAt || record.createdAt);
  const ref = cleanReference(record.reference || record.orderId || record.id || "—");
  const amount = formatAmount(record.amount);
  const note = cleanNote(record);
  const statusHtml = `<span class="status-pill ${paymentStatusClass(status)}">${escapeHtml(statusLabel(status))}</span>`;

  return `<div class="card uiverse-table-card">
    <div class="card__title">
      <span class="card__title-main">${escapeHtml(type)}</span>
      <span class="card__badge">${escapeHtml(amount)}</span>
    </div>
    <div class="card__data">
      <div class="card__right">
        <div class="item">Date &amp; Time</div>
        <div class="item">Type</div>
        <div class="item">Reference</div>
        <div class="item">Amount</div>
        <div class="item">Status</div>
      </div>
      <div class="card__left">
        <div class="item">${escapeHtml(date)}</div>
        <div class="item">${escapeHtml(type)}</div>
        <div class="item"><span class="table-ref-code">${escapeHtml(ref)}</span>${note ? `<br><small class="record-note">${escapeHtml(note)}</small>` : ""}</div>
        <div class="item"><strong>${escapeHtml(amount)}</strong></div>
        <div class="item">${statusHtml}</div>
      </div>
    </div>
  </div>`;
}

function renderRecordRow(record) {
  const status = normalizedStatus(record);
  const isCancel = record.isCancellation || record.type === "cancellation" || status === "cancelled";
  const ref = cleanReference(record.reference || record.orderId || record.id || "—");
  const note = cleanNote(record);
  return `<tr${isCancel ? ' class="charge-row-cancelled"' : ''}>
    <td>${escapeHtml(formatDateTime(record.date || record.paidAt || record.createdAt))}</td>
    <td>${escapeHtml(paymentTypeLabel(record))}</td>
    <td><span class="table-ref-code">${escapeHtml(ref)}</span>${note ? `<br><small class="record-note">${escapeHtml(note)}</small>` : ""}</td>
    <td><strong>${escapeHtml(formatAmount(record.amount))}</strong></td>
    <td><span class="status-pill ${paymentStatusClass(status)}">${escapeHtml(statusLabel(status))}</span></td>
  </tr>`;
}

function renderTableSection(records, tableBodyId, cardsContainerId, badgeId, emptyMessage) {
  const body = get(tableBodyId);
  const cards = get(cardsContainerId);
  const badge = get(badgeId);

  if (badge) {
    badge.textContent = `${records.length} record${records.length === 1 ? "" : "s"}`;
  }

  if (body) {
    if (!records.length) {
      body.innerHTML = `<tr><td colspan="5" class="empty-state">${escapeHtml(emptyMessage)}</td></tr>`;
    } else {
      body.innerHTML = records.map(renderRecordRow).join("");
    }
  }

  if (cards) {
    if (!records.length) {
      cards.innerHTML = `<p class="empty-state">${escapeHtml(emptyMessage)}</p>`;
    } else {
      cards.innerHTML = records.map(renderRecordCard).join("");
    }
  }
}

function renderPaymentTable(records) {
  renderTableSection(records, "payments-body", "other-payments-cards", "other-payments-badge", "No other payments yet.");
}

function renderSubscriptionPayments(records) {
  const list = get("subscription-payments-list");
  if (!list) return;
  const groups = buildSubscriptionGroups(records);
  if (!groups.length) {
    list.innerHTML = '<p class="empty-state">No subscription payments yet.</p>';
    return;
  }

  list.innerHTML = `<div class="subscription-table-wrap">
    <div class="card__title">
      <span class="card__title-main">Subscription Overview</span>
      <div class="table-view-controls">
        <span class="card__badge">${groups.length} subscription${groups.length === 1 ? "" : "s"}</span>
        <div class="view-toggle" role="group" aria-label="Subscription view format">
          <button type="button" class="view-toggle-btn is-active" data-view-target="subscription-payments" data-view="table">Table</button>
          <button type="button" class="view-toggle-btn" data-view-target="subscription-payments" data-view="cards">Cards</button>
        </div>
      </div>
    </div>
    <div class="table-view-container" id="subscription-payments-table-container">
      <div class="table-scroll-wrap">
        <table class="subscription-table">
          <thead><tr><th>Subscription</th><th>Status</th><th>Charges</th><th>Total paid</th><th>Next renewal</th></tr></thead>
          <tbody>${groups.map((group, index) => {
            const key = `subscription-row-${index}`;
            const expanded = false;
            const subscription = group.subscription;
            const charges = group.charges.filter(isConfirmedPayment);
            const total = charges.reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
            const status = normalizedStatus(subscription);
            const isCancelled = status === "cancelled";
            const endedDate = subscription.endedAt || subscription.cancelledAt || subscription.date;
            const nextPayment = subscription.nextPaymentDue || group.charges.find((record) => record.nextPaymentDue)?.nextPaymentDue;
            const nextPaymentCell = isCancelled
              ? `<span class="subscription-ended-badge">Cancelled on ${escapeHtml(formatDateTime(endedDate))}</span>`
              : status === "pending"
                ? '<span class="status-pill status-pending">Confirmation required</span>'
                : escapeHtml(nextPayment ? formatDateOnly(nextPayment) : "—");

            const chargeRows = group.charges.map((record) => {
              const chargeStatus = normalizedStatus(record);
              const isCancel = record.isCancellation || record.type === "cancellation" || chargeStatus === "cancelled";
              const dateStr = formatDateTime(record.date || record.paidAt || record.createdAt);
              const refStr = isCancel && (!record.reference || record.reference.startsWith("DEV-") || record.reference === "—") ? "—" : cleanReference(record.reference || record.orderId || record.id || "—");
              const noteStr = cleanNote(record);
              const nextPaymentVal = isCancel || isCancelled || status === "pending" || !record.nextPaymentDue ? "—" : formatDateOnly(record.nextPaymentDue);

              return `<tr${isCancel ? ' class="charge-row-cancelled"' : ''}>
                <td>${escapeHtml(dateStr)}</td>
                <td><span class="subscription-reference">${escapeHtml(refStr)}</span>${noteStr ? `<small>${escapeHtml(noteStr)}</small>` : ""}</td>
                <td><strong>${escapeHtml(formatAmount(record.amount))}</strong></td>
                <td><span class="status-pill ${paymentStatusClass(chargeStatus)}">${escapeHtml(statusLabel(chargeStatus))}</span></td>
                <td>${escapeHtml(nextPaymentVal)}</td>
              </tr>`;
            }).join("");

            const subStatusSuffix = isCancelled
              ? " (Cancelled)"
              : status === "paused"
                ? " (Paused)"
                : status === "pending"
                  ? " (Pending)"
                  : " (Active)";
            const subMetaText = isCancelled
              ? `Cancelled · Ended ${escapeHtml(formatDateTime(endedDate))}`
              : status === "paused"
                ? `Paused · Started ${escapeHtml(formatDateTime(subscription.date || subscription.createdAt))}`
                : status === "pending"
                  ? `Pending request · Submitted ${escapeHtml(formatDateTime(subscription.date || subscription.createdAt))}`
                  : `Active · Started ${escapeHtml(formatDateTime(subscription.date || subscription.createdAt))}`;

            return `<tr class="subscription-summary-row${isCancelled ? " is-cancelled" : ""}" data-subscription-toggle="${key}" tabindex="0" role="button" aria-expanded="${expanded}">
              <td><span class="subscription-row-indicator" aria-hidden="true"></span><span class="subscription-row-copy"><strong>${escapeHtml(`${formatAmount(subscription.amount || 100)} / mo Subscription`)}</strong><small>${subMetaText}</small></span></td>
              <td><span class="status-pill ${paymentStatusClass(status)}">${escapeHtml(statusLabel(status))}</span></td>
              <td>${escapeHtml(String(charges.length))}</td>
              <td><strong>${escapeHtml(formatAmount(total))}</strong></td>
              <td>${nextPaymentCell}</td>
            </tr>
            <tr class="subscription-charges-row${expanded ? "" : " is-hidden"}" data-subscription-details="${key}">
              <td colspan="5">
                <div class="subscription-charges-panel">
                  <div class="card__title card__title--nested">
                    <span>Payment history · ${escapeHtml(formatAmount(subscription.amount || 100))} / mo${subStatusSuffix}</span>
                    <span class="card__badge">${charges.length} confirmed contribution${charges.length === 1 ? "" : "s"}</span>
                  </div>
                  <div class="subscription-charges-table-wrap">
                    <table class="subscription-charges-table">
                      <thead><tr><th>Date &amp; Time</th><th>Reference</th><th>Amount</th><th>Status</th><th>Next renewal</th></tr></thead>
                      <tbody>${chargeRows || '<tr><td colspan="5" class="empty-state">No charges yet.</td></tr>'}</tbody>
                    </table>
                  </div>
                </div>
              </td>
            </tr>`;
          }).join("")}</tbody>
        </table>
      </div>
    </div>
    <div class="card-view-container is-hidden" id="subscription-payments-cards-container">
      <div class="uiverse-card-list">${groups.map((group) => {
        const subscription = group.subscription;
        const charges = group.charges.filter(isConfirmedPayment);
        const total = charges.reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
        const status = normalizedStatus(subscription);
        const isCancelled = status === "cancelled";
        const endedDate = subscription.endedAt || subscription.cancelledAt || subscription.date;
        const nextPayment = subscription.nextPaymentDue || group.charges.find((record) => record.nextPaymentDue)?.nextPaymentDue;
        const planStatusLabel = isCancelled
          ? "Cancelled"
          : status === "paused"
            ? "Paused"
            : status === "pending"
              ? "Pending confirmation"
              : "Active";
        const nextPaymentVal = isCancelled
          ? `<span class="subscription-ended-badge">Cancelled on ${escapeHtml(formatDateTime(endedDate))}</span>`
          : status === "pending"
            ? '<span class="status-pill status-pending">Confirmation required</span>'
            : escapeHtml(nextPayment ? formatDateOnly(nextPayment) : "—");

        return `<div class="card uiverse-table-card${isCancelled ? " is-cancelled" : ""}">
          <div class="card__title">
            <span class="card__title-main">${escapeHtml(`${formatAmount(subscription.amount || 100)} / mo Subscription`)}</span>
            <span class="card__badge">${escapeHtml(formatAmount(total))}</span>
          </div>
          <div class="card__data">
            <div class="card__right">
              <div class="item">Subscription</div>
              <div class="item">Status</div>
              <div class="item">Plan status</div>
              <div class="item">Charges</div>
              <div class="item">Total paid</div>
              <div class="item">${isCancelled ? "Cancelled on" : status === "pending" ? "Renewal" : "Next renewal"}</div>
            </div>
            <div class="card__left">
              <div class="item">${escapeHtml(`${formatAmount(subscription.amount || 100)} / mo Subscription`)}</div>
              <div class="item"><span class="status-pill ${paymentStatusClass(status)}">${escapeHtml(statusLabel(status))}</span></div>
              <div class="item">${escapeHtml(planStatusLabel)}</div>
              <div class="item">${charges.length} contribution${charges.length === 1 ? "" : "s"}</div>
              <div class="item"><strong>${escapeHtml(formatAmount(total))}</strong></div>
              <div class="item">${nextPaymentVal}</div>
            </div>
          </div>
        </div>`;
      }).join("")}</div>
    </div>
  </div>`;

  const toggleRow = (row) => {
    const key = row.getAttribute("data-subscription-toggle");
    const details = list.querySelector(`[data-subscription-details="${key}"]`);
    if (!details) return;
    const expanded = row.getAttribute("aria-expanded") === "true";
    row.setAttribute("aria-expanded", String(!expanded));
    details.classList.toggle("is-hidden", expanded);
  };
  list.onclick = (event) => {
    const row = event.target.closest?.("[data-subscription-toggle]");
    if (row) toggleRow(row);
  };
  list.onkeydown = (event) => {
    const row = event.target.closest?.("[data-subscription-toggle]");
    if (row && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      toggleRow(row);
    }
  };
}

function renderGiftHistory(records) {
  const list = get("gift-list");
  if (!list) return;
  if (!records.length) {
    list.innerHTML = '<p class="empty-state">No gift payments yet.</p>';
    return;
  }
  list.innerHTML = `<div class="uiverse-card-list">${records.map((record) => {
    const status = normalizedStatus(record);
    const amount = formatAmount(record.amount);
    const date = formatDate(record.date || record.createdAt);
    return `<div class="card uiverse-table-card">
      <div class="card__title">
        <span class="card__title-main">Gift for ${escapeHtml(record.recipientName || "Supporter")}</span>
        <span class="card__badge">${escapeHtml(amount)}</span>
      </div>
      <div class="card__data">
        <div class="card__right">
          <div class="item">Recipient</div>
          <div class="item">Date</div>
          <div class="item">Reference</div>
          <div class="item">Amount</div>
          <div class="item">Status</div>
        </div>
        <div class="card__left">
          <div class="item">${escapeHtml(record.recipientName || "Supporter")}</div>
          <div class="item">${escapeHtml(date)}</div>
          <div class="item"><span class="table-ref-code">${escapeHtml(record.reference || record.id || "—")}</span></div>
          <div class="item"><strong>${escapeHtml(amount)}</strong></div>
          <div class="item"><span class="status-pill ${paymentStatusClass(status)}">${escapeHtml(statusLabel(status))}</span></div>
        </div>
      </div>
    </div>`;
  }).join("")}</div>`;
}

function allRawRecords() {
  const records = [...subscriberRecords.values(), paymentRecords, testPaymentRecords, paymentIntents].flat();
  const unique = new Map();
  records.forEach((record) => {
    const key = `${record.path || record.source || "record"}/${record.id || record.reference || `${record.date}-${record.amount}`}`;
    if (!unique.has(key)) unique.set(key, record);
  });
  return [...unique.values()].sort((a, b) => Number(b.date || 0) - Number(a.date || 0));
}

function allRecords() {
  const raw = allRawRecords();
  const subGroups = buildSubscriptionGroups(raw);
  const subCharges = subGroups.flatMap((group) => group.charges);
  const nonSubRecords = raw.filter((record) => !isSubscriptionRecord(record));
  const combined = [...subCharges, ...nonSubRecords];
  const unique = new Map();
  combined.forEach((record) => {
    const key = `${record.path || record.source || "record"}/${record.id || record.reference || `${record.date}-${record.amount}-${record.status}`}`;
    if (!unique.has(key)) unique.set(key, record);
  });
  return [...unique.values()].sort((a, b) => Number(b.date || b.paidAt || b.createdAt || 0) - Number(a.date || a.paidAt || a.createdAt || 0));
}

function findActiveSubscription(records) {
  const roots = records.filter(isSubscriptionRootRecord);
  return roots.find((r) => ["active", "paused"].includes(normalizedStatus(r))) || null;
}

function findLatestCancelledSubscription(records) {
  const roots = records.filter(isSubscriptionRootRecord);
  return roots
    .filter((r) => normalizedStatus(r) === "cancelled")
    .sort((a, b) => Number(b.cancelledAt || b.endedAt || b.date || 0) - Number(a.cancelledAt || a.endedAt || a.date || 0))[0] || null;
}

function findPrimarySubscription(records) {
  const roots = records.filter(isSubscriptionRootRecord);
  const priority = { active: 0, paused: 1, pending: 2, cancelled: 3 };
  return roots.sort((a, b) => (priority[normalizedStatus(a)] ?? 4) - (priority[normalizedStatus(b)] ?? 4) || Number(b.date || 0) - Number(a.date || 0))[0] || null;
}

function renderRecords() {
  const raw = allRawRecords();
  const records = allRecords();
  const paidRecords = records.filter(isConfirmedPayment);
  const subscriptionRecords = records.filter(isSubscriptionRecord);
  const monthlyPaid = subscriptionRecords.filter(isConfirmedPayment);
  const oneTimePaid = paidRecords.filter((record) => ["one-time", "one_time"].includes(record.type));
  const giftRecords = records.filter((record) => ["gift-monthly", "gift-subscription"].includes(record.type));
  const giftPaid = giftRecords.filter(isConfirmedPayment);
  const otherRecords = records.filter((record) => !isSubscriptionRecord(record));
  const otherPaid = otherRecords.filter(isConfirmedPayment);
  const total = paidRecords.reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
  const monthlyTotal = monthlyPaid.reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
  const oneTimeTotal = oneTimePaid.reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
  const giftTotal = giftPaid.reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
  const otherTotal = otherPaid.reduce((sum, record) => sum + (Number(record.amount) || 0), 0);

  const activeSub = findActiveSubscription(raw);
  cancelledSubscription = findLatestCancelledSubscription(raw);
  monthlyIntent = raw.find((record) => isSubscriptionRecord(record) && normalizedStatus(record) === "pending") || null;
  primarySubscription = activeSub || cancelledSubscription || null;

  setText("total-paid", `${paidRecords.length} contribution${paidRecords.length === 1 ? "" : "s"} · ${formatAmount(total)}`);
  setText("active-monthly", `${monthlyPaid.length} contribution${monthlyPaid.length === 1 ? "" : "s"} · ${formatAmount(monthlyTotal)}`);
  setText("subscription-payment-count", `${monthlyPaid.length} contribution${monthlyPaid.length === 1 ? "" : "s"} · ${formatAmount(monthlyTotal)}`);
  setText("one-time-count", `${oneTimePaid.length} contribution${oneTimePaid.length === 1 ? "" : "s"} · ${formatAmount(oneTimeTotal)}`);
  setText("gift-count", `${giftRecords.length} contribution${giftRecords.length === 1 ? "" : "s"} · ${formatAmount(giftTotal)}`);
  setText("record-count", `${records.length} record${records.length === 1 ? "" : "s"}`);

  const status = activeSub
    ? normalizedStatus(activeSub)
    : cancelledSubscription
      ? "cancelled"
      : monthlyIntent
        ? "pending"
        : "none";
  const stateText = status === "active" ? "Active" : status === "paused" ? "Paused" : status === "cancelled" ? "Cancelled" : status === "pending" ? "Pending" : "No active subscription";

  setText("quick-stat-total", formatAmount(total));
  setText("quick-stat-count", `${paidRecords.length} confirmed contribution${paidRecords.length === 1 ? "" : "s"}`);
  setText("quick-stat-plan", activeSub ? `${formatAmount(activeSub.amount || 100)} / mo` : (status === "pending" ? `${formatAmount(monthlyIntent?.amount || 100)} / mo` : (cancelledSubscription ? "None" : `${formatAmount(selectedDashboardPlanAmount)} / mo`)));
  setText("quick-stat-plan-status", activeSub ? "Active supporter" : (status === "pending" ? "Payment pending" : (cancelledSubscription ? "Subscription ended" : "Not subscribed")));

  if (activeSub && activeSub.nextPaymentDue) {
    setText("quick-stat-renewal", formatDateOnly(activeSub.nextPaymentDue));
    setText("quick-stat-renewal-sub", "Next scheduled renewal");
  } else if (cancelledSubscription) {
    const ended = cancelledSubscription.endedAt || cancelledSubscription.cancelledAt || cancelledSubscription.date;
    setText("quick-stat-renewal", "Cancelled");
    setText("quick-stat-renewal-sub", `Ended ${formatDateOnly(ended)}`);
  } else if (status === "pending") {
    setText("quick-stat-renewal", "Pending");
    setText("quick-stat-renewal-sub", "Awaiting confirmation");
  } else {
    setText("quick-stat-renewal", "—");
    setText("quick-stat-renewal-sub", "Start subscription anytime");
  }

  const statusPill = get("dashboard-status-pill");
  if (statusPill) {
    statusPill.textContent = status === "active" ? "Active Supporter" : status === "paused" ? "Subscription Paused" : status === "cancelled" ? "Cancelled" : status === "pending" ? "Payment Pending" : "Supporter Account";
    statusPill.className = `dashboard-status-indicator status-${status}`;
  }

  const subBadgePill = get("subscription-badge-pill");
  if (subBadgePill) {
    subBadgePill.textContent = status === "active" ? "Active Plan" : status === "paused" ? "Paused" : status === "cancelled" ? "Cancelled" : status === "pending" ? "Pending" : "Inactive";
    subBadgePill.className = `status-pill ${paymentStatusClass(status)}`;
  }

  const planPickerWrap = get("dash-plan-picker-wrap");
  if (planPickerWrap) {
    planPickerWrap.classList.toggle("is-hidden", Boolean(activeSub));
  }
  renderCustomPlanBanner();

  let subscriptionSummary = "";
  if (activeSub) {
    subscriptionSummary = `Active · ${formatAmount(activeSub.amount || 100)}/mo · started ${formatDateTime(activeSub.date)}${activeSub.nextPaymentDue ? ` · next renewal ${formatDateOnly(activeSub.nextPaymentDue)}` : ""}`;
  } else if (cancelledSubscription) {
    const ended = cancelledSubscription.endedAt || cancelledSubscription.cancelledAt || cancelledSubscription.date;
    subscriptionSummary = `Your monthly subscription ended on ${formatDateTime(ended)}. You can start a new monthly subscription anytime.`;
  } else if (status === "pending") {
    subscriptionSummary = (isDevelopmentMode || isPreviewMode)
      ? "Subscription request pending. Click 'Activate subscription (Test)' to confirm and activate."
      : "Subscription request pending. Payment confirmation is still required to activate it.";
  } else {
    subscriptionSummary = `No monthly subscription yet. Start with ₹${selectedDashboardPlanAmount.toLocaleString("en-IN")} per month.`;
  }
  setText("subscription-summary", subscriptionSummary);


  const toggle = get("subscription-toggle");
  if (toggle) {
    const isTestablePending = Boolean(monthlyIntent) && !activeSub && (isDevelopmentMode || isPreviewMode);
    setPosButtonDisabled(toggle, Boolean(monthlyIntent) && !activeSub && !isTestablePending);
    const label = status === "active"
      ? "Pause"
      : status === "paused"
        ? "Resume"
        : status === "pending"
          ? (isTestablePending ? "Activate (Test)" : "Payment pending")
          : status === "cancelled"
            ? "Subscribe"
            : "Subscribe";
    setPosButtonText(toggle, label);
    toggle.setAttribute("data-state", status === "active" ? "pause" : status === "paused" ? "resume" : "subscribe");
  }
  const cancel = get("subscription-cancel");
  if (cancel) {
    const isCancelable = (!activeSub && monthlyIntent) || (activeSub && ["active", "paused"].includes(normalizedStatus(activeSub)));
    cancel.disabled = !isCancelable;
  }

  setText("gift-summary", giftRecords.length ? `${giftPaid.length} confirmed gift${giftPaid.length === 1 ? "" : "s"} for other supporters.` : "Gift payments made for another supporter will appear here.");
  renderGiftHistory(giftRecords);
  renderSubscriptionPayments(raw);
  renderTableSection(records, "all-payments-body", "all-payments-cards", "all-payments-badge", "No transactions recorded yet.");
  renderTableSection(oneTimePaid, "one-time-body", "one-time-cards", "one-time-badge", "No one-time payments yet.");
  setText("dashboard-note", records.length ? "Confirmed payments count toward totals. Pending requests stay visible until payment is confirmed." : "Your confirmed and pending payments will appear here.");
}

document.addEventListener("click", (event) => {
  const btn = event.target.closest?.(".view-toggle-btn");
  if (!btn) return;
  const target = btn.getAttribute("data-view-target");
  const view = btn.getAttribute("data-view");
  if (!target || !view) return;

  const wrap = btn.closest(".payments-table-wrap, .subscription-table-wrap");
  if (!wrap) return;

  wrap.querySelectorAll(".view-toggle-btn").forEach((b) => b.classList.remove("is-active"));
  btn.classList.add("is-active");

  const tableContainer = wrap.querySelector(".table-view-container");
  const cardContainer = wrap.querySelector(".card-view-container");

  if (view === "cards") {
    tableContainer?.classList.add("is-hidden");
    cardContainer?.classList.remove("is-hidden");
  } else {
    tableContainer?.classList.remove("is-hidden");
    cardContainer?.classList.add("is-hidden");
  }
});

function showDatabaseError(error) {
  console.error("Unable to load supporter records:", error);
  setText("dashboard-note", "Your account is ready, but the supporter records could not be loaded.");
}

document.querySelectorAll('input[name="dash-autopay-tier"]').forEach((input) => {
  input.addEventListener("change", (e) => {
    selectedDashboardPlanAmount = Number(e.target.value) || 100;
    const button = get("subscription-toggle");
    if (button && !isPosButtonDisabled(button) && (getPosButtonText(button).includes("Start") || getPosButtonText(button).includes("Transaction"))) {
      setPosButtonText(button, "Subscribe");
    }
  });
});

async function startMonthlySubscription() {
  const activeOrPending = allRawRecords().find((record) => isSubscriptionRootRecord(record) && ["active", "paused", "pending"].includes(normalizedStatus(record)));
  if (!currentUser || activeOrPending) return;
  const button = get("subscription-toggle");
  const message = get("subscription-message");
  if (button) setPosButtonDisabled(button, true);
  if (message) {
    message.textContent = "Setting up monthly subscription…";
    message.classList.remove("error");
  }
  const now = Date.now();
  const nextPayment = nextMonthTimestamp(now);
  const intentAmount = monthlyIntent && Number(monthlyIntent.amount) > 0 ? Number(monthlyIntent.amount) : null;
  const effectiveAmount = intentAmount || selectedDashboardPlanAmount || 100;

  try {
    if (isPreviewMode) {
      const newSubId = `sub-${now}`;
      const newRoot = {
        id: newSubId,
        path: "subscribers",
        source: "subscribers",
        type: "monthly",
        amount: effectiveAmount,
        subscriptionStatus: "active",
        status: "active",
        email: currentUser.email,
        name: currentUser.displayName,
        date: now,
        createdAt: now,
        nextPaymentDue: nextPayment,
        isSubscriptionRoot: true,
      };
      const existingSubs = subscriberRecords.get("subscribers") || [];
      subscriberRecords.set("subscribers", [newRoot, ...existingSubs]);

      const newPaymentId = `pay-${now}`;
      paymentRecords.unshift({
        id: newPaymentId,
        path: `payments/${currentUser.uid}`,
        type: "monthly",
        reference: `MS-SUB-${Math.floor(2000 + Math.random() * 8000)}`,
        amount: effectiveAmount,
        status: "paid",
        subscriptionStatus: "active",
        date: now,
        paidAt: now,
        createdAt: now,
        subscriptionId: newSubId,
        nextPaymentDue: nextPayment,
        note: "Initial contribution",
      });

      if (message) message.textContent = "Monthly subscription is now active!";
      renderRecords();
      return;
    }

    const res = await fetch(`${BACKEND_URL}/create-subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: effectiveAmount,
        user_id: currentUser.uid,
        email: currentUser.email || "",
        name: currentUser.displayName || "",
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
      description: `₹${effectiveAmount.toLocaleString("en-IN")} Monthly Support`,
      image: "https://raw.githubusercontent.com/cleanindiadrive/cleanindiadrive.github.io/main/Group%201.png",
      prefill: {
        name: currentUser.displayName || "",
        email: currentUser.email || "",
        contact: currentUserPhone || "",
      },
      theme: { color: "#FFDD00" },
      handler: function (response) {
        console.log("Subscription mandate created in dashboard:", response);
        if (message) message.textContent = "Mandate setup complete! Your recurring subscription is active. Thank you!";
        renderRecords();
      },
      modal: {
        ondismiss: function () {
          if (button) setPosButtonDisabled(button, false);
          if (message) message.textContent = "Payment window closed.";
        },
      },
    };

    if (typeof window.Razorpay === "function") {
      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", function (resp) {
        console.error("Dashboard subscription failed:", resp.error);
        if (message) {
          message.textContent = `Payment failed: ${resp.error.description || resp.error.reason || "Please try again."}`;
          message.classList.add("error");
        }
        if (button) setPosButtonDisabled(button, false);
      });
      rzp.open();
    } else {
      throw new Error("Razorpay SDK is not loaded. Please refresh.");
    }

  } catch (error) {
    console.error("Unable to start monthly subscription:", error);
    if (message) {
      message.textContent = "Could not start your monthly subscription. Please try again.";
      message.classList.add("error");
    }
  } finally {
    if (button) setPosButtonDisabled(button, false);
  }
}

const dashSubToggle = get("subscription-toggle");
let isSubToggling = false;
dashSubToggle?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (isSubToggling || !currentUser || isPosButtonDisabled(dashSubToggle)) return;
  const records = allRawRecords();
  const activeSub = records.find((record) => isSubscriptionRootRecord(record) && ["active", "paused"].includes(normalizedStatus(record)));
  const isPausing = Boolean(activeSub && normalizedStatus(activeSub) === "active");

  if (!activeSub) {
    isSubToggling = true;
    playPosTransactionAnimation(dashSubToggle, async () => {
      try {
        await startMonthlySubscription();
      } finally {
        isSubToggling = false;
      }
    }, false);
    return;
  }

  isSubToggling = true;
  const message = get("subscription-message");
  if (message) {
    message.textContent = isPausing ? "Pausing subscription…" : "Resuming subscription…";
    message.classList.remove("error");
  }

  // Play animation (reverse if pausing, forward if resuming) and execute state change on complete
  playPosTransactionAnimation(dashSubToggle, async () => {
    try {
      const nextStatus = isPausing ? "paused" : "active";
      if (isPreviewMode) {
        activeSub.subscriptionStatus = nextStatus;
        activeSub.status = nextStatus;
        if (nextStatus === "paused") activeSub.pausedAt = Date.now();
        else activeSub.resumedAt = Date.now();
        if (message) message.textContent = `Subscription ${nextStatus}.`;
        renderRecords();
      } else {
        const subId = String(activeSub.subscriptionId || activeSub.id || "").trim();
        if (subId.startsWith("sub_")) {
          const endpoint = isPausing ? "pause-subscription" : "resume-subscription";
          const res = await fetch(`${BACKEND_URL}/${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription_id: subId }),
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Failed to ${isPausing ? "pause" : "resume"} subscription in Razorpay`);
          }
        }
        await update(ref(database, `${activeSub.path}/${activeSub.id}`), {
          subscriptionStatus: nextStatus,
          status: nextStatus,
          ...(nextStatus === "paused" ? { pausedAt: Date.now() } : { resumedAt: Date.now() }),
        });
        if (message) message.textContent = `Subscription ${nextStatus}.`;
      }
    } catch (error) {
      console.error("Unable to update subscription:", error);
      if (message) {
        message.textContent = "Could not update your subscription. Please try again.";
        message.classList.add("error");
      }
    } finally {
      isSubToggling = false;
    }
  }, isPausing);
});

dashSubToggle?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    dashSubToggle.click();
  }
});



function closeCancelModal() { get("cancel-modal")?.classList.add("is-hidden"); }

async function executeCancelSubscription() {
  const records = allRawRecords();
  const activeSub = records.find((record) => isSubscriptionRootRecord(record) && ["active", "paused"].includes(normalizedStatus(record)));
  if (!activeSub && !monthlyIntent) return;
  const message = get("subscription-message");
  if (message) {
    message.textContent = activeSub ? "Cancelling monthly subscription…" : "Cancelling subscription request…";
    message.classList.remove("error");
  }
  const now = Date.now();
  try {
    if (!activeSub && monthlyIntent) {
      if (monthlyIntent.path && monthlyIntent.id) {
        try {
          await remove(ref(database, `${monthlyIntent.path}/${monthlyIntent.id}`));
        } catch (_) {}
      }
      paymentIntents = paymentIntents.filter((item) => item.id !== monthlyIntent.id);
      monthlyIntent = null;
      closeCancelModal();
      if (message) message.textContent = "Your pending subscription request has been cancelled.";
      renderRecords();
      return;
    }

    if (isPreviewMode) {
      activeSub.subscriptionStatus = "cancelled";
      activeSub.status = "cancelled";
      activeSub.cancelledAt = now;
      activeSub.endedAt = now;
      activeSub.nextPaymentDue = null;
      for (const list of subscriberRecords.values()) {
        const item = list.find((s) => s.id === activeSub.id);
        if (item) {
          item.subscriptionStatus = "cancelled";
          item.status = "cancelled";
          item.cancelledAt = now;
          item.endedAt = now;
          item.nextPaymentDue = null;
        }
      }
      paymentRecords.unshift({
        id: `cancel-${now}`,
        path: `payments/${currentUser.uid}`,
        type: "cancellation",
        isCancellation: true,
        reference: "—",
        amount: null,
        status: "cancelled",
        subscriptionStatus: "cancelled",
        date: now,
        paidAt: now,
        createdAt: now,
        subscriptionId: activeSub.id,
        note: "Subscription cancelled",
      });
      closeCancelModal();
      if (message) message.textContent = "Your subscription has been cancelled. Your past contributions remain safely saved in your account history.";
      renderRecords();
      return;
    }

    const subId = String(activeSub.subscriptionId || activeSub.id || "").trim();
    if (subId.startsWith("sub_")) {
      const res = await fetch(`${BACKEND_URL}/cancel-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id: subId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to cancel subscription in Razorpay");
      }
    }

    await update(ref(database, `${activeSub.path}/${activeSub.id}`), {
      subscriptionStatus: "cancelled",
      status: "cancelled",
      cancelledAt: now,
      endedAt: now,
      nextPaymentDue: null,
    });
    const cancelRef = push(ref(database, activeSub.isTest ? "testPayments" : `payments/${currentUser.uid}`));
    await set(cancelRef, {
      type: "cancellation",
      isCancellation: true,
      amount: null,
      status: "cancelled",
      isTest: Boolean(activeSub.isTest),
      email: currentUser.email || "",
      createdAt: now,
      date: now,
      subscriptionId: activeSub.id,
      reference: "—",
      note: "Subscription cancelled",
    });
    closeCancelModal();
    if (message) message.textContent = "Your subscription has been cancelled. Your past contributions remain safely saved in your account history.";
    renderRecords();
  } catch (error) {
    console.error("Unable to cancel subscription:", error);
    if (message) {
      message.textContent = "Could not cancel your subscription. Please try again.";
      message.classList.add("error");
    }
  }
}

function openCancelModal() { get("cancel-modal")?.classList.remove("is-hidden"); }

const cancelBtn = get("subscription-cancel");
cancelBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (cancelBtn.disabled) return;
  const records = allRawRecords();
  const activeSub = records.find((record) => isSubscriptionRootRecord(record) && ["active", "paused"].includes(normalizedStatus(record)));
  if (!activeSub && !monthlyIntent) return;
  openCancelModal();
});

get("cancel-modal-close")?.addEventListener("click", closeCancelModal);
get("cancel-modal-keep")?.addEventListener("click", closeCancelModal);
get("cancel-modal")?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLElement && event.target.hasAttribute("data-cancel-dismiss")) closeCancelModal();
});
get("cancel-modal-confirm")?.addEventListener("click", executeCancelSubscription);

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
  return val || "Not provided";
}

function openPhoneModal(isCompulsory = false) {
  const modal = get("phone-modal");
  const closeBtn = get("phone-modal-close");
  const errorEl = get("modal-phone-error");
  const phoneInput = get("modal-phone-input");
  if (!modal) return;

  modal.dataset.compulsory = isCompulsory ? "true" : "false";

  if (errorEl) {
    errorEl.textContent = "";
    errorEl.classList.add("is-hidden");
  }

  if (closeBtn) {
    closeBtn.classList.toggle("is-hidden", isCompulsory);
  }

  if (phoneInput) {
    const cur = get("dashboard-phone")?.textContent || "";
    const digits = cleanIndianPhone(cur);
    phoneInput.value = digits.length === 10 ? digits : "";
  }

  modal.classList.remove("is-hidden");
  phoneInput?.focus();
}

function closePhoneModal() {
  const modal = get("phone-modal");
  if (!modal) return;
  const curText = get("dashboard-phone")?.textContent || "";
  const digits = cleanIndianPhone(curText);
  if (modal.dataset.compulsory === "true" && !isValidIndianPhone(digits)) {
    return; // Compulsory: cannot close without entering a valid phone
  }
  modal.classList.add("is-hidden");
}

get("dashboard-edit-phone-btn")?.addEventListener("click", () => openPhoneModal(false));
get("phone-modal-close")?.addEventListener("click", closePhoneModal);
get("phone-modal-backdrop")?.addEventListener("click", () => {
  const modal = get("phone-modal");
  if (modal?.dataset.compulsory !== "true") {
    closePhoneModal();
  }
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const modal = get("phone-modal");
    if (modal && !modal.classList.contains("is-hidden") && modal.dataset.compulsory !== "true") {
      closePhoneModal();
    }
  }
});

get("phone-modal-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const phoneInput = get("modal-phone-input");
  const errorEl = get("modal-phone-error");
  const submitBtn = get("modal-phone-submit");
  const raw = String(phoneInput?.value || "").trim();
  const clean = cleanIndianPhone(raw);

  if (!clean) {
    if (errorEl) {
      errorEl.textContent = "Mobile number is compulsory. Please enter your 10-digit mobile number.";
      errorEl.classList.remove("is-hidden");
    }
    phoneInput?.focus();
    return;
  }
  if (clean.length < 10) {
    if (errorEl) {
      errorEl.textContent = `Mobile number is too short (${clean.length}/10 digits). Please enter a full 10-digit number.`;
      errorEl.classList.remove("is-hidden");
    }
    phoneInput?.focus();
    return;
  }
  if (clean.length > 10) {
    if (errorEl) {
      errorEl.textContent = `Mobile number is too long (${clean.length} digits). Please enter a 10-digit number.`;
      errorEl.classList.remove("is-hidden");
    }
    phoneInput?.focus();
    return;
  }
  if (!/^[6-9]/.test(clean)) {
    if (errorEl) {
      errorEl.textContent = "Please enter a valid Indian mobile number starting with 6, 7, 8, or 9.";
      errorEl.classList.remove("is-hidden");
    }
    phoneInput?.focus();
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  try {
    if (isPreviewMode) {
      currentUser.phone = clean;
      setText("dashboard-phone", formatIndianPhone(clean));
      get("phone-modal")?.removeAttribute("data-compulsory");
      closePhoneModal();
    } else if (currentUser) {
      await update(ref(database, `users/${currentUser.uid}`), {
        phone: clean,
        name: currentUser.displayName || "",
        email: currentUser.email || "",
        updatedAt: Date.now(),
      });
      setText("dashboard-phone", formatIndianPhone(clean));
      get("phone-modal")?.removeAttribute("data-compulsory");
      closePhoneModal();
    }
  } catch (err) {
    console.error("Unable to save phone number:", err);
    if (errorEl) {
      errorEl.textContent = "Could not save phone number. Please try again.";
      errorEl.classList.remove("is-hidden");
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

const urlParams = new URLSearchParams(window.location.search);
const isPreviewMode = urlParams.get("preview") === "1" || urlParams.get("demo") === "1";

if (isPreviewMode) {
  currentUser = {
    uid: "demo-supporter-1",
    email: "supporter@manalistrays.org",
    displayName: "Arjun Sharma",
    phone: "9876543210",
    emailVerified: true,
  };
  setText("dashboard-user-email", currentUser.email);
  setText("dashboard-email", currentUser.email);
  setText("dashboard-name", "Arjun");
  setText("dashboard-phone", formatIndianPhone(currentUser.phone));
  const avatar = get("account-avatar");
  if (avatar) avatar.textContent = "A";

  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  subscriberRecords.set("subscribers", [{
    id: "sub-101",
    path: "subscribers",
    source: "subscribers",
    type: "monthly",
    amount: 100,
    subscriptionStatus: "active",
    status: "active",
    email: currentUser.email,
    name: currentUser.displayName,
    date: now - thirtyDays * 2,
    createdAt: now - thirtyDays * 2,
    nextPaymentDue: now + thirtyDays,
    isSubscriptionRoot: true,
  }]);

  paymentRecords = [
    {
      id: "pay-101",
      path: "payments/demo-supporter-1",
      type: "monthly",
      reference: "MS-SUB-1001",
      amount: 100,
      status: "paid",
      subscriptionStatus: "active",
      date: now - thirtyDays * 2,
      createdAt: now - thirtyDays * 2,
      subscriptionId: "sub-101",
      note: "Initial contribution",
    },
    {
      id: "pay-102",
      path: "payments/demo-supporter-1",
      type: "monthly",
      reference: "MS-REC-1002",
      amount: 100,
      status: "paid",
      subscriptionStatus: "active",
      date: now - thirtyDays,
      createdAt: now - thirtyDays,
      subscriptionId: "sub-101",
      nextPaymentDue: now + thirtyDays,
      note: "Monthly renewal",
    },
    {
      id: "pay-201",
      path: "payments/demo-supporter-1",
      type: "one-time",
      reference: "MS-DON-8841",
      amount: 500,
      status: "paid",
      date: now - 14 * 24 * 60 * 60 * 1000,
      createdAt: now - 14 * 24 * 60 * 60 * 1000,
      note: "Emergency care & food supplies",
    },
    {
      id: "pay-301",
      path: "payments/demo-supporter-1",
      type: "gift-monthly",
      reference: "MS-GIFT-4490",
      amount: 100,
      status: "paid",
      recipientName: "Neha Patel",
      date: now - 5 * 24 * 60 * 60 * 1000,
      createdAt: now - 5 * 24 * 60 * 60 * 1000,
      note: "Gifted subscription for Neha",
    }
  ];

  const demoCustom = urlParams.get("customAmount");
  if (demoCustom) {
    userCustomPlan = {
      amount: Number(demoCustom),
      title: urlParams.get("customTitle") || "Special Patron Autopay",
      note: "Custom recurring support tier configured exclusively for your account by admin.",
      enabled: true
    };
  }

  renderRecords();
} else {
  onAuthStateChanged(auth, (user) => {
    if (!user || !user.emailVerified) {
      window.location.replace("user-login.html");
      return;
    }
    currentUser = user;
    const email = String(user.email || "").trim().toLowerCase();
    setText("dashboard-user-email", user.email || "");
    setText("dashboard-email", user.email || "");
    const displayName = user.displayName || email.split("@")[0] || "supporter";
    setText("dashboard-name", displayName.split(" ")[0]);
    const avatar = get("account-avatar");
    if (avatar) {
      avatar.textContent = displayName.charAt(0);
      if (user.photoURL) {
        const image = document.createElement("img");
        image.src = user.photoURL;
        image.alt = "";
        image.referrerPolicy = "no-referrer";
        avatar.replaceChildren(image);
      }
    }

    // Compulsory check: enforce mobile number for existing and upcoming users
    onValue(ref(database, `users/${user.uid}`), (snapshot) => {
      const userData = snapshot.val() || {};
      const savedPhone = cleanIndianPhone(userData.phone);
      currentUserPhone = savedPhone || cleanIndianPhone(user.phoneNumber) || "";
      if (isValidIndianPhone(savedPhone)) {
        setText("dashboard-phone", formatIndianPhone(savedPhone));
        get("phone-modal")?.removeAttribute("data-compulsory");
        closePhoneModal();
      } else {
        setText("dashboard-phone", "Mobile not provided");
        openPhoneModal(true); // Compulsory modal for existing accounts missing a valid phone
      }
    });

    onValue(ref(database, "subscribers_velcrow"), (snapshot) => { subscriberRecords.set("subscribers_velcrow", normalizeSubscriberRecords(snapshot.val(), "subscribers", "subscribers_velcrow", email)); renderRecords(); }, showDatabaseError);
    onValue(ref(database, "subscribers"), (snapshot) => { subscriberRecords.set("subscribers", normalizeSubscriberRecords(snapshot.val(), "subscribers", "subscribers", email)); renderRecords(); }, showDatabaseError);
    onValue(ref(database, `payments/${user.uid}`), (snapshot) => { paymentRecords = normalizeUidRecords(snapshot.val(), "payment", `payments/${user.uid}`); renderRecords(); }, () => {});
    onValue(ref(database, "testPayments"), (snapshot) => { testPaymentRecords = normalizeUidRecords(snapshot.val(), "test-payment", "testPayments").filter((record) => String(record.email || "").trim().toLowerCase() === email); renderRecords(); }, () => {});
    onValue(ref(database, `paymentIntents/${user.uid}`), (snapshot) => { paymentIntents = normalizeUidRecords(snapshot.val(), "intent", `paymentIntents/${user.uid}`); renderRecords(); }, () => {});

    // Listen for exclusive custom plan assigned by admin
    onValue(ref(database, `customPlans/${user.uid}`), (snapshot) => {
      userCustomPlan = snapshot.val();
      renderCustomPlanBanner();
      renderRecords();
    }, () => {});
  });
}

// Plan selection & exclusive button event listeners
get("dash-exclusive-btn")?.addEventListener("click", () => {
  if (userCustomPlan && Number(userCustomPlan.amount) > 0) {
    selectedDashboardPlanAmount = Number(userCustomPlan.amount);
    document.querySelectorAll(".dash-plan-btn").forEach((b) => b.classList.remove("active"));
    toggleMonthlySubscription();
  }
});

document.querySelectorAll(".dash-plan-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const amt = Number(btn.dataset.amount) || 100;
    selectedDashboardPlanAmount = amt;
    document.querySelectorAll(".dash-plan-btn").forEach((b) => b.classList.toggle("active", Number(b.dataset.amount) === amt));
    renderRecords();
  });
});

get("logout-button")?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.replace("user-login.html");
});

