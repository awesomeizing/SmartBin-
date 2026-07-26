/**
 * SmartBin+ — Authentication Service
 * =============================================================================
 * Sign-in, sign-out, role resolution and route guarding.
 *
 * Satisfies report §3.2 Security: "Firebase Authentication shall be configured
 * to restrict dashboard access to authorized municipal accounts."
 *
 * ROLE MODEL
 * Firebase Auth answers "who are you". It does not answer "what may you do".
 * Roles live in the database at /users/{uid}/role and are resolved after
 * sign-in. The UI uses the role to hide controls; the database security rules
 * independently enforce it. Both layers are required — hiding a button is
 * presentation, not security.
 *
 * @module firebase/auth.service
 */

import { initFirebase, getFirebaseAuth, getFirebaseDb, getSdk, isInDemoMode } from './init.js';
import { emit, Events } from '../js/core/events.js';
import { setUser, setRole, reset, get } from '../js/core/store.js';
import { Role, ROLE_RANK, DB_PATH } from '../config/constants.js';
import { AUTH } from '../config/app.config.js';

/** Mock user object for demo mode. */
const DEMO_USER = Object.freeze({
  uid: 'demo-admin-001',
  email: 'admin@smartbin.demo',
  displayName: 'Demo Administrator',
  emailVerified: true,
});

/** @type {(() => void)|null} Detaches the auth state observer. */
let unsubscribeAuthState = null;

/**
 * Start observing authentication state. Call once, at application start.
 *
 * Resolves after the **first** auth state callback, so callers know whether
 * a session already exists before deciding what to render. Without this the
 * dashboard flashes the login screen for a moment on every reload for an
 * already-signed-in user.
 *
 * @returns {Promise<object|null>} The current user, or null.
 */
export async function startAuthObserver() {
  await initFirebase();

  // Demo mode: skip Firebase Auth entirely.
  if (isInDemoMode()) {
    setUser(DEMO_USER);
    setRole(Role.ADMINISTRATOR);
    emit(Events.AUTH_READY, DEMO_USER);
    emit(Events.AUTH_ROLE_RESOLVED, Role.ADMINISTRATOR);
    return DEMO_USER;
  }

  const auth = getFirebaseAuth();
  const { auth: authSdk } = getSdk();

  return new Promise((resolve) => {
    let settled = false;

    unsubscribeAuthState = authSdk.onAuthStateChanged(
      auth,
      async (user) => {
        setUser(user);

        if (user) {
          try {
            const role = await resolveRole(user.uid);
            setRole(role);
          } catch (err) {
            console.error('[auth] role resolution failed', err);
            // Fail closed: least privilege rather than assuming admin.
            setRole(AUTH.DEFAULT_ROLE);
            emit(Events.AUTH_ERROR, err);
          }
        } else {
          reset();
        }

        if (!settled) {
          settled = true;
          emit(Events.AUTH_READY, user);
          resolve(user);
        }
      },
      (err) => {
        console.error('[auth] observer error', err);
        emit(Events.AUTH_ERROR, err);
        if (!settled) { settled = true; resolve(null); }
      }
    );
  });
}

/** Detach the auth observer. For teardown and tests. */
export function stopAuthObserver() {
  unsubscribeAuthState?.();
  unsubscribeAuthState = null;
}

/**
 * Read a user's role from /users/{uid}/role.
 *
 * A user record may not exist yet — Firebase Auth creates the account, but
 * the role record is created by an administrator (or manually for the first
 * admin; see README step 7). Missing record means least privilege.
 *
 * @param {string} uid
 * @returns {Promise<string>} A value from Role.*
 */
export async function resolveRole(uid) {
  const db = getFirebaseDb();
  const { db: dbSdk } = getSdk();

  const snapshot = await dbSdk.get(dbSdk.ref(db, `${DB_PATH.user(uid)}/role`));
  const role = snapshot.val();

  if (role && Object.values(Role).includes(role)) return role;

  console.warn(
    `[auth] no valid role for uid ${uid} — defaulting to "${AUTH.DEFAULT_ROLE}". ` +
    'An administrator must assign a role at /users/{uid}/role.'
  );
  return AUTH.DEFAULT_ROLE;
}

/**
 * Sign in with email and password.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>} The signed-in user.
 * @throws {Error} With a human-readable `.message` and the raw `.code`.
 */
export async function signIn(email, password) {
  await initFirebase();

  if (isInDemoMode()) {
    setUser(DEMO_USER);
    setRole(Role.ADMINISTRATOR);
    return DEMO_USER;
  }

  const auth = getFirebaseAuth();
  const { auth: authSdk } = getSdk();

  try {
    const credential = await authSdk.signInWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );
    return credential.user;
  } catch (err) {
    throw humanizeAuthError(err);
  }
}

/**
 * Sign out and clear all application state.
 * @returns {Promise<void>}
 */
export async function signOut() {
  if (isInDemoMode()) {
    reset();
    return;
  }

  const auth = getFirebaseAuth();
  const { auth: authSdk } = getSdk();

  await authSdk.signOut(auth);
  reset();   // never leave one user's bins visible to the next
}

/**
 * Send a password reset email.
 *
 * Resolves successfully even for unregistered addresses. That is intentional:
 * a differing response would let anyone probe which email addresses have
 * accounts.
 *
 * @param {string} email
 * @returns {Promise<void>}
 */
export async function sendPasswordReset(email) {
  await initFirebase();
  const auth = getFirebaseAuth();
  const { auth: authSdk } = getSdk();

  try {
    await authSdk.sendPasswordResetEmail(auth, email.trim());
  } catch (err) {
    if (err?.code === 'auth/user-not-found') return;   // do not disclose
    throw humanizeAuthError(err);
  }
}

/* ---------------------------------------------------------------------------
 * ROUTE GUARDS
 * ------------------------------------------------------------------------- */

/**
 * Redirect to the login page unless a user is signed in.
 * Call at the top of every protected page.
 *
 * @param {string} [loginUrl='login.html']
 * @returns {Promise<boolean>} true if authenticated.
 */
export async function requireAuth(loginUrl = 'login.html') {
  // In demo mode, auto-authenticate with mock admin user.
  if (isInDemoMode()) {
    if (!get('auth').ready) await startAuthObserver();
    return true;
  }

  const user = get('auth').ready
    ? get('auth').user
    : await startAuthObserver();

  if (!user) {
    // Preserve the destination so the user lands where they intended.
    const next = encodeURIComponent(location.pathname + location.hash);
    location.replace(`${loginUrl}?next=${next}`);
    return false;
  }
  return true;
}

/**
 * Require a minimum role. Assumes {@link requireAuth} already passed.
 *
 * @param {string} minimumRole  From Role.*
 * @returns {boolean}
 */
export function requireRole(minimumRole) {
  const current = get('auth').role;

  if (!current) return false;
  return (ROLE_RANK[current] ?? -1) >= (ROLE_RANK[minimumRole] ?? 99);
}

/**
 * Send an already-authenticated user away from the login page.
 * @returns {Promise<void>}
 */
export async function redirectIfAuthenticated() {
  const user = await startAuthObserver();
  if (!user) return;

  const params = new URLSearchParams(location.search);
  const next = params.get('next');
  const role = get('auth').role ?? AUTH.DEFAULT_ROLE;

  location.replace(next ? decodeURIComponent(next) : `dashboard.html${AUTH.LANDING_ROUTE[role]}`);
}

/* ---------------------------------------------------------------------------
 * ERRORS
 * ------------------------------------------------------------------------- */

/**
 * Translate Firebase auth error codes into messages a municipal user can act
 * on. Firebase's own strings ("auth/invalid-credential") mean nothing to
 * anyone outside the development team.
 *
 * Note that wrong-password and unknown-email deliberately share a message,
 * so the form cannot be used to enumerate valid accounts.
 *
 * @param {Error & {code?: string}} err
 * @returns {Error}
 */
function humanizeAuthError(err) {
  const messages = {
    'auth/invalid-email':          'That email address is not formatted correctly.',
    'auth/user-disabled':          'This account has been disabled. Contact your administrator.',
    'auth/user-not-found':         'Incorrect email or password.',
    'auth/wrong-password':         'Incorrect email or password.',
    'auth/invalid-credential':     'Incorrect email or password.',
    'auth/too-many-requests':      'Too many failed attempts. Wait a few minutes and try again.',
    'auth/network-request-failed': 'Network unavailable. Check your connection and try again.',
    'auth/internal-error':         'Authentication service error. Try again shortly.',
  };

  const friendly = new Error(messages[err?.code] ?? 'Sign-in failed. Please try again.');
  friendly.code = err?.code;
  friendly.original = err;
  return friendly;
}

export default {
  startAuthObserver, stopAuthObserver, resolveRole,
  signIn, signOut, sendPasswordReset,
  requireAuth, requireRole, redirectIfAuthenticated,
};
