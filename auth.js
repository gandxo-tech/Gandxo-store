// ============================================================
// auth.js — Authentification réelle de l'administration
// L'accès admin n'est jamais décidé par le navigateur : on
// vérifie un document admins/{uid} dans Firestore, et les
// règles de sécurité (firestore.rules) refusent toute écriture
// si ce document n'existe pas pour l'utilisateur connecté.
// Ouvrir admin.html sans être ce compte ne donne donc aucun droit.
// ============================================================

import { db, auth } from "./app.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout() {
  await signOut(auth);
}

// Préfixée "store_" : ce projet Firebase est partagé avec SIS, qui a
// sa propre notion de compte certifié. On garde les deux séparés.
const ADMINS_COL = "store_admins";

/**
 * Vérifie côté client si l'utilisateur possède un document dans la
 * collection "store_admins". Ce n'est qu'un raccourci d'affichage : la
 * vraie protection vient des règles Firestore, qui refusent toute
 * écriture sur "store_apps" si ce document n'existe pas pour request.auth.uid.
 */
export async function checkIsAdmin(uid) {
  if (!uid) return false;
  const snap = await getDoc(doc(db, ADMINS_COL, uid));
  return snap.exists();
}

/**
 * Protège une page admin : redirige vers login.html si l'utilisateur
 * n'est pas connecté ou n'a pas de droits admin. Appelle le callback
 * avec l'utilisateur si tout est en ordre.
 */
export function requireAdmin(onReady) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    const isAdmin = await checkIsAdmin(user.uid);
    if (!isAdmin) {
      await signOut(auth);
      window.location.href = "login.html?erreur=droits";
      return;
    }
    onReady(user);
  });
}

export function watchAuth(callback) {
  onAuthStateChanged(auth, callback);
}
