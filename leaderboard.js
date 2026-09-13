

const LB_LOCAL_KEY = 'screamingSnake_leaderboard_local';
const LB_MAX_ENTRIES = 10;

let _supabaseClient = null;
let _supabaseReady = false;

function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;
  const configured =
    typeof SUPABASE_URL !== 'undefined' &&
    typeof SUPABASE_ANON_KEY !== 'undefined' &&
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL' &&
    SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';

  if (!configured || typeof window.supabase === 'undefined') {
    _supabaseReady = false;
    return null;
  }

  try {
    _supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    _supabaseReady = true;
    return _supabaseClient;
  } catch (err) {
    console.warn('[LEADERBOARD] Supabase client init failed:', err);
    _supabaseReady = false;
    return null;
  }
}

/* ---------- Local fallback (used if Supabase isn't configured/reachable) ---------- */
function getLocalLeaderboard() {
  try {
    const raw = localStorage.getItem(LB_LOCAL_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveLocalLeaderboard(list) {
  localStorage.setItem(LB_LOCAL_KEY, JSON.stringify(list));
}

// Only replaces the player's entry if the new score beats their stored best.
// Returns { list, improved }.
function saveLocalEntry(name, score, len, mode) {
  const list = getLocalLeaderboard();
  const existingIndex = list.findIndex(e => e.name === name);

  if (existingIndex === -1) {
    list.push({ name, score, snake_length: len, mode, created_at: new Date().toISOString() });
    list.sort((a, b) => b.score - a.score);
    saveLocalLeaderboard(list);
    return { list, improved: true };
  }

  if (score > list[existingIndex].score) {
    list[existingIndex] = { name, score, snake_length: len, mode, created_at: new Date().toISOString() };
    list.sort((a, b) => b.score - a.score);
    saveLocalLeaderboard(list);
    return { list, improved: true };
  }

  return { list, improved: false };
}

/* ---------- Public API ---------- */

// Submits a completed run. Only overwrites the player's stored score if it's
// higher. Returns { ok, source: 'supabase'|'local', improved, error? }
async function submitScore(name, score, len, mode) {
  const cleanName = (name || 'PLAYER').trim().slice(0, 12).toUpperCase() || 'PLAYER';
  const client = getSupabaseClient();

  if (client) {
    try {
      const { data: existing, error: fetchErr } = await client
        .from('leaderboard')
        .select('id, score')
        .eq('name', cleanName)
        .maybeSingle();
      if (fetchErr) throw fetchErr;

      if (!existing) {
        const { error } = await client
          .from('leaderboard')
          .insert([{ name: cleanName, score, snake_length: len, mode }]);
        if (error) throw error;
        return { ok: true, source: 'supabase', improved: true };
      }

      if (score > existing.score) {
        const { error } = await client
          .from('leaderboard')
          .update({ score, snake_length: len, mode, created_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
        return { ok: true, source: 'supabase', improved: true };
      }

      return { ok: true, source: 'supabase', improved: false };
    } catch (err) {
      console.warn('[LEADERBOARD] Supabase submit failed, falling back to local:', err);
      const { improved } = saveLocalEntry(cleanName, score, len, mode);
      return { ok: true, source: 'local', improved, error: err };
    }
  }

  const { improved } = saveLocalEntry(cleanName, score, len, mode);
  return { ok: true, source: 'local', improved };
}

// Fetches top N scores. Returns { ok, source, entries }
async function fetchTopScores(limit = LB_MAX_ENTRIES) {
  const client = getSupabaseClient();

  if (client) {
    try {
      const { data, error } = await client
        .from('leaderboard')
        .select('name, score, snake_length, mode, created_at')
        .order('score', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { ok: true, source: 'supabase', entries: data || [] };
    } catch (err) {
      console.warn('[LEADERBOARD] Supabase fetch failed, showing local scores:', err);
      return { ok: true, source: 'local', entries: getLocalLeaderboard().slice(0, limit), error: err };
    }
  }

  return { ok: true, source: 'local', entries: getLocalLeaderboard().slice(0, limit) };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Renders entries into a container element (an <ol>/<ul>).
function renderLeaderboardEntries(containerEl, entries, source) {
  if (!containerEl) return;

  if (!entries || entries.length === 0) {
    containerEl.innerHTML = '<li class="lb-empty">NO SCORES YET — BE THE FIRST CRASH</li>';
    return;
  }

  containerEl.innerHTML = entries.map((entry, i) => {
    const rank = String(i + 1).padStart(2, '0');
    return `
      <li class="lb-row">
        <span class="lb-rank">${rank}</span>
        <span class="lb-name">${escapeHtml(entry.name)}</span>
        <span class="lb-mode">${escapeHtml(entry.mode || '')}</span>
        <span class="lb-score">${String(entry.score).padStart(4, '0')}</span>
      </li>
    `;
  }).join('');
}
