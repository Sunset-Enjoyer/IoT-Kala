// ====================================================================
// KALA.CLOCK — IOT CONTROLLER JAVASCRIPT
// Menggabungkan fungsi-fungsi dari index2.html:
// - Koneksi MQTT Real-Time (Paho MQTT via WebSockets SSL)
// - Cek Status & Baca/Simpan Database MySQL
// - Simulasi Layar Virtual LED P10 Real-Time
// - Sinkronisasi Jam Digital RTC/NTP
// ====================================================================

// --- 1. KONFIGURASI MQTT (Dari index2.html) ---
const mqtt_broker = "broker.emqx.io"; // Broker EMQX publik gratis & cepat
const mqtt_port = 8084; // Port WebSockets dengan SSL (Secure)
const mqtt_topic = "sekolah/iot/p10/data"; // Topik komunikasi data panel/jam
const mqtt_topic_status = "sekolah/iot/p10/status"; // Topik status alat online/offline
const client_id = "kala_clock_" + Math.random().toString(16).substr(2, 8);

// Inisialisasi MQTT Client Paho
let mqttClient = null;
try {
  mqttClient = new Paho.MQTT.Client(mqtt_broker, mqtt_port, client_id);
} catch (e) {
  console.warn("Paho MQTT library belum termuat:", e);
}

// Handler Jika Koneksi MQTT Terputus
if (mqttClient) {
  mqttClient.onConnectionLost = function (responseObject) {
    console.log("MQTT Connection Lost:", responseObject.errorMessage);
    updateStatusBadge("statusMQTT", "offline", "🌐 BROKER: OFFLINE");
    updateStatusBadge("statusAlat", "offline", "📟 ALAT P10: OFFLINE");
    updateSidebarStatus(false);

    // Coba hubungkan kembali otomatis setelah 3 detik
    setTimeout(connectMQTT, 3000);
  };

  // Handler Jika Menerima Pesan Masuk dari Broker
  mqttClient.onMessageArrived = function (message) {
    console.log(
      "Pesan MQTT diterima:",
      message.destinationName,
      message.payloadString,
    );

    if (message.destinationName === mqtt_topic_status) {
      if (message.payloadString === "online") {
        updateStatusBadge("statusAlat", "online", "📟 ALAT P10: ONLINE");
        updateSidebarStatus(true);
      } else if (message.payloadString === "offline") {
        updateStatusBadge("statusAlat", "offline", "📟 ALAT P10: OFFLINE");
      }
    }
  };
}

// Fungsi Menghubungkan ke Broker MQTT
function connectMQTT() {
  if (!mqttClient) return;

  // Update status menjadi menghubungkan
  const mqttEl = document.getElementById("statusMQTT");
  if (mqttEl) {
    mqttEl.innerHTML = "🌐 BROKER: MENGHUBUNGKAN...";
    mqttEl.className = "status-box offline";
  }

  mqttClient.connect({
    useSSL: true,
    timeout: 10,
    keepAliveInterval: 30,
    onSuccess: function () {
      console.log("Berhasil terhubung ke Broker MQTT:", mqtt_broker);
      updateStatusBadge("statusMQTT", "online", "🌐 BROKER: ONLINE");
      updateSidebarStatus(true);

      // Subscribe ke topik status alat
      mqttClient.subscribe(mqtt_topic_status, {
        onSuccess: function () {
          console.log("Berhasil subscribe ke topik status:", mqtt_topic_status);
        },
      });
    },
    onFailure: function (err) {
      console.error("Gagal terhubung ke MQTT:", err.errorMessage);
      updateStatusBadge("statusMQTT", "offline", "🌐 BROKER: GAGAL KONEK");
      updateSidebarStatus(false);
      setTimeout(connectMQTT, 5000);
    },
  });
}

// --- 2. CEK STATUS DATABASE MYSQL (Dari index2.html) ---
function cekDatabase() {
  fetch("api_status_db.php")
    .then((response) => response.json())
    .then((data) => {
      if (data.status === "online") {
        updateStatusBadge("statusDB", "online", "🗄️ DATABASE MYSQL: TERHUBUNG");
      } else {
        updateStatusBadge("statusDB", "offline", "🗄️ DATABASE MYSQL: TERPUTUS");
      }
    })
    .catch(() => {
      // Jika file api_status_db.php belum ada / offline di simulasi lokal
      const dbEl = document.getElementById("statusDB");
      if (dbEl) {
        dbEl.className = "status-box offline";
        dbEl.innerHTML = "🗄️ DATABASE MYSQL: LOKAL (SIAP DIGUNAKAN)";
      }
    });
}

// --- 3. AMBIL DATA TERAKHIR DARI DATABASE (Dari index2.html) ---
function loadSavedData() {
  fetch("api_baca.php")
    .then((response) => response.json())
    .then((data) => {
      if (data) {
        if (data.teks) document.getElementById("inputTeks").value = data.teks;
        if (data.brightness !== undefined)
          document.getElementById("inputBrightness").value = data.brightness;
        if (data.speed !== undefined)
          document.getElementById("inputSpeed").value = data.speed;
        if (data.mode !== undefined)
          document.getElementById("inputMode").value = data.mode;

        // Sinkronkan layar preview dengan nilai awal
        updateBrightnessFromSlider(data.brightness || 30);
        updateSpeedFromSlider(data.speed || 40);
        updateTickerPreview(data.teks || "");
        updateModePreview(data.mode || 1);
      }
    })
    .catch(() => {
      // Nilai default jika server backend PHP tidak aktif
      updateBrightnessFromSlider(30);
      updateSpeedFromSlider(40);
      updateTickerPreview(document.getElementById("inputTeks").value);
    });
}

// --- 4. FUNGSI KIRIM DATA (Dari index2.html) ---
function kirimData() {
  const teksVal = document.getElementById("inputTeks").value;
  const brightnessVal = parseInt(
    document.getElementById("inputBrightness").value,
  );
  const speedVal = parseInt(document.getElementById("inputSpeed").value);
  const modeVal = parseInt(document.getElementById("inputMode").value);

  // Buat objek Payload
  let payloadObj = {
    teks: teksVal,
    brightness: brightnessVal,
    speed: speedVal,
    mode: modeVal,
    timestamp: Date.now(),
  };

  const pesanEl = document.getElementById("pesan");

  // A. Dorong data via MQTT Real-Time
  let mqttSent = false;
  if (mqttClient && mqttClient.isConnected()) {
    let pesanJSON = JSON.stringify(payloadObj);
    let message = new Paho.MQTT.Message(pesanJSON);
    message.destinationName = mqtt_topic;
    message.retained = true; // Retain: simpan pesan terakhir di broker
    mqttClient.send(message);
    mqttSent = true;
  }

  // Tampilkan notifikasi status
  if (pesanEl) {
    if (mqttSent) {
      pesanEl.innerHTML =
        "✅ Berhasil dikirim ke Panel Kala.Clock secara Real-Time via MQTT!";
    } else {
      pesanEl.innerHTML =
        "⚠️ Pengaturan diterapkan pada Simulasi (MQTT sedang offline / mencoba hubungkan...)";
    }
  }

  // B. Simpan ke Database MySQL via AJAX Fetch
  let formData = new FormData();
  formData.append("teks", payloadObj.teks);
  formData.append("brightness", payloadObj.brightness);
  formData.append("speed", payloadObj.speed);
  formData.append("mode", payloadObj.mode);

  fetch("api_simpan.php", {
    method: "POST",
    body: formData,
  }).catch(() => {
    // Abaikan jika offline / API lokal belum dijalankan
  });

  // Hilangkan pesan notifikasi setelah 3.5 detik
  setTimeout(() => {
    if (pesanEl) pesanEl.innerHTML = "";
  }, 3500);
}

// --- 5. FUNGSI SINKRONISASI JAM IOT ---
function sinkronWaktu() {
  const now = new Date();
  const jam = String(now.getHours()).padStart(2, "0");
  const menit = String(now.getMinutes()).padStart(2, "0");
  const detik = String(now.getSeconds()).padStart(2, "0");
  const timeStr = `${jam}:${menit}:${detik}`;

  const payloadSync = {
    action: "sync_time",
    time: timeStr,
    timestamp: now.getTime(),
  };

  if (mqttClient && mqttClient.isConnected()) {
    let message = new Paho.MQTT.Message(JSON.stringify(payloadSync));
    message.destinationName = mqtt_topic;
    message.retained = false;
    mqttClient.send(message);
  }

  const pesanEl = document.getElementById("pesan");
  if (pesanEl) {
    pesanEl.innerHTML = `⏰ Waktu Kala.Clock berhasil disinkronkan ke <strong>${timeStr}</strong>!`;
    setTimeout(() => {
      pesanEl.innerHTML = "";
    }, 3500);
  }
}

// --- 6. INTERAKTIVITAS LAYAR SIMULASI VIRTUAL LED ---
let show24h = true;
let showDetik = true;
let showTanggal = true;

function updateClock() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  let ampm = "";
  if (!show24h) {
    ampm = hours >= 12 ? " PM" : " AM";
    hours = hours % 12 || 12;
  }
  const hoursStr = String(hours).padStart(2, "0");

  const timeDisplay = showDetik
    ? `${hoursStr}:${minutes}:${seconds}${ampm}`
    : `${hoursStr}:${minutes}${ampm}`;

  const clockPreviewEl = document.getElementById("virtualClock");
  const cardClockEl = document.getElementById("liveClockCard");

  if (clockPreviewEl) clockPreviewEl.textContent = timeDisplay;
  if (cardClockEl) cardClockEl.textContent = timeDisplay;

  // Tanggal
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];
  const dateStr = `${days[now.getDay()]}, ${String(now.getDate()).padStart(2, "0")} ${months[now.getMonth()]} ${now.getFullYear()}`;

  const datePreviewEl = document.getElementById("virtualDate");
  if (datePreviewEl) {
    datePreviewEl.style.display = showTanggal ? "block" : "none";
    datePreviewEl.textContent = dateStr;
  }
}

// Update Kecerahan di Slider & Preview
function updateBrightnessFromSlider(val) {
  const num = parseInt(val) || 0;
  const badge = document.getElementById("badgeBrightness");
  const previewText = document.getElementById("previewBrightnessText");
  const dimmer = document.getElementById("ledDimmer");
  const percent = Math.round((num / 255) * 100);

  if (badge) badge.textContent = num;
  if (previewText) previewText.textContent = `${num} (${percent}%)`;

  // Sesuaikan kegelapan overlay dimmer (0 = redup maksimal, 255 = terang benderang)
  if (dimmer) {
    const darkness = 0.85 - (num / 255) * 0.75;
    dimmer.style.backgroundColor = `rgba(0, 0, 0, ${darkness})`;
  }
}

// Preset Kecerahan Cepat
function setBrightnessPreset(val) {
  const slider = document.getElementById("inputBrightness");
  if (slider) {
    slider.value = val;
    updateBrightnessFromSlider(val);
  }
}

function terapkanKecerahanLangsung() {
  kirimData();
}

// Update Kecepatan Scroll
function updateSpeedFromSlider(val) {
  const num = parseInt(val) || 40;
  const badge = document.getElementById("badgeSpeed");
  const previewText = document.getElementById("previewSpeedText");
  const ticker = document.getElementById("virtualTicker");

  if (badge) badge.textContent = `${num} ms`;
  if (previewText) previewText.textContent = `${num} ms`;

  // Atur durasi animasi marquee berdasarkan kecepatan (semakin tinggi nilai, semakin cepat)
  if (ticker) {
    const duration = Math.max(4, Math.round(25 - (num / 100) * 19));
    ticker.style.animationDuration = `${duration}s`;
  }
}

// Update Pesan Teks di Layar Preview
function updateTickerPreview(text) {
  const ticker = document.getElementById("virtualTicker");
  if (ticker) {
    ticker.textContent =
      text && text.trim().length > 0
        ? text
        : "Kala.Clock — Sistem Jam & Running Text Siap Digunakan";
  }
}

// Update Mode Tampilan
function updateModePreview(mode) {
  const ticker = document.getElementById("virtualTicker");
  const modeLabel = document.getElementById("previewModeLabel");
  const clockBox = document.querySelector(".led-clock-box");
  const divider = document.querySelector(".led-divider");

  if (!ticker) return;

  switch (String(mode)) {
    case "1": // Berjalan Kiri
      ticker.style.animationName = "scrollLeft";
      ticker.style.textAlign = "left";
      ticker.style.paddingLeft = "100%";
      if (clockBox) clockBox.style.display = "block";
      if (divider) divider.style.display = "block";
      if (modeLabel) modeLabel.textContent = "Mode: Jam + Teks Berjalan Kiri";
      break;
    case "2": // Diam di Tengah (Statis)
      ticker.style.animationName = "none";
      ticker.style.textAlign = "center";
      ticker.style.paddingLeft = "0";
      if (clockBox) clockBox.style.display = "block";
      if (divider) divider.style.display = "block";
      if (modeLabel) modeLabel.textContent = "Mode: Jam + Teks Diam di Tengah";
      break;
    case "3": // Berjalan Kanan
      ticker.style.animationName = "scrollRight";
      ticker.style.textAlign = "right";
      ticker.style.paddingLeft = "0";
      if (clockBox) clockBox.style.display = "block";
      if (divider) divider.style.display = "block";
      if (modeLabel) modeLabel.textContent = "Mode: Teks Berjalan Kanan";
      break;
    case "4": // Jam + Teks Bergantian
      ticker.style.animationName = "scrollLeft";
      if (clockBox) clockBox.style.display = "block";
      if (divider) divider.style.display = "block";
      if (modeLabel) modeLabel.textContent = "Mode: Jam & Teks Bergantian";
      break;
    default:
      ticker.style.animationName = "scrollLeft";
  }
}

function fokusInputTeks() {
  const input = document.getElementById("inputTeks");
  if (input) {
    input.focus();
    input.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function toggleTimeFormat() {
  const check = document.getElementById("check24h");
  show24h = check ? check.checked : true;
  updateClock();
}

function toggleDetikDisplay() {
  const check = document.getElementById("checkDetik");
  showDetik = check ? check.checked : true;
  updateClock();
}

function toggleTanggalDisplay() {
  const check = document.getElementById("checkTanggal");
  showTanggal = check ? check.checked : true;
  updateClock();
}

// Helpers
function updateStatusBadge(id, status, text) {
  const el = document.getElementById(id);
  if (el) {
    el.className = "status-box " + status;
    el.innerHTML = text;
  }
}

function updateSidebarStatus(isOnline) {
  const dot = document.getElementById("sidebarDot");
  const text = document.getElementById("sidebarStatusText");
  if (dot && text) {
    if (isOnline) {
      dot.style.backgroundColor = "var(--color-online)";
      dot.style.boxShadow = "0 0 6px var(--color-online)";
      text.textContent = "Sistem Online";
    } else {
      dot.style.backgroundColor = "var(--color-offline)";
      dot.style.boxShadow = "0 0 6px var(--color-offline)";
      text.textContent = "Sistem Offline";
    }
  }
}

// --- INISIALISASI SAAT HALAMAN DIMUAT ---
document.addEventListener("DOMContentLoaded", function () {
  // Jalankan jam digital
  updateClock();
  setInterval(updateClock, 1000);

  // Jalankan koneksi MQTT & Database
  connectMQTT();
  cekDatabase();
  setInterval(cekDatabase, 10000); // Polling DB setiap 10 detik

  // Muat data terakhir
  loadSavedData();

  // Highlight navigation on scroll
  const navLinks = document.querySelectorAll(".nav-link");
  navLinks.forEach((link) => {
    link.addEventListener("click", function () {
      navLinks.forEach((l) => l.classList.remove("active"));
      this.classList.add("active");
    });
  });
});
