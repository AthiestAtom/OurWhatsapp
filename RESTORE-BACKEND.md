# Backend Restoration Guide

## What Was Removed
- `.env.cloud` file (contained backend configuration)
- Hardcoded Firebase API key (security issue)

## How to Restore Backend Functionality

### 1. Backend Configuration
Copy `backend.env.example` to `.env` and update with your actual values:
```bash
cp backend.env.example .env
```

Update with your actual values:
- MongoDB Atlas URI from: https://cloud.mongodb.com/
- Redis URL from: https://redis.com/
- Generate new JWT secrets
- Generate new encryption key

### 2. Frontend Configuration
Copy `frontend.env.example` to `.env` and update with your actual values:
```bash
cp frontend.env.example .env
```

Update with your actual Firebase values from Firebase Console:
- Go to: https://console.firebase.google.com/
- Select your project: `ourwhatsapp-44d4b`
- Get API keys from Project Settings

### 3. Firebase Production Setup
Add these secrets to GitHub repository:
- REACT_APP_FIREBASE_API_KEY
- REACT_APP_FIREBASE_AUTH_DOMAIN
- REACT_APP_FIREBASE_PROJECT_ID
- REACT_APP_FIREBASE_STORAGE_BUCKET
- REACT_APP_FIREBASE_MESSAGING_SENDER_ID
- REACT_APP_FIREBASE_APP_ID

### 4. Start Backend Server
```bash
npm install
npm run dev
```

### 5. Start Frontend
```bash
cd frontend
npm install
npm start
```

## Security Notes
- Never commit actual `.env` files
- Use GitHub secrets for production
- Keep Firebase keys secure
- Use strong JWT secrets
