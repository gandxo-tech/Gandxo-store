// ============================================================
// store.js — Logique du store public (index.html et app.html)
// Ne lit et n'affiche que des applications réellement publiées
// (status === "published"). Aucune donnée n'est inventée : si
// rien n'existe encore, on affiche un état vide explicite.
// ============================================================

import { db, escapeHTML, formatDate, formatNumber } from "./app.js";
import { recordDownload } from "./analytics.js";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Préfixée "store_" : ce projet Firebase est partagé avec SIS.
const APPS_COL = "store_apps";

// -----------------------------------------------------------------
// Page d'accueil
// -----------------------------------------------------------------
export async function initHomePage() {
  const grid = document.getElementById("apps-grid");
  const chipsWrap = document.getElementById("category-chips");
  if (!grid) return;

  grid.innerHTML = `<p class="loading">Chargement des applications…</p>`;

  let apps = [];
  try {
    const q = query(
      collection(db, APPS_COL),
      where("status", "==", "published"),
      orderBy("updatedAt", "desc")
    );
    const snap = await getDocs(q);
    apps = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<p class="empty-state">Impossible de charger les applications pour le moment.</p>`;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const initialQuery = params.get("q") || "";
  if (initialQuery) {
    const input = document.getElementById("header-search-input");
    if (input) input.value = initialQuery;
  }

  let activeCategory = "toutes";
  let activeQuery = initialQuery;

  const categories = [...new Set(apps.map((a) => a.category).filter(Boolean))];

  function renderChips() {
    if (!chipsWrap) return;
    if (categories.length === 0) {
      chipsWrap.innerHTML = "";
      return;
    }
    const all = ["toutes", ...categories];
    chipsWrap.innerHTML = all
      .map(
        (cat) =>
          `<button type="button" class="chip ${cat === activeCategory ? "active" : ""}" data-cat="${escapeHTML(cat)}">${escapeHTML(cat === "toutes" ? "Toutes" : cat)}</button>`
      )
      .join("");
    chipsWrap.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeCategory = btn.dataset.cat;
        renderChips();
        renderGrid();
      });
    });
  }

  function renderGrid() {
    let filtered = apps;
    if (activeCategory !== "toutes") {
      filtered = filtered.filter((a) => a.category === activeCategory);
    }
    if (activeQuery) {
      const q = activeQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          (a.name || "").toLowerCase().includes(q) ||
          (a.shortDesc || "").toLowerCase().includes(q) ||
          (a.category || "").toLowerCase().includes(q)
      );
    }

    if (apps.length === 0) {
      grid.innerHTML = `<p class="empty-state">Aucune application publiée pour le moment.</p>`;
      return;
    }
    if (filtered.length === 0) {
      grid.innerHTML = `<p class="empty-state">Aucun résultat pour cette recherche.</p>`;
      return;
    }

    grid.innerHTML = filtered.map(renderAppCard).join("");
  }

  renderChips();
  renderGrid();

  window.addEventListener("gandxo:search", (e) => {
    activeQuery = e.detail || "";
    renderGrid();
  });
}

function renderAppCard(app) {
  const icon = app.icon
    ? `<img src="${escapeHTML(app.icon)}" alt="" loading="lazy" />`
    : `<span class="icon-fallback">${escapeHTML((app.name || "?").slice(0, 1).toUpperCase())}</span>`;

  return `
    <a class="app-card" href="app.html?id=${encodeURIComponent(app.id)}">
      <div class="app-card-icon">${icon}</div>
      <div class="app-card-body">
        <h3>${escapeHTML(app.name || "Sans nom")}</h3>
        <p>${escapeHTML(app.shortDesc || "")}</p>
        <div class="app-card-meta">
          ${app.category ? `<span class="tag">${escapeHTML(app.category)}</span>` : ""}
          ${app.currentVersion ? `<span class="version-badge">v${escapeHTML(app.currentVersion)}</span>` : ""}
        </div>
      </div>
      <span class="app-card-cta">Voir l'application →</span>
    </a>
  `;
}

// -----------------------------------------------------------------
// Page détail d'une application
// -----------------------------------------------------------------
export async function initAppPage() {
  const root = document.getElementById("app-detail");
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const appId = params.get("id");

  if (!appId) {
    root.innerHTML = `<p class="empty-state">Aucune application spécifiée.</p>`;
    return;
  }

  root.innerHTML = `<p class="loading">Chargement…</p>`;

  let app;
  try {
    const snap = await getDoc(doc(db, APPS_COL, appId));
    if (!snap.exists() || snap.data().status !== "published") {
      root.innerHTML = `<p class="empty-state">Cette application est introuvable ou n'est pas publiée.</p>`;
      return;
    }
    app = { id: snap.id, ...snap.data() };
  } catch (err) {
    console.error(err);
    root.innerHTML = `<p class="empty-state">Impossible de charger cette application.</p>`;
    return;
  }

  document.title = `${app.name} — Gandxo Store`;

  let versions = [];
  try {
    const vSnap = await getDocs(
      query(collection(db, APPS_COL, appId, "versions"), orderBy("date", "desc"))
    );
    versions = vSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(err);
  }

  const screenshots = Array.isArray(app.screenshots) ? app.screenshots : [];
  const features = Array.isArray(app.features) ? app.features : [];

  root.innerHTML = `
    <div class="app-detail-header">
      <div class="app-detail-icon">
        ${app.icon ? `<img src="${escapeHTML(app.icon)}" alt="" />` : `<span class="icon-fallback">${escapeHTML((app.name || "?").slice(0, 1).toUpperCase())}</span>`}
      </div>
      <div class="app-detail-heading">
        <h1>${escapeHTML(app.name || "Sans nom")}</h1>
        <p class="app-detail-dev">Par ${escapeHTML(app.developer || "Gandxo")}</p>
        <div class="app-card-meta">
          ${app.category ? `<span class="tag">${escapeHTML(app.category)}</span>` : ""}
          ${app.currentVersion ? `<span class="version-badge">v${escapeHTML(app.currentVersion)}</span>` : ""}
        </div>
      </div>
      <button class="btn-primary btn-download" id="download-btn" ${app.downloadUrl ? "" : "disabled"}>
        Télécharger
      </button>
    </div>

    ${screenshots.length > 0 ? `
      <section class="screenshots" aria-label="Captures d'écran">
        ${screenshots.map((s) => `<img src="${escapeHTML(s)}" alt="Capture d'écran de ${escapeHTML(app.name || "")}" loading="lazy" />`).join("")}
      </section>
    ` : ""}

    <section class="app-detail-grid">
      <div class="app-detail-main">
        <h2>Description</h2>
        <p class="app-full-desc">${escapeHTML(app.fullDesc || app.shortDesc || "Aucune description disponible.")}</p>

        ${features.length > 0 ? `
          <h2>Fonctionnalités</h2>
          <ul class="feature-list">
            ${features.map((f) => `<li>${escapeHTML(f)}</li>`).join("")}
          </ul>
        ` : ""}

        ${app.changelog ? `
          <h2>Notes de version</h2>
          <p class="changelog">${escapeHTML(app.changelog)}</p>
        ` : ""}
      </div>

      <aside class="app-detail-info">
        <h2>Informations</h2>
        <dl>
          <div><dt>Version</dt><dd>${escapeHTML(app.currentVersion || "—")}</dd></div>
          <div><dt>Taille</dt><dd>${escapeHTML(app.size || "—")}</dd></div>
          <div><dt>Mise à jour</dt><dd>${formatDate(app.updatedAt)}</dd></div>
          <div><dt>Compatibilité</dt><dd>${escapeHTML(app.compatibility || "—")}</dd></div>
          <div><dt>Catégorie</dt><dd>${escapeHTML(app.category || "—")}</dd></div>
          <div><dt>Téléchargements</dt><dd>${formatNumber(app.totalDownloads || 0)}</dd></div>
        </dl>

        ${versions.length > 0 ? `
          <h2>Historique des versions</h2>
          <ul class="version-history">
            ${versions.map((v) => `
              <li>
                <div class="version-row">
                  <span class="version-badge">v${escapeHTML(v.versionNumber || "—")}</span>
                  <span class="version-date">${formatDate(v.date)}</span>
                </div>
                ${v.changelog ? `<p>${escapeHTML(v.changelog)}</p>` : ""}
              </li>
            `).join("")}
          </ul>
        ` : ""}
      </aside>
    </section>
  `;

  const btn = document.getElementById("download-btn");
  if (btn && app.downloadUrl) {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Préparation du téléchargement…";
      try {
        await recordDownload({ appId: app.id, appName: app.name, version: app.currentVersion });
      } catch (err) {
        console.error("Échec de l'enregistrement analytics :", err);
      } finally {
        window.location.href = app.downloadUrl;
        btn.disabled = false;
        btn.textContent = "Télécharger";
      }
    });
  }
}
