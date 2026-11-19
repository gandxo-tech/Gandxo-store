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
  where,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Préfixées "store_" : ce projet Firebase est partagé avec SIS.
const APPS_COL = "store_apps";
const DOWNLOADS_COL = "store_downloads";

let currentRange = "7j";
let appsCache = [];
let currentSeries = { labels: [], values: [] };

/** Convertit un Timestamp Firestore (ou une date) en millisecondes. */
function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Lit une valeur d'<input type="date"> ("AAAA-MM-JJ") comme une date
 * LOCALE à midi. `new Date("2026-01-05")` donnerait minuit UTC, donc
 * la veille pour les fuseaux à l'ouest de Greenwich.
 */
function parseDateInput(value) {
  if (!value) return new Date();
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return new Date(value);
  return new Date(y, m - 1, d, 12);
}

// -----------------------------------------------------------------
// Modales : ouverture/fermeture accessibles (focus + touche Échap)
// -----------------------------------------------------------------
let lastFocusedElement = null;

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  lastFocusedElement = document.activeElement;
  modal.classList.add("open");
  const field = modal.querySelector("input:not([type='file']), textarea, select");
  const target = field || modal.querySelector("button");
  if (target) target.focus();
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove("open");
  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
  lastFocusedElement = null;
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  document.querySelectorAll(".modal.open").forEach((modal) => closeModal(modal.id));
});

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
  const buttons = Array.from(document.querySelectorAll(".admin-tab-btn"));

  function activate(btn) {
    buttons.forEach((b) => {
      const selected = b === btn;
      b.classList.toggle("active", selected);
      b.setAttribute("aria-selected", String(selected));
      b.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll(".admin-tab-panel").forEach((p) => p.classList.remove("active"));
    const panel = document.getElementById(`tab-${btn.dataset.tab}`);
    if (panel) panel.classList.add("active");
  }

  buttons.forEach((btn, index) => {
    btn.addEventListener("click", () => activate(btn));
    btn.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const next = buttons[(index + (e.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length];
      next.focus();
      activate(next);
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
    stats = await getDashboardStats(appsCache.map((a) => a.id));
  } catch (err) {
    console.error(err);
    cards.innerHTML = `<p class="empty-state">Impossible de charger les statistiques.</p>`;
    return;
  }

  const topAppName = stats.topApp
    ? (appsCache.find((a) => a.id === stats.topApp.id) || {}).name || "—"
    : null;

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
      <span class="stat-value">${stats.topApp ? escapeHTML(topAppName) : "Aucun téléchargement pour le moment."}</span>
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
      <caption class="visually-hidden">Téléchargements par application</caption>
      <thead>
        <tr>
          <th scope="col">Application</th>
          <th scope="col">Téléchargements</th>
          <th scope="col"><span class="visually-hidden">Actions</span></th>
        </tr>
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
  if (!detail) return;
  detail.innerHTML = `<p class="loading" role="status">Chargement…</p>`;
  const app = appsCache.find((a) => a.id === appId);

  let stats;
  try {
    stats = await getAppStats(appId);
  } catch (err) {
    console.error(err);
    detail.innerHTML = `<p class="empty-state">Impossible de charger le détail de cette application.</p>`;
    return;
  }

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

  currentSeries = series;
  const hasData = series.values.some((v) => v > 0);
  emptyMsg.style.display = hasData ? "none" : "block";
  emptyMsg.textContent = "Les statistiques apparaîtront dès les premiers téléchargements.";
  canvas.style.display = hasData ? "block" : "none";
  if (!hasData) {
    canvas.setAttribute("aria-label", "Aucun téléchargement sur la période.");
    return;
  }

  const total = series.values.reduce((sum, v) => sum + v, 0);
  const peak = Math.max(...series.values);
  canvas.setAttribute(
    "aria-label",
    `Graphique des téléchargements sur la période : ${total} au total, pic à ${peak} par intervalle.`
  );

  drawLineChart(canvas, series.labels, series.values);
}

// Redessine le graphique quand la fenêtre change de taille (sinon le
// canvas reste étiré/flou après une rotation d'écran).
let resizeTimer = null;
window.addEventListener("resize", () => {
  if (!currentSeries.values.some((v) => v > 0)) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const canvas = document.getElementById("downloads-chart");
    if (canvas) drawLineChart(canvas, currentSeries.labels, currentSeries.values);
  }, 150);
});

function niceMax(value) {
  if (value <= 4) return Math.max(value, 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function drawLineChart(canvas, labels, values) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 600;
  const cssHeight = canvas.clientHeight || 260;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const padding = { top: 16, right: 16, bottom: 28, left: 46 };
  const w = cssWidth - padding.left - padding.right;
  const h = cssHeight - padding.top - padding.bottom;
  const max = niceMax(Math.max(...values, 1));

  const yFor = (v) => padding.top + h - (v / max) * h;

  // Grille horizontale + graduations de l'axe Y
  ctx.font = "11px 'JetBrains Mono', monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const tickCount = 4;
  for (let i = 0; i <= tickCount; i++) {
    const value = (max / tickCount) * i;
    const y = yFor(value);
    ctx.strokeStyle = i === 0 ? "rgba(237,239,245,0.28)" : "rgba(237,239,245,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + w, y);
    ctx.stroke();

    ctx.fillStyle = "rgba(237,239,245,0.55)";
    ctx.fillText(formatNumber(Math.round(value)), padding.left - 8, y);
  }

  // Axe Y
  ctx.strokeStyle = "rgba(237,239,245,0.28)";
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + h);
  ctx.stroke();

  // Ligne de données
  const stepX = values.length > 1 ? w / (values.length - 1) : 0;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = padding.left + i * stepX;
    const y = yFor(v);
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
    const y = yFor(v);
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Labels X (en sauter certains si trop nombreux)
  ctx.fillStyle = "rgba(237,239,245,0.55)";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const skip = Math.max(1, Math.ceil(labels.length / 8));
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
  list.innerHTML = `<p class="loading" role="status">Chargement…</p>`;
  try {
    // Pas de orderBy("updatedAt") : un document créé sans ce champ
    // disparaîtrait silencieusement de la liste. Tri côté client.
    const snap = await getDocs(collection(db, APPS_COL));
    appsCache = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
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
  try {
    await updateDoc(doc(db, APPS_COL, id), { status: newStatus, updatedAt: serverTimestamp() });
    await refreshAll();
  } catch (err) {
    console.error(err);
    alert("Changement de statut impossible. Vérifie ta connexion et tes droits admin.");
  }
}

/**
 * Supprime les téléchargements d'une application, par lots de 400
 * (limite d'un batch Firestore : 500 écritures).
 */
async function deleteDownloadsForApp(appId) {
  const snap = await getDocs(query(collection(db, DOWNLOADS_COL), where("appId", "==", appId)));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function deleteApp(id) {
  const app = appsCache.find((a) => a.id === id);
  const label = app ? app.name : "cette application";
  if (!confirm(
    `Supprimer définitivement "${label}" ?\n\n` +
    "Les versions et l'historique de téléchargements associés seront aussi supprimés. " +
    "Cette action est irréversible."
  )) return;

  try {
    await deleteDownloadsForApp(id);
    const versions = await getDocs(collection(db, APPS_COL, id, "versions"));
    for (let i = 0; i < versions.docs.length; i += 400) {
      const batch = writeBatch(db);
      versions.docs.slice(i, i + 400).forEach((v) => batch.delete(v.ref));
      await batch.commit();
    }
    await deleteDoc(doc(db, APPS_COL, id));
    await refreshAll();
  } catch (err) {
    console.error(err);
    alert("Suppression impossible. Vérifie ta connexion et tes droits admin.");
  }
}

function wireAppForm() {
  document.getElementById("add-app-btn").addEventListener("click", () => openAppForm(null));
  document.getElementById("app-form-cancel").addEventListener("click", closeAppForm);
  const cancelAlt = document.getElementById("app-form-cancel-2");
  if (cancelAlt) cancelAlt.addEventListener("click", closeAppForm);
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
  const form = document.getElementById("app-form");
  form.reset();
  document.getElementById("app-form-title").textContent = app ? "Modifier l'application" : "Ajouter une application";
  form.dataset.editingId = app ? app.id : "";

  // Toujours passer par form.elements : `form.name` est écrasé par
  // l'<input name="name"> (DOM clobbering) et casserait au moindre
  // renommage du champ ou attribut name sur le <form>.
  const fields = form.elements;

  if (app) {
    fields.name.value = app.name || "";
    fields.shortDesc.value = app.shortDesc || "";
    fields.fullDesc.value = app.fullDesc || "";
    fields.icon.value = app.icon || "";
    fields.category.value = app.category || "";
    fields.currentVersion.value = app.currentVersion || "";
    fields.size.value = app.size || "";
    fields.compatibility.value = app.compatibility || "";
    fields.downloadUrl.value = app.downloadUrl || "";
    fields.changelog.value = app.changelog || "";
    fields.developer.value = app.developer || "Gandxo";
    fields.screenshots.value = (app.screenshots || []).join("\n");
    fields.features.value = (app.features || []).join("\n");
    fields.status.value = app.status || "draft";
  } else {
    fields.developer.value = "Gandxo";
    fields.status.value = "draft";
  }

  openModal("app-form-modal");
}

function closeAppForm() {
  closeModal("app-form-modal");
}

async function saveApp() {
  const form = document.getElementById("app-form");
  const editingId = form.dataset.editingId;

  const fields = form.elements;
  const payload = {
    name: fields.name.value.trim(),
    shortDesc: fields.shortDesc.value.trim(),
    fullDesc: fields.fullDesc.value.trim(),
    icon: fields.icon.value.trim(),
    category: fields.category.value.trim(),
    currentVersion: fields.currentVersion.value.trim(),
    size: fields.size.value.trim(),
    compatibility: fields.compatibility.value.trim(),
    downloadUrl: fields.downloadUrl.value.trim(),
    changelog: fields.changelog.value.trim(),
    developer: fields.developer.value.trim() || "Gandxo",
    screenshots: fields.screenshots.value.split("\n").map((s) => s.trim()).filter(Boolean),
    features: fields.features.value.split("\n").map((s) => s.trim()).filter(Boolean),
    status: fields.status.value,
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
    await refreshAll();
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
  document.getElementById("versions-app-name").textContent = app ? app.name : "";
  document.getElementById("version-form").reset();
  openModal("versions-modal");
  await renderVersionsList();
}

function closeVersionsPanel() {
  closeModal("versions-modal");
  versionsAppId = null;
}

async function renderVersionsList() {
  const list = document.getElementById("versions-list");
  list.innerHTML = `<p class="loading" role="status">Chargement…</p>`;

  let versions;
  try {
    // Tri côté client : une version enregistrée sans champ `date` ne
    // doit pas disparaître de l'historique (ce que ferait orderBy).
    const snap = await getDocs(collection(db, APPS_COL, versionsAppId, "versions"));
    versions = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => toMillis(b.date) - toMillis(a.date));
  } catch (err) {
    console.error(err);
    list.innerHTML = `<p class="empty-state">Impossible de charger les versions.</p>`;
    return;
  }

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
  const fields = form.elements;
  const payload = {
    versionNumber: fields.versionNumber.value.trim(),
    versionCode: fields.versionCode.value.trim(),
    date: parseDateInput(fields.date.value),
    changelog: fields.changelog.value.trim(),
    size: fields.size.value.trim(),
    downloadUrl: fields.downloadUrl.value.trim(),
    compatibility: fields.compatibility.value.trim()
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
