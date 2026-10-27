/* Eco Air Portal v2 settings.
 *
 * READ_ONLY
 *   true  = preview mode. The app reads your live data but every save, upload and delete is
 *           blocked before it reaches Firebase. Nothing in the current portal can change.
 *   false = the app saves to the same database the current portal uses.
 *   Turned off 2026-10-27: v2 saves to the live database alongside the current portal.
 *   Set back to true and redeploy to return to preview mode at any time.
 *
 * FIREBASE
 *   The same web config the current portal has baked in, so both apps share one database.
 */
window.EA_CONFIG = {
  READ_ONLY: false,

  FIREBASE: {
    apiKey: "AIzaSyDd96GHh5CP3SFyK5mjyhn_7XdPqV1h2AI",
    authDomain: "ecoair-portal.firebaseapp.com",
    projectId: "ecoair-portal",
    storageBucket: "ecoair-portal.firebasestorage.app",
    messagingSenderId: "935265305055",
    appId: "1:935265305055:web:b95ec5786c10f79d38046a",
    measurementId: "G-QFKHW9068T"
  },

  // Screens not rebuilt yet (branding, price rates, trash, merging builders) link here.
  LEGACY_PORTAL_URL: "https://eco-air-portal.vercel.app/"
};
