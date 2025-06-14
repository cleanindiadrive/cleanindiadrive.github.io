// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC-lTZXouBnGzHWY90V1Gc6-3E9KMr7B3s",
  authDomain: "sourcespage-f9ec5.firebaseapp.com",
  databaseURL:
    "https://sourcespage-f9ec5-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sourcespage-f9ec5",
  storageBucket: "sourcespage-f9ec5.firebasestorage.app",
  messagingSenderId: "735637358319",
  appId: "1:735637358319:web:0939cd0653724517b1bd1a",
  measurementId: "G-37G9EQTXGK",
};

// Global variables
let database;
let sourcesData = {};
let isFirebaseReady = false;

// Initialize Firebase when the page loads
function initializeFirebase() {
  try {
    if (typeof firebase !== "undefined") {
      firebase.initializeApp(firebaseConfig);
      database = firebase.database();
      isFirebaseReady = true;
      console.log("Firebase initialized successfully");
    } else {
      console.error("Firebase SDK not loaded");
      setTimeout(initializeFirebase, 1000); // Retry after 1 second
    }
  } catch (error) {
    console.error("Error initializing Firebase:", error);
    setTimeout(initializeFirebase, 1000); // Retry after 1 second
  }
}

document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM loaded, starting initialization...");

  // Initialize Firebase first
  initializeFirebase();

  // Start the app initialization
  initializeApp();
});

function initializeApp() {
  console.log("Initializing app...");

  // Hide loading screen after a short delay to ensure everything is ready
  setTimeout(() => {
    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) {
      loadingScreen.classList.add("hidden");
      document.body.classList.add("loaded");
      console.log("Loading screen hidden");
    }

    // Setup the app
    setupApp();
  }, 1500); // Give Firebase time to initialize
}

function setupApp() {
  console.log("Setting up app...");

  setupEventListeners();
  setupNavbarScroll();
  setupImageErrorHandling();

  // Load sources after a brief delay to ensure Firebase is ready
  setTimeout(() => {
    loadSources();
  }, 500);
}

function setupEventListeners() {
  console.log("Setting up event listeners...");

  // Hamburger menu
  const hamburger = document.getElementById("hamburger");
  const navMenu = document.getElementById("navMenu");

  if (hamburger && navMenu) {
    hamburger.addEventListener("click", function () {
      this.classList.toggle("active");
      navMenu.classList.toggle("active");
    });
  }

  // Close menu when clicking on a link (mobile)
  const navLinks = document.querySelectorAll(".nav-link");
  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      if (hamburger && navMenu) {
        hamburger.classList.remove("active");
        navMenu.classList.remove("active");
      }
    });
  });

  // Close menu when clicking outside (mobile)
  document.addEventListener("click", function (e) {
    if (
      navMenu &&
      hamburger &&
      !navMenu.contains(e.target) &&
      !hamburger.contains(e.target) &&
      navMenu.classList.contains("active")
    ) {
      hamburger.classList.remove("active");
      navMenu.classList.remove("active");
    }
  });

  // Search functionality
  const searchInput = document.getElementById("searchInput");
  const searchBtn = document.getElementById("searchBtn");

  if (searchBtn) {
    searchBtn.addEventListener("click", performSearch);
  }

  if (searchInput) {
    searchInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        performSearch();
      }
    });

    searchInput.addEventListener("input", function () {
      if (this.value === "") {
        clearSearch();
      }
    });
  }
}

function loadSources() {
  console.log("Loading sources...");

  const sourcesLoading = document.getElementById("sourcesLoading");

  if (sourcesLoading) {
    sourcesLoading.style.display = "block";
  }

  // Check if Firebase is ready
  if (!isFirebaseReady || !database) {
    console.log("Firebase not ready, retrying...");
    setTimeout(loadSources, 1000);
    return;
  }

  try {
    database.ref("sources").on(
      "value",
      (snapshot) => {
        console.log("Sources data received");

        if (sourcesLoading) {
          sourcesLoading.style.display = "none";
        }

        const sources = snapshot.val();
        sourcesData = sources || {};
        displaySources(sources);
      },
      (error) => {
        console.error("Error loading sources:", error);

        if (sourcesLoading) {
          sourcesLoading.style.display = "none";
        }

        showToast("Failed to load sources. Please refresh the page.", "error");

        // Show empty state even if there's an error
        displaySources(null);
      }
    );
  } catch (error) {
    console.error("Error setting up Firebase listener:", error);

    if (sourcesLoading) {
      sourcesLoading.style.display = "none";
    }

    showToast(
      "Failed to connect to database. Please refresh the page.",
      "error"
    );
    displaySources(null);
  }
}

function displaySources(sources) {
  console.log("Displaying sources:", sources);

  const container = document.getElementById("sourcesContent");
  if (!container) return;

  // Clear existing content except loading indicator
  const existingSources = container.querySelectorAll(
    ".source-item, .no-sources"
  );
  existingSources.forEach((item) => item.remove());

  if (!sources || Object.keys(sources).length === 0) {
    const noSources = document.createElement("div");
    noSources.className = "no-sources";
    noSources.innerHTML = `
        <div class="no-sources-content">
          <div class="no-sources-icon">📚</div>
          <h3>No Sources Found</h3>
          <p>No sources match your search criteria. Try a different search term.</p>
        </div>
      `;
    container.appendChild(noSources);
    return;
  }

  // Convert sources object to array and sort by timestamp (newest first)
  const sourcesArray = Object.entries(sources)
    .map(([key, value]) => ({
      id: key,
      ...value,
    }))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  sourcesArray.forEach((source, index) => {
    const sourceElement = createSourceElement(source, index + 1);
    container.appendChild(sourceElement);
  });
}

function createSourceElement(source, index) {
  const sourceDiv = document.createElement("div");
  sourceDiv.className = "source-item";
  sourceDiv.setAttribute("data-id", source.id);

  const links = source.links || [];
  const linksHtml = links
    .map((link) => {
      return `<a href="${link}" class="source-link" target="_blank" rel="noopener noreferrer" title="${link}">${link}</a>`;
    })
    .join("");

  const dateAdded = source.timestamp
    ? new Date(source.timestamp).toLocaleDateString()
    : "Unknown date";

  sourceDiv.innerHTML = `
      <div class="source-header">
        <h3>${escapeHtml(source.title)}</h3>
        <div class="source-actions">
          <span class="source-date">${dateAdded}</span>
        </div>
      </div>
      <div class="source-links">
        <div class="links-label">Source Links:</div>
        ${linksHtml}
      </div>
    `;

  return sourceDiv;
}

function performSearch() {
  const searchInput = document.getElementById("searchInput");
  if (!searchInput) return;

  const searchTerm = searchInput.value.toLowerCase().trim();
  const sourceItems = document.querySelectorAll(".source-item");

  if (searchTerm === "") {
    clearSearch();
    return;
  }

  let foundResults = 0;

  sourceItems.forEach((item) => {
    const title = item.querySelector("h3");
    const links = item.querySelectorAll(".source-link");

    if (!title) return;

    const titleText = title.textContent.toLowerCase();
    const linksText = Array.from(links)
      .map((link) => link.textContent.toLowerCase())
      .join(" ");

    if (titleText.includes(searchTerm) || linksText.includes(searchTerm)) {
      item.style.display = "block";
      highlightSearchTerm(item, searchTerm);
      foundResults++;
    } else {
      item.style.display = "none";
    }
  });

  // Show search results count
  if (foundResults === 0) {
    showToast(`No results found for "${searchTerm}"`, "info");
  }
}

function clearSearch() {
  const sourceItems = document.querySelectorAll(".source-item");
  sourceItems.forEach((item) => {
    item.style.display = "block";
    // Clear any highlighting
    const title = item.querySelector("h3");
    if (title) {
      const originalText = title.textContent;
      title.innerHTML = escapeHtml(originalText);
    }
  });
}

function highlightSearchTerm(element, term) {
  const title = element.querySelector("h3");
  if (!title) return;

  const originalText = title.textContent;
  const highlightedText = originalText.replace(
    new RegExp(`(${escapeRegex(term)})`, "gi"),
    `<span class="search-highlight">$1</span>`
  );
  title.innerHTML = highlightedText;
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icons = {
    success: "✅",
    error: "❌",
    info: "ℹ️",
    warning: "⚠️",
  };

  toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${escapeHtml(message)}</span>
      <button class="toast-close">&times;</button>
    `;

  container.appendChild(toast);

  // Show toast
  setTimeout(() => toast.classList.add("toast-show"), 100);

  // Auto remove after 5 seconds
  const autoRemove = setTimeout(() => removeToast(toast), 5000);

  // Manual close
  toast.querySelector(".toast-close").addEventListener("click", () => {
    clearTimeout(autoRemove);
    removeToast(toast);
  });
}

function removeToast(toast) {
  toast.classList.remove("toast-show");
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
}

function setupNavbarScroll() {
  let ticking = false;
  let lastScrollTop = 0;
  const navbar = document.querySelector(".navbar");

  function updateNavbar() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    if (scrollTop > lastScrollTop && scrollTop > 100) {
      navbar.style.transform = "translateY(-100%)";
    } else {
      navbar.style.transform = "translateY(0)";
    }

    lastScrollTop = scrollTop;
    ticking = false;
  }

  window.addEventListener("scroll", function () {
    if (!ticking) {
      requestAnimationFrame(updateNavbar);
      ticking = true;
    }
  });

  if (navbar) {
    navbar.style.transition = "transform 0.3s ease-in-out";
  }
}

function setupImageErrorHandling() {
  document.querySelectorAll("img").forEach((img) => {
    img.addEventListener("error", function () {
      console.warn(`Failed to load image: ${this.src}`);
      this.style.opacity = "0.5";
      this.alt = "Image failed to load";
    });
  });
}
