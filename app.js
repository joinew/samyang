const STORAGE_KEY = "visit-schedule-pwa-v2";
const LEGACY_KEY = "visit-schedule-pwa-v1";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const TIME_SLOT_LABELS = {
  "all-day": "종일",
  morning: "오전",
  afternoon: "오후",
  evening: "저녁",
  "half-day": "반나절"
};

const state = {
  places: [],
  activeView: "today",
  openDetailId: null,
  search: "",
  deferredInstallPrompt: null
};

const el = {
  placeList: document.querySelector("#placeList"),
  todayList: document.querySelector("#todayList"),
  upcomingList: document.querySelector("#upcomingList"),
  todayView: document.querySelector("#todayView"),
  allView: document.querySelector("#allView"),
  search: document.querySelector("#searchInput"),
  newPlaceBtn: document.querySelector("#newPlaceBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importInput: document.querySelector("#importInput"),
  installBtn: document.querySelector("#installBtn"),
  placeDialog: document.querySelector("#placeDialog"),
  placeForm: document.querySelector("#placeForm"),
  closeDialogBtn: document.querySelector("#closeDialogBtn"),
  dialogTitle: document.querySelector("#dialogTitle"),
  deleteBtn: document.querySelector("#deleteBtn"),
  placeId: document.querySelector("#placeId"),
  nameInput: document.querySelector("#nameInput"),
  addressInput: document.querySelector("#addressInput"),
  scheduleTypeInput: document.querySelector("#scheduleTypeInput"),
  intervalFields: document.querySelector("#intervalFields"),
  intervalInput: document.querySelector("#intervalInput"),
  unitInput: document.querySelector("#unitInput"),
  lastVisitInput: document.querySelector("#lastVisitInput"),
  weekdayFields: document.querySelector("#weekdayFields"),
  weekdayInputs: [...document.querySelectorAll("input[name='weekday']")],
  rotationFields: document.querySelector("#rotationFields"),
  rotationGroupInput: document.querySelector("#rotationGroupInput"),
  rotationIntervalInput: document.querySelector("#rotationIntervalInput"),
  rotationOrderInput: document.querySelector("#rotationOrderInput"),
  rotationStartInput: document.querySelector("#rotationStartInput"),
  timeSlotInput: document.querySelector("#timeSlotInput"),
  noteInput: document.querySelector("#noteInput"),
  historyDialog: document.querySelector("#historyDialog"),
  historyTitle: document.querySelector("#historyTitle"),
  historyList: document.querySelector("#historyList"),
  closeHistoryBtn: document.querySelector("#closeHistoryBtn"),
  counts: {
    overdue: document.querySelector("#overdueCount"),
    today: document.querySelector("#todayCount"),
    soon: document.querySelector("#soonCount"),
    total: document.querySelector("#totalCount")
  }
};

function todayString() {
  return formatDate(new Date());
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateValue, days) {
  const date = parseDate(dateValue);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function addInterval(dateValue, interval, unit) {
  const date = parseDate(dateValue);
  if (unit === "weeks") date.setDate(date.getDate() + interval * 7);
  if (unit === "days") date.setDate(date.getDate() + interval);
  if (unit === "months") date.setMonth(date.getMonth() + interval);
  return formatDate(date);
}

function daysBetween(fromValue, toValue) {
  const from = parseDate(fromValue);
  const to = parseDate(toValue);
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.round((to - from) / oneDay);
}

function getSchedule(place) {
  if (place.schedule) return place.schedule;
  return {
    type: "interval",
    interval: Number(place.interval || 1),
    unit: place.unit || "days",
    lastVisit: place.lastVisit || todayString()
  };
}

function getNextIntervalVisit(schedule) {
  return addInterval(schedule.lastVisit || todayString(), Number(schedule.interval || 1), schedule.unit || "days");
}

function getNextWeekdayVisit(schedule) {
  const weekdays = schedule.weekdays?.length ? schedule.weekdays.map(Number) : [new Date().getDay()];
  const today = todayString();
  const todayDate = parseDate(today);
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(todayDate);
    candidate.setDate(todayDate.getDate() + offset);
    if (weekdays.includes(candidate.getDay())) return formatDate(candidate);
  }
  return today;
}

function getRotationGroupPlaces(groupName) {
  return state.places
    .filter((place) => getSchedule(place).type === "rotation" && getSchedule(place).group === groupName)
    .sort((a, b) => Number(getSchedule(a).order || 1) - Number(getSchedule(b).order || 1));
}

function getNextRotationVisit(place) {
  const schedule = getSchedule(place);
  const groupPlaces = getRotationGroupPlaces(schedule.group);
  const groupSize = Math.max(groupPlaces.length, Number(schedule.groupSize || 1));
  const order = Math.max(1, Number(schedule.order || 1));
  const intervalDays = Math.max(1, Number(schedule.intervalDays || 2));
  const startDate = schedule.startDate || todayString();
  const today = todayString();
  const firstVisit = addDays(startDate, (order - 1) * intervalDays);
  if (daysBetween(today, firstVisit) >= 0) return firstVisit;
  const cycleDays = groupSize * intervalDays;
  const elapsed = Math.abs(daysBetween(firstVisit, today));
  const cycles = Math.ceil(elapsed / cycleDays);
  return addDays(firstVisit, cycles * cycleDays);
}

function getNextVisit(place) {
  const schedule = getSchedule(place);
  if (schedule.type === "weekday") return getNextWeekdayVisit(schedule);
  if (schedule.type === "rotation") return getNextRotationVisit(place);
  return getNextIntervalVisit(schedule);
}

function getStatus(place) {
  const today = todayString();
  const nextVisit = getNextVisit(place);
  const diff = daysBetween(today, nextVisit);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 7) return "soon";
  return "normal";
}

function statusLabel(status) {
  return {
    overdue: "지연",
    today: "오늘",
    soon: "곧 방문",
    normal: "정상"
  }[status];
}

function scheduleLabel(place) {
  const schedule = getSchedule(place);
  if (schedule.type === "weekday") {
    const days = (schedule.weekdays || []).map((day) => WEEKDAY_LABELS[Number(day)]).join(", ");
    return `${days} ${timeSlotLabel(schedule.timeSlot)}`.trim();
  }
  if (schedule.type === "rotation") {
    return `${schedule.group} / ${schedule.intervalDays}일 간격 / ${schedule.order}번`;
  }
  const unit = { days: "일", weeks: "주", months: "개월" }[schedule.unit || "days"];
  return `${schedule.interval || 1}${unit}마다 ${timeSlotLabel(schedule.timeSlot)}`.trim();
}

function timeSlotLabel(value) {
  if (!value || value === "all-day") return "";
  return TIME_SLOT_LABELS[value] || "";
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state.places = Array.isArray(parsed.places) ? parsed.places : [];
      return;
    } catch {
      state.places = [];
    }
  }

  if (localStorage.getItem(LEGACY_KEY)) {
    localStorage.removeItem(LEGACY_KEY);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ places: state.places }));
}

function sortPlaces(places) {
  const priority = { overdue: 0, today: 1, soon: 2, normal: 3 };
  return [...places].sort((a, b) => {
    const statusDiff = priority[getStatus(a)] - priority[getStatus(b)];
    if (statusDiff !== 0) return statusDiff;
    return getNextVisit(a).localeCompare(getNextVisit(b));
  });
}

function getVisiblePlaces() {
  const keyword = state.search.trim().toLowerCase();
  return sortPlaces(state.places).filter((place) => {
    const haystack = [place.name, place.address, place.note, scheduleLabel(place)].join(" ").toLowerCase();
    return haystack.includes(keyword);
  });
}

function updateCounts() {
  const counts = { overdue: 0, today: 0, soon: 0, total: state.places.length };
  state.places.forEach((place) => {
    const status = getStatus(place);
    if (counts[status] !== undefined) counts[status] += 1;
  });
  el.counts.overdue.textContent = counts.overdue;
  el.counts.today.textContent = counts.today;
  el.counts.soon.textContent = counts.soon;
  el.counts.total.textContent = counts.total;
}

function render() {
  updateCounts();
  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === state.activeView);
  });
  el.todayView.classList.toggle("hidden", state.activeView !== "today");
  el.allView.classList.toggle("hidden", state.activeView !== "all");
  renderTodayView();
  renderAllView();
}

function renderTodayView() {
  const duePlaces = sortPlaces(state.places).filter((place) => {
    const status = getStatus(place);
    return status === "overdue" || status === "today";
  });

  if (duePlaces.length === 0) {
    el.todayList.innerHTML = `<div class="empty">오늘 방문할 곳이 없습니다.</div>`;
  } else {
    el.todayList.innerHTML = duePlaces.map((place) => renderScheduleRow(place)).join("");
  }

  const upcoming = sortPlaces(state.places).filter((place) => getStatus(place) === "soon");
  if (upcoming.length === 0) {
    el.upcomingList.innerHTML = "";
    return;
  }

  const grouped = upcoming.reduce((groups, place) => {
    const date = getNextVisit(place);
    groups[date] = groups[date] || [];
    groups[date].push(place);
    return groups;
  }, {});

  el.upcomingList.innerHTML = `
    <h2>곧 방문</h2>
    ${Object.keys(grouped).sort().map((date) => `
      <div class="upcoming-group">
        <h3>${date}</h3>
        ${grouped[date].map((place) => `
          <div class="upcoming-item">
            <strong>${escapeHtml(place.name)}</strong>
            <span>${escapeHtml(scheduleLabel(place))}</span>
          </div>
        `).join("")}
      </div>
    `).join("")}
  `;
}

function renderAllView() {
  const places = getVisiblePlaces();
  if (places.length === 0) {
    el.placeList.innerHTML = `<div class="empty">등록된 방문처가 없습니다. 방문처를 추가해보세요.</div>`;
    return;
  }

  el.placeList.innerHTML = places.map((place) => renderManageRow(place)).join("");
}

function renderScheduleRow(place) {
  const status = getStatus(place);
  const nextVisit = getNextVisit(place);
  const dateLabel = status === "overdue" ? "지연" : "오늘";
  return `
    <article class="schedule-row">
      <div class="schedule-date">
        <b>${dateLabel}</b>
        ${nextVisit}
      </div>
      <div class="schedule-main">
        <strong>${escapeHtml(place.name)}</strong>
        <span>${escapeHtml(scheduleLabel(place))}</span>
      </div>
      <button class="done-btn" data-action="complete" data-id="${place.id}" type="button" aria-label="방문 완료">✓</button>
    </article>
  `;
}

function renderManageRow(place) {
  const status = getStatus(place);
  const nextVisit = getNextVisit(place);
  const lastVisit = place.lastVisit || getSchedule(place).lastVisit || "-";
  const isOpen = state.openDetailId === place.id;
  return `
    <article class="manage-row">
      <div class="schedule-main">
        <strong>${escapeHtml(place.name)}</strong>
        <span>${nextVisit} · ${statusLabel(status)} · ${escapeHtml(scheduleLabel(place))}</span>
      </div>
      <button class="row-more-btn" data-action="toggle" data-id="${place.id}" type="button" aria-label="상세 보기">${isOpen ? "−" : "+"}</button>
      <div class="detail-panel ${isOpen ? "open" : ""}">
        <div class="meta">
          <span><b>${nextVisit}</b>다음 방문</span>
          <span><b>${lastVisit}</b>마지막 방문</span>
          <span><b>${escapeHtml(scheduleLabel(place))}</b>스케줄</span>
        </div>
        ${place.address ? `<p class="note">${escapeHtml(place.address)}</p>` : ""}
        ${place.note ? `<p class="note">${escapeHtml(place.note)}</p>` : ""}
        <div class="detail-actions">
          <button class="primary-btn" data-action="complete" data-id="${place.id}" type="button">완료</button>
          <button class="secondary-btn" data-action="history" data-id="${place.id}" type="button">기록</button>
          <button class="secondary-btn" data-action="edit" data-id="${place.id}" type="button">수정</button>
        </div>
      </div>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateScheduleFields() {
  const type = el.scheduleTypeInput.value;
  el.intervalFields.classList.toggle("hidden", type !== "interval");
  el.weekdayFields.classList.toggle("hidden", type !== "weekday");
  el.rotationFields.classList.toggle("hidden", type !== "rotation");
}

function openPlaceDialog(place = null) {
  el.placeForm.reset();
  const schedule = place ? getSchedule(place) : { type: "interval" };
  el.placeId.value = place?.id || "";
  el.dialogTitle.textContent = place ? "방문처 수정" : "방문처 추가";
  el.deleteBtn.classList.toggle("hidden", !place);
  el.nameInput.value = place?.name || "";
  el.addressInput.value = place?.address || "";
  el.scheduleTypeInput.value = schedule.type || "interval";
  el.intervalInput.value = schedule.interval || 1;
  el.unitInput.value = schedule.unit || "days";
  el.lastVisitInput.value = schedule.lastVisit || place?.lastVisit || todayString();
  el.weekdayInputs.forEach((input) => {
    input.checked = (schedule.weekdays || []).map(Number).includes(Number(input.value));
  });
  el.rotationGroupInput.value = schedule.group || "";
  el.rotationIntervalInput.value = schedule.intervalDays || 2;
  el.rotationOrderInput.value = schedule.order || 1;
  el.rotationStartInput.value = schedule.startDate || todayString();
  el.timeSlotInput.value = schedule.timeSlot || "all-day";
  el.noteInput.value = place?.note || "";
  updateScheduleFields();
  el.placeDialog.showModal();
}

function closePlaceDialog() {
  el.placeDialog.close();
}

function readScheduleFromForm(existing) {
  const type = el.scheduleTypeInput.value;
  const timeSlot = el.timeSlotInput.value;
  if (type === "weekday") {
    const weekdays = el.weekdayInputs.filter((input) => input.checked).map((input) => Number(input.value));
    return {
      type,
      weekdays: weekdays.length ? weekdays : [new Date().getDay()],
      timeSlot
    };
  }
  if (type === "rotation") {
    return {
      type,
      group: el.rotationGroupInput.value.trim() || "순번 그룹",
      intervalDays: Number(el.rotationIntervalInput.value || 2),
      order: Number(el.rotationOrderInput.value || 1),
      startDate: el.rotationStartInput.value || todayString(),
      timeSlot
    };
  }
  return {
    type,
    interval: Number(el.intervalInput.value || 1),
    unit: el.unitInput.value,
    lastVisit: el.lastVisitInput.value || existing?.lastVisit || todayString(),
    timeSlot
  };
}

function handleSave(event) {
  event.preventDefault();
  const id = el.placeId.value || crypto.randomUUID();
  const existing = state.places.find((place) => place.id === id);
  const schedule = readScheduleFromForm(existing);
  const place = {
    id,
    name: el.nameInput.value.trim(),
    address: el.addressInput.value.trim(),
    schedule,
    lastVisit: schedule.lastVisit || existing?.lastVisit || "-",
    note: el.noteInput.value.trim(),
    history: existing?.history || []
  };

  if (existing) {
    state.places = state.places.map((item) => item.id === id ? place : item);
  } else {
    place.history = [{
      id: crypto.randomUUID(),
      date: place.lastVisit === "-" ? todayString() : place.lastVisit,
      memo: "초기 등록",
      createdAt: new Date().toISOString()
    }];
    state.places.push(place);
  }

  saveState();
  closePlaceDialog();
  render();
}

function completeVisit(id) {
  const today = todayString();
  state.places = state.places.map((place) => {
    if (place.id !== id) return place;
    const schedule = getSchedule(place);
    const nextSchedule = schedule.type === "interval" ? { ...schedule, lastVisit: today } : schedule;
    return {
      ...place,
      schedule: nextSchedule,
      lastVisit: today,
      history: [
        {
          id: crypto.randomUUID(),
          date: today,
          memo: "방문 완료",
          createdAt: new Date().toISOString()
        },
        ...(place.history || [])
      ]
    };
  });
  saveState();
  render();
}

function deleteCurrentPlace() {
  const id = el.placeId.value;
  if (!id) return;
  const place = state.places.find((item) => item.id === id);
  if (!place) return;
  if (!confirm(`${place.name} 방문처를 삭제할까요?`)) return;
  state.places = state.places.filter((item) => item.id !== id);
  saveState();
  closePlaceDialog();
  render();
}

function openHistory(id) {
  const place = state.places.find((item) => item.id === id);
  if (!place) return;
  el.historyTitle.textContent = `${place.name} 방문 기록`;
  const history = place.history || [];
  el.historyList.innerHTML = history.length
    ? history.map((item) => `
      <div class="history-item">
        <strong>${item.date}</strong>
        <span>${escapeHtml(item.memo || "방문")}</span>
      </div>
    `).join("")
    : `<div class="empty">아직 방문 기록이 없습니다.</div>`;
  el.historyDialog.showModal();
}

function exportData() {
  const blob = new Blob([JSON.stringify({ places: state.places }, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `visit-schedule-backup-${todayString()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!Array.isArray(parsed.places)) throw new Error("Invalid file");
      state.places = parsed.places;
      saveState();
      render();
      alert("복원이 완료되었습니다.");
    } catch {
      alert("복원할 수 없는 파일입니다.");
    } finally {
      el.importInput.value = "";
    }
  };
  reader.readAsText(file);
}

function makeIntervalPlace(name, interval, unit = "days", timeSlot = "all-day", note = "") {
  return {
    id: crypto.randomUUID(),
    name,
    address: "",
    schedule: {
      type: "interval",
      interval,
      unit,
      lastVisit: todayString(),
      timeSlot
    },
    lastVisit: todayString(),
    note,
    history: [{ id: crypto.randomUUID(), date: todayString(), memo: "초기 등록", createdAt: new Date().toISOString() }]
  };
}

function makeWeekdayPlace(name, weekdays, timeSlot) {
  return {
    id: crypto.randomUUID(),
    name,
    address: "",
    schedule: { type: "weekday", weekdays, timeSlot },
    lastVisit: "-",
    note: "",
    history: []
  };
}

function makeRotationPlaces(group, names, intervalDays, startDate, note = "") {
  return names.map((name, index) => ({
    id: crypto.randomUUID(),
    name,
    address: "",
    schedule: {
      type: "rotation",
      group,
      intervalDays,
      order: index + 1,
      groupSize: names.length,
      startDate,
      timeSlot: "all-day"
    },
    lastVisit: "-",
    note,
    history: []
  }));
}

function seedIfEmpty() {
  if (state.places.length > 0) return;
  const today = todayString();
  state.places = [
    ...["세븐주차장", "계단집", "미쿠니", "다맛", "사거리", "30표지판", "어멍", "한전"]
      .map((name) => makeIntervalPlace(name, 1)),
    ...makeRotationPlaces("이틀 방문 A그룹", ["흑섬", "세븐", "식수원"], 2, today, "이틀마다 한 곳씩 순번 방문"),
    ...makeRotationPlaces("이틀 방문 B그룹", ["교회", "오페라", "창고근처집"], 2, today, "이틀마다 한 곳씩 순번 방문"),
    makeIntervalPlace("방파제", 2, "days", "half-day"),
    makeIntervalPlace("서흘길맥", 3, "days", "half-day"),
    makeIntervalPlace("바닷가", 3, "days", "half-day"),
    makeIntervalPlace("방파제 입구", 3),
    makeIntervalPlace("창고", 5),
    makeWeekdayPlace("신촌", [3, 0], "evening")
  ];
  saveState();
}

function bindEvents() {
  el.newPlaceBtn.addEventListener("click", () => openPlaceDialog());
  el.closeDialogBtn.addEventListener("click", closePlaceDialog);
  el.closeHistoryBtn.addEventListener("click", () => el.historyDialog.close());
  el.placeForm.addEventListener("submit", handleSave);
  el.deleteBtn.addEventListener("click", deleteCurrentPlace);
  el.exportBtn.addEventListener("click", exportData);
  el.importInput.addEventListener("change", (event) => importData(event.target.files[0]));
  el.scheduleTypeInput.addEventListener("change", updateScheduleFields);
  el.search.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });

  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activeView = tab.dataset.view;
      render();
    });
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;
    const place = state.places.find((item) => item.id === id);
    if (action === "complete") completeVisit(id);
    if (action === "history") openHistory(id);
    if (action === "edit") openPlaceDialog(place);
    if (action === "toggle") {
      state.openDetailId = state.openDetailId === id ? null : id;
      render();
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    el.installBtn.classList.remove("hidden");
  });

  el.installBtn.addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    el.installBtn.classList.add("hidden");
  });
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("sw.js");
    } catch {
      console.warn("Service worker registration failed");
    }
  }
}

loadState();
seedIfEmpty();
bindEvents();
render();
registerServiceWorker();
