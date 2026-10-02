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

async function saveUserProfile(user, name) {
  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  await update(ref(database, `users/${user.uid}`), {
    name: cleanName,
    fullName: cleanName,
    email: user.email || "",
    provider: "google.com",
    updatedAt: Date.now(),
  });
  if (cleanName && user.displayName !== cleanName) await updateProfile(user, { displayName: cleanName });
}


async function continueWithUser(user, name) {
  if (setupCompleted) return;
  setupCompleted = true;
  try {
    await saveUserProfile(user, name);

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
