const eventPrices = {
  '5k': 500,
  '10k': 700,
  '20k': 1000,
  '40k': 1200
};

const form = document.getElementById('form');
const message = document.getElementById('message');
const costDisplay = document.getElementById('cost');

// Update cost when event is selected
document.getElementById('category').addEventListener('change', function () {
  const selected = this.value;
  const price = eventPrices[selected] || 0;
  costDisplay.textContent = price;
});

// Handle form submission
form.addEventListener('submit', async function (e) {
  e.preventDefault();

  const fullName = document.getElementById('fullName').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const age = parseInt(document.getElementById('age').value);
  const bloodGroup = document.getElementById('bloodGroup').value;
  const category = document.getElementById('category').value;
  const totalCost = eventPrices[category] || 0;

  if (!fullName || !email || !phone || isNaN(age) || !bloodGroup || !category) {
    message.textContent = '❌ Please fill all fields correctly.';
    message.style.color = 'red';
    return;
  }

  try {
    const newEntryRef = firebase.database().ref('enrollments').push();
    const userId = newEntryRef.key;

    const userData = {
      fullName,
      email,
      phone,
      age,
      bloodGroup,
      category,
      totalCost,
      attendance: false,
      timestamp: new Date().toISOString()
    };

    await newEntryRef.set(userData);

    // Generate the QR code with userId as content
    const qr = new QRious({
      value: userId,
      size: 150, // Clean small size for mobile-friendly
      background: '#ffffff',
      foreground: '#000000',
      level: 'H'
    });

    // Auto-download the QR code
    const link = document.createElement('a');
    link.href = qr.toDataURL();
    link.download = `${fullName.replace(/\s+/g, '_')}_QR.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    message.innerHTML = `✅ Thanks, ${fullName}! You've enrolled for the ${category.toUpperCase()} event.<br>Your QR Code has been downloaded.`;
    message.style.color = 'green';

    form.reset();
    costDisplay.textContent = '0';

  } catch (error) {
    console.error(error);
    message.textContent = '❌ Something went wrong. Please try again.';
    message.style.color = 'red';
  }
});
