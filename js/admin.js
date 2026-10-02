import { onValue, ref, remove, set, update } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";
import { database } from "./firebase-client.js";

const usersMap = new Map();
const customPlansMap = new Map();
let searchQuery = "";

const tableBody = document.getElementById("table-body");
const searchInput = document.getElementById("search-input");
const targetIdInput = document.getElementById("target-id");
const targetAmountInput = document.getElementById("target-amount");
const saveQuickBtn = document.getElementById("btn-save-quick");
const toast = document.getElementById("toast");

function showToast(msg) {
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function escapeHtml(val) {
  return String(val ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// 1. Listen to users
onValue(ref(database, "users"), (snapshot) => {
  const data = snapshot.val() || {};
  usersMap.clear();
  Object.entries(data).forEach(([uid, u]) => {
    usersMap.set(uid, {
      uid,
      name: u?.name || u?.fullName || "Supporter",
      email: (u?.email || "").toLowerCase(),
    });
  });
  renderTable();
});

// 2. Listen to customPlans
onValue(ref(database, "customPlans"), (snapshot) => {
  const data = snapshot.val() || {};
  customPlansMap.clear();
  Object.entries(data).forEach(([uid, plan]) => {
    if (plan && Number(plan.amount) > 0) {
      customPlansMap.set(uid, Number(plan.amount));
    }
  });
  renderTable();
});

// Render table
function renderTable() {
  if (!tableBody) return;
  const list = Array.from(usersMap.values());
  const query = searchQuery.toLowerCase().trim();

  const filtered = list.filter((u) => {
    return !query || u.name.toLowerCase().includes(query) || u.email.includes(query) || u.uid.includes(query);
  });

  if (!filtered.length) {
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--muted); padding: 1.5rem;">No accounts found.</td></tr>`;
    return;
  }

  tableBody.innerHTML = filtered.map((u) => {
    const currentAmt = customPlansMap.get(u.uid);
    const hasCustom = Boolean(currentAmt);

    return `
      <tr>
        <td>
          <div class="user-name">${escapeHtml(u.name)}</div>
          <div class="user-email">${escapeHtml(u.email || u.uid)}</div>
        </td>
        <td>
          ${hasCustom ? `<span class="custom-tag">₹${currentAmt.toLocaleString("en-IN")}/mo</span>` : `<span style="color: var(--muted);">Standard (₹100)</span>`}
        </td>
        <td>
          <input type="number" class="amount-mini" id="input-${escapeHtml(u.uid)}" value="${hasCustom ? currentAmt : 2500}" min="1" />
        </td>
        <td>
          <div class="row-actions">
            <button type="button" onclick="window.savePlan('${escapeHtml(u.uid)}')">Save</button>
            ${hasCustom ? `<button type="button" class="btn-danger" onclick="window.clearPlan('${escapeHtml(u.uid)}')">Clear</button>` : ""}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

searchInput?.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderTable();
});

// Save custom plan for a UID
async function savePlanForUid(uid, amount, name = "") {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    alert("Please enter a valid amount in ₹");
    return;
  }

  const now = Date.now();
  await set(ref(database, `customPlans/${uid}`), {
    amount: amt,
    enabled: true,
    updatedAt: now,
    name,
  });

  if (usersMap.has(uid)) {
    await update(ref(database, `users/${uid}`), {
      customAutopayAmount: amt,
      updatedAt: now,
    });
  }

  customPlansMap.set(uid, amt);
  renderTable();
  showToast(`Saved custom autopay of ₹${amt.toLocaleString("en-IN")}/mo!`);
}

window.savePlan = (uid) => {
  const input = document.getElementById(`input-${uid}`);
  const amt = input ? input.value : 2500;
  const user = usersMap.get(uid);
  savePlanForUid(uid, amt, user?.name || "");
};

window.clearPlan = async (uid) => {
  if (!confirm("Remove custom amount for this user?")) return;
  await remove(ref(database, `customPlans/${uid}`));
  if (usersMap.has(uid)) {
    await update(ref(database, `users/${uid}`), {
      customAutopayAmount: null,
    });
  }
  customPlansMap.delete(uid);
  renderTable();
  showToast("Cleared custom autopay amount.");
};

// Quick form at top
saveQuickBtn?.addEventListener("click", async () => {
  const id = (targetIdInput?.value || "").trim();
  const amt = Number(targetAmountInput?.value);

  if (!id || !amt || amt <= 0) {
    alert("Please enter a valid email/UID and amount");
    return;
  }

  // Find if email matches an existing user
  let targetUid = id;
  let userName = id;
  for (const u of usersMap.values()) {
    if (u.email.toLowerCase() === id.toLowerCase() || u.uid === id) {
      targetUid = u.uid;
      userName = u.name;
      break;
    }
  }

  await savePlanForUid(targetUid, amt, userName);
  targetIdInput.value = "";
  targetAmountInput.value = "";
});
