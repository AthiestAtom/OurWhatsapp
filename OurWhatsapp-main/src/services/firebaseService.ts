import firebase from 'firebase/app';
import 'firebase/auth';

// Firebase configuration - FREE tier
const firebaseConfig = {
  apiKey: "your_api_key_here",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();

interface VerificationResult {
  success: boolean;
  verificationId?: string;
  error?: string;
}

class FirebasePhoneService {
  // Send verification code (FREE)
  async sendVerificationCode(phoneNumber: string): Promise<VerificationResult> {
    try {
      const recaptchaContainer = document.createElement('div');
      recaptchaContainer.id = 'recaptcha-container';
      document.body.appendChild(recaptchaContainer);

      const applicationVerifier = new firebase.auth.RecaptchaVerifier(
        'recaptcha-container',
        {
          size: 'invisible',
          callback: () => {
            // reCAPTCHA solved, allow signInWithPhoneNumber.
          }
        }
      );

      const confirmationResult = await auth.signInWithPhoneNumber(
        phoneNumber,
        applicationVerifier
      );

      // Store verification ID for later use
      localStorage.setItem('phoneVerificationId', confirmationResult.verificationId);
      
      console.log(`✅ Verification code sent to ${phoneNumber}`);
      
      return {
        success: true,
        verificationId: confirmationResult.verificationId
      };
    } catch (error) {
      console.error('❌ Failed to send verification code:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Verify code and create user (FREE)
  async verifyCode(verificationCode: string): Promise<VerificationResult> {
    try {
      const verificationId = localStorage.getItem('phoneVerificationId');
      
      if (!verificationId) {
        return {
          success: false,
          error: 'No verification session found. Please request a new code.'
        };
      }

      const credential = firebase.auth.PhoneAuthProvider.credential(
        verificationId,
        verificationCode
      );

      const userCredential = await auth.signInWithCredential(credential);
      
      console.log(`✅ Phone verified for user: ${userCredential.user.phoneNumber}`);
      
      return {
        success: true
      };
    } catch (error) {
      console.error('❌ Failed to verify code:', error);
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
    localStorage.removeItem('phoneVerificationId');
  }
}

export const firebasePhoneService = new FirebasePhoneService();
