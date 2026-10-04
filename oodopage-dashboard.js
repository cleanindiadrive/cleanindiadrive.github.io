import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
    import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
    import { getDatabase, onValue, push, ref, remove, set, update, get as fbGet } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";

    // Firebase Client Setup
    const firebaseConfig = {
        apiKey: "AIzaSyDma_UrBD5XQICj5LOu214Fu3va_7VnvDg",
        authDomain: "cleanindiadrive.github.io",
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





    const BACKEND_URL = (window.BACKEND_API_URL || "https://sillypayement.onrender.com").replace(/\/+$/, "");
    let currentUserPhone = "";
    const get = (id) => document.getElementById(id);

    function playPosTransactionAnimation(container, onComplete, reverse = false) {
        if (!container) {
            if (typeof onComplete === "function") onComplete();
            return;
        }
        if (container.classList.contains("is-disabled") || container.getAttribute("aria-disabled") === "true") {
            if (typeof onComplete === "function") onComplete();
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

        const animClass = reverse ? "is-animating-reverse" : "is-animating";
        container.classList.add(animClass);

        const animDuration = 1150;

        setTimeout(() => {
            container.classList.remove("is-animating");
            container.classList.remove("is-animating-reverse");
            if (typeof onComplete === "function") {
                try {
                    onComplete();
                } catch (err) {
                    console.error("Dashboard transaction callback error:", err);
                }
            }
        }, animDuration);
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
    let globalPaymentRecords = [];
    let testPaymentRecords = [];
    let paymentIntents = [];
    let primarySubscription = null;
    let cancelledSubscription = null;
    let monthlyIntent = null;
    let subscriptionCheckoutPending = false;
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
            // Older subscriber records stored a successfully activated
            // mandate as `paid`/`completed`/`success`. For a subscription
            // root those are active lifecycle states, not one-off payment
            // statuses.
            if (rootStatus === "completed" || record.cancelledAt || record.endedAt) return "cancelled";
            if (["paid", "success", "authenticated"].includes(rootStatus)) return "active";
            return rootStatus || fallback;
        }
        const status = String(record.status || record.subscriptionStatus || "").trim().toLowerCase();
        return status || fallback;
    }

    function isGiftRecord(record) {
        if (!record || typeof record !== "object") return false;
        const type = String(record.type || "").trim().toLowerCase().replaceAll("_", "-");
        if (type === "gift-monthly" || type === "gift-subscription" || type === "gift") return true;
        if (record.membershipType === "gift" || record.is_gift === true || record.is_gift === "true" || record.isGift === true) return true;
        if (Boolean(record.recipientName || record.recipient_name || record.gift_recipient_name) && Boolean(record.giver_email || record.donor_email || record.giver_name || record.giver_id)) return true;
        return false;
    }

    function normalizeSubscriberRecords(data, source, path, email, phone = "", userId = "") {
        if (!data || typeof data !== "object") return [];
        const normEmail = String(email || "").trim().toLowerCase();
        const normPhone = cleanIndianPhone(phone);

        return Object.entries(data).flatMap(([id, record]) => {
            if (!record || typeof record !== "object") return [];
            // Older backend writes can leave a status-only entry in the
            // secondary subscribers_velcrow node. It has no user, email, plan,
            // or gift identity and must not become a fake ₹100 subscription.
            const isStatusOnlyMirror = source === "subscribers_velcrow"
                && !record.email
                && !record.userId
                && !record.user_id
                && record.amount == null
                && !record.type
                && !record.planId
                && !record.membershipType
                && !record.is_gift
                && !record.isGift;
            if (isStatusOnlyMirror) return [];
            const recEmail = String(record.email || "").trim().toLowerCase();
            const giverEmail = String(record.giver_email || record.donor_email || record.giverEmail || record.donorEmail || "").trim().toLowerCase();
            const giverId = String(record.giver_id || record.donor_id || record.giverId || record.donorId || record.userId || "").trim();

            const recipientPhone = cleanIndianPhone(record.recipient_phone || record.gift_recipient_phone || record.phone);
            const recipientEmail = String(record.recipient_email || record.gift_recipient_email || record.email || "").trim().toLowerCase();

            const isGift = isGiftRecord(record);

            let isMatch = false;
            let giftRole = null;

            if (isGift) {
                const isDonor = Boolean((normEmail && giverEmail === normEmail) || (userId && giverId === userId));
                const isReceiver = Boolean((normEmail && (recipientEmail === normEmail || recEmail === normEmail)) || (normPhone && recipientPhone === normPhone));

                if (isDonor && isReceiver) {
                    giftRole = "both";
                    isMatch = true;
                } else if (isDonor) {
                    giftRole = "donor";
                    isMatch = true;
                } else if (isReceiver) {
                    giftRole = "receiver";
                    isMatch = true;
                }
            } else {
                if (normEmail && recEmail === normEmail) {
                    isMatch = true;
                }
            }

            if (!isMatch) return [];

            const normalizedRecord = record && typeof record === "object" ? record : {};
            const explicitStatus = normalizedStatus(normalizedRecord);
            const status = ["active", "paused", "cancelled", "pending"].includes(explicitStatus)
                ? explicitStatus
                : normalizedRecord.lastPaymentAt || normalizedRecord.subscribedAt
                    ? "active"
                    : "pending";

            const baseObj = {
                ...normalizedRecord,
                id,
                source,
                path,
                type: isGift ? "gift-monthly" : "monthly",
                amount: Number(normalizedRecord.amount) || 100,
                status,
                subscriptionStatus: status,
                date: normalizedRecord.subscribedAt || normalizedRecord.createdAt || normalizedRecord.lastPaymentAt || Date.now(),
                reference: normalizedRecord.orderId || normalizedRecord.reference || normalizedRecord.subscriptionId || id,
                subscriptionId: normalizedRecord.subscriptionId || id,
                isSubscriptionRoot: true,
                isGift,
                recipientName: normalizedRecord.recipient_name || normalizedRecord.gift_recipient_name || normalizedRecord.recipientName || (isGift ? "Supporter" : (currentUser?.displayName || "Supporter")),
                recipientEmail: normalizedRecord.recipient_email || normalizedRecord.gift_recipient_email || normalizedRecord.email || "",
                recipientPhone: normalizedRecord.recipient_phone || normalizedRecord.gift_recipient_phone || normalizedRecord.phone || "",
                donorName: normalizedRecord.giver_name || normalizedRecord.donor_name || (giverEmail ? giverEmail.split("@")[0] : "Kind Supporter"),
                donorEmail: giverEmail,
            };

            if (giftRole === "both") {
                return [
                    { ...baseObj, id: `${id}-given`, giftRole: "donor" },
                    { ...baseObj, id: `${id}-received`, giftRole: "receiver" },
                ];
            }

            return [{
                ...baseObj,
                giftRole: giftRole || (isGift ? "donor" : null),
            }];
        });
    }

    function normalizeUidRecords(data, source, path = "") {
        if (!data || typeof data !== "object") return [];
        return Object.entries(data).map(([id, record]) => {
            const normalizedRecord = record && typeof record === "object" ? record : {};
            const isGift = isGiftRecord(normalizedRecord);
            return {
                id,
                source,
                path,
                ...normalizedRecord,
                type: isGift ? "gift-monthly" : (normalizedRecord.type || "monthly"),
                isGift,
                giftRole: normalizedRecord.giftRole || (isGift ? "donor" : null),
                recipientName: normalizedRecord.recipientName || normalizedRecord.recipient_name || normalizedRecord.gift_recipient_name || "Supporter",
                status: normalizedStatus(normalizedRecord, source === "intent" ? "pending" : "unknown"),
                date: normalizedRecord.paidAt || normalizedRecord.createdAt || normalizedRecord.subscribedAt || normalizedRecord.lastPaymentAt,
                reference: normalizedRecord.reference || normalizedRecord.transactionId || normalizedRecord.orderId || id,
                isSubscriptionRoot: Boolean(normalizedRecord.subscriptionStatus) && !normalizedRecord.subscriptionId,
            };
        });
    }

    function isSubscriptionRecord(record) {
        const type = String(record?.type || "").trim().toLowerCase().replaceAll("_", "-");
        if (type === "gift-monthly" || type === "gift-subscription" || record?.isGift) return false;
        if ((record?.isCancellation || type === "cancellation") && /gift/i.test(String(record?.note || ""))) return false;
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
        if (["subscribers", "subscribers_velcrow"].includes(String(record?.path || record?.source || ""))) {
            return !isGiftRecord(record);
        }
        if (record?.subscriptionId || record?.parentSubscriptionId || record?.subscriptionPath) return false;
        return ["active", "paused", "cancelled", "pending"].includes(normalizedStatus(record));
    }

    function normalizeGlobalPaymentRecords(data, email, userId, phone = "") {
        if (!data || typeof data !== "object") return [];
        const normalizedEmail = String(email || "").trim().toLowerCase();
        const normalizedUserId = String(userId || "").trim();
        const normalizedPhone = cleanIndianPhone(phone);
        const knownSubscriptionIds = new Set(
            [...subscriberRecords.values()].flat().map((record) => getSubscriptionIdentity(record)).filter(Boolean)
        );

        return Object.entries(data).flatMap(([id, record]) => {
            if (!record || typeof record !== "object" || Array.isArray(record) || record.amount == null) return [];
            const recordEmails = [record.email, record.giver_email, record.donor_email]
                .map((value) => String(value || "").trim().toLowerCase())
                .filter(Boolean);
            const recordUserIds = [record.userId, record.user_id, record.giver_id, record.donor_id]
                .map((value) => String(value || "").trim())
                .filter(Boolean);
            const recordPhone = cleanIndianPhone(record.phone || record.recipientPhone || record.recipient_phone);
            const subscriptionId = String(record.subscriptionId || record.parentSubscriptionId || "").trim();
            const belongsToUser = (normalizedEmail && recordEmails.includes(normalizedEmail))
                || (normalizedUserId && recordUserIds.includes(normalizedUserId))
                || (normalizedPhone && recordPhone === normalizedPhone)
                || (subscriptionId && knownSubscriptionIds.has(subscriptionId));
            if (!belongsToUser) return [];
            return normalizeUidRecords({ [id]: record }, "global-payment", "payments");
        });
    }

    function isConfirmedPayment(record) {
        if (!record) return false;
        if (record.isCancellation || record.type === "cancellation") return false;
        if (record.isSubscriptionRoot) return false;
        const amount = Number(record.amount);
        if (amount <= 0 || Number.isNaN(amount) || record.amount == null) return false;
        const status = normalizedStatus(record);
        if (status === "failed" || status === "pending") return false;
        if (["paid", "completed", "success", "active"].includes(status)) return true;
        // When a subscription is started, the upfront first amount is paid at that time.
        // If the subscription is later cancelled, that initial paid transaction must continue to be counted.
        if (status === "cancelled" && !record.isCancellation && (record.paidAt || record.date || record.createdAt)) {
            return true;
        }
        return false;
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
        const rootRecords = subscriptionRecords.filter(isSubscriptionRootRecord);
        const rootsByIdentity = new Map();
        rootRecords.forEach((record) => {
            const identity = getSubscriptionReference(record) || `${record.path || record.source || "record"}/${record.id || record.reference || "root"}`;
            const existing = rootsByIdentity.get(identity);
            if (!existing) {
                rootsByIdentity.set(identity, record);
                return;
            }
            const existingTime = Number(existing.updatedAt || existing.cancelledAt || existing.endedAt || existing.date || existing.createdAt || 0);
            const recordTime = Number(record.updatedAt || record.cancelledAt || record.endedAt || record.date || record.createdAt || 0);
            if (recordTime >= existingTime) rootsByIdentity.set(identity, record);
        });
        const roots = [...rootsByIdentity.values()];
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
            // An explicit subscription ID must never be assigned to another
            // subscription just because only one root is currently loaded.
            // That fallback was mixing charges from a cancelled old plan into
            // the newly selected plan.
            if (!reference && groups.length === 1) return groups[0];
            const recordTime = Number(record?.date || record?.createdAt || record?.paidAt || 0);
            if (!reference && recordTime > 0) {
                const matching = groups.find((group) => {
                    const startTime = Number(group.subscription.date || group.subscription.createdAt || 0);
                    const endTime = Number(group.subscription.cancelledAt || group.subscription.endedAt || Infinity);
                    return recordTime >= startTime - 60000 && recordTime <= endTime + 60000;
                });
                if (matching) return matching;
            }
            return null;
        };

        subscriptionRecords.filter((record) => !rootRecords.includes(record)).forEach((record) => {
            const group = findGroup(record);
            if (group) {
                group.charges.push(record);
                return;
            }
            const reference = getSubscriptionReference(record);
            const inferredStatus = normalizedStatus(record) === "cancelled" ? "cancelled" : "active";
            const inferredSubscription = {
                ...record,
                id: reference || record.id || record.reference,
                subscriptionId: reference || record.subscriptionId || record.id || record.reference,
                type: "monthly",
                status: inferredStatus,
                subscriptionStatus: inferredStatus,
                isSubscriptionRoot: true,
                inferredSubscriptionRoot: true,
            };
            groups.push({
                key: `subscription:${reference || record.path || record.source || "record"}:${record.id || record.reference || groups.length}`,
                subscription: inferredSubscription,
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
                if (c.isCancellation || c.type === "cancellation" || normalizedStatus(c) === "cancelled" || normalizedStatus(c) === "failed") return false;
                const cTime = Number(c.date || c.paidAt || c.createdAt || 0);
                return isConfirmedPayment(c) || Math.abs(cTime - rootTime) < 60000 || /initial|first/i.test(c.note || "");
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
        const displayStatus = (status === "cancelled" && Number(record.amount) > 0 && !record.isCancellation) ? "paid" : status;
        const type = paymentTypeLabel(record);
        const date = formatDateTime(record.date || record.paidAt || record.createdAt);
        const ref = cleanReference(record.reference || record.orderId || record.id || "—");
        const amount = formatAmount(record.amount);
        const note = cleanNote(record);
        const statusHtml = `<span class="status-pill ${paymentStatusClass(displayStatus)}">${escapeHtml(statusLabel(displayStatus))}</span>`;

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
        const isCancel = record.isCancellation || record.type === "cancellation" || (status === "cancelled" && (!record.amount || Number(record.amount) <= 0));
        const displayStatus = (status === "cancelled" && Number(record.amount) > 0 && !record.isCancellation) ? "paid" : status;
        const ref = cleanReference(record.reference || record.orderId || record.id || "—");
        const note = cleanNote(record);
        return `<tr${isCancel ? ' class="charge-row-cancelled"' : ''}>
    <td>${escapeHtml(formatDateTime(record.date || record.paidAt || record.createdAt))}</td>
    <td>${escapeHtml(paymentTypeLabel(record))}</td>
    <td><span class="table-ref-code">${escapeHtml(ref)}</span>${note ? `<br><small class="record-note">${escapeHtml(note)}</small>` : ""}</td>
    <td><strong>${escapeHtml(formatAmount(record.amount))}</strong></td>
    <td><span class="status-pill ${paymentStatusClass(displayStatus)}">${escapeHtml(statusLabel(displayStatus))}</span></td>
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

        const subscriptionTabs = groups.map((group, index) => {
            const subscription = group.subscription;
            const status = normalizedStatus(subscription);
            const tabKey = `subscription-row-${index}`;
            const date = formatDateOnly(subscription.date || subscription.createdAt);
            const label = `${formatAmount(subscription.amount || 100)}/mo · ${statusLabel(status)}${date ? ` · ${date}` : ""}`;
            return `<button type="button" class="subscription-tab${index === 0 ? " is-active" : ""}" role="tab" aria-selected="${index === 0}" data-subscription-tab="${tabKey}">${escapeHtml(label)}</button>`;
        }).join("");

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
    <div class="subscription-tabs-row" role="tablist" aria-label="Subscriptions">
      ${subscriptionTabs}
    </div>
    <div class="table-view-container" id="subscription-payments-table-container">
      <div class="table-scroll-wrap">
        <table class="subscription-table">
          <thead><tr><th>Subscription</th><th>Status</th><th>Charges</th><th>Total paid</th><th>Next renewal</th><th>Action</th></tr></thead>
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

            const canPauseResume = ["active", "paused"].includes(status);
            const subId = getSubscriptionIdentity(subscription) || String(subscription.id || "").trim();
            const actionHtml = canPauseResume
                ? `<span class="subscription-row-actions">
                    ${status === "active"
                        ? `<button type="button" class="btn-pause-sub" data-sub-id="${escapeHtml(subId)}" aria-label="Pause subscription">Pause</button>`
                        : `<button type="button" class="btn-resume-sub" data-sub-id="${escapeHtml(subId)}" aria-label="Resume subscription">Resume</button>`}
                    <button type="button" class="btn-cancel-sub-row" data-sub-id="${escapeHtml(subId)}" aria-label="Cancel this subscription">Cancel</button>
                  </span>`
                : isCancelled
                    ? `<span class="text-muted"><small>Cancelled</small></span>`
                    : `<span class="text-muted"><small>—</small></span>`;

            const chargeRows = group.charges.map((record) => {
                const chargeStatus = normalizedStatus(record);
                const isCancel = record.isCancellation || record.type === "cancellation" || (chargeStatus === "cancelled" && (!record.amount || Number(record.amount) <= 0));
                const displayStatus = (chargeStatus === "cancelled" && Number(record.amount) > 0 && !record.isCancellation) ? "paid" : chargeStatus;
                const dateStr = formatDateTime(record.date || record.paidAt || record.createdAt);
                const refStr = isCancel && (!record.reference || record.reference.startsWith("DEV-") || record.reference === "—") ? "—" : cleanReference(record.reference || record.orderId || record.id || "—");
                const noteStr = cleanNote(record);
                const nextPaymentVal = isCancel || isCancelled || status === "pending" || !record.nextPaymentDue ? "—" : formatDateOnly(record.nextPaymentDue);

                return `<tr${isCancel ? ' class="charge-row-cancelled"' : ''}>
                <td>${escapeHtml(dateStr)}</td>
                <td><span class="subscription-reference">${escapeHtml(refStr)}</span>${noteStr ? `<small>${escapeHtml(noteStr)}</small>` : ""}</td>
                <td><strong>${escapeHtml(formatAmount(record.amount))}</strong></td>
                <td><span class="status-pill ${paymentStatusClass(displayStatus)}">${escapeHtml(statusLabel(displayStatus))}</span></td>
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

            return `<tr class="subscription-summary-row${isCancelled ? " is-cancelled" : ""}" data-subscription-group="${key}" data-subscription-toggle="${key}" tabindex="0" role="button" aria-expanded="${expanded}">
              <td><span class="subscription-row-indicator" aria-hidden="true"></span><span class="subscription-row-copy"><strong>${escapeHtml(`${formatAmount(subscription.amount || 100)} / mo Subscription`)}</strong><small>${subMetaText}</small></span></td>
              <td><span class="status-pill ${paymentStatusClass(status)}">${escapeHtml(statusLabel(status))}</span></td>
              <td>${escapeHtml(String(charges.length))}</td>
              <td><strong>${escapeHtml(formatAmount(total))}</strong></td>
              <td>${nextPaymentCell}</td>
              <td>${actionHtml}</td>
            </tr>
            <tr class="subscription-charges-row${expanded ? "" : " is-hidden"}" data-subscription-group="${key}" data-subscription-details="${key}">
              <td colspan="6">
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

            const canPauseResume = ["active", "paused"].includes(status);
            const subId = getSubscriptionIdentity(subscription) || String(subscription.id || "").trim();
            const actionHtml = canPauseResume
                ? `<span class="subscription-row-actions">
                    ${status === "active"
                        ? `<button type="button" class="btn-pause-sub" data-sub-id="${escapeHtml(subId)}" aria-label="Pause subscription">Pause</button>`
                        : `<button type="button" class="btn-resume-sub" data-sub-id="${escapeHtml(subId)}" aria-label="Resume subscription">Resume</button>`}
                    <button type="button" class="btn-cancel-sub-row" data-sub-id="${escapeHtml(subId)}" aria-label="Cancel this subscription">Cancel</button>
                  </span>`
                : isCancelled
                    ? `<span class="text-muted"><small>Cancelled</small></span>`
                    : `<span class="text-muted"><small>—</small></span>`;

            return `<div class="card uiverse-table-card${isCancelled ? " is-cancelled" : ""}" data-subscription-group="subscription-row-${groups.indexOf(group)}">
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
              ${canPauseResume || isCancelled ? '<div class="item">Action</div>' : ''}
            </div>
            <div class="card__left">
              <div class="item">${escapeHtml(`${formatAmount(subscription.amount || 100)} / mo Subscription`)}</div>
              <div class="item"><span class="status-pill ${paymentStatusClass(status)}">${escapeHtml(statusLabel(status))}</span></div>
              <div class="item">${escapeHtml(planStatusLabel)}</div>
              <div class="item">${charges.length} contribution${charges.length === 1 ? "" : "s"}</div>
              <div class="item"><strong>${escapeHtml(formatAmount(total))}</strong></div>
              <div class="item">${nextPaymentVal}</div>
              ${canPauseResume || isCancelled ? `<div class="item">${actionHtml}</div>` : ''}
            </div>
          </div>
        </div>`;
        }).join("")}</div>
    </div>
  </div>`;

        const activateSubscriptionTab = (tabKey) => {
            list.querySelectorAll(".subscription-tab").forEach((tab) => {
                const active = tab.getAttribute("data-subscription-tab") === tabKey;
                tab.classList.toggle("is-active", active);
                tab.setAttribute("aria-selected", String(active));
            });
            list.querySelectorAll("[data-subscription-group]").forEach((element) => {
                element.classList.toggle("is-hidden", element.getAttribute("data-subscription-group") !== tabKey);
            });
            const activeSummary = [...list.querySelectorAll(".subscription-summary-row")]
                .find((row) => row.getAttribute("data-subscription-group") === tabKey);
            if (activeSummary) activeSummary.setAttribute("aria-expanded", "false");
        };

        const toggleRow = (row) => {
            const key = row.getAttribute("data-subscription-toggle");
            const details = list.querySelector(`[data-subscription-details="${key}"]`);
            if (!details) return;
            const expanded = row.getAttribute("aria-expanded") === "true";
            row.setAttribute("aria-expanded", String(!expanded));
            details.classList.toggle("is-hidden", expanded);
        };
        list.onclick = (event) => {
            const tab = event.target.closest?.(".subscription-tab");
            if (tab) {
                activateSubscriptionTab(tab.getAttribute("data-subscription-tab"));
                return;
            }
            if (event.target.closest?.(".btn-pause-sub, .btn-resume-sub, button")) {
                return;
            }
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
        activateSubscriptionTab("subscription-row-0");
    }

    function getGiftSubscriptionId(record) {
        const candidates = [
            record?.razorpaySubscriptionId,
            record?.razorpay_subscription_id,
            record?.subscription_id,
            record?.subscriptionId,
            record?.reference,
            record?.id,
        ].map((value) => String(value || "").trim()).filter(Boolean);
        return candidates.find((value) => value.startsWith("sub_")) || candidates[0] || "";
    }

    function renderGiftHistory(rawGiftRecords) {
        // Deduplicate gift records by subscriptionId or reference or id to get one clean entry per gifted membership
        const uniqueGifts = new Map();
        (rawGiftRecords || []).forEach((record) => {
            const key = record.subscriptionId || record.reference || record.id || `${record.recipientEmail || record.recipientName}-${record.date}`;
            const existing = uniqueGifts.get(key);
            if (!existing) {
                uniqueGifts.set(key, record);
            } else {
                if (normalizedStatus(record) === "active" || record.isSubscriptionRoot) {
                    uniqueGifts.set(key, { ...existing, ...record });
                }
            }
        });

        const gifts = [...uniqueGifts.values()].sort((a, b) => Number(b.date || b.createdAt || 0) - Number(a.date || a.createdAt || 0));

        const tableBody = get("gift-table-body");
        const cardsList = get("gift-cards-list") || get("gift-list");
        const badge = get("gift-badge");
        const countEl = get("gift-count");
        const summaryEl = get("gift-summary");

        if (badge) {
            badge.textContent = `${gifts.length} record${gifts.length === 1 ? "" : "s"}`;
        }

        const givenGifts = gifts.filter((g) => g.giftRole === "donor");
        const receivedGifts = gifts.filter((g) => g.giftRole === "receiver");
        const totalGivenAmount = givenGifts.reduce((sum, g) => sum + (Number(g.amount) || 0), 0);

        if (countEl) {
            countEl.textContent = `${gifts.length} membership${gifts.length === 1 ? "" : "s"} · ${formatAmount(totalGivenAmount)}`;
        }

        if (summaryEl) {
            if (gifts.length === 0) {
                summaryEl.textContent = "Gifted memberships given to or received from other supporters will appear here.";
            } else {
                const parts = [];
                if (givenGifts.length) parts.push(`${givenGifts.length} gifted by you`);
                if (receivedGifts.length) parts.push(`${receivedGifts.length} gifted to you`);
                summaryEl.textContent = `Gifted memberships: ${parts.join(" · ")}.`;
            }
        }

        if (!gifts.length) {
            if (tableBody) {
                tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No gifted memberships yet.</td></tr>';
            }
            if (cardsList) {
                cardsList.innerHTML = '<p class="empty-state">No gifted memberships yet.</p>';
            }
            return;
        }

        // Render Table Rows
        if (tableBody) {
            tableBody.innerHTML = gifts.map((record) => {
                const isDonor = record.giftRole === "donor";
                const rawStatus = normalizedStatus(record);
                const isCancelled = rawStatus === "cancelled";
                const displayStatus = isCancelled ? "cancelled" : (rawStatus === "paused" ? "paused" : "active");
                const amount = formatAmount(record.amount || 100);
                const dateStr = formatDate(record.date || record.createdAt);
                const refCode = cleanReference(record.subscriptionId || record.razorpaySubscriptionId || record.reference || record.id || "—");
                const personTitle = isDonor
                    ? `Gift for ${escapeHtml(record.recipientName || "Supporter")}`
                    : `Gift from ${escapeHtml(record.donorName || "Kind Supporter")}`;
                const personMeta = isDonor
                    ? `${escapeHtml(record.recipientEmail || record.recipientPhone || "Supporter")} · Started ${escapeHtml(dateStr)}`
                    : `Gifted to your account · Started ${escapeHtml(dateStr)}`;

                const roleBadge = isDonor
                    ? `<span class="status-pill status-pill-given">Gifted by you</span>`
                    : `<span class="status-pill status-pill-received">Gifted to you</span>`;

                const subId = getGiftSubscriptionId(record);
                const recordId = String(record.id || "");
                const recordPath = String(record.path || record.source || "");
                const recordReference = String(record.reference || "");
                const canCancel = !isCancelled && rawStatus !== "failed";
                const cancelLabel = "Cancel Gift";
                const recipientName = record.recipientName || "Supporter";
                const donorName = record.donorName || "Kind Supporter";

                const actionHtml = canCancel
                    ? `<button type="button" class="btn-cancel-gift" data-gift-sub-id="${escapeHtml(subId)}" data-gift-record-id="${escapeHtml(recordId)}" data-gift-record-path="${escapeHtml(recordPath)}" data-gift-reference="${escapeHtml(recordReference)}" data-gift-role="${isDonor ? "donor" : "receiver"}" data-gift-recipient="${escapeHtml(recipientName)}" data-gift-donor="${escapeHtml(donorName)}" data-gift-amount="${record.amount || 100}">${cancelLabel}</button>`
                    : isCancelled
                        ? `<span class="text-muted"><small>Cancelled</small></span>`
                        : `<span class="text-muted"><small>—</small></span>`;

                return `<tr class="gift-row${isCancelled ? " charge-row-cancelled" : ""}">
        <td>
          <strong>${personTitle}</strong>
          <br><small class="record-note">${personMeta}</small>
        </td>
        <td>${roleBadge}</td>
        <td><span class="status-pill ${paymentStatusClass(displayStatus)}">${escapeHtml(statusLabel(displayStatus))}</span></td>
        <td><strong>${escapeHtml(amount)} / mo</strong></td>
        <td><span class="table-ref-code">${escapeHtml(refCode)}</span></td>
        <td>${actionHtml}</td>
      </tr>`;
            }).join("");
        }

        // Render Card View
        if (cardsList) {
            cardsList.innerHTML = gifts.map((record) => {
                const isDonor = record.giftRole === "donor";
                const rawStatus = normalizedStatus(record);
                const isCancelled = rawStatus === "cancelled";
                const displayStatus = isCancelled ? "cancelled" : (rawStatus === "paused" ? "paused" : "active");
                const amount = formatAmount(record.amount || 100);
                const dateStr = formatDate(record.date || record.createdAt);
                const refCode = cleanReference(record.subscriptionId || record.razorpaySubscriptionId || record.reference || record.id || "—");
                const personTitle = isDonor
                    ? `Gift for ${escapeHtml(record.recipientName || "Supporter")}`
                    : `Gift from ${escapeHtml(record.donorName || "Kind Supporter")}`;
                const otherPersonName = isDonor
                    ? (record.recipientName || "Supporter")
                    : (record.donorName || "Kind Supporter");

                const roleLabel = isDonor ? "Gifted by you" : "Gifted to you";
                const roleBadgeClass = isDonor ? "status-pill-given" : "status-pill-received";

                const subId = getGiftSubscriptionId(record);
                const recordId = String(record.id || "");
                const recordPath = String(record.path || record.source || "");
                const recordReference = String(record.reference || "");
                const canCancel = !isCancelled && rawStatus !== "failed";
                const cancelLabel = "Cancel Gift";
                const recipientName = record.recipientName || "Supporter";
                const donorName = record.donorName || "Kind Supporter";

                return `<div class="card uiverse-table-card gift-card-item${isCancelled ? " card-cancelled" : ""}">
        <div class="card__title">
          <span class="card__title-main">${personTitle}</span>
          <span class="card__badge">${escapeHtml(amount)} / mo</span>
        </div>
        <div class="card__data">
          <div class="card__right">
            <div class="item">Role</div>
            <div class="item">${isDonor ? "Recipient" : "Donor"}</div>
            <div class="item">Date</div>
            <div class="item">Reference</div>
            <div class="item">Status</div>
            ${canCancel || isCancelled ? '<div class="item">Action</div>' : ''}
          </div>
          <div class="card__left">
            <div class="item"><span class="status-pill ${roleBadgeClass}">${roleLabel}</span></div>
            <div class="item">${escapeHtml(otherPersonName)}</div>
            <div class="item">${escapeHtml(dateStr)}</div>
            <div class="item"><span class="table-ref-code">${escapeHtml(refCode)}</span></div>
            <div class="item"><span class="status-pill ${paymentStatusClass(displayStatus)}">${escapeHtml(statusLabel(displayStatus))}</span></div>
            ${canCancel ? `<div class="item"><button type="button" class="btn-cancel-gift" data-gift-sub-id="${escapeHtml(subId)}" data-gift-record-id="${escapeHtml(recordId)}" data-gift-record-path="${escapeHtml(recordPath)}" data-gift-reference="${escapeHtml(recordReference)}" data-gift-role="${isDonor ? "donor" : "receiver"}" data-gift-recipient="${escapeHtml(recipientName)}" data-gift-donor="${escapeHtml(donorName)}" data-gift-amount="${record.amount || 100}">${cancelLabel}</button></div>` : (isCancelled ? '<div class="item"><span class="text-muted"><small>Cancelled</small></span></div>' : '')}
          </div>
        </div>
      </div>`;
            }).join("");
        }
    }

    function allRawRecords() {
        const records = [...subscriberRecords.values(), paymentRecords, globalPaymentRecords, testPaymentRecords, paymentIntents]
            .flat()
            .filter((record) => {
                const source = String(record?.path || record?.source || "");
                const isVelcrowMirror = source === "subscribers_velcrow";
                const hasUserIdentity = Boolean(
                    String(record?.email || record?.userId || record?.user_id || "").trim()
                );
                const isGift = isGiftRecord(record);
                const isStatusOnlyMirror = isVelcrowMirror
                    && record?.isSubscriptionRoot
                    && !hasUserIdentity
                    && !isGift
                    && !record?.planId
                    && !record?.subscribedAt
                    && !record?.lastPaymentAt;
                return !isStatusOnlyMirror;
            });
        const unique = new Map();
        records.forEach((record) => {
            const reference = String(record.reference || record.paymentId || "").trim();
            const subscriptionIdentity = getSubscriptionIdentity(record);
            const isStablePaymentReference = /^(pay_|order_)/i.test(reference);
            const isSubscriberRoot = isSubscriptionRootRecord(record)
                && ["subscribers", "subscribers_velcrow"].includes(String(record.path || record.source || ""));
            const key = isStablePaymentReference
                ? `reference/${reference}`
                : isSubscriberRoot && subscriptionIdentity
                    ? `subscription-root/${subscriptionIdentity}`
                    : `${record.path || record.source || "record"}/${record.id || record.reference || `${record.date}-${record.amount}`}`;
            if (!unique.has(key)) unique.set(key, record);
        });
        return [...unique.values()].sort((a, b) => Number(b.date || 0) - Number(a.date || 0));
    }

    function allRecords() {
        const raw = allRawRecords();
        const subGroups = buildSubscriptionGroups(raw);
        const subCharges = subGroups.flatMap((group) => group.charges);
        const nonSubRecords = raw.filter((record) => !isSubscriptionRecord(record) && !record.isSubscriptionRoot && !isSubscriptionRootRecord(record) && record.path !== "subscribers" && record.path !== "subscribers_velcrow");

        // When a user starts or gifts a subscription, the upfront first amount is paid at that time.
        // If the subscription is later cancelled, that initial amount must continue to be counted in totals.
        const donorGifts = raw.filter((r) => isGiftRecord(r) && (r.giftRole === "donor" || r.giftRole === "both"));
        const synthesizedGiftCharges = [];

        donorGifts.forEach((gift) => {
            const giftStatus = normalizedStatus(gift);
            const isPending = giftStatus === "pending";
            const giftTime = Number(gift.date || gift.createdAt || gift.subscribedAt || 0) || Date.now();
            const giftSubId = String(gift.subscriptionId || gift.id || "").trim();

            const hasConfirmedGiftPayment = nonSubRecords.some((r) => {
                if (!r || r.isCancellation || r.type === "cancellation" || r.isSubscriptionRoot) return false;
                const rSubId = String(r.subscriptionId || r.id || "").trim();
                const matchesSub = rSubId && (rSubId === giftSubId || rSubId === gift.id);
                const matchesRef = gift.reference && r.reference && cleanReference(gift.reference) === cleanReference(r.reference);
                return (matchesSub || matchesRef) && isConfirmedPayment(r);
            });

            if (!hasConfirmedGiftPayment && !isPending) {
                synthesizedGiftCharges.push({
                    id: `${gift.id || giftSubId}-initial`,
                    subscriptionId: giftSubId || gift.id,
                    type: "gift-monthly",
                    isGift: true,
                    giftRole: "donor",
                    reference: cleanReference(gift.reference) || "MS-GIFT-1001",
                    amount: Number(gift.amount) || 100,
                    status: "paid",
                    date: giftTime,
                    paidAt: giftTime,
                    createdAt: giftTime,
                    note: `Initial gift contribution for ${gift.recipientName || "Supporter"}`,
                    recipientName: gift.recipientName,
                    recipientEmail: gift.recipientEmail,
                    recipientPhone: gift.recipientPhone,
                });
            }
        });

        const combined = [...subCharges, ...nonSubRecords, ...synthesizedGiftCharges];
        const unique = new Map();
        combined.forEach((record) => {
            const cleanRef = cleanReference(record.reference || record.id || record.orderId || "");
            const isPayRef = cleanRef && (cleanRef.startsWith("pay_") || cleanRef.startsWith("order_") || cleanRef.startsWith("sub_"));
            const key = isPayRef ? `ref:${cleanRef}` : `${record.path || record.source || "record"}/${record.id || record.reference || `${record.date}-${record.amount}-${record.status}`}`;

            const existing = unique.get(key);
            if (!existing) {
                unique.set(key, record);
            } else {
                const recStatus = normalizedStatus(record);
                const exStatus = normalizedStatus(existing);
                const isRecPaid = isConfirmedPayment(record) && (recStatus === "paid" || recStatus === "completed" || recStatus === "success");
                const isExPaid = isConfirmedPayment(existing) && (exStatus === "paid" || exStatus === "completed" || exStatus === "success");
                const isRecWebhook = record.id && record.id.startsWith("pay_");
                const isExWebhook = existing.id && existing.id.startsWith("pay_");

                if (isRecPaid && !isExPaid) {
                    unique.set(key, record);
                } else if (isRecPaid && isExPaid) {
                    if (isRecWebhook && !isExWebhook) {
                        unique.set(key, record);
                    }
                } else if (!isExPaid && isConfirmedPayment(record)) {
                    unique.set(key, record);
                }
            }
        });
        return [...unique.values()].sort((a, b) => Number(b.date || b.paidAt || b.createdAt || 0) - Number(a.date || a.paidAt || a.createdAt || 0));
    }

    function getSubscriptionIdentity(record) {
        if (!record) return "";
        return String(
            record.subscriptionId
            || record.parentSubscriptionId
            || record.subscriptionPath
            || (record.isSubscriptionRoot ? record.id : "")
            || ""
        ).trim();
    }

    function findActiveSubscriptions(records) {
        const unique = new Map();
        records
            .filter((record) => isSubscriptionRootRecord(record)
                && !isGiftRecord(record)
                && ["active", "paused"].includes(normalizedStatus(record)))
            .forEach((record) => {
                const identity = getSubscriptionIdentity(record)
                    || `${record.path || record.source || "record"}/${record.id || record.reference || "subscription"}`;
                const existing = unique.get(identity);
                if (!existing) {
                    unique.set(identity, record);
                    return;
                }
                const existingTime = Number(existing.updatedAt || existing.date || existing.createdAt || 0);
                const recordTime = Number(record.updatedAt || record.date || record.createdAt || 0);
                if (recordTime >= existingTime) unique.set(identity, record);
            });
        return [...unique.values()].sort((a, b) => Number(b.updatedAt || b.date || b.createdAt || 0) - Number(a.updatedAt || a.date || a.createdAt || 0));
    }

    function findActiveSubscription(records) {
        const activeRoot = findActiveSubscriptions(records)[0];
        if (activeRoot) return activeRoot;

        // Some older accounts only have the successful monthly payment under
        // payments/{uid}; the subscriber root is missing. The subscription
        // table can still group that payment, but the status card and cancel
        // button used to incorrectly report "No monthly subscription".
        const cancelledIds = new Set(records
            .filter((record) => record.isCancellation || record.type === "cancellation" || normalizedStatus(record) === "cancelled")
            .map(getSubscriptionIdentity)
            .filter(Boolean));

        const inferred = records
            .filter((record) => {
                const identity = getSubscriptionIdentity(record);
                return isSubscriptionRecord(record)
                    && !record.isSubscriptionRoot
                    && !record.isCancellation
                    && !isGiftRecord(record)
                    && identity
                    && !cancelledIds.has(identity)
                    && isConfirmedPayment(record);
            })
            .sort((a, b) => Number(b.date || b.paidAt || b.createdAt || 0) - Number(a.date || a.paidAt || a.createdAt || 0))[0];

        if (!inferred) return null;
        return {
            ...inferred,
            status: "active",
            subscriptionStatus: "active",
            isSubscriptionRoot: true,
            inferredSubscriptionRoot: true,
        };
    }

    function getSubscriptionUpdatePaths(subscription) {
        const subId = getSubscriptionIdentity(subscription) || String(subscription?.id || "").trim();
        if (subscription?.inferredSubscriptionRoot && subId) {
            return [`subscribers/${subId}`, `subscribers_velcrow/${subId}`];
        }
        if (subscription?.path && subscription?.id) {
            return [`${subscription.path}/${subscription.id}`];
        }
        return subId ? [`subscribers/${subId}`, `subscribers_velcrow/${subId}`] : [];
    }

    function findPersonalSubscriptionById(subscriptionId, records = allRawRecords()) {
        const wanted = String(subscriptionId || "").trim();
        if (!wanted) return null;
        return records.find((record) => {
            if (!isSubscriptionRootRecord(record) || isGiftRecord(record)) return false;
            const identity = getSubscriptionIdentity(record) || String(record.id || "").trim();
            return identity === wanted || String(record.id || "").trim() === wanted;
        }) || null;
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

        const activePersonalSubscriptions = findActiveSubscriptions(raw);
        const activeSub = activePersonalSubscriptions[0] || null;
        const payingPersonalSubscriptions = activePersonalSubscriptions.filter((subscription) => normalizedStatus(subscription) === "active");
        const payingMonthlyTotal = payingPersonalSubscriptions.reduce((sum, subscription) => sum + (Number(subscription.amount) || 0), 0);
        const payingMonthlyLabel = `₹${payingMonthlyTotal.toLocaleString("en-IN")}`;
        const activeReceivedGift = raw.find((r) => isGiftRecord(r) && r.giftRole === "receiver" && ["active", "paused"].includes(normalizedStatus(r)));
        if (activeSub) subscriptionCheckoutPending = false;
        cancelledSubscription = findLatestCancelledSubscription(raw);
        monthlyIntent = raw.find((record) => isSubscriptionRecord(record) && normalizedStatus(record) === "pending") || null;
        primarySubscription = activeSub || cancelledSubscription || null;

        setText("total-paid", `${paidRecords.length} contribution${paidRecords.length === 1 ? "" : "s"} · ${formatAmount(total)}`);
        setText("active-monthly", `${monthlyPaid.length} contribution${monthlyPaid.length === 1 ? "" : "s"} · ${formatAmount(monthlyTotal)}`);
        setText("subscription-payment-count", `${monthlyPaid.length} contribution${monthlyPaid.length === 1 ? "" : "s"} · ${formatAmount(monthlyTotal)}`);
        setText("one-time-count", `${oneTimePaid.length} contribution${oneTimePaid.length === 1 ? "" : "s"} · ${formatAmount(oneTimeTotal)}`);
        setText("gift-count", `${giftPaid.length} contribution${giftPaid.length === 1 ? "" : "s"} · ${formatAmount(giftTotal)}`);
        setText("record-count", `${records.length} record${records.length === 1 ? "" : "s"}`);

        const status = payingPersonalSubscriptions.length
            ? "active"
            : activeSub
                ? normalizedStatus(activeSub)
            : activeReceivedGift
                ? normalizedStatus(activeReceivedGift)
                : subscriptionCheckoutPending
                    ? "pending"
                : cancelledSubscription
                    ? "cancelled"
                    : monthlyIntent
                        ? "pending"
                        : "none";
        const stateText = status === "active" ? "Active" : status === "paused" ? "Paused" : status === "cancelled" ? "Cancelled" : status === "pending" ? "Pending" : "No active subscription";

        setText("quick-stat-total", formatAmount(total));
        setText("quick-stat-count", `${paidRecords.length} confirmed contribution${paidRecords.length === 1 ? "" : "s"}`);

        if (activePersonalSubscriptions.length) {
            setText("quick-stat-plan", `${payingMonthlyLabel} / mo`);
            setText("quick-stat-plan-status", payingPersonalSubscriptions.length
                ? `${payingPersonalSubscriptions.length} active subscription${payingPersonalSubscriptions.length === 1 ? "" : "s"}`
                : "All subscriptions paused");
        } else if (activeReceivedGift) {
            setText("quick-stat-plan", `${formatAmount(activeReceivedGift.amount || 100)} / mo`);
            setText("quick-stat-plan-status", `Gifted by ${activeReceivedGift.donorName || "Supporter"}`);
        } else if (status === "pending") {
            setText("quick-stat-plan", `${formatAmount(monthlyIntent?.amount || 100)} / mo`);
            setText("quick-stat-plan-status", "Payment pending");
        } else if (cancelledSubscription) {
            setText("quick-stat-plan", "None");
            setText("quick-stat-plan-status", "Subscription ended");
        } else {
            setText("quick-stat-plan", `${formatAmount(selectedDashboardPlanAmount)} / mo`);
            setText("quick-stat-plan-status", "Not subscribed");
        }

        if (activeSub && activeSub.nextPaymentDue) {
            setText("quick-stat-renewal", formatDateOnly(activeSub.nextPaymentDue));
            setText("quick-stat-renewal-sub", "Next scheduled renewal");
        } else if (activeReceivedGift) {
            setText("quick-stat-renewal", activeReceivedGift.nextPaymentDue ? formatDateOnly(activeReceivedGift.nextPaymentDue) : "Active Gift");
            setText("quick-stat-renewal-sub", `Gift from ${activeReceivedGift.donorName || "Supporter"}`);
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
            statusPill.textContent = activeSub
                ? (status === "active" ? "Active Supporter" : status === "paused" ? "Subscription Paused" : "No Active Plan")
                : activeReceivedGift
                    ? "Active Supporter (Gifted)"
                    : status === "cancelled"
                        ? "Cancelled"
                        : status === "pending"
                            ? "Payment Pending"
                            : "No Active Plan";
            statusPill.className = `dashboard-status-indicator status-${status === "none" ? "none" : (activeSub || activeReceivedGift ? "active" : status)}`;
        }

        const subBadgePill = get("subscription-badge-pill");
        if (subBadgePill) {
            subBadgePill.textContent = activeSub
                ? (status === "active" ? "Active Plan" : status === "paused" ? "Paused" : "Inactive")
                : activeReceivedGift
                    ? "Active (Gifted)"
                    : status === "cancelled"
                        ? "Cancelled"
                        : status === "pending"
                            ? "Pending"
                            : "Inactive";
            subBadgePill.className = `status-pill ${paymentStatusClass(status)}`;
        }

        const planPickerWrap = get("dash-plan-picker-wrap");
        if (planPickerWrap) {
            planPickerWrap.classList.remove("is-hidden");
        }
        const planPickerLabel = get("dash-plan-picker-label");
        if (planPickerLabel) {
            planPickerLabel.textContent = activePersonalSubscriptions.length
                ? "Add another monthly subscription tier:"
                : "Select monthly autopay tier:";
        }
        renderCustomPlanBanner();

        let subscriptionSummary = "";
        if (activePersonalSubscriptions.length) {
            const pausedCount = activePersonalSubscriptions.length - payingPersonalSubscriptions.length;
            subscriptionSummary = `${payingPersonalSubscriptions.length} active monthly subscription${payingPersonalSubscriptions.length === 1 ? "" : "s"} · total ${payingMonthlyLabel}/mo${pausedCount ? ` · ${pausedCount} paused` : ""}. Manage each subscription separately below.`;
        } else if (activeReceivedGift) {
            subscriptionSummary = `You have an active ${formatAmount(activeReceivedGift.amount || 100)}/mo membership generously gifted by ${activeReceivedGift.donorName || "a kind supporter"}. Thank you for being a vital part of our rescue family!`;
        } else if (cancelledSubscription) {
            const ended = cancelledSubscription.endedAt || cancelledSubscription.cancelledAt || cancelledSubscription.date;
            subscriptionSummary = `Your monthly subscription ended on ${formatDateTime(ended)}. You can start a new monthly subscription anytime.`;
        } else if (status === "pending") {
            subscriptionSummary = subscriptionCheckoutPending
                ? "Your first subscription charge was submitted and is waiting for server confirmation. Please keep this page open for a moment."
                : (isDevelopmentMode || isPreviewMode)
                ? "Subscription request pending. Click 'Activate subscription (Test)' to confirm and activate."
                : "Subscription request pending. Payment confirmation is still required to activate it.";
        } else {
            subscriptionSummary = `No monthly subscription yet. Start with ₹${selectedDashboardPlanAmount.toLocaleString("en-IN")} per month.`;
        }
        setText("subscription-summary", subscriptionSummary);


        const toggle = get("dashboard-subscription-toggle");
        if (toggle) {
            const isTestablePending = Boolean(monthlyIntent) && !activeSub && (isDevelopmentMode || isPreviewMode);
            const isCheckoutPending = subscriptionCheckoutPending && !activeSub;
            setPosButtonDisabled(toggle, isCheckoutPending || (Boolean(monthlyIntent) && !activeSub && !isTestablePending));
            const label = status === "pending"
                ? (isCheckoutPending ? "Payment pending" : (isTestablePending ? "Activate (Test)" : "Payment pending"))
                : activePersonalSubscriptions.length
                    ? "Add subscription"
                    : "Subscribe";
            setPosButtonText(toggle, label);
            toggle.setAttribute("data-state", "subscribe");
        }
        const cancel = get("subscription-cancel");
        if (cancel) {
            const isCancelable = (!activeSub && monthlyIntent)
                || (activePersonalSubscriptions.length === 1 && ["active", "paused"].includes(normalizedStatus(activeSub)))
                || (!activeSub && Boolean(activeReceivedGift));
            cancel.disabled = !isCancelable;
            const cancelLabelEl = cancel.querySelector("span");
            if (cancelLabelEl) {
                if (activePersonalSubscriptions.length > 1) {
                    cancelLabelEl.textContent = "Choose a subscription below";
                    cancel.setAttribute("aria-label", "Choose a subscription below to cancel");
                } else if (activeReceivedGift && !activeSub) {
                    cancelLabelEl.textContent = "Cancel Gifted Membership";
                    cancel.setAttribute("aria-label", "Cancel gifted membership");
                } else {
                    cancelLabelEl.textContent = "Cancel Subscription";
                    cancel.setAttribute("aria-label", "Cancel subscription");
                }
            }
        }

        const allGifts = raw.filter((r) => !r.isCancellation && (isGiftRecord(r) || ["gift-monthly", "gift-subscription"].includes(r.type)));
        setText("gift-summary", allGifts.length ? `${giftPaid.length} confirmed gift${giftPaid.length === 1 ? "" : "s"} for other supporters.` : "Gift payments made for another supporter will appear here.");
        renderGiftHistory(allGifts);
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
            const newAmt = Number(e.target.value) || 100;
            selectedDashboardPlanAmount = newAmt;
            const records = allRawRecords();
            const button = get("dashboard-subscription-toggle");
            if (button && !isPosButtonDisabled(button)) {
                setPosButtonText(button, findActiveSubscriptions(records).length ? "Add subscription" : "Subscribe");
            }
        });
    });

    function promptDashboardAddSubscription(newAmt) {
        const modal = get("dashboard-change-plan-modal") || get("change-plan-modal");
        const descEl = get("dashboard-change-plan-modal-desc") || get("change-plan-modal-desc");
        const confirmBtn = get("dashboard-change-plan-modal-confirm") || get("change-plan-modal-confirm");
        const keepBtn = get("dashboard-change-plan-modal-keep") || get("change-plan-modal-keep");
        const closeBtn = get("dashboard-change-plan-modal-close") || get("change-plan-modal-close");
        const errorEl = get("dashboard-change-plan-modal-error") || get("change-plan-modal-error");
        if (!modal || !confirmBtn) return startMonthlySubscription(newAmt, true);

        const activeSubs = findActiveSubscriptions(allRawRecords());
        const currentTotal = activeSubs
            .filter((subscription) => normalizedStatus(subscription) === "active")
            .reduce((sum, subscription) => sum + (Number(subscription.amount) || 0), 0);
        const nextTotal = currentTotal + Number(newAmt || 0);

        if (descEl) {
            descEl.textContent = `You already have ${activeSubs.length} monthly subscription${activeSubs.length === 1 ? "" : "s"}. This new ₹${Number(newAmt || 0).toLocaleString("en-IN")}/mo subscription will be added alongside them, not replace them. Your active monthly total will be ₹${nextTotal.toLocaleString("en-IN")}/mo.`;
        }
        if (errorEl) {
            errorEl.textContent = "";
            errorEl.classList.add("is-hidden");
        }
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = "Add subscription";
        if (keepBtn) {
            keepBtn.disabled = false;
            keepBtn.textContent = "Keep current plans";
        }
        if (closeBtn) closeBtn.disabled = false;
        modal.classList.remove("is-hidden");

        let isAdding = false;
        const closeModal = () => {
            if (isAdding) return;
            modal.classList.add("is-hidden");
        };
        confirmBtn.onclick = async () => {
            if (isAdding) return;
            isAdding = true;
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = `<span class="button-spinner button-spinner-dark" aria-hidden="true"></span> Starting payment…`;
            if (keepBtn) keepBtn.disabled = true;
            if (closeBtn) closeBtn.disabled = true;
            modal.classList.add("is-hidden");
            await startMonthlySubscription(newAmt, true);
        };
        keepBtn && (keepBtn.onclick = closeModal);
        closeBtn && (closeBtn.onclick = closeModal);
        modal.onclick = (event) => {
            if (event.target.hasAttribute("data-change-plan-dismiss")) closeModal();
        };
    }

    async function startMonthlySubscription(overrideAmount, skipAddConfirmation = false) {
        if (subscriptionCheckoutPending) return;
        const intentAmount = monthlyIntent && Number(monthlyIntent.amount) > 0 ? Number(monthlyIntent.amount) : null;
        const effectiveAmount = overrideAmount || intentAmount || selectedDashboardPlanAmount || 100;
        if (!currentUser) return;
        if (!skipAddConfirmation && findActiveSubscriptions(allRawRecords()).length) {
            promptDashboardAddSubscription(effectiveAmount);
            return;
        }
        if (!window.sillysenseBeginPayment?.("monthly")) {
            const busyMessage = get("subscription-message");
            if (busyMessage) {
                busyMessage.textContent = "Another payment is already being processed. Please wait for it to finish.";
                busyMessage.classList.add("error");
            }
            return;
        }
        const button = get("dashboard-subscription-toggle");
        const message = get("subscription-message");
        if (button) setPosButtonDisabled(button, true);
        if (message) {
            message.textContent = "Setting up monthly subscription…";
            message.classList.remove("error");
        }
        subscriptionCheckoutPending = true;
        const now = Date.now();
        const nextPayment = nextMonthTimestamp(now);

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
                window.sillysenseEndPayment?.();
                subscriptionCheckoutPending = false;
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
                    window.sillysenseEndPayment?.();
                    subscriptionCheckoutPending = true;
                    if (message) message.textContent = "Mandate setup complete! Your recurring subscription is active. Thank you!";
                    renderRecords();
                },
                modal: {
                    ondismiss: function () {
                        window.sillysenseEndPayment?.();
                        subscriptionCheckoutPending = false;
                        if (button) {
                            button.classList.remove("is-animating");
                            setPosButtonDisabled(button, false);
                        }
                        if (message) message.textContent = "Payment window closed.";
                    },
                },
            };

            if (typeof window.Razorpay === "function") {
                const rzp = new window.Razorpay(options);
                rzp.on("payment.failed", function (resp) {
                    console.error("Dashboard subscription failed:", resp.error);
                    window.sillysenseEndPayment?.();
                    subscriptionCheckoutPending = false;
                    if (message) {
                        message.textContent = `Payment failed: ${resp.error.description || resp.error.reason || "Please try again."}`;
                        message.classList.add("error");
                    }
                    if (button) {
                        button.classList.remove("is-animating");
                        setPosButtonDisabled(button, false);
                    }
                });
                rzp.open();
            } else {
                throw new Error("Razorpay SDK is not loaded. Please refresh.");
            }

        } catch (error) {
            console.error("Unable to start monthly subscription:", error);
            window.sillysenseEndPayment?.();
            subscriptionCheckoutPending = false;
            if (message) {
                message.textContent = error?.message || "Could not start your monthly subscription. Please try again.";
                message.classList.add("error");
            }
        } finally {
            if (button) setPosButtonDisabled(button, subscriptionCheckoutPending);
        }
    }

    const dashSubToggle = get("dashboard-subscription-toggle");
    let isSubToggling = false;
    dashSubToggle?.addEventListener("click", async (e) => {
        e.preventDefault();
        if (isSubToggling || isTogglingSubscriptionPause || !currentUser || isPosButtonDisabled(dashSubToggle)) return;
        if (window.sillysensePaymentBusy?.()) return;
        const activeSubs = findActiveSubscriptions(allRawRecords());
        if (activeSubs.length) {
            promptDashboardAddSubscription(selectedDashboardPlanAmount);
            return;
        }
        isSubToggling = true;
        playPosTransactionAnimation(dashSubToggle, async () => {
            try {
                await startMonthlySubscription();
            } finally {
                isSubToggling = false;
            }
        }, false);
    });

    dashSubToggle?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            dashSubToggle.click();
        }
    });



    let isCancellingSubscription = false;
    let cancelSubscriptionTarget = null;

    function closeCancelModal() {
        if (isCancellingSubscription) return;
        get("cancel-modal")?.classList.add("is-hidden");
        cancelSubscriptionTarget = null;
    }

    function openCancelModal(subscription = null) {
        cancelSubscriptionTarget = subscription;
        const errorEl = get("cancel-modal-error");
        if (errorEl) {
            errorEl.textContent = "";
            errorEl.classList.add("is-hidden");
        }
        const confirmBtn = get("cancel-modal-confirm");
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = "Yes, cancel subscription";
        }
        const keepBtn = get("cancel-modal-keep");
        if (keepBtn) keepBtn.disabled = false;
        const closeBtn = get("cancel-modal-close");
        if (closeBtn) closeBtn.disabled = false;
        get("cancel-modal")?.classList.remove("is-hidden");
    }

    async function executeCancelSubscription() {
        if (isCancellingSubscription) return; // Prevent multiple clicks!
        const confirmBtn = get("cancel-modal-confirm");
        const keepBtn = get("cancel-modal-keep");
        const closeBtn = get("cancel-modal-close");
        const errorEl = get("cancel-modal-error");
        if (errorEl) {
            errorEl.textContent = "";
            errorEl.classList.add("is-hidden");
        }

        const records = allRawRecords();
        const activeSub = cancelSubscriptionTarget || findActiveSubscription(records);
        if (!activeSub && !monthlyIntent) return;

        isCancellingSubscription = true;
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = `<span class="button-spinner" aria-hidden="true"></span> Cancelling…`;
        }
        if (keepBtn) keepBtn.disabled = true;
        if (closeBtn) closeBtn.disabled = true;

        const message = get("subscription-message");
        if (message) {
            message.textContent = activeSub ? "Cancelling monthly subscription…" : "Cancelling subscription request…";
            message.classList.remove("error");
        }
        const now = Date.now();
        const activeSubscriptionId = getSubscriptionIdentity(activeSub) || String(activeSub?.id || "").trim();
        try {
            if (!activeSub && monthlyIntent) {
                if (monthlyIntent.path && monthlyIntent.id) {
                    try {
                        await remove(ref(database, `${monthlyIntent.path}/${monthlyIntent.id}`));
                    } catch (_) { }
                }
                paymentIntents = paymentIntents.filter((item) => item.id !== monthlyIntent.id);
                monthlyIntent = null;
                isCancellingSubscription = false;
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
                    subscriptionId: activeSubscriptionId,
                    note: "Subscription cancelled",
                });
                isCancellingSubscription = false;
                closeCancelModal();
                if (message) message.textContent = "Your subscription has been cancelled. Your past contributions remain safely saved in your account history.";
                renderRecords();
                return;
            }

            const subId = activeSubscriptionId;
            if (subId.startsWith("sub_")) {
                const res = await fetch(`${BACKEND_URL}/cancel-subscription`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ subscription_id: subId }),
                });
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    const errorMessage = String(errData.error || "");
                    if (!/not cancellable.*cancelled|already.*cancelled|cancelled status/i.test(errorMessage)) {
                        throw new Error(errorMessage || "Failed to cancel subscription in Razorpay");
                    }
                    console.info("Monthly subscription was already cancelled in Razorpay; syncing local status.");
                }
            }

            const subscriptionUpdate = {
                subscriptionStatus: "cancelled",
                status: "cancelled",
                cancelledAt: now,
                endedAt: now,
                nextPaymentDue: null,
            };
            const subscriptionPaths = activeSub.inferredSubscriptionRoot
                ? [`subscribers/${subId}`, `subscribers_velcrow/${subId}`]
                : [`${activeSub.path}/${activeSub.id}`];
            let subscriptionUpdated = false;
            let subscriptionUpdateError = null;
            for (const path of [...new Set(subscriptionPaths.filter(Boolean))]) {
                try {
                    await update(ref(database, path), subscriptionUpdate);
                    subscriptionUpdated = true;
                } catch (error) {
                    subscriptionUpdateError = error;
                }
            }
            if (!subscriptionUpdated && !subId.startsWith("sub_")) {
                throw subscriptionUpdateError || new Error("Could not save the subscription cancellation.");
            }
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
                subscriptionId: activeSubscriptionId,
                reference: "—",
                note: "Subscription cancelled",
            });
            isCancellingSubscription = false;
            closeCancelModal();
            if (message) message.textContent = "Your subscription has been cancelled. Your past contributions remain safely saved in your account history.";
            renderRecords();
        } catch (error) {
            console.error("Unable to cancel subscription:", error);
            isCancellingSubscription = false;
            if (errorEl) {
                errorEl.textContent = error.message || "Could not cancel your subscription. Please try again.";
                errorEl.classList.remove("is-hidden");
            }
            if (message) {
                message.textContent = "Could not cancel your subscription. Please try again.";
                message.classList.add("error");
            }
        } finally {
            isCancellingSubscription = false;
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = "Yes, cancel subscription";
            }
            if (keepBtn) keepBtn.disabled = false;
            if (closeBtn) closeBtn.disabled = false;
        }
    }

    function promptDashboardChangePlan(existingSub, currentAmt, newAmt) {
        // Kept as a compatibility shim for older cached callers. New plans are
        // always additive; never cancel existing subscriptions here.
        return promptDashboardAddSubscription(newAmt);

        const modal = get("dashboard-change-plan-modal") || get("change-plan-modal");
        const descEl = get("dashboard-change-plan-modal-desc") || get("change-plan-modal-desc");
        const confirmBtn = get("dashboard-change-plan-modal-confirm") || get("change-plan-modal-confirm");
        const keepBtn = get("dashboard-change-plan-modal-keep") || get("change-plan-modal-keep");
        const closeBtn = get("dashboard-change-plan-modal-close") || get("change-plan-modal-close");
        const errorEl = get("dashboard-change-plan-modal-error") || get("change-plan-modal-error");
        if (!modal) return;

        if (errorEl) {
            errorEl.textContent = "";
            errorEl.classList.add("is-hidden");
        }

        if (descEl) {
            if (currentAmt === newAmt) {
                descEl.textContent = `You already have an active plan of ₹${currentAmt.toLocaleString("en-IN")} / month. Do you want to restart or change your plan? If you change, your existing subscription will be cancelled and the new plan will start.`;
            } else {
                descEl.textContent = `You already have an active plan of ₹${currentAmt.toLocaleString("en-IN")} / month. Do you want to change to ₹${newAmt.toLocaleString("en-IN")} / month? If you change, your existing subscription will be cancelled and the new plan will start.`;
            }
        }

        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = "Yes, change plan";
        }
        if (keepBtn) keepBtn.disabled = false;
        if (closeBtn) closeBtn.disabled = false;

        modal.classList.remove("is-hidden");

        let isChangingPlan = false;
        const closeModal = () => {
            if (isChangingPlan) return;
            modal.classList.add("is-hidden");
        };

        confirmBtn.onclick = async () => {
            if (isChangingPlan) return;
            isChangingPlan = true;
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = `<span class="button-spinner button-spinner-dark" aria-hidden="true"></span> Changing plan…`;
            if (keepBtn) keepBtn.disabled = true;
            if (closeBtn) closeBtn.disabled = true;

            try {
                // 1. Cancel every active personal plan before creating the
                // replacement. This also repairs accounts that accumulated
                // more than one active plan during an earlier failed switch.
                const activePlans = [existingSub, ...findActiveSubscriptions(allRawRecords())];
                const cancelledIds = new Set();
                for (const subscription of activePlans) {
                    const subId = getSubscriptionIdentity(subscription) || String(subscription?.id || "").trim();
                    if (!subId || cancelledIds.has(subId)) continue;
                    cancelledIds.add(subId);

                    if (subId.startsWith("sub_")) {
                        const res = await fetch(`${BACKEND_URL}/cancel-subscription`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ subscription_id: subId }),
                        });
                        if (!res.ok) {
                            const errData = await res.json().catch(() => ({}));
                            const errMessage = String(errData.error || "");
                            if (!/not cancellable.*cancelled|already.*cancelled|cancelled status/i.test(errMessage)) {
                                throw new Error(errMessage || "Could not cancel the current subscription");
                            }
                            console.info(`Subscription ${subId} was already cancelled in Razorpay; syncing local status.`);
                        }
                    }

                    const cancelUpdates = {
                        subscriptionStatus: "cancelled",
                        status: "cancelled",
                        cancelledAt: Date.now(),
                        endedAt: Date.now(),
                        nextPaymentDue: null,
                    };
                    const updatePaths = getSubscriptionUpdatePaths(subscription);
                    let planUpdated = false;
                    let planUpdateError = null;
                    for (const path of [...new Set(updatePaths)]) {
                        try {
                            await update(ref(database, path), cancelUpdates);
                            planUpdated = true;
                        } catch (error) {
                            planUpdateError = error;
                        }
                    }
                    if (!planUpdated && !subId.startsWith("sub_")) {
                        throw planUpdateError || new Error("Could not save the current subscription cancellation");
                    }
                }
                isChangingPlan = false;
                closeModal();

                // 2. Start new plan
                await startMonthlySubscription(newAmt);
            } catch (err) {
                console.error("Failed to change plan:", err);
                isChangingPlan = false;
                if (errorEl) {
                    errorEl.textContent = err.message || "Failed to change plan. Please try again.";
                    errorEl.classList.remove("is-hidden");
                }
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = "Yes, change plan";
                if (keepBtn) keepBtn.disabled = false;
                if (closeBtn) closeBtn.disabled = false;
            }
        };

        keepBtn.onclick = () => {
            closeModal();
            const activeTierInput = document.querySelector(`input[name="dash-autopay-tier"][value="${currentAmt}"]`);
            if (activeTierInput) activeTierInput.checked = true;
        };
        closeBtn.onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target.hasAttribute("data-change-plan-dismiss")) closeModal();
        };
    }

    let isTogglingSubscriptionPause = false;
    async function executeToggleSubscriptionPause(targetSubId = null, triggerEl = null) {
        if (isTogglingSubscriptionPause) return;
        const records = allRawRecords();
        let targetSub = null;
        if (targetSubId) {
            targetSub = records.find((r) => (r.id === targetSubId || r.subscriptionId === targetSubId) && isSubscriptionRootRecord(r))
                || records.find((r) => (r.id === targetSubId || r.subscriptionId === targetSubId) && (r.path === "subscribers" || r.path === "subscribers_velcrow"))
                || records.find((r) => (r.id === targetSubId || r.subscriptionId === targetSubId) && isSubscriptionRecord(r));
        }
        if (!targetSub) {
            targetSub = findActiveSubscription(records)
                || records.find((r) => (r.path === "subscribers" || r.path === "subscribers_velcrow") && ["active", "paused"].includes(normalizedStatus(r)));
        }
        if (!targetSub) return;

        // Determine intended action:
        // Priority 1: Check trigger button state / text
        let isPausing = false;
        const triggerState = triggerEl?.getAttribute?.("data-state");
        const triggerText = triggerEl?.textContent?.toLowerCase?.() || "";
        if (triggerState === "pause" || triggerEl?.classList?.contains?.("btn-pause-sub") || triggerText.includes("pause")) {
            isPausing = true;
        } else if (triggerState === "resume" || triggerEl?.classList?.contains?.("btn-resume-sub") || triggerText.includes("resume")) {
            isPausing = false;
        } else {
            const currentSubStatus = normalizedStatus(targetSub);
            isPausing = currentSubStatus === "active";
        }
        const nextStatus = isPausing ? "paused" : "active";
        const subId = String(targetSub.subscriptionId || targetSub.id || "").trim();

        isTogglingSubscriptionPause = true;

        const dashToggle = get("dashboard-subscription-toggle");
        if (triggerEl && triggerEl !== dashToggle) {
            triggerEl.disabled = true;
            if (triggerEl.classList) {
                triggerEl.classList.add(isPausing ? "is-animating-reverse" : "is-animating");
            }
        }

        const message = get("subscription-message");
        if (message) {
            message.textContent = isPausing ? "Pausing subscription…" : "Resuming subscription…";
            message.classList.remove("error");
        }

        // Run POS card animation: REVERSE for pause, NORMAL for resume
        const animPromise = new Promise((resolve) => {
            if (dashToggle && typeof playPosTransactionAnimation === "function") {
                playPosTransactionAnimation(dashToggle, resolve, isPausing);
            } else {
                setTimeout(resolve, 800);
            }
        });

        // Run data update concurrently
        const updatePromise = (async () => {
            if (isPreviewMode) {
                targetSub.subscriptionStatus = nextStatus;
                targetSub.status = nextStatus;
                if (isPausing) {
                    targetSub.pausedAt = Date.now();
                } else {
                    targetSub.resumedAt = Date.now();
                }
                if (subscriberRecords.has(targetSub.id)) {
                    const existing = subscriberRecords.get(targetSub.id);
                    subscriberRecords.set(targetSub.id, {
                        ...existing,
                        subscriptionStatus: nextStatus,
                        status: nextStatus,
                        ...(isPausing ? { pausedAt: Date.now() } : { resumedAt: Date.now() }),
                    });
                }
                return true;
            } else {
                if (subId.startsWith("sub_")) {
                    const endpoint = isPausing ? "pause-subscription" : "resume-subscription";
                    const res = await fetch(`${BACKEND_URL}/${endpoint}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ subscription_id: subId }),
                    });
                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        const errMsg = String(errData.error || "").toLowerCase();
                        // If Razorpay indicates subscription is already in the target state, synchronize gracefully
                        if (errMsg.includes("active state") || errMsg.includes("already active")) {
                            console.warn("Razorpay: Subscription is already active in gateway, syncing local status.");
                        } else if (errMsg.includes("paused state") || errMsg.includes("already paused")) {
                            console.warn("Razorpay: Subscription is already paused in gateway, syncing local status.");
                        } else {
                            throw new Error(errData.error || `Failed to ${isPausing ? "pause" : "resume"} subscription in Razorpay`);
                        }
                    }
                }
                const updates = {
                    subscriptionStatus: nextStatus,
                    status: nextStatus,
                    ...(isPausing ? { pausedAt: Date.now() } : { resumedAt: Date.now() }),
                    updatedAt: Date.now(),
                };
                const updatePaths = getSubscriptionUpdatePaths(targetSub);
                if (updatePaths.length) {
                    for (const path of [...new Set(updatePaths)]) {
                        await update(ref(database, path), updates);
                    }
                } else if (subId) {
                    await update(ref(database, `subscribers/${subId}`), updates);
                }
                return true;
            }
        })();

        try {
            await Promise.all([animPromise, updatePromise]);

            if (message) {
                message.textContent = `Subscription ${nextStatus === "paused" ? "paused" : "resumed"}.`;
                message.classList.remove("error");
            }

            // Update the in-memory subscriber roots immediately. Firebase
            // listeners are asynchronous, so waiting for their next snapshot
            // leaves the button showing the old action after a successful API
            // response.
            const localUpdates = {
                subscriptionStatus: nextStatus,
                status: nextStatus,
                ...(isPausing ? { pausedAt: Date.now() } : { resumedAt: Date.now() }),
                updatedAt: Date.now(),
            };
            Object.assign(targetSub, localUpdates);
            const targetIdentity = getSubscriptionIdentity(targetSub);
            for (const list of subscriberRecords.values()) {
                if (!Array.isArray(list)) continue;
                list.forEach((record) => {
                    const recordIdentity = getSubscriptionIdentity(record);
                    if (recordIdentity && targetIdentity && recordIdentity === targetIdentity) {
                        Object.assign(record, localUpdates);
                    }
                });
            }
            renderRecords();
            if (typeof window.refreshSubscriptionMode === "function") {
                window.refreshSubscriptionMode();
            }
            const nextLabel = nextStatus === "paused" ? "Resume" : "Pause";
            setPosButtonText(dashToggle, nextLabel);
            dashToggle?.setAttribute("data-state", nextStatus === "paused" ? "resume" : "pause");
        } catch (error) {
            console.error("Unable to update subscription status:", error);
            if (message) {
                message.textContent = error.message || "Could not update your subscription. Please try again.";
                message.classList.add("error");
            }
        } finally {
            isTogglingSubscriptionPause = false;
            if (dashToggle) {
                dashToggle.classList.remove("is-animating", "is-animating-reverse");
                setPosButtonDisabled(dashToggle, false);
            }
            if (triggerEl && triggerEl !== dashToggle) {
                triggerEl.disabled = false;
                if (triggerEl.classList) {
                    triggerEl.classList.remove("is-animating", "is-animating-reverse");
                }
            }
        }
    }

    const cancelBtn = get("subscription-cancel");
    cancelBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        if (cancelBtn.disabled) return;
        const records = allRawRecords();
        const activeSub = findActiveSubscription(records);
        const activeGift = records.find((r) => isGiftRecord(r) && r.giftRole === "receiver" && ["active", "paused"].includes(normalizedStatus(r)));

        if (!activeSub && activeGift) {
            openCancelGiftModal(
                getGiftSubscriptionId(activeGift),
                activeGift.recipientName || (currentUser?.displayName || "Supporter"),
                activeGift.amount || 100,
                {
                    role: "receiver",
                    donorName: activeGift.donorName || "Kind Supporter",
                    recordId: activeGift.id,
                    recordPath: activeGift.path || activeGift.source,
                    reference: activeGift.reference,
                    razorpaySubscriptionId: activeGift.razorpaySubscriptionId || activeGift.razorpay_subscription_id,
                }
            );
            return;
        }

        if (!activeSub && !monthlyIntent) return;
        openCancelModal(activeSub);
    });

    get("cancel-modal-close")?.addEventListener("click", closeCancelModal);
    get("cancel-modal-keep")?.addEventListener("click", closeCancelModal);
    get("cancel-modal")?.addEventListener("click", (event) => {
        if (event.target instanceof HTMLElement && event.target.hasAttribute("data-cancel-dismiss")) closeCancelModal();
    });
    get("cancel-modal-confirm")?.addEventListener("click", executeCancelSubscription);

    let targetGiftToCancel = null;
    let isCancellingGift = false;

    function openCancelGiftModal(subId, recipientName, amount, meta = {}) {
        const modal = get("cancel-gift-modal");
        const titleEl = get("cancel-gift-modal-title");
        const descEl = get("cancel-gift-modal-desc");
        const confirmBtn = get("cancel-gift-modal-confirm");
        const keepBtn = get("cancel-gift-modal-keep");
        const closeBtn = get("cancel-gift-modal-close");
        const errorEl = get("cancel-gift-modal-error");
        if (!modal) return;

        const role = meta.role || "donor";
        const donorName = meta.donorName || "Kind Supporter";
        const recName = recipientName || "Supporter";
        const isReceiver = role === "receiver";

        targetGiftToCancel = {
            subId: String(subId || "").trim(),
            recipientName: recName,
            donorName,
            amount,
            role,
            isReceiver,
            recordId: String(meta.recordId || "").trim(),
            recordPath: String(meta.recordPath || "").trim(),
            reference: String(meta.reference || "").trim(),
            razorpaySubscriptionId: String(meta.razorpaySubscriptionId || "").trim(),
        };

        if (titleEl) {
            titleEl.textContent = isReceiver ? "End gifted membership" : "Cancel gifted membership";
        }

        if (descEl) {
            if (isReceiver) {
                descEl.innerHTML = `Are you sure you want to end this gifted membership from <strong>${escapeHtml(donorName)}</strong>? No further recurring charges will be made. All past gift records and rescue impact will remain safely preserved in your account.`;
            } else {
                descEl.innerHTML = `Are you sure you want to cancel the gifted membership for <strong>${escapeHtml(recName)}</strong>? No further recurring charges will be made. The past gift records will remain safely saved in both accounts.`;
            }
        }

        if (errorEl) {
            errorEl.textContent = "";
            errorEl.classList.add("is-hidden");
        }

        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = isReceiver ? "Yes, end membership" : "Yes, cancel gift";
        }
        if (keepBtn) {
            keepBtn.disabled = false;
            keepBtn.textContent = isReceiver ? "Keep gifted membership" : "Keep gift membership";
        }
        if (closeBtn) closeBtn.disabled = false;

        modal.classList.remove("is-hidden");
    }

    function closeCancelGiftModal() {
        if (isCancellingGift) return;
        const modal = get("cancel-gift-modal");
        modal?.classList.add("is-hidden");
        targetGiftToCancel = null;
    }

    async function executeCancelGiftSubscription() {
        if (isCancellingGift || !targetGiftToCancel) return;
        const confirmBtn = get("cancel-gift-modal-confirm");
        const keepBtn = get("cancel-gift-modal-keep");
        const closeBtn = get("cancel-gift-modal-close");
        const errorEl = get("cancel-gift-modal-error");

        isCancellingGift = true;
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = `<span class="button-spinner button-spinner-dark" aria-hidden="true"></span> Cancelling…`;
        }
        if (keepBtn) keepBtn.disabled = true;
        if (closeBtn) closeBtn.disabled = true;

        const now = Date.now();
        const target = targetGiftToCancel;
        const raw = allRawRecords();
        const targetIdentifiers = new Set([
            target.subId,
            target.recordId,
            target.reference,
            target.razorpaySubscriptionId,
        ].map((value) => String(value || "").trim()).filter(Boolean));
        const matchingGiftRecord = (record) => {
            if (!isGiftRecord(record)) return false;
            const identifiers = [
                record.subscriptionId,
                record.razorpaySubscriptionId,
                record.razorpay_subscription_id,
                record.reference,
                record.id,
                record.path && record.id ? `${record.path}/${record.id}` : "",
            ].map((value) => String(value || "").trim()).filter(Boolean);
            return identifiers.some((identifier) => targetIdentifiers.has(identifier));
        };
        const matchingGiftRecords = raw.filter(matchingGiftRecord);
        const canonicalGiftRecord = matchingGiftRecords.find((record) => getGiftSubscriptionId(record).startsWith("sub_"))
            || matchingGiftRecords[0]
            || null;
        let subId = String(
            target.razorpaySubscriptionId
            || (canonicalGiftRecord ? getGiftSubscriptionId(canonicalGiftRecord) : "")
            || target.subId
            || ""
        ).trim();
        const isReceiver = Boolean(targetGiftToCancel.isReceiver);

        if (!subId.startsWith("sub_")) {
            const match = raw.find((record) => {
                if (!isGiftRecord(record) || !record.subscriptionId || !String(record.subscriptionId).startsWith("sub_")) return false;
                return matchingGiftRecord(record)
                    || (record.recipientName && record.recipientName === target.recipientName);
            });
            if (match?.subscriptionId) {
                subId = String(match.subscriptionId).trim();
            }
        }

        const dbPaths = new Set();
        const addDbPath = (path, id) => {
            const safePath = String(path || "").trim();
            const safeId = String(id || "").trim();
            // normalizeSubscriberRecords creates -given/-received display ids
            // when one record represents both sides of a gift. Those are not
            // actual Firebase keys, so only use the original record id.
            if (!safeId || /-(given|received)$/.test(safeId)) return;
            // Gift records are canonical under `subscribers`. Writing a
            // cancellation into subscribers_velcrow creates a status-only
            // record, which later looks like a fake ₹100 personal plan.
            if (safePath === "subscribers") {
                dbPaths.add(`${safePath}/${safeId}`);
            }
        };
        addDbPath(target.recordPath, target.recordId);
        matchingGiftRecords.forEach((record) => addDbPath(record.path || record.source, record.id));
        if (subId) {
            addDbPath("subscribers", subId);
        }

        try {
            if (isPreviewMode) {
                for (const list of subscriberRecords.values()) {
                    if (Array.isArray(list)) {
                        list.filter((r) => r.subscriptionId === subId || r.id === subId).forEach((r) => {
                            r.status = "cancelled";
                            r.subscriptionStatus = "cancelled";
                            r.cancelledAt = now;
                            r.endedAt = now;
                        });
                    }
                }
                // Do not mark past payment receipts as cancelled - their initial payment was paid!
                paymentRecords.unshift({
                    id: `cancel-gift-${now}`,
                    path: `payments/${currentUser.uid}`,
                    type: "gift-cancellation",
                    isCancellation: true,
                    isGift: true,
                    is_gift: true,
                    membershipType: "gift",
                    giftRole: "donor",
                    reference: "—",
                    amount: null,
                    status: "cancelled",
                    subscriptionStatus: "cancelled",
                    date: now,
                    paidAt: now,
                    createdAt: now,
                    subscriptionId: subId,
                    recipientName: targetGiftToCancel.recipientName,
                    note: isReceiver
                        ? `Ended gifted membership from ${targetGiftToCancel.donorName || "Supporter"}`
                        : `Cancelled gifted subscription for ${targetGiftToCancel.recipientName}`,
                });
                const records = allRawRecords();
                records.filter((giftRecord) => matchingGiftRecord(giftRecord) && giftRecord.isSubscriptionRoot).forEach((giftRecord) => {
                    giftRecord.status = "cancelled";
                    giftRecord.subscriptionStatus = "cancelled";
                    giftRecord.cancelledAt = now;
                    giftRecord.endedAt = now;
                });
                isCancellingGift = false;
                closeCancelGiftModal();
                renderRecords();
                return;
            }

            let remoteCancellationConfirmed = false;
            if (subId.startsWith("sub_")) {
                const res = await fetch(`${BACKEND_URL}/cancel-subscription`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ subscription_id: subId, is_gift: true }),
                });
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    const errorMessage = String(errData.error || "");
                    // Razorpay returns this when a previous attempt already
                    // cancelled the subscription. Treat it as success and
                    // repair the stale Firebase/UI status below.
                    if (!/not cancellable.*cancelled|already.*cancelled|cancelled status/i.test(errorMessage)) {
                        throw new Error(errorMessage || "Failed to cancel gifted subscription in Razorpay");
                    }
                    console.info("Gifted subscription was already cancelled in Razorpay; syncing local status.");
                }
                remoteCancellationConfirmed = true;
            }

            const cancelUpdates = {
                status: "cancelled",
                subscriptionStatus: "cancelled",
                cancelledAt: now,
                endedAt: now,
                cancelledBy: isReceiver ? "receiver" : "donor",
                cancelledByUserId: currentUser?.uid || "",
                cancelledByName: currentUser?.displayName || currentUser?.email || (isReceiver ? "Gift Recipient" : "Gift Donor"),
                nextPaymentDue: null,
            };

            let databaseUpdateConfirmed = false;
            const databaseErrors = [];
            for (const path of dbPaths) {
                try {
                    await update(ref(database, path), cancelUpdates);
                    databaseUpdateConfirmed = true;
                } catch (error) {
                    databaseErrors.push(error);
                }
            }
            if (!databaseUpdateConfirmed && !remoteCancellationConfirmed) {
                throw databaseErrors[0] || new Error("Could not save the gifted membership cancellation.");
            }

            if (currentUser) {
                const cancelRef = push(ref(database, `payments/${currentUser.uid}`));
                await set(cancelRef, {
                    type: "gift-cancellation",
                    isCancellation: true,
                    isGift: true,
                    is_gift: true,
                    membershipType: "gift",
                    giftRole: "donor",
                    amount: null,
                    status: "cancelled",
                    email: currentUser.email || "",
                    createdAt: now,
                    date: now,
                    subscriptionId: subId,
                    recipientName: targetGiftToCancel.recipientName,
                    reference: "—",
                    note: isReceiver
                        ? `Ended gifted membership from ${targetGiftToCancel.donorName || "Supporter"}`
                        : `Cancelled gifted subscription for ${targetGiftToCancel.recipientName}`,
                }).catch(() => { });
            }

            for (const list of subscriberRecords.values()) {
                if (Array.isArray(list)) {
                    list.filter(matchingGiftRecord).forEach((r) => {
                        r.status = "cancelled";
                        r.subscriptionStatus = "cancelled";
                        r.cancelledAt = now;
                        r.endedAt = now;
                    });
                }
            }
            // Past payment records in paymentRecords remain confirmed paid receipts.

            isCancellingGift = false;
            closeCancelGiftModal();
            renderRecords();
        } catch (error) {
            console.error("Unable to cancel gifted subscription:", error);
            isCancellingGift = false;
            if (errorEl) {
                errorEl.textContent = error.message || "Could not cancel gifted subscription. Please try again.";
                errorEl.classList.remove("is-hidden");
            }
        } finally {
            isCancellingGift = false;
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = isReceiver ? "Yes, end membership" : "Yes, cancel gift";
            }
            if (keepBtn) keepBtn.disabled = false;
            if (closeBtn) closeBtn.disabled = false;
        }
    }

    document.addEventListener("click", (event) => {
        const cancelSubBtn = event.target.closest?.(".btn-cancel-sub-row");
        if (cancelSubBtn) {
            event.preventDefault();
            if (isCancellingSubscription) return;
            const targetSub = findPersonalSubscriptionById(cancelSubBtn.getAttribute("data-sub-id"));
            if (targetSub) openCancelModal(targetSub);
            return;
        }

        const pauseSubBtn = event.target.closest?.(".btn-pause-sub, .btn-resume-sub");
        if (pauseSubBtn) {
            event.preventDefault();
            const subId = pauseSubBtn.getAttribute("data-sub-id");
            executeToggleSubscriptionPause(subId, pauseSubBtn);
            return;
        }

        const cancelGiftBtn = event.target.closest?.(".btn-cancel-gift");
        if (cancelGiftBtn) {
            event.preventDefault();
            const subId = cancelGiftBtn.getAttribute("data-gift-sub-id");
            const recipient = cancelGiftBtn.getAttribute("data-gift-recipient");
            const donor = cancelGiftBtn.getAttribute("data-gift-donor");
            const role = cancelGiftBtn.getAttribute("data-gift-role") || "donor";
            const amount = cancelGiftBtn.getAttribute("data-gift-amount");
            openCancelGiftModal(subId, recipient, amount, {
                role,
                donorName: donor,
                recordId: cancelGiftBtn.getAttribute("data-gift-record-id"),
                recordPath: cancelGiftBtn.getAttribute("data-gift-record-path"),
                reference: cancelGiftBtn.getAttribute("data-gift-reference"),
                razorpaySubscriptionId: cancelGiftBtn.getAttribute("data-gift-razorpay-id"),
            });
        }
    });

    get("cancel-gift-modal-close")?.addEventListener("click", closeCancelGiftModal);
    get("cancel-gift-modal-keep")?.addEventListener("click", closeCancelGiftModal);
    get("cancel-gift-modal")?.addEventListener("click", (e) => {
        if (e.target instanceof HTMLElement && e.target.hasAttribute("data-cancel-gift-dismiss")) {
            closeCancelGiftModal();
        }
    });
    get("cancel-gift-modal-confirm")?.addEventListener("click", executeCancelGiftSubscription);

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

    function normalizeProfileName(value) {
        return String(value || "").trim().replace(/\s+/g, " ");
    }

    function applyProfileName(value) {
        const clean = normalizeProfileName(value);
        const firstName = clean.split(" ")[0] || "supporter";
        setText("dashboard-name", firstName);

        const avatar = get("account-avatar");
        if (avatar && !currentUser?.photoURL) {
            avatar.replaceChildren();
            avatar.textContent = firstName.charAt(0).toUpperCase() || "S";
        }
    }

    function openProfileNameModal() {
        const modal = get("profile-name-modal");
        const input = get("dashboard-name-input");
        const errorEl = get("dashboard-name-error");
        if (!modal || !input) return;

        const fallbackName = String(currentUser?.email || "")
            .split("@")[0]
            .replace(/[._-]+/g, " ");
        input.value = normalizeProfileName(currentUser?.displayName || fallbackName);
        if (errorEl) {
            errorEl.textContent = "";
            errorEl.classList.add("is-hidden");
        }
        modal.classList.remove("is-hidden");
        requestAnimationFrame(() => {
            input.focus();
            input.select();
        });
    }

    function closeProfileNameModal() {
        get("profile-name-modal")?.classList.add("is-hidden");
    }

    get("dashboard-edit-name-btn")?.addEventListener("click", openProfileNameModal);
    get("profile-name-modal-close")?.addEventListener("click", closeProfileNameModal);
    get("profile-name-cancel")?.addEventListener("click", closeProfileNameModal);
    get("profile-name-modal-backdrop")?.addEventListener("click", closeProfileNameModal);
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            const modal = get("profile-name-modal");
            if (modal && !modal.classList.contains("is-hidden")) {
                closeProfileNameModal();
            }
        }
    });

    get("dashboard-name-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = get("dashboard-name-input");
        const errorEl = get("dashboard-name-error");
        const submitBtn = get("profile-name-save");
        const clean = normalizeProfileName(input?.value);

        if (clean.length < 2) {
            if (errorEl) {
                errorEl.textContent = "Please enter your name.";
                errorEl.classList.remove("is-hidden");
            }
            input?.focus();
            return;
        }

        if (!currentUser) {
            if (errorEl) {
                errorEl.textContent = "Please sign in before changing your name.";
                errorEl.classList.remove("is-hidden");
            }
            return;
        }

        if (submitBtn) submitBtn.disabled = true;
        try {
            if (isPreviewMode) {
                currentUser.displayName = clean;
            } else {
                await updateProfile(currentUser, { displayName: clean });
                await update(ref(database, `users/${currentUser.uid}`), {
                    name: clean,
                    displayName: clean,
                    email: currentUser.email || "",
                    updatedAt: Date.now(),
                });
                currentUser.displayName = clean;
            }

            applyProfileName(clean);
            closeProfileNameModal();
        } catch (err) {
            console.error("Unable to save profile name:", err);
            if (errorEl) {
                errorEl.textContent = "Could not save your name. Please try again.";
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
        const authCard = get("dashboard-auth-card");
        const memberContent = get("dashboard-member-content");
        const logoutBtn = get("logout-button");
        if (authCard) authCard.classList.add("is-hidden");
        if (memberContent) memberContent.classList.remove("is-hidden-auth");
        if (logoutBtn) logoutBtn.classList.remove("is-hidden");

        setText("dashboard-user-email", currentUser.email);
        setText("dashboard-email", currentUser.email);
        applyProfileName(currentUser.displayName);
        setText("dashboard-phone", formatIndianPhone(currentUser.phone));
        const avatar = get("account-avatar");
        if (avatar) avatar.textContent = "A";

        const now = Date.now();
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;

        subscriberRecords.set("subscribers", [
            {
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
            },
            {
                id: "sub-gift-given-1",
                path: "subscribers",
                source: "subscribers",
                type: "gift-monthly",
                amount: 100,
                subscriptionStatus: "active",
                status: "active",
                isGift: true,
                giftRole: "donor",
                giver_id: currentUser.uid,
                giver_email: currentUser.email,
                giver_name: currentUser.displayName,
                donorEmail: currentUser.email,
                donorName: currentUser.displayName,
                recipientName: "Neha Patel",
                recipientEmail: "neha.patel@example.com",
                recipientPhone: "9876543211",
                subscriptionId: "sub_gift_neha_01",
                reference: "MS-GIFT-4490",
                date: now - 5 * 24 * 60 * 60 * 1000,
                createdAt: now - 5 * 24 * 60 * 60 * 1000,
                isSubscriptionRoot: true,
            },
            {
                id: "sub-gift-received-1",
                path: "subscribers",
                source: "subscribers",
                type: "gift-monthly",
                amount: 500,
                subscriptionStatus: "active",
                status: "active",
                isGift: true,
                giftRole: "receiver",
                giver_email: "priya.mehra@example.com",
                giver_name: "Priya Mehra",
                donorEmail: "priya.mehra@example.com",
                donorName: "Priya Mehra",
                recipientName: currentUser.displayName,
                recipientEmail: currentUser.email,
                recipientPhone: currentUser.phone,
                subscriptionId: "sub_gift_priya_02",
                reference: "MS-GIFT-9120",
                date: now - 12 * 24 * 60 * 60 * 1000,
                createdAt: now - 12 * 24 * 60 * 60 * 1000,
                nextPaymentDue: now + 18 * 24 * 60 * 60 * 1000,
                isSubscriptionRoot: true,
            }
        ]);

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
                subscriptionId: "sub_gift_neha_01",
                isGift: true,
                giftRole: "donor",
                amount: 100,
                status: "paid",
                recipientName: "Neha Patel",
                recipientEmail: "neha.patel@example.com",
                date: now - 5 * 24 * 60 * 60 * 1000,
                createdAt: now - 5 * 24 * 60 * 60 * 1000,
                note: "Gifted subscription for Neha Patel",
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
            const authCard = get("dashboard-auth-card");
            const memberContent = get("dashboard-member-content");
            const logoutBtn = get("logout-button");

            if (!user) {
                currentUser = null;
                subscriptionCheckoutPending = false;
                if (authCard) authCard.classList.remove("is-hidden");
                if (memberContent) memberContent.classList.add("is-hidden-auth");
                if (logoutBtn) logoutBtn.classList.add("is-hidden");
                return;
            }

            if (authCard) authCard.classList.add("is-hidden");
            if (memberContent) memberContent.classList.remove("is-hidden-auth");
            if (logoutBtn) logoutBtn.classList.remove("is-hidden");
            currentUser = user;
            const email = String(user.email || "").trim().toLowerCase();
            setText("dashboard-user-email", user.email || "");
            setText("dashboard-email", user.email || "");
            const displayName = user.displayName || email.split("@")[0] || "supporter";
            applyProfileName(displayName);
            const avatar = get("account-avatar");
            if (avatar) {
                avatar.textContent = displayName.charAt(0).toUpperCase();
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
                renderRecords();
            });

            onValue(ref(database, "subscribers_velcrow"), (snapshot) => { subscriberRecords.set("subscribers_velcrow", normalizeSubscriberRecords(snapshot.val(), "subscribers_velcrow", "subscribers_velcrow", email, currentUserPhone, user.uid)); renderRecords(); }, showDatabaseError);
            onValue(ref(database, "subscribers"), (snapshot) => { subscriberRecords.set("subscribers", normalizeSubscriberRecords(snapshot.val(), "subscribers", "subscribers", email, currentUserPhone, user.uid)); renderRecords(); }, showDatabaseError);
            onValue(ref(database, `payments/${user.uid}`), (snapshot) => { paymentRecords = normalizeUidRecords(snapshot.val(), "payment", `payments/${user.uid}`); renderRecords(); }, () => { });
            onValue(ref(database, "payments"), (snapshot) => { globalPaymentRecords = normalizeGlobalPaymentRecords(snapshot.val(), email, user.uid, currentUserPhone); renderRecords(); }, () => { });
            onValue(ref(database, "testPayments"), (snapshot) => { testPaymentRecords = normalizeUidRecords(snapshot.val(), "test-payment", "testPayments").filter((record) => String(record.email || "").trim().toLowerCase() === email); renderRecords(); }, () => { });
            onValue(ref(database, `paymentIntents/${user.uid}`), (snapshot) => { paymentIntents = normalizeUidRecords(snapshot.val(), "intent", `paymentIntents/${user.uid}`); renderRecords(); }, () => { });

            // Listen for exclusive custom plan assigned by admin
            onValue(ref(database, `customPlans/${user.uid}`), (snapshot) => {
                userCustomPlan = snapshot.val();
                renderCustomPlanBanner();
                renderRecords();
            }, () => { });
        });
    }

    // Plan selection & exclusive button event listeners
    get("dash-exclusive-btn")?.addEventListener("click", () => {
        if (userCustomPlan && Number(userCustomPlan.amount) > 0) {
            selectedDashboardPlanAmount = Number(userCustomPlan.amount);
            document.querySelectorAll(".dash-plan-btn").forEach((b) => b.classList.remove("active"));
            dashSubToggle?.click();
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
        if (typeof window.showView === "function") {
            window.showView("home");
        } else {
            window.location.hash = "#home";
        }
    });



    // Google Sign-in Handler for Dashboard Auth Card
    const googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: "select_account" });
    document.getElementById("dashboard-google-login-btn")?.addEventListener("click", async () => {
        const btn = document.getElementById("dashboard-google-login-btn");
        const msgEl = document.getElementById("dashboard-login-msg");
        if (msgEl) {
            msgEl.textContent = "Connecting to Google...";
            msgEl.style.color = "";
            msgEl.classList.remove("error");
        }
        if (btn) { btn.disabled = true; btn.style.opacity = "0.7"; }
        try {
            await signInWithPopup(auth, googleProvider);
            // onAuthStateChanged will handle UI update on success
        } catch (err) {
            console.error("Google sign-in error:", err);
            if (msgEl) {
                // Friendly messages for common errors
                let msg = "Google sign-in failed. Please try again.";
                if (err?.code === "auth/popup-blocked") msg = "Popup was blocked. Please allow popups for this site and try again.";
                else if (err?.code === "auth/popup-closed-by-user") msg = "Sign-in was cancelled. Please try again.";
                else if (err?.code === "auth/unauthorized-domain") msg = "This domain is not authorised for sign-in. Contact support.";
                else if (err?.message) msg = err.message;
                msgEl.textContent = msg;
                msgEl.style.color = "#e53e3e";
                msgEl.classList.add("error");
            }
        } finally {
            if (btn) { btn.disabled = false; btn.style.opacity = ""; }
        }
    });
