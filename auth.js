// ============================================================
// auth.js — Authentification réelle de l'administration
// L'accès admin n'est jamais décidé uniquement par le navigateur :
// les règles Firestore (firestore.rules) vérifient elles aussi que
// request.auth.token.email correspond à l'e-mail admin. Firebase
// Auth interdit deux comptes avec le même e-mail dans un même
// projet, donc ce compte reste le seul possible — même si quelqu'un
// ouvre admin.html directement sans être connecté avec ce compte,
// aucune écriture Firestore ne lui sera acceptée.
// ============================================================

import { db, auth, ADMIN_EMAIL } from "./app.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout() {
  await signOut(auth);
}

/**
 * Vérifie si l'utilisateur connecté est l'administrateur du store.
 * C'est un raccourci d'affichage côté client ; la vraie protection
 * vient des règles Firestore, qui refont exactement cette même
 * vérification (request.auth.token.email) avant d'accepter la
 * moindre écriture sur store_apps / store_downloads.
 */
export function checkIsAdmin(user) {
  return !!user && user.email === ADMIN_EMAIL;
}

/**
 * Protège une page admin : redirige vers login.html si l'utilisateur
 * n'est pas connecté ou n'est pas le compte admin.
 */
export function requireAdmin(onReady) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    if (!checkIsAdmin(user)) {
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
