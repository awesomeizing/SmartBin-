/**
 * SmartBin+ — Firebase Configuration
 * =============================================================================
 * REPLACE THE PLACEHOLDER VALUES BELOW with your own Firebase project's
 * config object. Step-by-step setup instructions are in README.md § Firebase
 * setup — it takes about ten minutes.
 *
 * Where to find these values:
 *   Firebase Console → Project Settings (gear icon) → General
 *   → Your apps → Web app → SDK setup and configuration → Config
 *
 * ON THE API KEY BEING VISIBLE
 * Firebase web API keys are designed to be public. They identify the project;
 * they do not grant access to it. Access is controlled entirely by
 * Authentication and by the Realtime Database security rules in
 * `firebase-rules.json`. This is documented Firebase practice, not an
 * oversight — but it does mean the rules file is doing real work and must be
 * published before the app is used with real data.
 *
 * @module config/firebase.config
 */

/** @type {boolean} True once real credentials have been filled in. */
export const IS_CONFIGURED = false;

export const firebaseConfig = {
  apiKey:            'REPLACE_ME',
  authDomain:        'REPLACE_ME.firebaseapp.com',
  databaseURL:       'https://REPLACE_ME-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId:         'REPLACE_ME',
  storageBucket:     'REPLACE_ME.appspot.com',
  messagingSenderId: 'REPLACE_ME',
  appId:             'REPLACE_ME',
};

/**
 * Firebase JS SDK version, loaded from CDN as native ES modules.
 * Pinned deliberately: an unpinned CDN import is a build that can break
 * overnight without a single line of your code changing.
 */
export const FIREBASE_SDK_VERSION = '10.12.2';

export const FIREBASE_CDN = Object.freeze({
  app:      `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`,
  auth:     `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`,
  database: `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-database.js`,
});

/**
 * Guard used by firebase/init.js. Rather than failing with an opaque SDK
 * error, the app shows a setup screen pointing at the README.
 *
 * @returns {boolean} true when the config still holds placeholder values.
 */
export function isPlaceholderConfig() {
  return !IS_CONFIGURED
    || Object.values(firebaseConfig).some((v) => String(v).includes('REPLACE_ME'));
}

/**
 * Demo mode activates when Firebase is not configured. Instead of showing
 * a setup error, the app runs fully with realistic mock data — every page
 * renders and every interaction works. A visible banner tells the user
 * they're in demo mode.
 *
 * @returns {boolean}
 */
export function isDemoMode() {
  return isPlaceholderConfig();
}
