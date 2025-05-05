// Simple hardcoded login - you can later upgrade to Firebase Auth
document
  .getElementById("adminLoginForm")
  .addEventListener("submit", function (e) {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    if (username === "admin" && password === "admin") {
      sessionStorage.setItem("isAdmin", "true");
      window.location.href = "dashboard.html";
    } else {
      document.getElementById("loginMessage").textContent =
        "Invalid credentials!";
    }
  });
