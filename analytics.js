// ============================================================
// analytics.js — Suivi réel des téléchargements
// Toute la vérité des statistiques vit dans Firestore. Aucun
// compteur n'est jamais incrémenté uniquement côté navigateur :
// chaque téléchargement écrit un document persistant, et les
// totaux affichés sont recalculés depuis cette source.
// ============================================================

import { db } from "./app.js";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  increment,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Préfixées "store_" : ce projet Firebase est partagé avec SIS.
const DOWNLOADS_COL = "store_downloads";
const APPS_COL = "store_apps";

/**
 * Enregistre un téléchargement réel. Appelé uniquement au moment
 * où l'utilisateur clique réellement sur "Télécharger".
 */
export async function recordDownload({ appId, appName, version }) {
  if (!appId) throw new Error("recordDownload: appId manquant");

  await addDoc(collection(db, DOWNLOADS_COL), {
    appId,
    appName: appName || "",
    version: version || "inconnue",
    timestamp: serverTimestamp()
  });

  // Compteur persistant côté document app, pour un affichage rapide
  // sans avoir à recompter toute la collection à chaque chargement.
  const appRef = doc(db, APPS_COL, appId);
  await updateDoc(appRef, { totalDownloads: increment(1) });
}

/**
 * Récupère tous les événements de téléchargement dans une fenêtre de
 * temps donnée (ou toute la période si aucune borne n'est fournie).
 */
async function getDownloadsSince(sinceDate) {
  const col = collection(db, DOWNLOADS_COL);
  const constraints = [orderBy("timestamp", "desc")];
  if (sinceDate) {
    constraints.unshift(where("timestamp", ">=", Timestamp.fromDate(sinceDate)));
  }
  const q = query(col, ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfWeek() {
  const d = startOfToday();
  const day = d.getDay(); // 0 = dimanche
  const diff = (day === 0 ? 6 : day - 1); // semaine démarrant lundi
  d.setDate(d.getDate() - diff);
  return d;
}
function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Calcule les statistiques globales réelles pour le dashboard admin :
 * total, aujourd'hui, cette semaine, ce mois, application la plus
 * téléchargée. Basé entièrement sur la collection "downloads".
 */
export async function getDashboardStats() {
  const [all, today, week, month] = await Promise.all([
    getDownloadsSince(null),
    getDownloadsSince(startOfToday()),
    getDownloadsSince(startOfWeek()),
    getDownloadsSince(startOfMonth())
  ]);

  const countByApp = {};
  for (const dl of all) {
    countByApp[dl.appId] = (countByApp[dl.appId] || 0) + 1;
  }

  let topAppId = null;
  let topAppName = null;
  let topCount = 0;
  for (const dl of all) {
    const c = countByApp[dl.appId];
    if (c > topCount) {
      topCount = c;
      topAppId = dl.appId;
      topAppName = dl.appName;
    }
  }

  return {
    total: all.length,
    today: today.length,
    week: week.length,
    month: month.length,
    topApp: topAppId ? { id: topAppId, name: topAppName, count: topCount } : null,
    countByApp,
    raw: all
  };
}

/**
 * Construit une série temporelle réelle (jour par jour, ou heure par
 * heure pour 24h) pour alimenter le graphique du dashboard.
 * range: "24h" | "7j" | "30j" | "3m" | "1a" | "tout"
 */
export async function getTimeSeries(range) {
  const now = new Date();
  let since = null;
  let bucketFn;
  let bucketCount;

  switch (range) {
    case "24h":
      since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      bucketCount = 24;
      bucketFn = (date) => Math.floor((now - date) / (60 * 60 * 1000));
      break;
    case "7j":
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      bucketCount = 7;
      bucketFn = (date) => Math.floor((now - date) / (24 * 60 * 60 * 1000));
      break;
    case "30j":
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      bucketCount = 30;
      bucketFn = (date) => Math.floor((now - date) / (24 * 60 * 60 * 1000));
      break;
    case "3m":
      since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      bucketCount = 90;
      bucketFn = (date) => Math.floor((now - date) / (24 * 60 * 60 * 1000));
      break;
    case "1a":
      since = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      bucketCount = 12;
      bucketFn = (date) => (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
      break;
    case "tout":
    default:
      since = null;
      bucketCount = 12;
      bucketFn = null;
      break;
  }

  const downloads = await getDownloadsSince(since);

  if (range === "tout") {
    // Regroupement mensuel depuis le tout premier téléchargement
    if (downloads.length === 0) return { labels: [], values: [] };
    const dates = downloads
      .map((d) => (d.timestamp && d.timestamp.toDate ? d.timestamp.toDate() : null))
      .filter(Boolean);
    if (dates.length === 0) return { labels: [], values: [] };
    const oldest = new Date(Math.min(...dates.map((d) => d.getTime())));
    const monthsSpan = (now.getFullYear() - oldest.getFullYear()) * 12 + (now.getMonth() - oldest.getMonth()) + 1;
    const buckets = new Array(monthsSpan).fill(0);
    for (const date of dates) {
      const idx = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
      const bucketIdx = monthsSpan - 1 - idx;
      if (bucketIdx >= 0 && bucketIdx < monthsSpan) buckets[bucketIdx]++;
    }
    const labels = buckets.map((_, i) => {
      const d = new Date(oldest.getFullYear(), oldest.getMonth() + i, 1);
      return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
    });
    return { labels, values: buckets };
  }

  const buckets = new Array(bucketCount).fill(0);
  for (const dl of downloads) {
    const date = dl.timestamp && dl.timestamp.toDate ? dl.timestamp.toDate() : null;
    if (!date) continue;
    const idx = bucketFn(date);
    const bucketIdx = bucketCount - 1 - idx;
    if (bucketIdx >= 0 && bucketIdx < bucketCount) buckets[bucketIdx]++;
  }

  const labels = buckets.map((_, i) => {
    const stepsAgo = bucketCount - 1 - i;
    if (range === "24h") {
      const d = new Date(now.getTime() - stepsAgo * 60 * 60 * 1000);
      return d.toLocaleTimeString("fr-FR", { hour: "2-digit" });
    }
    if (range === "1a") {
      const d = new Date(now.getFullYear(), now.getMonth() - stepsAgo, 1);
      return d.toLocaleDateString("fr-FR", { month: "short" });
    }
    const d = new Date(now.getTime() - stepsAgo * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  });

  return { labels, values: buckets };
}

/**
 * Statistiques de téléchargement pour une application précise,
 * ventilées par version.
 */
export async function getAppStats(appId) {
  const q = query(collection(db, DOWNLOADS_COL), where("appId", "==", appId));
  const snap = await getDocs(q);
  const downloads = snap.docs.map((d) => d.data());

  const byVersion = {};
  for (const dl of downloads) {
    const v = dl.version || "inconnue";
    byVersion[v] = (byVersion[v] || 0) + 1;
  }

  const todayStart = startOfToday();
  const weekStart = startOfWeek();
  const monthStart = startOfMonth();

  let today = 0, week = 0, month = 0;
  for (const dl of downloads) {
    const date = dl.timestamp && dl.timestamp.toDate ? dl.timestamp.toDate() : null;
    if (!date) continue;
    if (date >= todayStart) today++;
    if (date >= weekStart) week++;
    if (date >= monthStart) month++;
  }

  return { total: downloads.length, today, week, month, byVersion };
}
