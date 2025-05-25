// Firebase config and initialization
const firebaseConfig = {
  apiKey: "AIzaSyCRlRwkZrXwIY6b7MgXJe-gvt-tS5-VnjA",
  authDomain: "clean-up-india.firebaseapp.com",
  databaseURL:
    "https://clean-up-india-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "clean-up-india",
  storageBucket: "clean-up-india.appspot.com",
  messagingSenderId: "38976459666",
  appId: "1:38976459666:web:ef0c96c351fb5c4b2e274b",
  measurementId: "G-WJZC0WXY2F",
};

firebase.initializeApp(firebaseConfig);

// Form and message elements
const form = document.getElementById("form");
const message = document.getElementById("message");

// Form submit event
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const fullname = form.fullname.value.trim();
  const email = form.email.value.trim();
  const phone = form.phone.value.trim();
  const age = parseInt(form.age.value);
  const institution = form.institution.value.trim();
  const compliance = form.querySelector("#agree").checked;

  if (!fullname || !email || !phone || !age || !institution || !compliance) {
    message.textContent = "❌ Please complete all fields and accept the terms.";
    return;
  }

  const userId = Math.floor(10000 + Math.random() * 90000);
  const newRef = firebase.database().ref("volunteer_registrations").push();

  const userData = {
    userId,
    fullname,
    email,
    phone,
    age,
    institution,
    attendance: false,
    timestamp: new Date().toISOString(),
  };

  try {
    await newRef.set(userData);
    message.textContent = "✅ Registered successfully!";
    form.reset();
  } catch (error) {
    console.error(error);
    message.textContent = "❌ Error submitting your form.";
  }
});

// Toggle nav menu on small screens
const menu = document.querySelector(".menu");
const nav = document.querySelector("nav");

menu.addEventListener("click", () => {
  nav.classList.toggle("active");
});
