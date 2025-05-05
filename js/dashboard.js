// Ensure the admin is logged in
if (sessionStorage.getItem("isAdmin") !== "true") {
  window.location.href = "login.html";
}

document.getElementById("logoutBtn").onclick = function () {
  sessionStorage.removeItem("isAdmin");
  window.location.href = "login.html";
};

const filterType = document.getElementById("filterType");
const filterValue = document.getElementById("filterValue");
const container = document.getElementById("participantsCards");
const searchInput = document.getElementById("searchInput");
const totalCountElement = document.getElementById("totalCount");

let allData = [];

// Load data from Firebase
database.ref("enrollments").on("value", (snapshot) => {
  allData = [];
  container.innerHTML = "";

  snapshot.forEach((childSnapshot) => {
    let data = childSnapshot.val();
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

// Render participant cards
function renderCards(dataArray, highlight = "") {
  container.innerHTML = "";

  const regex = highlight ? new RegExp(`(${highlight})`, "gi") : null;

  dataArray.forEach((data) => {
    const fullName = data.fullName || "";
    const userId = data.userId || "";
    const email = data.email || "";
    const phone = data.phone || "";
    const institution = data.institution || "";

    const highlightedFullName = highlight
      ? fullName.replace(regex, "<mark>$1</mark>")
      : fullName;
    const highlightedUserId = highlight
      ? userId.replace(regex, "<mark>$1</mark>")
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

    const card = document.createElement("div");
    card.className = "participant-card";
    card.innerHTML = `
            <h3>${highlightedFullName}</h3>
            <p><strong>User ID:</strong> ${highlightedUserId || "N/A"}</p>
            <p><strong>Email:</strong> ${highlightedEmail}</p>
            <p><strong>Phone:</strong> ${highlightedPhone}</p>
            <p><strong>Age:</strong> ${data.age}</p>
            <p><strong>Institution:</strong> ${highlightedInstitution}</p>
            <p><strong>Attendance:</strong> 
                <span class="attendance-status ${
                  data.attendance ? "" : "absent"
                }">
                    ${data.attendance ? "Present" : "Absent"}
                </span>
            </p>
            <div class="card-actions">
                <button onclick="updateParticipant('${
                  data.id
                }')">Update</button>
                <button onclick="deleteParticipant('${
                  data.id
                }')">Delete</button>
                <button onclick="toggleAttendance('${
                  data.id
                }')">Toggle Attendance</button>
            </div>
        `;
    container.appendChild(card);
  });

  updateParticipantCount(dataArray.length);
}

// Real-time search
searchInput.addEventListener("input", function () {
  const query = this.value.trim().toLowerCase();

  if (!query) {
    renderCards(allData);
    return;
  }

  const results = allData.filter((participant) => {
    const fullName = participant.fullName?.toLowerCase() || "";
    const userId = participant.userID?.toLowerCase() || "";
    const email = participant.email?.toLowerCase() || "";
    const phone = participant.phone?.toLowerCase() || "";
    const institution = participant.institution?.toLowerCase() || "";

    return (
      fullName.includes(query) ||
      userId.includes(query) ||
      email.includes(query) ||
      phone.includes(query) ||
      institution.includes(query)
    );
  });

  renderCards(results, query);
});

// Populate filter options
function populateFilterOptions(dataArray) {
  const categories = ["fullName", "institution", "age", "attendance"];
  filterType.innerHTML = `<option value="">Select Category</option>`;
  categories.forEach((type) => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    filterType.appendChild(option);
  });
}

// Handle filter type selection
filterType.addEventListener("change", function () {
  const selected = this.value;

  if (!selected) {
    filterValue.disabled = true;
    renderCards(allData);
    return;
  }

  let uniqueValues = [...new Set(allData.map((item) => item[selected]))];

  if (selected === "age") {
    uniqueValues = [
      "Children (0-9)",
      "Teen (10-19)",
      "Young Adult (20-29)",
      "Adult (30-49)",
      "Senior (50-69)",
      "Elderly (70+)",
    ];
  }

  filterValue.innerHTML = `<option value="">Select Value</option>`;
  uniqueValues.forEach((val) => {
    const option = document.createElement("option");
    option.value = val;
    option.textContent =
      selected === "attendance" ? (val ? "Present" : "Absent") : val;
    filterValue.appendChild(option);
  });

  filterValue.disabled = false;
});

// Apply value-based filtering
filterValue.addEventListener("change", function () {
  const type = filterType.value;
  const value = this.value;

  if (!type || !value) {
    renderCards(allData);
  } else {
    const filtered = allData.filter((item) => {
      if (type === "age") {
        const age = parseInt(item.age, 10);
        if (value === "Children (0-9)") return age >= 0 && age <= 9;
        if (value === "Teen (10-19)") return age >= 10 && age <= 19;
        if (value === "Young Adult (20-29)") return age >= 20 && age <= 29;
        if (value === "Adult (30-49)") return age >= 30 && age <= 49;
        if (value === "Senior (50-69)") return age >= 50 && age <= 69;
        if (value === "Elderly (70+)") return age >= 70;
        return false;
      }
      return String(item[type]) === value;
    });

    renderCards(filtered);
  }
});

function resetFilter() {
  filterType.value = "";
  filterValue.innerHTML = `<option value="">Select a type first</option>`;
  filterValue.disabled = true;
  renderCards(allData);
}

// Update modal with existing data
function updateParticipant(id) {
  database
    .ref("enrollments/" + id)
    .once("value")
    .then((snapshot) => {
      const data = snapshot.val();
      document.getElementById("updateId").value = id;
      document.getElementById("updateFullName").value = data.fullName;
      document.getElementById("updateEmail").value = data.email;
      document.getElementById("updatePhone").value = data.phone;
      document.getElementById("updateAge").value = data.age;
      document.getElementById("updateInstitution").value = data.institution;
      document.getElementById("updateModal").style.display = "block";
    });
}

function closeModal() {
  document.getElementById("updateModal").style.display = "none";
}

// Submit updated participant info
document.getElementById("updateForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const id = document.getElementById("updateId").value;
  const updatedData = {
    fullName: document.getElementById("updateFullName").value,
    email: document.getElementById("updateEmail").value,
    phone: document.getElementById("updatePhone").value,
    age: document.getElementById("updateAge").value,
    institution: document.getElementById("updateInstitution").value,
    attendance: false,
  };

  database
    .ref("enrollments/" + id)
    .update(updatedData)
    .then(() => {
      closeModal();
      alert("Participant info updated successfully!");
    });
});

function deleteParticipant(id) {
  if (confirm("Are you sure you want to delete this registration?")) {
    database.ref("enrollments/" + id).remove();
  }
}

function toggleAttendance(id) {
  const participantRef = database.ref("enrollments/" + id);
  participantRef.once("value").then((snapshot) => {
    const data = snapshot.val();
    const newAttendance = !data.attendance;
    participantRef
      .update({ attendance: newAttendance })
      .then(() => {
        alert("Attendance status updated!");
      })
      .catch((error) => {
        console.error("Error updating attendance:", error);
      });
  });
}
