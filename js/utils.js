// ============================================
// VideoQuiz Ultimate - Helper функции
// ============================================

// --- Време и дата ---
export const formatTime = (s) => {
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    return `${m < 10 ? '0' + m : m}:${r < 10 ? '0' + r : r}`;
};

export const formatDate = (timestamp) => {
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

// --- Резултати и точки ---
export const parseScoreValue = (scoreText) => {
    if (!scoreText) return { score: 0, total: 0 };
    const parts = String(scoreText).split('/').map(s => parseInt(s.trim(), 10));
    const score = Number.isFinite(parts[0]) ? parts[0] : 0;
    const total = Number.isFinite(parts[1]) ? parts[1] : 0;
    return { score, total };
};

// --- Кодове и аватари ---
export const decodeQuizCode = (code) => {
    if (!code) return null;
    try {
        const cleanCode = code.trim().replace(/\s/g, '');
        return JSON.parse(decodeURIComponent(escape(atob(cleanCode))));
    } catch (e) {
        try { return JSON.parse(atob(code.trim())); } catch(err) { return null; }
    }
};

export const AVATARS = ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🐤", "🦄", "🐝", "🦋", "🐌", "🐞", "🐙", "🐬"];

// --- Времева помощна ---
export { getTimestampMs };
