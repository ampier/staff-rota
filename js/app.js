(function () {
  "use strict";

  const STORAGE_KEY = "staff-rota-v2";
  const STORAGE_KEY_V1 = "staff-rota-v1";
  const FILTER_KEY = "staff-rota-filter-v1";
  const THEME_KEY = "staff-rota-theme";
  const SETTINGS_KEY = "staff-rota-settings";
  const COLORS = ["#2563eb","#059669","#d97706","#db2777","#7c3aed","#0891b2","#dc2626","#4f46e5"];

  /** @typedef {{start:string,end:string,person:string|null}} Slot */
  /** @typedef {{days:Record<string,Slot[]>,notes:string,holidays:{day:number,label:string}[]}} MonthSchedule */

  /** @type {{version:number,year:number,month:number,people:any[],schedules:Record<string,MonthSchedule>}} */
  let state;
  /** @type {Set<string>} */
  let selectedPeople = new Set();
  let strictAvailability = true;
  /** @type {'system'|'light'|'dark'} */
  let themePref = "system";
  let clipboardDay = null; // { slots }
  let focusTrapHandler = null;

  // ---------- theme ----------
  function loadTheme() {
    try {
      const t = localStorage.getItem(THEME_KEY);
      if (t === "light" || t === "dark" || t === "system") themePref = t;
    } catch (_) {}
    applyTheme();
  }

  function applyTheme() {
    const root = document.documentElement;
    if (themePref === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", themePref);
    const btn = document.getElementById("btn-theme");
    if (btn) {
      const labels = { system: "Tema: süsteem", light: "Tema: hele", dark: "Tema: tume" };
      const icons = { system: "◐", light: "☀", dark: "☾" };
      btn.textContent = icons[themePref];
      btn.title = labels[themePref] + " (klõpsa vahetamiseks)";
      btn.setAttribute("aria-label", labels[themePref]);
    }
  }

  function cycleTheme() {
    themePref = themePref === "system" ? "light" : themePref === "light" ? "dark" : "system";
    try { localStorage.setItem(THEME_KEY, themePref); } catch (_) {}
    applyTheme();
    toast(themePref === "system" ? "Teema: süsteemi eelistus" : themePref === "light" ? "Hele teema" : "Tume teema");
  }

  // ---------- month keys ----------
  function monthKey(y, m) {
    return `${y}-${String(m).padStart(2, "0")}`;
  }

  function parseMonthKey(key) {
    const [y, m] = key.split("-").map(Number);
    return { year: y, month: m };
  }

  function currentSched() {
    const key = monthKey(state.year, state.month);
    if (!state.schedules[key]) {
      state.schedules[key] = { days: {}, notes: "", holidays: [] };
    }
    return state.schedules[key];
  }

  function saveCurrentMonthFromLegacy(days, notes, holidays) {
    state.schedules[monthKey(state.year, state.month)] = {
      days: days || {},
      notes: notes || "",
      holidays: holidays || [],
    };
  }

  // ---------- persistence ----------
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.strictAvailability === "boolean") strictAvailability = s.strictAvailability;
      }
    } catch (_) {}
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ strictAvailability }));
    } catch (_) {}
  }

  function migrateV1(raw) {
    const old = JSON.parse(raw);
    const key = monthKey(old.year || 2026, old.month || 10);
    return {
      version: 2,
      year: old.year || 2026,
      month: old.month || 10,
      people: (old.people || []).map((p, i) => ({
        id: p.id || p.name.toLowerCase(),
        name: p.name,
        availability: p.availability || [],
        color: p.color || COLORS[i % COLORS.length],
      })),
      schedules: {
        [key]: {
          days: normalizeDays(old.days || {}),
          notes: old.notes || "",
          holidays: old.holidays || [],
        },
      },
    };
  }

  function normalizeDays(days) {
    const out = {};
    for (const [d, slots] of Object.entries(days)) {
      out[d] = (slots || []).map((s) => ({
        start: s.start,
        end: s.end,
        // null = N/A, "" = empty, string = name
        person: s.person === undefined ? "" : s.person,
      }));
    }
    return out;
  }

  function loadState() {
    try {
      const raw2 = localStorage.getItem(STORAGE_KEY);
      if (raw2) {
        state = JSON.parse(raw2);
        if (!state.schedules) {
          // broken — reseed
          seedFromDefault();
          return;
        }
        return;
      }
      const raw1 = localStorage.getItem(STORAGE_KEY_V1);
      if (raw1) {
        state = migrateV1(raw1);
        saveState();
        return;
      }
    } catch (_) {}
    seedFromDefault();
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast("Salvestamine ebaõnnestus (localStorage)");
    }
  }

  function loadFilter() {
    try {
      const raw = localStorage.getItem(FILTER_KEY);
      if (raw) {
        selectedPeople = new Set(JSON.parse(raw));
        return;
      }
    } catch (_) {}
    selectedPeople = new Set(state.people.map((p) => p.name));
  }

  function saveFilter() {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify([...selectedPeople]));
    } catch (_) {}
  }

  function seedFromDefault() {
    const s = window.ROTA_SEED;
    const key = monthKey(s.year, s.month);
    state = {
      version: 2,
      year: s.year,
      month: s.month,
      people: s.people.map((p, i) => ({
        id: p.id,
        name: p.name,
        availability: [...p.availability],
        color: COLORS[i % COLORS.length],
      })),
      schedules: {
        [key]: {
          days: normalizeDays(JSON.parse(JSON.stringify(s.days))),
          notes: s.notes,
          holidays: [...s.holidays],
        },
      },
    };
    selectedPeople = new Set(state.people.map((p) => p.name));
    saveState();
    saveFilter();
  }

  // ---------- time helpers ----------
  function daysInMonth(y, m) {
    return new Date(y, m, 0).getDate();
  }

  function weekdayMon0(y, m, d) {
    return (new Date(y, m - 1, d).getDay() + 6) % 7;
  }

  function toMinutes(hhmm) {
    const [h, m] = String(hhmm).split(":").map(Number);
    return h * 60 + m;
  }

  /** Overnight-aware intervals in [0, 1440). */
  function rangeIntervals(start, end) {
    const s = toMinutes(start);
    let e = toMinutes(end);
    if (Number.isNaN(s) || Number.isNaN(e)) return [];
    if (e > s) return [[s, e]];
    if (e === s) return [[0, 1440]];
    return [[s, 1440], [0, e]];
  }

  function intervalsOverlap(a, b) {
    return a.some(([a0, a1]) => b.some(([b0, b1]) => a0 < b1 && b0 < a1));
  }

  /** True if inner range is fully inside outer range (overnight-aware). */
  function rangeContainedIn(innerStart, innerEnd, outerStart, outerEnd) {
    const inn = rangeIntervals(innerStart, innerEnd);
    const out = rangeIntervals(outerStart, outerEnd);
    return inn.every(([i0, i1]) => out.some(([o0, o1]) => i0 >= o0 && i1 <= o1));
  }

  function parseAvailWindow(str) {
    const m = String(str).match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/);
    if (!m) return null;
    return { start: normalizeTime(m[1]), end: normalizeTime(m[2]) };
  }

  function normalizeTime(t) {
    const [h, m] = t.split(":").map(Number);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function slotKind(start, end) {
    const key = `${start}-${end}`;
    if (key === "08:00-14:00") return "am";
    if (key === "14:00-20:00") return "pm";
    if (key === "20:00-08:00") return "night";
    if (key === "08:00-20:00") return "day";
    return "custom";
  }

  function slotLabel(start, end) {
    const k = slotKind(start, end);
    return ({ am: "Hommik", pm: "Pärastlõuna", night: "Öö", day: "Päev", custom: "Kohandatud" })[k];
  }

  function personByName(name) {
    return state.people.find((p) => p.name === name);
  }

  function isAssigned(person) {
    return typeof person === "string" && person.length > 0;
  }

  function displayPerson(person) {
    if (person === null) return "N/A";
    if (!person) return "—";
    return person;
  }

  function checkAvailability(personName, start, end) {
    if (!isAssigned(personName)) return { ok: true };
    const p = personByName(personName);
    if (!p || !p.availability || p.availability.length === 0) return { ok: true };
    const windows = p.availability.map(parseAvailWindow).filter(Boolean);
    if (!windows.length) return { ok: true };
    const ok = windows.some((w) => rangeContainedIn(start, end, w.start, w.end));
    if (ok) return { ok: true };
    return {
      ok: false,
      message: `${personName} lubatud: ${p.availability.join(", ")}. Vahetus ${start}–${end} jääb väljapoole.`,
    };
  }

  /** Same-person overlapping slots on a day. */
  function dayConflicts(day) {
    const sched = currentSched();
    const slots = sched.days[day] || [];
    const conflicts = new Set(); // slot indices
    for (let i = 0; i < slots.length; i++) {
      const a = slots[i];
      if (!isAssigned(a.person)) continue;
      for (let j = i + 1; j < slots.length; j++) {
        const b = slots[j];
        if (b.person !== a.person) continue;
        if (intervalsOverlap(rangeIntervals(a.start, a.end), rangeIntervals(b.start, b.end))) {
          conflicts.add(i);
          conflicts.add(j);
        }
      }
    }
    return conflicts;
  }

  function personMonthStats(name) {
    const sched = currentSched();
    const dim = daysInMonth(state.year, state.month);
    let shifts = 0;
    let conflictDays = 0;
    for (let d = 1; d <= dim; d++) {
      const slots = (sched.days[d] || []).filter((s) => s.person === name);
      if (!slots.length) continue;
      shifts += slots.length;
      const conf = dayConflicts(d);
      const idxs = (sched.days[d] || []).map((s, i) => (s.person === name ? i : -1)).filter((i) => i >= 0);
      if (idxs.some((i) => conf.has(i))) conflictDays++;
    }
    return { shifts, conflictDays };
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2400);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  // ---------- import ----------
  function parseScheduleText(text) {
    const cleaned = text
      .replace(/\f/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n");
    const lines = cleaned.split(/\r?\n/);
    const days = {};
    let year = state.year;
    let month = state.month;
    const foundPeople = new Set();
    const holidays = [];

    const monthMap = {
      jaanuar: 1, veebruar: 2, märts: 3, marts: 3, aprill: 4, mai: 5, juuni: 6,
      juuli: 7, august: 8, september: 9, oktoober: 10, november: 11, detsember: 12,
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
      july: 7, october: 10, december: 12,
    };

    const title = cleaned.match(/Graafik\s*[-–—:]?\s*([A-Za-zÄÖÜÕäöüõ]+)\s+(\d{4})/i);
    if (title) {
      const mName = title[1].toLowerCase();
      if (monthMap[mName]) month = monthMap[mName];
      year = Number(title[2]);
    }

    // Also: "1. Oktoober ..." without title
    const firstDayMonth = cleaned.match(/\d{1,2}\.\s*([A-Za-zÄÖÜÕäöüõ]+)\s*\(/);
    if (!title && firstDayMonth) {
      const mName = firstDayMonth[1].toLowerCase();
      if (monthMap[mName]) month = monthMap[mName];
    }

    const dayRe = /^(\d{1,2})\.\s*[A-Za-zÄÖÜÕäöüõ]+\s+(.+)$/i;
    const slotRe = /\(+(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\)\s*(N\/A|[A-ZÄÖÜÕ][A-ZÄÖÜÕ\-]*)/gi;

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const dm = line.match(dayRe);
      if (dm) {
        const day = Number(dm[1]);
        const slots = [];
        let m;
        slotRe.lastIndex = 0;
        while ((m = slotRe.exec(dm[2])) !== null) {
          const start = normalizeTime(m[1]);
          const end = normalizeTime(m[2]);
          const person = m[3].toUpperCase() === "N/A" ? null : m[3].toUpperCase();
          slots.push({ start, end, person });
          if (person) foundPeople.add(person);
        }
        if (slots.length) days[day] = slots;
        continue;
      }
      const flag = line.match(/(\d{1,2})\.(\d{1,2})\s*[-–—:]\s*(.+)/);
      if (flag && /lipup|hõimu|hoimu|puhkus|riiklik/i.test(cleaned)) {
        holidays.push({ day: Number(flag[1]), label: flag[3].replace(/^○\s*/, "").trim() });
      }
    }

    const noteParts = [];
    if (/Puhkused/i.test(cleaned)) {
      const puh = cleaned.match(/Puhkused\s*:?\s*([\s\S]*?)(?=Lipup|●\s*Lipup|$)/i);
      const body = puh ? puh[1].replace(/[●○]/g, "").trim() : "";
      noteParts.push("Puhkused: " + (body || "(tühi)"));
    }
    if (/Hõimupäev|Hoimupaev/i.test(cleaned)) {
      noteParts.push("Lipupäev: 17.10 — Hõimupäev");
      if (!holidays.some((h) => /hõimu|hoimu/i.test(h.label))) {
        holidays.push({ day: 17, label: "Hõimupäev" });
      }
    }

    return {
      year,
      month,
      days,
      foundPeople: [...foundPeople],
      holidays,
      notes: noteParts.join("\n"),
    };
  }

  function applyImport(parsed, mergePeople) {
    state.year = parsed.year;
    state.month = parsed.month;
    const key = monthKey(parsed.year, parsed.month);
    state.schedules[key] = {
      days: normalizeDays(parsed.days),
      notes: parsed.notes || currentSched().notes,
      holidays: parsed.holidays.length ? parsed.holidays : [],
    };
    if (mergePeople) {
      for (const name of parsed.foundPeople) {
        if (!personByName(name)) {
          state.people.push({
            id: name.toLowerCase().replace(/[^a-z0-9äöüõ]+/gi, "-"),
            name,
            availability: [],
            color: COLORS[state.people.length % COLORS.length],
          });
          selectedPeople.add(name);
        }
      }
    }
    saveState();
    saveFilter();
    render();
    toast("Import õnnestus");
  }

  // ---------- month navigation (no data loss) ----------
  function goToMonth(year, month, { createEmpty } = {}) {
    // current month already in schedules
    currentSched();
    state.year = year;
    state.month = month;
    const key = monthKey(year, month);
    if (!state.schedules[key]) {
      if (createEmpty !== false) {
        state.schedules[key] = { days: {}, notes: "", holidays: [] };
      }
    }
    saveState();
    render();
  }

  function changeMonth(delta) {
    let m = state.month + delta;
    let y = state.year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    goToMonth(y, m);
  }

  function deleteMonth(key) {
    const cur = monthKey(state.year, state.month);
    if (!state.schedules[key]) return;
    if (!confirm(`Kustuta kuu ${key} andmed jäädavalt?`)) return;
    delete state.schedules[key];
    if (key === cur) {
      const keys = Object.keys(state.schedules).sort();
      if (keys.length) {
        const p = parseMonthKey(keys[keys.length - 1]);
        state.year = p.year;
        state.month = p.month;
      } else {
        state.schedules[cur] = { days: {}, notes: "", holidays: [] };
      }
    }
    saveState();
    render();
    toast("Kuu kustutatud");
  }

  function clearCurrentMonth() {
    if (!confirm(`Tühjenda ${window.MONTH_NAMES_ET[state.month]} ${state.year}? Kõik selle kuu vahetused kustutatakse.`)) return;
    const sched = currentSched();
    sched.days = {};
    saveState();
    render();
    toast("Kuu tühjendatud");
  }

  function nextCalendarMonth(year, month) {
    if (month >= 12) return { year: year + 1, month: 1 };
    return { year, month: month + 1 };
  }

  function monthLabel(year, month) {
    return `${window.MONTH_NAMES_ET[month]} ${year}`;
  }

  /** Slot lists per weekday (Mon=0), in calendar order, including empty days. */
  function slotsByWeekday(year, month, days) {
    const buckets = [[], [], [], [], [], [], []];
    const dim = daysInMonth(year, month);
    for (let d = 1; d <= dim; d++) {
      buckets[weekdayMon0(year, month, d)].push(cloneSlots(days[d] || []));
    }
    return buckets;
  }

  function dominantSlotShape(days) {
    const counts = new Map();
    for (const slots of Object.values(days || {})) {
      if (!slots || !slots.length) continue;
      const key = slots.map((s) => `${s.start}-${s.end}`).join("|");
      const rec = counts.get(key) || { n: 0, slots };
      rec.n++;
      counts.set(key, rec);
    }
    let best = null;
    for (const rec of counts.values()) {
      if (!best || rec.n > best.n) best = rec;
    }
    if (!best) return cloneSlots(window.DAY_TEMPLATES.triple);
    return best.slots.map((s) => ({ start: s.start, end: s.end, person: "" }));
  }

  function conflictDayCount(days) {
    let n = 0;
    for (const slots of Object.values(days)) {
      let hit = false;
      for (let i = 0; i < slots.length && !hit; i++) {
        if (!isAssigned(slots[i].person)) continue;
        for (let j = i + 1; j < slots.length; j++) {
          if (slots[j].person !== slots[i].person) continue;
          if (intervalsOverlap(
            rangeIntervals(slots[i].start, slots[i].end),
            rangeIntervals(slots[j].start, slots[j].end)
          )) {
            hit = true;
            break;
          }
        }
      }
      if (hit) n++;
    }
    return n;
  }

  function monthHasContent(sched) {
    if (!sched) return false;
    if ((sched.notes || "").trim()) return true;
    if ((sched.holidays || []).length) return true;
    return Object.keys(sched.days || {}).length > 0;
  }

  /**
   * Plan the month after the one on screen.
   * empty — no shifts; template — weekday times, nobody assigned;
   * pattern — copy the Nth same weekday from this month, drop people
   * who fall outside their availability, keep overlaps so they render as conflicts.
   * @param {"empty"|"template"|"pattern"} mode
   */
  function planNextMonth(mode) {
    const next = nextCalendarMonth(state.year, state.month);
    const src = currentSched();
    const stats = { assigned: 0, skippedAvail: 0, conflicts: 0, emptySlots: 0, daysFilled: 0 };
    if (mode === "empty") return { ...next, days: {}, stats };

    const byWd = slotsByWeekday(state.year, state.month, src.days || {});
    const fallback = dominantSlotShape(src.days || {});
    const dim = daysInMonth(next.year, next.month);
    const seen = [0, 0, 0, 0, 0, 0, 0];
    const days = {};

    for (let d = 1; d <= dim; d++) {
      const wd = weekdayMon0(next.year, next.month, d);
      const samples = byWd[wd];
      const occ = seen[wd]++;
      let sample = samples.length ? samples[Math.min(occ, samples.length - 1)] : [];
      if (!sample.length) {
        if (mode === "template") sample = fallback;
        else continue;
      }
      const slots = sample.map((s) => {
        if (mode === "template") {
          stats.emptySlots++;
          return { start: s.start, end: s.end, person: "" };
        }
        if (s.person === null) return { start: s.start, end: s.end, person: null };
        if (!isAssigned(s.person) || !personByName(s.person)) {
          stats.emptySlots++;
          return { start: s.start, end: s.end, person: "" };
        }
        const avail = checkAvailability(s.person, s.start, s.end);
        if (!avail.ok) {
          stats.skippedAvail++;
          stats.emptySlots++;
          return { start: s.start, end: s.end, person: "" };
        }
        stats.assigned++;
        return { start: s.start, end: s.end, person: s.person };
      });
      days[d] = slots;
      stats.daysFilled++;
    }
    stats.conflicts = conflictDayCount(days);
    return { ...next, days, stats };
  }

  /** Write the planned month into multi-month storage and open it. Returns null if the user keeps the existing month. */
  function applyNextMonth(mode) {
    const plan = planNextMonth(mode);
    const key = monthKey(plan.year, plan.month);
    const label = monthLabel(plan.year, plan.month);
    if (monthHasContent(state.schedules[key])) {
      if (!confirm(`${label} on juba olemas. Asenda selle kuu graafik?`)) {
        goToMonth(plan.year, plan.month);
        return null;
      }
    }
    state.schedules[key] = { days: plan.days, notes: "", holidays: [] };
    goToMonth(plan.year, plan.month);
    return plan;
  }

  function openNextMonthModal() {
    const next = nextCalendarMonth(state.year, state.month);
    const from = monthLabel(state.year, state.month);
    const to = monthLabel(next.year, next.month);
    openModal(`
      <h3>Loo järgmine kuu</h3>
      <p class="modal-hint" style="margin-top:0">${escapeHtml(from)} → <strong>${escapeHtml(to)}</strong></p>
      <label for="m-mode">Sisu</label>
      <select id="m-mode">
        <option value="pattern">Nädalapäevade muster</option>
        <option value="template">Mall (ajad, ilma inimesteta)</option>
        <option value="empty">Tühi graafik</option>
      </select>
      <p class="modal-hint">Muster kopeerib eelmise kuu sama nädalapäeva vahetused (1. esmaspäev → 1. esmaspäev; viimane, kui uus kuu on pikem). Inimene jäetakse tühjaks, kui vahetus ei mahu tema saadavusse. Kattuvad broneeringud jäävad alles ja märgitakse konfliktiks.</p>
      <div id="m-preview"></div>
      <div class="modal-actions">
        <button class="btn" id="m-cancel" type="button">Tühista</button>
        <button class="btn btn-primary" id="m-save" type="button">Loo</button>
      </div>
    `, {
      onOpen(body) {
        const preview = body.querySelector("#m-preview");
        const modeEl = body.querySelector("#m-mode");
        function updatePreview() {
          const plan = planNextMonth(modeEl.value);
          const s = plan.stats;
          if (modeEl.value === "empty") {
            preview.innerHTML = `<div class="ok-box">Luuakse tühi ${escapeHtml(to)}. Inimesed ja teised kuud jäävad alles.</div>`;
            return;
          }
          const bits = [`${s.daysFilled} päeva`];
          if (modeEl.value === "pattern") {
            bits.push(`${s.assigned} määratud`);
            if (s.skippedAvail) bits.push(`${s.skippedAvail} saadavuse tõttu tühi`);
          } else {
            bits.push(`${s.emptySlots} täitmata vahetust`);
          }
          if (s.conflicts) bits.push(`${s.conflicts} konfliktipäeva`);
          const klass = s.conflicts || s.skippedAvail ? "warn-box" : "ok-box";
          preview.innerHTML = `<div class="${klass}">${escapeHtml(bits.join(" · "))}</div>`;
        }
        modeEl.addEventListener("change", updatePreview);
        updatePreview();
        body.querySelector("#m-cancel").onclick = closeModal;
        body.querySelector("#m-save").onclick = () => {
          const mode = modeEl.value;
          const plan = applyNextMonth(mode);
          closeModal();
          if (!plan) return;
          const s = plan.stats;
          if (mode === "empty") toast(`${to} loodud (tühi)`);
          else if (mode === "template") toast(`${to}: mall, ${s.daysFilled} päeva`);
          else {
            const extra = [
              s.skippedAvail ? `${s.skippedAvail} saadavus` : "",
              s.conflicts ? `${s.conflicts} konflikti` : "",
            ].filter(Boolean).join(", ");
            toast(`${to}: ${s.assigned} määratud${extra ? " · " + extra : ""}`);
          }
        };
      },
    });
  }

  // ---------- day editing helpers ----------
  function cloneSlots(slots) {
    return JSON.parse(JSON.stringify(slots || []));
  }

  function applyTemplate(day, templateKey) {
    const tpl = window.DAY_TEMPLATES[templateKey];
    if (!tpl) return;
    const sched = currentSched();
    if (sched.days[day] && sched.days[day].length) {
      if (!confirm(`${day}. päeval on juba vahetused. Asenda malliga?`)) return;
    }
    sched.days[day] = cloneSlots(tpl);
    saveState();
    render();
    toast("Mall rakendatud");
  }

  function duplicateDay(fromDay, toDay) {
    const sched = currentSched();
    const src = sched.days[fromDay];
    if (!src || !src.length) {
      toast("Lähtepäev on tühi");
      return;
    }
    if (sched.days[toDay] && sched.days[toDay].length) {
      if (!confirm(`Asenda ${toDay}. päeva vahetused ${fromDay}. päeva omadega?`)) return;
    }
    sched.days[toDay] = cloneSlots(src);
    saveState();
    render();
    toast(`${fromDay}. → ${toDay}. kopeeritud`);
  }

  function copyDayToClipboard(day) {
    const sched = currentSched();
    clipboardDay = cloneSlots(sched.days[day] || []);
    toast(`${day}. päev lõikelauale`);
  }

  function pasteDayFromClipboard(day) {
    if (!clipboardDay) {
      toast("Lõikelaud on tühi — kopeeri kõigepealt päev");
      return;
    }
    const sched = currentSched();
    if (sched.days[day] && sched.days[day].length) {
      if (!confirm(`Asenda ${day}. päev lõikelaua sisuga?`)) return;
    }
    sched.days[day] = cloneSlots(clipboardDay);
    saveState();
    render();
    toast(`Kleebitud ${day}. päeva`);
  }

  function copyWeekPattern(startDay) {
    // Copy Mon–Sun block starting at week's Monday containing startDay, onto next week
    const y = state.year;
    const m = state.month;
    const wd = weekdayMon0(y, m, startDay);
    const monday = startDay - wd;
    const dim = daysInMonth(y, m);
    if (monday < 1) {
      toast("Nädala algus jääb eelmisesse kuusse");
      return;
    }
    const nextMonday = monday + 7;
    if (nextMonday > dim) {
      toast("Järgmine nädal jääb järgmisesse kuusse");
      return;
    }
    if (!confirm(`Kopeeri nädal ${monday}.–${Math.min(monday + 6, dim)}. → ${nextMonday}.–${Math.min(nextMonday + 6, dim)}.?`)) return;
    const sched = currentSched();
    for (let i = 0; i < 7; i++) {
      const from = monday + i;
      const to = nextMonday + i;
      if (from > dim || to > dim) continue;
      if (sched.days[from]) sched.days[to] = cloneSlots(sched.days[from]);
      else delete sched.days[to];
    }
    saveState();
    render();
    toast("Nädala muster kopeeritud");
  }

  // ---------- render ----------
  function render() {
    renderMonthPickers();
    renderPeople();
    renderCalendar();
    renderNotes();
    renderMonthsList();
    renderStats();
    document.getElementById("month-title").textContent =
      `${window.MONTH_NAMES_ET[state.month]} ${state.year}`;
    document.getElementById("strict-toggle").checked = strictAvailability;
    applyTheme();
  }

  function renderMonthPickers() {
    const selM = document.getElementById("pick-month");
    const selY = document.getElementById("pick-year");
    if (!selM || !selY) return;
    if (selM.options.length === 0) {
      for (let m = 1; m <= 12; m++) {
        const o = document.createElement("option");
        o.value = String(m);
        o.textContent = window.MONTH_NAMES_ET[m];
        selM.appendChild(o);
      }
    }
    if (selY.options.length === 0) {
      for (let y = 2024; y <= 2032; y++) {
        const o = document.createElement("option");
        o.value = String(y);
        o.textContent = String(y);
        selY.appendChild(o);
      }
    }
    if (![...selY.options].some((o) => Number(o.value) === state.year)) {
      const o = document.createElement("option");
      o.value = String(state.year);
      o.textContent = String(state.year);
      const before = [...selY.options].find((opt) => Number(opt.value) > state.year);
      if (before) selY.insertBefore(o, before);
      else selY.appendChild(o);
    }
    selM.value = String(state.month);
    selY.value = String(state.year);
  }

  function renderStats() {
    const el = document.getElementById("stats-bar");
    if (!el) return;
    const sched = currentSched();
    const dim = daysInMonth(state.year, state.month);
    let filled = 0, emptySlots = 0, naSlots = 0, conflictCount = 0;
    for (let d = 1; d <= dim; d++) {
      const slots = sched.days[d] || [];
      if (slots.length) filled++;
      slots.forEach((s) => {
        if (s.person === null) naSlots++;
        else if (!s.person) emptySlots++;
      });
      conflictCount += dayConflicts(d).size > 0 ? 1 : 0;
    }
    el.innerHTML = `
      <span class="stat">Päevi täidetud: <strong>${filled}/${dim}</strong></span>
      <span class="stat">Täitmata: <strong>${emptySlots}</strong></span>
      <span class="stat">N/A: <strong>${naSlots}</strong></span>
      <span class="stat">Konfliktipäevi: <strong>${conflictCount}</strong></span>
    `;
  }

  function renderMonthsList() {
    const el = document.getElementById("months-list");
    if (!el) return;
    const keys = Object.keys(state.schedules).sort();
    const cur = monthKey(state.year, state.month);
    el.innerHTML = keys.map((k) => {
      const p = parseMonthKey(k);
      const label = `${window.MONTH_NAMES_ET[p.month]} ${p.year}`;
      const days = Object.keys(state.schedules[k].days || {}).length;
      return `<div class="month-item ${k === cur ? "current" : ""}">
        <span>${label} <small style="color:var(--muted)">(${days} päeva)</small></span>
        <button class="btn btn-sm" data-goto="${k}">Ava</button>
        <button class="btn btn-sm btn-danger" data-del-month="${k}" ${keys.length <= 1 ? "disabled" : ""}>×</button>
      </div>`;
    }).join("") || `<p class="modal-hint">Kuud puuduvad</p>`;

    el.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.onclick = () => {
        const p = parseMonthKey(btn.dataset.goto);
        goToMonth(p.year, p.month);
      };
    });
    el.querySelectorAll("[data-del-month]").forEach((btn) => {
      btn.onclick = () => deleteMonth(btn.dataset.delMonth);
    });
  }

  function renderPeople() {
    const list = document.getElementById("people-list");
    list.innerHTML = "";
    if (!state.people.length) {
      list.innerHTML = `<div class="empty-day-hint">Inimesi pole. Lisa esimene töötaja allpool.</div>`;
      return;
    }
    state.people.forEach((p) => {
      const stats = personMonthStats(p.name);
      const row = document.createElement("div");
      let statusClass = "free";
      let statusText = "vaba";
      if (stats.conflictDays > 0) { statusClass = "over"; statusText = "konflikt"; }
      else if (stats.shifts > 0) { statusClass = "busy"; statusText = `${stats.shifts}×`; }
      row.className = "person-row" + (stats.conflictDays ? " overbooked" : stats.shifts === 0 ? " free-today" : "");
      const checked = selectedPeople.has(p.name);
      row.innerHTML = `
        <span class="person-color" style="background:${p.color}"></span>
        <input type="checkbox" ${checked ? "checked" : ""} data-name="${escapeHtml(p.name)}" aria-label="Filtreeri ${escapeHtml(p.name)}">
        <div style="flex:1;min-width:0">
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="avail">${(p.availability || []).join(", ") || "kõik vahetused"}</div>
        </div>
        <span class="status-pill ${statusClass}" title="Vahetusi kuus / konfliktid">${statusText}</span>
        <button class="btn btn-sm" data-edit="${escapeHtml(p.name)}" title="Reeglid" aria-label="Muuda ${escapeHtml(p.name)}">⚙</button>
        <button class="btn btn-sm btn-danger" data-remove="${escapeHtml(p.name)}" title="Eemalda" aria-label="Eemalda ${escapeHtml(p.name)}">×</button>
      `;
      list.appendChild(row);
    });

    list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", () => {
        if (cb.checked) selectedPeople.add(cb.dataset.name);
        else selectedPeople.delete(cb.dataset.name);
        saveFilter();
        renderCalendar();
      });
    });
    list.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.dataset.remove;
        if (!confirm(`Eemalda ${name} kõigist kuudest? Määrangud tühistatakse.`)) return;
        state.people = state.people.filter((p) => p.name !== name);
        selectedPeople.delete(name);
        for (const sched of Object.values(state.schedules)) {
          for (const slots of Object.values(sched.days)) {
            slots.forEach((s) => { if (s.person === name) s.person = ""; });
          }
        }
        saveState();
        saveFilter();
        render();
        toast(`${name} eemaldatud`);
      });
    });
    list.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => openPersonModal(btn.dataset.edit));
    });
  }

  function renderNotes() {
    const ta = document.getElementById("notes-input");
    const sched = currentSched();
    if (document.activeElement !== ta) ta.value = sched.notes || "";
  }

  function renderCalendar() {
    const cal = document.getElementById("calendar");
    cal.innerHTML = "";
    window.WEEKDAY_NAMES_ET.forEach((w) => {
      const el = document.createElement("div");
      el.className = "weekday";
      el.textContent = w;
      cal.appendChild(el);
    });

    const sched = currentSched();
    const dim = daysInMonth(state.year, state.month);
    const startPad = weekdayMon0(state.year, state.month, 1);
    for (let i = 0; i < startPad; i++) {
      const empty = document.createElement("div");
      empty.className = "day-cell empty";
      cal.appendChild(empty);
    }

    const filterActive = selectedPeople.size > 0 && selectedPeople.size < state.people.length;

    for (let d = 1; d <= dim; d++) {
      const cell = document.createElement("div");
      const wd = weekdayMon0(state.year, state.month, d);
      const slots = sched.days[d] || [];
      const conf = dayConflicts(d);
      cell.className = "day-cell" + (wd >= 5 ? " weekend" : "");
      const hol = (sched.holidays || []).find((h) => h.day === d);
      if (hol) cell.classList.add("holiday");
      if (conf.size) cell.classList.add("has-conflict");
      if (!slots.length) cell.classList.add("is-empty-day");

      const num = document.createElement("div");
      num.className = "day-num";
      num.innerHTML = `<span>${d}</span>${hol ? `<span class="day-flag" title="${escapeHtml(hol.label)}">${escapeHtml(hol.label)}</span>` : ""}`;
      cell.appendChild(num);

      if (!slots.length) {
        const hint = document.createElement("div");
        hint.className = "empty-day-hint";
        hint.innerHTML = `<span>Tühi päev</span>`;
        const addTpl = document.createElement("button");
        addTpl.className = "btn btn-sm btn-primary";
        addTpl.textContent = "08–14 / 14–20 / 20–08";
        addTpl.onclick = () => applyTemplate(d, "triple");
        hint.appendChild(addTpl);
        cell.appendChild(hint);
      }

      slots.forEach((slot, idx) => {
        const btn = document.createElement("button");
        const kind = slotKind(slot.start, slot.end);
        const isNA = slot.person === null;
        const isEmpty = slot.person === "";
        btn.className = `slot ${kind}`;
        if (isNA) btn.classList.add("na");
        if (isEmpty) btn.classList.add("empty-slot");
        if (filterActive && isAssigned(slot.person) && !selectedPeople.has(slot.person)) {
          btn.classList.add("filtered-out");
        }
        const avail = checkAvailability(slot.person, slot.start, slot.end);
        if (!avail.ok) btn.classList.add("violation");
        if (conf.has(idx)) btn.classList.add("conflict");

        const nameClass = isNA ? "na" : isEmpty ? "empty" : "";
        btn.innerHTML = `<span class="slot-time">${slot.start}–${slot.end}</span><span class="slot-name ${nameClass}">${escapeHtml(displayPerson(slot.person))}</span>`;
        let title = `${slotLabel(slot.start, slot.end)} ${slot.start}–${slot.end}`;
        if (!avail.ok) title += " ⚠ " + avail.message;
        if (conf.has(idx)) title += " ⚠ Topeltbroneering";
        btn.title = title;
        btn.setAttribute("aria-label", `${d}. ${title}`);
        btn.addEventListener("click", () => openSlotModal(d, idx));
        cell.appendChild(btn);
      });

      const actions = document.createElement("div");
      actions.className = "day-actions no-print";
      actions.innerHTML = `
        <button class="btn btn-sm" data-act="add" title="Lisa vahetus">+</button>
        <button class="btn btn-sm" data-act="tpl-day" title="Mall: päev+öö">P+Ö</button>
        <button class="btn btn-sm" data-act="copy" title="Kopeeri päev">⧉</button>
        <button class="btn btn-sm" data-act="paste" title="Kleebi päev">📋</button>
        <button class="btn btn-sm" data-act="dup-next" title="Kopeeri järgmisele päevale">→</button>
        <button class="btn btn-sm" data-act="week" title="Kopeeri nädal → järgmine">Näd</button>
      `;
      actions.querySelector('[data-act="add"]').onclick = () => {
        if (!sched.days[d]) sched.days[d] = [];
        sched.days[d].push({ start: "08:00", end: "14:00", person: "" });
        saveState();
        openSlotModal(d, sched.days[d].length - 1);
        renderCalendar();
        renderStats();
      };
      actions.querySelector('[data-act="tpl-day"]').onclick = () => applyTemplate(d, "dayNight");
      actions.querySelector('[data-act="copy"]').onclick = () => copyDayToClipboard(d);
      actions.querySelector('[data-act="paste"]').onclick = () => pasteDayFromClipboard(d);
      actions.querySelector('[data-act="dup-next"]').onclick = () => {
        if (d >= dim) { toast("Järgmist päeva pole"); return; }
        duplicateDay(d, d + 1);
      };
      actions.querySelector('[data-act="week"]').onclick = () => copyWeekPattern(d);
      cell.appendChild(actions);

      cal.appendChild(cell);
    }
  }

  // ---------- modals ----------
  function openModal(html, { onOpen } = {}) {
    const backdrop = document.getElementById("modal-backdrop");
    const body = document.getElementById("modal-body");
    body.innerHTML = html;
    backdrop.classList.remove("hidden");
    const focusable = body.querySelector("select, input, button, textarea");
    if (focusable) setTimeout(() => focusable.focus(), 30);
    if (onOpen) onOpen(body);

    if (focusTrapHandler) document.removeEventListener("keydown", focusTrapHandler);
    focusTrapHandler = (e) => {
      if (e.key === "Escape") { e.preventDefault(); closeModal(); }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        const save = body.querySelector("#m-save");
        if (save) { e.preventDefault(); save.click(); }
      }
    };
    document.addEventListener("keydown", focusTrapHandler);
  }

  function closeModal() {
    document.getElementById("modal-backdrop").classList.add("hidden");
    if (focusTrapHandler) {
      document.removeEventListener("keydown", focusTrapHandler);
      focusTrapHandler = null;
    }
  }

  function openSlotModal(day, idx) {
    const sched = currentSched();
    const slot = sched.days[day][idx];
    const options = state.people
      .map((p) => `<option value="${escapeHtml(p.name)}" ${slot.person === p.name ? "selected" : ""}>${escapeHtml(p.name)}</option>`)
      .join("");

    openModal(`
      <h3>${day}. ${window.MONTH_NAMES_ET[state.month]} — vahetus</h3>
      <label for="m-person">Isik</label>
      <select id="m-person">
        <option value="__EMPTY__" ${slot.person === "" ? "selected" : ""}>— täitmata —</option>
        <option value="__NA__" ${slot.person === null ? "selected" : ""}>N/A</option>
        ${options}
      </select>
      <label>Aeg</label>
      <div class="time-row">
        <input type="time" id="m-start" value="${slot.start}" aria-label="Algus">
        <input type="time" id="m-end" value="${slot.end}" aria-label="Lõpp">
      </div>
      <label>Kiirvalik</label>
      <div class="avail-chips" id="m-presets">
        ${window.SLOT_PRESETS.map((p) =>
          `<button type="button" class="chip" data-s="${p.start}" data-e="${p.end}">${p.label}</button>`
        ).join("")}
      </div>
      <p class="modal-hint">Esc = sulge · Ctrl/⌘+Enter = salvesta</p>
      <div id="m-warn"></div>
      <div class="modal-actions">
        <button class="btn btn-danger" id="m-delete" type="button">Kustuta</button>
        <button class="btn" id="m-cancel" type="button">Tühista</button>
        <button class="btn btn-primary" id="m-save" type="button">Salvesta</button>
      </div>
    `, {
      onOpen(body) {
        const warnEl = body.querySelector("#m-warn");
        function updateWarn() {
          const personVal = body.querySelector("#m-person").value;
          const start = body.querySelector("#m-start").value;
          const end = body.querySelector("#m-end").value;
          const person = personVal === "__NA__" || personVal === "__EMPTY__" ? null : personVal;
          if (!person || personVal === "__EMPTY__") {
            // still check conflicts for assigned after save — preview conflict if selecting person
            warnEl.innerHTML = "";
            return;
          }
          const r = checkAvailability(person, start, end);
          // preview conflict with other slots
          const others = (sched.days[day] || []).filter((_, i) => i !== idx);
          const conflict = others.some((o) =>
            o.person === person &&
            intervalsOverlap(rangeIntervals(start, end), rangeIntervals(o.start, o.end))
          );
          let html = "";
          if (!r.ok) {
            html += `<div class="${strictAvailability ? "err-box" : "warn-box"}">${strictAvailability ? "Blokeeritud: " : "Hoiatus: "}${escapeHtml(r.message)}</div>`;
          }
          if (conflict) {
            html += `<div class="err-box">Konflikt: ${escapeHtml(person)} on samal päeval juba kattuvas vahetuses.</div>`;
          }
          if (!html && person) html = `<div class="ok-box">Sobib</div>`;
          warnEl.innerHTML = html;
        }
        body.querySelector("#m-person").addEventListener("change", updateWarn);
        body.querySelector("#m-start").addEventListener("change", updateWarn);
        body.querySelector("#m-end").addEventListener("change", updateWarn);
        body.querySelectorAll("#m-presets .chip").forEach((c) => {
          c.addEventListener("click", () => {
            body.querySelector("#m-start").value = c.dataset.s;
            body.querySelector("#m-end").value = c.dataset.e;
            updateWarn();
          });
        });
        updateWarn();

        body.querySelector("#m-cancel").onclick = closeModal;
        body.querySelector("#m-delete").onclick = () => {
          if (!confirm("Kustuta see vahetus?")) return;
          sched.days[day].splice(idx, 1);
          if (!sched.days[day].length) delete sched.days[day];
          saveState();
          closeModal();
          render();
          toast("Vahetus kustutatud");
        };
        body.querySelector("#m-save").onclick = () => {
          const personVal = body.querySelector("#m-person").value;
          const start = normalizeTime(body.querySelector("#m-start").value);
          const end = normalizeTime(body.querySelector("#m-end").value);
          let person;
          if (personVal === "__NA__") person = null;
          else if (personVal === "__EMPTY__") person = "";
          else person = personVal;

          if (isAssigned(person)) {
            const r = checkAvailability(person, start, end);
            if (!r.ok && strictAvailability) {
              toast("Blokeeritud: saadavusreegel");
              return;
            }
            const others = (sched.days[day] || []).filter((_, i) => i !== idx);
            const conflict = others.some((o) =>
              o.person === person &&
              intervalsOverlap(rangeIntervals(start, end), rangeIntervals(o.start, o.end))
            );
            if (conflict && !confirm("Topeltbroneering samal ajal. Salvesta ikkagi?")) return;
          }

          sched.days[day][idx] = { start, end, person };
          saveState();
          closeModal();
          render();
          toast("Salvestatud");
        };
      },
    });
  }

  function openPersonModal(name) {
    const p = personByName(name);
    if (!p) return;
    const presets = window.SLOT_PRESETS.map((x) => `${x.start}-${x.end}`);
    const chips = presets
      .map((pr) => `<button type="button" class="chip ${(p.availability || []).includes(pr) ? "on" : ""}" data-pr="${pr}">${pr}</button>`)
      .join("");

    openModal(`
      <h3>Isik: ${escapeHtml(p.name)}</h3>
      <label for="m-pname">Nimi</label>
      <input type="text" id="m-pname" value="${escapeHtml(p.name)}" maxlength="40">
      <label>Saadavus (lubatud ajavahemikud)</label>
      <p class="modal-hint">Tühi = kõik lubatud. Vahetus peab mahtuma ühte aknasse (üleöö toetatud).</p>
      <div class="avail-chips" id="m-avails">${chips}</div>
      <label>Kohandatud aken</label>
      <div class="time-row">
        <input type="time" id="m-cstart" value="09:00">
        <input type="time" id="m-cend" value="17:00">
      </div>
      <button type="button" class="btn btn-sm" id="m-add-custom" style="margin-top:0.35rem">Lisa kohandatud</button>
      <div class="modal-actions">
        <button class="btn" id="m-cancel" type="button">Tühista</button>
        <button class="btn btn-primary" id="m-save" type="button">Salvesta</button>
      </div>
    `, {
      onOpen(body) {
        const availSet = new Set(p.availability || []);
        function refreshChips() {
          body.querySelectorAll("#m-avails .chip").forEach((c) => {
            c.classList.toggle("on", availSet.has(c.dataset.pr));
          });
        }
        body.querySelectorAll("#m-avails .chip").forEach((c) => {
          c.addEventListener("click", () => {
            const pr = c.dataset.pr;
            if (availSet.has(pr)) availSet.delete(pr);
            else availSet.add(pr);
            c.classList.toggle("on", availSet.has(pr));
          });
        });
        body.querySelector("#m-add-custom").onclick = () => {
          const s = normalizeTime(body.querySelector("#m-cstart").value);
          const e = normalizeTime(body.querySelector("#m-cend").value);
          const pr = `${s}-${e}`;
          availSet.add(pr);
          if (![...body.querySelectorAll("#m-avails .chip")].some((c) => c.dataset.pr === pr)) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "chip on";
            b.dataset.pr = pr;
            b.textContent = pr;
            b.onclick = () => {
              if (availSet.has(pr)) { availSet.delete(pr); b.classList.remove("on"); }
              else { availSet.add(pr); b.classList.add("on"); }
            };
            body.querySelector("#m-avails").appendChild(b);
          }
          refreshChips();
        };
        body.querySelector("#m-cancel").onclick = closeModal;
        body.querySelector("#m-save").onclick = () => {
          const newName = body.querySelector("#m-pname").value.trim().toUpperCase();
          if (!newName) return;
          const old = p.name;
          if (old !== newName && personByName(newName)) {
            toast("Nimi on juba kasutusel");
            return;
          }
          p.name = newName;
          p.availability = [...availSet];
          if (old !== newName) {
            selectedPeople.delete(old);
            selectedPeople.add(newName);
            for (const sched of Object.values(state.schedules)) {
              for (const slots of Object.values(sched.days)) {
                slots.forEach((s) => { if (s.person === old) s.person = newName; });
              }
            }
          }
          saveState();
          saveFilter();
          closeModal();
          render();
          toast("Isik salvestatud");
        };
      },
    });
  }

  function openImportModal() {
    openModal(`
      <h3>Impordi graafik</h3>
      <label for="m-import">Kleebi tekst (nt pdftotext)</label>
      <div class="import-area"><textarea id="m-import" placeholder="1. Oktoober (08:00-14:00) GAREN / ..."></textarea></div>
      <label for="m-file">või laadi .txt</label>
      <input type="file" id="m-file" accept=".txt,text/plain">
      <p class="modal-hint">Import kirjutab valitud kuu üle; inimesed liidetakse nimekirja.</p>
      <div class="modal-actions">
        <button class="btn" id="m-seed" type="button">Seedi okt 2026</button>
        <button class="btn" id="m-cancel" type="button">Tühista</button>
        <button class="btn btn-primary" id="m-save" type="button">Impordi</button>
      </div>
    `, {
      onOpen(body) {
        body.querySelector("#m-file").addEventListener("change", (e) => {
          const f = e.target.files[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = () => { body.querySelector("#m-import").value = reader.result; };
          reader.readAsText(f);
        });
        body.querySelector("#m-cancel").onclick = closeModal;
        body.querySelector("#m-seed").onclick = () => {
          if (!confirm("Lähtesta Oktoober 2026 seedandmetele? (muud kuud säilivad, inimesed asendatakse seediga)")) return;
          const keep = { ...state.schedules };
          seedFromDefault();
          // preserve other months
          for (const [k, v] of Object.entries(keep)) {
            if (k !== monthKey(2026, 10)) state.schedules[k] = v;
          }
          saveState();
          closeModal();
          render();
          toast("Oktoober 2026 seeditud");
        };
        body.querySelector("#m-save").onclick = () => {
          const text = body.querySelector("#m-import").value;
          if (!text.trim()) { toast("Tekst puudub"); return; }
          const parsed = parseScheduleText(text);
          if (!Object.keys(parsed.days).length) { toast("Ühtegi päeva ei leitud"); return; }
          applyImport(parsed, true);
          closeModal();
        };
      },
    });
  }

  // ---------- export ----------
  function exportJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    downloadBlob(blob, `graafik-${monthKey(state.year, state.month)}.json`);
  }

  function exportCSV() {
    const sched = currentSched();
    const dim = daysInMonth(state.year, state.month);
    const rows = [["kuu", "paev", "algus", "lopp", "isik", "markus"]];
    for (let d = 1; d <= dim; d++) {
      const hol = (sched.holidays || []).find((h) => h.day === d);
      const slots = sched.days[d] || [];
      if (!slots.length) {
        rows.push([monthKey(state.year, state.month), d, "", "", "", hol ? hol.label : ""]);
        continue;
      }
      slots.forEach((s) => {
        rows.push([
          monthKey(state.year, state.month),
          d,
          s.start,
          s.end,
          s.person === null ? "N/A" : s.person || "",
          hol ? hol.label : "",
        ]);
      });
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadBlob(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), `graafik-${monthKey(state.year, state.month)}.csv`);
  }

  function exportPrintableHTML() {
    const sched = currentSched();
    const dim = daysInMonth(state.year, state.month);
    let rows = "";
    for (let d = 1; d <= dim; d++) {
      const slots = sched.days[d] || [];
      const hol = (sched.holidays || []).find((h) => h.day === d);
      const parts = slots.length
        ? slots.map((s) => `(${s.start}-${s.end}) ${s.person === null ? "N/A" : s.person || "—"}`).join(" / ")
        : "—";
      const wd = window.WEEKDAY_FULL_ET[weekdayMon0(state.year, state.month, d)];
      rows += `<tr>
        <td class="day">${d}.</td>
        <td class="wd">${wd}</td>
        <td class="slots">${escapeHtml(parts)}</td>
        <td class="note">${hol ? escapeHtml(hol.label) : ""}</td>
      </tr>`;
    }
    const title = `Graafik - ${window.MONTH_NAMES_ET[state.month]} ${state.year}`;
    const html = `<!DOCTYPE html>
<html lang="et"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 18pt; margin: 0 0 4mm; }
  .meta { color: #555; font-size: 10pt; margin-bottom: 6mm; }
  table { border-collapse: collapse; width: 100%; font-size: 9.5pt; }
  th, td { border: 1px solid #bbb; padding: 2.5mm 2mm; vertical-align: top; }
  th { background: #f3f4f6; text-align: left; font-size: 9pt; }
  td.day { width: 10mm; font-weight: 700; }
  td.wd { width: 28mm; color: #444; }
  td.note { width: 28mm; color: #92400e; }
  .notes { margin-top: 6mm; white-space: pre-wrap; color: #333; font-size: 10pt; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<div class="meta">Prinditud ${new Date().toLocaleString("et-EE")}</div>
<table>
  <thead><tr><th>Päev</th><th>Nädalapäev</th><th>Vahetused</th><th>Märkus</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="notes">${escapeHtml(sched.notes || "")}</div>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    } else {
      downloadBlob(new Blob([html], { type: "text/html" }), `graafik-${monthKey(state.year, state.month)}.html`);
      toast("Hüpikaken blokeeritud — HTML alla laaditud");
    }
  }

  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  // ---------- init ----------
  function init() {
    loadTheme();
    loadSettings();
    loadState();
    loadFilter();
    if (selectedPeople.size === 0) {
      selectedPeople = new Set(state.people.map((p) => p.name));
    }

    document.getElementById("btn-prev").onclick = () => changeMonth(-1);
    document.getElementById("btn-next").onclick = () => changeMonth(1);
    document.getElementById("btn-import").onclick = openImportModal;
    document.getElementById("btn-export-json").onclick = exportJSON;
    document.getElementById("btn-export-csv").onclick = exportCSV;
    document.getElementById("btn-export-print").onclick = exportPrintableHTML;
    document.getElementById("btn-theme").onclick = cycleTheme;
    document.getElementById("btn-clear-month").onclick = clearCurrentMonth;
    document.getElementById("btn-next-month").onclick = openNextMonthModal;
    document.getElementById("btn-new-month").onclick = () => {
      openModal(`
        <h3>Uus kuu</h3>
        <label>Kuu</label>
        <select id="m-nm">${[...Array(12)].map((_, i) =>
          `<option value="${i + 1}" ${i + 1 === state.month % 12 + 1 ? "selected" : ""}>${window.MONTH_NAMES_ET[i + 1]}</option>`
        ).join("")}</select>
        <label>Aasta</label>
        <input type="number" id="m-ny" value="${state.month === 12 ? state.year + 1 : state.year}" min="2020" max="2040">
        <label class="setting-row"><input type="checkbox" id="m-copy-people" checked> Säilita inimeste nimekiri</label>
        <p class="modal-hint">Loob tühja graafiku. Olemasolev kuu jääb alles.</p>
        <div class="modal-actions">
          <button class="btn" id="m-cancel" type="button">Tühista</button>
          <button class="btn btn-primary" id="m-save" type="button">Loo</button>
        </div>
      `, {
        onOpen(body) {
          body.querySelector("#m-cancel").onclick = closeModal;
          body.querySelector("#m-save").onclick = () => {
            const m = Number(body.querySelector("#m-nm").value);
            const y = Number(body.querySelector("#m-ny").value);
            const key = monthKey(y, m);
            if (state.schedules[key] && Object.keys(state.schedules[key].days).length) {
              if (!confirm("Sellel kuul on juba andmeid. Ava olemasolev?")) return;
              goToMonth(y, m);
              closeModal();
              return;
            }
            state.schedules[key] = { days: {}, notes: "", holidays: [] };
            goToMonth(y, m);
            closeModal();
            toast("Uus kuu loodud");
          };
        },
      });
    };

    document.getElementById("btn-reset").onclick = () => {
      if (!confirm("Lähtesta kogu andmestik Oktoober 2026 seedile? Kõik kuud kustutatakse.")) return;
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY_V1);
      } catch (_) {}
      seedFromDefault();
      render();
      toast("Lähtestatud");
    };

    document.getElementById("btn-select-all").onclick = () => {
      selectedPeople = new Set(state.people.map((p) => p.name));
      saveFilter();
      render();
    };
    document.getElementById("btn-select-none").onclick = () => {
      selectedPeople = new Set();
      saveFilter();
      render();
    };

    document.getElementById("strict-toggle").onchange = (e) => {
      strictAvailability = e.target.checked;
      saveSettings();
      renderCalendar();
    };

    document.getElementById("notes-input").addEventListener("change", (e) => {
      currentSched().notes = e.target.value;
      saveState();
    });

    document.getElementById("pick-month").onchange = (e) => {
      goToMonth(state.year, Number(e.target.value));
    };
    document.getElementById("pick-year").onchange = (e) => {
      goToMonth(Number(e.target.value), state.month);
    };

    document.getElementById("btn-add-person").onclick = addPersonFromInput;
    document.getElementById("new-person").addEventListener("keydown", (e) => {
      if (e.key === "Enter") addPersonFromInput();
    });

    document.getElementById("modal-backdrop").addEventListener("click", (e) => {
      if (e.target.id === "modal-backdrop") closeModal();
    });

    // Prefer-color-scheme changes when on system
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => { if (themePref === "system") applyTheme(); };
    if (mq.addEventListener) mq.addEventListener("change", onScheme);
    else if (mq.addListener) mq.addListener(onScheme);

    render();
  }

  function addPersonFromInput() {
    const input = document.getElementById("new-person");
    const name = input.value.trim().toUpperCase();
    if (!name) return;
    if (personByName(name)) { toast("Juba olemas"); return; }
    state.people.push({
      id: name.toLowerCase().replace(/[^a-z0-9äöüõ]+/gi, "-"),
      name,
      availability: [],
      color: COLORS[state.people.length % COLORS.length],
    });
    selectedPeople.add(name);
    input.value = "";
    saveState();
    saveFilter();
    render();
    toast(`${name} lisatud`);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
