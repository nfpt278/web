const DATA_URL = "data/subjects.json";
const DONE_KEY = "study_dash_done_v1";
const NOTES_KEY = "study_dash_notes_v1";

const $ = (id) => document.getElementById(id);

const els = {
  classCards: $("classCards"),
  scheduleGrid: $("scheduleGrid"),
  searchInput: $("searchInput"),
  resetBtn: $("resetBtn"),
  lessonList: $("lessonList"),
  lessonCountPill: $("lessonCountPill"),
  ongoingName: $("ongoingName"),
  ongoingDesc: $("ongoingDesc"),
  ongoingProgress: $("ongoingProgress"),
  ongoingBar: $("ongoingBar"),
  ongoingPill: $("ongoingPill"),
  notesBox: $("notesBox"),

  modal: $("modal"),
  modalClose: $("modalClose"),
  closeBtn: $("closeBtn"),
  toggleDoneBtn: $("toggleDoneBtn"),
  mSubject: $("mSubject"),
  mTitle: $("mTitle"),
  mContent: $("mContent"),
};

let db = null;
let activeSubjectId = null;
let activeLessonId = null;
let done = loadJSON(DONE_KEY, {});
let notes = loadJSON(NOTES_KEY, "");

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function saveJSON(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// Markdown nhẹ
function renderMarkdown(md) {
  const safe = escapeHtml(md);

  let html = safe.replace(/```([\s\S]*?)```/g, (m, code) => `<pre><code>${code.trim()}</code></pre>`);
  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^> (.*)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/^\- (.*)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>");

  html = html
    .split(/\n{2,}/)
    .map((chunk) => {
      if (chunk.startsWith("<h") || chunk.startsWith("<pre") || chunk.startsWith("<ul") || chunk.startsWith("<blockquote")) return chunk;
      return `<p>${chunk.replaceAll("\n", "<br/>")}</p>`;
    })
    .join("");

  return html;
}

function getSubject(id) {
  return db.subjects.find(s => s.id === id);
}
function getLesson(subjectId, lessonId) {
  const s = getSubject(subjectId);
  return s?.lessons?.find(l => l.id === lessonId) ?? null;
}
function isDone(subjectId, lessonId) {
  return Boolean(done?.[subjectId]?.[lessonId]);
}
function setDone(subjectId, lessonId, value) {
  done[subjectId] = done[subjectId] || {};
  done[subjectId][lessonId] = value;
  saveJSON(DONE_KEY, done);
}

function subjectProgress(subject) {
  const total = subject.lessons.length;
  const doneCount = subject.lessons.filter(l => isDone(subject.id, l.id)).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  return { total, doneCount, pct };
}

function iconForIndex(i){
  const icons = ["📘","🧪","🌍","🧠","📗","🧩","💡","🖥️"];
  return icons[i % icons.length];
}

function renderCards() {
  els.classCards.innerHTML = "";
  db.subjects.forEach((s, idx) => {
    const p = subjectProgress(s);

    const div = document.createElement("div");
    div.className = "classCard";
    div.innerHTML = `
      <div class="cc__left">
        <div class="icon">${iconForIndex(idx)}</div>
        <div>
          <div class="cc__name">${escapeHtml(s.name)}</div>
          <div class="cc__meta">${escapeHtml(s.description || "")}</div>
          <div class="progressRow">
            <span>Lessons ${p.doneCount}/${p.total}</span>
            <span>${p.pct}% completed</span>
          </div>
          <div class="pbar"><div class="pbar__fill" style="width:${p.pct}%"></div></div>
        </div>
      </div>
      <span class="tag">${p.pct >= 100 ? "Done" : "In progress"}</span>
    `;
    div.addEventListener("click", () => openSubject(s.id));
    els.classCards.appendChild(div);
  });
}

function renderLessonList() {
  const s = getSubject(activeSubjectId);
  if (!s) {
    els.lessonList.innerHTML = `<div class="muted" style="padding:10px">Pick a class to see lessons.</div>`;
    els.lessonCountPill.textContent = "0";
    return;
  }

  const q = (els.searchInput.value || "").trim().toLowerCase();
  const lessons = s.lessons.filter(l => {
    if (!q) return true;
    const hay = (l.title + " " + (l.content||"") + " " + (l.tags||[]).join(" ")).toLowerCase();
    return hay.includes(q);
  });

  els.lessonCountPill.textContent = String(lessons.length);
  els.lessonList.innerHTML = "";

  lessons.forEach((l) => {
    const div = document.createElement("div");
    div.className = "lessonItem";
    div.innerHTML = `
      <div>
        <div class="lessonTitle">${escapeHtml(l.title)}</div>
        <div class="lessonTags">${escapeHtml((l.tags||[]).join(" • "))}</div>
      </div>
      <div class="doneDot ${isDone(s.id, l.id) ? "doneDot--on" : ""}"></div>
    `;
    div.addEventListener("click", () => openLesson(s.id, l.id));
    els.lessonList.appendChild(div);
  });

  if (lessons.length === 0) {
    els.lessonList.innerHTML = `<div class="muted" style="padding:10px">No lesson found.</div>`;
  }

  // cập nhật ongoing
  const p = subjectProgress(s);
  els.ongoingPill.textContent = s.name;
  els.ongoingName.textContent = s.name;
  els.ongoingDesc.textContent = `${p.doneCount}/${p.total} lessons done`;
  els.ongoingProgress.textContent = `${p.pct}%`;
  els.ongoingBar.style.width = `${p.pct}%`;
}

function renderSchedule() {
  // Lịch demo 5 ngày (Mon-Fri) + 3 khung giờ
  const days = ["Time", "Mon", "Tue", "Wed", "Thu", "Fri"];
  const times = ["09:00", "13:00", "18:00"];

  const s1 = db.subjects?.[0];
  const s2 = db.subjects?.[1];
  const s3 = db.subjects?.[2];

  const events = [
    { day: "Mon", time: "09:00", title: s1?.name || "Class A", note: "Lesson 1", cls: "event--a" },
    { day: "Tue", time: "13:00", title: s2?.name || "Class B", note: "Practice", cls: "event--b" },
    { day: "Wed", time: "18:00", title: s3?.name || "Class C", note: "Review", cls: "event--c" },
    { day: "Fri", time: "09:00", title: s1?.name || "Class A", note: "Quiz", cls: "event--d" },
  ];

  const key = (d,t) => `${d}|${t}`;
  const map = {};
  events.forEach(e => map[key(e.day,e.time)] = e);

  els.scheduleGrid.innerHTML = "";

  // header row
  days.forEach(d => {
    const c = document.createElement("div");
    c.className = "cell cell--head";
    c.textContent = d;
    els.scheduleGrid.appendChild(c);
  });

  times.forEach((t) => {
    // time cell
    const timeCell = document.createElement("div");
    timeCell.className = "cell cell--head";
    timeCell.textContent = t;
    els.scheduleGrid.appendChild(timeCell);

    // day cells
    ["Mon","Tue","Wed","Thu","Fri"].forEach((d) => {
      const e = map[key(d,t)];
      const cell = document.createElement("div");
      cell.className = "cell";
      if (e) {
        cell.innerHTML = `
          <div class="event ${e.cls}">
            <strong>${escapeHtml(e.title)}</strong>
            <small>${escapeHtml(e.note)}</small>
          </div>
        `;
      } else {
        cell.textContent = "—";
      }
      els.scheduleGrid.appendChild(cell);
    });
  });
}

function openSubject(subjectId) {
  activeSubjectId = subjectId;
  activeLessonId = null;
  renderLessonList();
}

function openLesson(subjectId, lessonId) {
  activeSubjectId = subjectId;
  activeLessonId = lessonId;

  const s = getSubject(subjectId);
  const l = getLesson(subjectId, lessonId);
  if (!s || !l) return;

  els.mSubject.textContent = s.name;
  els.mTitle.textContent = l.title;
  els.mContent.innerHTML = renderMarkdown(l.content || "");
  updateToggleBtn();

  els.modal.hidden = false;
}

function closeModal(){
  els.modal.hidden = true;
}

function updateToggleBtn(){
  const s = getSubject(activeSubjectId);
  const l = getLesson(activeSubjectId, activeLessonId);
  if (!s || !l) return;
  const d = isDone(s.id, l.id);
  els.toggleDoneBtn.textContent = d ? "✅ Done" : "⬜ Mark done";
}

async function init() {
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Cannot load subjects.json");
  db = await res.json();

  renderCards();
  renderSchedule();

  activeSubjectId = db.subjects?.[0]?.id || null;
  renderLessonList();

  // search
  els.searchInput.addEventListener("input", () => renderLessonList());

  // reset done
  els.resetBtn.addEventListener("click", () => {
    localStorage.removeItem(DONE_KEY);
    done = loadJSON(DONE_KEY, {});
    renderCards();
    renderLessonList();
  });

  // notes
  els.notesBox.value = notes || "";
  els.notesBox.addEventListener("input", () => {
    notes = els.notesBox.value;
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  });

  // modal close
  els.modalClose.addEventListener("click", closeModal);
  els.closeBtn.addEventListener("click", closeModal);

  // toggle done
  els.toggleDoneBtn.addEventListener("click", () => {
    const s = getSubject(activeSubjectId);
    const l = getLesson(activeSubjectId, activeLessonId);
    if (!s || !l) return;
    setDone(s.id, l.id, !isDone(s.id, l.id));
    updateToggleBtn();
    renderCards();
    renderLessonList();
  });

  // esc to close
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.modal.hidden) closeModal();
  });
}

init().catch(err => {
  console.error(err);
  els.lessonList.innerHTML = `<div class="muted" style="padding:10px">Error loading data.</div>`;
});
