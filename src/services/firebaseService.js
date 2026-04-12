// Firebase Phone Service - Production SMS via Firebase
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPhoneNumber, PhoneAuthProvider, RecaptchaVerifier } from 'firebase/auth';

// Firebase configuration - Production environment variables with fallback
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "YOUR_FIREBASE_API_KEY",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "ourwhatsapp-44d4b.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "ourwhatsapp-44d4b",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "ourwhatsapp-44d4b.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "948081964448",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:948081964448:web:70fd4341d18f80f703e0c5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

class FirebasePhoneService {
  constructor() {
    this.verificationId = null;
    this.recaptchaVerifier = null;
  }

  // Initialize reCAPTCHA
  initializeRecaptcha(containerId) {
    try {
      this.recaptchaVerifier = new RecaptchaVerifier(containerId, {
        size: 'invisible',
        callback: (response) => {
          console.log('reCAPTCHA solved');
        }
      });
      return true;
    } catch (error) {
      console.error('reCAPTCHA initialization failed:', error);
      return false;
    }
  }

  // Send verification code via Firebase (REAL SMS in production)
  async sendVerificationCode(phoneNumber) {
    try {
      console.log(`Sending Firebase SMS to ${phoneNumber}...`);
      
      if (!this.recaptchaVerifier) {
        throw new Error('reCAPTCHA not initialized');
      }

      // Send verification code
      const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, this.recaptchaVerifier);
      
      // Store verification ID
      this.verificationId = confirmationResult.verificationId;
      
      console.log(`SUCCESS: Real SMS sent to ${phoneNumber}!`);
      console.log(`Check your phone for the verification code!`);
      
      return {
        success: true,
        verificationId: confirmationResult.verificationId,
        message: 'Verification code sent to your phone'
      };
    } catch (error) {
      console.error('Firebase SMS failed:', error);
      
      // Fallback to TextBelt for local development
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      
      try {
        const message = `Your OurWhatsApp verification code is: ${code}. Valid for 10 minutes.`;
        
        const response = await fetch('https://textbelt.com/text', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            phone: phoneNumber,
            message: message,
            key: 'textbelt'
          })
        });

        const data = await response.json();
        
        if (data.success) {
          console.log(`Fallback: SMS sent via TextBelt to ${phoneNumber}`);
          return {
            success: true,
            fallbackCode: code,
            message: 'SMS sent via TextBelt (Firebase unavailable)'
          };
        }
      } catch (fallbackError) {
        console.log('TextBelt also failed:', fallbackError);
      }
      
      // Final fallback to console
      console.log(`FALLBACK: Verification code for ${phoneNumber}: ${code}`);
      
      return {
        success: true,
        fallbackCode: code,
        error: 'Firebase unavailable - using console fallback'
      };
    }
  }

  // Verify code using Firebase
  async verifyCode(verificationCode) {
    try {
      if (!this.verificationId) {
        throw new Error('No verification session found');
      }

      const credential = PhoneAuthProvider.credential(
        this.verificationId,
        verificationCode
      );

      const userCredential = await signInWithCredential(auth, credential);
      
      console.log(`SUCCESS: Phone verified!`);
      console.log(`User: ${userCredential.user.phoneNumber}`);
      
      return {
        success: true,
        user: {
          uid: userCredential.user.uid,
          phoneNumber: userCredential.user.phoneNumber
        }
      };
    } catch (error) {
      console.error('Verification failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get current user
  getCurrentUser() {
    return auth.currentUser;
  }

  // Sign out
  async signOut() {
    await auth.signOut();
    this.verificationId = null;
  }
}

export const firebasePhoneService = new FirebasePhoneService();
