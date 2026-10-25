/* ======================================================================
   1. HELPERS
   ====================================================================== */
const uid = () => Math.random().toString(36).slice(2, 9);
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysUntil = s => Math.round((parse(s) - today()) / 86400000);
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const money = n => isNaN(n) ? "$0" : (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const num = v => Number(v) || 0;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = s => s ? parse(s).toLocaleDateString(LOCALE[LANG] || "en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

function currentGradYear(grade) {
  const d = new Date();
  const schoolYearEnd = d.getMonth() >= 7 ? d.getFullYear() + 1 : d.getFullYear();
  return schoolYearEnd + (12 - grade);
}

/* ======================================================================
   2. WEBSITE LANGUAGES
   Any phrase missing from a language falls back to English.
   ====================================================================== */
const LANG_NAMES = { en: "English", zh: "中文", es: "Español", ko: "한국어", ja: "日本語", fr: "Français", it: "Italiano", ru: "Русский", pt: "Português", ay: "Aymar aru", he: "עברית", hi: "हिन्दी" };
const LOCALE = { en: "en-US", zh: "zh-CN", es: "es-US", ko: "ko-KR", ja: "ja-JP", fr: "fr-FR", it: "it-IT", ru: "ru-RU", pt: "pt-BR", ay: "es-BO", he: "he-IL", hi: "hi-IN" };
const RTL = ["he"];

/* Website text (T) lives in translations.js */
let LANG = "en";
const t = k => (T[LANG] && T[LANG][k]) || T.en[k] || k;

/* ======================================================================
   3. STORAGE (works in a normal browser and inside Claude's preview)
   ====================================================================== */
const Store = (() => {
  let mode = "memory"; const mem = {};
  try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); mode = "local"; }
  catch (e) { if (window.storage) mode = "claude"; }
  return {
    async get(k) {
      try {
        if (mode === "local") { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }
        if (mode === "claude") { const r = await window.storage.get(k, false); return r && r.value ? JSON.parse(r.value) : null; }
      } catch (e) {}
      return mem[k] ?? null;
    },
    async set(k, v) {
      mem[k] = v;
      try {
        if (mode === "local") localStorage.setItem(k, JSON.stringify(v));
        if (mode === "claude") await window.storage.set(k, JSON.stringify(v), false);
      } catch (e) {}
    },
    async del(k) {
      delete mem[k];
      try {
        if (mode === "local") localStorage.removeItem(k);
        if (mode === "claude") await window.storage.delete(k, false);
      } catch (e) {}
    },
  };
})();

async function hashPassword(pw, salt) {
  const text = salt + ":" + pw;
  try {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
    }
  } catch (e) {}
  let h = 5381; for (const ch of text) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;  // fallback
  return "f" + h.toString(16);
}

/* ======================================================================
   4. DATA MODEL
   ====================================================================== */
function defaultProfile(over = {}) {
  const grade = 11;
  return { name: "", grade, gradYear: currentGradYear(grade), state: "", school: "", feeWaiver: false, ...over };
}
function blankData(profile) {
  return { profile: profile || defaultProfile(), schools: [], recs: [], essays: [], volunteer: [], volGoal: 100,
    aid: [], loan: { amount: 20000, rate: 6.5, years: 10 }, scholarships: [], done: {},
    plan: [], showLinked: true, stats: { gpa: "", testType: "SAT", score: "", major: "Undecided" }, blocked: [] };
}

/* ======================================================================
   5. MY PLAN
   The plan holds only steps the student adds. Deadlines the student types
   into other tabs (applications, essays, letters, scholarships) can be
   shown too, and that can be switched off.
   ====================================================================== */
const PLAN_CATS = { testing:"Testing", application:"Applications", essays:"Essays", recs:"Recommendations", aid:"Financial aid", scholarship:"Scholarships", visit:"Visits & events", other:"Other" };
const PLAN_IDEAS = [
  ["Create my Common App account", "application"],
  ["Create StudentAid.gov accounts (FSA IDs) for me and a parent", "aid"],
  ["Register for the SAT or ACT", "testing"],
  ["Ask two teachers for recommendation letters", "recs"],
  ["Finish my personal essay draft", "essays"],
  ["Ask my counselor about application fee waivers", "application"],
  ["Submit the FAFSA", "aid"],
  ["Submit the CSS Profile (if my colleges require it)", "aid"],
  ["Send official test scores to my colleges", "testing"],
  ["Visit a campus or take a virtual tour", "visit"],
  ["Compare my financial aid offers", "aid"],
  ["Choose a college and pay the enrollment deposit", "application"],
];
const APP_PLANS = ["Early Decision (ED)", "Early Decision II (ED II)", "Early Action (EA)", "Restrictive Early Action (REA/SCEA)", "Regular Decision (RD)", "Rolling"];
const APP_PLAN_SHORT = { "Early Decision (ED)": "ED", "Early Decision II (ED II)": "ED II", "Early Action (EA)": "EA", "Restrictive Early Action (REA/SCEA)": "REA", "Regular Decision (RD)": "RD", "Rolling": "Rolling", ED: "ED", EA: "EA", RD: "RD" };
const APP_STATUSES = ["Not started", "In progress", "Submitted", "Deferred", "Waitlisted", "Accepted", "Denied", "Withdrawn"];
const APP_DONE = ["Submitted", "Deferred", "Waitlisted", "Accepted", "Denied", "Withdrawn"];
const APP_CHECKS = [["ck_form","Application form"],["ck_essay","Personal essay"],["ck_supp","Supplemental essays"],["ck_recs","Recommendations"],["ck_scores","Test scores sent (or not needed)"],["ck_transcript","Transcript requested"],["ck_fee","Fee paid or waived"],["ck_fafsa","FAFSA listed this college"],["ck_css","CSS Profile (if required)"]];

function buildTimeline(S) {
  const items = [];
  S.plan.forEach(p => items.push({ id: p.id, own: true, date: p.date || "", title: p.title || "Untitled step", cat: p.cat || "other", detail: p.notes || "", done: !!p.done }));
  if (S.showLinked) {
    const link = (id, date, title, cat, from, derived, detail = "") => items.push({ id, date, title, cat, from, detail, derived, done: derived || !!S.done[id] });
    S.schools.forEach(s => {
      const nm = s.name || "a college";
      if (s.appDeadline) link(`app-${s.id}`, s.appDeadline, `${APP_PLAN_SHORT[s.plan] || s.plan} application due: ${nm}`, "application", "apps", APP_DONE.includes(s.status));
      if (s.aidDeadline) link(`aid-${s.id}`, s.aidDeadline, `Financial aid forms due: ${nm}`, "aid", "apps", false, s.css ? "FAFSA and CSS Profile" : "FAFSA");
    });
    S.essays.forEach(e => { if (e.due) link(`essay-${e.id}`, e.due, `Essay due: ${e.school || "essay"}${e.prompt ? ` (${e.prompt})` : ""}`, "essays", "essays", e.status === "Submitted"); });
    S.recs.forEach(r => { if (r.due) link(`rec-${r.id}`, r.due, `Letter due from ${r.name || "recommender"}`, "recs", "recs", r.status === "Submitted"); });
    S.scholarships.forEach(x => { if (x.deadline) link(`sch-${x.id}`, x.deadline, `Scholarship due: ${x.name || "scholarship"}`, "scholarship", "scholarships", ["Submitted","Won","Not selected"].includes(x.status)); });
  }
  return items.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.title.localeCompare(b.title));
}
function statusOf(item) {
  if (item.done) return "done";
  if (!item.date) return "nodate";
  const n = daysUntil(item.date);
  return n < 0 ? "overdue" : n <= 14 ? "soon" : "upcoming";
}
const monthOf = d => parse(d).toLocaleDateString(LOCALE[LANG] || "en-US", { month: "long", year: "numeric" });

/* College data (COLLEGE_DATA, CIP_CODES) lives in college-data.js */
const ALPH = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
// Majors students pick, mapped to the federal 2-digit CIP field that contains them.
const MAJORS = [
  ["Undecided", null], ["Agriculture", "01"], ["Architecture", "04"], ["Biology / pre-med", "26"], ["Business", "52"],
  ["Communications & journalism", "09"], ["Computer science", "11"], ["Criminal justice", "43"], ["Culinary arts", "12"],
  ["Economics, political science & other social sciences", "45"], ["Education / teaching", "13"], ["Engineering", "14"],
  ["Engineering technology", "15"], ["English & writing", "23"], ["Environmental science & conservation", "03"],
  ["Ethnic, gender & cultural studies", "05"], ["Foreign languages", "16"], ["Health professions (nursing, pre-health, etc.)", "51"],
  ["History", "54"], ["Kinesiology, sports & recreation", "31"], ["Legal studies / pre-law", "22"], ["Liberal arts", "24"],
  ["Math & statistics", "27"], ["Philosophy & religious studies", "38"], ["Physical sciences (chemistry, physics)", "40"],
  ["Psychology", "42"], ["Public administration & social work", "44"], ["Visual & performing arts", "50"],
];
const IVY = new Set([166027, 130794, 186131, 190150, 215062, 217156, 182670, 190415]);
const REGION_OF = {};
[["Northeast","CT ME MA NH RI VT NJ NY PA"],["Southeast","AL AR FL GA KY LA MS NC SC TN VA WV DC MD DE"],["Midwest","IL IN IA KS MI MN MO NE ND OH SD WI"],
 ["Southwest","AZ NM OK TX"],["West","AK CA CO HI ID MT NV OR UT WA WY"]].forEach(([r, s]) => s.split(" ").forEach(x => REGION_OF[x] = r));
const LOCALE_NAME = { C: "City", S: "Suburb", T: "Town", R: "Rural" };
const CONTROL_NAME = ["Public", "Private nonprofit", "For-profit"];
const TEST_POLICY = { 1: "Requires SAT/ACT", 2: "Recommends SAT/ACT", 3: "Doesn't require or recommend SAT/ACT", 5: "Test-optional (considers scores if sent)" };
// Service academies need a congressional nomination and a service commitment, so they're searchable but not auto-suggested.
const SERVICE_ACADEMY = /^United States (Military|Naval|Air Force|Coast Guard|Merchant Marine) Academy/;
// Specialized colleges (religious, art and music, health-only, and so on) are searchable but not auto-suggested.
const SPECIAL_FOCUS = /seminary|yeshiva|talmud|rabbinical|theolog|bible|divinity|college of nursing|school of nursing|nursing and health|healthcare|health sciences|medical|pharmacy|culinary|conservatory|institute of art|art institute|school of art|college of art|design|fashion|music|beauty|cosmetology|barber|aviation|massage|chiropractic|osteopath|optometry|maritime|mortuary|hebrew|graduate/i;

const COLLEGES = COLLEGE_DATA.map(r => {
  const [id, name, city, st, ctrl, lvl, loc, ar, sat, satLo, satHi, actLo, actHi, size, net, net0, grad, url, test, flags, bach, assoc, pc, net1, net2, net3, net4] = r;
  const share = {};
  for (let i = 0; i + 2 < (pc || "").length; i += 3) share[CIP_CODES[ALPH.indexOf(pc[i])]] = Number(pc.slice(i + 1, i + 3));
  const fields = s => new Set([...(s || "")].map(ch => CIP_CODES[ALPH.indexOf(ch)]));
  return { id, name, city, st, ctrl, lvl, loc, ar: ar ?? null, sat: sat ?? null, satLo: satLo ?? null, satHi: satHi ?? null,
    actLo: actLo ?? null, actHi: actHi ?? null, size: size ?? null, net: net ?? null, net0: net0 ?? null, grad: grad ?? null,
    netBy: [net0 ?? null, net1 ?? null, net2 ?? null, net3 ?? null, net4 ?? null],
    url: url ? "https://" + url : null, test: test ?? null, hbcu: !!(flags & 1), hsi: !!(flags & 2),
    bach: fields(bach), assoc: fields(assoc), share, region: REGION_OF[st] || "Territories", ivy: IVY.has(id) };
});
const COLLEGE_BY_ID = new Map(COLLEGES.map(c => [c.id, c]));
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function findCollegeByName(name) {
  const n = norm(name); if (!n) return null;
  return COLLEGES.find(c => norm(c.name) === n) || null;
}
const offersMajor = (c, cip) => !cip || (c.lvl === 4 ? c.bach.has(cip) : (c.assoc.has(cip) || c.bach.has(cip)));

function actToSat(act) {   // ACT/SAT concordance (approximate)
  const tbl = [[36,1590],[35,1540],[34,1500],[33,1460],[32,1430],[31,1400],[30,1370],[29,1340],[28,1310],[27,1280],[26,1240],[25,1210],[24,1180],[23,1140],[22,1110],[21,1080],[20,1040],[19,1010],[18,970],[17,930],[16,890],[15,850],[14,800],[13,760],[12,710],[11,670],[10,630],[9,590]];
  const a = Math.round(act); const hit = tbl.find(x => x[0] === a);
  return hit ? hit[1] : a > 36 ? 1590 : 560;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const logit = p => Math.log(p / (1 - p));
// Typical GPA of admitted students isn't in federal data, so the chance model
// estimates it from the admit rate and test scores. It is not shown as a fact.
function typicalGPA(a, satCenter) {
  const fromRate = 3.95 - 1.1 * Math.pow(a, 0.8);
  if (!satCenter) return clamp(fromRate, 2.6, 3.95);
  const fromSat = clamp(3.0 + (satCenter - 1050) / 550 * 0.97, 2.6, 3.97);
  return clamp((fromRate + fromSat) / 2, 2.6, 3.95);
}
function studentStats() {
  const s = S.stats || {};
  const gpa = s.gpa === "" || s.gpa == null ? null : clamp(num(s.gpa), 0, 4);
  let sat = null, raw = null;
  if (s.testType === "SAT" && s.score !== "" && num(s.score) >= 400) { sat = clamp(Math.round(num(s.score)), 400, 1600); raw = `SAT ${sat}`; }
  if (s.testType === "ACT" && s.score !== "" && num(s.score) >= 1) { const a = clamp(Math.round(num(s.score)), 1, 36); sat = actToSat(a); raw = `ACT ${a}`; }
  const majorRow = MAJORS.find(m => m[0] === s.major) || MAJORS[0];
  return { gpa, sat, raw, major: majorRow[0], cip: majorRow[1] };
}
/* Estimated chance of admission for this exact GPA and score. Starts from the
   college's real admit rate and moves up or down by how far the student is from
   its admitted students' middle-50% SAT/ACT range. Very selective colleges are
   capped, because even perfect scores aren't a sure thing. */
function chanceFor(c, st) {
  if (c.ar == null) return c.lvl === 2 && c.ctrl === 0 ? { p: 0.99, open: true } : null;
  const a = clamp(c.ar / 100, 0.01, 0.99);
  if (a >= 0.99) return { p: 0.97, open: true };
  let center = null, sd = null;
  if (c.satLo && c.satHi) { center = (c.satLo + c.satHi) / 2; sd = clamp((c.satHi - c.satLo) / 1.349, 45, 160); }
  else if (c.sat) { center = c.sat; sd = clamp(70 + (1550 - c.sat) * 0.14, 60, 140); }
  else if (c.actLo && c.actHi) { const lo = actToSat(c.actLo), hi = actToSat(c.actHi); center = (lo + hi) / 2; sd = clamp((hi - lo) / 1.349, 45, 160); }
  const gC = typicalGPA(a, center);
  let L = logit(a) + 0.35;
  if (st.gpa != null) L += 0.9 * clamp((st.gpa - gC) / clamp(0.12 + 0.3 * a, 0.12, 0.35), -3.5, 3);
  if (center && st.sat != null) L += 0.8 * clamp((st.sat - center) / sd, -3.5, 3);
  let p = 1 / (1 + Math.exp(-L));
  p = Math.min(p, 1 - Math.pow(1 - a, 3.5), 0.97);
  p = Math.max(p, a * 0.05);
  return { p, center };
}
function tierOf(c, ch) {
  if (!ch) return null;
  if (c.ar != null && c.ar < 15) return ch.p < 0.1 ? "far" : "reach";
  if (ch.p >= 0.7) return "likely";
  if (ch.p >= 0.35) return "match";
  return ch.p < 0.1 ? "far" : "reach";
}
const TIER_LABEL = { likely: "Likely", match: "Target", reach: "Reach", far: "Far reach" };
const pctText = p => p >= 0.97 ? "97%+" : p < 0.01 ? "under 1%" : `${Math.round(p * 100)}%`;
const scorecardUrl = id => `https://collegescorecard.ed.gov/school/?${id}`;
const deadlineSearchUrl = name => `https://www.google.com/search?q=${encodeURIComponent(name + " application deadline")}`;
const netText = v => v == null ? "" : v <= 0 ? "$0 (aid can exceed costs)" : money(v);

/* ---- Top international universities ----
   SOURCE: QS World University Rankings 2027 (published June 17-18, 2026),
   topuniversities.com/qs-top-uni-wur. Every non-U.S. university in the top 100.
   [QS rank, name, city, country, official website] */
const INTL = [
  ["=2","Imperial College London","London","United Kingdom","imperial.ac.uk"],["4","University of Oxford","Oxford","United Kingdom","ox.ac.uk"],
  ["6","University of Cambridge","Cambridge","United Kingdom","cam.ac.uk"],["=8","ETH Zurich","Zürich","Switzerland","ethz.ch"],
  ["=8","UCL (University College London)","London","United Kingdom","ucl.ac.uk"],["10","National University of Singapore (NUS)","Singapore","Singapore","nus.edu.sg"],
  ["11","The University of Hong Kong","Hong Kong","Hong Kong SAR","hku.hk"],["12","Nanyang Technological University (NTU Singapore)","Singapore","Singapore","ntu.edu.sg"],
  ["13","Peking University","Beijing","China","pku.edu.cn"],["14","Tsinghua University","Beijing","China","tsinghua.edu.cn"],
  ["18","The Chinese University of Hong Kong (CUHK)","Hong Kong","Hong Kong SAR","cuhk.edu.hk"],["19","UNSW Sydney","Sydney","Australia","unsw.edu.au"],
  ["=22","EPFL","Lausanne","Switzerland","epfl.ch"],["=22","The University of Melbourne","Melbourne","Australia","unimelb.edu.au"],
  ["25","Technical University of Munich","Munich","Germany","tum.de"],["26","Fudan University","Shanghai","China","fudan.edu.cn"],
  ["28","The University of Sydney","Sydney","Australia","sydney.edu.au"],["29","Australian National University (ANU)","Canberra","Australia","anu.edu.au"],
  ["30","McGill University","Montreal","Canada","mcgill.ca"],["31","Monash University","Melbourne","Australia","monash.edu"],
  ["32","University of Toronto","Toronto","Canada","utoronto.ca"],["33","Hong Kong University of Science and Technology (HKUST)","Hong Kong","Hong Kong SAR","hkust.edu.hk"],
  ["34","Université PSL","Paris","France","psl.eu"],["35","The University of Edinburgh","Edinburgh","United Kingdom","ed.ac.uk"],
  ["36","Shanghai Jiao Tong University","Shanghai","China","sjtu.edu.cn"],["37","King's College London","London","United Kingdom","kcl.ac.uk"],
  ["38","Seoul National University","Seoul","South Korea","snu.ac.kr"],["39","The University of Tokyo","Tokyo","Japan","u-tokyo.ac.jp"],
  ["=40","The University of Manchester","Manchester","United Kingdom","manchester.ac.uk"],["=40","The University of Queensland","Brisbane","Australia","uq.edu.au"],
  ["42","Yonsei University","Seoul","South Korea","yonsei.ac.kr"],["=43","Institut Polytechnique de Paris","Paris","France","ip-paris.fr"],
  ["=45","University of British Columbia","Vancouver","Canada","ubc.ca"],["47","Zhejiang University","Hangzhou","China","zju.edu.cn"],
  ["48","Delft University of Technology","Delft","Netherlands","tudelft.nl"],["50","The Hong Kong Polytechnic University","Hong Kong","Hong Kong SAR","polyu.edu.hk"],
  ["=52","City University of Hong Kong","Hong Kong","Hong Kong SAR","cityu.edu.hk"],["=52","Korea University","Seoul","South Korea","korea.edu"],
  ["54","National Taiwan University","Taipei","Taiwan","ntu.edu.tw"],["56","Universiti Malaya","Kuala Lumpur","Malaysia","um.edu.my"],
  ["57","University of Bristol","Bristol","United Kingdom","bristol.ac.uk"],["59","KU Leuven","Leuven","Belgium","kuleuven.be"],
  ["60","University of Amsterdam","Amsterdam","Netherlands","uva.nl"],["61","Ludwig-Maximilians-Universität München (LMU)","Munich","Germany","lmu.de"],
  ["62","London School of Economics and Political Science (LSE)","London","United Kingdom","lse.ac.uk"],["63","King Fahd University of Petroleum & Minerals (KFUPM)","Dhahran","Saudi Arabia","kfupm.edu.sa"],
  ["64","Kyoto University","Kyoto","Japan","kyoto-u.ac.jp"],["65","KAIST","Daejeon","South Korea","kaist.ac.kr"],
  ["67","The University of Auckland","Auckland","New Zealand","auckland.ac.nz"],["=68","University of Warwick","Coventry","United Kingdom","warwick.ac.uk"],
  ["=68","University of Birmingham","Birmingham","United Kingdom","birmingham.ac.uk"],["71","Lund University","Lund","Sweden","lu.se"],
  ["73","Sorbonne University","Paris","France","sorbonne-universite.fr"],["75","Trinity College Dublin","Dublin","Ireland","tcd.ie"],
  ["76","Université Paris-Saclay","Paris","France","universite-paris-saclay.fr"],["=77","The University of Western Australia","Perth","Australia","uwa.edu.au"],
  ["=77","University of Leeds","Leeds","United Kingdom","leeds.ac.uk"],["79","Adelaide University","Adelaide","Australia","adelaideuni.edu.au"],
  ["80","University of Glasgow","Glasgow","United Kingdom","gla.ac.uk"],["=82","KTH Royal Institute of Technology","Stockholm","Sweden","kth.se"],
  ["=82","The University of Sheffield","Sheffield","United Kingdom","sheffield.ac.uk"],["84","Universidad de Buenos Aires (UBA)","Buenos Aires","Argentina","uba.ar"],
  ["85","Durham University","Durham","United Kingdom","durham.ac.uk"],["86","Heidelberg University","Heidelberg","Germany","uni-heidelberg.de"],
  ["=87","Politecnico di Milano","Milan","Italy","polimi.it"],["=87","University of Technology Sydney (UTS)","Sydney","Australia","uts.edu.au"],
  ["=87","Uppsala University","Uppsala","Sweden","uu.se"],["=90","Nanjing University","Nanjing","China","nju.edu.cn"],
  ["=90","University of Copenhagen","Copenhagen","Denmark","ku.dk"],["95","The University of Osaka","Osaka","Japan","osaka-u.ac.jp"],
  ["96","University of Alberta","Edmonton","Canada","ualberta.ca"],["=97","Institute of Science Tokyo","Tokyo","Japan","isct.ac.jp"],
  ["=97","University of Nottingham","Nottingham","United Kingdom","nottingham.ac.uk"],["=98","Freie Universität Berlin","Berlin","Germany","fu-berlin.de"],
  ["=98","University of Zurich","Zürich","Switzerland","uzh.ch"],["=100","University College Dublin","Dublin","Ireland","ucd.ie"],
].map(([rank, name, city, country, site], i) => ({ i, rank, name, city, country, url: "https://" + site }));
const ENGLISH_TAUGHT = ["United Kingdom", "Australia", "Canada", "Ireland", "New Zealand", "Singapore", "Hong Kong SAR"];
const COUNTRY_LANG = { Switzerland: "German or French", China: "Chinese", Germany: "German", France: "French", "South Korea": "Korean", Japan: "Japanese",
  Netherlands: "Dutch", Taiwan: "Chinese", Malaysia: "Malay and English", Belgium: "Dutch", "Saudi Arabia": "English", Sweden: "Swedish", Argentina: "Spanish", Italy: "Italian", Denmark: "Danish" };
function howToApply(u) {
  if (u.country === "United Kingdom") return `Apply through UCAS (up to 5 choices, each for one subject). ${/Oxford|Cambridge/.test(u.name) ? "Oxford and Cambridge" : "Oxford, Cambridge, and most medicine courses"} close in mid-October; most other courses close in late January. U.S. applicants are usually asked for AP scores and/or SAT/ACT.`;
  if (u.name === "University of Toronto") return "Ontario universities use OUAC (U.S. students use the OUAC 105 form).";
  if (u.country === "Canada") return "Apply directly on the university's website.";
  if (u.country === "Ireland") return "Students from outside the EU apply directly to the university, not through the CAO.";
  return "Apply directly on the university's website.";
}
const langNote = u => ENGLISH_TAUGHT.includes(u.country) ? "Taught in English." : u.country === "Saudi Arabia" ? "Taught mostly in English." : `Most undergraduate programs are taught in ${COUNTRY_LANG[u.country] || "the local language"}; some are in English, so check the program.`;

/* ======================================================================
   8. SCHOLARSHIP DIRECTORY
   Typical deadlines and amounts change every year: students should always
   confirm on the official website. grades: which high school grades can apply.
   ====================================================================== */
const SCH_CATS = { need: "Financial need", firstgen: "First-gen & low-income", merit: "Academic merit", service: "Leadership & service", stem: "STEM", arts: "Arts, writing & speech", heritage: "Heritage & identity", military: "Military families", noessay: "No essay", state: "State aid" };
const SCHOLARSHIP_DIRECTORY = [
  { name:"QuestBridge National College Match", url:"https://www.questbridge.org", award:"Full four-year scholarship at a partner college", when:"Usually late September", grades:[12], tags:["firstgen","need","merit"], who:"High-achieving seniors from low-income families. Matched students are admitted with a full scholarship." },
  { name:"QuestBridge College Prep Scholars", url:"https://www.questbridge.org", award:"Summer programs, college prep, and fee waivers", when:"Usually March", grades:[11], tags:["firstgen","need"], who:"High-achieving juniors from low-income families. A strong head start on the National College Match." },
  { name:"The Gates Scholarship", url:"https://www.thegatesscholarship.org", award:"Full cost of attendance not covered by other aid", when:"Usually mid-September", grades:[12], tags:["need","merit","heritage","firstgen"], who:"Pell-eligible seniors from minority backgrounds with strong grades and leadership." },
  { name:"Jack Kent Cooke College Scholarship", url:"https://www.jkcf.org", award:"Up to $55,000 per year", when:"Usually November", grades:[12], tags:["need","merit","firstgen"], who:"High-achieving seniors with financial need." },
  { name:"Coca-Cola Scholars Program", url:"https://www.coca-colascholarsfoundation.org", award:"$20,000", when:"Usually September 30", grades:[12], tags:["service","merit"], who:"Seniors recognized for leadership and service in their schools and communities." },
  { name:"Dell Scholars", url:"https://www.dellscholars.org", award:"$20,000 plus a laptop and support", when:"Usually December 1", grades:[12], tags:["need","firstgen"], who:"Pell-eligible seniors who took part in an approved college-readiness program." },
  { name:"Horatio Alger National Scholarship", url:"https://scholars.horatioalger.org", award:"Up to $25,000", when:"Usually fall", grades:null, tags:["need","firstgen"], who:"Students who have overcome major obstacles and have financial need. Check the site for which grades can apply." },
  { name:"Ron Brown Scholar Program", url:"https://www.ronbrown.org", award:"$40,000 over four years", when:"Usually January", grades:[12], tags:["heritage","service","need"], who:"Black/African American seniors with academic promise, leadership, and community service." },
  { name:"Jackie Robinson Foundation Scholarship", url:"https://www.jackierobinson.org", award:"Multi-year award plus mentoring", when:"Usually January", grades:[12], tags:["heritage","need","service"], who:"Students of color with financial need and leadership potential." },
  { name:"Hispanic Scholarship Fund", url:"https://www.hsf.net", award:"$500 to $5,000", when:"Usually February 15", grades:[12], tags:["heritage","merit"], who:"Students of Hispanic heritage planning to enroll full-time. Requires the FAFSA or state aid form." },
  { name:"LNESC (LULAC) Scholarships", url:"https://www.lnesc.org", award:"Varies", when:"Usually spring", grades:[12], tags:["heritage"], who:"Hispanic students. Several scholarships with different requirements." },
  { name:"UNCF Scholarships", url:"https://uncf.org/scholarships", award:"Varies (hundreds of programs)", when:"Many deadlines all year", grades:[12], tags:["heritage","need"], who:"Many scholarships, mostly for students attending or planning to attend HBCUs and UNCF member colleges." },
  { name:"Thurgood Marshall College Fund", url:"https://www.tmcf.org", award:"Varies", when:"Many deadlines all year", grades:[12], tags:["heritage","merit"], who:"Students at public HBCUs and predominantly Black institutions." },
  { name:"APIA Scholars", url:"https://apiascholars.org", award:"Varies", when:"Usually January", grades:[12], tags:["heritage","need","firstgen"], who:"Asian American and Pacific Islander students, with priority for financial need and first-generation students." },
  { name:"American Indian College Fund", url:"https://collegefund.org", award:"Varies", when:"Usually spring", grades:[12], tags:["heritage","need"], who:"American Indian and Alaska Native students." },
  { name:"Korean American Scholarship Foundation", url:"https://www.kasf.org", award:"Varies", when:"Usually spring", grades:null, tags:["heritage"], who:"Korean American students. Check which grades can apply." },
  { name:"JACL Scholarships", url:"https://jacl.org/scholarships", award:"Varies", when:"Usually spring", grades:[12], tags:["heritage"], who:"Scholarships from the Japanese American Citizens League. Membership may be required." },
  { name:"TheDream.US", url:"https://www.thedream.us", award:"Varies, up to full tuition at partner colleges", when:"Usually winter", grades:[12], tags:["heritage","need"], who:"Immigrant students, including DACA and TPS recipients, attending partner colleges." },
  { name:"Point Foundation Scholarships", url:"https://pointfoundation.org", award:"Varies", when:"Usually winter", grades:null, tags:["heritage","merit"], who:"LGBTQ+ students with leadership and academic promise. Check which grades can apply." },
  { name:"National Merit Scholarship Program", url:"https://www.nationalmerit.org", award:"$2,500 plus corporate and college-sponsored awards", when:"Enter by taking the PSAT/NMSQT in October of junior year", grades:[11], tags:["merit"], who:"Juniors who score at the top of their state on the PSAT/NMSQT." },
  { name:"Coolidge Scholarship", url:"https://coolidgescholars.org", award:"Full tuition, room, and board", when:"Usually January", grades:[11], tags:["merit"], who:"Juniors with strong academics and an interest in public service and civic life." },
  { name:"Cameron Impact Scholarship", url:"https://www.bryancameroneducationfoundation.org", award:"Full tuition for four years", when:"Usually early September of senior year", grades:[12], tags:["merit","service"], who:"Seniors with strong grades, leadership, and community service." },
  { name:"Posse Foundation", url:"https://www.possefoundation.org", award:"Full tuition at a partner college", when:"Nominations usually in spring of junior year and fall of senior year", grades:[11,12], tags:["firstgen","service","merit"], who:"Students nominated by their high school or a community group. Ask your counselor about a nomination." },
  { name:"Stamps Scholars", url:"https://www.stampsscholars.org", award:"Varies, up to full cost of attendance", when:"Apply through each partner college", grades:[12], tags:["merit"], who:"Merit scholarships at partner colleges. Many consider every applicant automatically." },
  { name:"Elks Most Valuable Student", url:"https://www.elks.org/scholars", award:"$4,000 to $50,000", when:"Usually mid-November", grades:[12], tags:["merit","need","service"], who:"Seniors judged on scholarship, leadership, and financial need. U.S. citizens." },
  { name:"Equitable Excellence Scholarship", url:"https://equitable.com/foundation/equitable-excellence-scholarship", award:"Varies", when:"Usually December", grades:[12], tags:["service","merit"], who:"Seniors who show ambition and self-drive through school, work, or community activities." },
  { name:"Hagan Scholarship", url:"https://www.haganscholarships.org", award:"Varies, renewable", when:"Usually fall", grades:[12], tags:["need","merit"], who:"Seniors from rural areas with financial need and a 3.5+ GPA." },
  { name:"Taco Bell Live Más Scholarship", url:"https://www.tacobellfoundation.org", award:"$5,000 to $25,000", when:"Usually winter", grades:[11,12], tags:["noessay","arts"], who:"Students 16 to 26. You submit a short video about your passion; grades and test scores aren't required." },
  { name:"Niche $25,000 No Essay Scholarship", url:"https://www.niche.com/colleges/scholarships/no-essay-scholarship/", award:"$25,000 (random drawing)", when:"Monthly", grades:[9,10,11,12], tags:["noessay"], who:"Quick entry, chosen at random. Worth a minute, but don't count on it." },
  { name:"Regeneron Science Talent Search", url:"https://www.societyforscience.org/regeneron-sts/", award:"Up to $250,000", when:"Usually November", grades:[12], tags:["stem","merit"], who:"Seniors who completed an original science, math, or engineering research project." },
  { name:"Davidson Fellows Scholarship", url:"https://www.davidsongifted.org", award:"$10,000 to $50,000", when:"Usually February", grades:[9,10,11,12], tags:["stem","arts","merit"], who:"Students 18 or under who completed a significant project in STEM, literature, music, or philosophy." },
  { name:"Amazon Future Engineer Scholarship", url:"https://www.amazonfutureengineer.com/scholarships", award:"$40,000 over four years plus a paid internship offer", when:"Usually winter", grades:[12], tags:["stem","need"], who:"Seniors with financial need planning to study computer science." },
  { name:"Society of Women Engineers Scholarships", url:"https://swe.org/scholarships/", award:"Varies", when:"Usually winter", grades:[12], tags:["stem","heritage"], who:"Women planning to study engineering or computer science." },
  { name:"SHPE Scholarships", url:"https://shpe.org", award:"Varies", when:"Usually spring", grades:[12], tags:["stem","heritage"], who:"Hispanic students planning to study STEM, from the Society of Hispanic Professional Engineers." },
  { name:"NSBE Scholarships", url:"https://www.nsbe.org", award:"Varies", when:"Varies", grades:[12], tags:["stem","heritage"], who:"Black students planning to study engineering, from the National Society of Black Engineers." },
  { name:"Scholastic Art & Writing Awards", url:"https://www.artandwriting.org", award:"Senior portfolio awards up to $12,500", when:"Usually December", grades:[9,10,11,12], tags:["arts"], who:"Students in grades 7 to 12 who submit art or writing. Seniors can submit portfolios for scholarships." },
  { name:"VFW Voice of Democracy", url:"https://www.vfw.org/community/youth-and-education/youth-scholarships", award:"Up to $35,000 (national winner)", when:"Usually October 31", grades:[9,10,11,12], tags:["arts","service"], who:"High school students who record a short audio essay on a patriotic theme." },
  { name:"American Legion Oratorical Contest", url:"https://www.legion.org/oratorical", award:"Up to $25,000", when:"Usually fall and winter (local contests)", grades:[9,10,11,12], tags:["arts"], who:"High school students who give a speech on the U.S. Constitution." },
  { name:"Prudential Emerging Visionaries", url:"https://www.prudential.com/emergingvisionaries", award:"Up to $15,000 plus a trip and coaching", when:"Usually fall", grades:[9,10,11,12], tags:["service","stem"], who:"Students 14 to 18 working on solutions to financial or social challenges in their communities." },
  { name:"Scholarships for Military Children", url:"https://militaryscholar.org", award:"$2,000", when:"Usually February", grades:[12], tags:["military"], who:"Children of service members, retirees, and reservists with commissary privileges." },
  { name:"Children of Fallen Patriots Foundation", url:"https://www.fallenpatriots.org", award:"College support", when:"Apply any time", grades:[9,10,11,12], tags:["military","need"], who:"Children of military service members who lost their lives in the line of duty." },
  // ---- federal + state aid ----
  { name:"Federal Pell Grant", url:"https://studentaid.gov/understand-aid/types/grants/pell", award:"Up to $7,395 per year (2025–26)", when:"File the FAFSA (opens around October 1)", grades:[12], tags:["need","state","firstgen"], who:"Federal grant for students with financial need. You get it automatically by filing the FAFSA. You don't pay it back." },
  { name:"New York Excelsior Scholarship", url:"https://www.hesc.ny.gov", award:"Tuition at SUNY and CUNY colleges", when:"Usually summer before college", grades:[12], st:"NY", tags:["state","need"], who:"New York residents attending SUNY or CUNY whose families meet the income limit. Use with TAP and Pell." },
  { name:"New York Tuition Assistance Program (TAP)", url:"https://www.hesc.ny.gov", award:"Varies by income", when:"Apply right after the FAFSA", grades:[12], st:"NY", tags:["state","need"], who:"New York residents attending college in New York." },
  { name:"Cal Grant (California)", url:"https://www.csac.ca.gov", award:"Varies by college and need", when:"Usually spring (file the FAFSA or CA Dream Act Application)", grades:[12], st:"CA", tags:["state","need"], who:"California residents with financial need and a minimum GPA." },
  { name:"TEXAS Grant", url:"https://www.collegeforalltexans.com", award:"Varies", when:"File the FAFSA or TASFA early", grades:[12], st:"TX", tags:["state","need"], who:"Texas residents with financial need attending public colleges in Texas." },
  { name:"Florida Bright Futures", url:"https://www.floridastudentfinancialaidsg.org", award:"Covers a large share of tuition", when:"Apply during senior year", grades:[12], st:"FL", tags:["state","merit"], who:"Florida residents who meet GPA, test score, and service-hour requirements." },
  { name:"Georgia HOPE Scholarship", url:"https://www.gafutures.org", award:"Covers a large share of tuition", when:"File the FAFSA or GSFAPP", grades:[12], st:"GA", tags:["state","merit"], who:"Georgia residents who graduate with a 3.0+ HOPE GPA." },
  { name:"Tennessee Promise", url:"https://www.tnpromise.gov", award:"Free tuition at community and technical colleges", when:"Usually November 1 of senior year", grades:[12], st:"TN", tags:["state"], who:"Tennessee seniors planning to attend a community or technical college. Includes mentoring." },
  { name:"Illinois MAP Grant", url:"https://www.isac.org", award:"Varies", when:"File the FAFSA early; funds run out", grades:[12], st:"IL", tags:["state","need"], who:"Illinois residents with financial need attending college in Illinois." },
  { name:"New Jersey Tuition Aid Grant", url:"https://www.hesaa.org", award:"Varies", when:"File the FAFSA by the state deadline", grades:[12], st:"NJ", tags:["state","need"], who:"New Jersey residents with financial need attending college in New Jersey." },
  { name:"Pennsylvania State Grant", url:"https://www.pheaa.org", award:"Varies", when:"Usually May 1 (file the FAFSA)", grades:[12], st:"PA", tags:["state","need"], who:"Pennsylvania residents with financial need." },
  { name:"MASSGrant (Massachusetts)", url:"https://www.mass.edu/osfa", award:"Varies", when:"File the FAFSA by the state deadline", grades:[12], st:"MA", tags:["state","need"], who:"Massachusetts residents with financial need." },
  { name:"Washington College Grant", url:"https://wsac.wa.gov", award:"Up to full tuition for many families", when:"File the FAFSA or WASFA", grades:[12], st:"WA", tags:["state","need"], who:"Washington residents with low to moderate family income." },
  { name:"Oregon Promise", url:"https://oregonstudentaid.gov", award:"Community college tuition", when:"Usually spring of senior year", grades:[12], st:"OR", tags:["state"], who:"Oregon graduates attending an Oregon community college." },
  { name:"Michigan Achievement Scholarship", url:"https://www.michigan.gov/mistudentaid", award:"Varies by college type", when:"File the FAFSA", grades:[12], st:"MI", tags:["state","need"], who:"Michigan high school graduates attending college in Michigan." },
  { name:"NC Next NC Scholarship", url:"https://www.cfnc.org", award:"Varies", when:"File the FAFSA", grades:[12], st:"NC", tags:["state","need"], who:"North Carolina residents attending college in-state with family income under the limit." },
  { name:"Louisiana TOPS", url:"https://www.osfa.la.gov", award:"Tuition at Louisiana public colleges", when:"File the FAFSA by the state deadline", grades:[12], st:"LA", tags:["state","merit"], who:"Louisiana residents who meet GPA, ACT, and course requirements." },
];
const SCHOLARSHIP_TOOLS = [
  { name:"BigFuture Scholarship Search", url:"https://bigfuture.collegeboard.org/scholarships", who:"College Board's free search. Also runs no-essay scholarships for finishing college-planning steps." },
  { name:"CareerOneStop Scholarship Finder", url:"https://www.careeronestop.org/toolkit/training/find-scholarships.aspx", who:"Free search of 8,000+ scholarships from the U.S. Department of Labor." },
  { name:"Fastweb", url:"https://www.fastweb.com", who:"Free profile-based matching for scholarships." },
  { name:"Scholarships.com", url:"https://www.scholarships.com", who:"Free directory you can filter by state, major, and background." },
  { name:"Going Merry", url:"https://www.goingmerry.com", who:"Lets you reuse your answers to apply to several scholarships." },
  { name:"Bold.org", url:"https://bold.org", who:"Many small scholarships, including no-essay ones." },
];

/* ======================================================================
   9. ACCOUNTS + SAVING ACROSS DEVICES

   To let students log in from ANY device, connect a free Firebase project:
     1. Go to console.firebase.google.com and create a project.
     2. Build > Authentication > Get started > turn on "Email/Password".
     3. Build > Firestore Database > Create database. Then open the Rules tab,
        paste these rules, and click Publish:

          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /students/{uid} {
                allow read, write: if request.auth != null && request.auth.uid == uid;
              }
              // Community forum (signed-in students only)
              match /forums/{id} {
                allow read: if request.auth != null;
                allow create: if request.auth != null && request.resource.data.createdBy == request.auth.uid
                  && request.resource.data.name is string && request.resource.data.name.size() <= 60;
                allow delete: if request.auth != null && resource.data.createdBy == request.auth.uid;
              }
              match /posts/{id} {
                allow read: if request.auth != null;
                allow create: if request.auth != null && request.resource.data.uid == request.auth.uid
                  && request.resource.data.body.size() <= 4000 && request.resource.data.title.size() <= 120
                  && request.resource.data.reportedBy.size() == 0 && request.resource.data.replyCount == 0;
                allow delete: if request.auth != null && resource.data.uid == request.auth.uid;
                allow update: if request.auth != null && (
                  (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reportedBy'])
                    && request.resource.data.reportedBy.removeAll(resource.data.reportedBy).hasOnly([request.auth.uid]))
                  || (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['replyCount', 'lastReplyAt'])
                    && request.resource.data.replyCount == resource.data.replyCount + 1));
              }
              match /replies/{id} {
                allow read: if request.auth != null;
                allow create: if request.auth != null && request.resource.data.uid == request.auth.uid
                  && request.resource.data.body.size() <= 2000 && request.resource.data.reportedBy.size() == 0;
                allow delete: if request.auth != null && resource.data.uid == request.auth.uid;
                allow update: if request.auth != null
                  && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reportedBy'])
                  && request.resource.data.reportedBy.removeAll(resource.data.reportedBy).hasOnly([request.auth.uid]);
              }
            }
          }

     4. Project settings (gear icon) > General > Your apps > Web app (</>).
        Copy apiKey, authDomain, projectId, and appId into FIREBASE_CONFIG below.
     5. Put the site online (GitHub Pages, Netlify, etc.) and add that web
        address under Authentication > Settings > Authorized domains.

   Until FIREBASE_CONFIG is filled in, accounts still work but save only on
   the device where they were made.
   ====================================================================== */
/* FIREBASE_CONFIG lives in firebase-config.js */
const CLOUD_ON = Object.values(FIREBASE_CONFIG).every(v => v && !String(v).includes("PASTE_"));
const FIREBASE_VERSION = "10.12.2";
let fb = null, CLOUD_ERR = "";

let USER = null;            // { id, email, name, cloud } or null for guest
let LOCAL_ACCOUNTS = {};    // device-only accounts, used when Firebase isn't set up
let S = blankData();        // the signed-in student's (or guest's) data
let PENDING = null;         // data for a brand-new cloud account
const UI = {
  tab: "home", hideDone: false, showPast: true,
  newStep: { title: "", date: "", cat: "other", notes: "" }, stepErr: "", editStep: null, ideasOpen: false,
  match: { level: "4-year colleges", control: "Any", region: "Any region", maxNet: "Any", size: "Any size", setting: "Any setting", homeOnly: false, forProfit: false, hbcu: false, income: "Not sure" },
  showMatches: false, q: "", sort: "Your chance (high to low)", page: 0, filtersOpen: false, openApp: null, matchErr: "",
  expand: {}, collegeView: "us", intlCountry: "All countries", intlEnglish: false, sourcesOpen: false,
  np: { title: "", body: "" }, nr: { body: "" }, nf: { name: "", type: "Town or city", desc: "" }, forumErr: "", newForumOpen: false, forumQ: "", rulesOpen: false,
  schQ: "", schCat: "all", schMyGrade: false, schAllStates: false,
  tour: null, toast: "", busy: false, sync: "", confirmDelete: false,
  signup: { name: "", email: "", password: "", grade: "11", school: "", state: "", keep: true },
  login: { email: "", password: "" }, authErr: "", authMsg: "",
  vol: { date: "", org: "", activity: "", hours: "", contact: "" }, volErr: "",
  emailFor: null, openEssay: null,
};
const dataKey = () => `fg:data:${USER ? USER.id : "guest"}`;

function migrate(d) {
  if (!d || d.sample) return blankData();               // drops old sample data
  const out = { ...blankData({ ...defaultProfile(), ...(d.profile || {}) }), ...d };
  out.profile = { ...defaultProfile(), ...(d.profile || {}) };
  out.stats = { ...blankData().stats, ...(d.stats || {}) };
  const OLD_PLAN = { ED: "Early Decision (ED)", EA: "Early Action (EA)", RD: "Regular Decision (RD)" };
  out.schools = (out.schools || []).map(s => ({ status: "Not started", ...s, plan: OLD_PLAN[s.plan] || s.plan || "Regular Decision (RD)",
    cid: s.cid || (findCollegeByName(s.name) && norm(findCollegeByName(s.name).name) === norm(s.name) ? findCollegeByName(s.name).id : null) }));
  delete out.sample;
  return out;
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error("Couldn't load " + src));
    document.head.appendChild(s);
  });
}
async function startCloud() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
  await loadScript(base + "firebase-app-compat.js");
  await Promise.all([loadScript(base + "firebase-auth-compat.js"), loadScript(base + "firebase-firestore-compat.js")]);
  firebase.initializeApp(FIREBASE_CONFIG);
  const db = firebase.firestore();
  try { db.settings({ ignoreUndefinedProperties: true }); } catch (e) {}
  fb = { auth: firebase.auth(), db };
}
const studentDoc = id => fb.db.collection("students").doc(id);

async function onCloudUser(u) {
  if (!u) {
    if (USER && USER.cloud) { USER = null; S = migrate(await Store.get("fg:data:guest")); UI.tab = "home"; render(); }
    return;
  }
  if (USER && USER.cloud && USER.id === u.uid && !PENDING) return;
  USER = { id: u.uid, email: u.email, name: u.displayName || u.email, cloud: true };
  UI.sync = "Loading your data…"; render();
  try {
    const snap = await studentDoc(u.uid).get();
    if (snap.exists && snap.data().data) S = migrate(snap.data().data);
    else {
      S = PENDING || blankData(defaultProfile({ name: u.displayName || "" }));
      await cloudWrite(u.uid, S);
    }
    UI.sync = "Saved to your account";
  } catch (e) {
    S = migrate(await Store.get(dataKey()));             // fall back to this device's copy
    UI.sync = "Offline: changes will sync when you reconnect";
  }
  PENDING = null;
  USER.name = S.profile.name || USER.name;
  Store.set(dataKey(), S);
  render();
}

async function init() {
  LANG = (await Store.get("fg:lang")) || "en";
  LOCAL_ACCOUNTS = (await Store.get("fg:accounts")) || {};
  S = migrate(await Store.get("fg:data:guest"));
  applyDir(); render();
  if (CLOUD_ON) {
    try { await startCloud(); fb.auth.onAuthStateChanged(onCloudUser); render(); }
    catch (e) { CLOUD_ERR = "Couldn't reach the account server. Check your internet connection and reload."; render(); }
  } else {
    const email = await Store.get("fg:session");
    if (email && LOCAL_ACCOUNTS[email]) {
      USER = { id: "local:" + email, email, name: LOCAL_ACCOUNTS[email].name, cloud: false };
      S = migrate(await Store.get(dataKey()));
      render();
    }
  }
  if (!(await Store.get("fg:toured"))) { UI.tour = 0; UI.tab = TOUR[0].tab; render(); }
}

/* ---- saving: this device right away, the account a moment later ---- */
let saveTimer, cloudTimer, cloudPending = null;
async function cloudWrite(id, data) {
  await studentDoc(id).set({ data, updated: firebase.firestore.FieldValue.serverTimestamp() });
}
function setSyncLabel() { const el = document.getElementById("syncLabel"); if (el) el.textContent = UI.sync; }
function save() {
  const key = dataKey(), data = S;                     // capture now, so switching accounts can't mix data
  clearTimeout(saveTimer); saveTimer = setTimeout(() => Store.set(key, data), 250);
  if (USER && USER.cloud && fb) {
    cloudPending = { id: USER.id, data };
    UI.sync = "Saving…"; setSyncLabel();
    clearTimeout(cloudTimer); cloudTimer = setTimeout(flushCloud, 1200);
  }
}
async function flushCloud() {
  clearTimeout(cloudTimer);
  if (!cloudPending) return;
  const job = cloudPending; cloudPending = null;
  try { await cloudWrite(job.id, job.data); UI.sync = "Saved to your account"; }
  catch (e) { UI.sync = "Not saved to your account yet. Check your connection."; cloudPending = cloudPending || job; }
  setSyncLabel();
}
window.addEventListener("beforeunload", () => { if (cloudPending) flushCloud(); });

function friendlyError(e) {
  const bad = "That email and password don't match an account.";
  const m = {
    "auth/email-already-in-use": "An account with that email already exists. Try logging in.",
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-credential": bad, "auth/wrong-password": bad, "auth/user-not-found": bad, "auth/invalid-login-credentials": bad,
    "auth/too-many-requests": "Too many tries. Wait a few minutes and try again.",
    "auth/network-request-failed": "No internet connection. Check it and try again.",
    "auth/requires-recent-login": "For safety, log out, log back in, and then delete your account.",
    "auth/operation-not-allowed": "Email sign-in isn't turned on in Firebase yet (setup step 2).",
    "auth/unauthorized-domain": "This web address isn't authorized in Firebase yet (setup step 5).",
    "permission-denied": "The database refused to save. Check the Firestore rules (setup step 3).",
  };
  return m[e && e.code] || (e && e.message) || "Something went wrong. Try again.";
}

function applyDir() {
  document.documentElement.lang = LANG;
  document.documentElement.dir = RTL.includes(LANG) ? "rtl" : "ltr";
}
function toast(msg) { UI.toast = msg; render(); setTimeout(() => { UI.toast = ""; render(); }, 2200); }

/* ======================================================================
   10. TEMPLATE HELPERS
   ====================================================================== */
const CAT_COLOR = { testing:"#6A4C93", aid:"#3F7D5C", application:"#14213D", recs:"#E9A23B", essays:"#2E86AB", scholarship:"#B83A2E", visit:"#C7811A", other:"#8A9BB1" };
const pill = s => { const m = { overdue:["p-over","Overdue"], soon:["p-soon","Due soon"], done:["p-done","Done"], upcoming:["p-up","Upcoming"], nodate:["p-up","No date"] }; return `<span class="pill ${m[s][0]}">${m[s][1]}</span>`; };
const inp = (bind, value, type = "text", attrs = "") => `<input type="${type}" data-bind="${bind}" value="${esc(value)}" ${attrs}>`;
const chk = (bind, checked) => `<input type="checkbox" data-bind="${bind}" ${checked ? "checked" : ""}>`;
const sel = (bind, options, cur) => `<select data-bind="${bind}">${options.map(o => `<option ${String(o) === String(cur) ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
const field = (label, html) => `<div><label>${label}</label>${html}</div>`;
const removeBtn = (coll, id) => `<button class="x" data-action="remove" data-coll="${coll}" data-id="${id}" aria-label="Remove">×</button>`;
const ICONS = {
  plan:'<path d="M4 6h16M4 12h10M4 18h7" />', match:'<circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/>',
  essays:'<path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h6"/>', volunteer:'<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  aid:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>', recs:'<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>',
  forum:'<path d="M4 5h11v8H8l-4 3z"/><path d="M15 9h5v8l-3-2h-6v-2"/>',
  sch:'<path d="m12 3 9 5-9 5-9-5z"/><path d="M7 10.5V15c0 1.5 2.5 3 5 3s5-1.5 5-3v-4.5"/>',
};
const icon = (k, color) => `<div class="ic" style="background:${color}22"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg></div>`;

/* ======================================================================
   11. VIEWS
   ====================================================================== */
const TABS = [
  ["home","nav_home"],["plan","nav_plan"],["apps","nav_apps"],["match","nav_match"],["essays","nav_essays"],["volunteer","nav_volunteer"],
  ["aid","nav_aid"],["recs","nav_recs"],["scholarships","nav_sch"],["forum","nav_forum"],["account","nav_account"],
];

// Top bar: single tabs and category menus. Items: [tab, label key, description key, college view]
const NAV = [
  { tab: "home" },
  { group: "plan", label: "grp_plan", items: [["plan", "nav_plan", "d_plan"], ["apps", "nav_apps", "d_apps"]] },
  { group: "colleges", label: "grp_colleges", items: [["match", "nav_match", "d_match", "us"], ["match", "nav_intl", "d_intl", "intl"]] },
  { group: "apply", label: "grp_apply", items: [["essays", "nav_essays", "d_essays"], ["recs", "nav_recs", "d_recs"], ["volunteer", "nav_volunteer", "d_volunteer"]] },
  { group: "pay", label: "grp_pay", items: [["aid", "nav_aid", "d_aid"], ["scholarships", "nav_sch", "d_sch"]] },
  { tab: "forum" },
];
const TAB_ORDER = ["home", "plan", "apps", "match", "essays", "recs", "volunteer", "aid", "scholarships", "forum", "account"];
const groupOf = tab => NAV.find(n => n.items && n.items.some(i => i[0] === tab));
const tabLabel = k => t(TABS.find(x => x[0] === k)[1]);
function vHeader() {
  const displayName = USER ? (USER.name || USER.email) : t("guest");
  const tourTab = UI.tour !== null ? TOUR[UI.tour].tab : null;
  const navActive = UI.tab !== "account";
  const tourGroup = tourTab ? (groupOf(tourTab) || {}).group : null;
  const ind = UI.ind ? `left:${UI.ind.l}px;top:${UI.ind.t}px;width:${UI.ind.w}px;height:${UI.ind.h}px;opacity:${navActive ? 1 : 0}` : "opacity:0";
  const chevron = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
  return `<header class="top">
    <div class="bar1">
      <button class="brand" data-action="tab" data-tab="home" aria-label="Ascent home">
        <span class="logo"><svg width="34" height="34" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#14213D"/><path d="M3 38 15 24l6 6 8-10 16 18z" fill="#5B7DB1"/><path d="M9 38 25 14l16 24z" fill="#E9A23B"/><path d="M25 14l4.7 7-2.6-1.2-2.1 2-2.3-1.9-2.4 1.1z" fill="#fff"/><path d="M25 14V6.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><path d="M25 6.5l6 2.2-6 2.3z" fill="#fff"/></svg></span>
        <span class="wordmark">Ascent</span>
      </button>
      <nav class="tabs ${UI.ind ? "ind-ready" : ""} ${UI.navScroll ? "scrolls" : ""}" aria-label="Main">
        <span class="tab-ind" style="${ind}"></span>
        ${NAV.map(n => n.tab
          ? `<button class="${UI.tab === n.tab ? "on" : ""} ${tourTab === n.tab ? "pulse" : ""}" data-action="tab" data-tab="${n.tab}">${t(TABS.find(x => x[0] === n.tab)[1])}</button>`
          : `<button class="grp ${groupOf(UI.tab) === n ? "on" : ""} ${tourGroup === n.group ? "pulse" : ""}" data-action="toggleGroup" data-val="${n.group}" aria-haspopup="menu" aria-expanded="${UI.openGroup === n.group ? "true" : "false"}">${t(n.label)}${chevron}</button>`).join("")}
      </nav>
      <div class="tools">
        <label class="langpick" title="${t("language")}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>
          <span>${LANG.toUpperCase()}</span>
          <select data-bind="lang||lang" aria-label="${t("language")}">
            ${Object.entries(LANG_NAMES).map(([k, v]) => `<option value="${k}" ${k === LANG ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </label>
        <button class="iconbtn" data-action="tour" title="${t("cta_tour")}" aria-label="${t("cta_tour")}">?</button>
        <button class="who-btn ${UI.tab === "account" ? "on" : ""} ${tourTab === "account" ? "pulse" : ""}" data-action="tab" data-tab="account" title="${t("nav_account")}" aria-label="${t("nav_account")}"><span class="avatar">${esc(displayName.slice(0, 1).toUpperCase())}</span><span class="nm">${esc(displayName)}</span></button>
      </div>
    </div>
    ${UI.openGroup ? (() => { const g = NAV.find(n => n.group === UI.openGroup); return `<div class="nav-menu" role="menu" style="${UI.menuXY ? `left:${UI.menuXY.x}px;top:${UI.menuXY.y}px` : "visibility:hidden"}">
      ${g.items.map(([tab, lk, dk, view]) => { const on = UI.tab === tab && (!view || (UI.collegeView || "us") === view);
        return `<button role="menuitem" class="${on ? "on" : ""}" data-action="tab" data-tab="${tab}" ${view ? `data-view="${view}"` : ""}><b>${t(lk)}</b><span>${t(dk)}</span></button>`; }).join("")}
    </div>`; })() : ""}
  </header>`;
}

/* ---------- HOME ---------- */
function vHome() {
  const items = buildTimeline(S).map(i => ({ ...i, st: statusOf(i) }));
  const next = items.find(i => i.date && i.st !== "done" && daysUntil(i.date) >= 0);
  const doneCount = items.filter(i => i.st === "done").length;
  const pct = items.length ? Math.round(doneCount / items.length * 100) : 0;
  const steps = [
    [!!USER, "Create your free account", "So your plan is saved and you can join the community.", "account", "Create account"],
    [S.plan.length > 0, "Add your first step", "Put a deadline or task on your plan.", "plan", "Open my plan"],
    [S.schools.length > 0, "Find colleges that fit you", "Enter your GPA, scores, and major, then add colleges to your applications.", "match", "Find colleges"],
  ];
  return `
  <section class="home-hero">
    <div>
      <h1>${t("hero_title")}</h1>
      <p>${t("hero_text")}</p>
      <div class="row">
        <button class="btn gold" data-action="tab" data-tab="plan">${t("cta_plan")}</button>
        <button class="btn" data-action="tab" data-tab="match">${t("cta_match")}</button>
      </div>
    </div>
    <div class="countdown">
      ${next ? `<div class="lbl">${t("next_up")}</div>
        <div class="num">${daysUntil(next.date)}</div><div class="lbl">${t("days_left")}</div>
        <h3>${esc(next.title)}</h3>
        <div class="lbl" style="margin-top:4px">${fmt(next.date)}</div>
        <div class="meter"><i style="width:${pct}%"></i></div>
        <div class="lbl" style="margin-top:6px" dir="ltr">${doneCount} / ${items.length}</div>`
      : items.length ? `<div class="num">✓</div><h3>No upcoming dates</h3><div class="lbl" style="margin-top:6px">Add dates to your steps to see a countdown here.</div>`
      : `<div class="lbl">${t("nav_plan")}</div><h3 style="margin:10px 0 16px">Your plan is empty. Add your first step and its date to start a countdown.</h3>
         <button class="btn gold" data-action="tab" data-tab="plan">Add a step</button>`}
    </div>
  </section>
  <h2 style="font-size:22px;margin:0 0 12px">Start your climb</h2>
  <section class="start">
    ${steps.map(([done, title, text, tab, label], i) => `<div class="start-step ${done ? "done" : ""}">
      <span class="start-num">${done ? "✓" : i + 1}</span>
      <div style="flex:1"><b>${title}</b><div class="note">${text}</div></div>
      ${done ? "" : `<button class="btn sm ${i === steps.findIndex(s => !s[0]) ? "gold" : "ghost"}" data-action="tab" data-tab="${tab}">${label}</button>`}
    </div>`).join("")}
  </section>
  ${S.schools.length ? `<div style="max-width:760px;margin-top:14px">${appsBar()}</div>` : ""}`;
}

/* ---------- MY PLAN ---------- */
const catSelect = (bind, cur) => `<select data-bind="${bind}">${Object.entries(PLAN_CATS).map(([k, v]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${v}</option>`).join("")}</select>`;
const FROM_TAB = { apps: "nav_apps", match: "nav_match", essays: "nav_essays", recs: "nav_recs", scholarships: "nav_sch" };

function vPlan() {
  const items = buildTimeline(S).map(i => ({ ...i, st: statusOf(i) }));
  const next = items.find(i => i.date && i.st !== "done" && daysUntil(i.date) >= 0);
  const overdue = items.filter(i => i.st === "overdue").length;
  const doneCount = items.filter(i => i.st === "done").length;
  const pct = items.length ? Math.round(doneCount / items.length * 100) : 0;
  let vis = items;
  if (UI.hideDone) vis = vis.filter(i => i.st !== "done");
  if (!UI.showPast) vis = vis.filter(i => !i.date || daysUntil(i.date) >= 0 || i.st === "overdue");
  const tday = iso(today());
  const nowRow = `<div class="now"><span>${t("today")}, ${fmt(tday)}</span></div>`;
  let placed = false, last = "", rows = "";
  vis.forEach(i => {
    if (i.date && !placed && i.date >= tday) { rows += nowRow; placed = true; }
    if (!i.date && !placed && vis.some(x => x.date)) { rows += nowRow; placed = true; }
    const grp = i.date ? monthOf(i.date) : "No date yet";
    if (grp !== last) { rows += `<div class="phase">${grp}</div>`; last = grp; }
    const n = i.date ? daysUntil(i.date) : null;
    const editing = i.own && UI.editStep === i.id;
    rows += `<div class="item ${i.st}" style="--cat:${CAT_COLOR[i.cat] || CAT_COLOR.other}">
      <input type="checkbox" data-done="${i.id}" ${i.done ? "checked" : ""} ${i.derived ? 'disabled title="This is marked done from its own tab"' : ""} aria-label="Mark done" style="margin-top:4px">
      <div>
        ${editing ? `<div class="grid g2" style="gap:8px">
            ${field("Step", inp(`plan|${i.id}|title`, i.title))}
            ${field("Date (optional)", inp(`plan|${i.id}|date`, i.date, "date"))}
            ${field("Category", catSelect(`plan|${i.id}|cat`, i.cat))}
            ${field("Notes (optional)", inp(`plan|${i.id}|notes`, i.detail))}
          </div>
          <button class="btn sm" style="margin-top:8px" data-action="editStep" data-id="">Done editing</button>`
        : `<div class="t">${esc(i.title)}</div>${i.detail ? `<div class="d">${esc(i.detail)}</div>` : ""}
          <div class="d">${i.from ? `<button class="linkbtn" data-action="tab" data-tab="${i.from}">From ${t(FROM_TAB[i.from])}</button>` : esc(PLAN_CATS[i.cat] || "Other")}</div>`}
      </div>
      <div class="when">${i.date ? fmt(i.date) : ""}<br><span style="display:inline-block;margin-top:4px">${pill(i.st)}</span>
        ${i.st !== "done" && n !== null && n >= 0 ? `<div>${n === 0 ? "today" : `in ${n} day${n === 1 ? "" : "s"}`}</div>` : ""}
        ${i.own && !editing ? `<div class="row" style="justify-content:flex-end;gap:4px;margin-top:6px">
          <button class="btn sm ghost" data-action="editStep" data-id="${i.id}">Edit</button>
          <button class="btn sm ghost" data-action="remove" data-coll="plan" data-id="${i.id}" aria-label="Delete step">Delete</button></div>` : ""}
      </div></div>`;
  });
  if (!placed && vis.length) rows += nowRow;
  const ns = UI.newStep;
  return `<h2>${t("nav_plan")}</h2><p class="lede">${t("d_plan")}</p>
    ${next ? `<div class="hero"><div class="days">${daysUntil(next.date)}<small>${t("days_left")}</small></div>
      <div><h3>${t("next_up")}: ${esc(next.title)}</h3>
      <p>Due ${fmt(next.date)}. ${overdue ? `You have ${overdue} overdue step${overdue > 1 ? "s" : ""} to catch up on.` : "Nothing is overdue."}</p>
      <div style="margin-top:14px;max-width:360px"><div class="meter"><i style="width:${pct}%"></i></div>
      <div style="font-size:13px;color:#A9BCD3;margin-top:5px">${doneCount} of ${items.length} steps finished</div></div></div></div>` : ""}
    <div class="panel">
      <h3 style="margin-bottom:10px">Add a step</h3>
      <div class="grid" style="grid-template-columns:2fr 1fr 1fr 2fr auto;align-items:end">
        ${field("What do you need to do?", inp("ns||title", ns.title, "text", 'placeholder="Example: Register for the December SAT"'))}
        ${field("Date (optional)", inp("ns||date", ns.date, "date"))}
        ${field("Category", catSelect("ns||cat", ns.cat))}
        ${field("Notes (optional)", inp("ns||notes", ns.notes))}
        <button class="btn gold" data-action="addStep">${t("add")}</button>
      </div>
      ${UI.stepErr ? `<p class="err">${UI.stepErr}</p>` : ""}
      <button class="linkbtn" data-action="toggleIdeas" style="margin-top:12px">${UI.ideasOpen ? "▾" : "▸"} Need ideas? Common steps for college applicants</button>
      ${UI.ideasOpen ? `<div class="row" style="margin-top:10px;gap:6px">${PLAN_IDEAS.map(([title], k) => {
          const has = S.plan.some(p => p.title === title);
          return `<button class="btn sm ${has ? "" : "ghost"}" data-action="addIdea" data-id="${k}" ${has ? "disabled" : ""}>${has ? "✓ " : "+ "}${esc(title)}</button>`; }).join("")}</div>
        <p class="note" style="margin:8px 0 0">These only go on your plan if you add them. Then click Edit to give each one a date.</p>` : ""}
    </div>
    <div class="row" style="margin-bottom:6px">
      <label class="inline">${chk("data||showLinked", S.showLinked)} Show deadlines from my other tabs</label>
      <label class="inline">${chk("ui||hideDone", UI.hideDone)} Hide finished</label>
      <label class="inline">${chk("ui||showPast", UI.showPast)} Show past steps</label>
    </div>
    ${vis.length ? `<div class="rail">${rows}</div>`
      : `<div class="panel" style="text-align:center;padding:34px 20px"><h3>${items.length ? "Nothing to show with these filters" : "Your plan is empty"}</h3>
         <p class="note" style="margin:6px 0 0">${items.length ? "Turn the filters above back on to see your steps." : "Add your first step above. Deadlines you enter for colleges, essays, letters, and scholarships can show up here too."}</p></div>`}`;
}

function addStep() {
  const ns = UI.newStep;
  UI.stepErr = "";
  if (!ns.title.trim()) { UI.stepErr = "Type what you need to do."; render(); return; }
  S.plan.push({ id: uid(), title: ns.title.trim(), date: ns.date, cat: ns.cat, notes: ns.notes.trim(), done: false });
  UI.newStep = { title: "", date: "", cat: ns.cat, notes: "" };
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  save(); toast("Step added");
}

/* ---------- FIND COLLEGES ---------- */
// Family income brackets used by the federal College Scorecard for net price.
const INCOME_OPTIONS = ["Not sure", "$0–$30,000", "$30,001–$48,000", "$48,001–$75,000", "$75,001–$110,000", "Over $110,000"];
const INCOME_SHORT = ["under $30k", "$30k–$48k", "$48k–$75k", "$75k–$110k", "over $110k"];
const incomeBracket = income => INCOME_OPTIONS.indexOf(income) - 1;   // -1 means "Not sure"
// Net price for the chosen bracket; falls back to the average net price if not reported.
const priceFor = (c, b) => (b >= 0 && c.netBy[b] != null ? c.netBy[b] : c.net);
const MAX_NET = { "Any": Infinity, "$10,000 or less": 10000, "$15,000 or less": 15000, "$20,000 or less": 20000, "$30,000 or less": 30000 };
function matchPool(st) {
  const f = UI.match, home = (S.profile.state || "").toUpperCase(), max = MAX_NET[f.maxNet] ?? Infinity;
  const bracket = incomeBracket(f.income);
  return COLLEGES.filter(c => {
    if (!offersMajor(c, st.cip)) return false;
    if (f.level === "4-year colleges" && c.lvl !== 4) return false;
    if (f.level === "2-year colleges" && c.lvl !== 2) return false;
    if (c.ctrl === 2 && !f.forProfit) return false;
    if (f.control === "Public" && c.ctrl !== 0) return false;
    if (f.control === "Private nonprofit" && c.ctrl !== 1) return false;
    if (f.homeOnly && home && c.st !== home) return false;
    if (f.region !== "Any region" && c.region !== f.region) return false;
    if (f.hbcu && !c.hbcu) return false;
    const n = c.size || 0;
    if (f.size === "Small (under 5,000)" && n >= 5000) return false;
    if (f.size === "Medium (5,000–15,000)" && (n < 5000 || n > 15000)) return false;
    if (f.size === "Large (over 15,000)" && n <= 15000) return false;
    if (f.setting !== "Any setting" && LOCALE_NAME[c.loc] !== f.setting) return false;
    const price = priceFor(c, bracket);
    if (price != null && price > max) return false;
    return true;
  });
}
function suggestList(st) {
  const home = (S.profile.state || "").toUpperCase(), region = REGION_OF[home];
  const groups = { reach: [], match: [], likely: [], far: [], nodata: [] };
  const pool = matchPool(st);
  pool.forEach(c => {
    const ch = chanceFor(c, st);
    // Rank by graduation rate, home-state/region fit, and (when a major is picked) how popular
    // that major is there. Specialized, very small, and service-academy colleges are ranked
    // lower but still included, so every college in "Search every college" appears here too.
    const majorShare = st.cip ? (c.share[st.cip] || 0) : 0;
    const special = SERVICE_ACADEMY.test(c.name) || SPECIAL_FOCUS.test(c.name) || (c.size || 0) < 1000;
    const score = (c.grad ?? 40) / 25 + (home && c.st === home ? (c.ctrl === 0 ? 1.2 : 0.5) : region && c.region === region ? 0.3 : 0)
      + (c.ivy ? 0.6 : 0) + (ch ? ch.p : 0) + (st.cip ? Math.min(2, Math.log2(1 + majorShare) / 2.5) : 0) - (special ? 3 : 0);
    groups[ch ? tierOf(c, ch) : "nodata"].push({ c, ch, score });
  });
  Object.values(groups).forEach(g => g.sort((a, b) => b.score - a.score));
  groups.far.sort((a, b) => b.ch.p - a.ch.p || b.score - a.score);
  return { ...groups, total: pool.length };
}
const linkOut = (href, text) => `<a class="note" href="${esc(href)}" target="_blank" rel="noopener">${text}</a>`;

function collegeCard(c, st) {
  const ch = chanceFor(c, st), tier = tierOf(c, ch);
  const added = S.schools.some(s => s.cid === c.id);
  const youTest = st.raw ? ` (you: ${esc(st.raw)})` : "";
  const share = st.cip ? c.share[st.cip] : null;
  const facts = [
    c.ar != null ? `Admit rate <b>${c.ar}%</b>` : (ch && ch.open ? "<b>Open admission</b>" : "Admit rate not reported"),
    c.satLo ? `SAT middle 50% <b>${c.satLo}–${c.satHi}</b>${youTest}` : c.actLo ? `ACT middle 50% <b>${c.actLo}–${c.actHi}</b>${youTest}` : "",
    c.test ? `${TEST_POLICY[c.test]} (fall 2024 policy; some colleges have changed since, so check)` : "",
    c.net != null ? `Average net price <b>${netText(c.net)}</b>/yr` : "",
    (() => { const b = incomeBracket(UI.match.income), k = b >= 0 ? b : 0;
      return c.netBy[k] != null ? `Families earning ${INCOME_SHORT[k]} pay <b>${netText(c.netBy[k])}</b>/yr on average` : (b >= 0 ? `Net price for families earning ${INCOME_SHORT[k]} not reported` : ""); })(),
    c.grad != null ? `Graduation rate <b>${c.grad}%</b>` : "",
    st.cip ? (share ? `<b>${share}%</b> of graduates major in ${esc(st.major.toLowerCase())}` : `Offers ${esc(st.major.toLowerCase())}`) : "",
  ].filter(Boolean);
  return `<div class="match">
    <div class="row" style="gap:6px"><h3 style="flex:1;min-width:180px">${esc(c.name)}</h3>
      ${c.ivy ? `<span class="tag t-ivy">Ivy League</span>` : ""}${c.hbcu ? `<span class="tag t-match">HBCU</span>` : ""}${tier ? `<span class="tag t-${tier}">${TIER_LABEL[tier]}</span>` : ""}</div>
    <div class="note">${esc(c.city)}, ${c.st}. ${CONTROL_NAME[c.ctrl]}, ${c.lvl === 4 ? "4-year" : "2-year"}${LOCALE_NAME[c.loc] ? ", " + LOCALE_NAME[c.loc].toLowerCase() : ""}${c.size ? `, ${c.size.toLocaleString()} undergrads` : ""}</div>
    ${ch ? `<div class="chance"><div><span class="note">${st.gpa != null ? "Your estimated chance" : "Admit rate"}</span><b>${st.gpa != null ? pctText(ch.p) : c.ar != null ? c.ar + "%" : "Open"}</b></div>
      <div class="meter" style="flex:1"><i style="width:${Math.round((st.gpa != null ? ch.p : (c.ar ?? 100) / 100) * 100)}%;background:var(--${tier === "likely" ? "sage" : tier === "match" ? "gold" : "brick"})"></i></div></div>` : ""}
    <div class="facts">${facts.map(x => `<span>${x}</span>`).join("")}</div>
    <div class="row">
      <button class="btn sm" data-action="addCollege" data-id="${c.id}" ${added ? "disabled" : ""}>${added ? "In my applications" : "Add to my applications"}</button>
      ${c.url ? linkOut(c.url, "College website") : ""} ${linkOut(scorecardUrl(c.id), "College Scorecard")}
    </div>
  </div>`;
}

function vMatch() {
  const s = S.stats, f = UI.match, st = studentStats();
  const statsErr = s.gpa !== "" && (num(s.gpa) <= 0 || num(s.gpa) > 4) ? "Enter an unweighted GPA between 0.00 and 4.00."
    : s.testType === "SAT" && s.score !== "" && (num(s.score) < 400 || num(s.score) > 1600) ? "SAT scores go from 400 to 1600."
    : s.testType === "ACT" && s.score !== "" && (num(s.score) < 1 || num(s.score) > 36) ? "ACT scores go from 1 to 36." : "";
  const toggle = `<div class="seg" role="tablist">
      <button class="${UI.collegeView !== "intl" ? "on" : ""}" data-action="collegeView" data-val="us">U.S. colleges</button>
      <button class="${UI.collegeView === "intl" ? "on" : ""}" data-action="collegeView" data-val="intl">Top international universities</button></div>`;
  if (UI.collegeView === "intl") return `<h2>${t("nav_match")}</h2>${toggle}${appsBar()}${vIntl()}${vSources()}`;

  const sug = UI.showMatches && st.gpa != null && !statsErr ? suggestList(st) : null;
  const group = (key, title, note, first) => {
    const arr = sug[key]; if (!arr.length) return "";
    const shown = Math.min(arr.length, UI.expand[key] || first);
    return `<div class="row" style="margin:22px 0 4px"><h3 style="flex:1">${title} <span class="note" style="font-weight:400">(${arr.length.toLocaleString()} colleges)</span></h3></div>
      <p class="note" style="margin:0 0 10px">${note}</p>
      ${shown ? `<div class="grid g2">${arr.slice(0, shown).map(x => collegeCard(x.c, st)).join("")}</div>` : ""}
      <div class="row" style="margin-top:10px">
        ${shown < arr.length ? `<button class="btn sm ghost" data-action="more" data-val="${key}">Show ${Math.min(20, arr.length - shown)} more</button>
          <span class="note">Showing ${shown} of ${arr.length.toLocaleString()}</span>` : arr.length > first ? `<span class="note">Showing all ${arr.length.toLocaleString()}</span>` : ""}
        ${shown > first ? `<button class="linkbtn note" data-action="less" data-val="${key}">Show fewer</button>` : ""}
      </div>`;
  };

  const q = UI.q.trim();
  let list = q ? COLLEGES.filter(c => norm(c.name).includes(norm(q)) || norm(c.city) === norm(q) || c.st === q.toUpperCase()) : matchPool(st);
  list = list.map(c => ({ c, ch: chanceFor(c, st) }));
  const sorters = {
    "Your chance (high to low)": (a, b) => (b.ch?.p ?? -1) - (a.ch?.p ?? -1),
    "Admit rate (low to high)": (a, b) => (a.c.ar ?? 999) - (b.c.ar ?? 999),
    "Net price (low to high)": (a, b) => (a.c.net ?? 1e9) - (b.c.net ?? 1e9),
    "Graduation rate (high to low)": (a, b) => (b.c.grad ?? -1) - (a.c.grad ?? -1),
    "Size of my major (high to low)": (a, b) => (b.c.share[st.cip] ?? -1) - (a.c.share[st.cip] ?? -1),
    "Name (A to Z)": (a, b) => a.c.name.localeCompare(b.c.name),
  };
  list.sort(sorters[UI.sort] || sorters["Name (A to Z)"]);
  const per = 20, pages = Math.max(1, Math.ceil(list.length / per)), page = Math.min(UI.page, pages - 1);
  const browseRows = list.slice(page * per, page * per + per).map(({ c, ch }) => {
    const tier = tierOf(c, ch), added = S.schools.some(x => x.cid === c.id);
    return `<tr>
      <td><b>${esc(c.name)}</b>${c.ivy ? ` <span class="tag t-ivy">Ivy</span>` : ""}<div class="note">${esc(c.city)}, ${c.st}. ${CONTROL_NAME[c.ctrl]}, ${c.lvl === 4 ? "4-year" : "2-year"}</div></td>
      <td>${c.ar != null ? c.ar + "%" : ch && ch.open ? "Open" : "—"}</td>
      <td>${c.satLo ? `${c.satLo}–${c.satHi}` : c.actLo ? `ACT ${c.actLo}–${c.actHi}` : "—"}</td>
      <td>${ch && st.gpa != null ? `<b>${pctText(ch.p)}</b> <span class="tag t-${tier}">${TIER_LABEL[tier]}</span>` : "—"}</td>
      <td>${c.net != null ? netText(c.net) : "—"}</td>
      <td>${c.grad != null ? c.grad + "%" : "—"}</td>
      ${st.cip ? `<td>${offersMajor(c, st.cip) ? (c.share[st.cip] ? c.share[st.cip] + "%" : "Offered") : "Not offered"}</td>` : ""}
      <td style="white-space:nowrap"><button class="btn sm" data-action="addCollege" data-id="${c.id}" ${added ? "disabled" : ""}>${added ? "Added" : "Add"}</button>
        ${c.url ? linkOut(c.url, "Website") : ""}</td></tr>`;
  }).join("");

  return `<h2>${t("nav_match")}</h2>${toggle}${appsBar()}
  <p class="lede">Enter your exact GPA, test score, and major. Every currently operating U.S. college, ${COLLEGES.length.toLocaleString()} in all, gets an estimated chance of admission based on those numbers.</p>
  <div class="panel">
    <h3 style="margin-bottom:10px">Your numbers</h3>
    <div class="grid g4">
      ${field("Unweighted GPA (4.0 scale)", inp("stats||gpa", s.gpa, "number", 'step="0.01" min="0" max="4" placeholder="3.72"'))}
      ${field("Test", sel("stats||testType", ["SAT", "ACT", "No test score"], s.testType))}
      ${field("Score", inp("stats||score", s.score, "number", `placeholder="${s.testType === "ACT" ? "27" : "1310"}" ${s.testType === "No test score" ? "disabled" : ""}`))}
      ${field("Intended major", sel("stats||major", MAJORS.map(m => m[0]), st.major))}
      ${field("Home state", `<select data-bind="profile||state">${STATES.map(x => `<option ${x === S.profile.state ? "selected" : ""}>${x}</option>`).join("")}</select>`)}
      ${field("Family income (for net price)", sel("match||income", INCOME_OPTIONS, f.income))}
    </div>
    ${st.cip ? `<p class="note" style="margin:10px 0 0">Showing only colleges that offer a ${f.level === "2-year colleges" ? "degree" : "bachelor's degree"} in ${esc(st.major.toLowerCase())}, and favoring colleges where it's a popular major. Majors are grouped by federal field, so check that the college has your exact program.</p>` : ""}
    ${statsErr ? `<p class="err">${statsErr}</p>` : ""}
    <button class="linkbtn" data-action="toggleFilters" style="margin-top:14px;font-weight:700;font-size:15px">${UI.filtersOpen ? "▾" : "▸"} More preferences (optional)</button>
    ${UI.filtersOpen ? `<div class="grid g4" style="margin-top:10px">
        ${field("Type of college", sel("match||level", ["4-year colleges", "2-year colleges", "Both"], f.level))}
        ${field("Public or private", sel("match||control", ["Any", "Public", "Private nonprofit"], f.control))}
        ${field("Region", sel("match||region", ["Any region", "Northeast", "Southeast", "Midwest", "Southwest", "West"], f.region))}
        ${field("Most my family can pay per year (net price)", sel("match||maxNet", Object.keys(MAX_NET), f.maxNet))}
        ${field("Size", sel("match||size", ["Any size", "Small (under 5,000)", "Medium (5,000–15,000)", "Large (over 15,000)"], f.size))}
        ${field("Setting", sel("match||setting", ["Any setting", "City", "Suburb", "Town", "Rural"], f.setting))}
        <label class="inline" style="align-self:end">${chk("match||homeOnly", f.homeOnly)} Only my home state</label>
        <label class="inline" style="align-self:end">${chk("match||hbcu", f.hbcu)} Only HBCUs</label>
        <label class="inline" style="align-self:end">${chk("match||forProfit", f.forProfit)} Include for-profit colleges</label>
      </div>` : ""}
    <div class="row" style="margin-top:14px">
      <button class="btn gold" data-action="runMatch">${t("find_btn")}</button>
      ${UI.matchErr ? `<span class="err">${UI.matchErr}</span>` : ""}
    </div>
  </div>

  ${UI.showMatches && st.gpa == null ? `<div class="warn" style="margin-bottom:18px">Enter your GPA first. Your test score is optional.</div>` : ""}
  ${sug ? `<div class="row" id="sugTop"><h2 style="font-size:24px;flex:1">Your matches</h2><span class="note">Using GPA ${st.gpa.toFixed(2)}${st.raw ? ` and ${esc(st.raw)}` : ", no test score"}${st.cip ? `, major: ${esc(st.major)}` : ""}. All ${sug.total.toLocaleString()} colleges that fit your choices are sorted into the groups below, the same colleges listed in "Search every college." The best fits come first in each group.</span></div>
    ${group("reach", "Reach", "Your chance is under about 35%, or the college admits fewer than 15% of applicants. Apply to a few.", 3)}
    ${group("match", "Target", "Your numbers are close to typical admitted students. Most of your list should be here.", 4)}
    ${group("likely", "Likely", "You have a strong chance. Make sure you'd be happy there and can afford it.", 3)}
    ${group("far", "Far reach", "Your estimated chance is under 10%. Worth it only if you love the college.", 0)}
    ${group("nodata", "No admissions data reported", "These colleges didn't report an admit rate to the government, so there's no chance estimate. Contact them directly.", 0)}
    ${!sug.total ? `<div class="warn">No colleges fit these choices. Try loosening your preferences or picking "Undecided" for major.</div>` : ""}` : ""}

  <div class="panel scroll" style="margin-top:22px">
    <div class="row" style="margin-bottom:10px">
      <h3 style="flex:1">Search every college</h3>
      <div style="width:min(340px,100%)">${inp("ui||q", UI.q, "search", 'placeholder="Name, city, or state (example: Cornell, Bronx, TX)"')}</div>
      <div style="width:240px">${sel("ui||sort", Object.keys(sorters).filter(k => st.cip || !k.startsWith("Size")), UI.sort)}</div>
    </div>
    <p class="note" style="margin:0 0 8px">${list.length.toLocaleString()} colleges${q ? "" : " that fit your choices"}. ${st.gpa == null ? "Enter your GPA above to see your chance at each one." : ""}</p>
    <table><thead><tr><th>College</th><th>Admit rate</th><th>SAT middle 50%</th><th>Your chance</th><th>Avg net price</th><th>Grad rate</th>${st.cip ? "<th>Your major</th>" : ""}<th></th></tr></thead>
    <tbody>${browseRows || `<tr><td colspan="8" class="note">No colleges found. Check the spelling, or search part of the name (for example "Michigan").</td></tr>`}</tbody></table>
    ${pages > 1 ? `<div class="row" style="margin-top:10px;justify-content:center">
      <button class="btn sm ghost" data-action="page" data-val="-1" ${page === 0 ? "disabled" : ""}>Previous</button>
      <span class="note">Page ${page + 1} of ${pages}</span>
      <button class="btn sm ghost" data-action="page" data-val="1" ${page >= pages - 1 ? "disabled" : ""}>Next</button></div>` : ""}
  </div>
  ${vSources()}`;
}

function vIntl() {
  const countries = ["All countries", ...[...new Set(INTL.map(u => u.country))].sort()];
  const list = INTL.filter(u => UI.intlCountry === "All countries" || u.country === UI.intlCountry)
    .filter(u => !UI.intlEnglish || ENGLISH_TAUGHT.includes(u.country) || u.country === "Saudi Arabia");
  return `<p class="lede">Every university outside the U.S. in the QS World University Rankings 2027 top 100. Admissions work differently in each country, so there's no chance estimate here. Check each university's requirements for U.S. applicants.</p>
  <div class="panel row">
    <div style="width:220px">${field("Country", sel("ui||intlCountry", countries, UI.intlCountry))}</div>
    <label class="inline" style="align-self:end">${chk("ui||intlEnglish", UI.intlEnglish)} Only countries where teaching is in English</label>
    <span class="note" style="align-self:end;margin-inline-start:auto">${list.length} universities</span>
  </div>
  <div class="grid g2">${list.map(u => {
    const added = S.schools.some(s => s.intl === u.i);
    return `<div class="match">
      <div class="row" style="gap:6px"><h3 style="flex:1;min-width:180px">${esc(u.name)}</h3><span class="tag t-ivy">QS #${u.rank.replace("=", "")}${u.rank.startsWith("=") ? " (tie)" : ""}</span></div>
      <div class="note">${esc(u.city)}, ${esc(u.country)}</div>
      <div class="facts" style="margin-top:8px;display:block"><p style="margin:0 0 4px">${langNote(u)}</p><p style="margin:0">${howToApply(u)}</p></div>
      <div class="row"><button class="btn sm" data-action="addIntl" data-id="${u.i}" ${added ? "disabled" : ""}>${added ? "In my applications" : "Add to my applications"}</button>${linkOut(u.url, "University website")}</div>
    </div>`; }).join("")}</div>
  <div class="warn" style="margin:14px 0 22px">Federal Pell Grants can't be used at universities outside the U.S. Some foreign universities accept U.S. federal student loans, and most have their own scholarships for international students. Check each university's fees and aid pages.</div>`;
}

function vSources() {
  return `<div class="panel" style="margin-top:18px"><button class="linkbtn" style="font-weight:700" data-action="toggleSources">${UI.sourcesOpen ? "▾" : "▸"} Where this information comes from</button>
    ${UI.sourcesOpen ? `
    <ul class="note" style="margin:10px 0 0;padding-inline-start:18px;line-height:1.7">
      <li>U.S. colleges: U.S. Department of Education, <a href="https://collegescorecard.ed.gov/data/" target="_blank" rel="noopener">College Scorecard</a>, data released June 10, 2026. Admit rates, SAT/ACT ranges, test policies, net prices, graduation rates, and undergraduate counts are from the fall 2024 admissions year. Websites and majors offered are from the 2025–26 file. Copied from the public-domain <a href="https://github.com/gadenbuie/scorecard-db" target="_blank" rel="noopener">scorecard-db</a> project.</li>
      <li>Federal numbers can differ slightly from a college's own press release because of how the government counts applicants.</li>
      <li>Graduation rate: share of first-time, full-time students who finished within 6 years (4-year colleges) or 3 years (2-year colleges).</li>
      <li>Majors: federal records of which broad fields each college awards degrees in, and what share of its bachelor's degrees each field makes up.</li>
      <li>International universities: <a href="https://www.topuniversities.com/qs-top-uni-wur" target="_blank" rel="noopener">QS World University Rankings 2027</a>, published June 2026.</li>
      <li>Your chance: an estimate made by this site from the college's admit rate and the middle 50% of admitted students' SAT/ACT scores. Federal data doesn't include GPAs, so the GPA part is estimated. Essays, activities, and recommendations matter too.</li>
    </ul>` : ""}</div>`;
}

/* ---------- MY APPLICATIONS ---------- */
function appsBar() {
  const n = S.schools.length, sub = S.schools.filter(s => APP_DONE.includes(s.status)).length;
  return `<div class="appsbar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/></svg>
    <span style="flex:1"><b>${t("nav_apps")}:</b> ${n ? `${n} ${n === 1 ? "college" : "colleges"}, ${sub} submitted` : "none yet. Add colleges below."}</span>
    <button class="btn sm" data-action="tab" data-tab="apps">Open ${t("nav_apps")}</button></div>`;
}
function vApps() {
  const st = studentStats();
  const upcoming = S.schools.filter(s => s.appDeadline && !APP_DONE.includes(s.status) && daysUntil(s.appDeadline) >= 0).sort((a, b) => a.appDeadline.localeCompare(b.appDeadline));
  const next = upcoming[0];
  return `<h2>${t("nav_apps")}</h2><p class="lede">${t("d_apps")}</p>
    <div class="grid g4" style="margin-bottom:18px">
      <div class="panel stat"><b>${S.schools.length}</b><span>Colleges on my list</span></div>
      <div class="panel stat"><b>${S.schools.filter(s => APP_DONE.includes(s.status)).length}</b><span>Submitted</span></div>
      <div class="panel stat"><b style="color:var(--sage)">${S.schools.filter(s => s.status === "Accepted").length}</b><span>Accepted</span></div>
      <div class="panel stat"><b>${next ? daysUntil(next.appDeadline) : "—"}</b><span>${next ? `Days until ${esc(next.name || "next deadline")} is due` : "No upcoming deadlines entered"}</span></div>
    </div>
    ${vApplications(st)}
    <div class="row"><button class="btn gold" data-action="tab" data-tab="match">Find colleges to add</button>
      ${st.gpa == null && S.schools.length ? `<span class="note">Enter your GPA in ${t("nav_match")} to see your chance at each college.</span>` : ""}</div>`;
}

function appWarnings() {
  const plans = S.schools.map(s => APP_PLAN_SHORT[s.plan] || s.plan);
  const w = [];
  if (plans.filter(p => p === "ED").length > 1) w.push("You can apply Early Decision to only one college. ED is binding: if you're admitted, you must attend and withdraw your other applications.");
  if (plans.includes("REA") && plans.includes("ED")) w.push("Restrictive Early Action (REA/SCEA) colleges usually don't let you apply Early Decision anywhere else.");
  if (plans.filter(p => p === "REA").length > 1) w.push("You can usually apply Restrictive Early Action to only one college.");
  if (plans.includes("REA") && S.schools.some(s => APP_PLAN_SHORT[s.plan] === "EA" && (COLLEGE_BY_ID.get(s.cid)?.ctrl === 1)))
    w.push("Restrictive Early Action usually doesn't allow early applications to other private colleges. Public colleges are often allowed. Check each college's rules.");
  if (plans.includes("ED") || plans.includes("ED II")) w.push("Before applying Early Decision, run that college's net price calculator with your family. You can't compare aid offers once you're bound.");
  return w;
}
function vApplications(st) {
  const rows = S.schools.map(s => {
    const c = s.cid ? COLLEGE_BY_ID.get(s.cid) : null, u = s.intl != null ? INTL[s.intl] : null;
    const ch = c ? chanceFor(c, st) : null, tier = c ? tierOf(c, ch) : null;
    const done = APP_CHECKS.filter(([k]) => s[k]).length;
    const open = UI.openApp === s.id;
    const site = c ? c.url : u ? u.url : null;
    return `<tr>
      <td style="min-width:200px">${c ? `<b>${esc(c.name)}</b><div class="note">${esc(c.city)}, ${c.st}. Admit rate ${c.ar != null ? c.ar + "%" : "not reported"}</div>`
        : u ? `<b>${esc(u.name)}</b><div class="note">${esc(u.city)}, ${esc(u.country)}. QS #${u.rank.replace("=", "")}</div>`
        : inp(`schools|${s.id}|name`, s.name, "text", 'placeholder="College name"')}</td>
      <td>${ch && st.gpa != null ? `<b>${pctText(ch.p)}</b><div><span class="tag t-${tier}">${TIER_LABEL[tier]}</span></div>` : "—"}</td>
      <td style="min-width:150px">${sel(`schools|${s.id}|plan`, u && u.country === "United Kingdom" ? ["UCAS", ...APP_PLANS] : APP_PLANS, s.plan)}</td>
      <td>${inp(`schools|${s.id}|appDeadline`, s.appDeadline, "date")}</td>
      <td>${inp(`schools|${s.id}|aidDeadline`, s.aidDeadline, "date")}</td>
      <td style="text-align:center">${chk(`schools|${s.id}|css`, s.css)}</td>
      <td style="min-width:120px">${sel(`schools|${s.id}|status`, APP_STATUSES, s.status)}</td>
      <td><button class="btn sm ghost" data-action="openApp" data-id="${s.id}">${done}/${APP_CHECKS.length}</button></td>
      <td style="white-space:nowrap">${site ? linkOut(site, "Website") + "<br>" : ""}${linkOut(deadlineSearchUrl(c ? c.name : u ? u.name : s.name), "Find deadlines")}</td>
      <td>${removeBtn("schools", s.id)}</td></tr>
      ${open ? `<tr><td colspan="10" style="background:#F5F8FC"><div class="grid g3" style="gap:6px;padding:6px 0">
        ${APP_CHECKS.map(([k, l]) => `<label class="inline">${chk(`schools|${s.id}|${k}`, s[k])} ${l}</label>`).join("")}</div></td></tr>` : ""}`;
  }).join("");
  const warns = appWarnings();
  const submitted = S.schools.filter(s => APP_DONE.includes(s.status)).length;
  const accepted = S.schools.filter(s => s.status === "Accepted").length;
  return `<div class="panel scroll" style="margin-top:4px">
    <div class="row"><h3 style="flex:1">My applications</h3><span class="note">${S.schools.length} colleges, ${submitted} submitted, ${accepted} accepted</span></div>
    <p class="note" style="margin:4px 0 10px">Most selective U.S. colleges have early deadlines around November 1 and regular deadlines around January 1 to 5. Every college is different, so check each one's website. Deadlines you enter show up in ${t("nav_plan")}. Add colleges from ${t("nav_match")}.</p>
    <table><thead><tr><th>College</th><th>Your chance</th><th>Plan</th><th>Application due</th><th>Aid forms due</th><th>CSS Profile</th><th>Status</th><th>Checklist</th><th>Links</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="10" class="note">No applications yet. Add colleges from ${t("nav_match")}, or add one by name below.</td></tr>`}</tbody></table>
    <button class="btn sm ghost" style="margin-top:12px" data-action="add" data-coll="schools">Add a college by name</button>
    ${warns.map(x => `<div class="warn">${x}</div>`).join("")}
  </div>`;
}

function runMatch() {
  UI.showMatches = true; UI.matchErr = ""; UI.collegeView = "us"; UI.expand = {};
  render();
  const el = document.getElementById("sugTop"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- ESSAYS ---------- */
const ESSAY_STATUSES = ["Not started","Brainstorming","Drafting","Revising","Final","Submitted"];
const ESSAY_WEIGHT = { "Not started":0, "Brainstorming":15, "Drafting":40, "Revising":70, "Final":90, "Submitted":100 };
function vEssays() {
  const sorted = [...S.essays].sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const complete = S.essays.filter(e => e.status === "Final" || e.status === "Submitted").length;
  const overall = S.essays.length ? Math.round(S.essays.reduce((s, e) => s + ESSAY_WEIGHT[e.status], 0) / S.essays.length) : 0;
  const nextE = sorted.find(e => e.due && e.status !== "Submitted" && daysUntil(e.due) >= 0);
  const late = S.essays.filter(e => e.due && e.status !== "Submitted" && e.status !== "Final" && daysUntil(e.due) < 0).length;
  const totalWords = S.essays.reduce((s, e) => s + num(e.words), 0);
  const rows = sorted.map(e => {
    const pct = Math.min(100, Math.round(num(e.words) / Math.max(1, num(e.limit)) * 100));
    const over = num(e.words) > num(e.limit);
    const d = e.due ? daysUntil(e.due) : null;
    const st = e.status === "Submitted" ? "done" : d === null ? "upcoming" : d < 0 ? "overdue" : d <= 14 ? "soon" : "upcoming";
    return `<tr>
      <td>${inp(`essays|${e.id}|school`, e.school)}</td>
      <td>${inp(`essays|${e.id}|prompt`, e.prompt)}</td>
      <td>${inp(`essays|${e.id}|due`, e.due, "date")}</td>
      <td>${pill(st)}${d !== null && e.status !== "Submitted" ? `<div class="note">${d < 0 ? `${-d} days late` : d === 0 ? "today" : `${d} days`}</div>` : ""}</td>
      <td style="width:78px">${inp(`essays|${e.id}|words`, e.words, "number", 'min="0"')}</td>
      <td style="width:78px">${inp(`essays|${e.id}|limit`, e.limit, "number", 'min="1"')}</td>
      <td style="min-width:90px"><div class="meter"><i style="width:${pct}%;background:${over ? "var(--brick)" : "var(--sage)"}"></i></div><span class="note">${over ? "Over limit" : pct + "%"}</span></td>
      <td>${sel(`essays|${e.id}|status`, ESSAY_STATUSES, e.status)}</td>
      <td>${inp(`essays|${e.id}|reviewer`, e.reviewer)}</td>
      <td><button class="btn sm ghost" data-action="openEssay" data-id="${e.id}">${UI.openEssay === e.id ? "Close" : "Write"}</button></td>
      <td>${removeBtn("essays", e.id)}</td></tr>`;
  }).join("");
  const open = S.essays.find(e => e.id === UI.openEssay);
  return `<h2>${t("nav_essays")}</h2><p class="lede">${t("d_essays")}</p>
  <div class="grid g4" style="margin-bottom:18px">
    <div class="panel stat"><b>${complete}/${S.essays.length}</b><span>Final or submitted</span></div>
    <div class="panel stat"><b>${overall}%</b><span>Overall completion</span><div class="meter" style="margin-top:8px"><i style="width:${overall}%"></i></div></div>
    <div class="panel stat"><b>${nextE ? daysUntil(nextE.due) : "—"}</b><span>${nextE ? `Days until ${esc(nextE.school)} is due` : "No upcoming essay deadlines"}</span></div>
    <div class="panel stat"><b style="${late ? "color:var(--brick)" : ""}">${late}</b><span>Past due, not finished</span></div>
  </div>
  <div class="panel scroll">
    <table><thead><tr><th>College</th><th>Prompt</th><th>Due</th><th>Timing</th><th>Words</th><th>Limit</th><th>Length</th><th>Status</th><th>Reviewer</th><th></th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="11" class="note">No essays yet.</td></tr>`}</tbody></table>
    <div class="row" style="margin-top:12px"><button class="btn sm" data-action="add" data-coll="essays">${t("add")}</button><span class="note">${totalWords.toLocaleString()} words written in total</span></div>
  </div>
  ${open ? `<div class="panel">
    <div class="row"><h3 style="flex:1">${esc(open.school)}: ${esc(open.prompt)}</h3><span class="note">${num(open.words)} / ${num(open.limit)} words</span></div>
    <p class="note">Write or paste your draft here. The word count updates automatically.</p>
    <textarea data-bind="essays|${open.id}|draft" placeholder="Start writing…">${esc(open.draft || "")}</textarea>
  </div>` : ""}`;
}

/* ---------- VOLUNTEERING ---------- */
function vVolunteer() {
  const total = S.volunteer.reduce((s, v) => s + clamp(num(v.hours), 0, 24), 0);
  const verified = S.volunteer.filter(v => v.verified).reduce((s, v) => s + clamp(num(v.hours), 0, 24), 0);
  const goal = Math.max(1, num(S.volGoal));
  const pct = Math.min(100, Math.round(total / goal * 100));
  const R = 62, C = 2 * Math.PI * R;
  const byOrg = {};
  S.volunteer.forEach(v => { const k = v.org || "Unnamed"; byOrg[k] = (byOrg[k] || 0) + num(v.hours); });
  const maxOrg = Math.max(1, ...Object.values(byOrg));
  const thisYear = new Date().getFullYear();
  const yearHours = S.volunteer.filter(v => v.date && v.date.startsWith(String(thisYear))).reduce((s, v) => s + num(v.hours), 0);
  const f = UI.vol;
  const rows = [...S.volunteer].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(v => `<tr>
    <td>${inp(`volunteer|${v.id}|date`, v.date, "date")}</td>
    <td>${inp(`volunteer|${v.id}|org`, v.org)}</td>
    <td>${inp(`volunteer|${v.id}|activity`, v.activity)}</td>
    <td style="width:80px">${inp(`volunteer|${v.id}|hours`, v.hours, "number", 'min="0" max="24" step="0.5"')}</td>
    <td>${inp(`volunteer|${v.id}|contact`, v.contact)}</td>
    <td style="text-align:center">${chk(`volunteer|${v.id}|verified`, v.verified)}</td>
    <td>${removeBtn("volunteer", v.id)}</td></tr>`).join("");
  return `<h2>${t("nav_volunteer")}</h2><p class="lede">${t("d_volunteer")}</p>
  <div class="grid" style="grid-template-columns:auto 1fr;gap:18px;align-items:stretch">
    <div class="panel ring">
      <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="${total} of ${goal} hours">
        <circle cx="80" cy="80" r="${R}" fill="none" stroke="#E7EEF5" stroke-width="14"/>
        <circle cx="80" cy="80" r="${R}" fill="none" stroke="var(--gold)" stroke-width="14" stroke-linecap="round"
          stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}" transform="rotate(-90 80 80)"/>
      </svg>
      <div class="c"><b>${total}</b><span class="note">of ${goal} hrs</span></div>
    </div>
    <div class="grid g3">
      <div class="panel stat"><b>${total}</b><span>${t("total_hours")}</span></div>
      <div class="panel stat"><b>${verified}</b><span>Verified by a supervisor</span></div>
      <div class="panel stat"><b>${yearHours}</b><span>Hours in ${thisYear}</span></div>
      <div class="panel stat"><b>${Object.keys(byOrg).length}</b><span>Organizations</span></div>
      <div class="panel stat"><b>${Math.max(0, goal - total)}</b><span>Hours to reach your goal</span></div>
      <div class="panel">${field(t("goal") + " (hours)", inp("data||volGoal", S.volGoal, "number", 'min="1" max="10000"'))}</div>
    </div>
  </div>
  <div class="panel">
    <h3 style="margin-bottom:10px">Log hours</h3>
    <div class="grid" style="grid-template-columns:150px 1fr 1fr 100px 1fr auto;align-items:end">
      ${field("Date", inp("vol||date", f.date, "date"))}
      ${field("Organization", inp("vol||org", f.org, "text", 'placeholder="Food pantry"'))}
      ${field("What you did", inp("vol||activity", f.activity, "text", 'placeholder="Packed meals"'))}
      ${field("Hours", inp("vol||hours", f.hours, "number", 'min="0" max="24" step="0.5"'))}
      ${field("Supervisor (optional)", inp("vol||contact", f.contact))}
      <button class="btn gold" data-action="logHours">${t("add")}</button>
    </div>
    ${UI.volErr ? `<p class="err">${UI.volErr}</p>` : ""}
  </div>
  ${Object.keys(byOrg).length ? `<div class="panel"><h3 style="margin-bottom:12px">Hours by organization</h3>
    ${Object.entries(byOrg).sort((a, b) => b[1] - a[1]).map(([o, h]) => `<div class="hbar"><span>${esc(o)}</span><div class="meter"><i style="width:${h / maxOrg * 100}%;background:var(--gold)"></i></div><b>${h}</b></div>`).join("")}</div>` : ""}
  <div class="panel scroll">
    <div class="row" style="margin-bottom:8px"><h3 style="flex:1">All entries</h3><button class="btn sm ghost" data-action="exportVol">Download as spreadsheet (CSV)</button></div>
    ${UI.volErr ? `<p class="err">${UI.volErr}</p>` : ""}
    <table><thead><tr><th>Date</th><th>Organization</th><th>Activity</th><th>Hours</th><th>Supervisor</th><th>Verified</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7" class="note">No hours logged yet.</td></tr>`}</tbody></table>
    <p class="note" style="margin-top:10px">Tip: ask a supervisor to sign off on your hours as you go. Many scholarships ask for a contact who can confirm them.</p>
  </div>`;
}
function exportVol() {
  const rows = [["Date","Organization","Activity","Hours","Supervisor","Verified"], ...S.volunteer.map(v => [v.date, v.org, v.activity, v.hours, v.contact, v.verified ? "Yes" : "No"])];
  const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "volunteer-hours.csv";
  document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- FINANCIAL AID ---------- */
function calcAid(a) {
  const coa = ["tuition","housing","food","books","transport","personal"].reduce((s, k) => s + num(a[k]), 0);
  const grants = num(a.grants), net = coa - grants;
  const borrowed = num(a.loans) + num(a.parentPlus);
  const outOfPocket = net - borrowed - num(a.workStudy);
  let four = 0;
  for (let y = 0; y < 4; y++) four += coa * Math.pow(1.03, y) - (a.renewable || y === 0 ? grants : 0);
  const totalAid = grants + borrowed + num(a.workStudy);
  return { coa, grants, net, borrowed, outOfPocket, four, loanShare: totalAid ? (borrowed + num(a.workStudy)) / totalAid : 0 };
}
const AID_FIELDS = [["tuition","Tuition and fees"],["housing","Housing"],["food","Food"],["books","Books and supplies"],["transport","Transportation"],["personal","Personal costs"],["grants","Grants and scholarships"],["loans","Student loans"],["workStudy","Work-study"],["parentPlus","Parent PLUS loan"]];
function vAid() {
  const rows = S.aid.map(a => ({ a, c: calcAid(a) }));
  const bestId = rows.length > 1 ? rows.reduce((b, r) => r.c.net < b.c.net ? r : b).a.id : null;
  const L = S.loan, P = num(L.amount), r = num(L.rate) / 100 / 12, n = Math.max(1, num(L.years) * 12);
  const monthly = r ? P * r / (1 - Math.pow(1 + r, -n)) : P / n;
  const cards = rows.map(({ a, c }) => `<div class="panel ${a.id === bestId ? "best" : ""}">
    <div class="row" style="margin-bottom:8px">${inp(`aid|${a.id}|school`, a.school, "text", 'style="font-weight:700;flex:1;width:auto"')}${removeBtn("aid", a.id)}</div>
    ${a.id === bestId ? `<span class="pill p-done">Lowest net cost</span>` : ""}
    <div class="grid g2" style="gap:8px;margin-top:6px">${AID_FIELDS.map(([k, l]) => field(l, inp(`aid|${a.id}|${k}`, a[k], "number", 'min="0"'))).join("")}</div>
    <label class="inline" style="margin-top:10px">${chk(`aid|${a.id}|renewable`, a.renewable)} Grants renew all four years</label>
    <table style="margin-top:12px"><tbody>
      <tr><td>Total cost (1 year)</td><td style="text-align:end">${money(c.coa)}</td></tr>
      <tr><td>Free money</td><td style="text-align:end;color:var(--sage)">−${money(c.grants)}</td></tr>
      <tr><td><b>${t("true_cost")}</b></td><td style="text-align:end"><b style="font-size:18px">${money(c.net)}</b></td></tr>
      <tr><td>Paid with loans</td><td style="text-align:end">${money(c.borrowed)}</td></tr>
      <tr><td>Family pays now</td><td style="text-align:end">${money(Math.max(0, c.outOfPocket))}</td></tr>
      <tr><td>Estimated 4-year net cost</td><td style="text-align:end">${money(c.four)}</td></tr>
    </tbody></table>
    ${c.loanShare > 0.4 ? `<div class="warn">Over 40% of this "aid" must be paid back or earned.</div>` : ""}
    ${num(a.parentPlus) > 0 ? `<div class="warn">This offer includes a Parent PLUS loan, which your parent would owe.</div>` : ""}
    ${!a.renewable ? `<div class="warn">Grants that don't renew make years 2–4 much more expensive. Ask the college.</div>` : ""}
  </div>`).join("");
  return `<h2>${t("nav_aid")}</h2><p class="lede">${t("d_aid")} Offer letters often mix loans with free money; this calculator separates them.</p>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(270px,1fr))">${cards}</div>
  <button class="btn sm" data-action="add" data-coll="aid">${t("add")}</button>
  <p class="note" style="margin-top:10px">The 4-year estimate assumes costs rise about 3% a year.</p>
  <div class="panel" style="margin-top:22px">
    <h3>Loan repayment calculator</h3>
    <p class="note" style="margin:4px 0 12px">See what borrowing really costs after graduation. Check studentaid.gov for this year's federal interest rate.</p>
    <div class="grid g3">
      ${field("Total amount borrowed ($)", inp("loan||amount", L.amount, "number", 'min="0"'))}
      ${field("Interest rate (%)", inp("loan||rate", L.rate, "number", 'min="0" step="0.01"'))}
      ${field("Years to repay", inp("loan||years", L.years, "number", 'min="1" max="30"'))}
    </div>
    <div class="grid g3" style="margin-top:14px">
      <div class="stat"><b>${money(monthly)}</b><span>Monthly payment</span></div>
      <div class="stat"><b>${money(monthly * n)}</b><span>Total paid back</span></div>
      <div class="stat"><b>${money(monthly * n - P)}</b><span>Interest paid</span></div>
    </div>
  </div>`;
}

/* ---------- RECOMMENDATIONS ---------- */
const REC_STATUSES = ["Not asked","Asked","Agreed","Submitted"];
function recAlert(r) {
  if (r.status === "Submitted") return r.thanked ? null : ["p-soon","Send a thank-you note"];
  if (r.due && daysUntil(r.due) < 0) return ["p-over","Past due"];
  if (r.status === "Not asked" && r.due && daysUntil(r.due) < 30) return ["p-over","Ask now: under 30 days"];
  if (r.status === "Asked" && r.asked && daysUntil(r.asked) < -7) return ["p-soon","Follow up: no answer in a week"];
  if (r.due && daysUntil(r.due) <= 14) return ["p-soon","Due soon: send a reminder"];
  return null;
}
function recEmail(r) {
  const me = S.profile.name || "[Your name]";
  const colleges = S.schools.map(s => s.name).join(", ") || "[list of colleges]";
  const due = r.due ? fmt(r.due) : "[date]";
  const greet = `Dear ${r.name || "[Teacher's name]"},`;
  if (r.status === "Submitted") return { subject: "Thank you for my recommendation letter", body: `${greet}\n\nThank you so much for writing my recommendation letter. I know it took time, and I really appreciate your support. I will let you know where I end up!\n\nWith gratitude,\n${me}` };
  if (r.status === "Asked" || r.status === "Agreed") return { subject: "Friendly reminder: recommendation letter", body: `${greet}\n\nI hope you're doing well. This is a friendly reminder that my recommendation letter is due on ${due} for ${colleges}. Please let me know if there is anything else I can send you to help.\n\nThank you again,\n${me}` };
  return { subject: "Request for a letter of recommendation", body: `${greet}\n\nI really enjoyed your class, and I am applying to college this year. Would you be willing to write a letter of recommendation for me? My first deadline is ${due}, and I am applying to ${colleges}.\n\nI am happy to send you a short list of my activities, goals, and a few things I'm proud of from your class. Your support means a lot to me.\n\nThank you for considering it,\n${me}` };
}
function vRecs() {
  const rows = S.recs.map(r => {
    const a = recAlert(r);
    return `<tr>
      <td>${inp(`recs|${r.id}|name`, r.name)}</td>
      <td>${inp(`recs|${r.id}|role`, r.role)}</td>
      <td>${inp(`recs|${r.id}|email`, r.email, "email", 'placeholder="optional"')}</td>
      <td>${inp(`recs|${r.id}|asked`, r.asked, "date")}</td>
      <td>${inp(`recs|${r.id}|due`, r.due, "date")}</td>
      <td>${sel(`recs|${r.id}|status`, REC_STATUSES, r.status)}</td>
      <td style="text-align:center">${chk(`recs|${r.id}|thanked`, r.thanked)}</td>
      <td>${a ? `<span class="pill ${a[0]}">${a[1]}</span>` : `<span class="pill p-done">On track</span>`}</td>
      <td><button class="btn sm ghost" data-action="emailFor" data-id="${r.id}">Email</button></td>
      <td>${removeBtn("recs", r.id)}</td></tr>`;
  }).join("");
  const target = S.recs.find(r => r.id === UI.emailFor);
  const em = target ? recEmail(target) : null;
  const mailto = em ? `mailto:${encodeURIComponent(target.email || "")}?subject=${encodeURIComponent(em.subject)}&body=${encodeURIComponent(em.body)}` : "";
  return `<h2>${t("nav_recs")}</h2><p class="lede">${t("d_recs")} Teachers usually want at least a month's notice.</p>
  <div class="grid g3" style="margin-bottom:18px">
    <div class="panel stat"><b>${S.recs.length}</b><span>Recommenders</span></div>
    <div class="panel stat"><b>${S.recs.filter(r => r.status === "Submitted").length}</b><span>Letters submitted</span></div>
    <div class="panel stat"><b>${S.recs.filter(r => recAlert(r)).length}</b><span>Need your attention</span></div>
  </div>
  <div class="panel scroll">
    <table><thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Date asked</th><th>Due</th><th>Status</th><th>Thanked</th><th>Next step</th><th></th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="10" class="note">No recommenders yet.</td></tr>`}</tbody></table>
    <button class="btn sm" style="margin-top:12px" data-action="add" data-coll="recs">${t("add")}</button>
  </div>
  ${em ? `<div class="panel">
    <div class="row"><h3 style="flex:1">Email to ${esc(target.name || "recommender")}</h3><button class="x" data-action="emailFor" data-id="">×</button></div>
    <p class="note">The right email for their status: a request, a reminder, or a thank-you. Edit it so it sounds like you.</p>
    <p style="margin:8px 0 4px"><b>Subject:</b> ${esc(em.subject)}</p>
    <textarea id="emailBody" style="min-height:220px">${esc(em.body)}</textarea>
    <div class="row" style="margin-top:10px">
      <button class="btn" data-action="copyEmail">Copy email</button>
      <a class="btn ghost" href="${mailto}" style="text-decoration:none">Open in my email app</a>
    </div>
  </div>` : ""}`;
}

/* ---------- SCHOLARSHIPS ---------- */
function vScholarships() {
  const won = S.scholarships.filter(s => s.status === "Won").reduce((a, s) => a + num(s.amount), 0);
  const pending = S.scholarships.filter(s => s.status === "Submitted").reduce((a, s) => a + num(s.amount), 0);
  const rows = [...S.scholarships].sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999")).map(s => {
    const d = s.deadline ? daysUntil(s.deadline) : null;
    const st = ["Submitted","Won","Not selected"].includes(s.status) ? "done" : d === null ? "nodate" : d < 0 ? "overdue" : d <= 14 ? "soon" : "upcoming";
    return `<tr>
    <td>${inp(`scholarships|${s.id}|name`, s.name, "text", 'placeholder="Scholarship name"')}</td>
    <td style="width:120px">${inp(`scholarships|${s.id}|amount`, s.amount, "number", 'min="0"')}</td>
    <td>${inp(`scholarships|${s.id}|deadline`, s.deadline, "date")}</td>
    <td>${pill(st)}</td>
    <td>${sel(`scholarships|${s.id}|status`, ["Not started","In progress","Submitted","Won","Not selected"], s.status)}</td>
    <td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">Website</a>` : ""}</td>
    <td>${removeBtn("scholarships", s.id)}</td></tr>`;
  }).join("");

  const home = (S.profile.state || "").toUpperCase(), grade = S.profile.grade, q = norm(UI.schQ);
  const dir = SCHOLARSHIP_DIRECTORY.map((d, i) => ({ ...d, i }))
    .filter(d => !d.st || UI.schAllStates || !home || d.st === home)
    .filter(d => UI.schCat === "all" || d.tags.includes(UI.schCat))
    .filter(d => !UI.schMyGrade || !d.grades || d.grades.includes(grade))
    .filter(d => !q || norm(d.name + " " + d.who + " " + d.award).includes(q))
    .sort((a, b) => (b.st === home && home ? 1 : 0) - (a.st === home && home ? 1 : 0));
  const gradeText = g => !g ? "Check eligibility" : g.length === 4 ? "Grades 9–12" : g.length === 1 ? `Grade ${g[0]}` : `Grades ${g.join(" and ")}`;
  const cards = dir.map(d => {
    const added = S.scholarships.some(s => s.name === d.name);
    return `<div class="match">
      <div class="row" style="gap:6px"><h3 style="flex:1;min-width:180px">${esc(d.name)}</h3>${d.st ? `<span class="tag t-match">${d.st}</span>` : ""}</div>
      <div class="facts" style="margin-top:6px"><span><b>${esc(d.award)}</b></span><span>${esc(d.when)}</span><span>${gradeText(d.grades)}</span></div>
      <p style="margin:4px 0 8px">${esc(d.who)}</p>
      <div class="row" style="gap:4px;margin-bottom:10px">${d.tags.map(x => `<span class="chip">${SCH_CATS[x]}</span>`).join("")}</div>
      <div class="row"><button class="btn sm" data-action="addDir" data-id="${d.i}" ${added ? "disabled" : ""}>${added ? "Tracking" : "Track this"}</button>
        <a href="${d.url}" target="_blank" rel="noopener" class="note">Official website</a></div></div>`;
  }).join("");

  return `<h2>${t("nav_sch")}</h2><p class="lede">${t("d_sch")} Local scholarships from community groups, employers, and your high school often have fewer applicants than national ones, so ask your counselor for that list too.</p>
  <div class="grid g4" style="margin-bottom:18px">
    <div class="panel stat"><b>${S.scholarships.length}</b><span>Tracking</span></div>
    <div class="panel stat"><b>${S.scholarships.filter(s => s.status === "Submitted").length}</b><span>Submitted</span></div>
    <div class="panel stat"><b>${money(pending)}</b><span>Waiting to hear</span></div>
    <div class="panel stat"><b style="color:var(--sage)">${money(won)}</b><span>Won so far</span></div>
  </div>
  <div class="panel scroll">
    <h3 style="margin-bottom:8px">My scholarships</h3>
    <table><thead><tr><th>Scholarship</th><th>Amount ($)</th><th>Deadline</th><th>Timing</th><th>Status</th><th></th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7" class="note">None yet. Click "Track this" on any scholarship below, or add your own.</td></tr>`}</tbody></table>
    <button class="btn sm" style="margin-top:12px" data-action="add" data-coll="scholarships">Add my own</button>
  </div>

  <div class="row" style="margin:26px 0 10px"><h2 style="font-size:24px;flex:1">Find scholarships</h2><span class="note">${dir.length} of ${SCHOLARSHIP_DIRECTORY.length} shown</span></div>
  <div class="panel">
    <div class="grid g3">
      ${field("Search", inp("ui||schQ", UI.schQ, "search", 'placeholder="Example: engineering, Hispanic, Texas"'))}
      ${field("Category", `<select data-bind="ui||schCat"><option value="all" ${UI.schCat === "all" ? "selected" : ""}>All categories</option>${Object.entries(SCH_CATS).map(([k, v]) => `<option value="${k}" ${UI.schCat === k ? "selected" : ""}>${v}</option>`).join("")}</select>`)}
      <div style="align-self:end;display:grid;gap:6px">
        <label class="inline">${chk("ui||schMyGrade", UI.schMyGrade)} Open to my grade (${grade})</label>
        <label class="inline">${chk("ui||schAllStates", UI.schAllStates)} Show state aid for all states</label>
      </div>
    </div>
    ${!home ? `<p class="note" style="margin:10px 0 0">Set your home state in ${t("nav_account")} to see your state's grants first.</p>` : ""}
  </div>
  <div class="grid g2">${cards || `<p class="note">No scholarships match. Try another category or clear the search.</p>`}</div>
  <p class="note" style="margin-top:10px">Deadlines and amounts change every year. Always check the official website before you apply.</p>

  <h3 style="margin:26px 0 12px">Free scholarship search sites</h3>
  <div class="grid g3">${SCHOLARSHIP_TOOLS.map(x => `<div class="match"><h3 style="font-size:16px">${esc(x.name)}</h3><p class="note" style="margin:6px 0 8px">${esc(x.who)}</p><a href="${x.url}" target="_blank" rel="noopener" class="note">Open</a></div>`).join("")}</div>
  <div class="warn" style="margin-top:16px">Real scholarships never charge a fee to apply or to "guarantee" money. Never pay to apply.</div>`;
}

/* ---------- COMMUNITY (location-based forum) ----------
   Signed-in students only. Built-in sub-forums for the student's town, state,
   and region, plus interest topics. Students can create their own sub-forums.
   Posts are shared through Firebase (see section 9). Without Firebase, the
   forum still works but posts stay on this device only. */
const INTEREST_FORUMS = [
  ["applying", "Applying to college"], ["aid", "Financial aid & FAFSA help"], ["scholarships", "Scholarships"], ["essays", "College essays"],
  ["testing", "SAT & ACT prep"], ["firstgen", "First-gen life & family"], ["cc", "Community college & transferring"],
  ["stem", "STEM"], ["health", "Health careers"], ["business", "Business"], ["arts", "Arts, music & design"], ["sports", "Sports & athletics"],
];
const FORUM_TYPES = ["Town or city", "Neighborhood or area", "High school", "Interest"];
const STATE_NAMES = { AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DC:"Washington, DC",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",PR:"Puerto Rico" };
const FORUM_RULES = [
  "Be kind. No bullying, hate, or harassment.",
  "Keep personal info private: no phone numbers, addresses, emails, social media handles, or your class schedule.",
  "Never agree to meet someone from here in person.",
  "Report anything that makes you uncomfortable, and tell a trusted adult.",
];
const PERSONAL_INFO = [
  /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/,
  /[^\s@]+@[^\s@]+\.[a-z]{2,}/i,
  /\b\d{1,5}\s+[a-z]+(\s[a-z]+)?\s+(street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|place|pl|way)\b/i,
  /(^|\s)@[a-z0-9_.]{3,}/i,
  /\b(snap(chat)?|insta(gram)?|tiktok|discord|whatsapp|telegram|kik)\b\s*(:|@|is|me)/i,
];
const HIDE_AFTER_REPORTS = 3;
const slug = s => norm(s).replace(/ /g, "-");
const tsMs = x => x && x.toMillis ? x.toMillis() : typeof x === "number" ? x : Date.now();
function timeAgo(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString(LOCALE[LANG] || "en-US", { month: "short", day: "numeric" });
}
const defaultNickname = () => { const parts = (S.profile.name || "").trim().split(/\s+/); return parts[0] ? parts[0] + (parts[1] ? " " + parts[1][0] + "." : "") : "Student"; };
const myNickname = () => (S.profile.nickname || "").trim() || defaultNickname();

const FORUM = { user: null, custom: [], posts: [], replies: [], current: null, openPost: null, unsub: [], unsubReplies: null, lastPost: 0 };
const forumCloud = () => !!(CLOUD_ON && fb && USER && USER.cloud);
const localForum = async () => (await Store.get("fg:forum")) || { forums: [], posts: [], replies: [] };

function forumList() {
  const p = S.profile, st = (p.state || "").toUpperCase(), town = (p.town || "").trim();
  const near = [];
  if (town && st) near.push({ id: `town:${st}:${slug(town)}`, name: `${town}, ${st}`, kind: "Your town", desc: `Students in and around ${town}.` });
  if (st) near.push({ id: `state:${st}`, name: `${STATE_NAMES[st] || st} students`, kind: "Your state", desc: `Students across ${STATE_NAMES[st] || st}.` });
  const reg = REGION_OF[st];
  if (reg) near.push({ id: `region:${reg}`, name: `${reg} region`, kind: "Your region", desc: `Students across the ${reg}.` });
  const interests = INTEREST_FORUMS.map(([k, n]) => ({ id: `interest:${k}`, name: n, kind: "Interest", desc: `Talk about ${n.toLowerCase()} with students anywhere.` }));
  const q = norm(UI.forumQ);
  const custom = FORUM.custom.filter(f => (f.type === "Interest" || !st || f.state === st) && (!q || norm(f.name + " " + (f.desc || "")).includes(q)))
    .map(f => ({ ...f, kind: f.type, desc: f.desc || "" }));
  return { near, interests, custom, all: [...near, ...interests, ...custom] };
}

function forumStop() {
  FORUM.unsub.forEach(u => { try { u(); } catch (e) {} }); FORUM.unsub = [];
  if (FORUM.unsubReplies) { try { FORUM.unsubReplies(); } catch (e) {} FORUM.unsubReplies = null; }
}
async function forumEnter() {
  forumStop();
  if (!USER) return;
  if (forumCloud()) {
    FORUM.unsub.push(fb.db.collection("forums").onSnapshot(
      snap => { FORUM.custom = snap.docs.map(d => ({ id: "custom:" + d.id, docId: d.id, ...d.data() })); render(); },
      e => { UI.forumErr = friendlyError(e); render(); }));
  } else FORUM.custom = (await localForum()).forums;
  const list = forumList();
  openForum(FORUM.current && list.all.some(f => f.id === FORUM.current) ? FORUM.current : (list.near[0] || list.interests[0]).id);
}
async function openForum(id) {
  FORUM.current = id; FORUM.openPost = null; FORUM.posts = []; FORUM.replies = []; UI.forumErr = "";
  if (FORUM.unsub.length > 1) { const keep = FORUM.unsub.shift(); FORUM.unsub.forEach(u => u()); FORUM.unsub = [keep]; }
  if (FORUM.unsubReplies) { FORUM.unsubReplies(); FORUM.unsubReplies = null; }
  if (forumCloud()) {
    FORUM.unsub.push(fb.db.collection("posts").where("forumId", "==", id).onSnapshot(
      snap => { FORUM.posts = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)); render(); },
      e => { UI.forumErr = friendlyError(e); render(); }));
  } else {
    FORUM.posts = (await localForum()).posts.filter(p => p.forumId === id).sort((a, b) => b.createdAt - a.createdAt);
  }
  render();
}
async function openPost(id) {
  FORUM.openPost = FORUM.openPost === id ? null : id; FORUM.replies = []; UI.nr = { body: "" };
  if (FORUM.unsubReplies) { FORUM.unsubReplies(); FORUM.unsubReplies = null; }
  if (FORUM.openPost) {
    if (forumCloud()) FORUM.unsubReplies = fb.db.collection("replies").where("postId", "==", id).onSnapshot(
      snap => { FORUM.replies = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt)); render(); },
      e => { UI.forumErr = friendlyError(e); render(); });
    else FORUM.replies = (await localForum()).replies.filter(r => r.postId === id).sort((a, b) => a.createdAt - b.createdAt);
  }
  render();
}
function checkText(text, max, what) {
  if (!text.trim()) return `Write your ${what} first.`;
  if (text.length > max) return `Keep your ${what} under ${max.toLocaleString()} characters.`;
  if (PERSONAL_INFO.some(r => r.test(text))) return "To keep everyone safe, don't share phone numbers, emails, addresses, or social media handles.";
  return "";
}
async function newPost() {
  const t1 = UI.np.title.trim(), b = UI.np.body.trim();
  UI.forumErr = !t1 ? "Give your post a title." : checkText(t1, 120, "title") || checkText(b, 4000, "message");
  if (!UI.forumErr && Date.now() - FORUM.lastPost < 20000) UI.forumErr = "Please wait a few seconds before posting again.";
  if (UI.forumErr) { render(); return; }
  const post = { forumId: FORUM.current, uid: USER.id, author: myNickname(), title: t1, body: b, replyCount: 0, reportedBy: [] };
  try {
    if (forumCloud()) await fb.db.collection("posts").add({ ...post, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    else { const d = await localForum(); d.posts.push({ ...post, id: uid(), createdAt: Date.now() }); await Store.set("fg:forum", d); await openForum(FORUM.current); }
    FORUM.lastPost = Date.now(); UI.np = { title: "", body: "" };
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    toast("Posted");
  } catch (e) { UI.forumErr = friendlyError(e); render(); }
}
async function newReply(postId) {
  const b = UI.nr.body.trim();
  UI.forumErr = checkText(b, 2000, "reply");
  if (UI.forumErr) { render(); return; }
  const reply = { postId, forumId: FORUM.current, uid: USER.id, author: myNickname(), body: b, reportedBy: [] };
  try {
    if (forumCloud()) {
      await fb.db.collection("replies").add({ ...reply, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      await fb.db.collection("posts").doc(postId).update({ replyCount: firebase.firestore.FieldValue.increment(1), lastReplyAt: firebase.firestore.FieldValue.serverTimestamp() });
    } else {
      const d = await localForum(); d.replies.push({ ...reply, id: uid(), createdAt: Date.now() });
      const p = d.posts.find(x => x.id === postId); if (p) p.replyCount = (p.replyCount || 0) + 1;
      await Store.set("fg:forum", d);
      FORUM.posts = d.posts.filter(p => p.forumId === FORUM.current).sort((a, b) => b.createdAt - a.createdAt);
      FORUM.replies = d.replies.filter(r => r.postId === postId).sort((a, b) => a.createdAt - b.createdAt);
    }
    UI.nr = { body: "" };
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    render();
  } catch (e) { UI.forumErr = friendlyError(e); render(); }
}
async function forumDelete(kind, id) {   // kind: posts | replies | forums
  try {
    if (forumCloud()) await fb.db.collection(kind).doc(id).delete();
    else { const d = await localForum(); d[kind] = d[kind].filter(x => (x.docId || x.id) !== id); await Store.set("fg:forum", d); }
    if (kind === "posts" && FORUM.openPost === id) FORUM.openPost = null;
    if (kind === "forums") { FORUM.current = null; await forumEnter(); return; }
    if (!forumCloud()) { kind === "replies" ? await openPostRefresh() : await openForum(FORUM.current); }
    toast("Deleted");
  } catch (e) { UI.forumErr = friendlyError(e); render(); }
}
async function openPostRefresh() { const id = FORUM.openPost; FORUM.openPost = null; await openPost(id); }
async function forumReport(kind, id) {
  try {
    if (forumCloud()) await fb.db.collection(kind).doc(id).update({ reportedBy: firebase.firestore.FieldValue.arrayUnion(USER.id) });
    else { const d = await localForum(); const x = d[kind].find(y => y.id === id); if (x && !x.reportedBy.includes(USER.id)) x.reportedBy.push(USER.id); await Store.set("fg:forum", d);
      kind === "replies" ? await openPostRefresh() : await openForum(FORUM.current); }
    toast("Reported. Thank you. It's hidden for you now.");
  } catch (e) { UI.forumErr = friendlyError(e); render(); }
}
function blockUser(uidToBlock, name) {
  S.blocked = [...new Set([...(S.blocked || []), uidToBlock])]; save();
  toast(`You won't see posts from ${name} anymore.`);
}
async function createForum() {
  const nf = UI.nf, st = (S.profile.state || "").toUpperCase();
  UI.forumErr = nf.name.trim().length < 3 ? "Give the sub-forum a name (at least 3 letters)." : checkText(nf.name, 60, "name") || (nf.desc.trim() ? checkText(nf.desc, 200, "description") : "");
  if (!UI.forumErr && nf.type !== "Interest" && !st) UI.forumErr = "Set your state first.";
  if (UI.forumErr) { render(); return; }
  const f = { name: nf.name.trim(), type: nf.type, state: nf.type === "Interest" ? "" : st, desc: nf.desc.trim(), createdBy: USER.id, createdByName: myNickname() };
  try {
    let id;
    if (forumCloud()) { const ref = await fb.db.collection("forums").add({ ...f, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); id = "custom:" + ref.id; }
    else { const d = await localForum(); const docId = uid(); d.forums.push({ ...f, id: "custom:" + docId, docId, createdAt: Date.now() }); await Store.set("fg:forum", d); FORUM.custom = d.forums; id = "custom:" + docId; }
    UI.nf = { name: "", type: nf.type, desc: "" }; UI.newForumOpen = false;
    await openForum(id); toast("Sub-forum created");
  } catch (e) { UI.forumErr = friendlyError(e); render(); }
}

function vForum() {
  if (!USER) return `<h2>${t("nav_forum")}</h2><p class="lede">${t("d_forum")}</p>
    <div class="forum-grid">
      <aside class="panel flist" aria-label="Sub-forums preview">
        <div class="fgroup">Near you</div>
        <div class="fbtn note">Your town</div><div class="fbtn note">Your state</div><div class="fbtn note">Your region</div>
        <div class="fgroup">Interests</div>
        ${INTEREST_FORUMS.map(([, n]) => `<div class="fbtn note">${esc(n)}</div>`).join("")}
      </aside>
      <section>
        <div class="panel" style="text-align:center;padding:30px 20px"><h3>Sign in to join the community</h3>
          <p class="note" style="margin:6px auto 14px;max-width:56ch">Talk with students in your town, state, and region, ask questions about applying and paying for college, or start your own sub-forum. The community is only for students with an account. That keeps it safer, since many members are under 18.</p>
          <button class="btn gold" data-action="tab" data-tab="account">${t("signup")} / ${t("login")}</button></div>
        <div class="panel"><b>Community rules</b><ul class="note" style="margin:6px 0 0;padding-inline-start:18px">${FORUM_RULES.map(r => `<li>${r}</li>`).join("")}</ul></div>
      </section>
    </div>`;
  if (FORUM.user !== USER.id) { FORUM.user = USER.id; setTimeout(forumEnter, 0); }
  const p = S.profile;
  if (!p.state || !p.town || !p.forumReady) return `<h2>${t("nav_forum")}</h2><p class="lede">${t("d_forum")}</p>
    <div class="panel">
      <h3>Join the community</h3>
      ${p.state && p.town ? `<p style="margin:6px 0 0">You'll see sub-forums for <b>${esc(p.town)}, ${esc(p.state)}</b>, and you'll post as <b>${esc(myNickname())}</b>.</p>`
        : `<p style="margin:6px 0 0">First, add your <b>town and state</b> in ${t("nav_account")}. They decide which local sub-forums you see.</p>`}
      <button class="btn ${p.state && p.town ? "ghost" : "gold"}" style="margin-top:10px" data-action="tab" data-tab="account">${p.state && p.town ? "Change town or nickname in " + t("nav_account") : "Go to " + t("nav_account")}</button>
      <div class="panel" style="background:#F5F8FC;margin:14px 0 0"><b>Community rules</b><ul style="margin:6px 0 0;padding-inline-start:18px">${FORUM_RULES.map(r => `<li>${r}</li>`).join("")}</ul></div>
      <button class="btn gold" style="margin-top:14px" data-action="joinForum" ${p.state && p.town ? "" : "disabled"}>I agree. Join the community</button>
    </div>`;

  const list = forumList(), cur = list.all.find(f => f.id === FORUM.current) || null;
  const blocked = new Set(S.blocked || []);
  const hidden = x => (x.reportedBy || []).length >= HIDE_AFTER_REPORTS || (x.reportedBy || []).includes(USER.id);
  const btn = f => `<button class="fbtn ${f.id === FORUM.current ? "on" : ""}" data-action="openForum" data-id="${esc(f.id)}">${esc(f.name)}</button>`;
  const posts = FORUM.posts.filter(x => !blocked.has(x.uid));
  const postHtml = posts.map(x => {
    const mine = x.uid === USER.id, open = FORUM.openPost === x.id;
    if (hidden(x) && !mine) return `<div class="post note">A post was hidden after being reported.</div>`;
    const replies = open ? FORUM.replies.filter(r => !blocked.has(r.uid)) : [];
    return `<div class="post">
      <div class="row" style="gap:6px"><b style="flex:1">${esc(x.title)}</b><span class="note">${esc(x.author)}, ${timeAgo(tsMs(x.createdAt))}</span></div>
      <p style="margin:6px 0;white-space:pre-wrap">${esc(open || x.body.length < 280 ? x.body : x.body.slice(0, 280) + "…")}</p>
      <div class="row" style="gap:12px">
        <button class="linkbtn" data-action="openPost" data-id="${x.id}">${open ? "Hide replies" : `${x.replyCount || 0} ${(x.replyCount || 0) === 1 ? "reply" : "replies"}${x.body.length >= 280 ? ", read more" : ""}`}</button>
        ${mine ? `<button class="linkbtn" data-action="delPost" data-id="${x.id}">Delete</button>`
          : `<button class="linkbtn" data-action="reportPost" data-id="${x.id}">Report</button><button class="linkbtn" data-action="blockUser" data-id="${esc(x.uid)}" data-val="${esc(x.author)}">Block ${esc(x.author)}</button>`}
      </div>
      ${open ? `<div class="replies">
        ${replies.map(r => hidden(r) && r.uid !== USER.id ? `<div class="reply note">A reply was hidden after being reported.</div>` : `<div class="reply">
          <div class="note"><b style="color:var(--ink)">${esc(r.author)}</b>, ${timeAgo(tsMs(r.createdAt))}</div>
          <div style="white-space:pre-wrap;margin:2px 0 4px">${esc(r.body)}</div>
          ${r.uid === USER.id ? `<button class="linkbtn note" data-action="delReply" data-id="${r.id}">Delete</button>` : `<button class="linkbtn note" data-action="reportReply" data-id="${r.id}">Report</button>`}
        </div>`).join("") || `<p class="note">No replies yet.</p>`}
        <div class="row" style="align-items:flex-end;margin-top:8px"><div style="flex:1;min-width:200px">${field("Your reply", `<textarea data-bind="nr||body" style="min-height:70px" maxlength="2000">${esc(UI.nr.body)}</textarea>`)}</div>
          <button class="btn sm" data-action="newReply" data-id="${x.id}">Reply</button></div>
      </div>` : ""}
    </div>`;
  }).join("");
  const mineForum = cur && cur.createdBy === USER.id;

  return `<h2>${t("nav_forum")}</h2><p class="lede">${t("d_forum")} You're posting as <b>${esc(myNickname())}</b>${p.town ? ` from ${esc(p.town)}, ${esc(p.state)}` : ""}. <button class="linkbtn" data-action="tab" data-tab="account">Change in ${t("nav_account")}</button></p>
  ${forumCloud() ? "" : `<div class="warn" style="margin-bottom:16px">Posts are saved only on this device for now. To share posts between students, the site owner needs to finish the Firebase setup in section 9 of the code.</div>`}
  ${UI.forumErr ? `<div class="warn" style="margin-bottom:16px;background:#F6DCD8;color:var(--brick)">${esc(UI.forumErr)}</div>` : ""}
  <div class="forum-grid">
    <aside class="panel flist">
      ${inp("ui||forumQ", UI.forumQ, "search", 'placeholder="Search sub-forums"')}
      <div class="fgroup">Near you</div>${list.near.map(btn).join("") || `<p class="note">Add your town to see local forums.</p>`}
      <div class="fgroup">Created by students${(S.profile.state || "") ? ` in ${esc(S.profile.state)}` : ""}</div>${list.custom.map(btn).join("") || `<p class="note">None yet. Start one below.</p>`}
      <div class="fgroup">Interests</div>${list.interests.map(btn).join("")}
      <button class="btn sm ghost" style="margin-top:12px;width:100%" data-action="toggleNewForum">${UI.newForumOpen ? "Cancel" : "+ Create a sub-forum"}</button>
      ${UI.newForumOpen ? `<div class="grid" style="margin-top:10px;gap:8px">
        ${field("Name", inp("nf||name", UI.nf.name, "text", 'maxlength="60" placeholder="Example: White Plains students"'))}
        ${field("Type", sel("nf||type", FORUM_TYPES, UI.nf.type))}
        ${field("Description (optional)", inp("nf||desc", UI.nf.desc, "text", 'maxlength="200"'))}
        <button class="btn sm gold" data-action="createForum">Create</button>
        <p class="note" style="margin:0">Town, area, and school sub-forums are shown to students in your state. Interest sub-forums are shown to everyone.</p>
      </div>` : ""}
    </aside>
    <section>
      ${cur ? `<div class="panel">
        <div class="row" style="gap:8px"><span class="chip">${esc(cur.kind)}</span><h3 style="flex:1">${esc(cur.name)}</h3>
          ${mineForum ? `<button class="linkbtn note" data-action="delForum" data-id="${esc(cur.docId)}">Delete this sub-forum</button>` : ""}</div>
        ${cur.desc ? `<p class="note" style="margin:4px 0 0">${esc(cur.desc)}${cur.createdByName ? ` Started by ${esc(cur.createdByName)}.` : ""}</p>` : ""}
        <div class="grid" style="margin-top:12px;gap:8px">
          ${field("Title", inp("np||title", UI.np.title, "text", 'maxlength="120" placeholder="What do you want to talk about?"'))}
          ${field("Message", `<textarea data-bind="np||body" style="min-height:90px" maxlength="4000" placeholder="Ask a question or share something helpful.">${esc(UI.np.body)}</textarea>`)}
          <div class="row"><button class="btn gold" data-action="newPost">Post</button>
            <span class="note">Don't share personal info. <button class="linkbtn note" data-action="toggleRules">${UI.rulesOpen ? "Hide rules" : "Community rules"}</button></span></div>
          ${UI.rulesOpen ? `<ul class="note" style="margin:0;padding-inline-start:18px">${FORUM_RULES.map(r => `<li>${r}</li>`).join("")}</ul>` : ""}
        </div>
      </div>
      ${postHtml || `<div class="panel note" style="text-align:center;padding:28px">No posts yet. Start the conversation.</div>`}` : `<div class="panel note">Pick a sub-forum.</div>`}
    </section>
  </div>`;
}

/* ---------- ACCOUNT ---------- */
const STATES = ["","AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","PR"];
const SITE_VERSION = "Oct 23, 2026, update 8";
function connectionBox() {
  const ver = `<div class="note" style="margin-top:6px">Site version: ${SITE_VERSION}. If this doesn't match the file you uploaded, GitHub Pages is still showing an older copy.</div>`;
  if (!CLOUD_ON) {
    const rows = Object.entries(FIREBASE_CONFIG).map(([k, v]) => {
      const bad = !v || String(v).includes("PASTE_");
      return `<li><b>${k}</b>: ${bad ? `<span style="color:var(--brick)">NOT filled in</span> (still "${esc(String(v || "empty"))}")` : `filled in (starts with "${esc(String(v).slice(0, 8))}…")`}</li>`;
    }).join("");
    return `<div class="warn" style="margin-bottom:16px;background:#F6DCD8;color:var(--brick)"><b>Firebase is NOT connected.</b> Accounts and community posts are saved only on this device.
      <ul style="margin:6px 0;padding-inline-start:18px;color:var(--ink)">${rows}</ul>
      <span style="color:var(--ink)">Fix each value marked NOT filled in: open index.html, search for FILL IN YOUR FIREBASE VALUES HERE, paste the value, save, and upload again.</span>${ver}</div>`;
  }
  if (CLOUD_ERR) return `<div class="warn" style="margin-bottom:16px;background:#F6DCD8;color:var(--brick)"><b>Firebase is filled in but couldn't start:</b> ${esc(CLOUD_ERR)} Check that the four values match Firebase exactly.${ver}</div>`;
  if (!fb) return `<div class="warn" style="margin-bottom:16px">Connecting to Firebase…${ver}</div>`;
  return `<div class="ok" style="margin-bottom:16px"><b>Connected to Firebase</b> (project: ${esc(FIREBASE_CONFIG.projectId)}). Accounts and posts work on every device.${ver}</div>`;
}
function vAccount() {
  const p = S.profile;
  const profileForm = `<div class="panel">
    <h3 style="margin-bottom:12px">Student profile</h3>
    <div class="grid g3">
      ${field(t("name"), inp("profile||name", p.name))}
      ${field(t("grade"), `<select data-bind="profile||grade">${[9,10,11,12].map(g => `<option value="${g}" ${g === p.grade ? "selected" : ""}>${g}</option>`).join("")}</select>`)}
      ${field("Graduation year", inp("profile||gradYear", p.gradYear, "number"))}
      ${field(t("high_school"), inp("profile||school", p.school))}
      ${field("Town or city", inp("profile||town", p.town || "", "text", 'placeholder="Scarsdale"'))}
      ${field("Home state", `<select data-bind="profile||state">${STATES.map(s => `<option ${s === p.state ? "selected" : ""}>${s}</option>`).join("")}</select>`)}
      ${field("Nickname shown in Community", inp("profile||nickname", p.nickname || "", "text", `placeholder="${esc(defaultNickname())}" maxlength="30"`))}
      <label class="inline" style="align-self:end">${chk("profile||feeWaiver", p.feeWaiver)} I may qualify for fee waivers</label>
    </div>
  </div>`;
  const msgs = `${UI.authMsg ? `<div class="ok" style="margin-bottom:14px">${esc(UI.authMsg)}</div>` : ""}
    ${UI.authErr ? `<div class="warn" style="margin-bottom:14px;background:#F6DCD8;color:var(--brick)">${esc(UI.authErr)}</div>` : ""}
    ${CLOUD_ERR ? `<div class="warn" style="margin-bottom:14px">${esc(CLOUD_ERR)}</div>` : ""}`;

  if (USER) {
    return `<h2>${t("nav_account")}</h2>${connectionBox()}
      <p class="lede">Signed in as <b>${esc(USER.name)}</b> (${esc(USER.email)}).
      ${USER.cloud ? "Your progress saves to your account, so you can log in from any phone or computer." : "Your progress saves on this device."}</p>
      ${msgs}
      ${USER.cloud ? `<div class="ok" style="margin-bottom:18px">Status: <span id="syncLabel">${esc(UI.sync)}</span></div>` : ""}
      ${profileForm}
      <div class="panel row">
        <button class="btn" data-action="logout">${t("logout")}</button>
        <button class="btn ghost" data-action="tour">${t("cta_tour")}</button>
        <div class="spacer"></div>
        <button class="btn danger" data-action="deleteAccount" ${UI.busy ? "disabled" : ""}>${UI.confirmDelete ? "Click again to delete everything" : "Delete my account"}</button>
        ${UI.confirmDelete ? `<button class="btn sm ghost" data-action="cancelDelete">Cancel</button>` : ""}
      </div>`;
  }
  const su = UI.signup, li = UI.login;
  return `<h2>${t("nav_account")}</h2>${connectionBox()}
  <p class="lede">${CLOUD_ON ? "Create a free account to save your plan and open it on any phone or computer." : t("d_account")}</p>
  ${msgs}
  <div class="auth">
    <div class="panel">
      <h3>${t("new_here")} ${t("signup")}</h3>
      <div class="grid" style="margin-top:14px">
        ${field(t("name"), inp("signup||name", su.name, "text", 'autocomplete="name"'))}
        ${field("Email", inp("signup||email", su.email, "email", 'autocomplete="email"'))}
        ${field(t("password") + " (6+ characters)", inp("signup||password", su.password, "password", 'autocomplete="new-password"'))}
        <div class="grid g2">
          ${field(t("grade"), sel("signup||grade", ["9","10","11","12"], su.grade))}
          ${field("Home state", sel("signup||state", STATES, su.state))}
        </div>
        ${field(t("high_school"), inp("signup||school", su.school))}
        <label class="inline">${chk("signup||keep", su.keep)} Keep what I've already entered</label>
        <button class="btn gold" data-action="signup" ${UI.busy ? "disabled" : ""}>${UI.busy ? "Please wait…" : t("signup")}</button>
      </div>
    </div>
    <div class="panel">
      <h3>${t("have_account")} ${t("login")}</h3>
      <div class="grid" style="margin-top:14px">
        ${field("Email", inp("login||email", li.email, "email", 'autocomplete="email"'))}
        ${field(t("password"), inp("login||password", li.password, "password", 'autocomplete="current-password"'))}
        <button class="btn" data-action="login" ${UI.busy ? "disabled" : ""}>${UI.busy ? "Please wait…" : t("login")}</button>
        ${CLOUD_ON ? `<button class="btn sm ghost" data-action="resetPw" style="justify-self:start">Forgot password?</button>` : ""}
      </div>
    </div>
  </div>
  ${profileForm}
  ${CLOUD_ON ? "" : `<p class="note">Accounts currently save on this device only. To let students log in from any device, follow the Firebase setup steps in section 9 of the code.</p>`}`;
}

async function signup() {
  const su = UI.signup, email = su.email.trim().toLowerCase();
  UI.authErr = ""; UI.authMsg = "";
  if (!su.name.trim()) UI.authErr = "Please enter your name.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) UI.authErr = "Enter a valid email address.";
  else if (su.password.length < 6) UI.authErr = "Password must be at least 6 characters.";
  else if (!CLOUD_ON && LOCAL_ACCOUNTS[email]) UI.authErr = "An account with that email already exists on this device. Try logging in.";
  else if (CLOUD_ON && !fb) UI.authErr = CLOUD_ERR || "Still connecting to the account server. Try again in a moment.";
  if (UI.authErr) { render(); return; }
  const grade = Number(su.grade);
  const profile = defaultProfile({ name: su.name.trim(), grade, gradYear: currentGradYear(grade), state: su.state, school: su.school, feeWaiver: S.profile.feeWaiver });
  const data = su.keep ? { ...S, profile } : blankData(profile);
  UI.busy = true; render();
  try {
    if (CLOUD_ON) {
      PENDING = data;
      const cred = await fb.auth.createUserWithEmailAndPassword(email, su.password);
      cred.user.updateProfile({ displayName: profile.name }).catch(() => {});
    } else {
      const salt = uid() + uid();
      LOCAL_ACCOUNTS[email] = { name: profile.name, salt, hash: await hashPassword(su.password, salt) };
      await Store.set("fg:accounts", LOCAL_ACCOUNTS);
      USER = { id: "local:" + email, email, name: profile.name, cloud: false };
      S = data;
      await Store.set(dataKey(), S); await Store.set("fg:session", email);
    }
    UI.signup = { name: "", email: "", password: "", grade: "11", school: "", state: "", keep: true };
    UI.busy = false; UI.tab = "home"; toast(`Welcome, ${profile.name}!`);
  } catch (e) { PENDING = null; UI.busy = false; UI.authErr = friendlyError(e); render(); }
}

async function login() {
  const email = UI.login.email.trim().toLowerCase(), pw = UI.login.password;
  UI.authErr = ""; UI.authMsg = "";
  if (!email || !pw) { UI.authErr = "Enter your email and password."; render(); return; }
  if (CLOUD_ON && !fb) { UI.authErr = CLOUD_ERR || "Still connecting to the account server. Try again in a moment."; render(); return; }
  UI.busy = true; render();
  try {
    if (CLOUD_ON) await fb.auth.signInWithEmailAndPassword(email, pw);
    else {
      const acc = LOCAL_ACCOUNTS[email];
      if (!acc || (await hashPassword(pw, acc.salt)) !== acc.hash) throw { code: "auth/invalid-credential" };
      USER = { id: "local:" + email, email, name: acc.name, cloud: false };
      await Store.set("fg:session", email);
      S = migrate(await Store.get(dataKey()));
      if (!S.profile.name) S.profile.name = acc.name;
    }
    UI.login = { email: "", password: "" };
    UI.busy = false; UI.tab = "home"; toast("Welcome back!");
  } catch (e) { UI.busy = false; UI.authErr = friendlyError(e); render(); }
}

async function resetPw() {
  const email = UI.login.email.trim();
  UI.authErr = ""; UI.authMsg = "";
  if (!email) { UI.authErr = "Type your email in the log-in box first."; render(); return; }
  try { await fb.auth.sendPasswordResetEmail(email); UI.authMsg = "Check your email for a link to reset your password."; }
  catch (e) { UI.authErr = friendlyError(e); }
  render();
}

async function logout() {
  forumStop(); FORUM.user = null; FORUM.current = null; FORUM.posts = []; FORUM.custom = [];
  if (USER && USER.cloud && fb) { await flushCloud(); USER = null; await fb.auth.signOut(); }
  else { USER = null; await Store.del("fg:session"); }
  S = migrate(await Store.get("fg:data:guest"));
  UI.authErr = ""; UI.authMsg = ""; UI.sync = ""; UI.confirmDelete = false;
  UI.tab = "home"; toast("You're signed out.");
}

async function deleteAccount() {
  forumStop(); FORUM.user = null;
  if (!UI.confirmDelete) { UI.confirmDelete = true; render(); return; }
  UI.busy = true; UI.authErr = ""; render();
  try {
    if (USER.cloud) {
      clearTimeout(cloudTimer); cloudPending = null;
      await studentDoc(USER.id).delete();
      await fb.auth.currentUser.delete();
    } else {
      delete LOCAL_ACCOUNTS[USER.email]; await Store.set("fg:accounts", LOCAL_ACCOUNTS);
      await Store.del("fg:session");
    }
    await Store.del(dataKey());
    USER = null; S = migrate(await Store.get("fg:data:guest"));
    UI.busy = false; UI.confirmDelete = false; UI.tab = "home"; toast("Account deleted.");
  } catch (e) { UI.busy = false; UI.confirmDelete = false; UI.authErr = friendlyError(e); render(); }
}

/* ---------- TUTORIAL ---------- */
const TOUR = [
  { tab: "account", key: "tut1" }, { tab: "plan", key: "tut2" }, { tab: "match", key: "tut3" }, { tab: "apps", key: "tut_apps" }, { tab: "essays", key: "tut4" },
  { tab: "volunteer", key: "tut5" }, { tab: "aid", key: "tut6" }, { tab: "recs", key: "tut7" }, { tab: "forum", key: "tut8" },
];
function vTour() {
  if (UI.tour === null) return "";
  const i = UI.tour, step = TOUR[i];
  return `<div class="modal-back" role="dialog" aria-modal="true" aria-labelledby="tourTitle">
    <div class="modal">
      <div class="row"><div class="step">${i + 1} / ${TOUR.length}</div><div class="spacer"></div><button class="x" data-action="tourEnd" aria-label="Close">×</button></div>
      <h2 id="tourTitle" style="font-size:24px">${t("tut_title")}</h2>
      <h3 style="margin-top:14px;color:var(--muted)">${t(TABS.find(x => x[0] === step.tab)[1])}</h3>
      <p>${t(step.key)}</p>
      <div class="row">
        <div class="dots">${TOUR.map((_, j) => `<i class="${j === i ? "on" : ""}"></i>`).join("")}</div>
        <div class="spacer"></div>
        ${i > 0 ? `<button class="btn ghost" data-action="tourBack">${t("back")}</button>` : ""}
        ${i < TOUR.length - 1 ? `<button class="btn" data-action="tourNext">${t("next")}</button>` : `<button class="btn gold" data-action="tourEnd">${t("gotit")}</button>`}
      </div>
    </div>
  </div>`;
}

/* ======================================================================
   12. RENDER + EVENTS
   ====================================================================== */
const VIEWS = { home: vHome, plan: vPlan, match: vMatch, essays: vEssays, volunteer: vVolunteer, aid: vAid, recs: vRecs, scholarships: vScholarships, forum: vForum, account: vAccount, apps: vApps };
const app = document.getElementById("app");

/* render() builds the new page, then updates the existing page in place
   (only what changed). The box you're typing in and the button you're
   clicking are never replaced, so typing and clicking always work. */
function render() {
  // Remember the box being typed in, in case the update has to replace it.
  const a = document.activeElement, bind = a && a.dataset ? a.dataset.bind : null;
  let s0 = null, s1 = null; try { s0 = a.selectionStart; s1 = a.selectionEnd; } catch (e) {}
  const next = document.createElement("div");
  if (render.lastTab !== UI.tab) {
    if (render.lastTab !== undefined) {
      UI.tabChangedAt = Date.now();
      const rtl = document.documentElement.dir === "rtl", forward = TAB_ORDER.indexOf(UI.tab) >= TAB_ORDER.indexOf(render.lastTab);
      UI.tabDir = forward !== rtl ? "r" : "l";
    }
    render.lastTab = UI.tab;
  }
  const anim = Date.now() - (UI.tabChangedAt || 0) < 500 ? ` class="tab-in-${UI.tabDir}"` : "";
  next.innerHTML = vHeader() + `<main${anim}>${VIEWS[UI.tab]()}</main>` + vTour() + (UI.toast ? `<div class="toast" role="status">${esc(UI.toast)}</div>` : "");
  morph(app, next, true);
  placeNav();
  if (bind && (!document.activeElement || document.activeElement.dataset?.bind !== bind)) {
    const el = app.querySelector(`[data-bind="${CSS.escape(bind)}"]`);
    if (el) { el.focus({ preventScroll: true }); try { if (s0 != null) el.setSelectionRange(s0, s1); } catch (e) {} }
  }
}

function placeNav() {
  const nav = app.querySelector("nav.tabs"); if (!nav) return;
  const scrolls = nav.scrollWidth - nav.clientWidth > 2;
  if (scrolls !== !!UI.navScroll) { UI.navScroll = scrolls; nav.classList.toggle("scrolls", scrolls); }
  const on = nav.querySelector("button.on"), ind = nav.querySelector(".tab-ind");
  if (on && ind) {
    const box = { l: on.offsetLeft, t: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
    const first = !UI.ind;
    if (first || ["l", "t", "w", "h"].some(k => UI.ind[k] !== box[k])) {
      UI.ind = box;
      if (first) ind.style.transition = "none";
      ind.style.left = box.l + "px"; ind.style.top = box.t + "px"; ind.style.width = box.w + "px"; ind.style.height = box.h + "px"; ind.style.opacity = "1";
      nav.classList.add("ind-ready");
      if (first) { void ind.offsetWidth; ind.style.transition = ""; }
    }
    if (placeNav.tab !== UI.tab) { placeNav.tab = UI.tab; const r = on.getBoundingClientRect(), nr = nav.getBoundingClientRect();
      if (r.left < nr.left || r.right > nr.right) nav.scrollTo({ left: on.offsetLeft - 40, behavior: "smooth" }); }
  }
  const menu = app.querySelector(".nav-menu"), gbtn = UI.openGroup && nav.querySelector(`button.grp[data-val="${UI.openGroup}"]`), head = app.querySelector("header.top");
  if (menu && gbtn && head) {
    const r = gbtn.getBoundingClientRect(), h = head.getBoundingClientRect(), rtl = document.documentElement.dir === "rtl";
    const want = rtl ? r.right - h.left - menu.offsetWidth : r.left - h.left;
    const xy = { x: Math.round(Math.max(8, Math.min(want, h.width - menu.offsetWidth - 8))), y: Math.round(r.bottom - h.top + 6) };
    if (!UI.menuXY || UI.menuXY.x !== xy.x || UI.menuXY.y !== xy.y) { UI.menuXY = xy; menu.style.left = xy.x + "px"; menu.style.top = xy.y + "px"; }
    menu.style.visibility = "";
  }
}
window.addEventListener("resize", () => { UI.ind = null; UI.menuXY = null; render(); });
function sameNode(o, n) {
  if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) return false;
  return o.nodeType !== 1 || (o.getAttribute("data-bind") || "") === (n.getAttribute("data-bind") || "");
}
const strongMatch = (o, n) => sameNode(o, n) && (o.nodeType !== 1 || (o.getAttribute("class") || "") === (n.getAttribute("class") || "") && (o.getAttribute("id") || "") === (n.getAttribute("id") || ""));
function morph(from, to, isRoot) {
  if (!isRoot) {
    for (const a of [...from.attributes]) if (!to.hasAttribute(a.name)) from.removeAttribute(a.name);
    for (const a of [...to.attributes]) if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
  }
  // Match old and new children. When a message or row appears or disappears, look a few
  // nodes ahead so the elements after it (and any box being typed in) are kept, not rebuilt.
  const oldKids = [...from.childNodes], newKids = [...to.childNodes];
  let oi = 0;
  for (let ni = 0; ni < newKids.length; ni++) {
    const n = newKids[ni]; let o = oldKids[oi];
    if (o && !strongMatch(o, n)) {
      let k = -1;
      if (n.nodeType === 1) for (let j = oi + 1; j < Math.min(oldKids.length, oi + 6); j++) if (strongMatch(oldKids[j], n)) { k = j; break; }
      if (k > 0) { for (let j = oi; j < k; j++) oldKids[j].remove(); oi = k; o = oldKids[oi]; }
      else if (o.nodeType === 1) {
        let m = -1;
        for (let j = ni + 1; j < Math.min(newKids.length, ni + 6); j++) if (strongMatch(o, newKids[j])) { m = j; break; }
        if (m > 0) { from.insertBefore(n, o); continue; }
      }
    }
    if (!o) from.appendChild(n);
    else if (!sameNode(o, n)) { from.replaceChild(n, o); oi++; }
    else { if (o.nodeType === 1) morph(o, n, false); else if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; oi++; }
  }
  for (; oi < oldKids.length; oi++) oldKids[oi].remove();
  // keep live form values in sync, except in the field the student is typing in
  if (!isRoot && from !== document.activeElement) {
    if (from.tagName === "INPUT") {
      if (from.type === "checkbox") from.checked = to.hasAttribute("checked");
      else { const v = to.getAttribute("value") ?? ""; if (from.value !== v) from.value = v; }
    } else if (from.tagName === "TEXTAREA") {
      if (from.value !== to.textContent) from.value = to.textContent;
    } else if (from.tagName === "SELECT") {
      const opt = to.querySelector("option[selected]");
      if (opt) { const v = opt.getAttribute("value") ?? opt.textContent; if (from.value !== v) from.value = v; }
    }
  }
}

const countWords = s => (s.trim().match(/\S+/g) || []).length;

function onEdit(ev) {
  const el = ev.target;
  if (el.dataset.done !== undefined) {
    if (ev.type !== "change") return;
    const p = S.plan.find(x => x.id === el.dataset.done);
    if (p) p.done = el.checked; else S.done[el.dataset.done] = el.checked;
    save(); render(); return;
  }
  const bind = el.dataset.bind; if (!bind) return;
  const toggle = el.type === "checkbox" || el.tagName === "SELECT";
  if (toggle ? ev.type !== "change" : ev.type !== "input") return;
  const [coll, id, k] = bind.split("|");
  let val = el.type === "checkbox" ? el.checked : el.value;
  if (el.type === "number" && el.value !== "") {
    const v = Number(el.value), lo = el.min !== "" ? Number(el.min) : -Infinity, hi = el.max !== "" ? Number(el.max) : Infinity;
    const fixed = Math.min(hi, Math.max(lo, v));
    if (fixed !== v) {
      el.value = val = String(fixed);
      const why = coll === "volunteer" && k === "hours" ? (v < lo ? "Hours can't be negative." : "One entry can't be more than 24 hours. Log longer events as separate entries.")
        : v < lo ? `This can't be less than ${lo}.` : `This can't be more than ${hi}.`;
      if (coll === "volunteer" || coll === "data") UI.volErr = why; else toast(why);
    } else if (coll === "volunteer" || (coll === "data" && k === "volGoal")) UI.volErr = "";
  }

  switch (coll) {
    case "lang": LANG = val; Store.set("fg:lang", LANG); applyDir(); UI.ind = null; break;
    case "profile":
      if (k === "grade") { S.profile.grade = Number(val); S.profile.gradYear = currentGradYear(Number(val)); }
      else if (k === "gradYear") { if (Number(val) > 2000) S.profile.gradYear = Number(val); }
      else S.profile[k] = val;
      if (k === "town" || k === "state") { FORUM.current = null; FORUM.user = null; }
      if (USER && k === "name") { USER.name = val || USER.email; if (!USER.cloud && LOCAL_ACCOUNTS[USER.email]) { LOCAL_ACCOUNTS[USER.email].name = USER.name; Store.set("fg:accounts", LOCAL_ACCOUNTS); } }
      save(); break;
    case "data": S[k] = val; save(); break;
    case "loan": S.loan[k] = val; save(); break;
    case "ui": UI[k] = val; if (k === "q" || k === "sort") UI.page = 0; break;
    case "match": UI.match[k] = val; UI.page = 0; break;
    case "stats": S.stats[k] = val; if (k === "testType") S.stats.score = ""; save(); break;
    case "ns": UI.newStep[k] = val; break;
    case "np": case "nr": case "nf": UI[coll][k] = val; break;
    case "signup": UI.signup[k] = val; break;
    case "login": UI.login[k] = val; break;
    case "vol": UI.vol[k] = val; break;
    default: {
      const item = S[coll] && S[coll].find(x => x.id === id);
      if (item) { item[k] = val; if (coll === "essays" && k === "draft") item.words = countWords(val); }
      save();
    }
  }
  render();
}
app.addEventListener("input", onEdit);
app.addEventListener("change", onEdit);
app.addEventListener("keydown", ev => {
  if (ev.key === "Escape" && UI.openGroup) { UI.openGroup = null; render(); }
  if (ev.key === "Escape" && UI.tour !== null) { endTour(); }
  if (ev.key === "Enter" && ev.target.dataset && ev.target.dataset.bind) {
    const c = ev.target.dataset.bind.split("|")[0];
    if (c === "login") login(); else if (c === "signup") signup(); else if (c === "vol") logHours();
    else if (c === "ns") addStep(); else if (c === "stats") runMatch(); else if (c === "nf") createForum();
  }
});

const BLANK = {
  schools: () => ({ name: "", cid: null, plan: "Regular Decision (RD)", appDeadline: "", aidDeadline: "", css: false, status: "Not started" }),
  recs: () => ({ name: "", role: "", email: "", asked: "", due: "", status: "Not asked", thanked: false }),
  essays: () => ({ school: "", prompt: "", limit: 250, words: 0, status: "Not started", reviewer: "", due: "", draft: "" }),
  aid: () => ({ school: "New offer", tuition: 0, housing: 0, food: 0, books: 0, transport: 0, personal: 0, grants: 0, loans: 0, workStudy: 0, parentPlus: 0, renewable: true }),
  scholarships: () => ({ name: "", amount: "", deadline: "", status: "Not started", url: "" }),
};

function logHours() {
  const v = UI.vol;
  UI.volErr = "";
  if (!v.org.trim()) UI.volErr = "Add the organization's name.";
  else if (!(num(v.hours) > 0)) UI.volErr = "Enter how many hours (more than 0).";
  else if (num(v.hours) > 24) UI.volErr = "One entry can't be more than 24 hours. Log multi-day events as separate entries.";
  if (UI.volErr) { render(); return; }
  S.volunteer.push({ id: uid(), date: v.date || iso(today()), org: v.org.trim(), activity: v.activity.trim(), hours: num(v.hours), contact: v.contact.trim(), verified: false });
  UI.vol = { date: "", org: "", activity: "", hours: "", contact: "" };
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();  // so the cleared boxes show empty
  save(); toast(`Logged ${num(v.hours)} hours`);
}

function endTour() { if (UI.tab === "forum") { forumStop(); FORUM.user = null; } UI.tour = null; UI.tab = "home"; Store.set("fg:toured", true); window.scrollTo(0, 0); render(); }

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (e2) {}
    ta.remove(); return ok;
  }
}

app.addEventListener("click", async ev => {
  const btn = ev.target.closest("[data-action]");
  if (UI.openGroup && (!btn || btn.dataset.action !== "toggleGroup")) { UI.openGroup = null; if (!btn) { render(); return; } }
  if (!btn) { if (ev.target.classList.contains("modal-back")) endTour(); return; }
  const { action, coll, id, tab, val, src } = btn.dataset;
  switch (action) {
    case "toggleGroup": UI.openGroup = UI.openGroup === val ? null : val; UI.menuXY = null; break;
    case "tab": if (btn.dataset.view) UI.collegeView = btn.dataset.view;
      if (UI.tab === "forum" && tab !== "forum") { forumStop(); FORUM.user = null; } UI.tab = tab; window.scrollTo(0, 0); break;
    case "tour": UI.tour = 0; UI.tab = TOUR[0].tab; break;
    case "tourNext": case "tourBack": {
      UI.tour += action === "tourNext" ? 1 : -1;
      const nextTab = TOUR[UI.tour].tab;
      if (UI.tab === "forum" && nextTab !== "forum") { forumStop(); FORUM.user = null; }
      UI.tab = nextTab; window.scrollTo(0, 0); break;
    }
    case "tourEnd": endTour(); return;
    case "remove": S[coll] = S[coll].filter(x => x.id !== id); if (UI.openEssay === id) UI.openEssay = null; if (UI.emailFor === id) UI.emailFor = null; if (UI.editStep === id) UI.editStep = null; save(); break;
    case "add": S[coll].push({ id: uid(), ...BLANK[coll]() }); save(); break;
    case "runMatch": runMatch(); return;
    case "addStep": addStep(); return;
    case "addIdea": { const [title, cat] = PLAN_IDEAS[Number(id)]; const p = { id: uid(), title, date: "", cat, notes: "", done: false }; S.plan.push(p); UI.editStep = p.id; save(); toast("Added. Give it a date."); return; }
    case "editStep": UI.editStep = id || null; break;
    case "toggleIdeas": UI.ideasOpen = !UI.ideasOpen; break;
    case "toggleFilters": UI.filtersOpen = !UI.filtersOpen; break;
    case "page": UI.page = Math.max(0, UI.page + Number(val)); break;
    case "openApp": UI.openApp = UI.openApp === id ? null : id; break;
    case "more": UI.expand[val] = (UI.expand[val] || { reach: 3, match: 4, likely: 3, far: 0, nodata: 0 }[val]) + 20; break;
    case "less": UI.expand[val] = 0; break;
    case "collegeView": UI.collegeView = val; break;
    case "toggleSources": UI.sourcesOpen = !UI.sourcesOpen; break;
    case "addIntl": {
      const u = INTL[Number(id)];
      if (u && !S.schools.some(s => s.intl === u.i)) { S.schools.push({ ...BLANK.schools(), id: uid(), intl: u.i, name: u.name, plan: u.country === "United Kingdom" ? "UCAS" : "Regular Decision (RD)" }); save(); toast(`Added ${u.name} to your applications`); return; }
      break;
    }
    case "joinForum": S.profile.forumReady = true; if (!S.profile.nickname) S.profile.nickname = defaultNickname(); save(); forumStop(); FORUM.user = null; FORUM.current = null; break;
    case "openForum": openForum(id); return;
    case "openPost": openPost(id); return;
    case "newPost": newPost(); return;
    case "newReply": newReply(id); return;
    case "delPost": forumDelete("posts", id); return;
    case "delReply": forumDelete("replies", id); return;
    case "delForum": if (confirm("Delete this sub-forum? Its posts will no longer be listed.")) forumDelete("forums", id); return;
    case "reportPost": forumReport("posts", id); return;
    case "reportReply": forumReport("replies", id); return;
    case "blockUser": blockUser(id, val); break;
    case "createForum": createForum(); return;
    case "toggleNewForum": UI.newForumOpen = !UI.newForumOpen; break;
    case "toggleRules": UI.rulesOpen = !UI.rulesOpen; break;
    case "addCollege": {
      const c = COLLEGE_BY_ID.get(Number(id));
      if (c && !S.schools.some(s => s.cid === c.id)) { S.schools.push({ ...BLANK.schools(), id: uid(), cid: c.id, name: c.name }); save(); toast(`Added ${c.name} to your applications`); return; }
      break;
    }
    case "openEssay": UI.openEssay = UI.openEssay === id ? null : id; break;
    case "logHours": logHours(); return;
    case "exportVol": exportVol(); return;
    case "emailFor": UI.emailFor = id || null; break;
    case "copyEmail": { const ok = await copyText(document.getElementById("emailBody").value); toast(ok ? "Email copied" : "Select the text and copy it manually"); return; }
    case "addDir": {
      const d = SCHOLARSHIP_DIRECTORY[Number(id)];
      S.scholarships.push({ id: uid(), name: d.name, amount: "", deadline: "", status: "Not started", url: d.url }); save(); toast(`Tracking ${d.name}`); return;
    }
    case "signup": signup(); return;
    case "login": login(); return;
    case "logout": logout(); return;
    case "deleteAccount": deleteAccount(); return;
    case "cancelDelete": UI.confirmDelete = false; break;
    case "resetPw": resetPw(); return;
  }
  render();
});

init();
