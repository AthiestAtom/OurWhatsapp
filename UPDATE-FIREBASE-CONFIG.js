// REPLACE THIS in src/services/firebasePhoneService.js

const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY_HERE",
  authDomain: "your-project.firebaseapp.com", 
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "PASTE_YOUR_SENDER_ID_HERE",
  appId: "PASTE_YOUR_APP_ID_HERE"
};

// EXAMPLE of what your Firebase config will look like:
/*
const firebaseConfig = {
  apiKey: "AIzaSyBkK8mP4vR8nL2qX5wF3hJ6kZ9sN8bR2mP4vR8nL2qX5wF3hJ",
  authDomain: "ourwhatsapp-12345.firebaseapp.com",
  projectId: "ourwhatsapp-12345", 
  storageBucket: "ourwhatsapp-12345.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456789"
};
*/

module.exports = firebaseConfig;
