// Seeded October 2026 schedule from Graafik PDF + shared constants
window.ROTA_SEED = {
  year: 2026,
  month: 10,
  people: [
    { id: "garen", name: "GAREN", availability: ["08:00-14:00", "08:00-20:00"] },
    { id: "rene", name: "RENE", availability: ["14:00-20:00", "20:00-08:00"] },
    { id: "irina", name: "IRINA", availability: ["14:00-20:00", "20:00-08:00"] },
    { id: "kris-celin", name: "KRIS-CELIN", availability: ["08:00-20:00", "14:00-20:00", "20:00-08:00"] },
    { id: "viktoria", name: "VIKTORIA", availability: ["08:00-20:00", "14:00-20:00", "20:00-08:00"] },
    { id: "nete", name: "NETE", availability: ["08:00-14:00"] },
    { id: "nicholas", name: "NICHOLAS", availability: ["08:00-14:00", "08:00-20:00", "14:00-20:00"] },
  ],
  notes: "Puhkused: (tühi)\nLipupäev: 17.10 — Hõimupäev",
  holidays: [{ day: 17, label: "Hõimupäev" }],
  // person: string = assigned, null = N/A, "" = empty (täitmata)
  days: {
    1:  [{ start: "08:00", end: "20:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "RENE" }, { start: "20:00", end: "08:00", person: "IRINA" }],
    2:  [{ start: "08:00", end: "20:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "RENE" }, { start: "20:00", end: "08:00", person: "IRINA" }],
    3:  [{ start: "08:00", end: "20:00", person: "KRIS-CELIN" }, { start: "20:00", end: "08:00", person: "VIKTORIA" }],
    4:  [{ start: "08:00", end: "20:00", person: "KRIS-CELIN" }, { start: "20:00", end: "08:00", person: "VIKTORIA" }],
    5:  [{ start: "08:00", end: "14:00", person: "NETE" }, { start: "14:00", end: "20:00", person: "NICHOLAS" }, { start: "20:00", end: "08:00", person: "RENE" }],
    6:  [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "NICHOLAS" }, { start: "20:00", end: "08:00", person: "RENE" }],
    7:  [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "IRINA" }, { start: "20:00", end: "08:00", person: "KRIS-CELIN" }],
    8:  [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "IRINA" }, { start: "20:00", end: "08:00", person: "KRIS-CELIN" }],
    9:  [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "IRINA" }, { start: "20:00", end: "08:00", person: "VIKTORIA" }],
    10: [{ start: "08:00", end: "20:00", person: "NICHOLAS" }, { start: "20:00", end: "08:00", person: "VIKTORIA" }],
    11: [{ start: "08:00", end: "20:00", person: "NICHOLAS" }, { start: "20:00", end: "08:00", person: "RENE" }],
    12: [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "KRIS-CELIN" }, { start: "20:00", end: "08:00", person: "RENE" }],
    13: [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "KRIS-CELIN" }, { start: "20:00", end: "08:00", person: "IRINA" }],
    14: [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "KRIS-CELIN" }, { start: "20:00", end: "08:00", person: "IRINA" }],
    15: [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "VIKTORIA" }, { start: "20:00", end: "08:00", person: "RENE" }],
    16: [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "VIKTORIA" }, { start: "20:00", end: "08:00", person: "RENE" }],
    17: [{ start: "08:00", end: "20:00", person: "KRIS-CELIN" }, { start: "20:00", end: "08:00", person: "IRINA" }],
    18: [{ start: "08:00", end: "20:00", person: "KRIS-CELIN" }, { start: "20:00", end: "08:00", person: "IRINA" }],
    19: [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "RENE" }, { start: "20:00", end: "08:00", person: "VIKTORIA" }],
    20: [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "RENE" }, { start: "20:00", end: "08:00", person: "VIKTORIA" }],
    21: [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "RENE" }, { start: "20:00", end: "08:00", person: null }],
    22: [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "KRIS-CELIN" }, { start: "20:00", end: "08:00", person: null }],
    23: [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "KRIS-CELIN" }, { start: "20:00", end: "08:00", person: "IRINA" }],
    24: [{ start: "08:00", end: "20:00", person: "VIKTORIA" }, { start: "20:00", end: "08:00", person: "IRINA" }],
    25: [{ start: "08:00", end: "20:00", person: "VIKTORIA" }, { start: "20:00", end: "08:00", person: "RENE" }],
    26: [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: null }, { start: "20:00", end: "08:00", person: "RENE" }],
    27: [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: null }, { start: "20:00", end: "08:00", person: "KRIS-CELIN" }],
    28: [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "IRINA" }, { start: "20:00", end: "08:00", person: "KRIS-CELIN" }],
    29: [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "IRINA" }, { start: "20:00", end: "08:00", person: "VIKTORIA" }],
    30: [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "IRINA" }, { start: "20:00", end: "08:00", person: "VIKTORIA" }],
    31: [{ start: "08:00", end: "14:00", person: "GAREN" }, { start: "14:00", end: "20:00", person: "RENE" }, { start: "20:00", end: "08:00", person: null }],
  },
};

window.DEFAULT_SLOTS = [
  { start: "08:00", end: "14:00", label: "Hommik" },
  { start: "14:00", end: "20:00", label: "Pärastlõuna" },
  { start: "20:00", end: "08:00", label: "Öö" },
];

window.SLOT_PRESETS = [
  { start: "08:00", end: "14:00", label: "08–14" },
  { start: "14:00", end: "20:00", label: "14–20" },
  { start: "20:00", end: "08:00", label: "20–08" },
  { start: "08:00", end: "20:00", label: "08–20" },
];

window.DAY_TEMPLATES = {
  triple: [
    { start: "08:00", end: "14:00", person: "" },
    { start: "14:00", end: "20:00", person: "" },
    { start: "20:00", end: "08:00", person: "" },
  ],
  dayNight: [
    { start: "08:00", end: "20:00", person: "" },
    { start: "20:00", end: "08:00", person: "" },
  ],
};

window.MONTH_NAMES_ET = [
  "", "Jaanuar", "Veebruar", "Märts", "Aprill", "Mai", "Juuni",
  "Juuli", "August", "September", "Oktoober", "November", "Detsember",
];

window.WEEKDAY_NAMES_ET = ["E", "T", "K", "N", "R", "L", "P"];
window.WEEKDAY_FULL_ET = ["Esmaspäev", "Teisipäev", "Kolmapäev", "Neljapäev", "Reede", "Laupäev", "Pühapäev"];
