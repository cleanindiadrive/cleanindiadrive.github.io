// Ensure the admin is logged in
if (sessionStorage.getItem("isAdmin") !== "true") {
  window.location.href = "login.html";
}

document.getElementById("logoutBtn").onclick = () => {
  sessionStorage.removeItem("isAdmin");
  window.location.href = "login.html";
};

const filterType = document.getElementById("filterType");
const filterValue = document.getElementById("filterValue");
const container = document.getElementById("participantsCards");
const searchInput = document.getElementById("searchInput");
const totalCountElement = document.getElementById("totalCount");

let allData = [];
const firebase = window.firebase; // Declare the firebase variable

// Load data from Firebase - using firebase.database() directly
firebase
  .database()
  .ref("volunteer_registrations")
  .on("value", (snapshot) => {
    allData = [];
    container.innerHTML = "";

    snapshot.forEach((childSnapshot) => {
      const data = childSnapshot.val();
      data.id = childSnapshot.key;
      allData.push(data);
    });

    updateParticipantCount(allData.length);
    populateFilterOptions(allData);
    renderCards(allData);
  });

// Update count
function updateParticipantCount(count) {
  if (totalCountElement) {
    totalCountElement.textContent = count;
  }
}

// Format date for display
function formatDate(dateString) {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (e) {
    return dateString;
  }
}

// Get student status badge
function getStudentStatusBadge(isStudent, studentStatus) {
  if (isStudent === "yes" || studentStatus === "active") {
    return '<span class="status-badge student">Student</span>';
  } else {
    return '<span class="status-badge non-student">Non-Student</span>';
  }
}

// Get attendance status badge
function getAttendanceStatusBadge(attendance, daysAttended = 0) {
  const status = attendance ? "present" : "absent";
  const text = attendance ? "Present" : "Absent";
  return `<span class="attendance-status ${status}">${text} (${daysAttended} days)</span>`;
}

// Render participant cards with enhanced details
function renderCards(dataArray, highlight = "") {
  container.innerHTML = "";

  const regex = highlight ? new RegExp(`(${highlight})`, "gi") : null;

  dataArray.forEach((data) => {
    // Basic information
    const fullName = data.fullname || "";
    const userId = data.userId || "";
    const email = data.email || "";
    const phone = data.phone || "";
    const age = data.age || "N/A";

    // Student information
    const isStudent = data.isStudent || "";
    const studentStatus = data.studentStatus || "";
    const institution = data.institution || "";
    const course = data.course || "";
    const passingYear = data.passingYear || "";

    // Attendance information
    const attendance = data.attendance || false;
    const daysAttended = data.daysAttended || 0;
    const attendanceLog = data.attendanceLog || [];

    // Registration information
    const registrationDate = data.registrationDate || "";
    const registrationTime = data.registrationTime || "";
    const timestamp = data.timestamp || "";

    // Apply highlighting
    const highlightedFullName = highlight
      ? fullName.replace(regex, "<mark>$1</mark>")
      : fullName;
    const highlightedUserId = highlight
      ? userId.toString().replace(regex, "<mark>$1</mark>")
      : userId;
    const highlightedEmail = highlight
      ? email.replace(regex, "<mark>$1</mark>")
      : email;
    const highlightedPhone = highlight
      ? phone.replace(regex, "<mark>$1</mark>")
      : phone;
    const highlightedInstitution = highlight
      ? institution.replace(regex, "<mark>$1</mark>")
      : institution;
    const highlightedCourse = highlight
      ? course.replace(regex, "<mark>$1</mark>")
      : course;

    const card = document.createElement("div");
    card.className = "participant-card";

    // Build student information section
    let studentInfo = "";
    if (isStudent === "yes" || studentStatus === "active") {
      studentInfo = `
        <div class="student-info">
          <p><strong>Institution:</strong> ${
            highlightedInstitution || "N/A"
          }</p>
          <p><strong>Course:</strong> ${highlightedCourse || "N/A"}</p>
          <p><strong>Passing Year:</strong> ${passingYear || "N/A"}</p>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="card-header">
        <h3>${highlightedFullName}</h3>
        ${getStudentStatusBadge(isStudent, studentStatus)}
      </div>
      
      <div class="card-content">
        <div class="basic-info">
          <p><strong>User ID:</strong> ${highlightedUserId || "N/A"}</p>
          <p><strong>Email:</strong> ${highlightedEmail}</p>
          <p><strong>Phone:</strong> ${highlightedPhone}</p>
          <p><strong>Age:</strong> ${age}</p>
        </div>
        
        ${studentInfo}
        
        <div class="attendance-info">
          <p><strong>Attendance:</strong> ${getAttendanceStatusBadge(
            attendance,
            daysAttended
          )}</p>
          <p><strong>Total Days:</strong> ${daysAttended}</p>
          ${
            attendanceLog.length > 0
              ? `<p><strong>Last Attended:</strong> ${
                  attendanceLog[attendanceLog.length - 1] || "Never"
                }</p>`
              : ""
          }
        </div>
        
        <div class="registration-info">
          <p><strong>Registered:</strong> ${
            registrationDate || formatDate(timestamp)
          }</p>
          ${
            registrationTime
              ? `<p><strong>Time:</strong> ${registrationTime}</p>`
              : ""
          }
        </div>
      </div>
      
      <div class="card-actions">
        <button class="btn-primary" onclick="updateParticipant('${
          data.id
        }')">Update</button>
        <button class="btn-danger" onclick="deleteParticipant('${
          data.id
        }')">Delete</button>
        <button class="btn-secondary" onclick="toggleAttendance('${
          data.id
        }')">Toggle Attendance</button>
      </div>
    `;

    // Make the card clickable to open the attendance log
    card.addEventListener("click", (e) => {
      // Don't trigger if clicking on buttons
      if (!e.target.closest(".card-actions")) {
        showAttendanceLog(fullName, attendanceLog);
      }
    });

    container.appendChild(card);
  });

  updateParticipantCount(dataArray.length);
}

// Function to show attendance log in the modal
function showAttendanceLog(fullName, attendanceLog) {
  // Handle both string and array inputs
  let logArray = attendanceLog;
  if (typeof attendanceLog === "string") {
    try {
      logArray = JSON.parse(attendanceLog);
    } catch (e) {
      logArray = [];
    }
  }

  const attendanceLogList = document.getElementById("attendanceLogList");
  const modalTitle = document.querySelector("#attendanceModal h2");

  if (modalTitle) {
    modalTitle.textContent = `Attendance Log - ${fullName}`;
  }

  if (attendanceLogList) {
    attendanceLogList.innerHTML = "";

    if (logArray && logArray.length > 0) {
      logArray.forEach((attendanceDate, index) => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="log-date">Day ${
          index + 1
        }:</span> ${attendanceDate}`;
        attendanceLogList.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "No attendance records found.";
      li.className = "no-records";
      attendanceLogList.appendChild(li);
    }
  }

  const attendanceModal = document.getElementById("attendanceModal");
  if (attendanceModal) {
    attendanceModal.style.display = "block";
  }
}

// Function to close the attendance log modal
function closeAttendanceModal() {
  const attendanceModal = document.getElementById("attendanceModal");
  if (attendanceModal) {
    attendanceModal.style.display = "none";
  }
}

// Enhanced real-time search
if (searchInput) {
  searchInput.addEventListener("input", function () {
    const query = this.value.trim().toLowerCase();

    if (!query) {
      renderCards(allData);
      return;
    }

    const results = allData.filter((participant) => {
      const fullName = (participant.fullname || "").toLowerCase();
      const userId = (participant.userId || "").toString().toLowerCase();
      const email = (participant.email || "").toLowerCase();
      const phone = (participant.phone || "").toLowerCase();
      const institution = (participant.institution || "").toLowerCase();
      const course = (participant.course || "").toLowerCase();
      const studentStatus = (participant.studentStatus || "").toLowerCase();

      return (
        fullName.includes(query) ||
        userId.includes(query) ||
        email.includes(query) ||
        phone.includes(query) ||
        institution.includes(query) ||
        course.includes(query) ||
        studentStatus.includes(query)
      );
    });

    renderCards(results, query);
  });
}

// Enhanced filter options
function populateFilterOptions(dataArray) {
  if (!filterType) return;

  const categories = [
    "fullname",
    "isStudent",
    "institution",
    "course",
    "age",
    "attendance",
    "studentStatus",
  ];
  filterType.innerHTML = `<option value="">Select Category</option>`;

  categories.forEach((type) => {
    const option = document.createElement("option");
    option.value = type;

    // Better display names
    const displayNames = {
      fullname: "Full Name",
      isStudent: "Student Status",
      institution: "Institution",
      course: "Course",
      age: "Age Group",
      attendance: "Attendance",
      studentStatus: "Student Type",
    };

    option.textContent =
      displayNames[type] || type.charAt(0).toUpperCase() + type.slice(1);
    filterType.appendChild(option);
  });
}

// Enhanced filter type selection
if (filterType) {
  filterType.addEventListener("change", function () {
    const selected = this.value;

    if (!selected) {
      if (filterValue) filterValue.disabled = true;
      renderCards(allData);
      return;
    }

    let uniqueValues = [];

    if (selected === "age") {
      uniqueValues = [
        "Children (0-9)",
        "Teen (10-19)",
        "Young Adult (20-29)",
        "Adult (30-49)",
        "Senior (50-69)",
        "Elderly (70+)",
      ];
    } else if (selected === "isStudent") {
      uniqueValues = ["yes", "no"];
    } else if (selected === "attendance") {
      uniqueValues = [true, false];
    } else if (selected === "studentStatus") {
      uniqueValues = ["active", "not_student"];
    } else {
      uniqueValues = [
        ...new Set(allData.map((item) => item[selected]).filter((val) => val)),
      ];
    }

    if (filterValue) {
      filterValue.innerHTML = `<option value="">Select Value</option>`;
      uniqueValues.forEach((val) => {
        const option = document.createElement("option");
        option.value = val;

        // Better display text
        if (selected === "attendance") {
          option.textContent = val ? "Present" : "Absent";
        } else if (selected === "isStudent") {
          option.textContent = val === "yes" ? "Student" : "Non-Student";
        } else if (selected === "studentStatus") {
          option.textContent =
            val === "active" ? "Active Student" : "Non-Student";
        } else {
          option.textContent = val;
        }

        filterValue.appendChild(option);
      });

      filterValue.disabled = false;
    }
  });
}

// Enhanced value-based filtering
if (filterValue) {
  filterValue.addEventListener("change", function () {
    const type = filterType ? filterType.value : "";
    const value = this.value;

    if (!type || !value) {
      renderCards(allData);
    } else {
      const filtered = allData.filter((item) => {
        if (type === "age") {
          const age = Number.parseInt(item.age, 10);
          if (value === "Children (0-9)") return age >= 0 && age <= 9;
          if (value === "Teen (10-19)") return age >= 10 && age <= 19;
          if (value === "Young Adult (20-29)") return age >= 20 && age <= 29;
          if (value === "Adult (30-49)") return age >= 30 && age <= 49;
          if (value === "Senior (50-69)") return age >= 50 && age <= 69;
          if (value === "Elderly (70+)") return age >= 70;
          return false;
        } else if (type === "attendance") {
          return item[type] === (value === "true");
        }
        return String(item[type]) === value;
      });

      renderCards(filtered);
    }
  });
}

function resetFilter() {
  if (filterType) filterType.value = "";
  if (filterValue) {
    filterValue.innerHTML = `<option value="">Select a type first</option>`;
    filterValue.disabled = true;
  }
  if (searchInput) searchInput.value = "";
  renderCards(allData);
}

// Enhanced update modal with new fields
function updateParticipant(id) {
  firebase
    .database()
    .ref("volunteer_registrations/" + id)
    .once("value")
    .then((snapshot) => {
      const data = snapshot.val();
      const updateId = document.getElementById("updateId");
      const updateFullName = document.getElementById("updateFullName");
      const updateEmail = document.getElementById("updateEmail");
      const updatePhone = document.getElementById("updatePhone");
      const updateAge = document.getElementById("updateAge");
      const updateInstitution = document.getElementById("updateInstitution");
      const updateCourse = document.getElementById("updateCourse");
      const updatePassingYear = document.getElementById("updatePassingYear");
      const updateIsStudent = document.getElementById("updateIsStudent");
      const updateModal = document.getElementById("updateModal");

      if (updateId) updateId.value = id;
      if (updateFullName) updateFullName.value = data.fullname || "";
      if (updateEmail) updateEmail.value = data.email || "";
      if (updatePhone) updatePhone.value = data.phone || "";
      if (updateAge) updateAge.value = data.age || "";
      if (updateInstitution) updateInstitution.value = data.institution || "";
      if (updateCourse) updateCourse.value = data.course || "";
      if (updatePassingYear) updatePassingYear.value = data.passingYear || "";
      if (updateIsStudent) updateIsStudent.value = data.isStudent || "";
      if (updateModal) updateModal.style.display = "block";
    });
}

function closeModal() {
  const updateModal = document.getElementById("updateModal");
  if (updateModal) {
    updateModal.style.display = "none";
  }
}

// Enhanced submit updated participant info - with null check
const updateForm = document.getElementById("updateForm");
if (updateForm) {
  updateForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const updateId = document.getElementById("updateId");
    const updateIsStudent = document.getElementById("updateIsStudent");
    const updateFullName = document.getElementById("updateFullName");
    const updateEmail = document.getElementById("updateEmail");
    const updatePhone = document.getElementById("updatePhone");
    const updateAge = document.getElementById("updateAge");
    const updateInstitution = document.getElementById("updateInstitution");
    const updateCourse = document.getElementById("updateCourse");
    const updatePassingYear = document.getElementById("updatePassingYear");

    if (
      !updateId ||
      !updateIsStudent ||
      !updateFullName ||
      !updateEmail ||
      !updatePhone ||
      !updateAge
    ) {
      console.error("Required form elements not found");
      return;
    }

    const id = updateId.value;
    const isStudent = updateIsStudent.value;

    const updatedData = {
      fullname: updateFullName.value,
      email: updateEmail.value,
      phone: updatePhone.value,
      age: Number.parseInt(updateAge.value),
      isStudent: isStudent,
      studentStatus: isStudent === "yes" ? "active" : "not_student",
    };

    // Add student-specific fields if applicable
    if (isStudent === "yes") {
      if (updateInstitution) updatedData.institution = updateInstitution.value;
      if (updateCourse) updatedData.course = updateCourse.value;
      if (updatePassingYear)
        updatedData.passingYear = Number.parseInt(updatePassingYear.value);
    }

    firebase
      .database()
      .ref("volunteer_registrations/" + id)
      .update(updatedData)
      .then(() => {
        closeModal();
        alert("Participant info updated successfully!");
      })
      .catch((error) => {
        console.error("Error updating participant:", error);
        alert("Error updating participant. Please try again.");
      });
  });
}

function deleteParticipant(id) {
  if (confirm("Are you sure you want to delete this registration?")) {
    firebase
      .database()
      .ref("volunteer_registrations/" + id)
      .remove()
      .then(() => {
        alert("Participant deleted successfully!");
      })
      .catch((error) => {
        console.error("Error deleting participant:", error);
        alert("Error deleting participant. Please try again.");
      });
  }
}

// Enhanced attendance toggle with logging
function toggleAttendance(id) {
  const participantRef = firebase
    .database()
    .ref("volunteer_registrations/" + id);
  participantRef.once("value").then((snapshot) => {
    const data = snapshot.val();
    const newAttendance = !data.attendance;
    const currentDate = new Date().toLocaleDateString("en-IN");

    const updateData = { attendance: newAttendance };

    if (newAttendance) {
      // Mark as present - add to attendance log
      const attendanceLog = data.attendanceLog || [];
      if (!attendanceLog.includes(currentDate)) {
        attendanceLog.push(currentDate);
        updateData.attendanceLog = attendanceLog;
        updateData.daysAttended = attendanceLog.length;
      }
    } else {
      // Mark as absent - remove from today's log if present
      const attendanceLog = data.attendanceLog || [];
      const updatedLog = attendanceLog.filter((date) => date !== currentDate);
      updateData.attendanceLog = updatedLog;
      updateData.daysAttended = updatedLog.length;
    }

    participantRef
      .update(updateData)
      .then(() => {
        alert(
          `Attendance status updated! ${
            newAttendance ? "Marked present" : "Marked absent"
          } for ${currentDate}`
        );
      })
      .catch((error) => {
        console.error("Error updating attendance:", error);
        alert("Error updating attendance. Please try again.");
      });
  });
}

// Export data functionality
function exportData() {
  // Check if data exists
  if (!allData || allData.length === 0) {
    alert("No data available to export. Please wait for data to load.");
    return;
  }

  // Helper function to format date for Excel
  function formatDateForExcel(timestamp, registrationDate) {
    if (registrationDate) {
      return registrationDate;
    } else if (timestamp) {
      try {
        const date = new Date(timestamp);
        const dayName = date.toLocaleDateString("en-IN", { weekday: "short" });
        const day = date.getDate().toString().padStart(2, "0");
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const year = date.getFullYear();
        return `${dayName} ${day}/${month}/${year}`;
      } catch (e) {
        return "Invalid Date";
      }
    }
    return "N/A";
  }

  // Helper function to format time for Excel
  function formatTimeForExcel(timestamp, registrationTime) {
    if (registrationTime) {
      return registrationTime;
    } else if (timestamp) {
      try {
        const date = new Date(timestamp);
        const hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, "0");
        const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
        const ampm = hours >= 12 ? "pm" : "am";
        const formattedHour = hour12.toString().padStart(2, "0");
        return `${formattedHour}:${minutes} ${ampm}`;
      } catch (e) {
        return "Invalid Time";
      }
    }
    return "N/A";
  }

  const csvContent =
    "data:text/csv;charset=utf-8," +
    "Name,User ID,Email,Phone,Age,Student Status,Institution,Course,Passing Year,Attendance,Days Attended,Registration Date,Registration Time\n" +
    allData
      .map((row) => {
        const formattedDate = formatDateForExcel(
          row.timestamp,
          row.registrationDate
        );
        const formattedTime = formatTimeForExcel(
          row.timestamp,
          row.registrationTime
        );

        return [
          row.fullname || "",
          row.userId || "",
          row.email || "",
          row.phone || "",
          row.age || "",
          row.isStudent === "yes" ? "Student" : "Non-Student",
          row.institution || "",
          row.course || "",
          row.passingYear || "",
          row.attendance ? "Present" : "Absent",
          row.daysAttended || 0,
          formattedDate,
          formattedTime,
        ]
          .map((field) => `"${field}"`)
          .join(",");
      })
      .join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute(
    "download",
    `volunteer_registrations_${new Date().toISOString().split("T")[0]}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  alert(`Data exported successfully! ${allData.length} participants exported.`);
}
