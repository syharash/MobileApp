// == Mileage Tracker – Clean & Consolidated ==
let tripPoints = [];
let tracking = false;
let tripStatus = 'idle';
let trackingInterval = null;
let tripStart = null;
let tripEnd = null;
let tripLog = [];
let pauseStartTime = null;
let totalPauseDuration = 0;
let map, directionsService, directionsRenderer;
let gpsPoller = null;

const fallbackInterval = 60000;
const motionThreshold = 0.1;
const apiKey = "AIzaSyAInvy6GdRdnuYVJGlde1gX0VINpU5AsJI";

// ---- Login and Logout Handler Function ---- //
function handleLogin(response) {
  const user = jwt_decode(response.credential);
  localStorage.setItem("userEmail", user.email);
  localStorage.setItem("userName", user.name);
  showToast(`👋 Welcome, ${user.name}`);
  document.getElementById("userBadge").textContent = `Logged in as: ${user.name} (${user.email})`;
  document.getElementById("login-screen").style.display = "none";
  document.querySelector(".container").style.display = "block";
  
  // Optionally show app UI
  document.querySelector(".container").style.display = "block";

  // Load user-specific trip history
  initializeApp();
}

function logoutUser() {
  localStorage.removeItem("userEmail");
  localStorage.removeItem("userName");

  // Optionally clear tripLog from memory
  tripLog = [];
  document.getElementById("trip-log").innerHTML = "";
  updateSummary();

  // Hide app UI
  document.querySelector(".container").style.display = "none";

  showToast("👋 Logged out");
  setTimeout(() => location.reload(), 1000);
  document.getElementById("userBadge").textContent = "";
}


// --- Helper ---
function safeUpdate(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  } else {
    console.warn(`⚠️ Element with ID "${id}" not found`);
  }
}

// --- INIT ---
function initMapServices() {
  if (map) return;
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 38.5816, lng: -121.4944 },
    zoom: 12
  });
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map,
    panel: document.getElementById("directions-panel")
  });
}

function loadTripHistory() {
  const saved = localStorage.getItem("tripHistory");
  if (saved) {
    tripLog = JSON.parse(saved);
    tripLog.forEach(entry => {
      const li = document.createElement("li");
      li.textContent = `${entry.date} | ${entry.purpose} | ${entry.miles} mi | ${entry.reimbursement}`;
      document.getElementById("trip-log").appendChild(li);
    });
    updateSummary();
  }
}

// --- Route Calculation ---
async function getRoute(start, end) {
  if (!start || !end) {
    console.warn("Missing start or end location:", { start, end });
    alert("Route calculation failed: Missing location data.");
    return;
  }
  if (
    typeof start.latitude !== "number" || typeof start.longitude !== "number" ||
    typeof end.latitude !== "number" || typeof end.longitude !== "number"
  ) {
    console.warn("Invalid coordinates:", { start, end });
    alert("Route calculation failed: Invalid coordinates.");
    return;
  }

  try {
    const result = await new Promise((resolve, reject) => {
      directionsService.route(
        {
          origin: new google.maps.LatLng(start.latitude, start.longitude),
          destination: new google.maps.LatLng(end.latitude, end.longitude),
          travelMode: google.maps.TravelMode.DRIVING
        },
        (response, status) => {
          status === google.maps.DirectionsStatus.OK
            ? resolve(response)
            : reject(`Route request failed: ${status}`);
        }
      );
    });
    return result;
  } catch (error) {
    console.error("Route calculation error:", error);
    alert("Unable to calculate route. Please try again later.");
  }
}

// --- Tracking Lifecycle ---
function startTracking() {
  // --- Fallback distance calculation or route visualization
  tripPoints = [];
  trackingInterval = setInterval(() => {
  navigator.geolocation.getCurrentPosition(pos => {
    tripPoints.push({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      timestamp: Date.now()
    });
  });
}, 10000); // every 10 seconds

  // --- Distance Tracking 
  tripStatus = 'tracking';
  initMapServices();
  navigator.geolocation.getCurrentPosition(pos => {
    tripStart = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      timestamp: Date.now()
    };
    tracking = true;
    totalPauseDuration = 0;
    updateStatus("Tracking");
    showToast("🚀 Trip started!");
    updateControls();
  }, () => showToast("⚠️ Unable to access GPS", "error"));
}


function pauseTracking() {
  // ✅ keep tracking = true
  tripStatus = 'paused';
  clearInterval(trackingInterval);
  trackingInterval = null;
  pauseStartTime = Date.now();
  updateStatus("Paused");
  showToast("⏸️ Trip paused");
  updateControls();
}
function resumeTracking() {
// ✅ keep tracking = true and resume trip
  tripStatus = 'resumed';
  trackingInterval = setInterval(() => {
    // poll location again
  }, 10000); // or your preferred interval
  if (pauseStartTime) {
    totalPauseDuration += Date.now() - pauseStartTime;
    pauseStartTime = null;
  }
  updateStatus("Tracking");
  showToast("▶️ Trip resumed");
  updateControls();
}
function endTracking() {
  tripStatus = 'idle';
  navigator.geolocation.getCurrentPosition(async pos => {
    tripEnd = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      timestamp: Date.now()
    };

    if (!tripStart || !tripEnd) {
      alert("Trip cannot be ended: Missing location data.");
      console.warn("Missing tripStart or tripEnd");
      return;
    }

    clearInterval(trackingInterval);
    trackingInterval = null;
    tracking = false;

    try {
      const result = await getRoute(tripStart, tripEnd);
      if (result) {
        const leg = result.routes[0].legs[0];
        directionsRenderer.setDirections(result);
        localStorage.setItem("lastRoute", JSON.stringify(result));

        const distanceMi = (leg.distance.value / 1609.34).toFixed(2);
        const durationMin = Math.round(leg.duration.value / 60);
        const pausedMin = Math.round(totalPauseDuration / 60000);
        const startAddress = leg.start_address;
        const endAddress = leg.end_address;
        const purpose = document.getElementById("trip-purpose").value || "–";
        const notes = document.getElementById("trip-notes").value || "–";

 // 🧾 Robust UI updates
        safeUpdate("summary-purpose", purpose);
        safeUpdate("summary-notes", notes);
        safeUpdate("summary-start", startAddress);
        safeUpdate("summary-end", endAddress);
        safeUpdate("summary-distance", `${distanceMi} mi`);
        safeUpdate("summary-duration", `${durationMin} min`);
        safeUpdate("pause-summary", `${pausedMin} min`);
        safeUpdate("lastDistance", `${distanceMi} mi`);
        safeUpdate("lastDuration", `${durationMin} min`);

        const rate = parseFloat(document.getElementById("rate").value || "0");
        const reimbursement = (distanceMi * rate).toFixed(2);
        safeUpdate("summary-amount", `$${reimbursement}`);
        safeUpdate("lastAmount", `$${reimbursement}`);
        
        
        renderSteps(leg.steps);
        logTrip(purpose, notes, distanceMi, durationMin, pausedMin);
        showToast(`✅ Trip complete: ${distanceMi} mi`);
      } else {
        showToast("⚠️ No route returned", "error");
      }
    } catch (err) {
      console.error("endTracking() error:", err);
      const cached = localStorage.getItem("lastRoute");
      if (cached) {
        const result = JSON.parse(cached);
        const leg = result.routes[0].legs[0];
        directionsRenderer.setDirections(result);
        renderSteps(leg.steps);
        showToast("⚠️ Offline: showing last saved route");
      } else {
        showToast("❌ " + err.message, "error");
      }
    }

    updateStatus("Trip Complete");
    updateControls();
    tripStart = tripEnd = null;
  }, () => {
    showToast("⚠️ GPS access failed", "error");
    updateStatus("Trip Complete");
    downloadCSV();
  });
}

// --- Helpers ---
function renderSteps(steps) {
  const panel = document.getElementById("directions-panel");
  panel.innerHTML = "";

  steps.forEach(step => {
    const li = document.createElement("li");

    const instruction = stripHTML(step.instructions || "Continue");
    const distance = step.distance?.text || "";
    const duration = step.duration?.text || "";

    li.textContent = `${instruction} (${distance}, ${duration})`;

    const icon = getIconForManeuver(step.maneuver || "default");
    li.prepend(icon);

    panel.appendChild(li);
  });
}

function getIconForManeuver(type) {
  const iconMap = {
    "turn-left": "⬅️",
    "turn-right": "➡️",
    "merge": "🔀",
    "ramp-left": "↖️",
    "ramp-right": "↘️",
    "roundabout-left": "⏪",
    "roundabout-right": "⏩",
    "straight": "⬆️",
    "uturn-left": "↩️",
    "uturn-right": "↪️",
    "fork-left": "🡸",
    "fork-right": "🡺",
    "default": "➡️"
  };

  return makeIcon(iconMap[type] || iconMap["default"]);
}

function makeIcon(symbol) {
  const span = document.createElement("span");
  span.textContent = symbol + " ";
  span.style.marginRight = "6px";
  return span;
}

function stripHTML(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || "";
}

function logTrip(purpose, notes, distance, duration, paused) {
  const rate = parseFloat(document.getElementById("rate").value || "0");
  const reimbursement = (distance * rate).toFixed(2);
  const entry = {
    date: new Date().toLocaleString(),
    purpose,
    notes,
    miles: distance,
    duration: `${duration} min`,
    paused: `${paused} min`,
    reimbursement: `$${reimbursement}`
  };
  tripLog.push(entry);
  saveTripHistory();

  const li = document.createElement("li");
  li.textContent = `${entry.date} | ${entry.purpose} | ${entry.miles} mi | ${entry.reimbursement}`;
  document.getElementById("trip-log").appendChild(li);
  updateSummary();
}

function saveTripHistory() {
  const user = localStorage.getItem("userEmail") || "default";
  localStorage.setItem(`tripHistory_${user}`, JSON.stringify(tripLog));
}

function loadTripHistory() {
  const user = localStorage.getItem("userEmail") || "default";
  const saved = localStorage.getItem(`tripHistory_${user}`);
  if (saved) {
    tripLog = JSON.parse(saved);
    tripLog.forEach(entry => {
      const li = document.createElement("li");
      li.textContent = `${entry.date} | ${entry.purpose} | ${entry.miles} mi | ${entry.reimbursement}`;
      document.getElementById("trip-log").appendChild(li);
    });
    updateSummary();
  }
}

function updateSummary() {
  let today = 0, week = 0;
  const todayDate = new Date().toDateString();
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const rate = parseFloat(document.getElementById("rate").value || "0");

  tripLog.forEach(t => {
    const d = new Date(t.date);
    const m = parseFloat(t.miles);
    if (d.toDateString() === todayDate) today += m;
    if (d.getTime() >= weekAgo) week += m;
  });

  const todayEl = document.getElementById("today-summary");
  const weekEl = document.getElementById("week-summary");

  if (todayEl) {
    todayEl.textContent = `${today.toFixed(2)} mi | $${(today * rate).toFixed(2)}`;
    todayEl.classList.add("updated");
    setTimeout(() => todayEl.classList.remove("updated"), 400);
  }

  if (weekEl) {
    weekEl.textContent = `${week.toFixed(2)} mi | $${(week * rate).toFixed(2)}`;
    weekEl.classList.add("updated");
    setTimeout(() => weekEl.classList.remove("updated"), 400);
  }
}


function downloadCSV() {
  if (!tripLog.length) return showToast("📂 No trips to export");
  let csv = "Date,Purpose,Notes,Miles,Duration,Paused,Reimbursement\n";
  tripLog.forEach(t => {
    csv += `${t.date},${t.purpose},${t.notes},${t.miles},${t.duration},${t.paused},${t.reimbursement}\n`;
  });
  
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:\-T]/g, "_").split(".")[0];

  a.href = url;
  a.download = `mileage_log_${timestamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadFilteredCSV() {
  const startDate = document.getElementById("filter-start").value;
  const endDate = document.getElementById("filter-end").value;
  const purpose = document.getElementById("filter-purpose").value.toLowerCase();

  const filteredTrips = tripLog.filter(t => {
  const tripDate = new Date(t.date);
  const matchStart = !startDate || tripDate >= new Date(startDate);
  const matchEnd = !endDate || tripDate <= new Date(endDate);
  const matchPurpose = !purpose || t.purpose.toLowerCase().includes(purpose);
  return matchStart && matchEnd && matchPurpose;
  });

  if (!filteredTrips.length) return showToast("📂 No filtered trips to export");

  let csv = "Date,Purpose,Notes,Miles,Duration,Paused,Reimbursement\n";
  filteredTrips.forEach(t => {
    csv += `${t.date},${t.purpose},${t.notes},${t.miles},${t.duration},${t.paused},${t.reimbursement}\n`;
  });

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:\-T]/g, "_").split(".")[0];

  a.href = url;
  a.download = `filtered_mileage_${timestamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function updateFilteredButtonState() {
  const btn = document.getElementById("downloadFilteredBtn");
  const tripLog = getTripLog();

  if (!Array.isArray(tripLog)) {
    console.warn("Trip log is not an array:", tripLog);
    btn.disabled = true;
    return;
  }

  const startDate = document.getElementById("filter-start").value;
  const endDate = document.getElementById("filter-end").value;
  const purpose = document.getElementById("filter-purpose").value.toLowerCase();

  const filteredTrips = tripLog.filter(t => {
    const tripDate = new Date(t.date);
    const matchStart = !startDate || tripDate >= new Date(startDate);
    const matchEnd = !endDate || tripDate <= new Date(endDate);
    const matchPurpose = !purpose || t.purpose.toLowerCase().includes(purpose);
    return matchStart && matchEnd && matchPurpose;
  });

  btn.disabled = filteredTrips.length === 0;
}


function getTripLog() {
  try {
    const raw = localStorage.getItem("tripLog");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Failed to parse tripLog:", e);
    return [];
  }
}

  btn.disabled = filteredTrips.length === 0;
}

function clearHistory() {
  tripLog = [];
  document.getElementById("trip-log").innerHTML = "";
  updateSummary();
  showToast("🧹 Trip history cleared");
}

function restoreLastTrip() {
  const cached = localStorage.getItem("lastRoute");
  if (!cached) {
    showToast("🕵️ No saved trip to restore");
    return;
  }

  const result = JSON.parse(cached);
  const leg = result.routes[0].legs[0];
  
  document.getElementById("summary-start").textContent = leg.start_address;
  document.getElementById("summary-end").textContent = leg.end_address;
  document.getElementById("summary-distance").textContent = `${(leg.distance.value / 1609.34).toFixed(2)} mi`;
  document.getElementById("summary-duration").textContent = `${Math.round(leg.duration.value / 60)} min`;

directionsRenderer.setDirections(result);

const panel = document.getElementById("directions-panel");
panel.innerHTML = "";

result.routes[0].legs.forEach((leg, index) => {
  const header = document.createElement("h4");
  header.textContent = `Leg ${index + 1}: ${leg.start_address} → ${leg.end_address}`;
  panel.appendChild(header);

  renderSteps(leg.steps); // This will render each step with icons, distance, and duration
});
  showToast("🔄 Last trip restored");
}
function toggleHelp() {
  const h = document.getElementById("help-screen");
  h.style.display = h.style.display === "none" ? "block" : "none";
}

function showToast(msg, type = "default") {
  const t = document.getElementById("toast");
  if (!t) {
    console.warn("🚨 Toast element not found.");
    return;
  }
  t.textContent = msg;
  t.className = "show";
  t.style.backgroundColor = type === "error" ? "#B00020" : "#222";
  setTimeout(() => t.className = "", 3000);
}

function updateStatus(state) {
  const el = document.getElementById("tracking-status");
  if (el) el.textContent = state;
  document.body.classList.toggle("paused", state === "Paused");
  document.body.classList.toggle("ended", state === "Ended" || state === "Trip Complete");
}

function startMotionMonitor() {
  gpsPoller = setInterval(() => {
    // Optional fallback tracking logic could go here
  }, fallbackInterval);
}


function updateControls() {
  const startTrackingBtn = document.getElementById("startTrackingBtn");
  const pauseTrackingBtn = document.getElementById("pauseTrackingBtn");
  const resumeTrackingBtn = document.getElementById("resumeTrackingBtn");
  const endTrackingBtn = document.getElementById("endTrackingBtn");

  if (tripStatus === 'idle') {
  // Trip is idle or has ended
  startTrackingBtn.disabled = false;
  pauseTrackingBtn.disabled = true;
  resumeTrackingBtn.disabled = true;
  endTrackingBtn.disabled = true;
} else if (tripStatus === 'tracking') {
  // Actively tracking
  startTrackingBtn.disabled = true;
  pauseTrackingBtn.disabled = false;
  resumeTrackingBtn.disabled = true;
  endTrackingBtn.disabled = false;
} else if (tripStatus === 'paused') {
    //Trip has been paused
    startTrackingBtn.disabled = true;
    pauseTrackingBtn.disabled = true;
    resumeTrackingBtn.disabled = false;
    endTrackingBtn.disabled = true;
} else if (tripStatus === 'resumed') {
    //Trip has resumed after a pause
    startTrackingBtn.disabled = true;
    pauseTrackingBtn.disabled = false;
    resumeTrackingBtn.disabled = true;
    endTrackingBtn.disabled = false;
  }
}


// --- On Load ---
window.onload = initializeApp;

function initializeApp() {
  initMapServices();
  updateStatus("Idle");
  updateControls();
  loadTripHistory();
  updateFilteredButtonState();

  const buttonHandlers = {
    startTrackingBtn: startTracking,
    pauseTrackingBtn: pauseTracking,
    resumeTrackingBtn: resumeTracking,
    endTrackingBtn: endTracking,
    downloadAllBtn: downloadCSV,
    clearHistoryBtn: clearHistory,
    toggleHelpBtn: toggleHelp
  };

  for (const [id, handler] of Object.entries(buttonHandlers)) {
    const el = document.getElementById(id);
    if (el) el.onclick = handler;
    else console.warn(`🔍 Missing button with ID: ${id}`);
  }

  document.getElementById("trip-purpose").value = "";
  document.getElementById("trip-notes").value = "";
  document.getElementById("restoreTrip").onclick = restoreLastTrip;
  document.getElementById("logoutBtn").onclick = logout;
  document.getElementById("downloadAllBtn").onclick = () => downloadAllBtn(false);
  document.getElementById("downloadFilteredBtn").onclick = downloadFilteredCSV;
  document.getElementById("filter-start").addEventListener("change", updateFilteredButtonState);
  document.getElementById("filter-end").addEventListener("change", updateFilteredButtonState);
  document.getElementById("filter-purpose").addEventListener("input", updateFilteredButtonState);



  if (directionsRenderer) {
    directionsRenderer.setDirections({ routes: [] });
    const panel = document.getElementById("directions-panel");
    if (panel) panel.innerHTML = "";
  }
}

