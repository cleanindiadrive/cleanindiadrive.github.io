import express from "express";
import Razorpay from "razorpay";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import admin from "firebase-admin";
import bodyParser from "body-parser";

dotenv.config();

const app = express();
app.use(cors());

// Razorpay webhook requires the RAW body for HMAC signature verification
app.use("/razorpay-webhook", bodyParser.raw({ type: "*/*" }));
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// Firebase Admin Setup
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DB_URL,
});

const db = admin.database();
const whatsappQueueRef = db.ref("whatsapp_queue");

// Razorpay Instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const DEFAULT_TEAM = "NTG";
const allowedTeams = new Set([DEFAULT_TEAM]);

// Exact Plan IDs from your Razorpay Dashboard
const RAZORPAY_PLANS = {
  100: process.env.PLAN_ID_100 || "plan_SAoPHCDqPYimXm",
  500: process.env.PLAN_ID_500 || "plan_TjOuDT4u2LwObA",
  1000: process.env.PLAN_ID_1000 || "plan_TjOuMxRMoYF1hf",
  1500: process.env.PLAN_ID_1500 || "plan_TjOuUq4hKGqzPt",
};

const customPlanCache = new Map();

/**
 * Resolves amount to your specific Razorpay Plan ID with DB persistence
 * to prevent duplicate plan creation across server restarts.
 */
async function resolvePlanId(amount) {
  const rounded = Number(amount) || 100;
  // 1. Check your pre-created plans (100, 500, 1000, 1500)
  if (RAZORPAY_PLANS[rounded]) {
    return RAZORPAY_PLANS[rounded];
  }

  // 2. Check in-memory cache
  if (customPlanCache.has(rounded)) {
    return customPlanCache.get(rounded);
  }

  // 3. Check persistent Firebase cache to avoid duplicate Razorpay plans on restart
  try {
    const snap = await db.ref("razorpay_custom_plans").child(String(rounded)).get();
    if (snap.exists() && snap.val()?.planId) {
      const planId = snap.val().planId;
      customPlanCache.set(rounded, planId);
      return planId;
    }
  } catch (err) {
    console.warn("Could not check razorpay_custom_plans in DB:", err.message);
  }

  // 4. Create new plan in Razorpay
  const plan = await razorpay.plans.create({
    period: "monthly",
    interval: 1,
    item: {
      name: `Manali Strays ₹${rounded}/mo Support`,
      amount: rounded * 100, // in paise
      currency: "INR",
      description: `Monthly recurring contribution of ₹${rounded}`,
    },
  });

  customPlanCache.set(rounded, plan.id);
  await db.ref("razorpay_custom_plans").child(String(rounded)).set({
    planId: plan.id,
    amount: rounded,
    createdAt: Date.now(),
  }).catch(() => {});

  console.log(`✨ Created and cached custom Razorpay Plan for ₹${rounded}: ${plan.id}`);
  return plan.id;
}

class RequestValidationError extends Error {}

function readOptionalText(value, field, maxLength = 256) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  if (typeof value !== "string" || value.trim().length > maxLength) {
    throw new RequestValidationError(
      `${field} must be a string no longer than ${maxLength} characters`,
    );
  }
  return value.trim();
}

function getSubscriptionStatus(record) {
  return String(record?.subscriptionStatus || record?.status || "")
    .trim()
    .toLowerCase();
}

function isGiftRecord(record) {
  return record?.is_gift === true ||
    record?.is_gift === "true" ||
    record?.isGift === true ||
    record?.membershipType === "gift" ||
    String(record?.type || "").toLowerCase().startsWith("gift-");
}

function getGiftLifecycleFields(subscriptionOrNotes) {
  const notes = subscriptionOrNotes?.notes || subscriptionOrNotes || {};
  const isGift = notes.is_gift === true ||
    notes.is_gift === "true" ||
    notes.isGift === true ||
    notes.isGift === "true";
  return isGift
    ? {
        is_gift: "true",
        isGift: true,
        membershipType: "gift",
        type: "gift-monthly",
      }
    : {};
}

function getPersonalLifecycleFields(subscription) {
  const notes = subscription?.notes || {};
  if (getGiftLifecycleFields(subscription).isGift) return {};

  const fields = {};
  const userId = String(notes.user_id || notes.userId || "").trim();
  const email = String(notes.email || subscription?.customer_email || "").trim().toLowerCase();
  const name = String(notes.name || subscription?.customer_name || "").trim();
  const phone = String(notes.phone || subscription?.customer_contact || "").trim();
  if (userId) fields.userId = userId;
  if (email) fields.email = email;
  if (name) fields.name = name;
  if (phone) fields.phone = phone;
  return fields;
}

function isTerminalSubscriptionRecord(record) {
  const status = getSubscriptionStatus(record);
  return status === "cancelled" ||
    status === "completed" ||
    Boolean(record?.cancelledAt || record?.endedAt);
}

function isAlreadyInStateError(error, state) {
  const message = String(
    error?.error?.description || error?.message || error || "",
  ).toLowerCase();

  if (state === "paused") {
    return /already.*paused|paused state|can't be paused.*paused/.test(message);
  }
  if (state === "active") {
    return /already.*active|active state|can't be resumed.*active/.test(message);
  }
  if (state === "cancelled") {
    return /already.*cancel|cancelled state|not cancellable|can't be cancelled/.test(message);
  }
  return false;
}

async function subscriptionHasTerminalState(subId) {
  for (const targetPath of ["subscribers", "subscribers_velcrow"]) {
    const snap = await db.ref(targetPath).child(subId).get();
    if (snap.exists() && isTerminalSubscriptionRecord(snap.val())) {
      return true;
    }
  }
  return false;
}

async function findActivePersonalSubscriptions(userId, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const matches = new Map();

  for (const targetPath of ["subscribers", "subscribers_velcrow"]) {
    const snap = await db.ref(targetPath).get();
    const records = snap.val() || {};

    for (const [recordKey, record] of Object.entries(records)) {
      if (!record || typeof record !== "object" || isGiftRecord(record)) {
        continue;
      }

      const status = getSubscriptionStatus(record);
      if (!["active", "paused"].includes(status) || isTerminalSubscriptionRecord(record)) {
        continue;
      }

      const recordUserId = String(record.userId || record.user_id || "").trim();
      const recordEmail = String(record.email || "").trim().toLowerCase();
      const belongsToUser = (userId && recordUserId === userId) ||
        (normalizedEmail && recordEmail === normalizedEmail);
      if (!belongsToUser) {
        continue;
      }

      const subscriptionId = String(
        record.subscriptionId || record.subscription_id || record.id || recordKey,
      ).trim();
      if (subscriptionId.startsWith("sub_")) {
        matches.set(subscriptionId, {
          ...record,
          id: record.id || recordKey,
          subscriptionId,
          sourcePath: targetPath,
        });
      }
    }
  }

  return [...matches.values()];
}

/**
 * Helper to update subscriber records across both subscribers & subscribers_velcrow nodes
 * without overwriting unprovided fields.
 */
async function updateSubscriberRecord(subId, team, updates) {
  let updated = false;
  let foundExisting = false;
  const incomingStatus = updates?.subscriptionStatus || updates?.status;
  const incomingIsTerminal = ["cancelled", "completed"].includes(
    String(incomingStatus || "").toLowerCase(),
  );
  const primarySnap = await db.ref("subscribers").child(subId).get();
  const isGiftSubscription = isGiftRecord(primarySnap.val()) || isGiftRecord(updates);
  const targetPaths = isGiftSubscription
    ? ["subscribers"]
    : ["subscribers", "subscribers_velcrow"];

  for (const targetPath of targetPaths) {
    const ref = db.ref(targetPath).child(subId);
    const snap = await ref.get();
    if (snap.exists()) {
      foundExisting = true;
      if (isTerminalSubscriptionRecord(snap.val()) && !incomingIsTerminal) {
        console.warn(`⏭️ Ignoring ${incomingStatus || "status"} update for terminal subscription ${subId}`);
        continue;
      }
      await ref.update({ ...updates, updatedAt: Date.now() });
      updated = true;
    }
  }

  // If subscription doesn't exist yet, create minimal record to preserve status
  if (!updated && !foundExisting) {
    await db.ref("subscribers").child(subId).set({
      id: subId,
      subscriptionId: subId,
      team: team || DEFAULT_TEAM,
      ...updates,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  return true;
}

function isCapturedPayment(payment) {
  return String(payment?.status || "").trim().toLowerCase() === "captured" || payment?.captured === true;
}

/**
 * Persists a one-time payment after confirming its current Razorpay state.
 * Webhooks and the checkout verification endpoint both use this helper.
 */
async function reconcileOneTimePayment(payment, orderIdOverride = "") {
  const paymentId = String(payment?.id || "").trim();
  const orderId = String(payment?.order_id || orderIdOverride || "").trim();
  if (!paymentId || !orderId) {
    return { found: false, captured: false, status: "missing_payment_or_order" };
  }

  const orderRef = db.ref("one_time_payment_orders").child(orderId);
  const orderSnapshot = await orderRef.get();
  if (!orderSnapshot.exists()) {
    return { found: false, captured: false, status: "order_not_found", paymentId, orderId };
  }

  const orderData = orderSnapshot.val() || {};
  const paymentStatus = String(payment?.status || "").trim().toLowerCase() || "authorized";
  if (orderData.status === "captured") {
    return { found: true, captured: true, alreadyRecorded: true, status: "captured", paymentId, orderId };
  }

  if (!isCapturedPayment(payment)) {
    await orderRef.update({
      status: paymentStatus,
      paymentId,
      paymentStatus,
      updatedAt: Date.now(),
    });
    return { found: true, captured: false, status: paymentStatus, paymentId, orderId };
  }

  const amountInRupees = payment.amount ? payment.amount / 100 : Number(orderData.amount || 0) / 100;
  const donorName = orderData.donor?.name || "Supporter";
  const donorEmail = (orderData.donor?.email || "").toLowerCase().trim();
  const donorPhone = orderData.donor?.phone || "";
  const userId = orderData.userId || orderData.donor?.userId || "";
  const team = orderData.team || DEFAULT_TEAM;
  const paymentRecord = {
    id: paymentId,
    paymentId,
    orderId,
    amount: amountInRupees,
    currency: payment.currency || "INR",
    type: "one-time",
    status: "paid",
    email: donorEmail,
    name: donorName,
    phone: donorPhone,
    team,
    reference: paymentId,
    note: "One-time contribution",
    paidAt: payment.created_at ? payment.created_at * 1000 : Date.now(),
    createdAt: payment.created_at ? payment.created_at * 1000 : Date.now(),
  };

  await db.ref("payments").child(paymentId).set(paymentRecord);
  if (userId) {
    await db.ref(`payments/${userId}`).child(paymentId).set(paymentRecord);
  }
  await orderRef.update({
    status: "captured",
    paymentId,
    capturedAt: Date.now(),
    updatedAt: Date.now(),
  });

  return { found: true, captured: true, status: "captured", paymentId, orderId };
}

async function fetchLatestPayment(payment) {
  if (!payment?.id) return payment;
  try {
    return await razorpay.payments.fetch(payment.id);
  } catch (err) {
    console.warn(`Could not fetch latest Razorpay payment ${payment.id}:`, err.message);
    return payment;
  }
}

/**
 * 1. CREATE SUBSCRIPTION
 * Attaches the exact Razorpay plan corresponding to the selected amount
 */
app.post("/create-subscription", async (req, res) => {
  try {
    const team = DEFAULT_TEAM;
    const userId = readOptionalText(req.body?.user_id, "user_id", 128);
    const email = readOptionalText(req.body?.email, "email", 256);
    const name = readOptionalText(req.body?.name, "name", 128);
    const phone = readOptionalText(req.body?.phone, "phone", 32);
    const amount = Number(req.body?.amount) || 100;

    if (!userId) {
      return res.status(401).json({
        error: "Please sign in before starting a payment.",
      });
    }

    const requestId = crypto.randomUUID();

    // Resolves to exact Plan ID: ₹100, ₹500, ₹1000, or ₹1500 (or custom)
    const planId = await resolvePlanId(amount);

    console.log(`🚀 Creating subscription request ${requestId} for ₹${amount}/mo using Plan: ${planId}`);

    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 12,
      notes: {
        team: team,
        user_id: userId,
        email: email,
        name: name,
        phone: phone,
        amount: String(amount),
      },
    });
    res.json({
      subscription_id: subscription.id,
      razorpay_key: process.env.RAZORPAY_KEY_ID,
      amount: amount,
    });
  } catch (err) {
    if (err instanceof RequestValidationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("Subscription creation failed:", err);
    res.status(500).json({
      error: "Subscription creation failed: " + (err?.error?.description || err.message),
    });
  }
});

/**
 * 2. CREATE ONE-TIME PAYMENT
 * Stores userId in order record so captured payments link to the dashboard table
 */
app.post("/create-one-time-payment", async (req, res) => {
  try {
    const amountInput = req.body?.amount;
    const amountText =
      typeof amountInput === "number"
        ? String(amountInput)
        : typeof amountInput === "string"
          ? amountInput.trim()
          : "";
    const amountParts = amountText.match(/^(\d+)(?:\.(\d{1,2}))?$/);
    const amountInPaise = amountParts
      ? Number(amountParts[1]) * 100 +
        Number((amountParts[2] || "").padEnd(2, "0") || "0")
      : NaN;

    if (!Number.isSafeInteger(amountInPaise) || amountInPaise < 100) {
      return res.status(400).json({
        error: "Amount must be at least ₹1 and have no more than two decimal places",
      });
    }

    const team = DEFAULT_TEAM;
    const userId = readOptionalText(req.body?.user_id, "user_id", 128);
    const donor = {
      userId,
      name: readOptionalText(req.body?.name, "name", 128),
      email: readOptionalText(req.body?.email, "email", 256),
      phone: readOptionalText(req.body?.phone, "phone", 32),
    };

    if (!userId) {
      return res.status(401).json({
        error: "Please sign in before making a one-time payment.",
      });
    }

    if (donor.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donor.email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      notes: { team, userId: userId || "" },
    });
    await db.ref("one_time_payment_orders").child(order.id).set({
      amount: amountInPaise,
      currency: "INR",
      donor,
      userId: userId || "",
      team,
      status: "created",
      createdAt: Date.now(),
    });

    res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      razorpay_key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    if (err instanceof RequestValidationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("One-time payment creation failed:", err);
    res.status(500).json({ error: "One-time payment creation failed" });
  }
});

/**
 * Verifies the Checkout response immediately so a missed webhook does not
 * leave a captured one-time payment absent from the dashboard.
 */
app.post("/verify-one-time-payment", async (req, res) => {
  try {
    const orderId = readOptionalText(req.body?.razorpay_order_id, "razorpay_order_id", 128);
    const paymentId = readOptionalText(req.body?.razorpay_payment_id, "razorpay_payment_id", 128);
    const signature = readOptionalText(req.body?.razorpay_signature, "razorpay_signature", 256);
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ error: "Razorpay payment verification fields are required" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const receivedBuffer = Buffer.from(signature, "utf8");
    if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
      return res.status(400).json({ error: "Invalid Razorpay payment signature" });
    }

    const payment = await razorpay.payments.fetch(paymentId);
    if (String(payment?.order_id || "").trim() !== orderId) {
      return res.status(400).json({ error: "Payment does not belong to this order" });
    }

    const result = await reconcileOneTimePayment(payment, orderId);
    if (!result.found) {
      return res.status(404).json({ error: "Payment order was not found" });
    }
    return res.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof RequestValidationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("One-time payment verification failed:", err);
    return res.status(500).json({ error: "Could not verify one-time payment" });
  }
});

/**
 * 3. CREATE GIFT SUBSCRIPTION
 */
app.post("/create-gift-subscription", async (req, res) => {
  try {
    const recipientName = readOptionalText(req.body?.recipient_name, "recipient_name", 128);
    const recipientEmail = readOptionalText(req.body?.recipient_email, "recipient_email");
    const recipientPhone = readOptionalText(req.body?.recipient_phone, "recipient_phone", 32);
    const team = DEFAULT_TEAM;
    const giverId = readOptionalText(req.body?.giver_id, "giver_id", 128);
    const giverEmail = readOptionalText(req.body?.giver_email, "giver_email", 256);
    const giverName = readOptionalText(req.body?.giver_name, "giver_name", 128);
    const amount = Number(req.body?.amount) || 100;

    if (!giverId) {
      return res.status(401).json({
        error: "Please sign in before making a gift payment.",
      });
    }

    if (!recipientName || !recipientEmail) {
      return res.status(400).json({ error: "Recipient name and email are required" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return res.status(400).json({ error: "Invalid recipient email address" });
    }

    const planId = await resolvePlanId(amount);

    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 12,
      notes: {
        team,
        is_gift: "true",
        gift_recipient_name: recipientName,
        gift_recipient_email: recipientEmail,
        gift_recipient_phone: recipientPhone,
        giver_id: giverId || "",
        giver_email: giverEmail || "",
        giver_name: giverName || "",
        amount: String(amount),
      },
    });
    res.json({
      subscription_id: subscription.id,
      razorpay_key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    if (err instanceof RequestValidationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("Gift subscription creation failed:", err);
    res.status(500).json({ error: "Gift subscription creation failed" });
  }
});

/**
 * 4. PAUSE SUBSCRIPTION IN RAZORPAY
 */
app.post("/pause-subscription", async (req, res) => {
  try {
    const subscription_id = readOptionalText(req.body?.subscription_id, "subscription_id", 128);
    if (!subscription_id) {
      return res.status(400).json({ error: "subscription_id is required" });
    }

    if (subscription_id.startsWith("sub_")) {
      await razorpay.subscriptions.pause(subscription_id, {
        pause_at: "now",
      });
      console.log(`⏸️ Razorpay API: paused ${subscription_id}`);
    }

    await updateSubscriberRecord(subscription_id, DEFAULT_TEAM, {
      status: "paused",
      subscriptionStatus: "paused",
      pausedAt: Date.now(),
    });

    res.json({ success: true, status: "paused" });
  } catch (err) {
    if (isAlreadyInStateError(err, "paused")) {
      const subscription_id = readOptionalText(req.body?.subscription_id, "subscription_id", 128);
      await updateSubscriberRecord(subscription_id, DEFAULT_TEAM, {
        status: "paused",
        subscriptionStatus: "paused",
        pausedAt: Date.now(),
      });
      console.warn(`⏭️ Subscription was already paused; synced ${subscription_id}`);
      return res.json({ success: true, status: "paused", alreadyInState: true });
    }
    console.error("Razorpay Pause Error:", err);
    res.status(500).json({
      error: err?.error?.description || err?.message || "Failed to pause subscription in Razorpay",
    });
  }
});

/**
 * 5. RESUME SUBSCRIPTION IN RAZORPAY
 */
app.post("/resume-subscription", async (req, res) => {
  try {
    const subscription_id = readOptionalText(req.body?.subscription_id, "subscription_id", 128);
    if (!subscription_id) {
      return res.status(400).json({ error: "subscription_id is required" });
    }

    if (subscription_id.startsWith("sub_")) {
      await razorpay.subscriptions.resume(subscription_id, {
        resume_at: "now",
      });
      console.log(`▶️ Razorpay API: resumed ${subscription_id}`);
    }

    await updateSubscriberRecord(subscription_id, DEFAULT_TEAM, {
      status: "active",
      subscriptionStatus: "active",
      resumedAt: Date.now(),
    });

    res.json({ success: true, status: "active" });
  } catch (err) {
    if (isAlreadyInStateError(err, "active")) {
      const subscription_id = readOptionalText(req.body?.subscription_id, "subscription_id", 128);
      await updateSubscriberRecord(subscription_id, DEFAULT_TEAM, {
        status: "active",
        subscriptionStatus: "active",
        resumedAt: Date.now(),
      });
      console.warn(`⏭️ Subscription was already active; synced ${subscription_id}`);
      return res.json({ success: true, status: "active", alreadyInState: true });
    }
    console.error("Razorpay Resume Error:", err);
    res.status(500).json({
      error: err?.error?.description || err?.message || "Failed to resume subscription in Razorpay",
    });
  }
});

/**
 * 6. CANCEL SUBSCRIPTION IN RAZORPAY
 */
app.post("/cancel-subscription", async (req, res) => {
  try {
    const subscription_id = readOptionalText(req.body?.subscription_id, "subscription_id", 128);
    const requestIsGift = req.body?.is_gift === true || req.body?.is_gift === "true" || req.body?.isGift === true || req.body?.isGift === "true";
    if (!subscription_id) {
      return res.status(400).json({ error: "subscription_id is required" });
    }

    if (subscription_id.startsWith("sub_")) {
      await razorpay.subscriptions.cancel(subscription_id, false);
      console.log(`❌ Razorpay API: cancelled ${subscription_id}`);
    }

    await updateSubscriberRecord(subscription_id, DEFAULT_TEAM, {
      ...(requestIsGift ? {
        is_gift: "true",
        isGift: true,
        membershipType: "gift",
        type: "gift-monthly",
      } : {}),
      status: "cancelled",
      subscriptionStatus: "cancelled",
      cancelledAt: Date.now(),
      endedAt: Date.now(),
      nextPaymentDue: null,
    });
    res.json({ success: true, status: "cancelled" });
  } catch (err) {
    if (isAlreadyInStateError(err, "cancelled")) {
      const subscription_id = readOptionalText(req.body?.subscription_id, "subscription_id", 128);
      const requestIsGift = req.body?.is_gift === true || req.body?.is_gift === "true" || req.body?.isGift === true || req.body?.isGift === "true";
      const now = Date.now();
      await updateSubscriberRecord(subscription_id, DEFAULT_TEAM, {
        ...(requestIsGift ? {
          is_gift: "true",
          isGift: true,
          membershipType: "gift",
          type: "gift-monthly",
        } : {}),
        status: "cancelled",
        subscriptionStatus: "cancelled",
        cancelledAt: now,
        endedAt: now,
        nextPaymentDue: null,
      });
      console.warn(`⏭️ Subscription was already cancelled; synced ${subscription_id}`);
      return res.json({ success: true, status: "cancelled", alreadyInState: true });
    }
    console.error("Razorpay Cancel Error:", err);
    res.status(500).json({
      error: err?.error?.description || err?.message || "Failed to cancel subscription in Razorpay",
    });
  }
});

/**
 * 7. RAZORPAY WEBHOOK (Handles all 22 active events with full deduplication)
 */
app.post("/razorpay-webhook", async (req, res) => {
  try {
    const webhookSecret = process.env.WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    // Verify signature only if WEBHOOK_SECRET is set in .env
    if (webhookSecret && webhookSecret.trim() !== "" && webhookSecret !== "undefined") {
      const expected = crypto
        .createHmac("sha256", webhookSecret.trim())
        .update(req.body)
        .digest("hex");

      if (signature !== expected) {
        console.error("❌ Webhook signature verification failed!");
        return res.status(400).send("Bad signature");
      }
    } else {
      console.warn("⚠️ WEBHOOK_SECRET not provided in .env. Skipping signature verification (Test Mode).");
    }

    const event = JSON.parse(req.body.toString());
    const eventType = event.event;
    console.log(`🔔 Razorpay Webhook Event: ${eventType}`);

    // DEDUPLICATION STEP 1: Check if this exact Razorpay event ID was already processed
    const eventId = event.id || req.headers["x-razorpay-event-id"];
    if (eventId) {
      const eventSnap = await db.ref("processed_webhook_events").child(eventId).get();
      if (eventSnap.exists()) {
        console.log(`⏭️ Webhook event ${eventId} (${eventType}) was already processed. Skipping duplicate.`);
        return res.status(200).json({ status: "already_processed", eventId });
      }
    }

    // --- EVENT: PAYMENT AUTHORIZED OR CAPTURED ---
    if (eventType === "payment.authorized" || eventType === "payment.captured") {
      const rawPayment = event.payload?.payment?.entity || {};
      // The authorized webhook can arrive with an older snapshot even after
      // Razorpay has already captured the payment, so fetch the current state.
      const payment = eventType === "payment.authorized"
        ? await fetchLatestPayment(rawPayment)
        : rawPayment;
      const result = await reconcileOneTimePayment(payment, rawPayment.order_id);
      if (result.captured) {
        console.log(`✅ One-time payment recorded: ${result.paymentId}`);
      } else if (result.found) {
        console.log(`ℹ️ One-time payment ${result.paymentId} is ${result.status}; awaiting capture.`);
      } else {
        console.warn(`⚠️ Could not reconcile one-time payment ${result.paymentId || "unknown"}: ${result.status}`);
      }
    }

    // --- EVENT: SUBSCRIPTION AUTHENTICATED ---
    if (eventType === "subscription.authenticated") {
      const sub = event.payload.subscription.entity;
      const notes = sub.notes || {};
      const team = allowedTeams.has(notes.team) ? notes.team : DEFAULT_TEAM;
      const targetPath = "subscribers";

      if (notes.is_gift === "true") {
        const recipient = {
          id: sub.id,
          name: notes.gift_recipient_name || "Gift Recipient",
          email: (notes.gift_recipient_email || "").toLowerCase().trim(),
          phone: notes.gift_recipient_phone || "",
          team,
          membershipType: "gift",
          is_gift: true,
          isGift: true,
          giftRole: "receiver",
          recipient_name: notes.gift_recipient_name || "Gift Recipient",
          recipient_email: (notes.gift_recipient_email || "").toLowerCase().trim(),
          recipient_phone: notes.gift_recipient_phone || "",
          giver_id: notes.giver_id || "",
          giver_email: (notes.giver_email || "").toLowerCase().trim(),
          giver_name: notes.giver_name || "Supporter",
          subscriptionId: sub.id,
          amount: Number(notes.amount) || 100,
          status: "active",
          subscriptionStatus: "active",
          type: "gift-monthly",
          subscribedAt: sub.created_at ? sub.created_at * 1000 : Date.now(),
          lastPaymentAt: Date.now(),
          createdAt: sub.created_at ? sub.created_at * 1000 : Date.now(),
          updatedAt: Date.now(),
        };

        const existingSnap = await db.ref(targetPath).child(sub.id).get();
        if (await subscriptionHasTerminalState(sub.id)) {
          console.warn(`⏭️ Ignoring late authentication for terminal gift subscription ${sub.id}`);
        } else if (existingSnap.exists()) {
          await db.ref(targetPath).child(sub.id).update({
            ...recipient,
            lastPaymentAt: existingSnap.val()?.lastPaymentAt || recipient.lastPaymentAt,
            nextPaymentDue: existingSnap.val()?.nextPaymentDue || null,
          });
        } else {
          await db.ref(targetPath).child(sub.id).set(recipient);
        }

        // WhatsApp deduplication
        const queueSnap = await whatsappQueueRef.child(sub.id).get();
        if (!queueSnap.exists()) {
          await whatsappQueueRef.child(sub.id).set({
            name: recipient.name,
            phone: recipient.phone || "no-phone",
            team,
            status: "pending",
            createdAt: Date.now(),
          });
        }
      } else {
        const email = (notes.email || sub.customer_email || "").toLowerCase().trim();
        const name = notes.name || sub.customer_name || (email ? email.split("@")[0] : "Hero Donor");
        const phone = notes.phone || sub.customer_contact || "";
        const amount = Number(notes.amount) || 100;

        const subscriberData = {
          id: sub.id,
          subscriptionId: sub.id,
          userId: notes.user_id || "",
          name,
          email,
          phone,
          amount,
          team,
          status: "active",
          subscriptionStatus: "active",
          type: "monthly",
          planId: sub.plan_id || RAZORPAY_PLANS[amount] || process.env.PLAN_ID,
          subscribedAt: sub.created_at ? sub.created_at * 1000 : Date.now(),
          lastPaymentAt: Date.now(),
          createdAt: sub.created_at ? sub.created_at * 1000 : Date.now(),
          nextPaymentDue: sub.charge_at ? sub.charge_at * 1000 : Date.now() + 30 * 24 * 60 * 60 * 1000,
        };

        const existingSnap = await db.ref(targetPath).child(sub.id).get();
        if (await subscriptionHasTerminalState(sub.id)) {
          console.warn(`⏭️ Ignoring late authentication for terminal subscription ${sub.id}`);
        } else if (existingSnap.exists()) {
          await db.ref(targetPath).child(sub.id).update({
            ...subscriberData,
            lastPaymentAt: existingSnap.val()?.lastPaymentAt || subscriberData.lastPaymentAt,
            nextPaymentDue: existingSnap.val()?.nextPaymentDue || subscriberData.nextPaymentDue,
          });
        } else {
          await db.ref(targetPath).child(sub.id).set(subscriberData);
        }

        // WhatsApp deduplication
        const queueSnap = await whatsappQueueRef.child(sub.id).get();
        if (!queueSnap.exists()) {
          await whatsappQueueRef.child(sub.id).set({
            name: subscriberData.name,
            phone: subscriberData.phone || "no-phone",
            team,
            status: "pending",
            createdAt: Date.now(),
          });
        }
      }
      console.log(`✅ Subscription saved to Firebase: ${sub.id}`);
    }

    // --- EVENT: SUBSCRIPTION ACTIVATED ---
    if (eventType === "subscription.activated") {
      const sub = event.payload.subscription.entity;
      const notes = sub.notes || {};
      const team = notes.team || DEFAULT_TEAM;
      await updateSubscriberRecord(sub.id, team, {
        ...getGiftLifecycleFields(sub),
        ...getPersonalLifecycleFields(sub),
        status: "active",
        subscriptionStatus: "active",
        activatedAt: Date.now(),
      });
      console.log(`✅ Subscription activated: ${sub.id}`);
    }

    // --- EVENT: SUBSCRIPTION CHARGED ---
    if (eventType === "subscription.charged") {
      const sub = event.payload.subscription.entity;
      const payment = event.payload.payment?.entity || {};
      const notes = sub.notes || {};
      const team = notes.team || DEFAULT_TEAM;
      const amountInRupees = payment.amount ? payment.amount / 100 : Number(notes.amount) || 100;
      
      // Strict deterministic payment ID (never random timestamp to prevent duplicates)
      const paymentId = payment.id || (payment.entity && payment.entity.id) || `${sub.id}_charge_${payment.created_at || Date.now()}`;

      // Update next renewal & last payment timestamp on subscriber
      await updateSubscriberRecord(sub.id, team, {
        ...getGiftLifecycleFields(sub),
        ...getPersonalLifecycleFields(sub),
        status: "active",
        subscriptionStatus: "active",
        lastPaymentAt: payment.created_at ? payment.created_at * 1000 : Date.now(),
        nextPaymentDue: sub.charge_at ? sub.charge_at * 1000 : Date.now() + 30 * 24 * 60 * 60 * 1000,
      });

      const chargeRecord = {
        id: paymentId,
        paymentId: paymentId,
        subscriptionId: sub.id,
        orderId: payment.order_id || "",
        amount: amountInRupees,
        currency: payment.currency || "INR",
        type: notes.is_gift === "true" ? "gift-monthly" : "monthly",
        status: "paid",
        email: (notes.email || notes.giver_email || sub.customer_email || "").toLowerCase().trim(),
        name: notes.name || notes.giver_name || sub.customer_name || "Supporter",
        recipientName: notes.gift_recipient_name || "",
        recipientEmail: notes.gift_recipient_email || "",
        recipientPhone: notes.gift_recipient_phone || "",
        phone: notes.phone || sub.customer_contact || "",
        team: team,
        reference: paymentId,
        note: notes.is_gift === "true" ? `Gift monthly subscription for ${notes.gift_recipient_name}` : "Monthly subscription contribution",
        paidAt: payment.created_at ? payment.created_at * 1000 : Date.now(),
        createdAt: payment.created_at ? payment.created_at * 1000 : Date.now(),
      };

      // 1. Global payments node (homepage total raised & donor list)
      await db.ref("payments").child(paymentId).set(chargeRecord);

      // 2. Personal payments node (dashboard Subscription Overview charges table)
      let targetUserId = notes.is_gift === "true" ? notes.giver_id : notes.user_id;
      if (!targetUserId) {
        // Resolve from subscriber record if not in webhook notes
        const subSnap = await db.ref("subscribers").child(sub.id).get();
        if (subSnap.exists()) {
          targetUserId = subSnap.val()?.userId || subSnap.val()?.giver_id || "";
        }
      }

      if (targetUserId) {
        await db.ref(`payments/${targetUserId}`).child(paymentId).set(chargeRecord);
      }

      console.log(`✅ Subscription charge recorded: ₹${amountInRupees} (ID: ${paymentId})`);
    }

    // --- EVENT: SUBSCRIPTION PAUSED ---
    if (eventType === "subscription.paused") {
      const sub = event.payload.subscription.entity;
      await updateSubscriberRecord(sub.id, sub.notes?.team || DEFAULT_TEAM, {
        ...getGiftLifecycleFields(sub),
        status: "paused",
        subscriptionStatus: "paused",
        pausedAt: Date.now(),
      });
      console.log(`⏸️ Subscription paused: ${sub.id}`);
    }

    // --- EVENT: SUBSCRIPTION RESUMED ---
    if (eventType === "subscription.resumed") {
      const sub = event.payload.subscription.entity;
      await updateSubscriberRecord(sub.id, sub.notes?.team || DEFAULT_TEAM, {
        ...getGiftLifecycleFields(sub),
        status: "active",
        subscriptionStatus: "active",
        resumedAt: Date.now(),
      });
      console.log(`▶️ Subscription resumed: ${sub.id}`);
    }

    // --- EVENT: SUBSCRIPTION PENDING ---
    if (eventType === "subscription.pending") {
      const sub = event.payload.subscription.entity;
      await updateSubscriberRecord(sub.id, sub.notes?.team || DEFAULT_TEAM, {
        ...getGiftLifecycleFields(sub),
        status: "pending",
        subscriptionStatus: "pending",
      });
    }

    // --- EVENT: SUBSCRIPTION HALTED ---
    if (eventType === "subscription.halted") {
      const sub = event.payload.subscription.entity;
      await updateSubscriberRecord(sub.id, sub.notes?.team || DEFAULT_TEAM, {
        ...getGiftLifecycleFields(sub),
        status: "halted",
        subscriptionStatus: "halted",
        haltedAt: Date.now(),
      });
      console.log(`⚠️ Subscription halted: ${sub.id}`);
    }

    // --- EVENT: SUBSCRIPTION CANCELLED OR COMPLETED ---
    if (eventType === "subscription.cancelled" || eventType === "subscription.completed") {
      const sub = event.payload.subscription.entity;
      const newStatus = eventType === "subscription.completed" ? "completed" : "cancelled";
      await updateSubscriberRecord(sub.id, sub.notes?.team || DEFAULT_TEAM, {
        ...getGiftLifecycleFields(sub),
        status: newStatus,
        subscriptionStatus: newStatus,
        cancelledAt: Date.now(),
        endedAt: Date.now(),
        nextPaymentDue: null,
      });
      console.log(`❌ Subscription ${newStatus}: ${sub.id}`);
    }

    // --- EVENT: PAYMENT FAILED ---
    if (eventType === "payment.failed") {
      const payment = event.payload.payment.entity;
      console.warn(`⚠️ Payment failed: ${payment.id}, reason: ${payment.error_description}`);
      if (payment.order_id) {
        await db.ref("one_time_payment_orders").child(payment.order_id).update({
          status: "failed",
          failedAt: Date.now(),
          error: payment.error_description || "Payment failed",
        });
      }
    }

    // Mark event ID as processed to guarantee idempotency on retries
    if (eventId) {
      await db.ref("processed_webhook_events").child(eventId).set({
        eventType,
        processedAt: Date.now(),
      });
    }

    // Acknowledge all events to Razorpay
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook Error:", err);
    res.sendStatus(500);
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Server running on port", process.env.PORT || 3000),
);
