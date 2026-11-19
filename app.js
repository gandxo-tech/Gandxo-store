// ============================================================
// app.js — Cœur partagé de Gandxo Store
// Initialise Firebase et fournit les briques communes (header,
// footer, recherche) utilisées sur toutes les pages.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

// -----------------------------------------------------------------
// CONFIGURATION FIREBASE
// Projet partagé avec SIS ("chat-anonyme"). Ces valeurs (apiKey
// compris) ne sont pas des secrets : la protection réelle vient des
// règles Firestore (voir firestore.rules), pas de leur confidentialité.
// Toutes les collections de Gandxo Store sont préfixées "store_" pour
// ne jamais entrer en collision avec les données de SIS dans le même
// projet (voir analytics.js, store.js, admin.js, auth.js).
// -----------------------------------------------------------------
export const firebaseConfig = {
  apiKey: "AIzaSyDUf-Rf6fhQXBmtJJ4R9K1IXBFdTl34Z5s",
  authDomain: "chat-anonyme.firebaseapp.com",
  projectId: "chat-anonyme",
  storageBucket: "chat-anonyme.firebasestorage.app",
  messagingSenderId: "93366459642",
  appId: "1:93366459642:web:a2421c9478909b33667d43"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);

// -----------------------------------------------------------------
// Cloudinary — hébergement des icônes et captures d'écran, upload
// direct (unsigned) depuis l'admin. Même compte que SIS.
// -----------------------------------------------------------------
export const CLOUDINARY_NAME = "dwdlwjdhe";
export const CLOUDINARY_PRESET = "sis_preset";

// VAPID_KEY est fourni pour les notifications push (Firebase Cloud
// Messaging), mais Gandxo Store ne demande pas cette fonctionnalité :
// il n'est pas utilisé pour l'instant. Gardé ici si tu veux ajouter
// des notifications de nouvelles versions plus tard.
export const VAPID_KEY = "BEt2EsfC1Ln_TyIjICtS34n9A9WaxJDkKNksxUvlTi1rcItVU5SX_SCGhFE4qAkoeLyKQTersTYAqGCcd3dSU5k";

// -----------------------------------------------------------------
// Liens sociaux (utilisés dans le footer et about.html)
// -----------------------------------------------------------------
export const SOCIAL_LINKS = {
  instagram: "https://www.instagram.com/richx_land?igsh=bHQ4bDIxcDl0d2c4",
  facebook: "https://www.facebook.com/profile.php?id=61584148961809"
};

// Dépôt qui fait foi : chaque push sur `main` déclenche le déploiement
// GitHub Pages et Vercel. Affiché dans le footer pour que le lien entre
// le site en ligne et son code source soit visible.
export const GITHUB_REPO_URL = "https://github.com/gandxo-tech/Gandxo-store";

// -----------------------------------------------------------------
// Admin de Gandxo Store — vérifié aussi côté serveur (voir
// firestore.rules : request.auth.token.email == ADMIN_EMAIL). Comme
// Firebase Auth interdit deux comptes avec le même e-mail, ce compte
// reste le seul possible.
// -----------------------------------------------------------------
export const ADMIN_EMAIL = "gbaguidiexauce@gmail.com";

// -----------------------------------------------------------------
// Header / nav commun
// -----------------------------------------------------------------
export function renderHeader(activePage = "") {
  const header = document.getElementById("site-header");
  if (!header) return;

  header.innerHTML = `
    <div class="header-inner">
      <a href="index.html" class="logo" aria-label="Gandxo Store — accueil">
        <span class="logo-mark">GS</span>
        <span class="logo-text">GANDXO<em>STORE</em></span>
      </a>

      <button class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="primary-nav" aria-label="Ouvrir le menu">
        <span></span><span></span><span></span>
      </button>

      <nav class="primary-nav" id="primary-nav">
        <a href="index.html" class="${activePage === "home" ? "active" : ""}">Accueil</a>
        <a href="index.html#apps" class="${activePage === "apps" ? "active" : ""}">Applications</a>
        <a href="index.html#categories" class="${activePage === "categories" ? "active" : ""}">Catégories</a>
        <a href="about.html" class="${activePage === "about" ? "active" : ""}">À propos</a>
      </nav>

      <form class="header-search" id="header-search" role="search">
        <input type="search" id="header-search-input" placeholder="Rechercher une application..." aria-label="Rechercher une application" autocomplete="off" />
        <button type="button" class="search-clear" id="search-clear" aria-label="Effacer la recherche" hidden>&times;</button>
        <button type="submit" aria-label="Lancer la recherche">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
      </form>
    </div>
  `;

  const toggle = document.getElementById("nav-toggle");
  const nav = document.getElementById("primary-nav");

  function closeNav() {
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  }

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  // Sur mobile, le menu doit se refermer après un choix.
  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeNav));

  const searchForm = document.getElementById("header-search");
  const searchInput = document.getElementById("header-search-input");
  const clearBtn = document.getElementById("search-clear");

  // Bouton « effacer » : visible uniquement quand le champ contient
  // quelque chose, pour éviter un bouton mort dans le header.
  function syncClearButton() {
    if (clearBtn) clearBtn.hidden = searchInput.value.length === 0;
  }
  syncClearButton();

  // Filtrage en direct pendant la frappe (léger debounce pour ne pas
  // reconstruire la grille à chaque caractère). Avant, il fallait
  // valider le formulaire ou aller sur une autre page.
  let typingTimer = null;
  searchInput.addEventListener("input", () => {
    syncClearButton();
    if (!document.getElementById("apps-grid")) return;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent("gandxo:search", { detail: searchInput.value.trim() }));
    }, 140);
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      syncClearButton();
      window.dispatchEvent(new CustomEvent("gandxo:search", { detail: "" }));
      searchInput.focus();
    });
  }

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;

    // La grille d'accueil est le seul endroit où l'on peut filtrer en direct.
    if (document.getElementById("apps-grid")) {
      window.dispatchEvent(new CustomEvent("gandxo:search", { detail: q }));
      scrollToApps();
    } else {
      window.location.href = `index.html?q=${encodeURIComponent(q)}#apps`;
    }
  });
}

function scrollToApps() {
  const section = document.getElementById("apps");
  if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
}

// -----------------------------------------------------------------
// Footer commun
// -----------------------------------------------------------------
export function renderFooter() {
  const footer = document.getElementById("site-footer");
  if (!footer) return;

  const year = new Date().getFullYear();
  footer.innerHTML = `
    <div class="footer-inner">
      <div class="footer-brand">
        <span class="logo-mark small">GS</span>
        <p>Gandxo Store — les applications de Gandxo, distribuées directement.</p>
      </div>
      <nav class="footer-nav">
        <a href="index.html">Accueil</a>
        <a href="about.html">À propos</a>
        <a href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer">Code source (GitHub)</a>
        <a href="login.html">Espace admin</a>
      </nav>
      <div class="footer-social">
        <a href="${SOCIAL_LINKS.instagram}" target="_blank" rel="noopener noreferrer" aria-label="Instagram de Gandxo">Instagram</a>
        <a href="${SOCIAL_LINKS.facebook}" target="_blank" rel="noopener noreferrer" aria-label="Facebook de Gandxo">Facebook</a>
      </div>
    </div>
    <div class="footer-bottom">© ${year} Gandxo Store. Tous droits réservés.</div>
  `;
}

// -----------------------------------------------------------------
// Notifications non bloquantes (remplace les alert() pour les
// confirmations : elles n'interrompent pas la navigation et sont
// annoncées par les lecteurs d'écran via role="status").
// -----------------------------------------------------------------
export function showToast(message, variant = "info") {
  if (!message) return;
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    stack.setAttribute("role", "status");
    stack.setAttribute("aria-live", "polite");
    document.body.appendChild(stack);
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.variant = variant;
  toast.textContent = message;
  stack.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
    if (stack && stack.childElementCount === 0) stack.remove();
  }, 4200);
}

// -----------------------------------------------------------------
// Utilitaires partagés
// -----------------------------------------------------------------
export function escapeHTML(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatDate(value) {
  if (!value) return "—";
  const date = value.toDate ? value.toDate() : new Date(value);
  return date.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

export function formatNumber(n) {
  return new Intl.NumberFormat("fr-FR").format(n || 0);
}

// -----------------------------------------------------------------
// Optimisation des images Cloudinary : insère f_auto (meilleur format
// selon le navigateur, WebP/AVIF) et q_auto (qualité automatique), plus
// un redimensionnement ciblé. Rend le site nettement plus rapide sur
// data mobile. N'affecte que les vraies URLs Cloudinary ; toute autre
// URL est renvoyée inchangée.
// -----------------------------------------------------------------
export function cloudinaryOptimize(url, { width } = {}) {
  if (!url || !url.includes("res.cloudinary.com") || !url.includes("/upload/")) {
    return url;
  }

  const marker = "/upload/";
  const rest = url.slice(url.indexOf(marker) + marker.length);
  const firstSegment = rest.split("/")[0];

  // Une URL déjà transformée ("f_auto,w_500"…) serait invalidée par un
  // second segment de transformation : on la laisse telle quelle.
  const isVersion = /^v\d+$/i.test(firstSegment);
  const looksLikeTransform = /^[a-z]{1,3}_[a-z0-9.]+(,|$)/i.test(firstSegment);
  if (!isVersion && looksLikeTransform) return url;

  const transform = width ? `f_auto,q_auto,w_${width}` : "f_auto,q_auto";
  return url.replace(marker, `${marker}${transform}/`);
}

// -----------------------------------------------------------------
// PWA : enregistre le service worker (rend le site installable sur
// l'écran d'accueil). N'intercepte que les fichiers du site lui-même,
// jamais les requêtes Firebase/Cloudinary (voir sw.js).
// -----------------------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
