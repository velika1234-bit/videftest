// ============================================
// Firebase конфигурация и инициализация
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

const firebaseConfig = {
    apiKey: "AIzaSyA0WhbnxygznaGCcdxLBHweZZThezUO314",
    authDomain: "videoquiz-ultimate.firebaseapp.com",
    projectId: "videoquiz-ultimate",
    storageBucket: "videoquiz-ultimate.firebasestorage.app",
    messagingSenderId: "793138692820",
    appId: "1:793138692820:web:8ee2418d28d47fca6bf141"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, 'us-central1');

// --- Идентификатори на приложението ---
export const finalAppId = 'videoquiz-ultimate-live';
export const legacyAppId = 'videoquiz-ultimate';

// --- Помощни функции за пътища във Firestore ---

// За соло резултати на учител
export const getTeacherSoloResultsCollection = (teacherId) => 
    collection(db, 'artifacts', finalAppId, 'users', teacherId, 'solo_results');

// За колекция с уроци на учител (може да се подаде appId за съвместимост)
export const getTeacherQuizzesCollection = (teacherId, appId = finalAppId) => 
    collection(db, 'artifacts', appId, 'users', teacherId, 'my_quizzes');

// За сесия (основен документ)
export const getSessionRefById = (id) => 
    doc(db, 'artifacts', finalAppId, 'public', 'data', 'sessions', id);

// За участници в сесия (нов път)
export const getParticipantsCollection = (id) => 
    collection(db, 'artifacts', finalAppId, 'public', 'data', 'sessions', id, 'participants');

export const getParticipantRef = (sessionId, participantId) => 
    doc(db, 'artifacts', finalAppId, 'public', 'data', 'sessions', sessionId, 'participants', participantId);

// За legacy участници (стар път)
export const getLegacyParticipantsCollection = () => 
    collection(db, 'artifacts', finalAppId, 'public', 'data', 'participants');

export const getLegacyParticipantRef = (participantId) => 
    doc(db, 'artifacts', finalAppId, 'public', 'data', 'participants', participantId);

// --- Универсална функция за достъп до участник (избира нов или стар път според режима) ---
// Забележка: participantStorageMode идва от app.js (глобално състояние)
export const getActiveParticipantRef = (sessionId, participantId, participantStorageMode) => 
    participantStorageMode === 'legacy' 
        ? getLegacyParticipantRef(participantId) 
        : getParticipantRef(sessionId, participantId);
