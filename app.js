const STORAGE_KEY = "visit-schedule-pwa-v1";

const state = {
  places: [],
  activeFilter: "all",
  search: "",
  deferredInstallPrompt: null
};

const el = {
  list: document.querySelector("#placeList"),
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
  intervalInput: document.querySelector("#intervalInput"),
  unitInput: document.querySelector("#unitInput"),
  lastVisitInput: document.querySelector("#lastVisitInput"),
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
  return new Date().toISOString().slice(0, 10);
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

function getNextVisit(place) {
  return addInterval(place.lastVisit, Number(place.interval), place.unit);
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

function intervalLabel(place) {
  const unit = {
    days: "일",
    weeks: "주",
    months: "개월"
  }[place.unit];
  return `${place.interval}${unit}마다`;
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    state.places = Array.isArray(parsed.places) ? parsed.places : [];
  } catch {
    state.places = [];
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
    const status = getStatus(place);
    const matchesFilter = state.activeFilter === "all" || state.activeFilter === status;
    const haystack = [place.name, place.address, place.note].join(" ").toLowerCase();
    return matchesFilter && haystack.includes(keyword);
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
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.filter === state.activeFilter);
  });

  const places = getVisiblePlaces();
  if (places.length === 0) {
    el.list.innerHTML = `<div class="empty">등록된 방문처가 없습니다. 방문처를 추가해보세요.</div>`;
    return;
  }

  el.list.innerHTML = places.map((place) => {
    const status = getStatus(place);
    const nextVisit = getNextVisit(place);
    return `
      <article class="place-card">
        <div>
          <div class="place-title-row">
            <h3>${escapeHtml(place.name)}</h3>
            <span class="badge ${status}">${statusLabel(status)}</span>
          </div>
          <div class="meta">
            <span><b>${nextVisit}</b>다음 방문</span>
            <span><b>${place.lastVisit}</b>마지막 방문</span>
            <span><b>${intervalLabel(place)}</b>방문 주기</span>
          </div>
          ${place.address ? `<p class="note">${escapeHtml(place.address)}</p>` : ""}
          ${place.note ? `<p class="note">${escapeHtml(place.note)}</p>` : ""}
        </div>
        <div class="card-actions">
          <button class="primary-btn" data-action="complete" data-id="${place.id}" type="button">방문 완료</button>
          <button class="secondary-btn" data-action="history" data-id="${place.id}" type="button">기록</button>
          <button class="secondary-btn" data-action="edit" data-id="${place.id}" type="button">수정</button>
        </div>
      </article>
    `;
  }).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openPlaceDialog(place = null) {
  el.placeForm.reset();
  el.placeId.value = place?.id || "";
  el.dialogTitle.textContent = place ? "방문처 수정" : "방문처 추가";
  el.deleteBtn.classList.toggle("hidden", !place);
  el.nameInput.value = place?.name || "";
  el.addressInput.value = place?.address || "";
  el.intervalInput.value = place?.interval || 1;
  el.unitInput.value = place?.unit || "days";
  el.lastVisitInput.value = place?.lastVisit || todayString();
  el.noteInput.value = place?.note || "";
  el.placeDialog.showModal();
}

function closePlaceDialog() {
  el.placeDialog.close();
}

function handleSave(event) {
  event.preventDefault();
  const id = el.placeId.value || crypto.randomUUID();
  const existing = state.places.find((place) => place.id === id);
  const place = {
    id,
    name: el.nameInput.value.trim(),
    address: el.addressInput.value.trim(),
    interval: Number(el.intervalInput.value),
    unit: el.unitInput.value,
    lastVisit: el.lastVisitInput.value,
    note: el.noteInput.value.trim(),
    history: existing?.history || []
  };

  if (existing) {
    state.places = state.places.map((item) => item.id === id ? place : item);
  } else {
    place.history = [{
      id: crypto.randomUUID(),
      date: place.lastVisit,
      memo: "초기 마지막 방문일",
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
    return {
      ...place,
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

function seedIfEmpty() {
  if (state.places.length > 0) return;
  state.places = [
    {
      id: crypto.randomUUID(),
      name: "샘플 방문처",
      address: "주소 또는 위치 메모를 입력하세요.",
      interval: 14,
      unit: "days",
      lastVisit: todayString(),
      note: "수정 버튼으로 실제 방문처로 바꿔보세요.",
      history: [{
        id: crypto.randomUUID(),
        date: todayString(),
        memo: "샘플 기록",
        createdAt: new Date().toISOString()
      }]
    }
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
  el.search.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activeFilter = tab.dataset.filter;
      render();
    });
  });

  el.list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;
    const place = state.places.find((item) => item.id === id);
    if (action === "complete") completeVisit(id);
    if (action === "history") openHistory(id);
    if (action === "edit") openPlaceDialog(place);
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
