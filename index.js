// Wait for DOM and Firebase to be fully loaded
document.addEventListener("DOMContentLoaded", function () {
  // Check if Firebase is loaded
  const firebase = window.firebase; // Declare the firebase variable
  if (typeof firebase === "undefined") {
    console.error(
      "Firebase is not loaded. Make sure to include Firebase SDK before this script."
    );
    return;
  }

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

  // Initialize Firebase only if not already initialized
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  // Form and message elements
  const form = document.getElementById("form");
  const message = document.getElementById("message");

  if (!form || !message) {
    console.error("Form or message element not found");
    return;
  }

  // Student status conditional fields
  const studentRadios = document.querySelectorAll('input[name="is_student"]');
  const studentFields = document.getElementById("student-fields");
  const institutionField = document.getElementById("institution");
  const courseField = document.getElementById("course");
  const passingYearField = document.getElementById("passing_year");

  // Radio button styling
  const radioOptions = document.querySelectorAll(".radio-option");
  radioOptions.forEach(function (option) {
    option.addEventListener("click", function () {
      const radio = this.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;

        // Remove selected class from all options
        radioOptions.forEach(function (opt) {
          opt.classList.remove("selected");
        });
        // Add selected class to clicked option
        this.classList.add("selected");

        // Trigger change event
        const changeEvent = new Event("change");
        radio.dispatchEvent(changeEvent);
      }
    });
  });

  // Handle student status change
  studentRadios.forEach(function (radio) {
    radio.addEventListener("change", function () {
      if (this.value === "yes") {
        // Show student fields with animation
        if (studentFields) {
          studentFields.classList.add("show");
        }

        // Make fields required
        if (institutionField) institutionField.required = true;
        if (courseField) courseField.required = true;
        if (passingYearField) passingYearField.required = true;

        // Focus on first field after animation
        setTimeout(function () {
          if (institutionField) institutionField.focus();
        }, 200);
      } else {
        // Hide student fields
        if (studentFields) {
          studentFields.classList.remove("show");
        }

        // Remove required attribute
        if (institutionField) {
          institutionField.required = false;
          institutionField.value = "";
        }
        if (courseField) {
          courseField.required = false;
          courseField.value = "";
        }
        if (passingYearField) {
          passingYearField.required = false;
          passingYearField.value = "";
        }
      }
    });
  });

  // Helper function to create formatted registration timestamp string
  function createRegistrationTimestamp() {
    const now = new Date();

    // Get day, month, year
    const day = now.getDate();
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const month = monthNames[now.getMonth()];
    const year = now.getFullYear();

    // Get time in 12-hour format
    const hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    const ampm = hours >= 12 ? "pm" : "am";
    const formattedHour = hour12.toString().padStart(2, "0");

    // Format: "25 May 2025, 05:55 pm"
    return `${day} ${month} ${year}, ${formattedHour}:${minutes} ${ampm}`;
  }

  // Form submit event
  form.addEventListener("submit", function (e) {
    e.preventDefault();

    const button = document.querySelector(".animated-button");

    // Get form data
    const fullname = form.fullname.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const age = parseInt(form.age.value);
    const isStudentElement = form.querySelector(
      'input[name="is_student"]:checked'
    );
    const isStudent = isStudentElement ? isStudentElement.value : "";
    const compliance = form.querySelector("#agree").checked;

    // Basic validation
    if (!fullname || !email || !phone || !age || !isStudent || !compliance) {
      message.innerHTML =
        '<p style="color: #e74c3c; font-weight: bold;">❌ Please complete all required fields and accept the terms.</p>';
      return;
    }

    // Student-specific validation
    let institution = "";
    let course = "";
    let passingYear = "";

    if (isStudent === "yes") {
      institution = form.institution ? form.institution.value.trim() : "";
      course = form.course ? form.course.value : "";
      passingYear = form.passing_year ? form.passing_year.value : "";

      if (!institution || !course || !passingYear) {
        message.innerHTML =
          '<p style="color: #e74c3c; font-weight: bold;">❌ Please fill in all student information fields.</p>';
        return;
      }

      // Validate passing year
      const currentYear = new Date().getFullYear();
      const yearNum = parseInt(passingYear);
      if (yearNum < currentYear || yearNum > currentYear + 15) {
        message.innerHTML =
          '<p style="color: #e74c3c; font-weight: bold;">❌ Please enter a valid passing out year.</p>';
        return;
      }
    }

    // Add loading state
    if (button) {
      button.classList.add("loading");
      const textSpan = button.querySelector(".text");
      if (textSpan) {
        textSpan.textContent = "Submitting...";
      }
    }

    // Generate unique user ID
    const userId = Math.floor(10000 + Math.random() * 90000);
    const newRef = firebase.database().ref("volunteer_registrations").push();

    // Create formatted registration timestamp
    const registrationTimestamp = createRegistrationTimestamp();

    // Prepare user data
    const userData = {
      userId: userId,
      fullname: fullname,
      email: email,
      phone: phone,
      age: age,
      isStudent: isStudent,
      attendance: false,
      timestamp: new Date().toISOString(), // Keep original ISO timestamp
      registrationDateTime: registrationTimestamp, // "25 May 2025, 05:55 pm"
    };

    // Add student-specific fields if applicable
    if (isStudent === "yes") {
      userData.institution = institution;
      userData.course = course;
      userData.passingYear = parseInt(passingYear);
      userData.studentStatus = "active";
    } else {
      userData.studentStatus = "not_student";
    }

    // Save to Firebase
    newRef
      .set(userData)
      .then(function () {
        // Remove loading state
        if (button) {
          button.classList.remove("loading");
          const textSpan = button.querySelector(".text");
          if (textSpan) {
            textSpan.textContent = "Start Your Journey";
          }
        }

        // Success message with formatted timestamp
        let successMessage =
          '<p style="color: #2ecc71; font-weight: bold;">🎉 Registration successful! Check your email for next steps.</p>';

        successMessage +=
          '<p style="color: #2ecc71; margin-top: 10px;">📅 Registered on: ' +
          registrationTimestamp +
          "</p>";

        if (isStudent === "yes") {
          successMessage +=
            '<p style="color: #2ecc71; margin-top: 10px;">🎓 Student details recorded: ' +
            course +
            " at " +
            institution +
            ", graduating in " +
            passingYear +
            "</p>";
        }

        message.innerHTML = successMessage;

        // Reset form
        form.reset();

        // Reset radio button styling
        radioOptions.forEach(function (opt) {
          opt.classList.remove("selected");
        });
        if (studentFields) {
          studentFields.classList.remove("show");
        }

        // Reset student field requirements
        if (institutionField) institutionField.required = false;
        if (courseField) courseField.required = false;
        if (passingYearField) passingYearField.required = false;
      })
      .catch(function (error) {
        console.error("Firebase error:", error);

        // Remove loading state
        if (button) {
          button.classList.remove("loading");
          const textSpan = button.querySelector(".text");
          if (textSpan) {
            textSpan.textContent = "Start Your Journey";
          }
        }

        message.innerHTML =
          '<p style="color: #e74c3c; font-weight: bold;">❌ Error submitting your form. Please try again.</p>';
      });
  });

  // Mobile menu toggle
  const menu = document.querySelector(".menu");
  const nav = document.querySelector("nav");

  if (menu && nav) {
    menu.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();

      nav.classList.toggle("active");
      menu.classList.toggle("active");
    });

    // Close menu when clicking outside
    document.addEventListener("click", function (e) {
      if (nav.classList.contains("active")) {
        if (!nav.contains(e.target) && !menu.contains(e.target)) {
          nav.classList.remove("active");
          menu.classList.remove("active");
        }
      }
    });

    // Close menu when clicking nav links
    const navLinks = document.querySelectorAll("nav a");
    navLinks.forEach(function (link) {
      link.addEventListener("click", function (e) {
        const href = this.getAttribute("href");
        if (href.startsWith("#")) {
          e.preventDefault();
          const target = document.querySelector(href);
          if (target) {
            // Close mobile menu first
            if (nav.classList.contains("active")) {
              nav.classList.remove("active");
              menu.classList.remove("active");
            }

            // Then scroll with offset for fixed header
            const header = document.querySelector("header");
            const headerHeight = header ? header.offsetHeight : 70;
            const targetPosition = target.offsetTop - headerHeight - 20;

            window.scrollTo({
              top: targetPosition,
              behavior: "smooth",
            });
          }
        }
      });
    });
  }

  // Auto-generate current year placeholder for passing year
  const currentYear = new Date().getFullYear();
  const passingYearInput = document.getElementById("passing_year");
  if (passingYearInput) {
    passingYearInput.placeholder = "e.g., " + (currentYear + 1);
  }
});
