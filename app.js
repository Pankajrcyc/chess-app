// UI / game state / membership wiring.
const C = window.Chess;

const UNICODE = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

const DIFF_LABELS = {
  worst: 'New to Chess', newbie: 'New to Chess',
  beginner: 'Beginner', 'very-easy': 'Very Easy', easy: 'Easy',
  intermediate: 'Intermediate', advanced: 'Advanced', master: 'Master',
  stockfish: 'Stockfish (3000)',
};

// --- App state ---
const game = {
  state: null,
  mode: null,            // 'friends' | 'ai'
  difficulty: null,
  humanColor: 'w',       // in AI mode, the color the human plays
  selected: null,        // selected square index
  legalForSel: [],
  flipped: false,        // board orientation
  lastMove: null,        // { from, to }
  capturedByWhite: [],   // black pieces white captured
  capturedByBlack: [],
  history: [],           // SAN strings
  stateHistory: [],      // state before each ply (index 0 = initial)
  moveHistory: [],       // move objects played
  classifications: [],   // per-ply classification key, or null
  reviewing: false,
  reviewCancel: false,
  over: false,
  pendingPromo: null,    // { from, to }
  aiThinking: false,
  gen: 0,                // bumped each new game; guards stale async callbacks
  saved: false,          // has this game been written to "My games"
  replaying: false,      // true while loading a saved game into the analyzer
  viewIndex: null,       // null = live position; else a stateHistory index we're viewing
  botName: null,         // when playing a character bot, its display name
  botRating: null,       // that bot's rating (for the Elo update)
  botEngine: false,      // engine bot: move with real Stockfish instead of the built-in AI
  botElo: null,          // Elo cap for the engine bot (Stockfish UCI_Elo)
  ratingApplied: false,  // guard so a game only changes your rating once
  onlineOpponent: null,  // name of the live opponent in an online game
  applyingRemote: false, // true while applying an opponent's move (so we don't echo it back)
  premove: null,         // { from, to } queued during the opponent's turn
  premoveSel: null,      // square index chosen for the first half of a premove
};
// Opponent config set by a picker just before startGame() (bot or engine).
let pendingBot = null;

// The position currently shown on the board: a past one if we're "viewing", else live.
function displayState() {
  if (game.viewIndex != null && game.stateHistory[game.viewIndex]) {
    return game.stateHistory[game.viewIndex];
  }
  return game.state;
}
function isViewingHistory() { return game.viewIndex != null; }

// Move classification categories (chess.com-style + custom Legendary / Shame).
const MARKS = {
  legendary: { label: 'Legendary', sym: '!!!', cls: 'm-legendary' },
  brilliant: { label: 'Brilliant', sym: '!!', cls: 'm-brilliant' },
  great:     { label: 'Great',     sym: '!',  cls: 'm-great' },
  best:      { label: 'Best',      sym: '★',  cls: 'm-best' },
  forced:    { label: 'Forced',    sym: '+',  cls: 'm-forced' }, // only one legal move — no choice
  excellent: { label: 'Very Good', sym: '\u{1F44D}', cls: 'm-excellent' }, // 👍 nearly the best move (key stays 'excellent')
  book:      { label: 'Book',      sym: '\u{1F4D6}', cls: 'm-book' },
  good:      { label: 'Good',      sym: '✓',  cls: 'm-good' },
  okay:      { label: 'Okay',      sym: '\u{1F642}', cls: 'm-okay' }, // 🙂 a fine, unremarkable move
  chaos:     { label: 'Chaos', sym: '?!?', cls: 'm-chaos' }, // a crazy, wild move that keeps it even
  interesting: { label: 'Interesting', sym: '!?', cls: 'm-interesting' }, // fun but slightly inaccurate
  dubious:   { label: 'Inaccuracy', sym: '?!', cls: 'm-dubious' }, // "Inaccuracy" (key stays 'dubious')
  mistake:   { label: 'Mistake',   sym: '?',  cls: 'm-mistake' },
  miss:      { label: 'Miss',      sym: '✗', cls: 'm-miss' }, // ✗ missed a winning chance
  blunder:   { label: 'Blunder',   sym: '??', cls: 'm-blunder' },
  shame:     { label: 'Fatal Blunder', sym: '???', cls: 'm-shame' }, // renamed from "Shame" (key stays 'shame')
};
const MARK_ORDER = ['legendary', 'brilliant', 'great', 'best', 'excellent', 'good', 'okay', 'book', 'forced', 'chaos', 'interesting', 'dubious', 'mistake', 'miss', 'blunder', 'shame'];

// Small opening book (SAN sequences) used to tag early "Book" moves.
const OPENING_BOOK = [
  'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O',
  'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6',
  'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5',
  'e4 e5 Nf3 Nc6 d4 exd4 Nxd4',
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3',
  'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4',
  'e4 c5 Nc3 Nc6 g3',
  'e4 e6 d4 d5 Nc3 Nf6',
  'e4 e6 d4 d5 Nd2',
  'e4 c6 d4 d5 Nc3 dxe4 Nxe4',
  'e4 d5 exd5 Qxd5 Nc3',
  'e4 g6 d4 Bg7',
  'd4 d5 c4 e6 Nc3 Nf6',
  'd4 d5 c4 c6 Nf3 Nf6',
  'd4 d5 c4 dxc4 Nf3',
  'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6',
  'd4 Nf6 c4 g6 Nc3 d5',
  'd4 Nf6 c4 e6 Nc3 Bb4',
  'd4 Nf6 c4 e6 Nf3 b6',
  'Nf3 d5 g3 Nf6 Bg2',
  'c4 e5 Nc3 Nf6',
  'd4 d5 Nf3 Nf6 c4',
].map(line => line.split(' '));

// How White's very first move is graded — a fixed table the user chose.
// Book = a real, respected opening; Good = offbeat but okay; anything else → Dubious.
const BOOK_FIRST_MOVES = new Set(['d4', 'e4', 'c4', 'f4', 'Nf3', 'Nc3', 'b3', 'g3', 'g4', 'c3', 'd3', 'e3']);
const GOOD_FIRST_MOVES = new Set(['Nh3', 'Na3', 'a3', 'a4', 'h3', 'h4', 'b4']);

// Fixed grades for White's very first move.
const FM_BEST = new Set(['e4', 'd4', 'Nf3', 'Nc3', 'c4', 'f4', 'b4', 'g4']);
function classifyFirstMove(san) {
  const m = stripSan(san);
  if (FM_BEST.has(m)) return 'best';                 // e4 d4 Nf3 Nc3 c4 f4 b4 g4
  if (m === 'f3') return 'dubious';                   // f3 → Inaccuracy
  if (m === 'Na3' || m === 'Nh3') return 'good';      // Na3 Nh3 → Good
  if (m === 'a4' || m === 'h4') return 'okay';        // a4 h4 → Okay
  return 'excellent';                                 // everything else → Very Good
}

// Character bots (a Bronze perk): 60 bots, 10 per difficulty level, each with a
// rating. Beating higher-rated bots raises your own rating fastest.
const BOT_LEVELS = [
  // Worst Fish — the weakest bots of all (a play on "Stockfish"). Fixed tiny ratings;
  // they use the built-in engine at its easiest, since real Stockfish can't go this low.
  // Entry format: [name, icon, rating] (or a 4th flavor note).
  { diff: 'worst', label: 'New to Chess', bots: [
    ['Worst Fish', '\u{1F41F}', 0],
    ['Zach',   '\u{1F9D2}', 10],
    ['Polly',  '\u{1F99C}', 50],
    ['Martin', '\u{1F9D4}', 75],
    ['Tim',    '\u{1F476}', 175, 'son of Martin'],
    ['Jimmy',  '\u{1F9E2}', 200],
    ['Donald', '\u{1F986}', 225],
    ['Ronald', '\u{1F921}', 250],
    ['John',   '\u{1F3B8}', 275],
    ['Jack',   '\u{1F0CF}', 300] ] },
  { diff: 'beginner', base: 300, top: 460, bots: [
    ['Baby Byte', '\u{1F37C}'], ['Tiny Tim', '\u{1F423}'], ['Wobble', '\u{1F9F8}'], ['Doodle', '\u{1F58D}'], ['Pip', '\u{1F424}'],
    ['Mini Moo', '\u{1F42E}'], ['Bubbles', '\u{1FAE7}'], ['Sprout', '\u{1F331}'], ['Pebble', '\u{1FAA8}'], ['Newbie Nox', '\u{1F425}'] ] },
  { diff: 'very-easy', base: 500, top: 660, bots: [
    ['Sunny', '\u{1F31E}'], ['Clover', '\u{1F340}'], ['Mittens', '\u{1F431}'], ['Waffles', '\u{1F9C7}'], ['Choco', '\u{1F36B}'],
    ['Daisy', '\u{1F33C}'], ['Scout', '\u{1F436}'], ['Comet', '\u{2604}'], ['Biscuit', '\u{1F36A}'], ['Marble', '\u{1F3D0}'] ] },
  { diff: 'easy', base: 700, top: 920, bots: [
    ['Foxy', '\u{1F98A}'], ['Ziggy', '\u{26A1}'], ['Maple', '\u{1F341}'], ['Rusty', '\u{1F527}'], ['Pixel', '\u{1F47E}'],
    ['Jasper', '\u{1F48E}'], ['Olive', '\u{1FAD2}'], ['Turbo', '\u{1F3CE}'], ['Misty', '\u{1F32B}'], ['Bandit', '\u{1F99D}'] ] },
  { diff: 'intermediate', base: 1000, top: 1600, bots: [
    ['Vortex', '\u{1F300}'], ['Sable', '\u{1F408}'], ['Falcon', '\u{1F985}'], ['Onyx', '\u{26AB}'], ['Quill', '\u{1FAB6}'],
    ['Ranger', '\u{1F3AF}'], ['Nova', '\u{2728}'], ['Cipher', '\u{1F510}'], ['Talon', '\u{1F9A2}'], ['Echo', '\u{1F4E1}'] ] },
  { diff: 'advanced', base: 1650, top: 1900, bots: [
    ['Titan', '\u{1F6E1}'], ['Vega', '\u{2B50}'], ['Drake', '\u{1F409}'], ['Raven', '\u{1F426}'], ['Blitz', '\u{26A1}'],
    ['Specter', '\u{1F47B}'], ['Sentinel', '\u{1F5FF}'], ['Phoenix', '\u{1F525}'], ['Saber', '\u{2694}'], ['Hydra', '\u{1F40D}'] ] },
  { diff: 'master', base: 1950, top: 2150, bots: [
    ['Master Owl', '\u{1F989}'], ['Kingpin', '\u{1F451}'], ['Oracle', '\u{1F52E}'], ['Maestro', '\u{1F3BC}'], ['Iron Brain', '\u{1F9E0}'],
    ['Czar', '\u{2655}'], ['Zenith', '\u{1F3D4}'], ['Sphinx', '\u{1F981}'], ['Wizard', '\u{1F9D9}'], ['Immortal', '\u{1F480}'] ] },
  // Legendary Grandmasters — the all-time legends PLUS the highest-rated players,
  // powered by the REAL Stockfish engine at each one's real peak rating.
  // Entry format: [name, icon, rating, era]
  { diff: 'master', label: 'Grandmasters — Legends', title: 'GM', engine: true, base: 2500, top: 2890, bots: [
    ['Tal',        '\u{1F525}',  2705, '1960–61'],
    ['Karpov',     '\u{1F40D}',  2780, '1975–85'],
    ['Fischer',    '\u{2694}️',  2785, '1972–75'],
    ['Firouzja',   '\u{1F680}',  2804, '2020s'],
    ['Nakamura',   '\u{1F977}',  2816, '2010s–now'],
    ['Anand',      '\u{1F42F}',  2817, '2007–13'],
    ['Kramnik',    '\u{1F9F1}',  2818, '2000–07'],
    ['Caruana',    '\u{1F985}',  2844, '2014–now'],
    ['Kasparov',   '\u{1F451}',  2851, '1985–2000'],
    ['Magnus',     '\u{1F410}',  2890, '2013–23'] ] },
];

// Flatten into one list. Each level's 10 bots are spread evenly from base to top.
const BOTS = [];
BOT_LEVELS.forEach(lvl => {
  const n = lvl.bots.length;
  lvl.bots.forEach(([name, icon, fixedRating, era], i) => {
    // Most groups spread evenly from base to top; the GMs carry their own real rating.
    const rating = fixedRating != null ? fixedRating
      : Math.round(lvl.base + i * (lvl.top - lvl.base) / (n - 1));
    const bot = { name, icon, diff: lvl.diff, rating, groupLabel: lvl.label || DIFF_LABELS[lvl.diff] };
    if (era) bot.era = era;
    if (lvl.title) bot.title = lvl.title;
    if (lvl.engine) { bot.engine = true; bot.elo = Math.min(3190, rating); } // real Stockfish
    BOTS.push(bot);
  });
});

// The strongest bots earn real chess titles (rating ladder: CM < NM < FM < IM).
const BOT_TITLES = {
  Zenith:   { title: 'CM', rating: 2200 }, // Candidate Master
  Sphinx:   { title: 'NM', rating: 2250 }, // National Master
  Wizard:   { title: 'FM', rating: 2300 }, // FIDE Master
  Immortal: { title: 'IM', rating: 2400 }, // International Master
};
BOTS.forEach(b => {
  const t = BOT_TITLES[b.name];
  if (t) { b.title = t.title; b.rating = t.rating; }
});

// Each category's boss is powered by the real Stockfish engine, rated +10 above the
// strongest character in that category. Its engine strength is capped to that rating
// (Stockfish's floor is 1320 Elo, so the easy bosses still play around there).
const ENGINE_BOSSES = {
  beginner:     ['Cog', '⚙️'],
  'very-easy':  ['Sprocket', '\u{1F529}'],
  easy:         ['Gizmo', '\u{1F916}'],
  intermediate: ['Servo', '\u{1F9BE}'],
  advanced:     ['Cortex', '\u{1F5A5}️'],
  master:       ['Deep Engine', '\u{1F9E0}'],
};
// Engines live in the "Chess with AI" section, not in the Bots list. One per
// difficulty (built-in strength), rated +10 above that category's best CHARACTER
// bot (Grandmasters excluded), plus the real-Stockfish exception at ~3000.
const ENGINE_DIFFS = ['beginner', 'very-easy', 'easy', 'intermediate', 'advanced', 'master'];
const ENGINES = ENGINE_DIFFS.map(diff => {
  const chars = BOTS.filter(b => b.diff === diff && b.groupLabel !== 'Grandmasters — Legends');
  const maxR = Math.max(...chars.map(b => b.rating));
  const [name, icon] = ENGINE_BOSSES[diff];
  return { name, icon, diff, rating: maxR + 10, engine: false, elo: null }; // built-in
});
// The exception: the real Stockfish engine at FULL strength (no Elo cap). ~3500 is an
// honest figure for full-power Stockfish 16 — the strongest opponent Chesser has.
// Both play the SAME full-strength engine (so equally unbeatable in practice); the
// ratings are Chesser's own fantasy ladder numbers. The engine software is really
// Stockfish 16 (see the credit) — that fact stays honest; the ladder scores are fun.
ENGINES.push({ name: 'Stockfish', icon: '\u{1F41F}', diff: 'master', cat: 'GM', rating: 3000, engine: true, elo: null });
// Tom is NOT in the AI list — he lives only in Chat. You challenge him from the chat.
const TOM_ENGINE = { name: 'Tom', icon: '\u{1F988}', diff: 'master', cat: 'Gold', rating: 4000, engine: true, elo: null, note: "Tim's big brother" };
// Weakest AI of all — its own "New to Chess" tier (built-in engine), just above Jack (300).
ENGINES.unshift({ name: 'Fry', icon: '\u{1F420}', diff: 'newbie', cat: 'New to Chess', rating: 315, engine: false, elo: null });

const START_RATING = 800;

// ---- Puzzles: each is a MATE (any mating move solves it) or a TACTIC (play the one
// winning move). Grouped by difficulty: Easy / Normal / Hard. ----
// The full puzzle set lives in puzzles.js (loaded before this file) as window.PUZZLES.
const PUZZLES = window.PUZZLES || [];

// ---- Daily-limit tracking (per day, per user) ----
function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}
function dailyCounts() {
  const user = currentUser() || 'guest';
  try {
    const all = JSON.parse(localStorage.getItem('chessup_daily')) || {};
    const rec = all[user];
    if (!rec || rec.day !== todayKey()) return { puzzles: 0, packs: 0 };
    return { puzzles: rec.puzzles || 0, packs: rec.packs || 0 };
  } catch { return { puzzles: 0, packs: 0 }; }
}
function bumpDaily(kind) {
  const user = currentUser() || 'guest';
  let all = {};
  try { all = JSON.parse(localStorage.getItem('chessup_daily')) || {}; } catch { all = {}; }
  let rec = all[user];
  if (!rec || rec.day !== todayKey()) rec = { day: todayKey(), puzzles: 0, packs: 0 };
  rec[kind] = (rec[kind] || 0) + 1;
  all[user] = rec;
  localStorage.setItem('chessup_daily', JSON.stringify(all));
}
const FREE_PUZZLES_PER_DAY = 10;
const FREE_PACKS_PER_DAY = 2;

// ---- Daily streak (with "streak pauses" that auto-save a missed day) ----
function dayNumber() {
  const d = new Date();
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); // local day index
}
function loadStreak() {
  const u = currentUser() || 'guest';
  try { return (JSON.parse(localStorage.getItem('chessup_streak')) || {})[u] || null; }
  catch { return null; }
}
function saveStreak(s) {
  const u = currentUser() || 'guest';
  let all = {};
  try { all = JSON.parse(localStorage.getItem('chessup_streak')) || {}; } catch { all = {}; }
  all[u] = s;
  localStorage.setItem('chessup_streak', JSON.stringify(all));
}
// Call once when the app opens (and on sign-in). Returns { streak, pauses, event }.
function updateStreak() {
  const today = dayNumber();
  let s = loadStreak();
  let event = null;
  if (!s) {
    s = { lastDay: today, streak: 1, pauses: 1, awardedAt: 0, best: 1 }; // start with 1 pause
    saveStreak(s);
    return { ...s, event: 'start' };
  }
  if (s.lastDay === today) return { ...s, event: null }; // already counted today
  const gap = today - s.lastDay;
  if (gap === 1) {
    s.streak++;                                   // showed up the next day
  } else if (gap >= 2) {
    const missed = gap - 1;
    if ((s.pauses || 0) >= missed) {
      s.pauses -= missed; s.streak++; event = 'paused'; // pauses cover the gap
    } else {
      s.pauses = 0; s.streak++; event = null;             // never reset — the streak keeps going
    }
  }
  // Earn 2 pauses each new 10-day milestone.
  const newMilestones = Math.floor(s.streak / 10) - Math.floor((s.awardedAt || 0) / 10);
  if (newMilestones > 0) { s.pauses = (s.pauses || 0) + 2 * newMilestones; s.awardedAt = s.streak; if (!event) event = 'earned'; }
  s.best = Math.max(s.best || 0, s.streak);
  s.lastDay = today;
  saveStreak(s);
  return { ...s, event };
}
function renderStreakBanner(evt) {
  const el = document.getElementById('streak-banner');
  if (!el) return;
  const s = loadStreak();
  if (!s) { el.textContent = ''; el.classList.remove('show'); return; }
  const big = s.streak >= 1000;
  const note = evt === 'paused' ? ' · a pause saved your streak!'
    : evt === 'earned' ? ' · +2 pauses earned!'
    : evt === 'reset' ? ' · streak restarted'
    : big ? ' · 1000-day legend! 🏆' : '';
  el.innerHTML = `<span class="streak-fire">${big ? '🏆' : '🔥'}</span> ` +
    `<strong>${s.streak}</strong>-day streak <span class="streak-pauses">⏸ ${s.pauses || 0} pause${(s.pauses || 0) === 1 ? '' : 's'}</span>` +
    `<span class="streak-note">${note}</span>`;
  el.classList.toggle('streak-1000', big);
  el.classList.add('show');
}
function refreshStreak() { renderStreakBanner(updateStreak().event); if (typeof checkAchievements === 'function') checkAchievements(); }

// ============ Achievements ============
// 300 achievements across 50 topics (defined in achievements.js as window.ACH_TOPICS).
// Stats are counted globally (never tied to a login, so they don't reset on restart).
// Each of a topic's 6 tiers is worth stars when claimed: 1, 2, 3, 5, 10, 20.
const TIER_STARS = [1, 2, 3, 5, 10, 20];
const REWARD_STARS = 500;   // 🌟 Star Legend badge
const REWARD2_STARS = 1000; // 📦 3 packs a day
function hasStarBadge() { return !!localStorage.getItem('chesser_reward500'); }
function has3Packs() { return !!localStorage.getItem('chesser_reward1000'); }
// The earned badges shown up top (next to the sign-in / member chip).
function renderBadges() {
  const el = $('topbar-badges'); if (!el) return;
  el.innerHTML = hasStarBadge() ? '<span class="topbar-badge" title="Star Legend — earned at 500 stars">🌟 Star Legend</span>' : '';
}
// Grant the star-milestone rewards when the balance crosses 500 / 1000.
function checkStarRewards(before, after) {
  if (before < REWARD_STARS && after >= REWARD_STARS && !hasStarBadge()) {
    localStorage.setItem('chesser_reward500', '1');
    showAchToast({ icon: '🌟', name: 'Star Legend badge earned!', star: true });
    renderBadges();   // show the badge up top
  }
  if (before < REWARD2_STARS && after >= REWARD2_STARS && !has3Packs()) {
    localStorage.setItem('chesser_reward1000', '1');
    showAchToast({ icon: '📦', name: 'Reward: 3 packs a day!', star: true });
  }
}
const ACH_ALL = (window.ACH_TOPICS || []).flatMap(g =>
  g.a.map(([name, desc, stat, need], i) => ({ name, desc, stat, need, topic: g.t, icon: g.icon, ti: i, stars: TIER_STARS[i] || 1 })));
const ACH_BY_NAME = Object.fromEntries(ACH_ALL.map(a => [a.name, a]));
function getStats() { try { return JSON.parse(localStorage.getItem('chesser_stats')) || {}; } catch { return {}; } }
function saveStats(s) { localStorage.setItem('chesser_stats', JSON.stringify(s)); }
function loadAch() { try { return new Set(JSON.parse(localStorage.getItem('chesser_ach')) || []); } catch { return new Set(); } }
function saveAch(set) { localStorage.setItem('chesser_ach', JSON.stringify([...set])); }
// Claimed achievements (you press Claim to collect its stars).
function loadClaimed() { try { return new Set(JSON.parse(localStorage.getItem('chesser_claimed')) || []); } catch { return new Set(); } }
function saveClaimed(set) { localStorage.setItem('chesser_claimed', JSON.stringify([...set])); }
function starBalance() { const c = loadClaimed(); let s = 0; c.forEach(n => { if (ACH_BY_NAME[n]) s += ACH_BY_NAME[n].stars; }); return s; }
// Claim one achievement's stars (must be unlocked and not already claimed).
function claimAch(name) {
  const a = ACH_BY_NAME[name]; if (!a) return;
  if (!loadAch().has(name)) return;                 // not unlocked yet
  const c = loadClaimed(); if (c.has(name)) return; // already claimed
  const before = starBalance();
  c.add(name); saveClaimed(c);
  const after = starBalance();
  showAchToast({ icon: '⭐', name: `+${a.stars} stars claimed!`, star: true });
  checkStarRewards(before, after);
  renderAchievements();
}
function claimAllReady() {
  const un = loadAch(), c = loadClaimed(); let claimed = false;
  ACH_ALL.forEach(a => { if (un.has(a.name) && !c.has(a.name)) claimed = true; });
  if (!claimed) return;
  const before = starBalance();
  ACH_ALL.forEach(a => { if (un.has(a.name) && !c.has(a.name)) c.add(a.name); });
  saveClaimed(c);
  const after = starBalance();
  showAchToast({ icon: '⭐', name: `+${after - before} stars claimed!`, star: true });
  checkStarRewards(before, after);
  renderAchievements();
}
// Add to a numeric counter (or to a set stored as an array), then re-check achievements.
function bumpStat(key, n) { const s = getStats(); s[key] = (s[key] || 0) + (n == null ? 1 : n); saveStats(s); checkAchievements(); }
function maxStat(key, v) { const s = getStats(); if ((s[key] || 0) < v) { s[key] = v; saveStats(s); checkAchievements(); } }
function addStatToSet(key, val) {
  const s = getStats(); const arr = s[key] || [];
  if (!arr.includes(val)) { arr.push(val); s[key] = arr; saveStats(s); checkAchievements(); }
}
// The value a given stat currently has — some are counters, some are computed from other data.
function statValue(key) {
  const s = getStats();
  switch (key) {
    case 'botsBeaten': return (s.botsBeatenList || []).length;
    case 'modesPlayed': return (s.modesPlayedList || []).length;
    case 'puzStreakBest': return parseInt(localStorage.getItem('chesserPzBest') || '0', 10);
    case 'streakBest': { const st = loadStreak(); return st ? (st.best || st.streak || 0) : 0; }
    case 'lessonsBasics': return chessLessonsDone();
    case 'levelsDone': return (typeof LEVELS !== 'undefined') ? LEVELS.filter(l => levelComplete(l.key)).length : 0;
    case 'levelSkills': return (typeof LEVELS !== 'undefined') ? LEVELS.reduce((a, l) => a + levelDone(l.key), 0) : 0;
    case 'chats': return (s.tomChats || 0) + (s.worldChats || 0);
    case 'collection': { const c = loadCollection(); return Object.values(c).reduce((a, b) => a + b, 0); }
    case 'rares': { const c = loadCollection(); return Object.keys(c).filter(k => ['rare', 'epic', 'legendary', 'insane'].includes(k.split(':')[0])).reduce((a, k) => a + c[k], 0); }
    case 'legendary': { const c = loadCollection(); return Object.keys(c).filter(k => ['legendary', 'insane'].includes(k.split(':')[0])).reduce((a, k) => a + c[k], 0); }
    case 'tier': { const t = memberTier(); return t === 'gold' ? 3 : t === 'silver' ? 2 : t === 'bronze' ? 1 : 0; }
    case 'account': return isSignedIn() ? 1 : 0;
    case 'puzTypes': return (s.puz_mate > 0 ? 1 : 0) + (s.puz_tactic > 0 ? 1 : 0) + (s.puz_endgame > 0 ? 1 : 0) + (s.puz_opening > 0 ? 1 : 0);
    case 'unlocked': { const u = loadAch(); return ACH_ALL.filter(a => a.stat !== 'unlocked' && u.has(a.name)).length; }
    default: return s[key] || 0;
  }
}
function achDone(a, u) { return (u || loadAch()).has(a.name); }
// Unlock any achievements whose stat has reached its target; show a toast for new ones.
function checkAchievements(silent) {
  const u = loadAch();
  const fresh = [];
  // Two passes so the "unlock N achievements" ones see the base unlocks first.
  for (const a of ACH_ALL) { if (a.stat !== 'unlocked' && !u.has(a.name) && statValue(a.stat) >= a.need) { u.add(a.name); fresh.push(a); } }
  for (const a of ACH_ALL) { if (a.stat === 'unlocked' && !u.has(a.name) && statValue(a.stat) >= a.need) { u.add(a.name); fresh.push(a); } }
  if (fresh.length) {
    saveAch(u);
    if (!silent) fresh.forEach(showAchToast);   // silent on the first load, so no toast storm
    if ($('ach-modal') && !$('ach-modal').classList.contains('hidden')) renderAchievements();
  }
  return fresh;
}
let _achToastQueue = [];
function showAchToast(a) {
  _achToastQueue.push(a);
  if (_achToastQueue.length > 1) return; // one at a time
  const next = () => {
    if (!_achToastQueue.length) return;
    const cur = _achToastQueue[0];
    let el = $('ach-toast');
    if (!el) { el = document.createElement('div'); el.id = 'ach-toast'; el.className = 'ach-toast'; document.body.appendChild(el); }
    const top = cur.star ? '⭐ Topic complete' : '🏆 Achievement unlocked';
    el.innerHTML = `<span class="ach-toast-ico">${cur.icon}</span><span><span class="ach-toast-top">${top}</span><span class="ach-toast-name">${escapeHtml(cur.name)}</span></span>`;
    el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => { _achToastQueue.shift(); next(); }, 350); }, 2200);
  };
  next();
}
function openAchModal() { renderAchievements(); $('ach-modal').classList.remove('hidden'); }
function renderAchievements() {
  const u = loadAch(), claimed = loadClaimed();
  const total = ACH_ALL.length;
  const done = ACH_ALL.filter(a => u.has(a.name)).length;
  const topics = window.ACH_TOPICS || [];
  const bal = starBalance();
  const pct = total ? Math.round(done / total * 100) : 0;   // overall completion %
  const readyCount = ACH_ALL.filter(a => u.has(a.name) && !claimed.has(a.name)).length;
  const rewards = [
    { stars: REWARD_STARS, icon: '🌟', name: 'Star Legend badge' },
    { stars: REWARD2_STARS, icon: '📦', name: '3 packs a day' },
  ];
  const next = rewards.find(r => bal < r.stars);          // the next reward you're working toward
  const barPct = next ? Math.min(100, Math.round(bal / next.stars * 100)) : 100;
  // Show ONLY the next reward. Once you earn one, it drops off and the next appears.
  const rewardRows = next
    ? `<span class="ach-reward-row">Next reward: ${next.icon} ${escapeHtml(next.name)} <b>${bal}/${next.stars}⭐</b></span>`
    : '<span class="ach-reward-row got">🏆 All star rewards earned!</span>';
  const sum = $('ach-summary');
  if (sum) sum.innerHTML =
    `<div class="ach-count"><strong>${done}</strong> / ${total} unlocked` +
      `<span class="ach-pct">${pct}%</span>` +
      `<span class="ach-stars">⭐ ${bal} stars</span>` +
      (hasStarBadge() ? '<span class="ach-badge">🌟 Star Legend</span>' : '') +
      (readyCount ? `<button id="ach-claim-all" class="ach-claim-all">Claim all (${readyCount})</button>` : '') + `</div>` +
    `<div class="ach-reward">${rewardRows}` +
      `<div class="ach-bar"><div class="ach-bar-fill" style="width:${barPct}%"></div></div></div>`;
  if ($('ach-claim-all')) $('ach-claim-all').onclick = claimAllReady;
  const wrap = $('ach-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  topics.forEach(g => {
    const topicDone = g.a.filter(([name]) => u.has(name)).length;
    const complete = topicDone === g.a.length;
    const card = document.createElement('div');
    card.className = 'ach-topic' + (complete ? ' all-done' : '');
    let chips = '';
    g.a.forEach(([name, desc, stat, need], i) => {
      const got = u.has(name), isClaimed = claimed.has(name), val = TIER_STARS[i] || 1;
      let right;
      if (got && !isClaimed) right = `<button class="ach-claim" data-ach="${escapeHtml(name)}">Claim +${val}⭐</button>`;
      else if (isClaimed) right = `<span class="ach-earned">+${val}⭐</span>`;
      else right = `<span class="ach-prog">${Math.min(statValue(stat), need)}/${need}</span>`;
      chips += `<div class="ach-item ${got ? 'got' : 'locked'}${isClaimed ? ' claimed' : ''}" title="${escapeHtml(desc)}">` +
        `<span class="ach-tick">${got ? '✓' : '🔒'}</span><span class="ach-name">${escapeHtml(name)}</span>${right}</div>`;
    });
    card.innerHTML = `<div class="ach-topic-head"><span class="ach-topic-ico">${g.icon}</span>` +
      `<span class="ach-topic-name">${escapeHtml(g.t)}</span>` +
      `<span class="ach-topic-count">${complete ? '⭐' : topicDone + '/' + g.a.length}</span></div>` +
      `<div class="ach-items">${chips}</div>`;
    wrap.appendChild(card);
  });
  wrap.querySelectorAll('.ach-claim').forEach(b => { b.onclick = () => claimAch(b.dataset.ach); });
}

// ---- Packs: open packs to collect items of six rarities ----
const RARITIES = [
  { key: 'common', label: 'Common', color: '#9aa0a6', weight: 50 },
  { key: 'uncommon', label: 'Uncommon', color: '#5fb56f', weight: 27 },
  { key: 'rare', label: 'Rare', color: '#4f8cf0', weight: 14 },
  { key: 'epic', label: 'Epic', color: '#b060e0', weight: 6 },
  { key: 'legendary', label: 'Legendary', color: '#e0a53a', weight: 2.5 },
  { key: 'insane', label: 'Insane', color: '#e0407a', weight: 0.5 },
];
const RARITY = Object.fromEntries(RARITIES.map(r => [r.key, r]));
const COLLECTIBLES = {
  common: [['Wooden Pawn', '♟️'], ['Paper Board', '📄'], ['Pocket Set', '🎒'], ['Clay Piece', '🧱']],
  uncommon: [['Bronze Knight', '🐴'], ['Copper Coin', '🪙'], ['Clover Board', '🍀'], ['Green Bishop', '🟢']],
  rare: [['Silver Knight', '🥈'], ['Crystal Pawn', '🔷'], ['Blue Queen', '🔵'], ['Marble Board', '🏛️']],
  epic: [['Amethyst Queen', '💜'], ['Storm Rook', '🌩️'], ['Comet Bishop', '☄️'], ['Purple King', '🟣']],
  legendary: [['Golden King', '👑'], ['Phoenix Queen', '🔥'], ['Dragon Rook', '🐉'], ['Star Board', '🌟']],
  insane: [['Cosmic King', '🌌'], ['Rainbow Queen', '🌈'], ['Diamond Set', '💎'], ['Galaxy Board', '🪐']],
};

// Roll a rarity from a weight map, then pick a random item of that rarity.
function rollPull(weights) {
  const entries = RARITIES.filter(r => weights[r.key] > 0);
  const total = entries.reduce((s, r) => s + weights[r.key], 0);
  let x = Math.random() * total;
  let chosen = entries[entries.length - 1];
  for (const r of entries) { if (x < weights[r.key]) { chosen = r; break; } x -= weights[r.key]; }
  const pool = COLLECTIBLES[chosen.key];
  const [name, icon] = pool[Math.floor(Math.random() * pool.length)];
  return { rarity: chosen.key, name, icon };
}
const PACK_WEIGHTS = { common: 50, uncommon: 27, rare: 14, epic: 6, legendary: 2.5, insane: 0.5 };

function loadCollection() {
  const user = currentUser() || 'guest';
  try { return (JSON.parse(localStorage.getItem('chessup_collection')) || {})[user] || {}; }
  catch { return {}; }
}
function addToCollection(pull) {
  const user = currentUser() || 'guest';
  let all = {};
  try { all = JSON.parse(localStorage.getItem('chessup_collection')) || {}; } catch { all = {}; }
  const col = all[user] || {};
  const id = `${pull.rarity}:${pull.name}`;
  col[id] = (col[id] || 0) + 1;
  all[user] = col;
  localStorage.setItem('chessup_collection', JSON.stringify(all));
}

// "IM Immortal" vs just "Immortal" — used in the list and the status bar.
function botDisplayName(bot) {
  return bot.title ? `${bot.title} ${bot.name}` : bot.name;
}

function moveToUci(move) {
  return C.squareName(move.from) + C.squareName(move.to) + (move.promotion || '');
}

// Is the move at the given ply still within opening theory?
function isBookMove(plyIndex) {
  if (plyIndex > 11) return false;
  // Any recognised opening first move counts as Book.
  if (plyIndex === 0 && BOOK_FIRST_MOVES.has(stripSan(game.history[0]))) return true;
  const played = game.history.slice(0, plyIndex + 1);
  return OPENING_BOOK.some(line =>
    line.length > plyIndex &&
    played.every((san, k) => stripSan(line[k]) === stripSan(san)));
}
function stripSan(san) { return san ? san.replace(/[+#!?]/g, '') : san; }

// --- Saved games (for the Analyzer's "My games") ---
const SAVED_GAMES_KEY = 'chessup_games';
function loadGames() {
  try { return JSON.parse(localStorage.getItem(SAVED_GAMES_KEY)) || []; }
  catch { return []; }
}
function saveGame(resultText) {
  if (game.saved) return;
  if (game.mode !== 'friends' && game.mode !== 'ai') return; // don't save analyze sessions
  if (game.moveHistory.length === 0) return;
  game.saved = true;
  const games = loadGames();
  games.unshift({
    date: Date.now(),
    mode: game.mode,
    difficulty: game.difficulty,
    humanColor: game.humanColor,
    result: resultText || 'Unfinished',
    movesUci: game.moveHistory.map(moveToUci),
    sans: game.history.slice(),
  });
  while (games.length > 25) games.pop();
  localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify(games));
}

// --- Membership ---
const MEMBERS_KEY = 'chessup_members';
const SESSION_KEY = 'chessup_session';
const LASTUSER_KEY = 'chessup_lastuser'; // who was signed in last, so we can auto-restore on restart

function loadMembers() {
  try { return JSON.parse(localStorage.getItem(MEMBERS_KEY)) || {}; }
  catch { return {}; }
}
function saveMembers(m) { localStorage.setItem(MEMBERS_KEY, JSON.stringify(m)); }
function currentUser() { return localStorage.getItem(SESSION_KEY); }
// Sign in and remember it, so a Bronze (or higher) account stays signed in next time.
function setSession(user) { localStorage.setItem(SESSION_KEY, user); localStorage.setItem(LASTUSER_KEY, user); }
// On startup, if the session was lost but the account still exists, bring it back — so your
// membership does NOT drop to Free on restart. An explicit Sign out clears this, so it sticks.
function restoreSession() {
  const cur = currentUser();
  if (cur) {                                                    // already signed in
    if (!localStorage.getItem(LASTUSER_KEY)) localStorage.setItem(LASTUSER_KEY, cur); // remember for next time
    return;
  }
  const last = localStorage.getItem(LASTUSER_KEY);
  if (last && loadMembers()[last]) localStorage.setItem(SESSION_KEY, last);
}
function signOut() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LASTUSER_KEY); // forget the account too, so restore doesn't sign back in
}
function isSignedIn() { return !!currentUser(); }
// A signed-in account counts as Bronze only if it has a contact (email or phone).
function hasContact() {
  const u = currentUser();
  if (!u) return false;
  const rec = loadMembers()[u];
  return !!(rec && rec.contact);
}
// "Member" = Bronze or up. Free accounts (username only) are signed in but NOT members.
function isMember() { return isSignedIn() && (hasContact() || isSilver()); }
// Membership tier: null (signed out), 'free', 'bronze', 'silver', 'gold' (top paid tier).
function memberTier() {
  const u = currentUser();
  if (!u) return null;
  if (isGold()) return 'gold';
  if (isSilver()) return 'silver';
  return hasContact() ? 'bronze' : 'free';
}
// A paid tier is active while it hasn't expired (a "forever" plan never expires).
function paidActive(rec) { return rec && (rec.silverUntil == null || Date.now() <= rec.silverUntil); }
// Gold is the top paid tier (adds Tom + chat on top of everything Silver has).
function isGold() {
  const u = currentUser();
  if (!u) return false;
  const rec = loadMembers()[u];
  return !!(rec && rec.tier === 'gold' && paidActive(rec));
}
// Silver perks are active for BOTH Silver and Gold members (Gold includes Silver).
function isSilver() {
  const u = currentUser();
  if (!u) return false;
  const rec = loadMembers()[u];
  return !!(rec && (rec.tier === 'silver' || rec.tier === 'gold') && paidActive(rec));
}
function memberPlan() { const u = currentUser(); if (!u) return null; const m = loadMembers(); return (m[u] && m[u].plan) || null; }
function silverDaysLeft() {
  const u = currentUser();
  const rec = u && loadMembers()[u];
  if (!rec || rec.silverUntil == null) return null; // no expiry (forever) or not silver
  return Math.max(0, Math.ceil((rec.silverUntil - Date.now()) / 86400000));
}
function tierLabel() { const t = memberTier(); return t === 'gold' ? 'Gold' : t === 'silver' ? 'Silver' : t === 'bronze' ? 'Bronze' : 'Free'; }
function tierMedal() { const t = memberTier(); return t === 'gold' ? '\u{1F947}' : t === 'silver' ? '\u{1F948}' : t === 'bronze' ? '\u{1F949}' : '\u{1F193}'; } // 🥇 / 🥈 / 🥉 / 🆓
// Packs are a Silver perk: 2 a day for either plan (they differ only in length).
function packsPerDay() { return isSilver() ? (has3Packs() ? 3 : 2) : 0; }

// --- Player rating (Elo-style ladder vs the bots) ---
// Returns the player's rating, or null if they haven't played a rated game yet.
function getRating() {
  const u = currentUser();
  if (!u) return null;
  const m = loadMembers();
  return (m[u] && m[u].rating != null) ? m[u].rating : null;
}
function setRating(r) {
  const u = currentUser();
  if (!u) return;
  const m = loadMembers();
  if (!m[u]) return;
  m[u].rating = Math.round(r);
  saveMembers(m);
  maxStat('ratingPeak', Math.round(r));   // achievements: highest rating reached
}
// Standard Elo update. result: 1 win, 0.5 draw, 0 loss (from the player's view).
function applyElo(playerR, oppR, result) {
  const expected = 1 / (1 + Math.pow(10, (oppR - playerR) / 400));
  return playerR + 32 * (result - expected);
}

// Your own title, earned by rating — mirrors the bot title ladder at the top.
function ratingTitle(r) {
  if (r == null) return 'Unrated';
  if (r >= 2500) return 'GM';
  if (r >= 2400) return 'IM';
  if (r >= 2300) return 'FM';
  if (r >= 2250) return 'NM';
  if (r >= 2200) return 'CM';
  if (r >= 2000) return 'Expert';
  if (r >= 1600) return 'Skilled';
  if (r >= 1200) return 'Improver';
  if (r >= 800) return 'Novice';
  return 'Rookie';
}

// Lightweight hash so we don't store raw passwords in localStorage.
function hashPw(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

// --- Engine worker (keeps the UI responsive during search) ---
let engineWorker = null;
let workerSeq = 0;
const workerPending = new Map();
try {
  engineWorker = new Worker('worker.js');
  engineWorker.onmessage = e => {
    const { id, move, result, error } = e.data;
    const cb = workerPending.get(id);
    if (!cb) return;
    workerPending.delete(id);
    if (error) cb.reject(new Error(error));
    else cb.resolve(move !== undefined ? move : result);
  };
  engineWorker.onerror = () => { engineWorker = null; };
} catch {
  engineWorker = null; // e.g. file:// — fall back to synchronous compute
}

function computeMove(state, difficulty) {
  if (!engineWorker) {
    return Promise.resolve(C.chooseMove(state, difficulty));
  }
  const id = ++workerSeq;
  return new Promise((resolve, reject) => {
    workerPending.set(id, { resolve, reject });
    engineWorker.postMessage({ id, type: 'move', state, difficulty });
  });
}

// --- DOM refs ---
const $ = id => document.getElementById(id);
const boardEl = $('board');

// ============ Navigation ============
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  // The Music / More bar belongs on the home screen only — hide it during games.
  const mb = document.querySelector('.music-bar');
  if (mb) mb.classList.toggle('hidden', id !== 'home');
}

// ============ Membership UI ============
function renderMembership() {
  const badge = $('membership-badge');
  const user = currentUser();
  if (user) {
    badge.innerHTML = `
      <span class="member-chip ${memberTier()}" title="${tierLabel()} member">
        <span class="medal">${tierMedal()}</span>
        <span class="tier">${tierLabel()}</span>
        <span class="name">${escapeHtml(user)}</span>
        <button class="signout" id="signout-btn">Sign out</button>
      </span>`;
    $('signout-btn').onclick = () => {
      // Guard it so a stray tap doesn't drop the kid back to Free.
      if (!confirm('Sign out? You will go back to Free until you sign in again.')) return;
      signOut();
      renderMembership();
      refreshAnalysisGate();
    };
  } else {
    badge.innerHTML = `<button id="auth-btn" class="auth-btn">Sign in</button>`;
    $('auth-btn').onclick = openAuth;
  }
  renderProfileTag();
  updateModeCards();
  refreshStreak();
  const pay = document.getElementById('topbar-pay');
  if (pay) pay.classList.toggle('hidden', isSilver()); // hide once you're Silver
  paintMusicMoreBtn();
}

// The "More" music button shows a lock until you're Bronze.
function paintMusicMoreBtn() {
  const b = document.getElementById('music-more');
  if (!b) return;
  const member = isMember();
  b.innerHTML = member ? '♫ More' : '\u{1F512} More';
  b.title = member ? 'More music' : 'More music — Bronze members only';
  b.classList.toggle('locked', !member);
}

// Bronze cards say "Sign in" until you've signed in, then "🥉 Bronze".
function updateModeCards() {
  const member = isMember();
  document.querySelectorAll('.mode-card .bronze-pill').forEach(p => {
    p.innerHTML = member ? '\u{1F949} Bronze' : '\u{1F512} Bronze';
    p.classList.toggle('locked', !member);
  });
}

// Bottom-right profile name, shown only when signed in.
function renderProfileTag() {
  const tag = $('profile-tag');
  if (!tag) return;
  const user = currentUser();
  if (user) {
    $('profile-name').textContent = user;
    const tier = tag.querySelector('.ptag-tier');
    const r = getRating();
    if (tier) tier.textContent = r == null ? `${tierLabel()} · Unrated` : `${tierLabel()} · ${ratingTitle(r)} ${r}`;
    const medal = tag.querySelector('.medal');
    if (medal) medal.textContent = tierMedal();
    tag.classList.remove('hidden');
  } else {
    tag.classList.add('hidden');
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- Auth modal ----
let authMode = 'signin'; // 'signin' | 'signup' | 'upgrade'
function openAuth(mode) {
  authMode = mode || 'signin';
  authMoreOpen = false;          // start collapsed — just the username for a Free account
  syncAuthMode();
  $('auth-error').textContent = '';
  $('auth-username').value = '';
  $('auth-password').value = '';
  $('auth-contact').value = '';
  $('auth-modal').classList.remove('hidden');
}
function closeAuth() { $('auth-modal').classList.add('hidden'); }

// A contact is an email (has @) or a phone number (7+ digits).
function isValidContact(c) {
  c = (c || '').trim();
  if (c.includes('@') && c.length >= 5) return true;
  return c.replace(/\D/g, '').length >= 7;
}

let authMoreOpen = false; // whether the "More → Bronze" email/phone field is expanded
function syncAuthMode() {
  const signup = authMode === 'signup';
  const upgrade = authMode === 'upgrade';
  const signin = authMode === 'signin';
  $('auth-title').textContent = upgrade ? 'Become Bronze' : signup ? 'Create account' : 'Sign in';
  $('auth-submit').textContent = upgrade ? '\u{1F949} Become Bronze (free)' : signup ? 'Create account' : 'Sign in';
  $('auth-toggle').style.display = upgrade ? 'none' : '';
  $('auth-toggle-text').textContent = signup ? 'Already have an account?' : 'New here?';
  $('auth-toggle-btn').textContent = signup ? 'Sign in' : 'Create an account';
  // Username: shown for sign in / sign up (you're already signed in when upgrading).
  const showUser = !upgrade;
  $('auth-username').style.display = showUser ? '' : 'none';
  $('auth-username').required = showUser;
  // Sign up shows just the username (Free). The "More" button reveals the Bronze
  // fields: a password AND an email/phone. Upgrade shows them straight away.
  const showBronze = upgrade || (signup && authMoreOpen);   // password + email/phone
  const showPassword = signin || showBronze;                // sign in also uses a password
  $('auth-more').style.display = (signup && !authMoreOpen) ? '' : 'none';
  $('auth-password').style.display = showPassword ? '' : 'none';
  $('auth-password').required = upgrade;                     // required to become Bronze
  $('auth-password').setAttribute('autocomplete', signin ? 'current-password' : 'new-password');
  $('auth-contact').style.display = showBronze ? '' : 'none';
  $('auth-contact').required = upgrade;
  const note = $('auth-contact-note');
  note.style.display = showBronze ? '' : 'none';
  note.textContent = upgrade
    ? 'Set a password and add your email or phone to unlock \u{1F949} Bronze — the engine, bots, review & more.'
    : 'Set a password + add an email or phone to become \u{1F949} Bronze. Or leave these blank to stay Free.';
}

function handleAuthSubmit(e) {
  e.preventDefault();
  const err = $('auth-error');
  const members = loadMembers();
  const pw = $('auth-password').value;

  // Upgrade: a signed-in Free user sets a password + contact to become Bronze.
  if (authMode === 'upgrade') {
    const u = currentUser();
    const contact = $('auth-contact').value.trim();
    if (!isValidContact(contact)) { err.textContent = 'Enter a real email or phone number.'; return; }
    if (pw.length < 4) { err.textContent = 'Choose a password (at least 4 characters).'; return; }
    if (u && members[u]) {
      members[u].contact = contact;
      members[u].pw = hashPw(pw);
      if (members[u].tier !== 'silver') members[u].tier = 'bronze';
      saveMembers(members);
    }
    closeAuth(); renderMembership(); refreshAnalysisGate();
    checkAchievements();   // Bronze upgrade → membership achievements
    return;
  }

  const user = $('auth-username').value.trim();
  if (user.length < 3) { err.textContent = 'Username needs at least 3 characters.'; return; }

  if (authMode === 'signup') {
    if (members[user]) { err.textContent = 'That username is taken — try Sign in.'; return; }
    const contact = $('auth-contact').value.trim();
    if (contact) {
      // Bronze = email/phone + a password.
      if (!isValidContact(contact)) { err.textContent = 'That email/phone looks off — or leave it blank to stay Free.'; return; }
      if (pw.length < 4) { err.textContent = 'Bronze needs a password too (at least 4 characters).'; return; }
      members[user] = { joined: Date.now(), contact, pw: hashPw(pw), tier: 'bronze' };
    } else {
      // Free = just a username (no password needed).
      members[user] = { joined: Date.now(), contact: null, tier: 'free' };
    }
    saveMembers(members);
  } else {
    // Sign in: free accounts need only the username; accounts with a password must match.
    const rec = members[user];
    if (!rec) { err.textContent = 'No account with that username — create one!'; return; }
    if (rec.pw && hashPw(pw) !== rec.pw) { err.textContent = pw ? 'Wrong password.' : 'This account has a password — enter it.'; return; }
  }
  setSession(user);
  closeAuth();
  renderMembership();
  refreshAnalysisGate();
  checkAchievements();   // "Sign Up" / membership achievements
}

// ============ Game setup ============
function startGame() {
  hideOnlineChat();          // no chat panel over the board during a game (it blocked the a/b pawns)
  game.gen++;
  game.state = C.newState();
  game.selected = null;
  game.legalForSel = [];
  game.premove = null;
  game.premoveSel = null;
  game.lastMove = null;
  game.capturedByWhite = [];
  game.capturedByBlack = [];
  game.history = [];
  game.stateHistory = [C.cloneState(game.state)];
  game.moveHistory = [];
  game.classifications = [];
  game.over = false;
  game.pendingPromo = null;
  game.aiThinking = false;
  game.reviewing = false;
  game.reviewCancel = false;
  game.saved = false;
  game.viewIndex = null;
  // A caller (bot / engine picker) can set the opponent config here so it's ready
  // before the first AI move fires; otherwise fall back to the difficulty defaults.
  const isStockfishLevel = game.mode === 'ai' && game.difficulty === 'stockfish';
  if (pendingBot) {
    game.botName = pendingBot.name;
    game.botRating = pendingBot.rating;
    game.botEngine = !!pendingBot.engine;
    game.botElo = pendingBot.elo || null;
  } else {
    game.botName = isStockfishLevel ? 'Stockfish' : null;
    game.botRating = null;        // the AI section is casual — not rated
    game.botEngine = isStockfishLevel;
    game.botElo = isStockfishLevel ? 3000 : null;
  }
  pendingBot = null;
  game.ratingApplied = false;
  game.achCounted = false;   // count this game's result once, at endGame
  // In AI/online modes, human plays a fixed color; flip so they're at the bottom.
  game.flipped = (game.mode === 'ai' || game.mode === 'online') && game.humanColor === 'b';
  // Engine controls differ by mode: games get the Stockfish eval bar only;
  // the Analyzer board gets the full Analyzer (best moves + review).
  const analyze = game.mode === 'analyze';
  $('open-analysis').classList.toggle('hidden', analyze);
  $('open-analyzer').classList.toggle('hidden', !analyze);
  $('resign').classList.toggle('hidden', analyze);
  // The board auto-turns to the side to move in pass-and-play and the Analyzer, so
  // the manual Flip button is hidden there (it's still shown in AI/bot/online games).
  $('flip-board').classList.toggle('hidden', game.mode === 'friends' || analyze);
  mainControlsEl().classList.remove('hidden'); // restore normal controls (leaving puzzle mode)
  $('puzzle-controls').classList.add('hidden');
  $('puzzle-difficulty').classList.add('hidden');
  if ($('puzzle-moves')) $('puzzle-moves').classList.add('hidden');
  if ($('online-chat')) $('online-chat').classList.add('hidden'); // shown again only for online games
  showScreen('game');
  render();
  refreshAnalysisGate();
  resetReviewUI();
  if (window.SF) window.SF.preload(); // warm up the engine (eval bar is free)
  maybeAiMove();
}

// ============ Rendering ============
function render() {
  renderBoard();
  renderStatus();
  renderCaptures();
  renderMoves();
}

function orderedSquares() {
  const arr = [];
  for (let i = 0; i < 64; i++) arr.push(i);
  return game.flipped ? arr.reverse() : arr;
}

function renderBoard() {
  boardEl.innerHTML = '';
  const view = displayState();
  const viewing = isViewingHistory();
  const checkColor = C.inCheck(view, view.turn) ? view.turn : null;
  const checkSq = checkColor ? view.board.indexOf(checkColor === 'w' ? 'K' : 'k') : -1;
  // When viewing a past move, highlight the squares that move used.
  let highlight = game.lastMove;
  if (viewing && game.viewIndex > 0) {
    const m = game.moveHistory[game.viewIndex - 1];
    highlight = m ? { from: m.from, to: m.to } : null;
  }

  for (const i of orderedSquares()) {
    const { r, c } = C.rc(i);
    const sq = document.createElement('div');
    sq.className = 'sq ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
    sq.dataset.idx = i;

    const piece = view.board[i];
    if (piece) {
      sq.classList.add(C.isWhite(piece) ? 'white-piece' : 'black-piece');
      const span = document.createElement('span');
      span.className = 'piece';
      span.textContent = UNICODE[piece];
      sq.appendChild(span);
    }
    if (!viewing && game.selected === i) sq.classList.add('selected');
    if (highlight && (highlight.from === i || highlight.to === i)) sq.classList.add('last-move');
    if (i === checkSq) sq.classList.add('in-check');
    // Premove highlighting (queued during the opponent's turn).
    if (!viewing && game.premoveSel === i) sq.classList.add('premove-sel');
    if (!viewing && game.premove && (game.premove.from === i || game.premove.to === i)) sq.classList.add('premove');

    if (!viewing && game.legalForSel.some(m => m.to === i)) {
      const hint = document.createElement('div');
      hint.className = 'move-hint' + (piece || isEnPassantTarget(i) ? ' capture' : '');
      sq.appendChild(hint);
    }

    // coordinates on edges
    const edgeRank = game.flipped ? (c === 7) : (c === 0);
    const edgeFile = game.flipped ? (r === 0) : (r === 7);
    if (edgeRank) sq.appendChild(coord('rank', String(8 - r)));
    if (edgeFile) sq.appendChild(coord('file', C.FILES[c]));

    sq.addEventListener('click', () => onSquareClick(i));
    boardEl.appendChild(sq);
  }
}

function coord(kind, txt) {
  const el = document.createElement('span');
  el.className = 'coord ' + kind;
  el.textContent = txt;
  return el;
}

function isEnPassantTarget(i) {
  return game.legalForSel.some(m => m.to === i && m.enPassant);
}

function kingSquare(color) {
  const k = color === 'w' ? 'K' : 'k';
  return game.state.board.indexOf(k);
}

function renderStatus() {
  const bar = $('status-bar');
  bar.classList.remove('check');
  if (game.over) return;
  const status = C.gameStatus(game.state);
  const toMove = game.state.turn === 'w' ? 'White' : 'Black';
  if (status === 'check') {
    bar.textContent = `${toMove} to move — Check!`;
    bar.classList.add('check');
  } else if (game.aiThinking) {
    bar.textContent = `${game.botName || 'AI'} is thinking…`;
  } else {
    let who = toMove + ' to move';
    if (game.mode === 'ai') {
      const opp = game.botName || 'AI';
      who += game.state.turn === game.humanColor ? ' (you)' : ` (${opp})`;
    } else if (game.mode === 'online') {
      who = game.state.turn === game.humanColor ? 'Your move' : `${game.onlineOpponent} to move…`;
    }
    bar.textContent = who;
  }
}

function renderCaptures() {
  $('captured-by-white').textContent = game.capturedByWhite.map(p => UNICODE[p]).join('');
  $('captured-by-black').textContent = game.capturedByBlack.map(p => UNICODE[p]).join('');
}

function renderMoves() {
  const list = $('move-list');
  list.innerHTML = '';
  for (let i = 0; i < game.history.length; i += 2) {
    const li = document.createElement('li');
    li.value = i / 2 + 1;
    const pair = document.createElement('div');
    pair.className = 'pair';
    pair.appendChild(moveCell(i));
    if (game.history[i + 1] !== undefined) pair.appendChild(moveCell(i + 1));
    li.appendChild(pair);
    list.appendChild(li);
  }
  list.scrollTop = list.scrollHeight;
}

function moveCell(plyIndex) {
  const span = document.createElement('span');
  span.className = 'move-cell';
  if (game.viewIndex === plyIndex + 1) span.classList.add('active');
  span.onclick = () => viewPly(plyIndex); // click a move → jump the board there
  const txt = document.createElement('span');
  txt.textContent = game.history[plyIndex];
  span.appendChild(txt);
  const key = game.classifications[plyIndex];
  if (key && MARKS[key]) {
    const badge = document.createElement('span');
    badge.className = 'mark ' + MARKS[key].cls;
    badge.textContent = MARKS[key].sym;
    badge.title = MARKS[key].label;
    span.appendChild(badge);
  }
  return span;
}

// ============ Interaction ============
function onSquareClick(i) {
  if (isViewingHistory()) {
    // In the Analyzer you can branch: play a different move from a past position to
    // explore another line. Elsewhere, tapping the board just returns to live.
    if (game.mode === 'analyze') branchFromView();
    else { goLive(); return; }
  }
  if (game.over && game.mode !== 'analyze') return;
  // When it's not your turn (vs AI/bots/online), clicking queues a PREMOVE.
  const hasOpponent = game.mode === 'ai' || game.mode === 'online';
  if (hasOpponent && game.state.turn !== game.humanColor) { handlePremoveClick(i); return; }
  if (game.aiThinking) return;

  const piece = game.state.board[i];

  // If a piece is selected and this is a legal destination, move.
  if (game.selected !== null) {
    const candidates = game.legalForSel.filter(m => m.to === i);
    if (candidates.length > 0) {
      if (candidates.length > 1 && candidates[0].promotion) {
        // promotion: ask which piece
        game.pendingPromo = { from: game.selected, to: i };
        openPromo();
        return;
      }
      doMove(candidates[0]);
      return;
    }
  }

  // Otherwise select own piece.
  if (piece && C.colorOf(piece) === game.state.turn) {
    game.selected = i;
    game.legalForSel = C.legalMovesFrom(game.state, i);
  } else {
    game.selected = null;
    game.legalForSel = [];
  }
  renderBoard();
}

// Queue a move while it's the opponent's turn (a "premove").
function handlePremoveClick(i) {
  const piece = game.state.board[i];
  if (game.premoveSel != null) {
    if (i === game.premoveSel) { game.premoveSel = null; renderBoard(); return; }   // cancel
    if (piece && C.colorOf(piece) === game.humanColor) { game.premoveSel = i; renderBoard(); return; } // reselect
    game.premove = { from: game.premoveSel, to: i };                                 // set premove
    game.premoveSel = null;
    renderBoard();
    return;
  }
  if (piece && C.colorOf(piece) === game.humanColor) { game.premoveSel = i; game.premove = null; }
  else { game.premove = null; game.premoveSel = null; }                              // click elsewhere clears
  renderBoard();
}

// After the opponent moves it's our turn — play the queued premove if it's legal now.
function tryPremove() {
  if (!game.premove || game.over || game.state.turn !== game.humanColor) return;
  const pm = game.premove;
  game.premove = null;
  const legal = C.legalMovesFrom(game.state, pm.from).filter(m => m.to === pm.to);
  if (!legal.length) { renderBoard(); return; }               // premove became illegal — discard
  const move = (legal.length > 1 && legal[0].promotion) ? (legal.find(m => m.promotion === 'q') || legal[0]) : legal[0];
  // Fire 0.5s AFTER the opponent's move — so you see their move, then your premove plays.
  setTimeout(() => { if (game.state.turn === game.humanColor && !game.over) doMove(move); }, 500);
}

function doMove(move) {
  if (game.mode === 'puzzle') { handlePuzzleMove(move); return; }
  // Online: relay our own move to the opponent (not moves they sent us).
  if (game.mode === 'online' && !game.applyingRemote) onlineSend({ type: 'move', uci: moveToUci(move) });
  game.viewIndex = null; // any new move snaps back to the live position
  const captured = captureInfo(game.state, move);
  const san = C.moveToText(game.state, move);
  const mover = game.state.turn; // whose move this is (before the board flips)
  game.state = C.applyMove(game.state, move);
  game.history.push(san);
  game.moveHistory.push(move);
  game.stateHistory.push(C.cloneState(game.state));
  game.classifications.push(null); // cleared until a fresh review is run
  game.lastMove = { from: move.from, to: move.to };
  game.selected = null;
  game.legalForSel = [];
  if (captured) {
    if (C.isWhite(captured)) game.capturedByBlack.push(captured);
    else game.capturedByWhite.push(captured);
  }
  // Achievements: count the PLAYER's own moves (not the AI's, not analyzer exploration).
  if (game.mode !== 'analyze' && (game.mode === 'friends' || mover === game.humanColor)) {
    const st = getStats();
    st.moves = (st.moves || 0) + 1;
    if (captured) st.captures = (st.captures || 0) + 1;
    if (/^O-O/.test(san)) st.castles = (st.castles || 0) + 1;
    if (moveToUci(move).length > 4) st.promotions = (st.promotions || 0) + 1;
    const status = C.gameStatus(game.state);
    if (status === 'check') st.checks = (st.checks || 0) + 1;
    if (status === 'checkmate') { st.checks = (st.checks || 0) + 1; st.checkmates = (st.checkmates || 0) + 1; }
    saveStats(st); checkAchievements();
  }
  // Pass-and-play AND the Analyzer: after each move, turn the board so the side to
  // move is at the bottom (facing whoever's turn it is now), no matter the flip.
  if ((game.mode === 'friends' || game.mode === 'analyze') && !game.replaying) {
    game.flipped = game.state.turn === 'b';
  }
  render();
  resetReviewUI();
  // If the engine panel is open, re-analyze (and re-grade) automatically.
  const engineOpen = !$('analysis-modal').classList.contains('hidden');
  if (!game.replaying && engineOpen && engineAllowed()) {
    runAnalysis(); // also auto-updates the move grades when finished (full mode)
  } else {
    resetAnalysisOutput();
  }
  checkGameEnd();
  if (!game.over) maybeAiMove();
}

function captureInfo(state, move) {
  if (move.enPassant) {
    const { r, c } = C.rc(move.to);
    const capRow = state.turn === 'w' ? r + 1 : r - 1;
    return state.board[C.idx(capRow, c)];
  }
  const t = state.board[move.to];
  return t || null;
}

function checkGameEnd() {
  const status = C.gameStatus(game.state);
  if (status === 'checkmate') {
    const winnerColor = game.state.turn === 'w' ? 'b' : 'w';
    const winner = winnerColor === 'w' ? 'White' : 'Black';
    endGame('Checkmate', `${winner} wins.`, winnerColor === game.humanColor ? 1 : 0);
  } else if (status === 'stalemate') {
    endGame('Stalemate', 'Draw — no legal moves.', 0.5);
  } else if (status === 'fifty-move') {
    endGame('Draw', 'Fifty-move rule.', 0.5);
  }
}

// result (optional): 1 win / 0.5 draw / 0 loss from the human's view — only for
// rated bot games, to update the player's rating.
function endGame(title, text, result) {
  game.over = true;
  let ratingLine = '';
  if (game.mode === 'ai' && game.botName && game.botRating != null && result != null && !game.ratingApplied) {
    game.ratingApplied = true;
    const hadRating = getRating() != null;                 // first rated game establishes it
    const before = hadRating ? getRating() : START_RATING;
    const after = applyElo(before, game.botRating, result);
    setRating(after);
    const d = Math.round(after) - Math.round(before);
    ratingLine = hadRating
      ? ` Rating: ${Math.round(before)} → ${Math.round(after)} (${d >= 0 ? '+' : ''}${d}).`
      : ` Your first rating: ${Math.round(after)}! 🎉`;
    renderProfileTag();
  }
  // Achievements: record the result, mode, win speed, bot beaten, and rated status.
  if (result != null && !game.achCounted) {
    game.achCounted = true;
    const st = getStats();
    st.games = (st.games || 0) + 1;
    if (game.mode === 'online') st.onlineGames = (st.onlineGames || 0) + 1;
    if (game.mode === 'friends') st.friendsGames = (st.friendsGames || 0) + 1;
    if (result === 1) {
      st.wins = (st.wins || 0) + 1;
      if (game.mode === 'ai') st.winsAI = (st.winsAI || 0) + 1;
      const myMoves = Math.ceil(game.history.length / 2);
      if (myMoves <= 30) st.win30 = 1;
      if (myMoves <= 25) st.win25 = 1;
      if (myMoves <= 20) st.win20 = 1;
      if (myMoves <= 15) st.win15 = 1;
      if (myMoves <= 10) st.win10 = 1;
      if (myMoves <= 8) st.win8 = 1;
      if (game.mode === 'ai' && game.botName) {
        const list = st.botsBeatenList || []; if (!list.includes(game.botName)) list.push(game.botName); st.botsBeatenList = list;
      }
    } else if (result === 0.5) st.draws = (st.draws || 0) + 1;
    else if (result === 0) st.losses = (st.losses || 0) + 1;
    if (game.mode === 'ai' && game.botRating != null) st.rated = (st.rated || 0) + 1;
    saveStats(st); checkAchievements();
  }
  saveGame(`${title} — ${text}`);
  if (game.replaying) return; // loading a saved game; don't pop the modal
  $('over-title').textContent = title;
  $('over-text').textContent = text + ratingLine;
  $('over-modal').classList.remove('hidden');
}

// ============ AI ============
function maybeAiMove() {
  if (game.mode !== 'ai' || game.over) return;
  if (game.state.turn === game.humanColor) return;
  game.aiThinking = true;
  renderStatus();
  const myGen = game.gen;
  const started = Date.now();
  const stateForAi = C.cloneState(game.state);
  // Only the real Stockfish level uses the engine; everyone else uses the built-in AI.
  const depth = game.botElo ? 12 : 18;   // an uncapped (max) engine searches deeper = stronger
  const pick = (game.botEngine && window.SF)
    ? window.SF.go(C.toFEN(stateForAi), { depth, multipv: 1, elo: game.botElo })
        .then(r => (r.bestmove ? C.uciToMove(stateForAi, r.bestmove) : null))
    : computeMove(stateForAi, game.difficulty);
  pick.then(move => {
    // Wait so the reply always takes at least ~0.5s — it feels like real thinking.
    const wait = Math.max(0, 500 - (Date.now() - started));
    setTimeout(() => {
      if (game.gen !== myGen) return; // a new game started while thinking
      game.aiThinking = false;
      if (game.over) return; // game ended/reset while thinking
      if (!move) { checkGameEnd(); return; }
      doMove(move);
      tryPremove();           // fire the player's queued premove, if any
    }, wait);
  });
}

// ============ Promotion ============
function openPromo() {
  const wrap = $('promo-choices');
  wrap.innerHTML = '';
  const color = game.state.turn;
  for (const t of ['q', 'r', 'b', 'n']) {
    const btn = document.createElement('button');
    const p = color === 'w' ? t.toUpperCase() : t;
    btn.textContent = UNICODE[p];
    btn.onclick = () => {
      $('promo-modal').classList.add('hidden');
      const move = { from: game.pendingPromo.from, to: game.pendingPromo.to, promotion: t };
      game.pendingPromo = null;
      doMove(move);
    };
    wrap.appendChild(btn);
  }
  $('promo-modal').classList.remove('hidden');
}

// ============ Analysis (Stockfish, members only) ============
// 'eval' = evaluation bar only (Stockfish button); 'full' = bar + best moves + review (Analyzer).
let analysisMode = 'eval';

// The eval bar is free for everyone; the full Analyzer (best moves + review) is Bronze.
function engineAllowed() { return analysisMode === 'eval' || isMember(); }

function openEngine(mode) {
  analysisMode = mode;
  $('analysis-title').textContent = mode === 'full' ? 'Analyzer' : 'Stockfish';
  $('best-lines').classList.toggle('hidden', mode !== 'full');
  $('review-block').classList.toggle('hidden', mode !== 'full');
  // The Analyzer floats so you can keep moving pieces and watch it update live.
  $('analysis-modal').classList.toggle('floating', mode === 'full');
  refreshAnalysisGate();
  $('analysis-modal').classList.remove('hidden');
  // Analyze right away so it's never blank — no need to press the button first.
  if (engineAllowed()) runAnalysis();
}

function refreshAnalysisGate() {
  const free = analysisMode === 'eval';   // eval bar: free for everyone
  const allowed = free || isMember();
  $('analysis-locked').classList.toggle('hidden', allowed);
  $('analysis-content').classList.toggle('hidden', !allowed);
  const chip = $('analysis-lock');
  chip.classList.toggle('hidden', free); // no "Members" tag on the free eval bar
  if (!free) {
    chip.classList.toggle('unlocked', isMember());
    chip.innerHTML = isMember() ? '\u{1F949} Bronze' : '\u{1F512} Members';
  }
  if (allowed) resetAnalysisOutput();
}

function resetAnalysisOutput() {
  $('eval-fill').style.width = '50%';
  $('eval-num').textContent = '–';
  const lines = $('best-lines');
  if (lines) lines.innerHTML = '';
}

// Debounce analysis when you click quickly through moves, so we run ONE search for
// the position you land on instead of queueing a slow search for every stop on the way.
let _analysisTimer = null;
function scheduleAnalysis(opts) {
  clearTimeout(_analysisTimer);
  _analysisTimer = setTimeout(() => runAnalysis(opts), 180);
}
function runAnalysis(opts) {
  clearTimeout(_analysisTimer);   // if a debounced run was pending, this supersedes it
  if (!game.state || !window.SF || !engineAllowed()) return;
  $('eval-num').textContent = '…'; // shows it's thinking
  // Analyze the position ACTUALLY on the board — if you've gone back to an earlier
  // move, that's the viewed position, so the top choices match what you're looking at.
  const analyzed = C.cloneState(displayState());
  const fen = C.toFEN(analyzed);
  const full = analysisMode === 'full';
  const skipReview = opts && opts.skipReview;
  window.SF.go(fen, { depth: 14, multipv: full ? 5 : 1 }).then(result => {
    // Save this position's eval so the reviewer can reuse it instead of re-asking.
    if (result.lines.length) {
      evalCache.set(fen, {
        best: window.SF.cpify(result.lines[0]),
        second: result.lines[1] ? window.SF.cpify(result.lines[1]) : null,
        bestUci: result.bestmove,
      });
    }
    // If the position changed while thinking, a newer analysis will render — skip this one.
    if (C.toFEN(displayState()) !== fen) return;
    renderAnalysis(result, analyzed);
    if (full && !skipReview) reviewGame({ auto: true }); // grades update right away, reusing the cache
  });
}

// Format a centipawn value (white's perspective) for display.
function fmtEval(cpWhite) {
  if (Math.abs(cpWhite) >= 90000) {
    const movesTo = Math.round((100000 - Math.abs(cpWhite)) / 100);
    return (cpWhite > 0 ? '+M' : '-M') + (movesTo || '');
  }
  const pawns = cpWhite / 100;
  return (pawns >= 0 ? '+' : '') + pawns.toFixed(2);
}

function renderAnalysis(result, analyzedState) {
  const turn = analyzedState.turn;
  const toWhite = cp => (turn === 'w' ? cp : -cp);
  const cpWhite = result.lines.length ? toWhite(window.SF.cpify(result.lines[0])) : 0;
  $('eval-num').textContent = result.lines.length ? fmtEval(cpWhite) : '–';
  // Win-probability readout so the number means something: who's actually likely to win.
  const wp = Math.round(winProb(cpWhite) * 100);
  const cpExact = Math.abs(cpWhite) >= 90000 ? 'mate' : `${cpWhite >= 0 ? '+' : ''}${cpWhite} cp`;
  $('eval-num').title = result.lines.length ? `${cpExact} · White win chance ≈ ${wp}% · Black ${100 - wp}%` : '';
  const pct = winProb(cpWhite) * 100;               // same curve as the win-% (consistent)
  $('eval-fill').style.width = pct.toFixed(1) + '%';

  // Best-moves list (Analyzer mode only) — each move is CLICKABLE to play it.
  const linesEl = $('best-lines');
  if (!linesEl || analysisMode !== 'full') return;
  linesEl.innerHTML = '';
  if (!result.lines.length) {
    linesEl.innerHTML = '<div class="line"><span class="mv">No legal moves (game over).</span></div>';
    return;
  }
  result.lines.forEach((ln, idx) => {
    const div = document.createElement('div');
    div.className = 'line' + (idx === 0 ? ' best' : '');
    const mv = C.uciToMove(analyzedState, ln.pv[0]);
    const san = mv ? C.moveToText(analyzedState, mv) : ln.pv[0];
    const lwp = Math.round(winProb(toWhite(window.SF.cpify(ln))) * 100);
    div.innerHTML = `<span class="mv">${idx === 0 ? '★ ' : ''}${san}</span>` +
      `<span class="cp">${fmtEval(toWhite(window.SF.cpify(ln)))} <span class="wp">${lwp}%</span></span>`;
    if (mv && game.mode === 'analyze') {           // in the Analyzer, tap a line to play it
      div.classList.add('playable');
      div.title = `Play ${san} (${lwp}% for White)`;
      div.onclick = () => playBestMove(ln.pv[0]);
    }
    linesEl.appendChild(div);
  });
}

// Play one of the engine's suggested moves (Analyzer only). Branches if you're
// looking at an earlier position, so you can try any line the engine shows.
function playBestMove(uci) {
  if (game.mode !== 'analyze') return;
  if (isViewingHistory()) branchFromView();
  const mv = C.uciToMove(game.state, uci);
  if (mv) doMove(mv);
}

// ============ Game Review (Stockfish move classification) ============
function resetReviewUI() {
  $('review-progress').textContent = '';
  const rm = $('review-moves');
  if (rm) rm.innerHTML = '';
  $('review-summary').classList.add('hidden');
  $('cancel-review').classList.add('hidden');
  $('review-game').classList.remove('hidden');
  $('review-game').disabled = false;
}

const REVIEW_DEPTH = 12;
// Remember each position we've graded (keyed by FEN) so re-reviewing only has to
// look at the new position — that's what makes auto-review feel instant.
const evalCache = new Map();

async function evalPosition(state) {
  const status = C.gameStatus(state);
  if (status === 'checkmate' || status === 'stalemate') {
    return { best: status === 'checkmate' ? -100000 : 0, second: null, bestUci: null };
  }
  const fen = C.toFEN(state);
  if (evalCache.has(fen)) return evalCache.get(fen);
  const r = await window.SF.go(fen, { depth: REVIEW_DEPTH, multipv: 2 });
  const e = {
    best: r.lines[0] ? window.SF.cpify(r.lines[0]) : 0,
    second: r.lines[1] ? window.SF.cpify(r.lines[1]) : null,
    bestUci: r.bestmove,
  };
  evalCache.set(fen, e);
  return e;
}

// auto = true means "quiet": triggered automatically after a move, no button flicker.
async function reviewGame(opts) {
  const auto = !!(opts && opts.auto);
  if (!isMember() || !window.SF || game.reviewing) return;
  if (game.history.length === 0) {
    if (!auto) $('review-progress').textContent = 'Play some moves first.';
    return;
  }
  game.reviewing = true;
  game.reviewCancel = false;
  if (!auto) {
    $('review-game').classList.add('hidden');
    $('cancel-review').classList.remove('hidden');
  }

  const myGen = game.gen;
  const states = game.stateHistory.slice(); // snapshot; length = plies + 1
  const evals = new Array(states.length).fill(null);
  for (let i = 0; i < states.length; i++) {
    if (game.reviewCancel || game.gen !== myGen) { game.reviewing = false; resetReviewUI(); return; }
    const fen = C.toFEN(states[i]);
    if (!evalCache.has(fen)) $('review-progress').textContent = 'Reviewing…';
    evals[i] = await evalPosition(states[i]);
  }
  if (game.gen !== myGen) { game.reviewing = false; return; }

  for (let i = 0; i < game.moveHistory.length; i++) {
    game.classifications[i] = classifyPly(i, evals);
  }
  game.reviewing = false;
  renderMoves();
  renderReviewSummary();
  renderReviewMoves();
  $('review-progress').textContent = '';
  $('cancel-review').classList.add('hidden');
  $('review-game').classList.remove('hidden');
  $('review-game').textContent = 'Re-run review';
}


// Convert a centipawn score to a win probability (0..1) for the side it favors.
function winProb(cp) { return 1 / (1 + Math.exp(-cp / 350)); }

// How much material side S is leaving hanging after its move (SEE-lite, one recapture).
// `afterState` is the position with the OPPONENT to move. Returns centipawns (e.g. 320 = a knight).
function hangingValueFor(S, afterState) {
  let maxGain = 0;
  for (const m of C.legalMoves(afterState)) {
    const victim = afterState.board[m.to];
    if (victim === '' || C.colorOf(victim) !== S) continue; // must capture one of S's pieces
    const victimVal = C.PIECE_VALUE[victim.toLowerCase()];
    const afterCap = C.applyMove(afterState, m); // now S to move
    let recapCost = 0;
    for (const r of C.legalMoves(afterCap)) {
      if (r.to === m.to) { recapCost = C.PIECE_VALUE[afterCap.board[m.to].toLowerCase()]; break; }
    }
    const gain = victimVal - recapCost; // opponent's net material win
    if (gain > maxGain) maxGain = gain;
  }
  return maxGain;
}

// Classify the move played at ply i using the per-position evals.
// Loss is measured as a drop in win probability (robust in lopsided games),
// matching how modern engines grade moves.
function classifyPly(i, evals) {
  // White's very first move uses the fixed table chosen above.
  if (i === 0) return classifyFirstMove(game.history[0]);

  const before = game.stateHistory[i];
  const after = game.stateHistory[i + 1];
  const S = before.turn;
  const playedUci = moveToUci(game.moveHistory[i]);

  const scoreBest = evals[i].best;                        // best for S (S perspective)
  const second = evals[i].second;                         // 2nd best for S
  const nextBest = evals[i + 1] ? evals[i + 1].best : 0;  // best for opponent at P_{i+1}
  const playedValue = -nextBest;                          // played move value, S perspective
  const isBest = playedUci && evals[i].bestUci === playedUci;

  const bestWP = winProb(scoreBest);
  const playedWP = winProb(playedValue);
  const drop = Math.max(0, bestWP - playedWP);            // 0..1 win-prob lost
  const mateForS = scoreBest >= 90000;
  const hang = hangingValueFor(S, after);                 // material S left en prise
  // A capture isn't a sacrifice — subtract what S won on this move so an even
  // trade (e.g. BxN, recaptured) doesn't look like giving a piece away.
  const captured = captureInfo(before, game.moveHistory[i]);
  const capturedVal = captured ? C.PIECE_VALUE[captured.toLowerCase()] : 0;
  const netSac = Math.max(0, hang - capturedVal);         // material genuinely given up

  if (isBookMove(i)) return 'book';

  // Forced: only one legal move — you had no choice, so it's neither good nor bad.
  if (C.legalMoves(before).length === 1) return 'forced';

  // Brilliant / Legendary: a sound sacrifice — you genuinely give up material yet
  // the move is best/excellent and keeps you doing well. A plain trade is NOT a sac.
  // Legendary = a queen-level sac or a sac that forces mate (à la Marshall's Qg3!!).
  const soundSac = netSac >= 200 && playedWP >= 0.45 && (isBest || drop <= 0.05);
  if (soundSac) return (mateForS || netSac >= 800) ? 'legendary' : 'brilliant';

  // Chaos: a crazy, wild move — you give up material but the eval barely moves (little
  // drop AND no clear gain), so the position stays tense and about even, not an inaccuracy.
  if (netSac >= 100 && drop <= 0.08 && Math.abs(playedValue) <= 90) return 'chaos';

  // (Allowing a forced mate is no longer auto-Fatal — a mate is worth ~10 pawns
  // below, so it's graded by the eval SWING: fatal only if you were doing OK first.)

  // Great: the clearly best move when every alternative is far worse.
  if (isBest && second != null && (winProb(scoreBest) - winProb(second)) >= 0.15 && drop <= 0.03) {
    return 'great';
  }

  // Everything else is graded by CENTIPAWN LOSS — how many centipawns worse than the
  // best move it is (100 cp = 1 pawn). Openings and middlegame use the same ladder.
  // A forced mate counts as ~10 pawns (not infinite), so allowing mate is judged by
  // the eval SWING: from an equal spot it lands right at the Blunder/Fatal edge.
  const cap = s => (s >= 90000 ? 1000 : s <= -90000 ? -1000 : Math.max(-1000, Math.min(1000, s)));
  const cpLoss = Math.max(0, cap(scoreBest) - cap(playedValue));

  if (isBest) return 'best';

  // Miss: you had a winning chance (a big edge or a forced mate) and let a big slice
  // slip — a 1.5–5 pawn loss — yet you're still not losing and didn't hang material.
  const missedWin = (mateForS || bestWP >= 0.72) && cpLoss >= 150 && cpLoss <= 500 && playedWP >= 0.40 && netSac < 300;
  if (missedWin) return 'miss';

  // Hung a whole piece for nothing → a Blunder (a catastrophic loss → Fatal Blunder).
  if (netSac >= 300) return cpLoss >= 1000 ? 'shame' : 'blunder';

  // The loss ladder (exact centipawns; 100 cp = 1 pawn). Each number is the MINIMUM loss
  // for that grade, so e.g. a 0.87-pawn (87 cp) slip is an Inaccuracy, never a Mistake —
  // a Mistake needs a full pawn (100 cp) minimum.
  if (cpLoss < 10)    return 'excellent';   // < 0.10  (Very Good)
  if (cpLoss < 20)    return 'good';        // 0.10–0.19
  if (cpLoss < 30)    return 'okay';        // 0.20–0.29
  if (cpLoss < 50)    return 'interesting'; // 0.30–0.49
  if (cpLoss < 100)   return 'dubious';     // 0.50–0.99  (Inaccuracy)
  if (cpLoss < 200)   return 'mistake';     // 1.00–1.99  (Mistake — 1 pawn minimum)
  if (cpLoss < 1000)  return 'blunder';     // 2.00–9.99
  return 'shame';                           // ≥ 10.00  (Fatal Blunder)
}

function renderReviewSummary() {
  const counts = { w: {}, b: {} };
  for (let i = 0; i < game.classifications.length; i++) {
    const key = game.classifications[i];
    if (!key) continue;
    const side = i % 2 === 0 ? 'w' : 'b';
    counts[side][key] = (counts[side][key] || 0) + 1;
  }
  fillCounts($('rev-white'), counts.w);
  fillCounts($('rev-black'), counts.b);
  $('review-summary').classList.remove('hidden');
}

// Move-by-move grades, shown inside the Analyzer panel so they're easy to see.
function renderReviewMoves() {
  const el = $('review-moves');
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < game.history.length; i++) {
    const key = game.classifications[i];
    const chip = document.createElement('button');
    chip.className = 'rm-chip';
    if (game.viewIndex === i + 1) chip.classList.add('active');
    const num = i % 2 === 0 ? `${i / 2 + 1}.` : '';
    let html = `<span class="rm-no">${num}</span><span class="rm-san">${game.history[i]}</span>`;
    if (key && MARKS[key]) {
      html += `<span class="mark ${MARKS[key].cls}" title="${MARKS[key].label}">${MARKS[key].sym}</span>`;
    }
    chip.innerHTML = html;
    chip.onclick = () => viewPly(i); // click a move → jump the board there
    el.appendChild(chip);
  }
}

// Show the board position right after move `i`, and that position's eval.
function viewPly(i) {
  game.viewIndex = i + 1;            // stateHistory index of the position after move i
  game.selected = null;
  game.legalForSel = [];
  renderBoard();
  renderReviewMoves();               // re-highlight the active chip
  // Refresh the engine panel for THIS position: eval + top choices for where we went back to.
  const panelOpen = !$('analysis-modal').classList.contains('hidden') && engineAllowed();
  if (panelOpen) scheduleAnalysis({ skipReview: true }); // debounced: real top choices for this position
  else showViewedEval();                                 // panel closed: just keep the eval bar current
  const liveBtn = $('view-live');
  if (liveBtn) liveBtn.classList.remove('hidden');
  $('status-bar').textContent = `Viewing after ${moveNumberLabel(i)} ${game.history[i]} — tap board for live`;
}

function moveNumberLabel(i) {
  return (i % 2 === 0) ? `${i / 2 + 1}.` : `${Math.floor(i / 2) + 1}…`;
}

function goLive() {
  game.viewIndex = null;
  renderBoard();
  renderReviewMoves();
  renderStatus();
  const liveBtn = $('view-live');
  if (liveBtn) liveBtn.classList.add('hidden');
  if (!$('analysis-modal').classList.contains('hidden') && engineAllowed()) runAnalysis();
}

// Analyzer only: make the currently-viewed past position the live one (dropping the
// later moves) so you can play a DIFFERENT move and explore another line.
function branchFromView() {
  const V = game.viewIndex;                       // stateHistory index (position after V moves)
  if (V == null) return;
  game.stateHistory = game.stateHistory.slice(0, V + 1);
  game.moveHistory = game.moveHistory.slice(0, V);
  game.history = game.history.slice(0, V);
  game.classifications = game.classifications.slice(0, V);
  game.state = C.cloneState(game.stateHistory[V]);
  game.viewIndex = null;
  game.selected = null;
  game.legalForSel = [];
  game.over = false;
  game.lastMove = V > 0 ? { from: game.moveHistory[V - 1].from, to: game.moveHistory[V - 1].to } : null;
  recomputeCaptured();
  const liveBtn = $('view-live'); if (liveBtn) liveBtn.classList.add('hidden');
  resetReviewUI();
}

// Rebuild the captured piles from the board (used after branching to a new line).
function recomputeCaptured() {
  const full = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const w = { p: 0, n: 0, b: 0, r: 0, q: 0 }, b = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  for (const pc of game.state.board) {
    if (!pc) continue;
    const t = pc.toLowerCase();
    if (t === 'k') continue;
    (C.isWhite(pc) ? w : b)[t]++;
  }
  game.capturedByWhite = []; game.capturedByBlack = [];
  for (const t of ['q', 'r', 'b', 'n', 'p']) {
    for (let k = 0; k < Math.max(0, full[t] - b[t]); k++) game.capturedByWhite.push(t);            // black pieces gone
    for (let k = 0; k < Math.max(0, full[t] - w[t]); k++) game.capturedByBlack.push(t.toUpperCase()); // white pieces gone
  }
}

// Put the viewed position's eval into the eval bar (from the cache, or ask Stockfish).
function showViewedEval() {
  if (!isMember() || !window.SF) return;
  const st = displayState();
  const fen = C.toFEN(st);
  const setBar = (cpSideToMove) => {
    const cpWhite = st.turn === 'w' ? cpSideToMove : -cpSideToMove;
    $('eval-num').textContent = fmtEval(cpWhite);
    const pct = 100 / (1 + Math.exp(-cpWhite / 400));
    $('eval-fill').style.width = pct.toFixed(1) + '%';
  };
  const cached = evalCache.get(fen);
  if (cached) { setBar(cached.best); return; }
  $('eval-num').textContent = '…';
  window.SF.go(fen, { depth: 14, multipv: 1 }).then(r => {
    if (C.toFEN(displayState()) !== fen) return; // user moved on
    const cp = r.lines[0] ? window.SF.cpify(r.lines[0]) : 0;
    evalCache.set(fen, { best: cp, second: r.lines[1] ? window.SF.cpify(r.lines[1]) : null, bestUci: r.bestmove });
    setBar(cp);
  });
}

function fillCounts(el, c) {
  el.innerHTML = '';
  for (const key of MARK_ORDER) {
    if (!c[key]) continue;
    const row = document.createElement('div');
    row.className = 'rev-row';
    row.innerHTML = `<span class="mark ${MARKS[key].cls}">${MARKS[key].sym}</span>` +
      `<span class="rev-label">${MARKS[key].label}</span><span class="rev-n">${c[key]}</span>`;
    el.appendChild(row);
  }
  if (!el.children.length) el.innerHTML = '<div class="rev-row rev-empty">—</div>';
}

// ============ Event wiring ============
function wireEvents() {
  // mode cards
  document.querySelectorAll('.mode-card').forEach(card => {
    card.onclick = () => {
      document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const mode = card.dataset.mode;
      addStatToSet('modesPlayedList', mode);   // achievements: which of the 9 modes you've tried
      $('difficulty-panel').classList.add('hidden');
      if (mode === 'ai') {
        game.mode = 'ai';
        renderEngineButtons(); // ensure the engine buttons are populated
        $('difficulty-panel').classList.remove('hidden');
        $('difficulty-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else if (mode === 'analyze') {
        if (!requireBronze()) return;       // Analyzer is a Bronze perk
        game.mode = 'analyze';
        openAnalyzerChooser();
      } else if (mode === 'bots') {
        if (!requireBronze()) return;       // Bots are a Bronze perk
        openBotsChooser();
      } else if (mode === 'online') {
        openOnlineModal(); // live play on the Chesser server
      } else if (mode === 'chat') {
        if (!requireGold()) return;      // Chat is a Gold perk
        openChatRoom();
      } else if (mode === 'achievements') {
        openAchModal();
      } else if (mode === 'learn') {
        openLearnModal();               // free step-by-step chess lessons
      } else if (mode === 'puzzles') {
        openPuzzleTypeChooser();          // ask Mate or Tactics first
      } else if (mode === 'packs') {
        openPacksModal();
      } else {
        // friends: free board, both sides move, no AI
        game.mode = 'friends';
        game.difficulty = null;
        startGame();
      }
    };
  });

  // difficulty buttons
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.onclick = () => {
      game.difficulty = btn.dataset.diff;
      game.humanColor = document.querySelector('input[name="side"]:checked').value;
      startGame();
    };
  });

  // game controls
  $('new-game').onclick = backToHome;
  $('flip-board').onclick = () => { game.flipped = !game.flipped; renderBoard(); };
  $('open-analysis').onclick = () => openEngine('eval');
  $('open-analyzer').onclick = () => openEngine('full');
  $('analysis-close').onclick = () => $('analysis-modal').classList.add('hidden');
  $('analyzer-close').onclick = () => $('analyzer-modal').classList.add('hidden');
  $('analyze-setup').onclick = startAnalyzeSetup;
  $('bots-close').onclick = () => $('bots-modal').classList.add('hidden');
  $('online-close').onclick = () => { leaveOnline(); $('online-modal').classList.add('hidden'); };
  $('online-find').onclick = onlineFind;
  $('online-cancel').onclick = onlineCancel;
  $('open-lichess').onclick = () => {
    window.open('https://lichess.org', '_blank', 'noopener');
    $('online-modal').classList.add('hidden');
  };
  $('view-live').onclick = goLive;

  // puzzles
  $('puzzle-home').onclick = () => { game.mode = null; backToHome(); };
  $('puzzle-next').onclick = loadRandomPuzzle;
  $('puzzle-hint').onclick = puzzleHint;
  // Easy / Normal / Hard puzzle difficulty (bottom-middle).
  document.querySelectorAll('#puzzle-difficulty .pdiff-btn').forEach(b => {
    b.onclick = () => { game.puzzleLevel = b.dataset.plevel; puzzleLevelRun = 0; loadRandomPuzzle(); };
  });
  // Puzzle type chooser: Mate, Tactics, or Endgame.
  $('puzzle-type-close').onclick = () => $('puzzle-type-modal').classList.add('hidden');
  $('ptype-opening-tactic').onclick = () => startPuzzles('opening', 'tactical');
  $('ptype-opening-pos').onclick = () => startPuzzles('opening', 'positional');
  $('ptype-mate').onclick = () => startPuzzles('mate');
  $('ptype-tactic').onclick = () => startPuzzles('tactic');
  $('ptype-endgame').onclick = () => startPuzzles('endgame');

  // achievements
  { const ac = $('ach-close'); if (ac) ac.onclick = () => $('ach-modal').classList.add('hidden'); }
  // packs
  $('packs-close').onclick = () => $('packs-modal').classList.add('hidden');
  $('open-free-pack').onclick = openFreePack;
  $('pay-btn').onclick = openPayModal;
  $('topbar-pay').onclick = openPayModal;
  $('pay-close').onclick = () => $('pay-modal').classList.add('hidden');
  // Clicking a trial first asks Silver or Gold; then that tier's trial starts.
  $('pay-demo').onclick = () => { pendingTrial = 'demo'; $('pay-trial-choose').classList.remove('hidden'); };
  $('pay-demo-special').onclick = () => { if (!isJuly4()) return; pendingTrial = 'special'; $('pay-trial-choose').classList.remove('hidden'); };
  $('pay-trial-silver').onclick = () => { if (pendingTrial) startDemo(pendingTrial, 'silver'); };
  $('pay-trial-gold').onclick = () => { if (pendingTrial) startDemo(pendingTrial, 'gold'); };
  $('pay-s1').onclick = () => buySilver('year');
  $('pay-s5').onclick = () => buySilver('life');
  $('pay-g1').onclick = () => buyGold('gold-year');
  $('pay-g5').onclick = () => buyGold('gold-life');
  // First ask Silver or Gold; clicking one reveals that tier's plans.
  $('pay-pick-silver').onclick = () => { $('pay-silver-plans').classList.remove('hidden'); $('pay-gold-plans').classList.add('hidden'); };
  $('pay-pick-gold').onclick = () => { $('pay-gold-plans').classList.remove('hidden'); $('pay-silver-plans').classList.add('hidden'); };

  // Music on/off switch at the bottom.
  const musicBtn = $('music-toggle');
  if (musicBtn && window.ChesserMusic) {
    // Remember the choice so it stays the same next time you open the app.
    if (localStorage.getItem('chesserMusic') === 'on') {
      // Browsers won't play sound until you click, so we turn it on at first click.
      const kick = () => { window.ChesserMusic.start(); paintMusicBtn(true); document.removeEventListener('click', kick); };
      document.addEventListener('click', kick);
    }
    musicBtn.onclick = () => {
      const on = window.ChesserMusic.toggle();
      localStorage.setItem('chesserMusic', on ? 'on' : 'off');
      paintMusicBtn(on);
    };
    // Restore the saved tune choice.
    const savedTrack = parseInt(localStorage.getItem('chesserTrack') || '0', 10);
    window.ChesserMusic.setTrack(savedTrack);
    // "More" opens the music panel — a Bronze perk, so you can't go in without it.
    if ($('music-more')) $('music-more').onclick = () => {
      if (!isMember()) { requireBronze(); return; }   // pops the sign-in box
      openMusicPanel();
    };
    paintMusicMoreBtn();
    if ($('music-close')) $('music-close').onclick = () => $('music-modal').classList.add('hidden');
  }
  // Update how the music button looks (on = highlighted, note dancing).
  function paintMusicBtn(on) {
    const b = $('music-toggle');
    if (!b) return;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.querySelector('.music-label').textContent = on ? 'Music: On' : 'Music: Off';
  }

  $('resign').onclick = () => {
    if (game.over) return;
    if (game.mode === 'online') {                 // tell the opponent, then end
      onlineSend({ type: 'resign' });
      endGame('You resigned', `${game.onlineOpponent} wins.`);
      leaveOnline();
      return;
    }
    const loser = game.mode === 'ai'
      ? (game.humanColor === 'w' ? 'White' : 'Black')
      : (game.state.turn === 'w' ? 'White' : 'Black');
    const winner = loser === 'White' ? 'Black' : 'White';
    // Resigning a bot game counts as a loss for your rating.
    const result = game.mode === 'ai' && game.botName ? 0 : null;
    endGame('Resigned', `${loser} resigned. ${winner} wins.`, result);
  };

  // over modal
  $('over-newgame').onclick = () => { $('over-modal').classList.add('hidden'); backToHome(); };

  // auth
  $('auth-btn') && ($('auth-btn').onclick = openAuth);
  $('auth-close').onclick = closeAuth;
  $('auth-form').onsubmit = handleAuthSubmit;
  $('auth-toggle-btn').onclick = () => { authMode = authMode === 'signin' ? 'signup' : 'signin'; authMoreOpen = false; syncAuthMode(); $('auth-error').textContent = ''; };
  $('auth-more').onclick = () => { authMoreOpen = true; syncAuthMode(); $('auth-contact').focus(); };
  $('unlock-analysis').onclick = openAuth;

  // analysis + review (the eval auto-runs on open; there's no separate Run button)
  { const ra = $('run-analysis'); if (ra) ra.onclick = runAnalysis; }
  $('review-game').onclick = reviewGame;
  $('cancel-review').onclick = () => { game.reviewCancel = true; };

  // close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', e => {
      if (e.target === ov && ov.id !== 'promo-modal') ov.classList.add('hidden');
    });
  });
}

// A Bronze gate: if not signed in, pop the sign-in box and stop.
function requireBronze() {
  if (isMember()) return true;
  // Signed in as Free → ask for an email/phone to upgrade. Signed out → sign up.
  openAuth(isSignedIn() ? 'upgrade' : 'signup');
  return false;
}
// Gate a Gold-only perk: Gold members pass; Bronze/Silver see the Pay box (Gold plans);
// Free/signed-out are asked to sign up / add a contact first.
function requireGold() {
  if (isGold()) return true;
  if (isMember()) openPayModal();
  else requireBronze();
  return false;
}

// ============ Bots chooser (Bronze) ============
function openBotsChooser() {
  renderBotsList();
  $('bots-modal').classList.remove('hidden');
}

function renderBotsList() {
  const wrap = $('bots-list');
  wrap.innerHTML = '';
  const myR = getRating();
  const head = document.createElement('div');
  head.className = 'bots-myrating';
  head.innerHTML = myR == null
    ? `You: <span class="my-title">Unrated</span> — beat a bot to earn your rating!`
    : `You: <span class="my-title">${ratingTitle(myR)}</span> <strong>${myR}</strong>`;
  wrap.appendChild(head);

  const addGroup = (label, bots) => {
    const h = document.createElement('div');
    h.className = 'bots-group-head';
    h.textContent = label;
    wrap.appendChild(h);
    bots.sort((a, b) => a.rating - b.rating).forEach(bot => {
      const beaten = myR != null && myR >= bot.rating;
      const row = document.createElement('button');
      row.className = 'bot-row' + (bot.engine ? ' bot-engine' : '');
      const titleTag = bot.title ? `<span class="bot-title">${bot.title}</span> ` : '';
      const engineTag = bot.engine ? `<span class="engine-tag">⚙ engine</span>` : '';
      const eraTag = bot.era ? `<span class="bot-era">${escapeHtml(bot.era)}</span>` : '';
      row.innerHTML = `<span class="bot-face">${bot.icon}</span>` +
        `<span class="bot-info"><span class="bot-name">${titleTag}${escapeHtml(bot.name)}</span>${eraTag}${engineTag}</span>` +
        `<span class="bot-rating">${bot.rating}${beaten ? ' ✓' : ''}</span>`;
      row.onclick = () => startBotGame(bot);
      wrap.appendChild(row);
    });
  };

  // Character bots, grouped by their label (Beginner … Master, then Grandmasters).
  const groups = [];
  BOTS.forEach(b => { if (!groups.includes(b.groupLabel)) groups.push(b.groupLabel); });
  groups.forEach(label => addGroup(label, BOTS.filter(b => b.groupLabel === label)));
}

function startBotGame(bot) {
  $('bots-modal').classList.add('hidden');
  game.mode = 'ai';
  game.difficulty = bot.diff;
  game.humanColor = 'w';
  // Set the opponent before startGame so it's ready before the first AI move.
  pendingBot = { name: botDisplayName(bot), rating: bot.rating, engine: !!bot.engine, elo: bot.elo || null };
  startGame();
  renderStatus();
}

// Tom's chat is a scripted character — his lines are pre-written (not a real AI brain).
// Tom is an 8-year-old chess prodigy (the GOAT) and Tim's big brother.
const TOM_LINES = {
  greet: ['Hi! I\'m Tom, I\'m 8 and I\'m the GOAT. 🐐👑', 'Hey! Wanna play? I almost never lose. 😄', 'I\'m Tom, Tim\'s big brother. Ready?'],
  reply: ['Cool move!', 'Hehe, I saw that coming. 😏', 'Ooh, tricky one!', 'My little brother Tim tries that too!',
          'Nice — but I\'m the GOAT. 🐐', 'Good luck, you\'ll need it! 😄', 'I\'ve been playing since I was 4!', 'Let\'s goooo! ♟️'],
};
function tomPick(a) { return a[Math.floor(Math.random() * a.length)]; }
function showTomChat() {
  const box = $('online-chat'); if (!box) return;
  box.classList.remove('hidden');
  $('chat-log').innerHTML = '';
  $('chat-locked').classList.add('hidden');
  const wrap = $('chat-quick'); wrap.classList.remove('hidden'); wrap.innerHTML = '';
  QUICK_CHATS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'chat-btn';
    b.textContent = t;
    b.onclick = () => tomChatSend(t);
    wrap.appendChild(b);
  });
  addChatLine('Tom', tomPick(TOM_LINES.greet));
}
function tomChatSend(text) {
  addChatLine('You', text);
  setTimeout(() => addChatLine('Tom', tomPick(TOM_LINES.reply)), 500); // Tom "replies" with a canned line
}

// ============ Chat room (Gold) — a sidebar of chats: Tom or the World ============
function openChatRoom() {
  showScreen('chatroom');
  $('chat-back').onclick = backToHome;
  document.querySelectorAll('.chat-contact').forEach(c => {
    c.onclick = () => selectChat(c.dataset.chat);
  });
  selectChat('tom'); // open Tom by default
}
function selectChat(which) {
  leaveWorldChat();                    // drop any live world connection when switching
  document.querySelectorAll('.chat-contact').forEach(c =>
    c.classList.toggle('active', c.dataset.chat === which));
  const main = $('chat-main');
  if (which === 'world') startWorldChat(main);
  else talkToTom(main);                // Tom is just for talking — no game here
}
// Talk with Tom — a safe scripted character, so free typing is allowed here.
function talkToTom(main) {
  main.innerHTML =
    '<div class="chatconvo">' +
      '<div class="chatconvo-head"><span class="cc-face">🦈</span> Tom ' +
        '<span class="chatconvo-sub">age 8 · the GOAT 🐐</span>' +
        '<button id="tom-play" class="chat-play-btn">♟️ Play me</button></div>' +
      '<div id="tom-log" class="chat-log"></div>' +
      '<div id="tom-quick" class="chat-quick"></div>' +
      '<form id="tom-form" class="chat-compose" autocomplete="off">' +
        '<input id="tom-input" class="chat-input" maxlength="120" placeholder="Type anything to Tom…" />' +
        '<button type="submit" class="chat-send">Send</button>' +
      '</form>' +
    '</div>';
  const log = $('tom-log');
  const wrap = $('tom-quick');
  QUICK_CHATS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'chat-btn';
    b.textContent = t;
    b.onclick = () => tomSay(log, t);
    wrap.appendChild(b);
  });
  $('tom-play').onclick = () => startEngineGame(TOM_ENGINE);   // challenge Tom to a game
  $('tom-form').onsubmit = (e) => {
    e.preventDefault();
    const inp = $('tom-input');
    const t = inp.value.trim();
    if (!t) return;
    inp.value = '';
    tomSay(log, t);                    // you can type anything to Tom
  };
  chatAppend(log, 'Tom', tomPick(TOM_LINES.greet));
}
// 20 real, kid-friendly chess tips. These are the 20 Tom shares. He can also string them
// together into over a billion distinct tip-messages (see makeTip / tipSpaceSize), so his
// "I have a billion tips" is genuinely true.
const TOM_TIPS = [
  'To win, grab the center first: push your e and d pawns out! ♟️',
  'Get your knights and bishops out early, before your queen. 🐴',
  'Castle early so your king hides safe in the corner. 🏰',
  'Don\'t bring your queen out too soon, she gets chased around. 👑',
  'Every turn, look for checks, captures, and threats. 👀',
  'Before you move, ask what your opponent just attacked. 🤔',
  'Try a fork: hit two pieces at once with your knight! 🐴',
  'A pin freezes a piece so it can\'t move out of the way. 📌',
  'A skewer makes a big piece move so you grab the one behind. 🍢',
  'Take any piece that nobody is guarding. 🍴',
  'Guard your own pieces before you attack. 🛡️',
  'Give your king an escape square so you don\'t get back-rank mated. 🚪',
  'Points: pawn 1, knight 3, bishop 3, rook 5, queen 9. 🔢',
  'When you\'re ahead, trade pieces to make winning easy. 🔁',
  'Put your rooks on columns that have no pawns. 🏯',
  'In the endgame, march your king toward the center. 🚶',
  'Push a passed pawn: one with no enemy pawns ahead of it. 🏁',
  'Watch for Scholar\'s Mate: protect f7 (or f2) early. 🛡️',
  'Slow down and double-check your move before you play it. 🐢',
  'Have a plan: fix your worst piece or attack a weakness. 🗺️',
];
// Tom gives one of the tips above, with a friendly opener/tail for variety, and never
// the same one twice in a row. No fake count — he just shares real tips.
let _lastTipIdx = -1;
const TIP_OPENERS = ['', '', '', 'GOAT secret: ', 'Here\'s a good one: ', 'Try this: ', 'Pro move: ', 'Big tip: ', 'Sneaky one: ', 'Winning idea: ', 'Listen up: '];
const TIP_TAILS = ['', '', '', '🐐', 'Trust me! 😎', 'That\'s how champs play. 🏆', 'You got this! 💪', 'Give it a go! 🎯', 'Sharks love it! 🦈', 'Easy wins! ✨'];
const TIP_CONNECTORS = ['Also,', 'Plus,', 'And remember,', 'One more:', 'Oh, and', 'Next,'];
// A single tip, dressed with an opener/tail (used for exact answers like a named trap).
function flavorTip(text) {
  const open = tomPick(TIP_OPENERS);
  const tail = tomPick(TIP_TAILS);
  return open + text + (tail ? ' ' + tail : '');
}
// Usually ONE of the 20 tips; now and then a few strung together. Stringing his 20 tips
// together with different openers, joiners and tails makes over a billion DISTINCT messages
// (see tipSpaceSize) — a real, countable number, so "he has a billion" is true, not a lie.
function makeTip() {
  const r = Math.random();
  const k = r < 0.6 ? 1 : r < 0.85 ? 2 : r < 0.95 ? 3 : 4;   // mostly one tip; rarely up to four
  const idxs = [];
  while (idxs.length < k) { const i = Math.floor(Math.random() * TOM_TIPS.length); if (!idxs.includes(i)) idxs.push(i); }
  _lastTipIdx = idxs[idxs.length - 1];
  let body = TOM_TIPS[idxs[0]];
  for (let j = 1; j < k; j++) {
    const nxt = TOM_TIPS[idxs[j]];
    body += ' ' + tomPick(TIP_CONNECTORS) + ' ' + nxt.charAt(0).toLowerCase() + nxt.slice(1);
  }
  const open = tomPick(TIP_OPENERS), tail = tomPick(TIP_TAILS);
  return open + body + (tail ? ' ' + tail : '');
}
// How many DISTINCT tip-messages Tom can actually build from his 20 tips (chaining 1..4,
// with each distinct opener / joiner / tail). This really is over a billion.
function tipSpaceSize() {
  const uniq = (a) => new Set(a).size;
  const O = uniq(TIP_OPENERS), C = uniq(TIP_CONNECTORS), T = uniq(TIP_TAILS);
  let perm = 1, seqs = 0;
  for (let k = 1; k <= 4; k++) { perm *= (TOM_TIPS.length - (k - 1)); seqs += perm * Math.pow(C, k - 1); }
  return O * T * seqs;
}
// Fool's Mate isn't in the main list, but Tom gives it exactly when you ask for it by name.
const FOOLS_MATE_TIP = "Fool's Mate: if you push f3 then g4, Black plays Qh4 and it's checkmate in 2! Never make those two pawn moves. 🚫";
// If you name a SPECIFIC trap or idea, Tom gives that exact tip instead of a random one.
function topicTip(text) {
  const t = text.toLowerCase();
  const one = (i) => { _lastTipIdx = i; return flavorTip(TOM_TIPS[i]); };
  if (/fool'?s? ?mate|\bf3\b.*\bg4\b|\bg4\b.*\bf3\b/.test(t)) return flavorTip(FOOLS_MATE_TIP);
  if (/scholar'?s? ?mate|four[- ]?move mate|4[- ]?move mate/.test(t)) return one(17);
  if (/\btraps?\b/.test(t)) return Math.random() < 0.5 ? flavorTip(FOOLS_MATE_TIP) : one(17);
  if (/\bforks?\b/.test(t)) return one(6);
  if (/\bpins?\b/.test(t)) return one(7);
  if (/\bskewers?\b/.test(t)) return one(8);
  if (/castl/.test(t)) return one(2);
  if (/back[- ]?rank/.test(t)) return one(11);
  if (/passed pawns?/.test(t)) return one(16);
  if (/\bcent(er|re)\b/.test(t)) return one(0);
  if (/develop|knights? out|bishops? out/.test(t)) return one(1);
  if (/piece values?|how much.*worth|\bpoints?\b/.test(t)) return one(12);
  if (/end ?game/.test(t)) return one(15);
  if (/\btrades?\b|trading/.test(t)) return one(13);
  if (/open files?|rooks?/.test(t)) return one(14);
  return null;
}
// Tom can chat about NON-chess stuff too — animals, food, fun things — so he's not a
// one-track chess robot. First match wins; returns null if it's not one of these topics.
function topicChat(text) {
  const t = text.toLowerCase();
  if (/\bgoats?\b/.test(t)) return 'Goats are awesome, and I\'M the GOAT! 🐐 (Greatest Of All Time!)';
  if (/gorillas?/.test(t)) return 'Gorillas are SUPER strong! 🦍 But one could never beat me at chess. 😎';
  if (/lions?/.test(t)) return 'Lions rule the jungle 🦁, and I rule the chessboard! 👑';
  if (/tigers?/.test(t)) return 'Tigers are fast and fierce! 🐯 Rawr!';
  if (/\bdogs?\b|puppy|puppies|doggo/.test(t)) return 'Dogs are the best! 🐶 Woof woof!';
  if (/\bcats?\b|kitten|kitty/.test(t)) return 'Cats are sneaky, just like a surprise checkmate! 🐱';
  if (/dinosaur|dino|t-?rex|raptor/.test(t)) return 'RAWR! 🦖 Dinosaurs are the coolest!';
  if (/dolphins?|whales?|octopus|turtles?/.test(t)) return 'Ocean animals rule! I\'m a shark, don\'t forget. 🦈';
  if (/monkey|chimp|ape\b/.test(t)) return 'Monkeys are so silly and fun! 🐵';
  if (/horses?|pony|ponies/.test(t)) return 'Horses are cool, the knight even jumps like a horse! 🐴';
  if (/snakes?/.test(t)) return 'Snakes are so slithery! 🐍 Ssssss!';
  if (/elephants?/.test(t)) return 'Elephants are HUGE and super smart! 🐘';
  if (/penguins?/.test(t)) return 'Penguins are the cutest little waddlers! 🐧';
  if (/unicorns?/.test(t)) return 'Unicorns are magical! 🦄✨';
  if (/eagles?|hawks?|\bbirds?\b|parrots?/.test(t)) return 'Birds can fly, how cool is that? 🦅';
  if (/bears?|panda/.test(t)) return 'Bears are big and strong! 🐻';
  if (/\bfrogs?\b/.test(t)) return 'Frogs go ribbit and hop everywhere! 🐸';
  if (/rabbits?|bunny|bunnies/.test(t)) return 'Bunnies are so cute and hoppy! 🐰';
  if (/\bfoxe?s?\b/.test(t)) return 'Foxes are clever and sneaky! 🦊';
  if (/pizza/.test(t)) return 'Pizza is the BEST food ever! 🍕 What toppings do you like?';
  if (/ice ?cream/.test(t)) return 'Ice cream! 🍦 Yum! What flavor?';
  if (/candy|chocolate|sweets|cookie/.test(t)) return 'Sweet treats! 🍫 So good!';
  if (/burgers?|fries|hot ?dog/.test(t)) return 'Burgers and fries, yum! 🍔🍟';
  if (/favou?rite colou?r|\bcolou?rs?\b/.test(t)) return 'My favorite color is ocean blue! 🌊 What\'s yours?';
  if (/video ?games?|roblox|minecraft|fortnite|xbox|playstation/.test(t)) return 'Video games are fun! But chess is my #1 game. ♟️😄';
  if (/school|homework|teacher|class/.test(t)) return 'School\'s okay, recess is the best part! 😄';
  if (/soccer|football|basketball|baseball|\bsports?\b|tennis/.test(t)) return 'Sports are fun! But chess is my favorite. ♟️';
  if (/\bmusic\b|songs?|singing/.test(t)) return 'I love fun music! 🎵';
  if (/movies?|\bfilm\b|cartoon/.test(t)) return 'Movies are great! 🎬 Got a favorite?';
  if (/space|planets?|rocket|\bmoon\b|\bstars?\b|astronaut/.test(t)) return 'Space is HUGE and amazing! 🚀🪐';
  if (/\bbirthday\b/.test(t)) return 'Yay, birthdays! 🎂 I love parties!';
  if (/cheetah/.test(t)) return 'Cheetahs are the FASTEST! 🐆 Zoom!';
  if (/giraffe/.test(t)) return 'Giraffes have the longest necks! 🦒';
  if (/wolf|wolves/.test(t)) return 'Wolves howl and hunt in packs! 🐺 Awooo!';
  if (/kangaroo/.test(t)) return 'Kangaroos hop super high! 🦘 Boing!';
  if (/koala/.test(t)) return 'Koalas are sleepy and cuddly! 🐨';
  if (/\bowls?\b/.test(t)) return 'Owls are wise and see in the dark! 🦉 Hoo!';
  if (/\bdeer\b|reindeer/.test(t)) return 'Deer are gentle and fast! 🦌';
  if (/hamster|guinea pig/.test(t)) return 'Hamsters stuff their cheeks, so cute! 🐹';
  if (/robots?/.test(t)) return 'Beep boop! 🤖 Robots are cool. But I do my own thinking!';
  if (/superhero|super ?man|spider ?man|batman/.test(t)) return 'Superheroes are awesome! 🦸 My superpower is chess!';
  if (/ninjas?/.test(t)) return 'Ninjas are sneaky, like a hidden checkmate! 🥷';
  if (/pirates?/.test(t)) return 'Arrr! 🏴‍☠️ Pirates hunt treasure, I hunt kings!';
  if (/dragons?/.test(t)) return 'Dragons breathe fire! 🐉 So cool!';
  if (/wizard|magic|spell/.test(t)) return 'Magic is amazing! ✨ My magic trick is a fork. 🐴';
  if (/rainbow/.test(t)) return 'Rainbows are so pretty! 🌈';
  if (/\brain\b|storm/.test(t)) return 'Rainy days are perfect for chess indoors! 🌧️♟️';
  if (/\bsnow\b|winter/.test(t)) return 'Snow days are the best! ❄️⛄';
  if (/\bsummer\b|beach/.test(t)) return 'Summer and the beach, so fun! 🏖️☀️';
  if (/christmas|santa/.test(t)) return 'Ho ho ho! 🎅 I want a chess set for Christmas!';
  if (/halloween|spooky|ghost/.test(t)) return 'Boo! 👻 Halloween is spooky fun!';
  if (/\bjokes?\b|funny thing/.test(t)) return 'Why did the pawn cross the board? To become a QUEEN! 👑😄';
  if (/tired|sleep|sleepy/.test(t)) return 'A little tired? A quick game always wakes me up! ♟️';
  if (/\bbored\b/.test(t)) return 'Bored? Let\'s play chess! ♟️ Tap Play me!';
  if (/\bnumber|math|counting\b/.test(t)) return 'I love numbers! A queen is worth 9, did you know? 🔢';
  return null;
}
// Real answers to "known" questions (simple math, facts, colors, counting, date/time),
// so Tom gives an actual answer instead of a random line. Returns null if he doesn't know.
function knownAnswer(text) {
  const t = text.toLowerCase();
  // simple arithmetic: "2+2", "3 plus 4", "5 times 6", "10 - 3", "8 divided by 2"
  const m = t.match(/(\d+)\s*(plus|minus|times|divided by|[+\-*/x×])\s*(\d+)/);
  if (m) {
    const a = +m[1], b = +m[3], op = m[2]; let r = null, sym = op;
    if (op === 'plus' || op === '+') { r = a + b; sym = '+'; }
    else if (op === 'minus' || op === '-') { r = a - b; sym = '-'; }
    else if (op === 'times' || op === '*' || op === 'x' || op === '×') { r = a * b; sym = '×'; }
    else if (op === 'divided by' || op === '/') { r = b !== 0 ? a / b : null; sym = '÷'; }
    if (r != null) return `${a} ${sym} ${b} = ${Number.isInteger(r) ? r : r.toFixed(2)}! 🔢`;
  }
  // colors
  if (/sky/.test(t) && /colou?r/.test(t)) return 'The sky is blue! 🌤️';
  if (/grass/.test(t) && /colou?r/.test(t)) return 'Grass is green! 🌱';
  if (/(sun\b)/.test(t) && /colou?r/.test(t)) return 'The sun looks yellow! ☀️';
  if (/snow/.test(t) && /colou?r/.test(t)) return 'Snow is white! ❄️';
  // counting facts
  if (/days? (in|a).*week|week.*days/.test(t)) return 'There are 7 days in a week! 📅';
  if (/months? (in|a).*year|year.*months/.test(t)) return 'There are 12 months in a year!';
  if (/hours? (in|a).*day|day.*hours/.test(t)) return 'There are 24 hours in a day! ⏰';
  if (/squares.*chess|chess.*squares|squares.*board|board.*squares/.test(t)) return 'A chess board has 64 squares! ♟️';
  if (/how many pieces|pieces.*start|start.*pieces/.test(t)) return 'Each side starts with 16 pieces! ♟️';
  if (/how many legs.*(spider)/.test(t)) return 'Spiders have 8 legs! 🕷️';
  if (/how many legs.*(insect|bug|ant|fly|bee)/.test(t)) return 'Insects have 6 legs! 🐜';
  if (/how many legs/.test(t)) return 'Most animals like dogs and cats have 4 legs! 🐾';
  // superlative facts
  if (/(biggest|largest).*animal/.test(t)) return 'The blue whale is the biggest animal ever! 🐋';
  if (/fastest.*animal|fastest land/.test(t)) return 'The cheetah is the fastest land animal! 🐆';
  if (/tallest.*animal/.test(t)) return 'The giraffe is the tallest animal! 🦒';
  if (/king of the jungle/.test(t)) return 'The lion is the king of the jungle! 🦁';
  if (/best.*chess.*player|greatest.*chess/.test(t)) return 'The GOAT, of course, that\'s me! 🐐👑';
  // date and time
  if (/(what|which).*(day|date).*(today|now|is it)|today.*(day|date)|date today/.test(t)) {
    const d = new Date(); return `Today is ${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}! 📅`;
  }
  if (/what.*time|time is it/.test(t)) {
    const d = new Date(); return `It's ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} where you are! ⏰`;
  }
  return null;
}
// Ranking / comparison questions ("best to worst gorilla lion goat", "shark vs lion",
// "who's stronger?"). Tom lists everything you named in order — and the Goat is always #1.
const RANKABLE = [
  ['goat', '🐐', 100], ['shark', '🦈', 82], ['lion', '🦁', 75], ['tiger', '🐯', 72], ['gorilla', '🦍', 68],
  ['bear', '🐻', 63], ['wolf', '🐺', 52], ['eagle', '🦅', 48], ['dog', '🐶', 42], ['cat', '🐱', 36],
  ['snake', '🐍', 30], ['rabbit', '🐰', 20], ['queen', '👑', 9], ['rook', '♜', 5], ['bishop', '♝', 3],
  ['knight', '🐴', 3], ['pawn', '♟️', 1],
];
function rankAnswer(text) {
  const t = text.toLowerCase();
  if (!/\brank\b|best to worst|worst to best|\border\b|who.{0,12}(win|stronger|better|best|tough)|which.{0,12}(better|best|stronger|win)|\bvs\b|versus|stronger than|who would win/.test(t)) return null;
  const found = RANKABLE.filter(([n]) => new RegExp('\\b' + n + 's?\\b').test(t));
  if (found.length < 2) return 'Hard to say! But one thing\'s for sure: the GOAT is always #1. 🐐👑';
  const worstFirst = /worst to best/.test(t);
  const sorted = [...found].sort((a, b) => worstFirst ? a[2] - b[2] : b[2] - a[2]);
  const list = sorted.map(([n, e], i) => `${i + 1}. ${e} ${n.charAt(0).toUpperCase() + n.slice(1)}`).join('   ');
  const goatIn = found.some(([n]) => n === 'goat');
  return `My ranking, ${worstFirst ? 'worst to best' : 'best to worst'}:  ${list}` + (goatIn ? '  (Goat is #1, because I\'M the GOAT! 🐐👑)' : '');
}
// For a leftover question: give a real tip if it sounds chess-y, else a friendly kid answer.
const CHESS_WORDS = /\b(chess|moves?|pieces?|king|queen|rook|bishop|knight|pawn|castl|check|mate|fork|pin|skewer|board|opening|endgame|tactic|wins?|beat|strateg|promot)\b/i;
const TOM_CURIOUS = ['Ooh, good question! I mostly know chess, but that sounds fun! 😄',
  'Hmm, not sure, I think about chess a LOT. What do you think? 🐐',
  'Cool question! 😎 Tell me more!',
  'Good one! I\'m just an 8-year-old chess kid though. 🐐'];
function questionReply(text) { return CHESS_WORDS.test(text) ? makeTip() : tomPick(TOM_CURIOUS); }
// Tom is scripted (no real AI brain), but he reads what you typed and answers to it,
// so it feels like a real chat. Each rule: [words to look for, what Tom replies].
// The FIRST matching rule wins; if nothing matches he uses a friendly generic line.
// '__TIP__' gives a real chess tip; '__PLAY__' offers a game.
const TOM_RULES = [
  [/\bhow are you|how r u|how are u|hows it going|how you doing\b/i, ['I\'m awesome! How are YOU? 😄', 'Super great! Ready to play? 🐐']],
  [/\b(how old|your age|old are you)\b/i, ['I\'m 8 years old! How old are you? 😄']],
  [/\b(your name|whats your name|who are you|who r u)\b/i, ['I\'m Tom! I\'m 8 and I\'m the GOAT. 🐐👑']],
  [/how many (tips|do you know)|so many tips|(million|billion) tips|\d ?(mil|bil)/i, '__BRAG__'],
  // Asking HOW to win / beat / play / get better → answer with a real tip.
  [/how (to|do|does|can|could|would|should|d[oi]).*(win|beat|play|castl|check|attack|good|better|move|open|defend|fork|mate|start)/i, '__TIP__'],
  [/\b(tips?|tricks?|advice|strateg|best move|best opening|get good|get better|be better|checkmate|help me)\b/i, '__TIP__'],
  [/\b(play|game|chess|match|vs|versus|challenge|rematch)\b/i, '__PLAY__'],
  [/\b(hi|hii+|hey|hello|yo|sup|howdy|hallo)\b/i, ['Hi there! 👋', 'Hey hey! 😄', 'Yo! 🦈']],
  [/\b(tim|brother|sibling)\b/i, ['Tim\'s my little brother! He\'s still learning. 👶']],
  [/shark|animal|ocean|\bseas?\b|fish/i, ['Sharks are the BEST! That\'s why I\'m 🦈.']],
  [/\b(love|like you|friend|nice|cool|awesome|amazing|great job|good job)\b/i, ['Aww, you\'re cool too! 😄', 'Thanks! You\'re awesome! 🌟']],
  [/\b(bye|goodbye|see ya|cya|good night|goodnight|gtg)\b/i, ['Bye! Come back and play soon! 👋', 'See ya! 🐐']],
  [/\b(thanks|thank you|thx|ty)\b/i, ['No problem! 😄', 'Anytime! 🦈']],
  [/\b(win|won|i beat|i can beat)\b/i, '__TIP__'],
  [/\b(lose|lost|i lost|too hard|hard)\b/i, ['Don\'t worry, you\'ll get better every game! 💪']],
  [/\b(haha|lol|lmao|hehe|funny|😂|🤣)\b/i, ['Hehe! 😎', 'Haha yeah! 😄']],
  [/\b(happy|good|fine|ok|okay|yes|yeah|yay)\b/i, ['Awesome! 😄', 'Let\'s go! ♟️']],
  [/\b(no|nope|nah|sad|bad|angry|mad)\b/i, ['Aw, cheer up! A game always helps. 🐐']],
  [/\?\s*$/, '__QUESTION__'],   // any other question → a chess tip if it's chess-y, else a fun answer
];
function tomSay(log, text) {
  chatAppend(log, 'You', text);
  bumpStat('tomChats');   // achievements: messages you send to Tom
  // Naming a specific chess idea (Fool's Mate, fork, castle...) or a fun topic (goats,
  // gorillas, pizza...) wins over everything else, so you get that exact answer.
  const exact = rankAnswer(text) || topicTip(text) || knownAnswer(text) || topicChat(text);
  if (exact != null) { setTimeout(() => chatAppend(log, 'Tom', exact), 500); return; }
  let reply = null, isPlay = false;
  for (const [re, out] of TOM_RULES) {
    if (re.test(text)) {
      if (out === '__PLAY__') { reply = 'You wanna play me? Tap ♟️ Play me up top! 🐐'; isPlay = true; }
      else if (out === '__TIP__') { reply = makeTip(); }
      else if (out === '__QUESTION__') { reply = questionReply(text); }
      else if (out === '__BRAG__') { reply = 'I can give over a BILLION different tips from my 20 core ideas! 🐐👑 Here\'s one → ' + makeTip(); }
      else reply = tomPick(out);
      break;
    }
  }
  if (reply == null) reply = tomPick(TOM_LINES.reply); // nothing matched → friendly generic line
  setTimeout(() => {
    chatAppend(log, 'Tom', reply);
    if (isPlay) { const btn = $('tom-play'); if (btn) btn.classList.add('nudge'); }
  }, 500);
}
// World chat is ONE shared room — everyone online talks together, and you can
// type anything and send it right away (no pairing, no waiting).
let worldChat = { active: false };
function startWorldChat(main) {
  main.innerHTML =
    '<div class="chatconvo">' +
      '<div class="chatconvo-head"><span class="cc-face">🌍</span> World ' +
        '<span id="world-status" class="chatconvo-sub">Connecting…</span></div>' +
      '<div id="world-log" class="chat-log"></div>' +
      '<div id="world-quick" class="chat-quick"></div>' +
      '<form id="world-form" class="chat-compose" autocomplete="off">' +
        '<input id="world-input" class="chat-input" maxlength="200" placeholder="Message everyone…" />' +
        '<button type="submit" class="chat-send">Send</button>' +
      '</form>' +
    '</div>';
  worldChat.active = true;
  const log = $('world-log');
  const wrap = $('world-quick');
  QUICK_CHATS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'chat-btn';
    b.textContent = t;
    b.onclick = () => worldSay(t);
    wrap.appendChild(b);
  });
  $('world-form').onsubmit = (e) => {
    e.preventDefault();
    const inp = $('world-input');
    const t = inp.value.trim();
    if (!t) return;
    inp.value = '';
    worldSay(t);
  };
  try { onlineWS = new WebSocket(onlineWsUrl()); }
  catch { const s = $('world-status'); if (s) s.textContent = 'Can\'t connect.'; worldChat.active = false; return; }
  onlineWS.onopen = () => onlineWS.send(JSON.stringify({ type: 'joinWorld', name: currentUser() || 'Guest' }));
  onlineWS.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } handleOnlineMsg(m); };
  onlineWS.onerror = () => { const s = $('world-status'); if (s) s.textContent = 'Can\'t reach the server.'; };
  onlineWS.onclose = () => { if (onlineWS) onlineWS = null; };
}
function worldSay(text) {
  chatAppend($('world-log'), 'You', text);                 // show mine right away
  onlineSend({ type: 'worldMsg', text });                  // …and send to everyone else
  bumpStat('worldChats');                                  // achievements: world messages you send
}
function handleWorldChatMsg(m) {
  const s = $('world-status');
  const log = $('world-log');
  if (m.type === 'worldJoined') { if (s) s.textContent = (m.count === 1 ? 'You\'re the only one here' : m.count + ' people here'); }
  else if (m.type === 'worldSys') chatAppend(log, '·', m.text);
  else if (m.type === 'worldMsg') chatAppend(log, m.name || 'Player', String(m.text || '').slice(0, 200));
}
function leaveWorldChat() {
  if (worldChat.active) {
    worldChat.active = false;
    onlineSend({ type: 'leaveWorld' });
    leaveOnline();
  }
}
// Append a chat line to a specific log element (used by the Tom & World convos).
function chatAppend(logEl, who, text) {
  if (!logEl) return;
  const line = document.createElement('div');
  if (who === '·') {                                   // a system notice (someone joined/left)
    line.className = 'chat-sys';
    line.textContent = text;
  } else {
    line.className = 'chat-line' + (who === 'You' ? ' me' : '');
    line.innerHTML = `<span class="chat-who">${escapeHtml(who)}:</span> ${escapeHtml(text)}`;
  }
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

// Engine opponent from the "Chess with AI" picker — casual (not rated).
function startEngineGame(engine) {
  // Tom (the Gold engine) is a Gold-members-only opponent.
  if (engine.cat === 'Gold' && !isGold()) { requireGold(); return; }
  game.mode = 'ai';
  game.humanColor = document.querySelector('input[name="side"]:checked').value;
  // Only "Stockfish" uses the real engine; all others use the built-in AI at their difficulty.
  if (engine.engine) {
    game.difficulty = null;
    pendingBot = { name: `${engine.name} ${engine.rating}`, rating: null, engine: true, elo: engine.elo };
  } else {
    game.difficulty = engine.diff;
    pendingBot = { name: `${engine.name} ${engine.rating}`, rating: null, engine: false, elo: null };
  }
  startGame();
  if (engine.name === 'Tom') bumpStat('tomPlayed');   // achievements: games started vs Tom
  // No in-game chat panel — chatting lives in the Chat section, so the board stays fully clickable.
  renderStatus();
}

// Fill the "Chess with AI" engine buttons — e.g. "🖥️ Cortex 1910 [Advanced]".
function renderEngineButtons() {
  const wrap = $('engine-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  ENGINES.forEach(e => {
    const btn = document.createElement('button');
    btn.className = 'diff-btn diff-engine';
    const noteTag = e.note ? ` <span class="eng-note">${escapeHtml(e.note)}</span>` : '';
    btn.innerHTML = `<span class="eng-face">${e.icon}</span> <span class="eng-name">${escapeHtml(e.name)}</span>${noteTag}` +
      ` <span class="eng-rating">${e.rating}</span> <span class="eng-cat">[${e.cat || DIFF_LABELS[e.diff]}]</span>`;
    btn.onclick = () => startEngineGame(e);
    wrap.appendChild(btn);
  });
}

// ============ Analyzer chooser (home screen) ============
function openAnalyzerChooser() {
  renderGamesList();
  $('analyzer-modal').classList.remove('hidden');
}

function renderGamesList() {
  const wrap = $('games-list');
  const games = loadGames();
  wrap.innerHTML = '';
  if (games.length === 0) {
    wrap.innerHTML = '<div class="games-empty">No saved games yet — play a game first, then come back to review it.</div>';
    return;
  }
  games.forEach((g, i) => {
    const row = document.createElement('button');
    row.className = 'game-row';
    const when = new Date(g.date);
    const dateStr = when.toLocaleDateString() + ' ' + when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const label = g.mode === 'ai'
      ? `vs AI · ${DIFF_LABELS[g.difficulty] || g.difficulty}`
      : 'vs Friend';
    const moves = Math.ceil(g.movesUci.length / 2);
    row.innerHTML = `<span class="g-main"><span class="g-label">${label}</span>` +
      `<span class="g-result">${escapeHtml(g.result)}</span></span>` +
      `<span class="g-meta">${moves} moves · ${dateStr}</span>`;
    row.onclick = () => startAnalyzeFromGame(g);
    wrap.appendChild(row);
  });
}

function startAnalyzeSetup() {
  $('analyzer-modal').classList.add('hidden');
  game.mode = 'analyze';
  game.difficulty = null;
  startGame();
  bumpStat('analyzed');   // achievements: analyzer sessions
}

function startAnalyzeFromGame(rec) {
  $('analyzer-modal').classList.add('hidden');
  game.mode = 'analyze';
  game.difficulty = null;
  startGame();
  bumpStat('analyzed');   // achievements: analyzer sessions
  game.replaying = true;
  for (const uci of rec.movesUci) {
    const mv = C.uciToMove(game.state, uci);
    if (!mv) break;
    doMove(mv);
  }
  game.replaying = false;
  game.over = false; // allow continued exploration from the final position
  game.flipped = game.state.turn === 'b'; // orient to whoever is to move
  render();
}

function backToHome() {
  leaveWorldChat();       // drop any live world-chat connection
  leaveOnline();          // drop any live online connection
  saveGame('Unfinished'); // keep quit games in "My games" too
  game.over = true;
  document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
  $('difficulty-panel').classList.add('hidden');
  showScreen('home');
}

// ============ Online play (real-time via the Chesser WebSocket server) ============
let onlineWS = null;
// The Chesser server that served this page (it does app + online + payments).
// Same origin normally; falls back to the default port for the dev preview / file://.
function serverHost() {
  // A configured online server (from config.js) wins — this is what makes online play work
  // when the app is on a static host (Netlify) and the server is elsewhere (Fly/Render).
  if (window.CHESSER_SERVER) return window.CHESSER_SERVER.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (location.protocol === 'file:' || location.port === '4178' || !location.host) {
    return `${location.hostname || 'localhost'}:4180`;
  }
  return location.host; // same origin — works locally on any port and when deployed together
}
function onlineWsUrl() {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${serverHost()}`;
}
function setOnlineStatus(text, spinning) {
  $('online-status').textContent = text;
  $('online-spinner').classList.toggle('hidden', !spinning);
}
function openOnlineModal() {
  leaveOnline();
  setOnlineStatus('Play a real person on the Chesser server.', false);
  $('online-find').classList.remove('hidden');
  $('online-cancel').classList.add('hidden');
  $('online-modal').classList.remove('hidden');
}
function onlineFind() {
  try { onlineWS = new WebSocket(onlineWsUrl()); }
  catch { setOnlineStatus('Could not connect. Start the server with "npm run online".', false); return; }
  $('online-find').classList.add('hidden');
  $('online-cancel').classList.remove('hidden');
  setOnlineStatus('Connecting…', true);
  onlineWS.onopen = () => {
    setOnlineStatus('Finding an opponent…', true);
    onlineWS.send(JSON.stringify({ type: 'find', name: currentUser() || 'Guest' }));
  };
  onlineWS.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } handleOnlineMsg(m); };
  onlineWS.onerror = () => {
    setOnlineStatus('Can\'t reach the Chesser server. Start it with "npm run online" — or use Lichess below.', false);
    $('online-find').classList.remove('hidden');
    $('online-cancel').classList.add('hidden');
  };
  onlineWS.onclose = () => { if (onlineWS) onlineWS = null; };
}
function onlineCancel() {
  onlineSend({ type: 'cancel' });
  leaveOnline();
  openOnlineModal();
}
function handleOnlineMsg(m) {
  if (worldChat.active) { handleWorldChatMsg(m); return; }  // chat-only pool, no game
  if (m.type === 'waiting') setOnlineStatus('Finding an opponent…', true);
  else if (m.type === 'start') startOnlineGame(m.color, m.opponent);
  else if (m.type === 'opponentMove') applyOpponentMove(m.uci);
  else if (m.type === 'opponentResign') onlineEnd('You win!', 'Your opponent resigned. 🎉');
  else if (m.type === 'opponentLeft') onlineEnd('You win!', 'Your opponent left the game. 🎉');
  else if (m.type === 'chat') addChatLine(game.onlineOpponent || 'Opponent', String(m.text || '').slice(0, 60));
}
function startOnlineGame(color, oppName) {
  $('online-modal').classList.add('hidden');
  game.mode = 'online';
  game.difficulty = null;
  game.humanColor = color;
  game.onlineOpponent = (oppName || 'Opponent');
  startGame();
  renderStatus();
}

// ---- Quick chat (a Gold perk): safe preset messages only, no free typing ----
const QUICK_CHATS = ['Hello! 👋', 'Good luck! 🍀', 'Nice move!', 'Good game! 🤝', 'Oops!', 'Thanks!'];
function showOnlineChat() {
  const box = $('online-chat'); if (!box) return;
  box.classList.remove('hidden');
  $('chat-log').innerHTML = '';
  renderQuickChat();
}
function hideOnlineChat() { const box = $('online-chat'); if (box) box.classList.add('hidden'); }
function renderQuickChat() {
  const wrap = $('chat-quick'); if (!wrap) return;
  const gold = isGold();                        // only Gold members can SEND
  $('chat-locked').classList.toggle('hidden', gold);
  wrap.classList.toggle('hidden', !gold);
  wrap.innerHTML = '';
  if (!gold) return;
  QUICK_CHATS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'chat-btn';
    b.textContent = t;
    b.onclick = () => sendQuickChat(t);
    wrap.appendChild(b);
  });
}
function sendQuickChat(text) {
  if (game.mode !== 'online' || !isGold()) return;
  onlineSend({ type: 'chat', text });
  addChatLine('You', text);
}
function addChatLine(who, text) {
  const log = $('chat-log'); if (!log) return;
  const line = document.createElement('div');
  line.className = 'chat-line' + (who === 'You' ? ' me' : '');
  line.innerHTML = `<span class="chat-who">${escapeHtml(who)}:</span> ${escapeHtml(text)}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}
function applyOpponentMove(uci) {
  const mv = C.uciToMove(game.state, uci);
  if (!mv) return;
  game.applyingRemote = true;
  doMove(mv);
  game.applyingRemote = false;
  tryPremove();               // fire the player's queued premove, if any
}
function onlineSend(obj) { if (onlineWS && onlineWS.readyState === 1) onlineWS.send(JSON.stringify(obj)); }
function onlineEnd(title, text) {
  if (game.mode !== 'online' || game.over) return;
  endGame(title, text);
  leaveOnline();
}
function leaveOnline() {
  if (onlineWS) { try { onlineWS.onclose = null; onlineWS.close(); } catch (e) {} onlineWS = null; }
}

// ============ Puzzles ============
function mainControlsEl() { return $('new-game').closest('.game-controls'); }

function canDoPuzzle() {
  return isMember() || dailyCounts().puzzles < FREE_PUZZLES_PER_DAY;
}

// First ask what to practice — Mate or Tactics — then start.
function openPuzzleTypeChooser() { $('puzzle-type-modal').classList.remove('hidden'); }
const POS_OPENING_THEME = 'Best opening move!';   // marks a positional (vs tactical) opening
function startPuzzles(type, openingKind) {
  game.puzzleType = type || game.puzzleType || 'mate';
  if (type === 'opening') game.openingKind = openingKind || game.openingKind || 'tactical';
  if (!game.puzzleLevel) game.puzzleLevel = 'easy';
  $('puzzle-type-modal').classList.add('hidden');
  loadRandomPuzzle();
}

function loadRandomPuzzle() {
  if (!canDoPuzzle()) {
    $('over-title').textContent = 'Daily puzzles used up';
    $('over-text').textContent = `You've done your ${FREE_PUZZLES_PER_DAY} free puzzles today. Come back tomorrow — or get Bronze for unlimited puzzles!`;
    $('over-modal').classList.remove('hidden');
    return;
  }
  bumpDaily('puzzles');
  const level = game.puzzleLevel || 'easy';
  const type = game.puzzleType || 'mate';
  let pool;
  if (type === 'opening') {
    // Openings split by KIND: positional (best quiet move) vs tactical (punish the blunder).
    const wantPos = game.openingKind === 'positional';
    const kindOf = p => (p.theme === POS_OPENING_THEME) === wantPos;
    pool = PUZZLES.filter(p => p.type === 'opening' && kindOf(p) && p.level === level);
    if (!pool.length) pool = PUZZLES.filter(p => p.type === 'opening' && kindOf(p));
  } else {
    // Prefer this level + type; if none at this level, use any of that type.
    pool = PUZZLES.filter(p => p.level === level && p.type === type);
    if (!pool.length) pool = PUZZLES.filter(p => p.type === type);
  }
  const p = pool[Math.floor(Math.random() * pool.length)] || PUZZLES[0];
  game.gen++;
  game.mode = 'puzzle';
  game.puzzle = p;
  game.puzzleWrong = false;   // clean so far this puzzle
  game.puzzleHinted = false;  // no hint used yet
  game.state = C.fromFEN(p.fen);
  game.selected = null;
  game.legalForSel = [];
  game.lastMove = null;
  game.capturedByWhite = [];
  game.capturedByBlack = [];
  game.history = [];
  game.over = false;
  game.viewIndex = null;
  game.humanColor = game.state.turn;
  game.flipped = game.state.turn === 'b';
  mainControlsEl().classList.add('hidden');
  $('puzzle-controls').classList.remove('hidden');
  $('puzzle-difficulty').classList.remove('hidden');
  paintPuzzleDifficulty();
  // Fresh annotated move list for this puzzle, headed by the objective.
  const movesBox = $('puzzle-moves');
  if (movesBox) movesBox.classList.remove('hidden');
  puzzleMovesHeader(p);
  showScreen('game');
  render();
  const left = isMember() ? '∞' : (FREE_PUZZLES_PER_DAY - dailyCounts().puzzles);
  // Say the TYPE up front — Opening, Mate, Tactic, or Endgame — so you know what to look for.
  const openingLabel = p.theme === POS_OPENING_THEME ? '♞ Opening · Positional' : '♙ Opening · Tactics';
  const kind = p.type === 'mate' ? '♚ Mate' : p.type === 'endgame' ? '👑 Endgame' : p.type === 'opening' ? openingLabel : '⚔️ Tactic';
  const side = game.state.turn === 'w' ? 'White' : 'Black';
  $('status-bar').textContent = `${kind} — ${side} to move, find it!  (left: ${left})`;
  $('status-bar').classList.remove('check');
  paintStreak();
}

function paintPuzzleDifficulty() {
  document.querySelectorAll('#puzzle-difficulty .pdiff-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.plevel === (game.puzzleLevel || 'easy'));
  });
}

// Did this move solve the puzzle? Mate puzzle → any checkmate; Tactic → the one move.
function puzzleSolved(move, ns) {
  const p = game.puzzle;
  return p.type === 'mate' ? C.gameStatus(ns) === 'checkmate' : moveToUci(move) === p.solution;
}

// ---- Tom's annotated move list under the puzzle board + difficulty that ramps up ----
const PZ_LEVELS = ['easy', 'normal', 'hard'];
const PZ_LEVEL_UP_AFTER = 3;        // clean solves in a row before Tom bumps you up a level
let puzzleLevelRun = 0;             // clean solves at the current level since the last bump
const capFirst = s => s ? s[0].toUpperCase() + s.slice(1) : s;

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
let pzPlayerPly = 0;   // ply index of the move the solver has to find
function puzzleObjective(p) {
  if (p.type === 'mate') return 'find the checkmate';
  return (p.theme || 'win the position').replace(/!$/, '').toLowerCase();
}
function plyLabel(ply) {
  const no = Math.floor(ply / 2) + 1;
  return (ply % 2 === 0) ? `${no}.` : `${no}…`;   // "5." for White, "5…" for Black
}
// One row: proper move number + move in notation + analyzer badge + label.
function renderPlyRow(ply, san, markKey, isLine) {
  const box = $('puzzle-moves');
  if (!box) return;
  const M = MARKS[markKey] || MARKS.good;
  const row = document.createElement('div');
  row.className = 'pmove' + (isLine ? ' pmove-line' : '');
  row.innerHTML = `<span class="pm-n">${plyLabel(ply)}</span> <b>${escapeHtml(san)}</b>` +
    ` <span class="mark ${M.cls}" title="${M.label}">${M.sym}</span> <span class="pm-note">${M.label}</span>`;
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}
// Start a fresh move list, headed by the objective, showing the graded line from move 1.
function puzzleMovesHeader(p) {
  const box = $('puzzle-moves');
  if (!box) return;
  box.innerHTML = `<div class="pm-head">📝 Moves — ${escapeHtml(puzzleObjective(p))}</div>`;
  if (p.line && p.line.length) {
    let g = C.fromFEN(START_FEN);
    p.line.forEach((u, idx) => {
      const mv = C.uciToMove(g, u);
      renderPlyRow(idx, C.moveToText(g, mv), (p.grades && p.grades[idx]) || 'good', true);
      g = C.applyMove(g, mv);
    });
    pzPlayerPly = p.line.length;
  } else {
    // No stored line (mate/tactic/endgame): number the solver's move by the position's move count.
    pzPlayerPly = (game.state.fullmove - 1) * 2 + (game.state.turn === 'w' ? 0 : 1);
  }
}
// The solver's own move, tagged with its analyzer symbol, continuing the line's numbering.
function pushPuzzleMove(moveTxt, markKey) {
  renderPlyRow(pzPlayerPly, moveTxt, markKey, false);
}
function pushPuzzleSys(note) {
  const box = $('puzzle-moves');
  if (!box) return;
  const row = document.createElement('div');
  row.className = 'pmove pmove-sys';
  row.innerHTML = `<span class="pm-note">${escapeHtml(note)}</span>`;
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}
// Grade a played move (from the mover's side):
//   mating attack — forces a mate (not yet on the board)  -> Brilliant
//   immediate mate-in-1                                   -> Great
//   wins a piece or more (a tactic)                       -> Best
//   quiet positional win (the intended move, no material) -> Best
//   wins ~a pawn                                          -> Inaccuracy
//   gains a little (space/dev)                            -> Mistake
//   neutral (missed, lost nothing)                        -> Miss
//   loses material                                        -> Blunder
function gradeAttempt(state, move, isSolution) {
  const stm = state.turn;
  const ns = C.applyMove(state, move);
  if (C.gameStatus(ns) === 'checkmate') return 'great';   // mate in 1 = Great
  const a = C.analyze(ns, 4);
  const afterStm = stm === 'w' ? a.evalCp : -a.evalCp;
  if (afterStm >= 5000) return 'brilliant';               // a mating attack — forces mate a few moves out
  if (afterStm >= 200) return 'best';                      // won a piece or more — a tactic
  if (isSolution) return 'best';                           // the intended quiet / positional win
  if (afterStm >= 90)  return 'dubious';                   // ~a pawn — Inaccuracy
  if (afterStm >= 35)  return 'mistake';                   // space / development
  if (afterStm >= -35) return 'miss';                      // neutral — missed the win, lost nothing
  return 'blunder';                                        // lost material / made it worse
}

function handlePuzzleMove(move) {
  const moveTxt = C.moveToText(game.state, move);   // notation of the attempt, before we apply it
  const ns = C.applyMove(game.state, move);
  const mark = gradeAttempt(game.state, move, puzzleSolved(move, ns));
  if (puzzleSolved(move, ns)) {
    game.state = ns;
    game.lastMove = { from: move.from, to: move.to };
    game.selected = null;
    game.legalForSel = [];
    game.over = true;
    renderBoard();
    // Clean solve (no wrong move, no hint) grows your streak.
    if (!game.puzzleWrong && !game.puzzleHinted) setPuzzleStreak(puzzleStreak + 1);
    // Achievements: count solved puzzles by type and level (and clean solves).
    const p = game.puzzle, st = getStats();
    st.puz = (st.puz || 0) + 1;
    st['puz_' + p.type] = (st['puz_' + p.type] || 0) + 1;
    st['puz_' + p.level] = (st['puz_' + p.level] || 0) + 1;
    if (!game.puzzleWrong && !game.puzzleHinted) st.puzClean = (st.puzClean || 0) + 1;
    saveStats(st); checkAchievements();
    $('status-bar').textContent = '✓ Solved! 🎉  — press Next';
    pushPuzzleMove(moveTxt, mark);
    // Difficulty ramps up: a few clean solves in a row and Tom bumps you to the next level.
    if (!game.puzzleWrong && !game.puzzleHinted) {
      puzzleLevelRun++;
      const idx = PZ_LEVELS.indexOf(game.puzzleLevel || 'easy');
      if (puzzleLevelRun >= PZ_LEVEL_UP_AFTER && idx < PZ_LEVELS.length - 1) {
        game.puzzleLevel = PZ_LEVELS[idx + 1];
        puzzleLevelRun = 0;
        paintPuzzleDifficulty();
        pushPuzzleSys(`⬆️ Leveled up to ${capFirst(game.puzzleLevel)}`);
      }
    } else {
      puzzleLevelRun = 0;
    }
  } else {
    game.selected = null;
    game.legalForSel = [];
    game.puzzleWrong = true;
    setPuzzleStreak(0);              // a wrong move breaks the streak
    puzzleLevelRun = 0;             // a miss pauses the difficulty climb
    renderBoard();
    $('status-bar').textContent = '✗ Not the winning move — try again!';
    pushPuzzleMove(moveTxt, mark);
  }
}

// A hint you ask for — highlights the piece to move (works for mate & tactic puzzles).
function puzzleHint() {
  if (game.mode !== 'puzzle' || game.over) return;
  const p = game.puzzle;
  const win = C.legalMoves(game.state).find(m => puzzleSolved(m, C.applyMove(game.state, m)));
  if (!win) return;
  game.puzzleHinted = true;         // using a hint means this one won't grow your streak
  game.selected = win.from;
  game.legalForSel = [win];
  renderBoard();
  $('status-bar').textContent = 'Hint: try moving the highlighted piece.';
}

// ============ Packs ============
function openPacksModal() {
  $('pack-reveal').classList.add('hidden');
  refreshPacks();
  $('packs-modal').classList.remove('hidden');
}

function refreshPacks() {
  const silver = isSilver();
  const plan = memberPlan();
  const perDay = packsPerDay();
  const openBtn = $('open-free-pack');
  const leftEl = $('free-packs-left');
  if (!silver) {
    openBtn.classList.add('hidden');
    leftEl.textContent = 'Opening packs is a Silver perk 🥈';
  } else {
    openBtn.classList.remove('hidden');
    const left = Math.max(0, perDay - dailyCounts().packs);
    leftEl.textContent = `Packs left today: ${left} / ${perDay}`;
    openBtn.disabled = left <= 0;
    openBtn.textContent = left <= 0 ? 'No packs left today' : 'Open Pack';
  }
  // The Pay button shows only when you're not yet Silver.
  $('pay-btn').classList.toggle('hidden', silver);
  renderCollection();
}

function collectibleIcon(rarity, name) {
  const found = (COLLECTIBLES[rarity] || []).find(([n]) => n === name);
  return found ? found[1] : '❔';
}

function renderCollection() {
  const col = loadCollection();
  const wrap = $('collection-list');
  wrap.innerHTML = '';
  const ids = Object.keys(col);
  const total = ids.reduce((s, k) => s + col[k], 0);
  $('collection-count').textContent = total ? `(${total})` : '';
  if (!ids.length) { wrap.innerHTML = '<div class="col-empty">No items yet — open a pack!</div>'; return; }
  const order = RARITIES.map(r => r.key);
  ids.sort((a, b) => order.indexOf(b.split(':')[0]) - order.indexOf(a.split(':')[0]));
  ids.forEach(id => {
    const [rar, name] = id.split(':');
    const cell = document.createElement('div');
    cell.className = 'col-item';
    cell.style.borderColor = RARITY[rar].color;
    cell.innerHTML = `<span class="col-icon">${collectibleIcon(rar, name)}</span>` +
      `<span class="col-name">${escapeHtml(name)}</span>` +
      `<span class="col-rar" style="color:${RARITY[rar].color}">${RARITY[rar].label}</span>` +
      `<span class="col-x">×${col[id]}</span>`;
    wrap.appendChild(cell);
  });
}

function revealPull(pull) {
  const el = $('pack-reveal');
  el.style.borderColor = RARITY[pull.rarity].color;
  el.innerHTML = `<div class="reveal-icon">${pull.icon}</div>` +
    `<div class="reveal-name">${escapeHtml(pull.name)}</div>` +
    `<div class="reveal-rar" style="color:${RARITY[pull.rarity].color}">${RARITY[pull.rarity].label}!</div>`;
  el.classList.remove('hidden');
}

function openFreePack() {
  if (!isSilver()) return;                            // packs are Silver-only
  if (dailyCounts().packs >= packsPerDay()) return;   // Infinity never blocks (s5)
  bumpDaily('packs');
  const pull = rollPull(PACK_WEIGHTS);
  addToCollection(pull);
  revealPull(pull);
  refreshPacks();
  bumpStat('packs');            // achievements: packs opened (collection/rares are computed)
}

const DAY = 86400000;
function silverGrant(plan) {
  const u = currentUser();
  const m = loadMembers();
  if (!m[u]) return;
  const gold = plan.startsWith('gold-');
  m[u].tier = gold ? 'gold' : 'silver';
  m[u].plan = plan;
  if (plan === 'life' || plan === 'gold-life') m[u].silverUntil = null;           // never expires
  else if (plan === 'year' || plan === 'gold-year') m[u].silverUntil = Date.now() + 365 * DAY;
  else if (plan === 'demo' || plan === 'gold-demo') { m[u].silverUntil = Date.now() + 60 * DAY; m[u].demoUsed = true; }   // 2-month trial
  else if (plan === 'special' || plan === 'gold-special') { m[u].silverUntil = Date.now() + 7 * DAY; m[u].demoUsed = true; } // 1-week
  saveMembers(m);
  renderMembership();
  refreshPacks();
  checkAchievements();   // achievements: membership tier (computed)
}
// Show feedback right in the Pay box (so it's visible no matter where you opened Pay from).
function payStatus(text) {
  const s = $('pay-status');
  if (s) { s.textContent = text; s.classList.remove('hidden'); }
}
function silverReveal(name) {
  const gold = isGold();
  const el = $('pack-reveal');
  el.style.borderColor = gold ? '#e7c65a' : '#c0c6cc';
  el.innerHTML = `<div class="reveal-icon">${gold ? '\u{1F947}' : '\u{1F948}'}</div>` +
    `<div class="reveal-name">${name}</div>` +
    `<div class="reveal-rar" style="color:${gold ? '#e7c65a' : '#c0c6cc'}">${gold ? 'Tom + chat + everything Silver' : '2 packs a day'}</div>`;
  el.classList.remove('hidden');
}
// Buy Gold — the top tier (adds Tom + chat on top of Silver). Same demo-payment path.
async function buyGold(plan) {
  if (!requireBronze()) return;
  payStatus('Contacting the payment server…');
  let confirmed = false;
  try {
    const r = await fetch(serverApi('/api/pay'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, user: currentUser() }),
    });
    confirmed = (await r.json()).ok === true;
  } catch (e) { confirmed = false; }
  silverGrant(plan);
  const base = plan === 'gold-life' ? "You're Gold forever! 🥇" : "You're Gold for 1 year! 🥇";
  payStatus('✅ ' + base);
  silverReveal(base);
  setTimeout(() => $('pay-modal').classList.add('hidden'), 1800);
}
// URL of the Chesser server's JSON API (the same server that served the page).
function serverApi(path) {
  return `${location.protocol === 'https:' ? 'https' : 'http'}://${serverHost()}${path}`;
}
// Demo Silver — the payment goes through the Chesser server (like online play).
// Still a demo: no real money moves (a real charge needs a payment company).
async function buySilver(plan) {
  if (!requireBronze()) return; // must be signed in first
  payStatus('Contacting the payment server…');
  let confirmed = false;
  try {
    const r = await fetch(serverApi('/api/pay'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, user: currentUser() }),
    });
    confirmed = (await r.json()).ok === true;
  } catch (e) { confirmed = false; } // server not running → offline demo
  silverGrant(plan);
  const base = plan === 'life' ? "You're Silver forever!" : "You're Silver for 1 year!";
  payStatus('✅ ' + base);
  silverReveal(base);
  setTimeout(() => $('pay-modal').classList.add('hidden'), 1800); // close after they see it
}
// First-time free trial. base 'demo' = 2 months, 'special' = 1 week; tier = silver | gold.
let pendingTrial = null; // which trial is waiting for a Silver/Gold pick
function startDemo(base, tier) {
  if (!requireBronze()) return;
  const rec = loadMembers()[currentUser()];
  if (rec && rec.demoUsed) { payStatus('You already used your free trial.'); return; }
  const plan = tier === 'gold' ? 'gold-' + base : base;
  silverGrant(plan);
  const len = base === 'demo' ? '2-month' : '1-week';
  const tierName = tier === 'gold' ? 'Gold' : 'Silver';
  payStatus(`✅ ${len} ${tierName} trial started — you're ${tierName}!`);
  silverReveal(`${len} ${tierName} trial started! 🎉`);
  $('pay-trial-choose').classList.add('hidden');
  setTimeout(() => $('pay-modal').classList.add('hidden'), 1800);
}
// The July 4th Special is only available ON July 4th (month is 0-indexed, so 6 = July).
function isJuly4() {
  const d = new Date();
  return d.getMonth() === 6 && d.getDate() === 4;
}
function openPayModal() {
  const rec = currentUser() ? loadMembers()[currentUser()] : null;
  const used = !!(rec && rec.demoUsed);
  $('pay-status').classList.add('hidden');            // clear old status
  $('pay-demo').classList.toggle('hidden', used);      // hide the 2-month trial once a trial is used
  // The special shows only when it's July 4th (and you haven't used a trial).
  $('pay-demo-special').classList.toggle('hidden', used || !isJuly4());
  // Start on the Silver-or-Gold chooser; plans appear after you pick a tier.
  $('pay-silver-plans').classList.add('hidden');
  $('pay-gold-plans').classList.add('hidden');
  $('pay-trial-choose').classList.add('hidden');   // trial's Silver/Gold choice, shown on click
  pendingTrial = null;
  $('pay-modal').classList.remove('hidden');
}

// ============ Music panel: 6 tunes (Bronze) + piano (Silver) ============
// A full piano: white keys + black keys, across 3 octaves (C3 up to C6).
const PIANO_OCTAVES = [3, 4, 5];                      // which octaves to draw
const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BLACK_AFTER = { C: 'C#', D: 'D#', F: 'F#', G: 'G#', A: 'A#' }; // black key after these
const WHITE_W = 34;                                   // width of a white key (px)
const BLACK_W = 22;                                   // width of a black key (px)

function openMusicPanel() {
  renderMusicTracks();
  renderPiano();
  $('music-modal').classList.remove('hidden');
}

// Show the 6 tunes. Switching tunes is a Bronze perk (track 1 is free for all).
function renderMusicTracks() {
  const wrap = $('music-tracks');
  if (!wrap || !window.ChesserMusic) return;
  const tracks = window.ChesserMusic.tracks();
  const current = window.ChesserMusic.currentTrack();
  const bronze = isMember();
  wrap.innerHTML = '';
  tracks.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.className = 'track-btn' + (i === current ? ' active' : '');
    const locked = !bronze && i > 0;           // free users only get the first tune
    btn.innerHTML = `<span class="track-icon">${t.icon}</span>` +
      `<span class="track-name">${t.name}</span>` +
      (locked ? '<span class="track-lock">\u{1F512}</span>' : '');
    btn.onclick = () => {
      if (locked) { requireBronze(); return; }  // signing in unlocks the other 5 tunes
      window.ChesserMusic.setTrack(i);
      localStorage.setItem('chesserTrack', String(i));
      if (!window.ChesserMusic.isOn()) {         // picking a tune also starts the music
        window.ChesserMusic.start();
        localStorage.setItem('chesserMusic', 'on');
        paintMusicBtnGlobal(true);
      }
      renderMusicTracks();
    };
    wrap.appendChild(btn);
  });
}

// The piano is a Silver perk: tap the keys to play notes yourself.
// We draw the white keys in a row, then drop the black keys on top, each sitting
// on the crack between two white keys — just like a real piano.
function renderPiano() {
  const piano = $('piano');
  const locked = $('piano-locked');
  if (!piano) return;
  const silver = isSilver();
  locked.classList.toggle('hidden', silver);
  piano.classList.toggle('disabled', !silver);
  piano.innerHTML = '';

  const play = (note, key) => {
    if (!isSilver()) { openPayModal(); return; } // nudge toward Silver
    window.ChesserMusic.playKey(note);
    key.classList.add('hit');
    setTimeout(() => key.classList.remove('hit'), 150);
  };

  const whiteRow = document.createElement('div');
  whiteRow.className = 'piano-white-row';
  const blackLayer = document.createElement('div');
  blackLayer.className = 'piano-black-layer';

  let whiteIndex = 0; // counts white keys left-to-right, for placing black keys
  PIANO_OCTAVES.forEach((oct) => {
    WHITE_NOTES.forEach((wn) => {
      const note = wn + oct;
      // White key.
      const wk = document.createElement('button');
      wk.className = 'piano-key white';
      wk.dataset.note = note;
      wk.innerHTML = `<span class="key-label">${wn}${oct}</span>`;
      wk.onclick = () => play(note, wk);
      whiteRow.appendChild(wk);
      // Black key that follows this white key (if any, e.g. C -> C#).
      const bn = BLACK_AFTER[wn];
      const isLastWhite = (oct === PIANO_OCTAVES[PIANO_OCTAVES.length - 1] && wn === 'B');
      if (bn && !isLastWhite) {
        const bk = document.createElement('button');
        bk.className = 'piano-key black';
        // Sit on the crack: centered over the gap after this white key.
        bk.style.left = ((whiteIndex + 1) * WHITE_W - BLACK_W / 2) + 'px';
        const bnote = bn + oct;
        bk.dataset.note = bnote;
        bk.onclick = (e) => { e.stopPropagation(); play(bnote, bk); };
        blackLayer.appendChild(bk);
      }
      whiteIndex++;
    });
  });
  // One extra top C so the piano ends on a C, like a real keyboard.
  const topOct = PIANO_OCTAVES[PIANO_OCTAVES.length - 1] + 1;
  const topC = document.createElement('button');
  topC.className = 'piano-key white';
  topC.dataset.note = 'C' + topOct;
  topC.innerHTML = `<span class="key-label">C${topOct}</span>`;
  topC.onclick = () => play('C' + topOct, topC);
  whiteRow.appendChild(topC);
  whiteIndex++;

  // Size the keyboard to fit all the white keys.
  const totalW = whiteIndex * WHITE_W;
  whiteRow.style.width = totalW + 'px';
  blackLayer.style.width = totalW + 'px';

  const kb = document.createElement('div');
  kb.className = 'piano-keyboard';
  kb.style.width = totalW + 'px';
  kb.appendChild(whiteRow);
  kb.appendChild(blackLayer);
  piano.appendChild(kb);
}

// ============ Chess tutorial: learn one piece/skill per lesson ============
// Each lesson sets up a tiny position and asks for ONE move. We light up the
// piece to move and the star square to move it to. Finish a lesson to unlock the
// next — lessons come one after another, teaching a new idea each time.
// Basic Skills are FREE. There are 10 of them; each skill holds 2 little challenges
// you solve in a row. They teach how every piece moves and the big ideas (check,
// escaping check, checkmate).
const CHESS_LESSONS = [
  // Easiest pieces first, then the tricky ones (knight, pawn), then the king.
  { name: 'The Rook', emoji: '♜',
    tip: 'The rook slides in straight lines — up, down, or across. Slide it to a star.',
    challenges: [
      { fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', from: 'a1', to: ['a8'] },
      { fen: '4k3/8/8/8/8/8/R7/4K3 w - - 0 1', from: 'a2', to: ['g2'] },
    ] },
  { name: 'The Bishop', emoji: '♝',
    tip: 'The bishop slides on diagonals only. Send it to a star.',
    challenges: [
      { fen: '4k3/8/8/8/8/8/8/2B1K3 w - - 0 1', from: 'c1', to: ['h6'] },
      { fen: '4k3/8/8/8/8/8/8/2B1K3 w - - 0 1', from: 'c1', to: ['a3'] },
    ] },
  { name: 'The Queen', emoji: '♛',
    tip: 'The queen moves any direction, any distance. Move her to a star.',
    challenges: [
      { fen: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1', from: 'd1', to: ['d7'] },
      { fen: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1', from: 'd1', to: ['h5'] },
    ] },
  { name: 'The Knight', emoji: '♞',
    tip: 'The knight jumps in an L — trickier! And it hops over pieces. Jump to a star.',
    challenges: [
      { fen: '4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', from: 'g1', to: ['f3'] },
      { fen: '4k3/8/8/8/8/8/8/1N2K3 w - - 0 1', from: 'b1', to: ['c3'] },
    ] },
  { name: 'The Pawn', emoji: '♟️',
    tip: 'Pawns are sneaky — they march forward (one or two squares from home). Move it to a star.',
    challenges: [
      { fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', from: 'e2', to: ['e3', 'e4'] },
      { fen: '4k3/8/8/8/8/2P5/8/4K3 w - - 0 1', from: 'c3', to: ['c4'] },
    ] },
  { name: 'Pawn Captures', emoji: '⚔️',
    tip: 'Here is the tricky part: pawns move straight but capture DIAGONALLY. Take the black pawn!',
    challenges: [
      { fen: '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', from: 'e4', to: ['d5'] },
      { fen: '4k3/8/5p2/4P3/8/8/8/4K3 w - - 0 1', from: 'e5', to: ['f6'] },
    ] },
  { name: 'The King', emoji: '♚',
    tip: 'The king is the most important — it steps one square any direction. Step to a star.',
    challenges: [
      { fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1', from: 'e1', to: ['e2'] },
      { fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1', from: 'e1', to: ['d2', 'f2', 'd1', 'f1'] },
    ] },
  { name: 'Check!', emoji: '⚡',
    tip: 'Attacking the king is "check". Make a move that gives check!',
    challenges: [
      { fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', from: 'a1', to: ['a8'], needCheck: true },
      { fen: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1', from: 'd1', to: ['d8'], needCheck: true },
    ] },
  { name: 'Escape Check', emoji: '\u{1F6E1}️',
    tip: 'Your king is in check — get it to safety (or capture the attacker)!',
    challenges: [
      { fen: 'k3r3/8/8/8/8/8/8/4K3 w - - 0 1', from: 'e1', to: ['d1', 'f1', 'd2', 'f2'] },
      { fen: '4k3/8/8/8/8/8/4r3/4K3 w - - 0 1', from: 'e1', to: ['d1', 'f1', 'e2'] },
    ] },
  { name: 'Checkmate!', emoji: '\u{1F3C6}',
    tip: 'Checkmate = the king is attacked and cannot escape. Deliver mate!',
    challenges: [
      { fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', from: 'a1', to: ['a8'], needMate: true },
      { fen: '6k1/8/6K1/8/8/8/8/3Q4 w - - 0 1', from: 'd1', to: ['d8'], needMate: true },
    ] },
];

// Everything past the basics is a Bronze perk: 5 Levels, each with 50 skills, and
// each of those skills is 5 challenges. The level challenges are GENERATED as real,
// engine-checked positions (see the generator below) so they're endless and get
// harder as you climb.
const LEVELS = [
  { key: 'beginner',     name: 'Beginner',     emoji: '\u{1F331}' },
  { key: 'intermediate', name: 'Intermediate', emoji: '\u{1F33F}' },
  { key: 'advanced',     name: 'Advanced',     emoji: '\u{1F525}' },
  { key: 'expert',       name: 'Expert',       emoji: '\u{1F48E}' },
  { key: 'master',       name: 'Master',       emoji: '\u{1F451}' },
];
const SKILLS_PER_LEVEL = 50;
const CHALLENGES_PER_SKILL = 5;

let learn = null; // holds the running skill/challenge, or null while on the menu

// ---- progress (saved in the browser so it sticks between visits) ----
function chessLessonsDone() { return parseInt(localStorage.getItem('chesserChessLessons') || '0', 10); }
function basicsComplete() { return chessLessonsDone() >= CHESS_LESSONS.length; }
function levelDone(key) { return parseInt(localStorage.getItem('chesserLvl_' + key) || '0', 10); }
function setLevelDone(key, n) { localStorage.setItem('chesserLvl_' + key, String(n)); }
function levelComplete(key) { return levelDone(key) >= SKILLS_PER_LEVEL; }
// You must finish the 10 Basic Skills before Beginner; then each level opens once
// the one before it is finished.
function levelProgressUnlocked(idx) { return idx === 0 ? basicsComplete() : levelComplete(LEVELS[idx - 1].key); }

// ---- puzzle generator: builds real, engine-checked positions ----
const PIECE_NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
function rInt(n) { return Math.floor(Math.random() * n); }
function rSq() { return C.FILES[rInt(8)] + (1 + rInt(8)); }
function adjSq(a, b) { const x = C.rc(a), y = C.rc(b); return Math.max(Math.abs(x.r - y.r), Math.abs(x.c - y.c)) <= 1; }
// Turn a { 'e2':'P', ... } map into a FEN string.
function makeFEN(pieces, turn) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let row = '', empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = pieces[C.FILES[c] + (8 - r)];
      if (p) { if (empty) { row += empty; empty = 0; } row += p; } else empty++;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return rows.join('/') + ' ' + (turn || 'w') + ' - - 0 1';
}
// A fair starting position: both kings on the board, nobody already in check.
function cleanStart(st) {
  return st && st.board.indexOf('K') >= 0 && st.board.indexOf('k') >= 0 &&
    !C.inCheck(st, 'w') && !C.inCheck(st, 'b');
}
function placeKings(pieces) {
  for (let t = 0; t < 300; t++) {
    const wk = rSq(), bk = rSq();
    if (wk === bk || adjSq(C.squareToIndex(wk), C.squareToIndex(bk))) continue;
    pieces[wk] = 'K'; pieces[bk] = 'k'; return;
  }
  pieces['e1'] = 'K'; pieces['e8'] = 'k';
}
function anEmpty(pieces) { for (let t = 0; t < 300; t++) { const s = rSq(); if (!pieces[s]) return s; } return null; }

// Skill: move a piece to an empty square (learn how it travels).
function genReach(chars) {
  for (let t = 0; t < 150; t++) {
    const pieces = {}; placeKings(pieces);
    const ch = chars[rInt(chars.length)];
    const sq = anEmpty(pieces); if (!sq) continue; pieces[sq] = ch;
    const fen = makeFEN(pieces, 'w'), st = C.fromFEN(fen);
    if (!cleanStart(st)) continue;
    const moves = C.legalMovesFrom(st, C.squareToIndex(sq)).filter(m => st.board[m.to] === '' && !m.promotion);
    if (!moves.length) continue;
    const m = moves[rInt(moves.length)];
    return { tip: `Move your ${PIECE_NAME[ch.toLowerCase()]} to the star.`, fen, from: sq, to: [C.squareName(m.to)] };
  }
  return null;
}
// Skill: capture an undefended enemy piece.
function genCapture(att, vic) {
  for (let t = 0; t < 200; t++) {
    const pieces = {}; placeKings(pieces);
    const ch = att[rInt(att.length)];
    const sq = anEmpty(pieces); if (!sq) continue; pieces[sq] = ch;
    let st = C.fromFEN(makeFEN(pieces, 'w'));
    if (!cleanStart(st)) continue;
    const spots = C.legalMovesFrom(st, C.squareToIndex(sq)).filter(m => st.board[m.to] === '' && !m.promotion);
    if (!spots.length) continue;
    const tsq = C.squareName(spots[rInt(spots.length)].to);
    const v = vic[rInt(vic.length)];
    pieces[tsq] = v;
    const fen = makeFEN(pieces, 'w'); st = C.fromFEN(fen);
    if (!cleanStart(st)) continue;
    if (!C.legalMovesFrom(st, C.squareToIndex(sq)).some(m => C.squareName(m.to) === tsq)) continue;
    return { tip: `Capture the black ${PIECE_NAME[v]} with your ${PIECE_NAME[ch.toLowerCase()]}!`, fen, from: sq, to: [tsq] };
  }
  return null;
}
// Skill: make a move that gives check.
function genCheck(chars) {
  for (let t = 0; t < 250; t++) {
    const pieces = {}; placeKings(pieces);
    const ch = chars[rInt(chars.length)];
    const sq = anEmpty(pieces); if (!sq) continue; pieces[sq] = ch;
    const fen = makeFEN(pieces, 'w'), st = C.fromFEN(fen);
    if (!cleanStart(st)) continue;
    const checks = C.legalMovesFrom(st, C.squareToIndex(sq)).filter(m => C.inCheck(C.applyMove(st, m), 'b'));
    if (!checks.length) continue;
    const m = checks[rInt(checks.length)];
    return { tip: `Move your ${PIECE_NAME[ch.toLowerCase()]} to check the black king!`, fen, from: sq, to: [C.squareName(m.to)], needCheck: true };
  }
  return null;
}
// Skill: DEFEND — your king is in check, get it out (move, block, or capture).
function genDefend() {
  for (let t = 0; t < 300; t++) {
    const pieces = {}; placeKings(pieces);
    const ch = ['q', 'r', 'b'][rInt(3)];
    const sq = anEmpty(pieces); if (!sq) continue; pieces[sq] = ch;
    const st = C.fromFEN(makeFEN(pieces, 'w'));
    if (!C.inCheck(st, 'w') || C.inCheck(st, 'b')) continue; // white in check, black not
    const moves = C.legalMoves(st);
    if (!moves.length) continue;                              // that would be mate — skip
    const fromSq = moves[rInt(moves.length)].from;            // pick one piece that can save the king
    const tos = moves.filter(m => m.from === fromSq).map(m => C.squareName(m.to));
    return { tip: 'Check! Defend your king — move the glowing piece to safety.', fen: makeFEN(pieces, 'w'), from: C.squareName(fromSq), to: tos };
  }
  return null;
}
// Skill: LUFT — push a pawn near your king so it has an escape (stops back-rank mate).
const LUFT_TEMPLATES = [
  { fen: '6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1', from: 'h2', to: ['h3', 'h4'] },
  { fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', from: 'h2', to: ['h3', 'h4'] },
  { fen: '1k6/ppp5/8/8/8/8/PPP5/1K6 w - - 0 1', from: 'a2', to: ['a3', 'a4'] },
];
function genLuft() {
  const t = LUFT_TEMPLATES[rInt(LUFT_TEMPLATES.length)];
  return { tip: 'Make LUFT — push a pawn by your king so it gets an escape square and can’t be back-rank mated!', fen: t.fen, from: t.from, to: t.to.slice() };
}
// Skill: checkmate in one — from proven patterns, sometimes mirrored for variety.
const MATE_TEMPLATES = [
  { fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', from: 'a1', to: 'a8' },
  { fen: '6k1/8/6K1/8/8/8/8/3Q4 w - - 0 1', from: 'd1', to: 'd8' },
  { fen: '7k/6pp/8/8/8/8/8/R3K3 w - - 0 1', from: 'a1', to: 'a8' },
  { fen: '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', from: 'g1', to: 'g7' },
  { fen: '6k1/5ppp/8/8/8/8/8/3QK3 w - - 0 1', from: 'd1', to: 'd8' },
  { fen: '7k/8/6QK/8/8/8/8/8 w - - 0 1', from: 'g6', to: 'g7' },
  { fen: '5k2/8/5K2/8/8/8/8/R7 w - - 0 1', from: 'a1', to: 'a8' },
];
function mirrorSq(name) { return C.FILES[7 - C.FILES.indexOf(name[0])] + name[1]; }
function mirrorFEN(fen) {
  const parts = fen.split(' ');
  parts[0] = parts[0].split('/').map(row => {
    let ex = ''; for (const ch of row) ex += /\d/.test(ch) ? ' '.repeat(+ch) : ch;
    ex = ex.split('').reverse().join('');
    let out = '', e = 0;
    for (const ch of ex) { if (ch === ' ') e++; else { if (e) { out += e; e = 0; } out += ch; } }
    return out + (e || '');
  }).join('/');
  return parts.join(' ');
}
function genMate() {
  const t = MATE_TEMPLATES[rInt(MATE_TEMPLATES.length)];
  let fen = t.fen, from = t.from, to = t.to;
  if (Math.random() < 0.5) { fen = mirrorFEN(fen); from = mirrorSq(from); to = mirrorSq(to); }
  return { tip: 'Checkmate in one — trap the black king!', fen, from, to: [to], needMate: true };
}
// Levels are real chess: tactics, checkmates, defending, and luft — NOT "move to a
// star". Each level leans harder toward finding mates.
function genForLevel(key) {
  let s = null, guard = 0;
  while (!s && guard++ < 10) {
    const r = Math.random();
    if (key === 'beginner') {
      s = r < 0.35 ? genMate()
        : r < 0.65 ? genCapture(['R', 'B', 'N', 'Q'], ['n', 'b', 'r', 'p'])  // win material
        : r < 0.85 ? genDefend()                                              // get out of check
        : genLuft();                                                          // make an escape
    } else if (key === 'intermediate') {
      s = r < 0.4 ? genMate() : r < 0.68 ? genCapture(['R', 'B', 'N', 'Q'], ['n', 'b', 'r']) : r < 0.86 ? genCheck(['R', 'B', 'Q', 'N']) : genDefend();
    } else if (key === 'advanced') {
      s = r < 0.5 ? genMate() : r < 0.76 ? genCheck(['R', 'B', 'Q', 'N']) : genCapture(['R', 'B', 'N', 'Q'], ['b', 'r', 'q']);
    } else if (key === 'expert') {
      s = r < 0.7 ? genMate() : genCheck(['R', 'B', 'Q', 'N']);
    } else {
      s = r < 0.85 ? genMate() : genCheck(['R', 'B', 'Q', 'N']);
    }
  }
  return s || genMate();
}

// The Learn modal has three views: a MENU of big boxes, then either the Basic
// Skills list or a Level's grid of 50 stars, and finally the board you play on.
let learnView = 'menu';   // 'menu' | 'basics' | 'level'
let learnLevelKey = null;

// Puzzle streak: how many level puzzles you've solved in a row (clean — no wrong
// move and no hint). Saved so it lasts between visits, with your best ever.
let puzzleStreak = parseInt(localStorage.getItem('chesserPzStreak') || '0', 10);
let puzzleBest = parseInt(localStorage.getItem('chesserPzBest') || '0', 10);
function setPuzzleStreak(n) {
  puzzleStreak = n;
  if (n > puzzleBest) { puzzleBest = n; localStorage.setItem('chesserPzBest', String(n)); }
  localStorage.setItem('chesserPzStreak', String(n));
  paintStreak();
}
function paintStreak() {
  const el = $('puzzle-streak');
  if (el) el.innerHTML = `\u{1F525} <strong>${puzzleStreak}</strong>${puzzleBest ? ` · best ${puzzleBest}` : ''}`;
}

function openLearnModal() {
  goLearnMenu();
  $('learn-modal').classList.remove('hidden');
  $('learn-close').onclick = () => { learn = null; $('learn-modal').classList.add('hidden'); };
  $('learn-back').onclick = backFromPlay;   // the × on the playing board
}

// Show the picker area (hide the board).
function showPickView() {
  learn = null;
  if ($('learn-play')) $('learn-play').classList.add('hidden');
  if ($('learn-pick')) $('learn-pick').classList.remove('hidden');
}
function goLearnMenu() { learnView = 'menu'; showPickView(); renderLearnMenu(); }
function goBasics()    { learnView = 'basics'; showPickView(); renderBasicsList(); }
function goLevel(key)  { learnView = 'level'; learnLevelKey = key; showPickView(); renderLevelStars(key); }
// The × on the board returns to whichever list we came from.
function backFromPlay() {
  if (learnView === 'level' && learnLevelKey) goLevel(learnLevelKey);
  else if (learnView === 'basics') goBasics();
  else goLearnMenu();
}

// --- View 1: the menu of big boxes (one Basic Skills box + five Level boxes) ---
function renderLearnMenu() {
  const wrap = $('learn-pick'); if (!wrap) return;
  wrap.className = 'learn-menu'; wrap.innerHTML = '';
  const bDone = chessLessonsDone();
  wrap.appendChild(bigCard('\u{1F393}', 'Basic Skills',
    `${bDone}/${CHESS_LESSONS.length} learned · free`, false, bDone >= CHESS_LESSONS.length, goBasics));
  const member = isMember();
  LEVELS.forEach((lvl, idx) => {
    const progUnlocked = levelProgressUnlocked(idx);
    const open = member && progUnlocked;
    const complete = levelComplete(lvl.key);
    const sub = !member ? '\u{1F512} Bronze members only'
      : !progUnlocked ? '\u{1F512} Finish the level before it'
      : `${levelDone(lvl.key)} / ${SKILLS_PER_LEVEL} skills${complete ? ' · done ✅' : ''}`;
    wrap.appendChild(bigCard(lvl.emoji, lvl.name, sub, !open, complete, () => {
      if (!member) { requireBronze(); return; }
      if (progUnlocked) goLevel(lvl.key);
    }));
  });
}
function bigCard(emoji, title, sub, locked, done, onClick) {
  const b = document.createElement('button');
  b.className = 'learn-card' + (locked ? ' locked' : '') + (done ? ' done' : '');
  b.innerHTML = `<span class="learn-card-emoji">${emoji}</span>` +
    `<span class="learn-card-text"><span class="learn-card-title">${title}</span>` +
    `<span class="learn-card-sub">${sub}</span></span><span class="learn-card-go">${locked ? '' : '›'}</span>`;
  b.onclick = onClick;
  return b;
}

// --- View 2a: the 10 Basic Skills (each opens onto the board) ---
function renderBasicsList() {
  const wrap = $('learn-pick'); if (!wrap) return;
  wrap.className = ''; wrap.innerHTML = '';
  wrap.appendChild(backRow('\u{1F393} Basic Skills', goLearnMenu));
  const g = document.createElement('div'); g.className = 'lesson-pick';
  const done = chessLessonsDone();
  CHESS_LESSONS.forEach((s, i) => {
    const locked = i > done, beaten = i < done;
    g.appendChild(learnItem(s.emoji, s.name, beaten ? '✅' : locked ? '\u{1F512}' : '▶', locked, beaten,
      () => { if (!locked) startBasicSkill(i); }));
  });
  wrap.appendChild(g);
}

// --- View 2b: a Level shows ONE big star for your current skill — tap it to play ---
function renderLevelStars(key) {
  const lvl = LEVELS.find(l => l.key === key);
  const wrap = $('learn-pick'); if (!wrap) return;
  wrap.className = ''; wrap.innerHTML = '';
  wrap.appendChild(backRow(`${lvl.emoji} ${lvl.name}`, goLearnMenu));

  const done = levelDone(key);
  const complete = done >= SKILLS_PER_LEVEL;
  const info = document.createElement('div');
  info.className = 'learn-stars-info';
  info.innerHTML = `<strong>${done}</strong> / ${SKILLS_PER_LEVEL} skills earned`;
  wrap.appendChild(info);

  // Progress bar so you can see how far along the level you are.
  const bar = document.createElement('div'); bar.className = 'level-progress';
  const fill = document.createElement('div'); fill.className = 'level-progress-fill';
  fill.style.width = Math.round((done / SKILLS_PER_LEVEL) * 100) + '%';
  bar.appendChild(fill); wrap.appendChild(bar);

  // The single big star you tap.
  const box = document.createElement('div'); box.className = 'big-star-box';
  const star = document.createElement('button');
  star.className = 'big-star' + (complete ? ' complete' : '');
  star.textContent = complete ? '🏆' : '★';
  star.onclick = () => startLevelSkill(key, complete ? 0 : done); // replay from 1 once finished
  box.appendChild(star);
  const label = document.createElement('div'); label.className = 'big-star-label';
  label.textContent = complete ? 'Level done! Tap to play again' : `Skill ${done + 1} — tap the star to play!`;
  box.appendChild(label);
  wrap.appendChild(box);
}

function learnItem(emoji, title, tag, locked, beaten, onClick) {
  const btn = document.createElement('button');
  btn.className = 'lesson-item' + (locked ? ' locked' : '') + (beaten ? ' done' : '');
  btn.innerHTML = `<span class="lesson-emoji">${emoji}</span><span class="lesson-title">${title}</span><span class="lesson-tag">${tag}</span>`;
  btn.onclick = onClick;
  return btn;
}
function backRow(title, onBack) {
  const row = document.createElement('div'); row.className = 'learn-subhead';
  const b = document.createElement('button'); b.className = 'learn-back-btn'; b.textContent = '‹ Back'; b.onclick = onBack;
  const t = document.createElement('span'); t.className = 'learn-subtitle'; t.textContent = title;
  row.appendChild(b); row.appendChild(t);
  return row;
}

// --- Basic skill: play its 2 built-in challenges in a row ---
function startBasicSkill(i) {
  const s = CHESS_LESSONS[i];
  learn = { mode: 'basic', skillIndex: i, chalIndex: 0, total: s.challenges.length };
  $('learn-pick').classList.add('hidden');
  $('learn-play').classList.remove('hidden');
  loadBasicChallenge();
}
function loadBasicChallenge() {
  const s = CHESS_LESSONS[learn.skillIndex];
  loadChallenge(s.challenges[learn.chalIndex],
    `${s.emoji} ${s.name} — Challenge ${learn.chalIndex + 1} of ${learn.total}`, s.tip);
}

// --- Level skill: 5 generated challenges in a row (Bronze) ---
function startLevel(key) {
  const idx = LEVELS.findIndex(l => l.key === key);
  if (!isMember()) { requireBronze(); return; }
  if (!levelProgressUnlocked(idx)) return;
  startLevelSkill(key, Math.min(levelDone(key), SKILLS_PER_LEVEL - 1)); // resume where you were
}
function startLevelSkill(key, skillIndex) {
  learn = { mode: 'level', levelKey: key, skillIndex, chalIndex: 0, total: CHALLENGES_PER_SKILL };
  $('learn-pick').classList.add('hidden');
  $('learn-play').classList.remove('hidden');
  loadLevelChallenge();
}
function loadLevelChallenge() {
  const lvl = LEVELS.find(l => l.key === learn.levelKey);
  const item = genForLevel(learn.levelKey);
  loadChallenge(item,
    `${lvl.emoji} ${lvl.name} — Skill ${learn.skillIndex + 1}/${SKILLS_PER_LEVEL} · Challenge ${learn.chalIndex + 1}/${learn.total}`,
    item.tip);
}

// Put one challenge (a single position) on the board. Learn is a guided tutorial:
// it glows the piece to move and the star to move it to.
function loadChallenge(item, title, tip) {
  learn.item = item;
  learn.state = C.fromFEN(item.fen);
  learn.fromIdx = C.squareToIndex(item.from);
  learn.toIdxs = item.to.map(C.squareToIndex);
  learn.selected = null;
  $('learn-name').textContent = title;
  $('learn-instruction').textContent = tip || item.tip || 'Find the move!';
  $('learn-feedback').textContent = '';
  renderLearnBoard();
}

// Draw the tutorial's own little board (white at the bottom, always). Learn GUIDES
// you: the piece to move glows, and its target square shows a star.
function renderLearnBoard() {
  const boardEl = $('learn-board');
  if (!boardEl || !learn) return;
  boardEl.innerHTML = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const i = C.idx(r, c);
      const sq = document.createElement('div');
      sq.className = 'lsq ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      const piece = learn.state.board[i];
      if (piece) {
        const span = document.createElement('span');
        span.className = 'lpiece ' + (C.isWhite(piece) ? 'wp' : 'bp');
        span.textContent = UNICODE[piece];
        sq.appendChild(span);
      }
      if (i === learn.fromIdx && learn.selected == null) sq.classList.add('guide-from');
      if (learn.selected === i) sq.classList.add('picked');
      if (learn.selected != null && learn.toIdxs.includes(i)) sq.classList.add('guide-to');
      sq.onclick = () => onLearnClick(i);
      boardEl.appendChild(sq);
    }
  }
}

function onLearnClick(i) {
  if (!learn) return;
  // Step 1: pick the glowing piece.
  if (learn.selected == null) {
    if (i === learn.fromIdx) { learn.selected = i; renderLearnBoard(); }
    else wobble(i);
    return;
  }
  // Tapping the piece again unselects it.
  if (i === learn.selected) { learn.selected = null; renderLearnBoard(); return; }
  // Step 2: move to a star square (must be a legal move too).
  const legal = C.legalMovesFrom(learn.state, learn.fromIdx).some((m) => m.to === i);
  if (learn.toIdxs.includes(i) && legal) {
    const move = C.legalMovesFrom(learn.state, learn.fromIdx).find((m) => m.to === i);
    const next = C.applyMove(learn.state, move);
    const l = learn.item;
    if (l.needMate && C.gameStatus(next) !== 'checkmate') { wobble(i); return; }
    if (l.needCheck && !C.inCheck(next, next.turn)) { wobble(i); return; }
    learn.state = next; learn.selected = null; learn.toIdxs = [];
    renderLearnBoard();
    finishChessLesson();
  } else {
    wobble(i);
  }
}

function wobble(i) {
  const boardEl = $('learn-board');
  const sq = boardEl && boardEl.children[i];
  if (sq) { sq.classList.add('wrong'); setTimeout(() => sq.classList.remove('wrong'), 300); }
}

// Called when a single challenge is solved. Advance within the skill, then move on.
function finishChessLesson() {
  learn.chalIndex++;
  const moreInSkill = learn.chalIndex < learn.total;
  if (learn.mode === 'basic') {
    if (moreInSkill) { $('learn-feedback').textContent = '✅ Nice!'; setTimeout(loadBasicChallenge, 850); return; }
    const i = learn.skillIndex, wasLast = i >= CHESS_LESSONS.length - 1;
    if (i >= chessLessonsDone()) localStorage.setItem('chesserChessLessons', String(i + 1));
    checkAchievements();   // achievements: basic-lesson progress (computed from storage)
    $('learn-feedback').textContent = wasLast ? '\u{1F389} All basics done — Levels unlocked!' : '⭐ Skill complete!';
    setTimeout(goBasics, 1300);          // back to the list so you see the new ✅
  } else {
    if (moreInSkill) { $('learn-feedback').textContent = '✅ Correct!'; setTimeout(loadLevelChallenge, 800); return; }
    const key = learn.levelKey, si = learn.skillIndex, lvl = LEVELS.find(l => l.key === key);
    if (si >= levelDone(key)) setLevelDone(key, si + 1);
    checkAchievements();   // achievements: level progress (computed from storage)
    const wasLast = si >= SKILLS_PER_LEVEL - 1;
    $('learn-feedback').textContent = wasLast ? `\u{1F3C6} ${lvl.name} mastered!` : '⭐ Skill complete!';
    setTimeout(() => goLevel(key), 1200); // back to the star grid so you see the new ★
  }
}

// Small helper so the panel can update the bottom button's look too.
function paintMusicBtnGlobal(on) {
  const b = $('music-toggle');
  if (!b) return;
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  const lbl = b.querySelector('.music-label');
  if (lbl) lbl.textContent = on ? 'Music: On' : 'Music: Off';
}

// ============ Init ============
wireEvents();
restoreSession();   // keep your membership across restarts (Bronze stays Bronze)
renderMembership();
renderBadges();            // show the Star Legend badge up top if earned
renderEngineButtons();
checkAchievements(true);   // reconcile already-earned achievements on load, silently (no toast storm)
