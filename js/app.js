import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot, serverTimestamp, updateDoc, deleteDoc, addDoc, query, where, limit, getDocs, collectionGroup } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyA0WhbnxygznaGCcdxLBHweZZThezUO314",
    authDomain: "videoquiz-ultimate.firebaseapp.com",
    projectId: "videoquiz-ultimate",
    storageBucket: "videoquiz-ultimate.firebasestorage.app",
    messagingSenderId: "793138692820",
    appId: "1:793138692820:web:8ee2418d28d47fca6bf141"
};

const finalAppId = 'videoquiz-ultimate-live';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- GLOBAL STATE ---
let user = null;
let lastAuthUid = null;
let isTeacher = false;
let editingQuizId = null;
let editingQuestionIndex = null;
const MASTER_TEACHER_CODE = "vilidaf76";

let player, solvePlayer, hostPlayer;
let questions = [], currentQuiz = null, studentNameValue = "";
let sessionID = "", liveActiveQIdx = -1;
let sessionDocId = "";
let lastAnsweredIdx = -1;
let currentVideoId = "";
let unsubscribes = [];
let activeIntervals = [];
let liveScore = 0;
let scoreCount = 0, currentQIndex = -1;
let lastFetchedParticipants = [];
let soloResults = [];
let myQuizzes = [];
let isYTReady = false;
let authMode = 'login';
let soloGameFinished = false;
let currentQuizOwnerId = null;
let currentParticipantRef = null;
let participantStorageMode = 'legacy';
let rulesModalShown = false;
let sopModeEnabled = false;
let isDiscussionMode = false;

// Helper to get consistent paths
const getTeacherSoloResultsCollection = (teacherId) => collection(db, 'artifacts', finalAppId, 'users', teacherId, 'solo_results');
const getSessionRefById = (id) => doc(db, 'artifacts', finalAppId, 'public', 'data', 'sessions', id);
const getParticipantsCollection = (id) => collection(db, 'artifacts', finalAppId, 'public', 'data', 'sessions', id, 'participants');
const getParticipantRef = (sessionId, participantId) => doc(db, 'artifacts', finalAppId, 'public', 'data', 'sessions', sessionId, 'participants', participantId);
const getLegacyParticipantsCollection = () => collection(db, 'artifacts', finalAppId, 'public', 'data', 'participants');
const getLegacyParticipantRef = (participantId) => doc(db, 'artifacts', finalAppId, 'public', 'data', 'participants', participantId);
const getActiveParticipantRef = (sessionId, participantId) => participantStorageMode === 'legacy' ? getLegacyParticipantRef(participantId) : getParticipantRef(sessionId, participantId);

window.tempLiveSelection = null;

const AVATARS = ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🐤", "🦄", "🐝", "🦋", "🐌", "🐞", "🐙", "🐬"];

// --- SAFE DOM HELPERS ---
const safeSetText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
};

const safeSetHTML = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
};

// --- AUTH LOGIC ---
onAuthStateChanged(auth, async (u) => {
    const incomingUid = u?.uid || null;
    if (lastAuthUid !== incomingUid) {
        myQuizzes = [];
        soloResults = [];
        if (document.getElementById('my-quizzes-list')) renderMyQuizzes();
        if (document.getElementById('solo-results-body')) renderSoloResults();
    }
    lastAuthUid = incomingUid;
    user = u;
    document.getElementById('auth-loader')?.classList.add('hidden');

    if (user) {
        const isAnon = user.isAnonymous;
        const uidDisplay = isAnon ? `Анонимен (${user.uid.substring(0,5)}...)` : user.email;
        const debugUidEl = document.getElementById('debug-uid');
        if(debugUidEl) debugUidEl.innerText = uidDisplay;

        const profileRef = doc(db, 'artifacts', finalAppId, 'users', user.uid, 'settings', 'profile');
        try {
            const profileSnap = await getDoc(profileRef);
            if (profileSnap.exists() && profileSnap.data().role === 'teacher') {
                isTeacher = true;
                window.loadMyQuizzes();
                window.loadSoloResults();
                if (!document.getElementById('screen-welcome').classList.contains('hidden')) {
                    window.switchScreen('teacher-dashboard');
                }
            } else if (!isAnon) {
                window.switchScreen('welcome');
            }
        } catch (e) {
            console.error("Cloud Access Error:", e);
            if (e.code === 'permission-denied') window.showRulesHelpModal();
        }
    } else {
        window.switchScreen('welcome');
    }
});

const initAuth = async () => {
    await setPersistence(auth, browserLocalPersistence);

    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        try {
            await signInWithCustomToken(auth, __initial_auth_token);
        } catch (e) {
            if (e.code === 'auth/custom-token-mismatch') {
                console.warn("Служебният токен е игнориран (Private Config).");
            } else {
                console.error("Custom token auth failed", e);
            }
        }
    }
};

setTimeout(() => {
    const loader = document.getElementById('auth-loader');
    if (loader && !loader.classList.contains('hidden')) loader.classList.add('hidden');
}, 4000);

initAuth();

// --- HELPER FUNCTIONS ---
window.decodeQuizCode = (code) => {
    if (!code) return null;
    try {
        const cleanCode = code.trim().replace(/\s/g, '');
        return JSON.parse(decodeURIComponent(escape(atob(cleanCode))));
    } catch (e) {
        try { return JSON.parse(atob(code.trim())); } catch(err) { return null; }
    }
};

window.resolveTeacherUidFromCode = async (decoded) => {
    if (!decoded) return null;
    const explicitOwnerId = decoded.ownerId || decoded.teacherId || null;
    if (explicitOwnerId) return explicitOwnerId;
    const ownerEmail = (decoded.ownerEmailNormalized || decoded.ownerEmail || decoded.teacherEmail || '').trim().toLowerCase();
    if (!ownerEmail) return null;
    try {
        const normalizedQ = query(
            collectionGroup(db, 'profile'),
            where('role', '==', 'teacher'),
            where('emailNormalized', '==', ownerEmail)
        );
        const normalizedSnap = await getDocs(normalizedQ);
        if (normalizedSnap.size === 1) {
            return normalizedSnap.docs[0].ref.parent.parent?.id || null;
        }
        if (normalizedSnap.size > 1) {
            console.error('Ambiguous teacher match by emailNormalized:', ownerEmail);
            return null;
        }
        const fallbackQ = query(
            collectionGroup(db, 'profile'),
            where('role', '==', 'teacher'),
            where('email', '==', ownerEmail)
        );
        const fallbackSnap = await getDocs(fallbackQ);
        if (fallbackSnap.size === 1) {
            return fallbackSnap.docs[0].ref.parent.parent?.id || null;
        }
        if (fallbackSnap.size > 1) {
            console.error('Ambiguous teacher match by email:', ownerEmail);
            return null;
        }
    } catch (e) {
        console.error('Owner email lookup failed:', e);
    }
    return null;
};

window.formatTime = (s) => {
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    return `${m < 10 ? '0' + m : m}:${r < 10 ? '0' + r : r}`;
};

window.formatDate = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('bg-BG', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
};

const getTimestampMs = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
};

const parseScoreValue = (scoreText) => {
    if (!scoreText) return { score: 0, total: 0 };
    const parts = String(scoreText).split('/').map(s => parseInt(s.trim(), 10));
    const score = Number.isFinite(parts[0]) ? parts[0] : 0;
    const total = Number.isFinite(parts[1]) ? parts[1] : 0;
    return { score, total };
};

window.switchScreen = (name) => {
    document.querySelectorAll('#app > div').forEach(div => div.classList.add('hidden'));
    const target = document.getElementById('screen-' + name);
    if (target) target.classList.remove('hidden');

    if (player) { try { player.destroy(); } catch(e) {} player = null; }
    if (solvePlayer) { try { solvePlayer.destroy(); } catch(e) {} solvePlayer = null; }
    if (hostPlayer) { try { hostPlayer.destroy(); } catch(e) {} hostPlayer = null; }

    unsubscribes.forEach(unsub => unsub());
    unsubscribes = [];
    activeIntervals.forEach(i => clearInterval(i));
    activeIntervals = [];
    currentParticipantRef = null;

    if (name === 'teacher-dashboard' && user) {
        window.loadMyQuizzes();
        window.loadSoloResults();
    }
    if (window.lucide) lucide.createIcons();
    window.scrollTo(0, 0);
};

window.showMessage = (text, type = 'info') => {
    const container = document.getElementById('msg-container');
    if (!container) return;
    const msg = document.createElement('div');
    msg.className = `p-4 rounded-2xl shadow-2xl font-black text-white animate-pop mb-3 flex items-center gap-3 ${type === 'error' ? 'bg-rose-500' : 'bg-indigo-600'}`;
    msg.innerHTML = `<i data-lucide="${type === 'error' ? 'alert-circle' : 'info'}" class="w-5 h-5"></i><span>${text}</span>`;
    container.appendChild(msg);
    if (window.lucide) lucide.createIcons();
    setTimeout(() => {
        msg.classList.add('opacity-0');
        setTimeout(() => msg.remove(), 500);
    }, 4000);
};

window.quitHostSession = () => {
    if (confirm("Това ще прекъсне сесията и ще спре таймерите. Сигурни ли сте?")) {
        window.switchScreen('teacher-dashboard');
    }
};

// --- PERMISSION ERROR HANDLER ---
window.showRulesHelpModal = () => {
    if (rulesModalShown) return;
    rulesModalShown = true;
    document.getElementById('modal-rules-help').classList.remove('hidden');
    document.getElementById('modal-rules-help').classList.add('flex');
};

// --- AUTH HANDLERS ---
window.toggleAuthMode = () => {
    authMode = authMode === 'login' ? 'register' : 'login';
    const title = document.getElementById('auth-title');
    const btn = document.getElementById('auth-submit-btn');
    const toggleText = document.getElementById('auth-toggle-text');
    const codeField = document.getElementById('auth-teacher-code-container');

    if (authMode === 'register') {
        if (title) title.innerText = "Регистрация на Учител";
        if (btn) btn.innerText = "Регистрирай се";
        if (toggleText) toggleText.innerHTML = 'Вече имате акаунт? <span class="underline font-black cursor-pointer">Влезте тук</span>';
        codeField?.classList.remove('hidden');
    } else {
        if (title) title.innerText = "Вход за Учители";
        if (btn) btn.innerText = "Влез";
        if (toggleText) toggleText.innerHTML = 'Нямате акаунт? <span class="underline font-black cursor-pointer">Регистрирайте се</span>';
        codeField?.classList.add('hidden');
    }
};

window.handleAuthSubmit = async () => {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-password').value.trim();

    if (!email || !pass) return window.showMessage("Попълнете всички полета!", "error");
    if (pass.length < 6) return window.showMessage("Паролата трябва да е поне 6 символа.", "error");

    if (auth.currentUser && auth.currentUser.isAnonymous) {
        await signOut(auth);
    }

    window.showMessage("Обработка...", "info");

    try {
        if (authMode === 'register') {
            const code = document.getElementById('auth-teacher-code').value.trim();
            if (code !== MASTER_TEACHER_CODE) return window.showMessage("Грешен код за учител!", "error");

            try {
                const cred = await createUserWithEmailAndPassword(auth, email, pass);
                await setDoc(doc(db, 'artifacts', finalAppId, 'users', cred.user.uid, 'settings', 'profile'), {
                    role: 'teacher',
                    email: email,
                    emailNormalized: email.toLowerCase(),
                    activatedAt: serverTimestamp()
                });
                window.showMessage("Успешна регистрация!");
                window.switchScreen('teacher-dashboard');
            } catch (innerError) {
                if (innerError.code === 'auth/operation-not-allowed') {
                    console.warn("Email auth disabled, falling back to anonymous teacher profile.");
                    let anonUser = auth.currentUser;
                    if (!anonUser) {
                        const anonCred = await signInAnonymously(auth);
                        anonUser = anonCred.user;
                    }
                    await setDoc(doc(db, 'artifacts', finalAppId, 'users', anonUser.uid, 'settings', 'profile'), {
                        role: 'teacher',
                        email: email + " (Guest)",
                        emailNormalized: email.toLowerCase(),
                        activatedAt: serverTimestamp(),
                        isFallback: true
                    });
                    window.showMessage("Режим 'Гост-Учител' (Операцията не е позволена, проверете Settings).", "info");
                    window.switchScreen('teacher-dashboard');
                } else if (innerError.code === 'permission-denied') {
                    window.showRulesHelpModal();
                } else {
                    throw innerError;
                }
            }
        } else {
            try {
                await signInWithEmailAndPassword(auth, email, pass);
                window.showMessage("Добре дошли отново!");
                window.switchScreen('teacher-dashboard');
            } catch (innerError) {
                if (innerError.code === 'auth/operation-not-allowed') {
                    window.showMessage("Грешка в конфигурацията на Firebase (Auth not allowed).", "error");
                } else if (innerError.code === 'permission-denied') {
                    window.showRulesHelpModal();
                } else {
                    throw innerError;
                }
            }
        }
    } catch (error) {
        console.error(error);
        if (error.code === 'auth/email-already-in-use') window.showMessage("Този имейл вече се използва.", "error");
        else window.showMessage("Грешка при вход: " + error.message, "error");
    }
};

window.handleLogout = async () => {
    await signOut(auth);
    window.myQuizzes = [];
    soloResults = [];
    window.showMessage("Излязохте успешно. Презареждане...");
    setTimeout(() => {
        location.reload();
    }, 1000);
};

// --- IMPORT / EXPORT LOGIC ---
window.openImportModal = () => {
    document.getElementById('import-code-input').value = "";
    document.getElementById('modal-import').classList.remove('hidden');
    document.getElementById('modal-import').classList.add('flex');
};

window.submitImport = () => {
    const code = document.getElementById('import-code-input').value;
    if (!code) return window.showMessage("Моля поставете код.", "error");

    const decoded = window.decodeQuizCode(code);
    if (!decoded || (!decoded.v || (!decoded.q && !decoded.questions))) {
        return window.showMessage("Кодът е невалиден.", "error");
    }

    const quizData = {
        title: decoded.title || "Без име",
        v: decoded.v,
        q: decoded.q || decoded.questions || []
    };

    window.saveImportedQuiz(quizData);
    document.getElementById('modal-import').classList.add('hidden');
};

window.saveImportedQuiz = async (data) => {
    if (!user) return;
    window.showMessage("Импортиране...");
    try {
        await addDoc(collection(db, 'artifacts', finalAppId, 'users', user.uid, 'my_quizzes'), {
            title: data.title + " (Импортиран)", v: data.v, questions: data.q, createdAt: serverTimestamp()
        });
        window.showMessage("Урокът е добавен!", "info");
    } catch (e) {
        if (e.code === 'permission-denied') window.showRulesHelpModal();
        else window.showMessage("Грешка при импорт!", "error");
    }
};

// --- FIREBASE DATA OPS ---
window.loadMyQuizzes = async () => {
    if (!user) return;
    const q = collection(db, 'artifacts', finalAppId, 'users', user.uid, 'my_quizzes');
    const unsub = onSnapshot(q, (snap) => {
        myQuizzes = snap.docs.map(d => ({...d.data(), id: d.id}));
        renderMyQuizzes();
    }, (error) => {
        console.error("My quizzes error:", error);
        if (error.code === 'permission-denied') window.showRulesHelpModal();
    });
    unsubscribes.push(unsub);
};

window.loadSoloResults = async () => {
    if (!user) return;
    soloResults = [];
    renderSoloResults();
    const q = getTeacherSoloResultsCollection(user.uid);
    const unsub = onSnapshot(q, (snap) => {
        soloResults = snap.docs.map(d => ({...d.data(), id: d.id}));
        renderSoloResults();
    }, (error) => {
        console.error("Solo results error:", error);
        if (error.code === 'permission-denied') window.showRulesHelpModal();
        soloResults = [];
        renderSoloResults();
    });
    unsubscribes.push(unsub);
};

window.deleteSoloResult = async (id) => {
    if (!user) return;
    if (confirm("Сигурни ли сте, че искате да изтриете този запис?")) {
        try {
            await deleteDoc(doc(getTeacherSoloResultsCollection(user.uid), id));
            window.showMessage("Записът е изтрит.", "info");
        } catch (e) {
            console.error(e);
            if (e.code === 'permission-denied') window.showRulesHelpModal();
            else window.showMessage("Грешка при изтриване.", "error");
        }
    }
};

function renderMyQuizzes() {
    const container = document.getElementById('my-quizzes-list');
    if (!container) return;
    container.innerHTML = myQuizzes.map(q => `
        <div class="bg-white p-5 rounded-[1.5rem] border shadow-sm flex flex-col sm:flex-row justify-between items-center hover:border-indigo-600 transition-all gap-4">
            <div class="truncate flex-1 w-full text-center sm:text-left">
                <h4 class="font-black text-slate-800 truncate pr-4 text-base sm:text-lg">${q.title}</h4>
                <p class="text-[10px] text-slate-400 font-black uppercase tracking-widest">${q.questions?.length || 0} въпроса</p>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="window.startHostFromLibrary('${q.id}')" title="Старт на живо" class="p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"><i data-lucide="play" class="w-4 h-4 sm:w-5 sm:h-5"></i></button>
                <button onclick="window.editQuiz('${q.id}')" title="Редактирай" class="p-3 bg-white text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all border-2 border-indigo-100"><i data-lucide="pencil" class="w-4 h-4 sm:w-5 sm:h-5"></i></button>
                <button onclick="window.showShareCode('${q.id}')" title="Вземи код" class="p-3 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-600 hover:text-white transition-all"><i data-lucide="link" class="w-4 h-4 sm:w-5 sm:h-5"></i></button>
                <button onclick="window.deleteQuiz('${q.id}')" title="Изтрий" class="p-3 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all"><i data-lucide="trash-2" class="w-4 h-4 sm:w-5 sm:h-5"></i></button>
            </div>
        </div>
    `).join('') || '<div class="col-span-full text-center py-10 opacity-30 italic">Библиотеката е празна.</div>';
    if (window.lucide) lucide.createIcons();
}

function renderSoloResults() {
    const body = document.getElementById('solo-results-body');
    if (!body) return;

    const sortedResults = [...soloResults].sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));
    const summaryEl = document.getElementById('solo-results-summary');
    if (summaryEl) {
        const totalAttempts = sortedResults.length;
        const totals = sortedResults.reduce((acc, r) => {
            const parsed = parseScoreValue(r.score);
            acc.score += parsed.score;
            acc.total += parsed.total;
            return acc;
        }, { score: 0, total: 0 });
        const pct = totals.total > 0 ? Math.round((totals.score / totals.total) * 100) : 0;
        summaryEl.innerText = totalAttempts > 0
            ? `Опити: ${totalAttempts} • Среден успех: ${pct}% (${totals.score}/${totals.total})`
            : 'Все още няма резултати за този профил.';
    }

    body.innerHTML = sortedResults.map(r => `
        <tr class="border-b text-[10px] sm:text-xs hover:bg-slate-50">
            <td class="py-3 px-4 font-black text-slate-700">${r.studentName}</td>
            <td class="py-3 px-4 text-slate-500 truncate max-w-[120px]">${r.quizTitle}</td>
            <td class="py-3 px-4 text-slate-400 font-mono">${window.formatDate(r.timestamp)}</td>
            <td class="py-3 px-4 text-right"><span class="bg-indigo-100 text-indigo-600 px-2 py-1 rounded-lg font-black">${r.score}</span></td>
            <td class="py-3 px-4 text-center">
                <button onclick="window.deleteSoloResult('${r.id}')" class="text-rose-400 hover:text-rose-600 p-2 rounded-lg hover:bg-rose-50 transition-all" title="Изтрий резултат">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="5" class="py-6 text-center text-slate-300 italic">Няма данни</td></tr>';
    if (window.lucide) lucide.createIcons();
}

// --- LIVE HOST LOGIC ---
window.startHostFromLibrary = async (id) => {
    const quiz = myQuizzes.find(q => q.id === id);
    if (!quiz) return window.showMessage("Грешка при зареждане на урока.", "error");
    currentQuiz = { v: quiz.v, q: quiz.questions, title: quiz.title };
    currentQuizOwnerId = user?.uid || null;
    await window.openLiveHost();
};

const generateNumericPin = (length = 3) => {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return Math.floor(min + Math.random() * (max - min + 1)).toString();
};

const createUniqueSessionPin = async () => {
    for (let i = 0; i < 20; i++) {
        const candidate = i < 15 ? generateNumericPin(3) : generateNumericPin(4);
        const existingSnap = await getDoc(getSessionRefById(candidate));
        if (!existingSnap.exists()) return candidate;
    }
    return generateNumericPin(4);
};

window.openLiveHost = async () => {
    if (!user) return;
    sessionID = await createUniqueSessionPin();
    sessionDocId = sessionID;
    window.switchScreen('live-host');
    document.getElementById('host-pin').innerText = sessionID;

    const totalPoints = currentQuiz.q.reduce((a, q) => a + (q.points || 1), 0);

    try {
        await setDoc(getSessionRefById(sessionDocId), {
            activeQ: -1, status: 'waiting', hostId: user.uid, pin: sessionID, timestamp: serverTimestamp(),
            totalPoints: totalPoints
        });
    } catch(e) {
        console.error(e);
        if(e.code === 'permission-denied') window.showRulesHelpModal();
    }

    participantStorageMode = 'session';
    let sessionParticipants = [];
    let legacyParticipants = [];

    const mergeAndRenderParticipants = () => {
        const map = new Map();
        sessionParticipants.forEach((part) => {
            map.set(part.id, { ...part, _source: 'session' });
        });
        legacyParticipants.forEach((part) => {
            if (!map.has(part.id)) map.set(part.id, { ...part, _source: 'legacy' });
        });
        lastFetchedParticipants = Array.from(map.values());
        renderHostDashboard();
    };

    const unsubSession = onSnapshot(getParticipantsCollection(sessionDocId), (snap) => {
        sessionParticipants = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        mergeAndRenderParticipants();
    }, (error) => {
        console.error('Session participants snapshot error:', error);
        if (error.code === 'permission-denied') window.showRulesHelpModal();
    });

    const unsubLegacy = onSnapshot(getLegacyParticipantsCollection(), (snap) => {
        legacyParticipants = snap.docs
            .map(d => ({ ...d.data(), id: d.id }))
            .filter(p => p.sessionId === sessionID);
        mergeAndRenderParticipants();
    }, (error) => {
        console.error('Legacy participants snapshot error:', error);
        if (error.code === 'permission-denied') window.showRulesHelpModal();
    });

    unsubscribes.push(unsubSession, unsubLegacy);
};

window.initHostPlayer = () => {
    if (!window.YT || !window.YT.Player) {
        window.showMessage("Изчакайте YouTube API...", "error");
        setTimeout(window.initHostPlayer, 1000);
        return;
    }

    document.getElementById('host-video-container').innerHTML = '<div id="host-video"></div>';
    hostPlayer = new YT.Player('host-video', {
        videoId: currentQuiz.v,
        playerVars: { 'autoplay': 1, 'modestbranding': 1, 'rel': 0, 'playsinline': 1 },
        events: {
            'onReady': (event) => event.target.playVideo(),
            'onStateChange': async (e) => {
                if (e.data === YT.PlayerState.PLAYING) {
                    const i = setInterval(async () => {
                        if (!hostPlayer?.getCurrentTime) return;
                        const cur = Math.floor(hostPlayer.getCurrentTime());
                        document.getElementById('host-timer').innerText = window.formatTime(cur);
                        const qIdx = currentQuiz.q.findIndex(q => Math.abs(q.time - cur) <= 1);
                        if (qIdx !== -1 && qIdx !== liveActiveQIdx) {
                            liveActiveQIdx = qIdx;
                            hostPlayer.pauseVideo();
                            await updateDoc(getSessionRefById(sessionDocId), {
                                activeQ: qIdx, qData: JSON.parse(JSON.stringify(currentQuiz.q[qIdx])), status: 'active', qStartedAt: serverTimestamp()
                            });
                        }
                    }, 1000);
                    activeIntervals.push(i);
                }
            }
        }
    });
    document.getElementById('host-setup-area').classList.add('hidden');
    document.getElementById('host-player-area').classList.remove('hidden');
};

window.deleteParticipant = async (id) => {
    if (!confirm("Сигурни ли сте, че искате да премахнете този участник?")) return;
    try {
        await Promise.allSettled([
            deleteDoc(getParticipantRef(sessionDocId, id)),
            deleteDoc(getLegacyParticipantRef(id))
        ]);
        window.showMessage("Участникът е премахнат.", "info");
    } catch (e) {
        console.error(e);
        if(e.code === 'permission-denied') window.showRulesHelpModal();
        else window.showMessage("Грешка при изтриване.", "error");
    }
};

function renderHostDashboard() {
    const participantsCount = lastFetchedParticipants.length;
    const countEl = document.getElementById('host-participant-count');
    if (countEl) countEl.innerText = participantsCount;

    const quizQuestions = currentQuiz?.q || [];
    const totalMax = quizQuestions.reduce((a, b) => a + (b.points || 1), 0);

    let totalAnswers = 0;
    let totalCorrect = 0;

    lastFetchedParticipants.forEach(p => {
        const answersObj = p.answers || {};
        const values = Object.values(answersObj);
        totalAnswers += values.length;
        totalCorrect += values.filter(a => a === true).length;
    });

    const progressBar = document.getElementById('class-progress-bar');
    const progressCorrect = document.getElementById('progress-correct');
    const progressWrong = document.getElementById('progress-wrong');
    const progressStatsText = document.getElementById('progress-stats-text');
    const progressPercent = document.getElementById('progress-percent');

    if (progressBar) {
        const correctPct = totalAnswers > 0 ? (totalCorrect / totalAnswers) * 100 : 0;
        const wrongPct = totalAnswers > 0 ? 100 - correctPct : 0;
        if (progressCorrect) progressCorrect.style.width = correctPct + '%';
        if (progressWrong) progressWrong.style.width = wrongPct + '%';

        if (progressStatsText) {
            progressStatsText.innerText = totalAnswers > 0
                ? `В: ${totalCorrect} (${Math.round(correctPct)}%) / Г: ${totalAnswers - totalCorrect} (${Math.round(wrongPct)}%) / П: ${Math.max(0, (participantsCount * quizQuestions.length) - totalAnswers)}`
                : 'Очакват се отговори...';
        }
        if (progressPercent) progressPercent.innerText = Math.round(correctPct) + '%';
        progressBar.classList.remove('opacity-0');
    }

    let fastestOverallMs = null;
    let fastestOverallName = null;
    lastFetchedParticipants.forEach((p) => {
       
