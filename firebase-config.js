// Firebase Phone Authentication Setup - FREE
// This will send real SMS verification codes to your phone

// 1. Go to https://console.firebase.google.com
// 2. Create a new project (or use existing)
// 3. Enable Authentication → Phone Sign-in
// 4. Get your config below

const firebaseConfig = {
  apiKey: "AIzaSyDemoKey-ReplaceWithYours",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

// Instructions to get your FREE Firebase config:
/*
1. Visit: https://console.firebase.google.com
2. Click "Add project" → Give it a name
3. Click "Authentication" → "Get started"
4. Enable "Phone" sign-in method
5. Click "Web" icon (</>) to add web app
6. Copy the firebaseConfig object
7. Replace the values above with your actual config
8. Restart the backend

Benefits:
✅ 100% FREE phone verification
✅ No daily limits
✅ Professional like WhatsApp
✅ Works globally
✅ Reliable infrastructure
*/

module.exports = firebaseConfig;
