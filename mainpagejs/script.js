document.addEventListener("DOMContentLoaded", function () {
  // Performance optimization: Load images and show loading screen
  const loadingScreen = document.getElementById("loading-screen");
  // Images for home page
  const images = [
    "assets/smalllogo.svg",
    "assets/biglogo.svg",
    "assets/bg.png",
  ];
  let loadedImages = 0;

  // Preload critical images
  function preloadImages() {
    images.forEach((src) => {
      const img = new Image();
      img.onload = () => {
        loadedImages++;
        if (loadedImages === images.length) {
          // All images loaded, hide loading screen and add background
          setTimeout(() => {
            loadingScreen.classList.add("hidden");
            document.body.classList.add("loaded");
          }, 500);
        }
      };
      img.onerror = () => {
        console.warn(`Failed to load image: ${src}`);
        loadedImages++;
        if (loadedImages === images.length) {
          setTimeout(() => {
            loadingScreen.classList.add("hidden");
            document.body.classList.add("loaded");
          }, 500);
        }
      };
      img.src = src;
    });
  }

  // Start preloading
  preloadImages();

  // Fallback: Hide loading screen after 3 seconds regardless
  setTimeout(() => {
    if (!loadingScreen.classList.contains("hidden")) {
      loadingScreen.classList.add("hidden");
      document.body.classList.add("loaded");
    }
  }, 3000);

  // Navigation Menu Setup
  setupNavigation();

  function setupNavigation() {
    // Get DOM elements
    const hamburger = document.getElementById("hamburger");
    const navMenu = document.getElementById("navMenu");

    // Hamburger menu functionality
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

    // Close menu on escape key
    document.addEventListener("keydown", function (e) {
      if (
        e.key === "Escape" &&
        navMenu &&
        navMenu.classList.contains("active")
      ) {
        hamburger.classList.remove("active");
        navMenu.classList.remove("active");
      }
    });
  }

  // Enhanced link handling for different types of links
  document.querySelectorAll(".link-item").forEach((link) => {
    link.addEventListener("click", function (e) {
      const href = this.getAttribute("href");
      const originalText = this.textContent;

      // Check if it's a local HTML file or external link
      if (
        href &&
        (href.endsWith(".html") ||
          href.startsWith("http") ||
          href.startsWith("https"))
      ) {
        // For local HTML files and external links, show loading and navigate
        e.preventDefault();

        // Show loading state
        this.textContent = "Loading...";
        this.style.opacity = "0.6";
        this.style.pointerEvents = "none";

        // Navigate after a short delay for better UX
        setTimeout(() => {
          if (href.endsWith(".html")) {
            // Local HTML file - navigate in same window
            window.location.href = href;
          } else {
            // External link - open in new tab
            window.open(href, "_blank", "noopener,noreferrer");

            // Reset the button state since we're not leaving the page
            this.textContent = originalText;
            this.style.opacity = "1";
            this.style.pointerEvents = "auto";
          }
        }, 800);
      } else if (href && href.startsWith("#")) {
        // Anchor links - let them work normally (smooth scrolling handled elsewhere)
        return;
      } else {
        // For links without proper href or placeholder links
        e.preventDefault();

        // Show loading animation for placeholder effect
        this.textContent = "Loading...";
        this.style.opacity = "0.6";

        setTimeout(() => {
          this.textContent = originalText;
          this.style.opacity = "1";
          console.log("Placeholder link clicked:", originalText);

          // You can add custom actions here for specific links
          // For example, show a modal, trigger an action, etc.
        }, 1000);
      }
    });
  });

  // Handle navigation links separately (for navbar)
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", function (e) {
      const href = this.getAttribute("href");

      // Allow normal navigation for nav links
      if (
        href &&
        (href.endsWith(".html") ||
          href.startsWith("http") ||
          href.startsWith("https"))
      ) {
        // Let the browser handle the navigation normally
        return;
      } else if (href && href.startsWith("#")) {
        // Anchor links - let them work normally
        return;
      } else {
        // Prevent navigation for placeholder nav links
        e.preventDefault();
        console.log("Navigation placeholder clicked:", this.textContent);
      }
    });
  });

  // Optimized scroll effect for navbar
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

  // Add transition to navbar
  if (navbar) {
    navbar.style.transition = "transform 0.3s ease-in-out";
  }

  // Smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute("href"));
      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  });

  // Image error handling
  document.querySelectorAll("img").forEach((img) => {
    img.addEventListener("error", function () {
      console.warn(`Failed to load image: ${this.src}`);
      this.style.opacity = "0.5";
      this.alt = "Image failed to load";
    });
  });

  // Add active page highlighting for navigation
  function setActiveNavLink() {
    const currentPage =
      window.location.pathname.split("/").pop() || "index.html";
    const navLinks = document.querySelectorAll(".nav-link");

    navLinks.forEach((link) => {
      link.classList.remove("active");
      const linkHref = link.getAttribute("href");

      if (
        linkHref === currentPage ||
        (currentPage === "" && linkHref === "index.html") ||
        (currentPage === "index.html" && linkHref === "index.html")
      ) {
        link.classList.add("active");
      }
    });
  }

  // Set active navigation link
  setActiveNavLink();

  // Add resize handler for responsive behavior
  let resizeTimeout;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function () {
      const hamburger = document.getElementById("hamburger");
      const navMenu = document.getElementById("navMenu");

      // Close mobile menu on resize to desktop
      if (
        window.innerWidth > 768 &&
        navMenu &&
        navMenu.classList.contains("active")
      ) {
        hamburger.classList.remove("active");
        navMenu.classList.remove("active");
      }
    }, 250);
  });

  // Add touch support for mobile devices
  let touchStartY = 0;
  let touchEndY = 0;

  document.addEventListener("touchstart", function (e) {
    touchStartY = e.changedTouches[0].screenY;
  });

  document.addEventListener("touchend", function (e) {
    touchEndY = e.changedTouches[0].screenY;
    handleSwipe();
  });

  function handleSwipe() {
    const swipeThreshold = 50;
    const navMenu = document.getElementById("navMenu");
    const hamburger = document.getElementById("hamburger");

    if (navMenu && navMenu.classList.contains("active")) {
      // Swipe up to close menu
      if (touchStartY - touchEndY > swipeThreshold) {
        hamburger.classList.remove("active");
        navMenu.classList.remove("active");
      }
    }
  }

  // Add loading state management for page transitions
  function showPageLoading() {
    if (loadingScreen) {
      loadingScreen.classList.remove("hidden");
      loadingScreen.querySelector("p").textContent = "Loading page...";
    }
  }

  // Expose utility functions globally if needed
  window.SillySensei = {
    showLoading: showPageLoading,
    hideLoading: () => {
      if (loadingScreen) {
        loadingScreen.classList.add("hidden");
      }
    },
  };

  console.log("Navigation system initialized successfully");
});
