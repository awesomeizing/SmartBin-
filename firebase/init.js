/**
 * SmartBin+ — Firebase Bootstrap
 * =============================================================================
 * Loads the Firebase modular SDK from CDN and initialises the app, auth and
 * database handles. Everything else imports from here — the SDK is never
 * imported directly by feature code, so the version is pinned in exactly one
 * place and can be swapped without a project-wide find-and-replace.
 *
 * If the config still holds placeholders, initialisation stops and a setup
 * screen is rendered instead. An unconfigured project failing with a helpful
 * message beats an opaque `auth/invalid-api-key` in the console.
 *
 * @module firebase/init
 */

import {
  firebaseConfig,
  FIREBASE_CDN,
  isPlaceholderConfig,
  isDemoMode,
} from '../config/firebase.config.js';

/** @type {import('firebase/app').FirebaseApp|null} */
let app = null;
/** @type {any} */
let auth = null;
/** @type {any} */
let db = null;
/** @type {object|null} Cached SDK function namespaces. */
let sdk = null;

/** @type {boolean} */
let _demoMode = false;

/** @type {Promise<object>|null} Guards against concurrent initialisation. */
let initPromise = null;

/**
 * Initialise Firebase. Safe to call repeatedly — subsequent calls return the
 * same promise rather than creating a second app instance.
 *
 * In demo mode, this resolves immediately without loading the SDK.
 *
 * @returns {Promise<{app: object, auth: object, db: object, sdk: object}>}
 * @throws {Error} If the config is unconfigured and demo mode is off.
 */
export function initFirebase() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (isDemoMode()) {
      _demoMode = true;
      console.info('[init] 🎮 Demo mode — Firebase SDK not loaded. All data is simulated.');
      return { app: null, auth: null, db: null, sdk: null };
    }

    if (isPlaceholderConfig()) {
      renderSetupScreen();
      throw new Error(
        'Firebase is not configured. Fill in config/firebase.config.js — ' +
        'see README.md § Firebase setup.'
      );
    }

    // Dynamic imports: native code-splitting without a bundler. The auth and
    // database modules are only fetched when Firebase is actually used.
    const [appMod, authMod, dbMod] = await Promise.all([
      import(FIREBASE_CDN.app),
      import(FIREBASE_CDN.auth),
      import(FIREBASE_CDN.database),
    ]);

    app  = appMod.initializeApp(firebaseConfig);
    auth = authMod.getAuth(app);
    db   = dbMod.getDatabase(app);

    // Keep the user signed in across reloads — a supervisor should not have
    // to re-authenticate every time a control-room browser refreshes.
    await authMod.setPersistence(auth, authMod.browserLocalPersistence);

    sdk = { app: appMod, auth: authMod, db: dbMod };

    return { app, auth, db, sdk };
  })();

  return initPromise;
}

/**
 * Accessors. Each throws if called before {@link initFirebase} resolves,
 * which surfaces ordering mistakes immediately instead of yielding a
 * confusing null-property error three calls later.
 * In demo mode, they return null — callers must check isInDemoMode().
 */

/** @returns {object|null} */
export function getFirebaseAuth() {
  if (_demoMode) return null;
  if (!auth) throw new Error('Firebase not initialised — await initFirebase() first.');
  return auth;
}

/** @returns {object|null} */
export function getFirebaseDb() {
  if (_demoMode) return null;
  if (!db) throw new Error('Firebase not initialised — await initFirebase() first.');
  return db;
}

/**
 * The loaded SDK namespaces: `{ app, auth, db }`.
 * @returns {object|null}
 */
export function getSdk() {
  if (_demoMode) return null;
  if (!sdk) throw new Error('Firebase not initialised — await initFirebase() first.');
  return sdk;
}

/** @returns {boolean} */
export function isInitialised() {
  return _demoMode || app !== null;
}

/** @returns {boolean} True when running without Firebase. */
export function isInDemoMode() {
  return _demoMode;
}

/**
 * Full-page setup screen shown when the config is still placeholder.
 * Rendered with inline styles deliberately — it must work even if the
 * stylesheets have not loaded.
 */
function renderSetupScreen() {
  const html = `
    <div style="
      position:fixed; inset:0; z-index:99999;
      display:flex; align-items:center; justify-content:center;
      background:#020617; color:#F1F5F9; padding:24px;
      font-family:'DM Sans',system-ui,sans-serif;">
      <div style="max-width:620px; width:100%;">
        <div style="
          font-family:'DM Mono',monospace; font-size:11px;
          letter-spacing:0.1em; text-transform:uppercase;
          color:#F59E0B; margin-bottom:12px;">
          Configuration required
        </div>

        <h1 style="
          font-family:'Syne',sans-serif; font-size:32px; font-weight:800;
          letter-spacing:-0.03em; margin-bottom:16px;">
          Firebase isn't connected yet
        </h1>

        <p style="font-size:15px; line-height:1.7; color:#94A3B8; margin-bottom:24px;">
          SmartBin+ needs a Firebase project before it can load. Setup takes
          about ten minutes and is documented step by step in
          <code style="
            font-family:'DM Mono',monospace; font-size:13px; color:#22C55E;
            background:rgba(34,197,94,0.1); padding:2px 6px; border-radius:4px;">
            README.md
          </code>
          under <em>Firebase setup</em>.
        </p>

        <ol style="
          font-size:14px; line-height:2; color:#94A3B8;
          padding-left:20px; margin-bottom:28px;">
          <li>Create a project at <span style="color:#3B82F6;">console.firebase.google.com</span></li>
          <li>Add a Realtime Database (locked mode)</li>
          <li>Enable Email/Password authentication</li>
          <li>Register a web app and copy its config</li>
          <li>Paste the values into <code style="font-family:'DM Mono',monospace; color:#22C55E;">config/firebase.config.js</code></li>
          <li>Set <code style="font-family:'DM Mono',monospace; color:#22C55E;">IS_CONFIGURED = true</code></li>
          <li>Publish <code style="font-family:'DM Mono',monospace; color:#22C55E;">firebase-rules.json</code> to the Rules tab</li>
        </ol>

        <div style="
          padding:14px 16px; border-radius:8px;
          background:rgba(59,130,246,0.08); border:1px solid rgba(59,130,246,0.25);
          font-size:13px; line-height:1.6; color:#93C5FD;">
          <strong>Also check:</strong> this page must be served over HTTP, not
          opened from the file system. Use VS Code Live Server, or run
          <code style="font-family:'DM Mono',monospace;">python -m http.server 8000</code>
          in the project folder.
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
}

export default { initFirebase, getFirebaseAuth, getFirebaseDb, getSdk, isInitialised, isInDemoMode };
