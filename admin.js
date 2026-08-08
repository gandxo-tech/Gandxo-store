// ============================================================
// admin.js — Espace d'administration de Gandxo Store
// Toutes les données affichées viennent de Firestore. Rien n'est
// hardcodé : sans données, on affiche explicitement un état vide.
// L'accès à cette page est vérifié par auth.js (requireAdmin),
// et toute écriture est de toute façon revalidée par les règles
// Firestore côté serveur.
// ============================================================

import { db, escapeHTML, formatDate, formatNumber, CLOUDINARY_NAME, CLOUDINARY_PRESET } from "./app.js";
import { requireAdmin, logout } from "./auth.js";
import { getDashboardStats, getTimeSeries, getAppStats } from "./analytics.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Préfixée "store_" : ce projet Firebase est partagé avec SIS.
const APPS_COL = "store_apps";
let currentRange = "7j";
let appsCache = [];

document.addEventListener("DOMContentLoaded", () => {
  requireAdmin(async (user) => {
    document.getElementById("admin-user-email").textContent = user.email || "";
    wireTabs();
    wireLogout();
    wireRangeButtons();
    wireAppForm();
    wireVersionForm();
    await refreshAll();
  });
});

function wireLogout() {
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await logout();
    window.location.href = "login.html";
  });
}

function wireTabs() {
  const buttons = document.querySelectorAll(".admin-tab-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".admin-tab-panel").forEach((p) => p.classList.remove("active"));
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    });
  });
}

async function refreshAll() {
  await loadApps();
  await loadDashboard();
  await loadChart(currentRange);
}

// -----------------------------------------------------------------
// Dashboard
// -----------------------------------------------------------------
async function loadDashboard() {
  const cards = document.getElementById("stat-cards");
  cards.innerHTML = `<p class="loading">Calcul des statistiques…</p>`;

  let stats;
  try {
    stats = await getDashboardStats();
  } catch (err) {
    console.error(err);
    cards.innerHTML = `<p class="empty-state">Impossible de charger les statistiques.</p>`;
    return;
  }

  cards.innerHTML = `
    <div class="stat-card">
      <span class="stat-label">Total</span>
      <span class="stat-value">${formatNumber(stats.total)}</span>
      <span class="stat-sub">téléchargements</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Aujourd'hui</span>
      <span class="stat-value">${formatNumber(stats.today)}</span>
      <span class="stat-sub">téléchargements</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Cette semaine</span>
      <span class="stat-value">${formatNumber(stats.week)}</span>
      <span class="stat-sub">téléchargements</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Ce mois</span>
      <span class="stat-value">${formatNumber(stats.month)}</span>
      <span class="stat-sub">téléchargements</span>
    </div>
    <div class="stat-card wide">
      <span class="stat-label">Application la plus téléchargée</span>
      <span class="stat-value">${stats.topApp ? escapeHTML(stats.topApp.name || "—") : "Aucun téléchargement pour le moment."}</span>
      ${stats.topApp ? `<span class="stat-sub">${formatNumber(stats.topApp.count)} téléchargements</span>` : ""}
    </div>
  `;

  renderAppStatsTable(stats.countByApp);
}

function renderAppStatsTable(countByApp) {
  const wrap = document.getElementById("app-stats-table");
  if (appsCache.length === 0) {
    wrap.innerHTML = `<p class="empty-state">Aucune application pour le moment.</p>`;
    return;
  }

  const rows = appsCache.map((app) => {
    const total = countByApp[app.id] || 0;
    return { app, total };
  });

  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>Application</th><th>Téléchargements</th><th></th></tr>
      </thead>
      <tbody>
        ${rows.map(({ app, total }) => `
          <tr>
            <td>${escapeHTML(app.name)}</td>
            <td>${formatNumber(total)}</td>
            <td><button type="button" class="btn-link" data-view-stats="${app.id}">Voir le détail</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <div id="per-app-stats-detail"></div>
  `;

  wrap.querySelectorAll("[data-view-stats]").forEach((btn) => {
    btn.addEventListener("click", () => showAppStatsDetail(btn.dataset.viewStats));
  });
}

async function showAppStatsDetail(appId) {
  const detail = document.getElementById("per-app-stats-detail");
  detail.innerHTML = `<p class="loading">Chargement…</p>`;
  const app = appsCache.find((a) => a.id === appId);
  const stats = await getAppStats(appId);

  const versionRows = Object.entries(stats.byVersion);

  detail.innerHTML = `
    <div class="detail-panel">
      <h4>${escapeHTML(app ? app.name : "")} — détail par version</h4>
      <div class="mini-stats">
        <span>Aujourd'hui : <strong>${formatNumber(stats.today)}</strong></span>
        <span>Cette semaine : <strong>${formatNumber(stats.week)}</strong></span>
        <span>Ce mois : <strong>${formatNumber(stats.month)}</strong></span>
      </div>
      ${versionRows.length === 0
        ? `<p class="empty-state">Aucun téléchargement pour le moment.</p>`
        : `<ul class="version-history">
            ${versionRows
              .sort((a, b) => b[1] - a[1])
              .map(([v, c]) => `<li><div class="version-row"><span class="version-badge">v${escapeHTML(v)}</span><span>${formatNumber(c)} téléchargements</span></div></li>`)
              .join("")}
          </ul>`
      }
    </div>
  `;
}

// -----------------------------------------------------------------
// Graphique d'évolution (canvas natif, sans dépendance)
// -----------------------------------------------------------------
function wireRangeButtons() {
  document.querySelectorAll(".range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".range-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentRange = btn.dataset.range;
      loadChart(currentRange);
    });
  });
}

async function loadChart(range) {
  const canvas = document.getElementById("downloads-chart");
  const emptyMsg = document.getElementById("chart-empty");
  let series;
  try {
    series = await getTimeSeries(range);
  } catch (err) {
    console.error(err);
    series = { labels: [], values: [] };
  }

  const hasData = series.values.some((v) => v > 0);
  emptyMsg.style.display = hasData ? "none" : "block";
  emptyMsg.textContent = "Les statistiques apparaîtront dès les premiers téléchargements.";
  canvas.style.display = hasData ? "block" : "none";
  if (!hasData) return;

  drawLineChart(canvas, series.labels, series.values);
}

function drawLineChart(canvas, labels, values) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 600;
  const cssHeight = canvas.clientHeight || 260;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const padding = { top: 16, right: 16, bottom: 28, left: 40 };
  const w = cssWidth - padding.left - padding.right;
  const h = cssHeight - padding.top - padding.bottom;
  const max = Math.max(...values, 1);

  // Axes
  ctx.strokeStyle = "rgba(237,239,245,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + h);
  ctx.lineTo(padding.left + w, padding.top + h);
  ctx.stroke();

  // Ligne de données
  const stepX = values.length > 1 ? w / (values.length - 1) : 0;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = padding.left + i * stepX;
    const y = padding.top + h - (v / max) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + h);
  gradient.addColorStop(0, "#F2A93C");
  gradient.addColorStop(1, "#5EEAD4");
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Points
  ctx.fillStyle = "#F2A93C";
  values.forEach((v, i) => {
    const x = padding.left + i * stepX;
    const y = padding.top + h - (v / max) * h;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Labels X (en sauter certains si trop nombreux)
  ctx.fillStyle = "rgba(237,239,245,0.55)";
  ctx.font = "11px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  const skip = Math.ceil(labels.length / 8);
  labels.forEach((label, i) => {
    if (i % skip !== 0 && i !== labels.length - 1) return;
    const x = padding.left + i * stepX;
    ctx.fillText(label, x, cssHeight - 8);
  });
}

// -----------------------------------------------------------------
// Gestion des applications
// -----------------------------------------------------------------
async function loadApps() {
  const list = document.getElementById("apps-admin-list");
  list.innerHTML = `<p class="loading">Chargement…</p>`;
  try {
    const snap = await getDocs(query(collection(db, APPS_COL), orderBy("updatedAt", "desc")));
    appsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(err);
    list.innerHTML = `<p class="empty-state">Impossible de charger les applications.</p>`;
    return;
  }

  if (appsCache.length === 0) {
    list.innerHTML = `<p class="empty-state">Aucune application publiée pour le moment.</p>`;
    return;
  }

  list.innerHTML = appsCache.map((app) => `
    <div class="admin-app-row">
      <div class="admin-app-info">
        <strong>${escapeHTML(app.name)}</strong>
        <span class="status-badge ${app.status === "published" ? "published" : "draft"}">${app.status === "published" ? "Publiée" : "Brouillon"}</span>
        <span class="version-badge">v${escapeHTML(app.currentVersion || "—")}</span>
      </div>
      <div class="admin-app-actions">
        <button type="button" data-action="versions" data-id="${app.id}">Versions</button>
        <button type="button" data-action="toggle" data-id="${app.id}">${app.status === "published" ? "Repasser en brouillon" : "Publier"}</button>
        <button type="button" data-action="edit" data-id="${app.id}">Modifier</button>
        <button type="button" class="btn-danger" data-action="delete" data-id="${app.id}">Supprimer</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("button[data-action]").forEach((btn) => {
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    btn.addEventListener("click", () => {
      if (action === "edit") openAppForm(appsCache.find((a) => a.id === id));
      if (action === "toggle") toggleStatus(id);
      if (action === "delete") deleteApp(id);
      if (action === "versions") openVersionsPanel(id);
    });
  });
}

async function toggleStatus(id) {
  const app = appsCache.find((a) => a.id === id);
  if (!app) return;
  const newStatus = app.status === "published" ? "draft" : "published";
  await updateDoc(doc(db, APPS_COL, id), { status: newStatus, updatedAt: serverTimestamp() });
  await loadApps();
  await loadDashboard();
}

async function deleteApp(id) {
  const app = appsCache.find((a) => a.id === id);
  if (!confirm(`Supprimer définitivement "${app ? app.name : "cette application"}" ? Cette action est irréversible.`)) return;
  await deleteDoc(doc(db, APPS_COL, id));
  await loadApps();
  await loadDashboard();
}

function wireAppForm() {
  document.getElementById("add-app-btn").addEventListener("click", () => openAppForm(null));
  document.getElementById("app-form-cancel").addEventListener("click", closeAppForm);
  document.getElementById("app-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveApp();
  });
  wireImageUploads();
}

// -----------------------------------------------------------------
// Upload d'images vers Cloudinary (unsigned, même compte que SIS)
// -----------------------------------------------------------------
async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_NAME}/image/upload`, {
    method: "POST",
    body: formData
  });
  if (!res.ok) throw new Error("Échec de l'upload Cloudinary");
  const data = await res.json();
  return data.secure_url;
}

function wireImageUploads() {
  const iconBtn = document.getElementById("f-icon-upload-btn");
  const iconFile = document.getElementById("f-icon-file");
  const iconStatus = document.getElementById("f-icon-upload-status");
  const iconField = document.getElementById("f-icon");

  iconBtn.addEventListener("click", () => iconFile.click());
  iconFile.addEventListener("change", async () => {
    const file = iconFile.files[0];
    if (!file) return;
    iconStatus.textContent = "Envoi en cours…";
    try {
      const url = await uploadToCloudinary(file);
      iconField.value = url;
      iconStatus.textContent = "Image envoyée ✓";
    } catch (err) {
      console.error(err);
      iconStatus.textContent = "Échec de l'envoi.";
    } finally {
      iconFile.value = "";
    }
  });

  const shotsBtn = document.getElementById("f-screenshots-upload-btn");
  const shotsFile = document.getElementById("f-screenshots-file");
  const shotsStatus = document.getElementById("f-screenshots-upload-status");
  const shotsField = document.getElementById("f-screenshots");

  shotsBtn.addEventListener("click", () => shotsFile.click());
  shotsFile.addEventListener("change", async () => {
    const files = Array.from(shotsFile.files);
    if (files.length === 0) return;
    shotsStatus.textContent = `Envoi de ${files.length} image(s)…`;
    try {
      const urls = await Promise.all(files.map(uploadToCloudinary));
      const existing = shotsField.value.split("\n").map((s) => s.trim()).filter(Boolean);
      shotsField.value = [...existing, ...urls].join("\n");
      shotsStatus.textContent = "Images envoyées ✓";
    } catch (err) {
      console.error(err);
      shotsStatus.textContent = "Échec de l'envoi.";
    } finally {
      shotsFile.value = "";
    }
  });
}

function openAppForm(app) {
  const modal = document.getElementById("app-form-modal");
  const form = document.getElementById("app-form");
  form.reset();
  document.getElementById("app-form-title").textContent = app ? "Modifier l'application" : "Ajouter une application";
  form.dataset.editingId = app ? app.id : "";

  if (app) {
    form.name.value = app.name || "";
    form.shortDesc.value = app.shortDesc || "";
    form.fullDesc.value = app.fullDesc || "";
    form.icon.value = app.icon || "";
    form.category.value = app.category || "";
    form.currentVersion.value = app.currentVersion || "";
    form.size.value = app.size || "";
    form.compatibility.value = app.compatibility || "";
    form.downloadUrl.value = app.downloadUrl || "";
    form.changelog.value = app.changelog || "";
    form.developer.value = app.developer || "Gandxo";
    form.screenshots.value = (app.screenshots || []).join("\n");
    form.features.value = (app.features || []).join("\n");
    form.status.value = app.status || "draft";
  } else {
    form.developer.value = "Gandxo";
    form.status.value = "draft";
  }

  modal.classList.add("open");
}

function closeAppForm() {
  document.getElementById("app-form-modal").classList.remove("open");
}

async function saveApp() {
  const form = document.getElementById("app-form");
  const editingId = form.dataset.editingId;

  const payload = {
    name: form.name.value.trim(),
    shortDesc: form.shortDesc.value.trim(),
    fullDesc: form.fullDesc.value.trim(),
    icon: form.icon.value.trim(),
    category: form.category.value.trim(),
    currentVersion: form.currentVersion.value.trim(),
    size: form.size.value.trim(),
    compatibility: form.compatibility.value.trim(),
    downloadUrl: form.downloadUrl.value.trim(),
    changelog: form.changelog.value.trim(),
    developer: form.developer.value.trim() || "Gandxo",
    screenshots: form.screenshots.value.split("\n").map((s) => s.trim()).filter(Boolean),
    features: form.features.value.split("\n").map((s) => s.trim()).filter(Boolean),
    status: form.status.value,
    updatedAt: serverTimestamp()
  };

  if (!payload.name) {
    alert("Le nom de l'application est obligatoire.");
    return;
  }

  try {
    if (editingId) {
      await updateDoc(doc(db, APPS_COL, editingId), payload);
    } else {
      await addDoc(collection(db, APPS_COL), {
        ...payload,
        totalDownloads: 0,
        createdAt: serverTimestamp()
      });
    }
    closeAppForm();
    await loadApps();
    await loadDashboard();
  } catch (err) {
    console.error(err);
    alert("Erreur lors de l'enregistrement. Vérifie ta connexion et tes droits admin.");
  }
}

// -----------------------------------------------------------------
// Gestion des versions
// -----------------------------------------------------------------
function wireVersionForm() {
  document.getElementById("version-form-close").addEventListener("click", closeVersionsPanel);
  document.getElementById("version-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await addVersion();
  });
}

let versionsAppId = null;

async function openVersionsPanel(appId) {
  versionsAppId = appId;
  const app = appsCache.find((a) => a.id === appId);
  const modal = document.getElementById("versions-modal");
  document.getElementById("versions-app-name").textContent = app ? app.name : "";
  document.getElementById("version-form").reset();
  modal.classList.add("open");
  await renderVersionsList();
}

function closeVersionsPanel() {
  document.getElementById("versions-modal").classList.remove("open");
  versionsAppId = null;
}

async function renderVersionsList() {
  const list = document.getElementById("versions-list");
  list.innerHTML = `<p class="loading">Chargement…</p>`;
  const snap = await getDocs(query(collection(db, APPS_COL, versionsAppId, "versions"), orderBy("date", "desc")));
  const versions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (versions.length === 0) {
    list.innerHTML = `<p class="empty-state">Aucune version enregistrée pour le moment.</p>`;
    return;
  }

  list.innerHTML = versions.map((v) => `
    <li class="version-row-admin">
      <div>
        <span class="version-badge">v${escapeHTML(v.versionNumber)}</span>
        <span class="version-date">${formatDate(v.date)}</span>
      </div>
      <p>${escapeHTML(v.changelog || "")}</p>
      <button type="button" class="btn-link" data-set-current="${v.id}">Définir comme version actuelle</button>
    </li>
  `).join("");

  list.querySelectorAll("[data-set-current]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const vSnap = await getDoc(doc(db, APPS_COL, versionsAppId, "versions", btn.dataset.setCurrent));
      if (!vSnap.exists()) return;
      const v = vSnap.data();
      await updateDoc(doc(db, APPS_COL, versionsAppId), {
        currentVersion: v.versionNumber,
        size: v.size || "",
        downloadUrl: v.downloadUrl || "",
        compatibility: v.compatibility || "",
        changelog: v.changelog || "",
        updatedAt: serverTimestamp()
      });
      await loadApps();
      alert("Version actuelle mise à jour.");
    });
  });
}

async function addVersion() {
  const form = document.getElementById("version-form");
  const payload = {
    versionNumber: form.versionNumber.value.trim(),
    versionCode: form.versionCode.value.trim(),
    date: form.date.value ? new Date(form.date.value) : new Date(),
    changelog: form.changelog.value.trim(),
    size: form.size.value.trim(),
    downloadUrl: form.downloadUrl.value.trim(),
    compatibility: form.compatibility.value.trim()
  };

  if (!payload.versionNumber) {
    alert("Le numéro de version est obligatoire.");
    return;
  }

  try {
    await addDoc(collection(db, APPS_COL, versionsAppId, "versions"), payload);
    form.reset();
    await renderVersionsList();
  } catch (err) {
    console.error(err);
    alert("Erreur lors de l'enregistrement de la version.");
  }
}
