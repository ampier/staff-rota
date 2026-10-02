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
    if (!team().schedules[key]) {
      team().schedules[key] = { days: {}, notes: "", holidays: [] };
    }
    return team().schedules[key];
  }

  function saveCurrentMonthFromLegacy(days, notes, holidays) {
    team().schedules[monthKey(state.year, state.month)] = {
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

  function team() {
    return state.teams[state.activeTeamId];
  }

  function ensureTeams(s) {
    if (s.teams && Object.keys(s.teams).length) {
      if (!s.activeTeamId || !s.teams[s.activeTeamId]) s.activeTeamId = Object.keys(s.teams)[0];
      s.version = 3;
      delete s.people;
      delete s.schedules;
      return s;
    }
    const people = s.people || [];
    const schedules = s.schedules || {};
    s.version = 3;
    s.activeTeamId = "vastuvott";
    s.teams = {
      vastuvott: { id: "vastuvott", name: "Vastuvõtt", people, schedules },
    };
    delete s.people;
    delete s.schedules;
    return s;
  }

  function loadState() {
    try {
      const raw2 = localStorage.getItem(STORAGE_KEY);
      if (raw2) {
        state = ensureTeams(JSON.parse(raw2));
        if (!team() || !team().schedules || !team().people) {
          seedFromDefault();
          return;
        }
        saveState();
        return;
      }
      const raw1 = localStorage.getItem(STORAGE_KEY_V1);
      if (raw1) {
        state = ensureTeams(migrateV1(raw1));
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
    const names = new Set(team().people.map((p) => p.name));
    try {
      const raw = localStorage.getItem(FILTER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const saved = parsed && parsed[state.activeTeamId];
        if (Array.isArray(saved)) {
          selectedPeople = new Set(saved.filter((n) => names.has(n)));
          return;
        }
      }
    } catch (_) {}
    selectedPeople = names;
  }

  function saveFilter() {
    try {
      let all = {};
      const raw = localStorage.getItem(FILTER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && !Array.isArray(parsed)) all = parsed;
      }
      all[state.activeTeamId] = [...selectedPeople];
      localStorage.setItem(FILTER_KEY, JSON.stringify(all));
    } catch (_) {}
  }

  function seedFromDefault() {
    const s = window.ROTA_SEED;
    const key = monthKey(s.year, s.month);
    const people = s.people.map((p, i) => ({
      id: p.id,
      name: p.name,
      availability: [...p.availability],
      color: COLORS[i % COLORS.length],
    }));
    const schedules = {
      [key]: {
        days: normalizeDays(JSON.parse(JSON.stringify(s.days))),
        notes: s.notes,
        holidays: [...s.holidays],
      },
    };
    state = {
      version: 3,
      year: s.year,
      month: s.month,
      activeTeamId: "vastuvott",
      teams: {
        vastuvott: { id: "vastuvott", name: "Vastuvõtt", people, schedules },
      },
    };
    selectedPeople = new Set(team().people.map((p) => p.name));
    saveState();
    saveFilter();
  }

  function selectAllCurrentTeam() {
    selectedPeople = new Set(team().people.map((p) => p.name));
    saveFilter();
  }

  function switchTeam(id) {
    if (!state.teams[id] || id === state.activeTeamId) return;
    state.activeTeamId = id;
    saveState();
    loadFilter();
    render();
    toast(team().name);
  }

  function addTeam(name) {
    const clean = name.trim();
    if (!clean) return;
    let id = clean.toLowerCase().replace(/[^a-z0-9äöüõ]+/gi, "-").replace(/^-|-$/g, "") || "meeskond";
    let n = 2;
    while (state.teams[id]) {
      id = `${id.replace(/-\d+$/, "")}-${n}`;
      n++;
    }
    state.teams[id] = { id, name: clean, people: [], schedules: {} };
    state.activeTeamId = id;
    saveState();
    selectAllCurrentTeam();
    render();
    toast(`Meeskond ${clean} loodud`);
  }

  function renameActiveTeam(name) {
    const clean = name.trim();
    if (!clean) return;
    team().name = clean;
    saveState();
    render();
    toast("Meeskonna nimi salvestatud");
  }

  function deleteActiveTeam() {
    const ids = Object.keys(state.teams);
    if (ids.length <= 1) {
      toast("Viimast meeskonda ei saa kustutada");
      return;
    }
    const current = team();
    if (!confirm(`Kustuta meeskond ${current.name}? Selle graafikud kaovad.`)) return;
    delete state.teams[current.id];
    state.activeTeamId = Object.keys(state.teams).sort()[0];
    saveState();
    loadFilter();
    render();
    toast("Meeskond kustutatud");
  }

  // ---------- time helpers ----------
  function daysInMonth(y, m) {
    return new Date(y, m, 0).getDate();
  }

  function weekdayMon0(y, m, d) {
    return (new Date(y, m - 1, d).getDay() + 6) % 7;
  }

  /** True only for today's civil date in the browser's local timezone. */
  function isLocalToday(y, m, d) {
    const now = new Date();
    return now.getFullYear() === y && now.getMonth() + 1 === m && now.getDate() === d;
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

  /** Previous-day slot spills past midnight into the next day's slot. */
  function slotOverlapsNextDay(prevSlot, nextSlot) {
    const s = toMinutes(prevSlot.start);
    const e = toMinutes(prevSlot.end);
    if (Number.isNaN(s) || Number.isNaN(e) || e > s) return false;
    const tail = e === s ? [[0, 1440]] : [[0, e]];
    const ns = toMinutes(nextSlot.start);
    const ne = toMinutes(nextSlot.end);
    if (Number.isNaN(ns) || Number.isNaN(ne)) return false;
    // Overnight nextSlot's morning half is the following day; compare only this calendar day.
    const onNextDay = ne <= ns ? [[ns, 1440]] : [[ns, ne]];
    return intervalsOverlap(tail, onNextDay);
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
    return team().people.find((p) => p.name === name);
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

  /** Same-person overlapping slots on a day, including overnight spill from/to neighbours. */
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
    if (day > 1) {
      const prev = sched.days[day - 1] || [];
      for (let j = 0; j < slots.length; j++) {
        const b = slots[j];
        if (!isAssigned(b.person)) continue;
        if (prev.some((a) => a.person === b.person && slotOverlapsNextDay(a, b))) conflicts.add(j);
      }
    }
    const dim = daysInMonth(state.year, state.month);
    if (day < dim) {
      const next = sched.days[day + 1] || [];
      for (let i = 0; i < slots.length; i++) {
        const a = slots[i];
        if (!isAssigned(a.person)) continue;
        if (next.some((b) => b.person === a.person && slotOverlapsNextDay(a, b))) conflicts.add(i);
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
    team().schedules[key] = {
      days: normalizeDays(parsed.days),
      notes: parsed.notes || currentSched().notes,
      holidays: parsed.holidays.length ? parsed.holidays : [],
    };
    if (mergePeople) {
      for (const name of parsed.foundPeople) {
        if (!personByName(name)) {
          team().people.push({
            id: name.toLowerCase().replace(/[^a-z0-9äöüõ]+/gi, "-"),
            name,
            availability: [],
            color: COLORS[team().people.length % COLORS.length],
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

  // ---------- next month ----------
  /** @type {Map<string, Set<number>>} */
  let vacationMap = new Map();

  function shiftMonth(year, month, delta) {
    const d = new Date(year, month - 1 + delta, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }

  function slotMinutes(start, end) {
    const s = toMinutes(start);
    let e = toMinutes(end);
    if (Number.isNaN(s) || Number.isNaN(e)) return 0;
    if (e <= s) e += 1440;
    return e - s;
  }

  function extractVacationBody(notes) {
    if (!notes) return "";
    const m = String(notes).match(/Puhkused\s*:?\s*([\s\S]*?)(?=\n\s*Lipup|$)/i);
    if (!m) return "";
    const body = m[1].replace(/[●○]/g, "").trim();
    if (!body || /^\(?tüh[iy]\)?$/i.test(body)) return "";
    return body;
  }

  function addVacationSpan(days, match, year, month, dim) {
    const d1 = Number(match[1]);
    const mo1 = match[2] ? Number(match[2]) : month;
    const y1 = match[3] ? Number(match[3]) : year;
    const d2 = Number(match[4]);
    const mo2 = match[5] ? Number(match[5]) : mo1;
    const y2 = match[6] ? Number(match[6]) : y1;
    const cur = new Date(y1, mo1 - 1, d1);
    const end = new Date(y2, mo2 - 1, d2);
    if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime()) || end < cur) return;
    for (let i = 0; i < 400 && cur <= end; i++) {
      if (cur.getFullYear() === year && cur.getMonth() + 1 === month) {
        const day = cur.getDate();
        if (day >= 1 && day <= dim) days.add(day);
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  function expandDateSpecs(chunk, year, month, dim) {
    const days = new Set();
    const consumed = [];
    const rangeRe = /(\d{1,2})(?:\.(\d{1,2})(?:\.(\d{4}))?)?\.?\s*[-–—]\s*(\d{1,2})(?:\.(\d{1,2})(?:\.(\d{4}))?)?\.?/g;
    let m;
    while ((m = rangeRe.exec(chunk))) {
      consumed.push([m.index, m.index + m[0].length]);
      addVacationSpan(days, m, year, month, dim);
    }
    const singleRe = /(\d{1,2})(?:\.(\d{1,2})(?:\.(\d{4}))?)?\.?/g;
    while ((m = singleRe.exec(chunk))) {
      if (consumed.some(([c, d]) => m.index >= c && m.index < d)) continue;
      const day = Number(m[1]);
      const mo = m[2] ? Number(m[2]) : month;
      const y = m[3] ? Number(m[3]) : year;
      if (y === year && mo === month && day >= 1 && day <= dim) days.add(day);
    }
    return days;
  }

  function parseVacations(text, year, month, peopleNames) {
    const result = new Map();
    if (!text || !peopleNames.length) return result;
    const dim = daysInMonth(year, month);
    const names = [...peopleNames].sort((a, b) => b.length - a.length);
    const nameRe = new RegExp(names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
    const hits = [];
    let m;
    while ((m = nameRe.exec(text))) {
      const canonical = names.find((n) => n.toLowerCase() === m[0].toLowerCase());
      if (canonical) hits.push({ name: canonical, end: m.index + m[0].length });
    }
    for (let i = 0; i < hits.length; i++) {
      const chunk = text.slice(hits[i].end, i + 1 < hits.length ? hits[i + 1].end - hits[i + 1].name.length : text.length);
      const days = expandDateSpecs(chunk, year, month, dim);
      if (!days.size) continue;
      if (!result.has(hits[i].name)) result.set(hits[i].name, new Set());
      days.forEach((d) => result.get(hits[i].name).add(d));
    }
    return result;
  }

  function formatVacationPreview(map) {
    if (!map.size) return "Puhkusi ei tuvastatud — kõik inimesed on saadaval.";
    const parts = [];
    for (const [name, set] of map) {
      const days = [...set].sort((a, b) => a - b);
      const ranges = [];
      let start = days[0];
      let prev = days[0];
      for (let i = 1; i <= days.length; i++) {
        if (i < days.length && days[i] === prev + 1) {
          prev = days[i];
          continue;
        }
        ranges.push(start === prev ? String(start) : `${start}–${prev}`);
        if (i < days.length) start = prev = days[i];
      }
      parts.push(`${name}: ${ranges.join(", ")}`);
    }
    return "Puhkusel: " + parts.join(" · ");
  }

  function refreshVacationMap() {
    vacationMap = parseVacations(
      currentSched().notes || "",
      state.year,
      state.month,
      team().people.map((p) => p.name)
    );
  }

  function personOnVacation(name, day) {
    return !!(isAssigned(name) && vacationMap.get(name) && vacationMap.get(name).has(Number(day)));
  }

  function weekdaySlotLists(year, month) {
    const lists = [[], [], [], [], [], [], []];
    const sched = team().schedules[monthKey(year, month)];
    if (!sched) return lists;
    const dim = daysInMonth(year, month);
    for (let d = 1; d <= dim; d++) {
      const slots = sched.days[d];
      if (!slots || !slots.length) continue;
      lists[weekdayMon0(year, month, d)].push(cloneSlots(slots));
    }
    return lists;
  }

  function modalSlotStructure(list) {
    const grouped = new Map();
    list.forEach((slots, index) => {
      const sig = slots.map((s) => `${s.start}-${s.end}`).join("|");
      grouped.set(sig, { count: (grouped.get(sig)?.count || 0) + 1, index, slots });
    });
    let best = null;
    for (const entry of grouped.values()) {
      if (!best || entry.count > best.count || (entry.count === best.count && entry.index > best.index)) best = entry;
    }
    if (!best) return null;
    return best.slots.map((s) => ({ start: s.start, end: s.end, person: "" }));
  }

  function weekdayStructures(lists) {
    const fallback = () => (window.DEFAULT_SLOTS || []).map((s) => ({ start: s.start, end: s.end, person: "" }));
    return lists.map((list) => modalSlotStructure(list) || fallback());
  }

  function affinityFor(name, wd, start, end, lists) {
    let n = 0;
    for (const slots of lists[wd] || []) {
      if (slots.some((s) => s.person === name && s.start === start && s.end === end)) n++;
    }
    return n;
  }

  function buildFairDays(lists, structures, year, month, vacations) {
    const dim = daysInMonth(year, month);
    const days = {};
    const loadMin = {};
    const loadN = {};
    team().people.forEach((p) => {
      loadMin[p.name] = 0;
      loadN[p.name] = 0;
    });

    function onVac(name, day) {
      return !!(vacations.get(name) && vacations.get(name).has(day));
    }

    for (let d = 1; d <= dim; d++) {
      const wd = weekdayMon0(year, month, d);
      const skeleton = cloneSlots(structures[wd]);
      const filled = [];
      const prevSlots = d > 1 ? days[d - 1] : null;
      for (const slot of skeleton) {
        const tiers = { best: [], second: [], conflict: [], violation: [] };
        for (const p of team().people) {
          if (onVac(p.name, d)) continue;
          const availOk = checkAvailability(p.name, slot.start, slot.end).ok;
          const overlap =
            filled.some((s) => s.person === p.name && intervalsOverlap(rangeIntervals(slot.start, slot.end), rangeIntervals(s.start, s.end))) ||
            (prevSlots || []).some((s) => s.person === p.name && slotOverlapsNextDay(s, slot));
          const workedToday = filled.some((s) => s.person === p.name);
          let tier = null;
          if (availOk && !overlap && !workedToday) tier = "best";
          else if (availOk && !overlap) tier = "second";
          else if (availOk) tier = "conflict";
          else if (!overlap) tier = "violation";
          if (tier) tiers[tier].push(p);
        }
        const pool = tiers.best.length ? tiers.best : tiers.second.length ? tiers.second : tiers.conflict.length ? tiers.conflict : tiers.violation;
        let person = "";
        if (pool.length) {
          pool.sort((a, b) => {
            if (loadMin[a.name] !== loadMin[b.name]) return loadMin[a.name] - loadMin[b.name];
            if (loadN[a.name] !== loadN[b.name]) return loadN[a.name] - loadN[b.name];
            const aff = affinityFor(a.name, wd, slot.start, slot.end, lists) - affinityFor(b.name, wd, slot.start, slot.end, lists);
            if (aff) return aff;
            return a.name.localeCompare(b.name, "et");
          });
          person = pool[0].name;
          loadMin[person] += slotMinutes(slot.start, slot.end);
          loadN[person] += 1;
        }
        filled.push({ start: slot.start, end: slot.end, person });
      }
      days[d] = filled;
    }
    return days;
  }

  function buildNextMonthDays(mode, srcYear, srcMonth, dstYear, dstMonth, vacationText) {
    const lists = weekdaySlotLists(srcYear, srcMonth);
    const structures = weekdayStructures(lists);
    const dim = daysInMonth(dstYear, dstMonth);
    if (mode === "pattern") {
      const days = {};
      const seen = [0, 0, 0, 0, 0, 0, 0];
      for (let d = 1; d <= dim; d++) {
        const wd = weekdayMon0(dstYear, dstMonth, d);
        const list = lists[wd];
        if (!list.length) continue;
        days[d] = cloneSlots(list[seen[wd] % list.length]);
        seen[wd]++;
      }
      return days;
    }
    if (mode === "fair") {
      const vacations = parseVacations(vacationText, dstYear, dstMonth, team().people.map((p) => p.name));
      return buildFairDays(lists, structures, dstYear, dstMonth, vacations);
    }
    const days = {};
    for (let d = 1; d <= dim; d++) {
      const wd = weekdayMon0(dstYear, dstMonth, d);
      days[d] = cloneSlots(structures[wd]);
    }
    return days;
  }

  function monthIssueCounts() {
    const sched = currentSched();
    const dim = daysInMonth(state.year, state.month);
    let conflictDays = 0;
    let violations = 0;
    let emptySlots = 0;
    let vacationClashes = 0;
    for (let d = 1; d <= dim; d++) {
      const slots = sched.days[d] || [];
      let dayBad = dayConflicts(d).size > 0;
      slots.forEach((s) => {
        if (s.person === null) return;
        if (!s.person) emptySlots++;
        else if (!checkAvailability(s.person, s.start, s.end).ok) violations++;
        if (personOnVacation(s.person, d)) {
          vacationClashes++;
          dayBad = true;
        }
      });
      if (dayBad) conflictDays++;
    }
    return { conflictDays, violations, emptySlots, vacationClashes };
  }

  function openNextMonthDialog() {
    const srcYear = state.year;
    const srcMonth = state.month;
    const next = shiftMonth(srcYear, srcMonth, 1);
    const nextLabel = `${window.MONTH_NAMES_ET[next.month]} ${next.year}`;
    const srcLabel = `${window.MONTH_NAMES_ET[srcMonth]} ${srcYear}`;
    const prefill = extractVacationBody(currentSched().notes);

    openModal(`
      <h3>Loo järgmine kuu</h3>
      <p class="modal-hint" style="margin-top:0">${escapeHtml(nextLabel)} luuakse kuu ${escapeHtml(srcLabel)} põhjal.</p>
      <div class="choice-list" role="radiogroup" aria-label="Kuidas järgmine kuu täita">
        <label class="choice">
          <input type="radio" name="next-mode" value="empty" checked>
          <span class="choice-copy">Tühi mall
            <small>Samad vahetuspesad nädalapäevade kaupa, nimed tühjad.</small>
          </span>
        </label>
        <label class="choice">
          <input type="radio" name="next-mode" value="pattern">
          <span class="choice-copy">Nädalapäevade muster
            <small>Kopeeri eelmise kuu jaotused samale nädalapäevale.</small>
          </span>
        </label>
        <label class="choice">
          <input type="radio" name="next-mode" value="fair">
          <span class="choice-copy">Õiglane rotatsioon
            <small>Jaotab tunnid ühtlaselt. Jätab vahele saadavusreeglite rikkumised ja puhkused. Konfliktid jäävad esile.</small>
          </span>
        </label>
      </div>
      <label for="m-vac">Puhkused uuel kuul</label>
      <textarea id="m-vac" placeholder="RENE 1-7&#10;IRINA 10.11-14.11">${escapeHtml(prefill)}</textarea>
      <p class="modal-hint">Üks inimene korraga, kuupäevad uuel kuul (nt 1-7 või 10.11-14.11). Mõjutab õiglast rotatsiooni ja salvestatakse märkmetesse.</p>
      <div class="vac-preview" id="m-vac-preview"></div>
      <div class="modal-actions">
        <button class="btn" id="m-cancel" type="button">Tühista</button>
        <button class="btn btn-primary" id="m-save" type="button">Loo kuu</button>
      </div>
    `, {
      wide: true,
      onOpen(body) {
        const preview = body.querySelector("#m-vac-preview");
        const vacInput = body.querySelector("#m-vac");
        const updatePreview = () => {
          const map = parseVacations(vacInput.value, next.year, next.month, team().people.map((p) => p.name));
          preview.textContent = formatVacationPreview(map);
        };
        vacInput.addEventListener("input", updatePreview);
        updatePreview();
        body.querySelector("#m-cancel").onclick = closeModal;
        body.querySelector("#m-save").onclick = () => {
          const mode = (body.querySelector('input[name="next-mode"]:checked') || {}).value || "empty";
          const vacationText = vacInput.value.trim();
          const key = monthKey(next.year, next.month);
          const existing = team().schedules[key];
          if (existing && Object.keys(existing.days || {}).length) {
            if (!confirm(`${nextLabel} on juba täidetud. Asenda uue graafikuga?`)) return;
          }
          const days = buildNextMonthDays(mode, srcYear, srcMonth, next.year, next.month, vacationText);
          team().schedules[key] = {
            days,
            notes: `Puhkused: ${vacationText || "(tühi)"}`,
            holidays: [],
          };
          goToMonth(next.year, next.month);
          closeModal();
          const issues = monthIssueCounts();
          const modeLabel = mode === "fair" ? "õiglane rotatsioon" : mode === "pattern" ? "nädalapäevade muster" : "tühi mall";
          toast(`${nextLabel} loodud (${modeLabel}). Konflikte: ${issues.conflictDays} p. Saadavus: ${issues.violations}. Täitmata: ${issues.emptySlots}.`);
        };
      },
    });
  }

  // ---------- month navigation (no data loss) ----------
  function goToMonth(year, month, { createEmpty } = {}) {
    // current month already in schedules
    currentSched();
    state.year = year;
    state.month = month;
    const key = monthKey(year, month);
    if (!team().schedules[key]) {
      if (createEmpty !== false) {
        team().schedules[key] = { days: {}, notes: "", holidays: [] };
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
    if (!team().schedules[key]) return;
    if (!confirm(`Kustuta kuu ${key} andmed jäädavalt?`)) return;
    delete team().schedules[key];
    if (key === cur) {
      const keys = Object.keys(team().schedules).sort();
      if (keys.length) {
        const p = parseMonthKey(keys[keys.length - 1]);
        state.year = p.year;
        state.month = p.month;
      } else {
        team().schedules[cur] = { days: {}, notes: "", holidays: [] };
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
  function renderTeams() {
    const sel = document.getElementById("team-select");
    if (!sel) return;
    const ids = Object.keys(state.teams).sort((a, b) =>
      state.teams[a].name.localeCompare(state.teams[b].name, "et")
    );
    sel.innerHTML = ids.map((id) =>
      `<option value="${escapeHtml(id)}"${id === state.activeTeamId ? " selected" : ""}>${escapeHtml(state.teams[id].name)}</option>`
    ).join("");
    const del = document.getElementById("btn-delete-team");
    if (del) del.disabled = ids.length <= 1;
  }

  function openTeamNameModal(mode) {
    const editing = mode === "rename";
    openModal(`
      <h3>${editing ? "Nimeta meeskond ümber" : "Uus meeskond"}</h3>
      <label for="m-team">Nimi</label>
      <input type="text" id="m-team" maxlength="40" value="${editing ? escapeHtml(team().name) : ""}" placeholder="Koristus, köök…">
      <p class="modal-hint">Igal meeskonnal on oma inimesed ja kuugraafik. Vastuvõtt on hosteli vastuvõtt.</p>
      <div class="modal-actions">
        <button class="btn" id="m-cancel" type="button">Tühista</button>
        <button class="btn btn-primary" id="m-save" type="button">${editing ? "Salvesta" : "Lisa"}</button>
      </div>
    `, {
      onOpen(body) {
        body.querySelector("#m-cancel").onclick = closeModal;
        body.querySelector("#m-save").onclick = () => {
          const name = body.querySelector("#m-team").value;
          if (!name.trim()) return;
          if (editing) renameActiveTeam(name);
          else addTeam(name);
          closeModal();
        };
      },
    });
  }

  function render() {
    refreshVacationMap();
    renderTeams();
    document.title = `Rohe Hostel Graafik — ${team().name}`;
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
    selM.value = String(state.month);
    selY.value = String(state.year);
  }

  function renderStats() {
    const el = document.getElementById("stats-bar");
    if (!el) return;
    const sched = currentSched();
    const dim = daysInMonth(state.year, state.month);
    let filled = 0, emptySlots = 0, naSlots = 0, conflictCount = 0, violationCount = 0;
    for (let d = 1; d <= dim; d++) {
      const slots = sched.days[d] || [];
      if (slots.length) filled++;
      let dayBad = dayConflicts(d).size > 0;
      slots.forEach((s) => {
        if (s.person === null) naSlots++;
        else if (!s.person) emptySlots++;
        else if (!checkAvailability(s.person, s.start, s.end).ok) violationCount++;
        if (personOnVacation(s.person, d)) dayBad = true;
      });
      if (dayBad) conflictCount++;
    }
    el.innerHTML = `
      <span class="stat">Päevi täidetud: <strong>${filled}/${dim}</strong></span>
      <span class="stat">Täitmata: <strong>${emptySlots}</strong></span>
      <span class="stat">N/A: <strong>${naSlots}</strong></span>
      <span class="stat">Konfliktipäevi: <strong>${conflictCount}</strong></span>
      <span class="stat">Saadavus: <strong>${violationCount}</strong></span>
    `;
  }

  function renderMonthsList() {
    const el = document.getElementById("months-list");
    if (!el) return;
    const keys = Object.keys(team().schedules).sort();
    const cur = monthKey(state.year, state.month);
    el.innerHTML = keys.map((k) => {
      const p = parseMonthKey(k);
      const label = `${window.MONTH_NAMES_ET[p.month]} ${p.year}`;
      const days = Object.keys(team().schedules[k].days || {}).length;
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
    if (!team().people.length) {
      list.innerHTML = `<div class="empty-day-hint">Inimesi pole. Lisa esimene töötaja allpool.</div>`;
      return;
    }
    team().people.forEach((p) => {
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
          <button class="btn btn-sm btn-ics" type="button" data-ics="${escapeHtml(p.name)}" title="Laadi ${escapeHtml(p.name)} kuu .ics">Minu graafik</button>
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
        team().people = team().people.filter((p) => p.name !== name);
        selectedPeople.delete(name);
        for (const sched of Object.values(team().schedules)) {
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
    list.querySelectorAll("[data-ics]").forEach((btn) => {
      btn.addEventListener("click", () => exportPersonIcs(btn.dataset.ics));
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

    const filterActive = selectedPeople.size > 0 && selectedPeople.size < team().people.length;

    for (let d = 1; d <= dim; d++) {
      const cell = document.createElement("div");
      const wd = weekdayMon0(state.year, state.month, d);
      const slots = sched.days[d] || [];
      const conf = dayConflicts(d);
      cell.className = "day-cell" + (wd >= 5 ? " weekend" : "");
      const hol = (sched.holidays || []).find((h) => h.day === d);
      const away = [];
      vacationMap.forEach((set, name) => { if (set.has(d)) away.push(name); });
      const viewingToday = isLocalToday(state.year, state.month, d);
      if (hol) cell.classList.add("holiday");
      if (conf.size || slots.some((s) => personOnVacation(s.person, d))) cell.classList.add("has-conflict");
      if (!slots.length) cell.classList.add("is-empty-day");
      if (viewingToday) {
        cell.classList.add("is-today");
        cell.setAttribute("aria-current", "date");
      }

      const num = document.createElement("div");
      num.className = "day-num";
      const flags = [];
      if (hol) flags.push(`<span class="day-flag" title="${escapeHtml(hol.label)}">${escapeHtml(hol.label)}</span>`);
      if (away.length) flags.push(`<span class="day-flag" title="Puhkus: ${escapeHtml(away.join(", "))}">Puhkus</span>`);
      const todayMark = viewingToday ? `<span class="today-badge">Täna</span>` : "";
      num.innerHTML = `<span><span class="day-wd">${window.WEEKDAY_FULL_ET[wd]}</span>${d}${todayMark}</span>${flags.join("")}`;
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
        const onVac = personOnVacation(slot.person, d);
        if (!avail.ok) btn.classList.add("violation");
        if (conf.has(idx) || onVac) btn.classList.add("conflict");

        const nameClass = isNA ? "na" : isEmpty ? "empty" : "";
        btn.innerHTML = `<span class="slot-time">${slot.start}–${slot.end}</span><span class="slot-name ${nameClass}">${escapeHtml(displayPerson(slot.person))}</span>`;
        let title = `${slotLabel(slot.start, slot.end)} ${slot.start}–${slot.end}`;
        if (!avail.ok) title += " ⚠ " + avail.message;
        if (conf.has(idx)) title += " ⚠ Topeltbroneering";
        if (onVac) title += " ⚠ Puhkusel";
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
  function openModal(html, { onOpen, wide } = {}) {
    const backdrop = document.getElementById("modal-backdrop");
    const body = document.getElementById("modal-body");
    body.parentElement.classList.toggle("modal-wide", !!wide);
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
    const options = team().people
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
            for (const sched of Object.values(team().schedules)) {
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
          if (!confirm("Lähtesta Vastuvõtu Oktoober 2026 seedile? Teised meeskonnad ja teised kuud jäävad alles. Vastuvõtu inimesed asendatakse.")) return;
          const others = {};
          for (const [id, t] of Object.entries(state.teams)) {
            if (id !== "vastuvott") others[id] = t;
          }
          const keepMonths = state.teams.vastuvott ? { ...state.teams.vastuvott.schedules } : {};
          seedFromDefault();
          Object.assign(state.teams, others);
          for (const [k, v] of Object.entries(keepMonths)) {
            if (k !== monthKey(2026, 10)) state.teams.vastuvott.schedules[k] = v;
          }
          state.activeTeamId = "vastuvott";
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

  // ---------- iCalendar (.ics), no accounts ----------
  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function icsEscape(s) {
    return String(s)
      .replace(/\\/g, "\\\\")
      .replace(/\r\n|\n|\r/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function icsUnescape(s) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "\\" && i + 1 < s.length) {
        const n = s[i + 1];
        if (n === "n" || n === "N") out += "\n";
        else if (n === "\\") out += "\\";
        else if (n === "," || n === ";") out += n;
        else out += n;
        i++;
      } else out += s[i];
    }
    return out;
  }

  function foldIcs(text) {
    const encoder = new TextEncoder();
    const out = [];
    for (const line of text.split("\r\n")) {
      if (encoder.encode(line).length <= 75) {
        out.push(line);
        continue;
      }
      let rest = line;
      let first = true;
      while (rest.length) {
        let take = Math.min(rest.length, first ? 75 : 74);
        while (take > 1 && encoder.encode((first ? "" : " ") + rest.slice(0, take)).length > 75) take--;
        out.push(first ? rest.slice(0, take) : " " + rest.slice(0, take));
        rest = rest.slice(take);
        first = false;
      }
    }
    return out.join("\r\n");
  }

  function unfoldIcs(text) {
    const lines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const out = [];
    for (const line of lines) {
      if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) out[out.length - 1] += line.slice(1);
      else out.push(line);
    }
    return out;
  }

  function icsNowStamp() {
    const d = new Date();
    return d.getUTCFullYear()
      + pad2(d.getUTCMonth() + 1)
      + pad2(d.getUTCDate())
      + "T"
      + pad2(d.getUTCHours())
      + pad2(d.getUTCMinutes())
      + pad2(d.getUTCSeconds())
      + "Z";
  }

  function icsLocalStamp(y, m, d, hh, mm) {
    return `${y}${pad2(m)}${pad2(d)}T${pad2(hh)}${pad2(mm)}00`;
  }

  function collectMonthShifts(names) {
    const sched = currentSched();
    const dim = daysInMonth(state.year, state.month);
    const allow = names ? new Set([...names].map((n) => String(n).toUpperCase())) : null;
    const events = [];
    for (let d = 1; d <= dim; d++) {
      for (const slot of sched.days[d] || []) {
        if (!isAssigned(slot.person)) continue;
        if (allow && !allow.has(slot.person.toUpperCase())) continue;
        events.push({
          year: state.year,
          month: state.month,
          day: d,
          start: slot.start,
          end: slot.end,
          person: slot.person,
        });
      }
    }
    return events;
  }

  function buildIcs(events, calName) {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Rohe Hostel//Rohe Graafik//ET",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${icsEscape(calName)}`,
      "X-WR-TIMEZONE:Europe/Tallinn",
    ];
    const stamp = icsNowStamp();
    for (const ev of events) {
      const [sh, sm] = ev.start.split(":").map(Number);
      const [eh, em] = ev.end.split(":").map(Number);
      let ey = ev.year;
      let emon = ev.month;
      let ed = ev.day;
      if (eh * 60 + em <= sh * 60 + sm) {
        const next = new Date(ev.year, ev.month - 1, ev.day + 1);
        ey = next.getFullYear();
        emon = next.getMonth() + 1;
        ed = next.getDate();
      }
      const uid = `staff-rota-${monthKey(ev.year, ev.month)}-${ev.day}-${ev.start}-${ev.end}-${ev.person}@staff-rota`;
      const label = slotLabel(ev.start, ev.end);
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${icsEscape(uid)}`);
      lines.push(`DTSTAMP:${stamp}`);
      lines.push(`DTSTART:${icsLocalStamp(ev.year, ev.month, ev.day, sh, sm)}`);
      lines.push(`DTEND:${icsLocalStamp(ey, emon, ed, eh, em)}`);
      lines.push(`SUMMARY:${icsEscape(`${ev.person} ${ev.start}–${ev.end}`)}`);
      lines.push(`DESCRIPTION:${icsEscape(`${label}\n${window.MONTH_NAMES_ET[ev.month]} ${ev.year}`)}`);
      lines.push(`X-ROTA-PERSON:${icsEscape(ev.person)}`);
      lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    return foldIcs(lines.join("\r\n")) + "\r\n";
  }

  function downloadIcs(events, filename, calName) {
    const body = buildIcs(events, calName);
    downloadBlob(new Blob([body], { type: "text/calendar;charset=utf-8" }), filename);
    return body;
  }

  function exportMonthIcs() {
    if (!selectedPeople.size) {
      toast("Vali vähemalt üks inimene");
      return;
    }
    const everyone = team().people.length > 0 && team().people.every((p) => selectedPeople.has(p.name));
    const events = collectMonthShifts(everyone ? null : selectedPeople);
    if (!events.length) {
      toast("Valitud inimestel pole vahetusi");
      return;
    }
    const label = `${team().name} — ${window.MONTH_NAMES_ET[state.month]} ${state.year}`;
    const key = monthKey(state.year, state.month);
    const who = everyone ? "" : " — " + [...new Set(events.map((e) => e.person))].join(", ");
    const fileTeam = team().id;
    downloadIcs(events, everyone ? `rohe-graafik-${fileTeam}-${key}.ics` : `rohe-graafik-${fileTeam}-${key}-valik.ics`, `Rohe Graafik — ${label}${who}`);
    toast(`Kuu ICS: ${events.length} vahetust`);
  }

  function exportPersonIcs(name) {
    const events = collectMonthShifts(new Set([name]));
    if (!events.length) {
      toast(`${name}: sel kuul vahetusi pole`);
      return;
    }
    const label = `${team().name} — ${window.MONTH_NAMES_ET[state.month]} ${state.year}`;
    const safe = name.replace(/[^\p{L}\p{N}-]+/gu, "-");
    downloadIcs(events, `rohe-graafik-${team().id}-${monthKey(state.year, state.month)}-${safe}.ics`, `Minu graafik — ${name} — ${label}`);
    toast(`Minu graafik: ${name} (${events.length})`);
  }

  function parseIcsEvents(text) {
    const lines = unfoldIcs(text);
    const events = [];
    let cur = null;
    for (const line of lines) {
      if (line === "BEGIN:VEVENT") {
        cur = {};
        continue;
      }
      if (line === "END:VEVENT") {
        if (cur) events.push(cur);
        cur = null;
        continue;
      }
      if (!cur) continue;
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const meta = line.slice(0, idx);
      const raw = line.slice(idx + 1);
      const [name, ...params] = meta.split(";");
      const paramMap = {};
      params.forEach((p) => {
        const eq = p.indexOf("=");
        if (eq > 0) paramMap[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
      });
      cur[name.toUpperCase()] = { value: icsUnescape(raw), raw, params: paramMap };
    }
    return events;
  }

  function tallinnWallFromUtc(y, month, day, hour, minute) {
    const utc = new Date(Date.UTC(y, month - 1, day, hour, minute));
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Tallinn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = {};
    for (const p of fmt.formatToParts(utc)) parts[p.type] = p.value;
    let hh = Number(parts.hour);
    const wall = {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: hh === 24 ? 0 : hh,
      minute: Number(parts.minute),
    };
    if (hh === 24) {
      const next = new Date(wall.year, wall.month - 1, wall.day + 1);
      wall.year = next.getFullYear();
      wall.month = next.getMonth() + 1;
      wall.day = next.getDate();
    }
    return wall;
  }

  function parseIcsWhen(prop) {
    if (!prop || !prop.raw) return null;
    const m = String(prop.raw).trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
    if (!m) return null;
    const allDay = !m[4];
    let wall = {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: Number(m[4] || 0),
      minute: Number(m[5] || 0),
      allDay,
    };
    if (m[7] && !allDay) wall = { ...tallinnWallFromUtc(wall.year, wall.month, wall.day, wall.hour, wall.minute), allDay: false };
    return wall;
  }

  function matchIcsPerson(raw) {
    if (!raw) return null;
    const text = String(raw).replace(/\\n/g, " ").trim();
    if (!text) return null;
    const names = [...team().people].sort((a, b) => b.name.length - a.name.length);
    const exact = names.find((p) => p.name.toUpperCase() === text.toUpperCase());
    if (exact) return exact.name;
    for (const p of names) {
      const esc = p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(^|[^A-ZÄÖÜÕa-zäöüõ0-9])${esc}([^A-ZÄÖÜÕa-zäöüõ0-9]|$)`, "i");
      if (re.test(text)) return p.name;
    }
    return null;
  }

  function daySpan(a, b) {
    const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
    return Math.round(ms / 86400000);
  }

  function applyIcsImport(text) {
    const rawEvents = parseIcsEvents(text);
    const report = { added: [], updated: [], unchanged: 0, unknown: [], conflicts: [], skipped: [] };
    if (!rawEvents.length) return { ok: false, error: "Ühtegi kalendrisündmust ei leitud", report };
    const touched = new Set();

    for (const ev of rawEvents) {
      const label = (ev.SUMMARY && ev.SUMMARY.value) || (ev.UID && ev.UID.value) || "(sündmus)";
      const start = parseIcsWhen(ev.DTSTART);
      const end = parseIcsWhen(ev.DTEND);
      if (!start || start.allDay || !end || end.allDay) {
        report.skipped.push(`${label} — kellaaeg puudub`);
        continue;
      }
      const span = daySpan(start, end);
      if (span < 0 || span > 1) {
        report.skipped.push(`${label} — vahetus peab mahtuma ühte või kahte päeva`);
        continue;
      }
      const startStr = `${pad2(start.hour)}:${pad2(start.minute)}`;
      const endStr = `${pad2(end.hour)}:${pad2(end.minute)}`;
      if (span === 0 && end.hour * 60 + end.minute <= start.hour * 60 + start.minute) {
        report.skipped.push(`${label} — lõpp ei ole alguse järel`);
        continue;
      }
      const person = matchIcsPerson(ev["X-ROTA-PERSON"] && ev["X-ROTA-PERSON"].value) || matchIcsPerson(ev.SUMMARY && ev.SUMMARY.value);
      if (!person) {
        const who = (ev["X-ROTA-PERSON"] && ev["X-ROTA-PERSON"].value) || (ev.SUMMARY && ev.SUMMARY.value) || "—";
        report.unknown.push(`${who} (${start.day}.${pad2(start.month)} ${startStr}–${endStr})`);
        continue;
      }
      const key = monthKey(start.year, start.month);
      if (!team().schedules[key]) team().schedules[key] = { days: {}, notes: "", holidays: [] };
      const sched = team().schedules[key];
      if (!sched.days[start.day]) sched.days[start.day] = [];
      const slots = sched.days[start.day];
      const where = `${person} ${start.day}.${pad2(start.month)} ${startStr}–${endStr}`;
      const same = slots.find((s) => s.start === startStr && s.end === endStr);
      if (same) {
        if (same.person === person) {
          report.unchanged++;
          continue;
        }
        if (!isAssigned(same.person)) {
          same.person = person;
          report.updated.push(where);
          touched.add(key);
          continue;
        }
        report.conflicts.push(`${start.day}.${pad2(start.month)} ${startStr}–${endStr}: olemas ${displayPerson(same.person)}, ICS pakub ${person}`);
        continue;
      }
      const overlap = slots.some((s) =>
        s.person === person && intervalsOverlap(rangeIntervals(s.start, s.end), rangeIntervals(startStr, endStr))
      );
      if (overlap) {
        report.conflicts.push(`${person} kattub juba ${start.day}.${pad2(start.month)} ${startStr}–${endStr}`);
        continue;
      }
      slots.push({ start: startStr, end: endStr, person });
      slots.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
      report.added.push(where);
      touched.add(key);
    }

    if (touched.size) {
      saveState();
      const first = [...touched].sort()[0];
      const p = parseMonthKey(first);
      if (p.year !== state.year || p.month !== state.month) goToMonth(p.year, p.month);
      else render();
    }
    return { ok: true, report, touched: [...touched] };
  }

  function icsReportHtml(result) {
    if (!result.ok && result.error) return `<div class="err-box">${escapeHtml(result.error)}</div>`;
    const r = result.report;
    const list = (items) => items.length
      ? `<ul>${items.slice(0, 12).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}${items.length > 12 ? `<li>… ja veel ${items.length - 12}</li>` : ""}</ul>`
      : `<p class="modal-hint">Pole</p>`;
    return `
      <div class="ics-report">
        <div class="ok-box">Lisatud ${r.added.length} · uuendatud ${r.updated.length} · muutmata ${r.unchanged}</div>
        <strong>Tundmatud (jäetud vahele)</strong>
        ${list(r.unknown)}
        <strong>Konfliktid (jäetud vahele)</strong>
        ${list(r.conflicts)}
        <strong>Vahele jäetud</strong>
        ${list(r.skipped)}
      </div>`;
  }

  function openIcsImportModal() {
    openModal(`
      <h3>Impordi ICS</h3>
      <p class="modal-hint" style="margin-top:0">Staatiline fail — kontot ei küsita. Tuntud nimi lisatakse või täidetakse tühja pesa. Tundmatu nimi ja kattuvus jäetakse vahele.</p>
      <label for="m-ics">Kleebi .ics</label>
      <div class="import-area"><textarea id="m-ics" placeholder="BEGIN:VCALENDAR..."></textarea></div>
      <label for="m-ics-file">või laadi .ics</label>
      <input type="file" id="m-ics-file" accept=".ics,text/calendar,.txt">
      <div id="m-ics-report"></div>
      <div class="modal-actions">
        <button class="btn" id="m-cancel" type="button">Sulge</button>
        <button class="btn btn-primary" id="m-save" type="button">Impordi</button>
      </div>
    `, {
      wide: true,
      onOpen(body) {
        body.querySelector("#m-ics-file").addEventListener("change", (e) => {
          const f = e.target.files[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = () => { body.querySelector("#m-ics").value = String(reader.result || ""); };
          reader.readAsText(f);
        });
        body.querySelector("#m-cancel").onclick = closeModal;
        body.querySelector("#m-save").onclick = () => {
          const text = body.querySelector("#m-ics").value;
          if (!/BEGIN:VCALENDAR/i.test(text)) {
            toast("See ei ole .ics fail");
            return;
          }
          const result = applyIcsImport(text);
          body.querySelector("#m-ics-report").innerHTML = icsReportHtml(result);
          if (!result.ok) return;
          const r = result.report;
          toast(`ICS: +${r.added.length} / uuendatud ${r.updated.length} / vahele ${r.unknown.length + r.conflicts.length + r.skipped.length}`);
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
    const title = `Rohe Hostel Graafik — ${team().name} — ${window.MONTH_NAMES_ET[state.month]} ${state.year}`;
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
      selectedPeople = new Set(team().people.map((p) => p.name));
    }

    document.getElementById("btn-prev").onclick = () => changeMonth(-1);
    document.getElementById("btn-next").onclick = () => changeMonth(1);
    document.getElementById("btn-next-month").onclick = openNextMonthDialog;
    document.getElementById("team-select").onchange = (e) => switchTeam(e.target.value);
    document.getElementById("btn-add-team").onclick = () => openTeamNameModal("add");
    document.getElementById("btn-rename-team").onclick = () => openTeamNameModal("rename");
    document.getElementById("btn-delete-team").onclick = deleteActiveTeam;
    const sideNext = document.getElementById("btn-next-month-side");
    if (sideNext) sideNext.onclick = openNextMonthDialog;
    document.getElementById("btn-import").onclick = openImportModal;
    document.getElementById("btn-import-ics").onclick = openIcsImportModal;
    document.getElementById("btn-export-ics").onclick = exportMonthIcs;
    document.getElementById("btn-export-json").onclick = exportJSON;
    document.getElementById("btn-export-csv").onclick = exportCSV;
    document.getElementById("btn-export-print").onclick = exportPrintableHTML;
    document.getElementById("btn-theme").onclick = cycleTheme;
    document.getElementById("btn-clear-month").onclick = clearCurrentMonth;
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
            if (team().schedules[key] && Object.keys(team().schedules[key].days).length) {
              if (!confirm("Sellel kuul on juba andmeid. Ava olemasolev?")) return;
              goToMonth(y, m);
              closeModal();
              return;
            }
            team().schedules[key] = { days: {}, notes: "", holidays: [] };
            goToMonth(y, m);
            closeModal();
            toast("Uus kuu loodud");
          };
        },
      });
    };

    document.getElementById("btn-reset").onclick = () => {
      if (!confirm("Lähtesta kogu andmestik Vastuvõtu Oktoober 2026 seedile? Kõik meeskonnad ja kuud kustutatakse.")) return;
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY_V1);
      } catch (_) {}
      seedFromDefault();
      render();
      toast("Lähtestatud");
    };

    document.getElementById("btn-select-all").onclick = () => {
      selectedPeople = new Set(team().people.map((p) => p.name));
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
      refreshVacationMap();
      renderCalendar();
      renderStats();
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
    team().people.push({
      id: name.toLowerCase().replace(/[^a-z0-9äöüõ]+/gi, "-"),
      name,
      availability: [],
      color: COLORS[team().people.length % COLORS.length],
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
