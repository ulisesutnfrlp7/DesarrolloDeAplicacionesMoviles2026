// Import the functions you need from the SDKs you need
import { getAnalytics } from "firebase/analytics";
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAEtocony1PLQHFCUj2JQNA1dBbdQ0EOLU",
  authDomain: "odb-cvg.firebaseapp.com",
  projectId: "odb-cvg",
  storageBucket: "odb-cvg.firebasestorage.app",
  messagingSenderId: "49861772283",
  appId: "1:49861772283:web:f2a098c298c9deb681415e",
  measurementId: "G-GZGT68JDGR",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
