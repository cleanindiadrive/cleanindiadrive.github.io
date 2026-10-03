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

const phoneInput = document.getElementById("profile-phone");

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

function showProfileForm(user, savedName = "", savedPhone = "") {
  if (googleButton) googleButton.classList.add("is-hidden");
  nameForm?.classList.remove("is-hidden");
  if (nameInput) nameInput.value = savedName || user.displayName || "";
  if (phoneInput) phoneInput.value = cleanIndianPhone(savedPhone);

  if (!savedName && !savedPhone) {
    showMessage("Please enter your name and 10-digit mobile number to set up your account.");
    nameInput?.focus();
  } else if (!savedPhone) {
    showMessage("Please enter your 10-digit mobile number (compulsory).");
    phoneInput?.focus();
  } else {
    showMessage("Please verify your name and mobile number.");
    nameInput?.focus();
  }
}

async function saveUserProfile(user, name, phone) {
  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  const cleanPhone = cleanIndianPhone(phone);
  await update(ref(database, `users/${user.uid}`), {
    name: cleanName,
    fullName: cleanName,
    email: user.email || "",
    phone: cleanPhone,
    provider: "google.com",
    updatedAt: Date.now(),
  });
  if (cleanName && user.displayName !== cleanName) await updateProfile(user, { displayName: cleanName });
}

async function continueWithUser(user, name, phone) {
  if (setupCompleted) return;
  setupCompleted = true;
  try {
    await saveUserProfile(user, name, phone);

    // Save intended plan in sessionStorage so it preselects without auto-charging
    if (requestedPlan) {
      try {
        sessionStorage.setItem("sillysensei_intended_plan", JSON.stringify({
          plan: requestedPlan,
          amount: requestedAmount,
        }));
      } catch (_) {}
    }

    const returnUrl = params.get("return") || params.get("redirect");
    if (returnUrl) {
      const url = new URL(returnUrl, window.location.origin);
      if (requestedPlan) url.searchParams.set("plan", requestedPlan);
      if (requestedAmount) url.searchParams.set("amount", String(requestedAmount));
      window.location.replace(url.toString());
      return;
    }

    const target = requestedPlan === "monthly" && requestedAmount
      ? `user-dashboard.html?plan=monthly&amount=${requestedAmount}`
      : "user-dashboard.html";
    window.location.replace(target);
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
    const userData = snapshot.val();
    const savedName = userData?.name || userData?.fullName || "";
    const savedPhone = cleanIndianPhone(userData?.phone);

    // Both name and valid 10-digit mobile number are strictly compulsory!
    if (savedName && isValidIndianPhone(savedPhone)) {
      await continueWithUser(user, savedName, savedPhone);
    } else {
      showProfileForm(user, savedName, savedPhone);
    }
  } catch (error) {
    console.error("Could not inspect the user profile:", error);
    showProfileForm(user);
  }
}

if (requestedPlan && planNote) {
  planNote.textContent = requestedPlan === "monthly"
    ? `₹${requestedAmount.toLocaleString("en-IN")} monthly support selected.`
    : requestedPlan === "gift"
      ? "₹100 gift subscription selected."
      : `₹${requestedAmount.toLocaleString("en-IN")} one-time support selected.`;
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
  if (!user) {
    showMessage("Please sign in with Google first.", true);
    return;
  }
  const name = String(nameInput?.value || "").trim().replace(/\s+/g, " ");
  if (name.length < 2) {
    showMessage("Enter at least two characters for your name.", true);
    nameInput?.focus();
    return;
  }

  const rawPhone = String(phoneInput?.value || "").trim();
  const cleanPhone = cleanIndianPhone(rawPhone);

  if (!cleanPhone) {
    showMessage("Mobile number is compulsory. Please enter your 10-digit mobile number.", true);
    phoneInput?.focus();
    return;
  }
  if (cleanPhone.length < 10) {
    showMessage(`Mobile number is too short (${cleanPhone.length}/10 digits). Please enter a full 10-digit number.`, true);
    phoneInput?.focus();
    return;
  }
  if (cleanPhone.length > 10) {
    showMessage(`Mobile number is too long (${cleanPhone.length} digits). Please enter a 10-digit number.`, true);
    phoneInput?.focus();
    return;
  }
  if (!/^[6-9]/.test(cleanPhone)) {
    showMessage("Please enter a valid Indian mobile number starting with 6, 7, 8, or 9.", true);
    phoneInput?.focus();
    return;
  }

  const submitButton = nameForm.querySelector("button[type=submit]");
  if (submitButton) submitButton.disabled = true;
  showMessage("Saving your profile…");
  try {
    await continueWithUser(user, name, cleanPhone);
  } catch (error) {
    console.error(error);
    showMessage("Could not save your profile. Please try again.", true);
    if (submitButton) submitButton.disabled = false;
  }
});
