import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { get, push, ref, set, update } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";
import { auth, database, isDevelopmentMode } from "./firebase-client.js";

const params = new URLSearchParams(window.location.search);
const requestedPlan = params.get("plan");
const parsedAmount = Number.parseInt(params.get("amount"), 10);
const requestedAmount = Number.isFinite(parsedAmount) && parsedAmount > 0
  ? parsedAmount
  : (requestedPlan === "monthly" || requestedPlan === "gift" ? 100 : 500);
const authMessage = document.getElementById("auth-message");
const planNote = document.getElementById("plan-note");
const googleButton = document.getElementById("google-sign-in");
const nameForm = document.getElementById("profile-name-form");
const nameInput = document.getElementById("profile-name");
const googleProvider = new GoogleAuthProvider();
let handlingGoogleSignIn = false;
let setupCompleted = false;

googleProvider.setCustomParameters({ prompt: "select_account" });

function showMessage(message, isError = false) {
  if (!authMessage) return;
  authMessage.textContent = message;
  authMessage.classList.toggle("error", isError);
}

function readableAuthError(error) {
  const code = error?.code || "";
  if (code.includes("operation-not-allowed")) return "Google sign-in is not enabled in Firebase Authentication yet.";
  if (code.includes("unauthorized-domain")) return "This website is not added to Firebase Authentication's authorized domains.";
  if (code.includes("popup-closed-by-user")) return "Google sign-in was cancelled.";
  if (code.includes("account-exists-with-different-credential")) return "This email already uses another sign-in method in Firebase.";
  return "Google sign-in could not be completed. Please try again.";
}

function showNameForm(user) {
  if (googleButton) googleButton.classList.add("is-hidden");
  nameForm?.classList.remove("is-hidden");
  if (nameInput && !nameInput.value) nameInput.value = user.displayName || "";
  showMessage("One last step: add your name for your account.");
  nameInput?.focus();
}

async function saveUserAndRequest(user, name) {
  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  await update(ref(database, `users/${user.uid}`), {
    name: cleanName,
    fullName: cleanName,
    email: user.email || "",
    provider: "google.com",
    updatedAt: Date.now(),
  });
  if (cleanName && user.displayName !== cleanName) await updateProfile(user, { displayName: cleanName });

  if (!requestedPlan) return;
  const requestRef = push(ref(database, isDevelopmentMode ? "testPayments" : `paymentIntents/${user.uid}`));
  const requestType = requestedPlan === "gift" ? "gift-monthly" : requestedPlan === "one-time" ? "one-time" : "monthly";
  const requestAmount = requestedPlan === "monthly" ? requestedAmount : (requestedPlan === "gift" ? 100 : requestedAmount);
  const now = Date.now();
  const nextPayment = now + 30 * 24 * 60 * 60 * 1000;
  await set(requestRef, {
    type: requestType,
    amount: requestAmount,
    status: isDevelopmentMode ? requestedPlan === "monthly" ? "active" : "paid" : "pending",
    createdAt: now,
    email: user.email || "",
    name: cleanName,
    anonymous: params.get("anonymous") === "1",
    ...(requestedPlan === "gift" ? { recipientPhone: params.get("phone") || "" } : {}),
    ...(isDevelopmentMode ? { isTest: true, paidAt: now, reference: `DEV-${requestType.toUpperCase()}-${now}` } : {}),
    ...(isDevelopmentMode && requestedPlan === "monthly" ? {
      subscriptionStatus: "active",
      nextPaymentDue: nextPayment,
      team: "BCBB Dog Rescue",
      isSubscriptionRoot: true,
    } : {}),
  });

  if (isDevelopmentMode && requestedPlan === "monthly") {
    const payRef = push(ref(database, "testPayments"));
    await set(payRef, {
      type: "monthly",
      amount: requestAmount,
      status: "paid",
      isTest: true,
      email: user.email || "",
      createdAt: now,
      paidAt: now,
      date: now,
      subscriptionId: requestRef.key,
      reference: `MS-SUB-${Math.floor(2000 + Math.random() * 8000)}`,
      note: "Initial contribution",
    });
  }
}


async function continueWithUser(user, name) {
  if (setupCompleted) return;
  setupCompleted = true;
  try {
    await saveUserAndRequest(user, name);
    window.location.replace("user-dashboard.html");
  } catch (error) {
    console.error("Google user setup could not be saved:", error);
    setupCompleted = false;
    showMessage("Your sign-in worked, but your account could not be saved. Please try again.", true);
    googleButton?.classList.remove("is-hidden");
    nameForm?.classList.add("is-hidden");
  }
}

async function inspectUser(user) {
  if (!user?.emailVerified) {
    await signOut(auth);
    showMessage("Please continue with a verified Google account.", true);
    return;
  }
  try {
    const snapshot = await get(ref(database, `users/${user.uid}`));
    const savedName = snapshot.val()?.name || snapshot.val()?.fullName || "";
    if (savedName) {
      await continueWithUser(user, savedName);
    } else {
      showNameForm(user);
    }
  } catch (error) {
    console.error("Could not inspect the user profile:", error);
    showNameForm(user);
  }
}

if (requestedPlan && planNote) {
  planNote.textContent = requestedPlan === "monthly"
    ? `₹${requestAmount.toLocaleString("en-IN")} monthly support selected.`
    : requestedPlan === "gift"
      ? "₹100 gift subscription selected."
      : `₹${requestAmount.toLocaleString("en-IN")} one-time support selected.`;
  planNote.classList.remove("is-hidden");
}


onAuthStateChanged(auth, (user) => {
  if (!user || handlingGoogleSignIn || setupCompleted) return;
  inspectUser(user);
});

googleButton?.addEventListener("click", async () => {
  handlingGoogleSignIn = true;
  googleButton.disabled = true;
  showMessage("Opening Google sign-in…");
  try {
    const result = await signInWithPopup(auth, googleProvider);
    handlingGoogleSignIn = false;
    await inspectUser(result.user);
  } catch (error) {
    console.error(error);
    showMessage(readableAuthError(error), true);
    handlingGoogleSignIn = false;
    googleButton.disabled = false;
  }
});

nameForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const user = auth.currentUser;
  const name = String(nameInput?.value || "").trim().replace(/\s+/g, " ");
  if (name.length < 2) {
    showMessage("Enter at least two characters for your name.", true);
    return;
  }
  const submitButton = nameForm.querySelector("button[type=submit]");
  if (submitButton) submitButton.disabled = true;
  showMessage("Saving your profile…");
  try {
    await continueWithUser(user, name);
  } catch (error) {
    console.error(error);
    showMessage("Could not save your name. Please try again.", true);
    if (submitButton) submitButton.disabled = false;
  }
});
