// Version 5.1 - Multi-Week, Admin Week Editor & UI Highlights

const firebaseConfig = {
	apiKey: "AIzaSyBchrPCAav08CfPBKSTmaHvMrEoid2NxEU",
	authDomain: "smcs-schedule.firebaseapp.com",
	databaseURL: "https://smcs-schedule-default-rtdb.firebaseio.com",
	projectId: "smcs-schedule",
	storageBucket: "smcs-schedule.firebasestorage.app",
	messagingSenderId: "149883464185",
	appId: "1:149883464185:web:7658c2705351908b453528",
	measurementId: "G-33TVT5J6C6"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const AUTH_KEY = "smcs-schedule-admin-auth";
const AUTH_USER_KEY = "smcs-schedule-admin-user";

const TEACHERS = {
	"charles": { password: "SMCS", name: "Mr. Yu", course: "Bio" },
	"hallisey": { password: "SMCS", name: "Ms. Hallisey", course: "CS" },
	"kingman": { password: "SMCS", name: "Mr. Kingman", course: "ESS" },
	"bayonet": { password: "SMCS", name: "Ms. Bayonet", course: "FOT" }
};

const COURSES = ["Bio", "CS", "ESS", "FOT"];
const DAYS = ["MON", "TUE", "WED", "THU", "FRI"];

const COURSE_LIBRARY = {
	Bio: { teacher: "Mr. Yu", room: "2614" },
	CS: { teacher: "Ms. Hallisey", room: "1702" },
	ESS: { teacher: "Mr. Kingman", room: "1708" },
	FOT: { teacher: "Ms. Bayonet", room: "1620" },
};

const EMPTY_BLOCK = { course: "None", teacher: "", room: "", length: 1, note: "" };

function createEmptyWeek() {
	const week = {};
	DAYS.forEach(day => {
		week[day] = [1, 2, 3, 4].map(p => ({
			period: p,
			x: { ...EMPTY_BLOCK },
			y: { ...EMPTY_BLOCK }
		}));
	});
	return week;
}

const DEFAULT_SCHEDULE = {
	weeks: [createEmptyWeek(), createEmptyWeek()],
	events: [{ period: "all", title: "Welcome Assembly", note: "Gym after Period 2", description: "" }],
};

const state = {
	schedule: DEFAULT_SCHEDULE,
	darkMode: true,
	selectedCourse: null,
	publicView: 'week',
	adminView: 'day', // 'day' or 'week'
	currentWeekIdx: 0,
	currentDay: "MON",
};

document.addEventListener("DOMContentLoaded", () => {
	const page = document.body.dataset.page;
	loadDarkModePreference();

	db.ref('schedule').on('value', (snapshot) => {
		const data = snapshot.val();
		state.schedule = ensureScheduleShape(data);
		if (page === "public") renderPublicPage();
		if (page === "admin") renderAdminPage();
	});

	if (page === "public") initPublicPage();
	if (page === "admin") initAdminPage();
});

function saveSchedule(s) {
	const n = ensureScheduleShape(s);
	applyAutoMerge(n);
	state.schedule = n;
	db.ref('schedule').set(n);
	return n;
}

function applyAutoMerge(schedule) {
	schedule.weeks.forEach(week => {
		DAYS.forEach(day => {
			const periods = week[day];
			for (let idx = 0; idx < periods.length - 1; idx++) {
				['x', 'y'].forEach(key => {
					const b1 = periods[idx][key];
					const b2 = periods[idx+1][key];
					const prev = idx > 0 ? periods[idx-1] : null;
					if (prev && Number(prev[key].length) === 2) return;
					if (b1.course && b1.course !== "None" && b1.course === b2.course) {
						b1.length = 2; b2.teacher = b1.teacher; b2.room = b1.room; b2.length = 1;
					} else if (Number(b1.length) === 2) {
						if (b1.course !== b2.course) b1.length = 1;
					}
				});
			}
		});
	});
}

function initPublicPage() {
	document.getElementById("weekViewBtn")?.addEventListener("click", () => { state.publicView = 'week'; renderPublicPage(); });
	document.getElementById("dayViewBtn")?.addEventListener("click", () => { state.publicView = 'day'; renderPublicPage(); });
	document.getElementById("week0Btn")?.addEventListener("click", () => { state.currentWeekIdx = 0; renderPublicPage(); });
	document.getElementById("week1Btn")?.addEventListener("click", () => { state.currentWeekIdx = 1; renderPublicPage(); });
	setupSettingsMenu();
	renderPublicPage();
}

function updateViewToggle() {
	document.getElementById("weekViewBtn")?.classList.toggle("active", state.publicView === 'week');
	document.getElementById("dayViewBtn")?.classList.toggle("active", state.publicView === 'day');

	const ranges = getWeekDateRanges();
	const w0 = document.getElementById("week0Btn");
	const w1 = document.getElementById("week1Btn");
	if (w0) { w0.textContent = ranges[0]; w0.classList.toggle("active", state.currentWeekIdx === 0); }
	if (w1) { w1.textContent = ranges[1]; w1.classList.toggle("active", state.currentWeekIdx === 1); }
}

function getWeekDateRanges() {
	const now = new Date();
	const day = now.getDay();
	const diff = now.getDate() - day + (day === 0 ? -6 : 1);
	const monday = new Date(now.setDate(diff));
	const format = (d) => `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`;
	const getRange = (offset) => {
		const start = new Date(monday); start.setDate(monday.getDate() + offset);
		const end = new Date(monday); end.setDate(monday.getDate() + offset + 4);
		return `${format(start)} - ${format(end)}`;
	};
	return [getRange(0), getRange(7)];
}

function renderPublicPage() {
	updateViewToggle();
	const container = document.getElementById("publicSchedule");
	let html = renderLiveTimer();
	if (state.publicView === 'day') {
		const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
		let today = days[new Date().getDay()];
		if (!DAYS.includes(today)) today = "MON";
		html += `<h2 class="day-view-title">${today} Schedule - Week ${state.currentWeekIdx + 1}</h2>`;
		html += renderTable(state.schedule.weeks[state.currentWeekIdx][today], false);
	} else {
		html += renderFullWeekView();
	}
	container.innerHTML = html;
	document.getElementById("publicEvents").innerHTML = renderEventFeed(state.schedule);
}

function renderFullWeekView() {
	const weekData = state.schedule.weeks[state.currentWeekIdx];
	const daysEnum = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
	const todayDay = daysEnum[new Date().getDay()];

	const renderGroup = (key, label) => {
		let h = `<div class="week-group-section"><h3 class="week-group-title ${key}">${label}</h3><div class="full-week-grid"><div class="week-corner"></div>`;
		DAYS.forEach(day => {
			const isToday = day === todayDay;
			h += `<div class="week-day-header ${isToday ? 'is-today' : ''}"><div class="week-day-name">${day}</div></div>`;
		});
		[1, 2, 3, 4].forEach(pNum => {
			h += `<div class="week-period-row"><div class="week-period-label">P${pNum}</div>`;
			DAYS.forEach(day => {
				const isToday = day === todayDay;
				const block = weekData[day][pNum-1][key];
				const empty = block.course === "None";
				h += `<div class="week-cell ${key} ${empty ? 'empty' : 'has-class'} ${isToday ? 'is-today' : ''}">
					${empty ? '' : `<div class="week-course">${escapeHtml(block.course)}</div><div class="week-room">Rm ${escapeHtml(block.room)}</div>`}
				</div>`;
			});
			h += `</div>`;
		});
		return h + `</div></div>`;
	};
	return `<div class="multi-week-container">${renderGroup('x', 'Block X')}${renderGroup('y', 'Block Y')}</div>`;
}

function renderTable(periods, isAdmin) {
	let html = `<table class="schedule-table ${isAdmin ? 'admin-table' : ''}"><thead><tr><th>Period</th><th>Block X</th><th>Block Y</th></tr></thead><tbody>`;
	periods.forEach((p, idx) => {
		const prev = idx > 0 ? periods[idx-1] : null;
		const skipX = prev && Number(prev.x.length) === 2;
		const skipY = prev && Number(prev.y.length) === 2;
		html += `<tr><td class="period-col"><span class="period-label">P${p.period}</span></td>
			${skipX ? '' : `<td class="block-col" data-period-index="${idx}" data-block="x" ${Number(p.x.length) === 2 ? 'rowspan="2"' : ''}>${isAdmin ? renderAdminBlock(p.x, 'x', idx) : renderPublicBlock(p.x)}</td>`}
			${skipY ? '' : `<td class="block-col" data-period-index="${idx}" data-block="y" ${Number(p.y.length) === 2 ? 'rowspan="2"' : ''}>${isAdmin ? renderAdminBlock(p.y, 'y', idx) : renderPublicBlock(p.y)}</td>`}
		</tr>`;
	});
	return html + `</tbody></table>`;
}

function renderPublicBlock(b) {
	if (b.course === "None") return "";
	return `<div class="table-block"><div class="course-name">${escapeHtml(b.course)}</div><div class="teacher-name">${escapeHtml(b.teacher)}</div><div class="room-number">Room ${escapeHtml(b.room)}</div>${Number(b.length) === 2 ? '<div class="double-badge">Double</div>' : ''}</div>`;
}

function renderAdminPage() {
	const user = getLoggedInUser();
	const heroTitle = document.querySelector(".hero h1");
	if (heroTitle && user) heroTitle.textContent = `Editor: ${user.name}`;

	document.getElementById("adminDayViewBtn")?.classList.toggle("active", state.adminView === 'day');
	document.getElementById("adminWeekViewBtn")?.classList.toggle("active", state.adminView === 'week');
	document.getElementById("adminDaySelect")?.closest('.admin-nav-group')?.classList.toggle('hidden', state.adminView === 'week');

	const wSelect = document.getElementById("adminWeekSelect");
	if (wSelect) wSelect.value = state.currentWeekIdx;
	const dSelect = document.getElementById("adminDaySelect");
	if (dSelect) dSelect.value = state.currentDay;

	const container = document.getElementById("adminSchedule");
	if (state.adminView === 'day') {
		container.innerHTML = renderTable(state.schedule.weeks[state.currentWeekIdx][state.currentDay], true);
	} else {
		container.innerHTML = renderAdminWeekGrid();
	}

	document.getElementById("adminClassCards").innerHTML = renderClassCards();
	document.getElementById("eventsEditor").innerHTML = renderEventsEditor(state.schedule);
	updateSaveStatus();
	setupDragAndDrop();
}

function renderAdminWeekGrid() {
	const weekData = state.schedule.weeks[state.currentWeekIdx];
	let h = `<div class="multi-week-container"><div class="week-group-section"><div class="full-week-grid admin-week-grid"><div class="week-corner"></div>`;
	DAYS.forEach(day => h += `<div class="week-day-header"><div class="week-day-name">${day}</div></div>`);
	[1, 2, 3, 4].forEach(pNum => {
		h += `<div class="week-period-row"><div class="week-period-label">P${pNum}</div>`;
		DAYS.forEach(day => {
			const bx = weekData[day][pNum-1].x;
			const by = weekData[day][pNum-1].y;
			h += `<div class="week-cell admin-cell">
				<div class="week-sub-cell x ${bx.course==='None'?'empty':'has-class'}" data-day="${day}" data-period-index="${pNum-1}" data-block="x">
					<span class="sub-label">X</span>${bx.course==='None'?'':bx.course}
				</div>
				<div class="week-sub-cell y ${by.course==='None'?'empty':'has-class'}" data-day="${day}" data-period-index="${pNum-1}" data-block="y">
					<span class="sub-label">Y</span>${by.course==='None'?'':by.course}
				</div>
			</div>`;
		});
		h += `</div>`;
	});
	return h + `</div></div></div>`;
}

function renderAdminBlock(block, key, idx) {
	const isDouble = Number(block.length) === 2;
	const empty = block.course === "None";
	const periods = state.schedule.weeks[state.currentWeekIdx][state.currentDay];
	let conflict = false;
	if (!empty) {
		periods.forEach((p, pIdx) => {
			if (pIdx !== idx && p[key].course === block.course) {
				if (Math.abs(pIdx - idx) > 1 || (Number(block.length) !== 2 && Number(p[key].length) !== 2)) conflict = true;
			}
		});
	}
	return `<div class="admin-block-cell ${isDouble ? 'is-double' : ''} ${conflict ? 'has-conflict' : ''} ${empty ? 'is-empty' : ''}" draggable="${!empty}" data-period-index="${idx}" data-block-key="${key}">
		${empty ? '<div class="empty-placeholder">Empty</div>' : `
		<div class="block-info"><div class="course-name">${escapeHtml(block.course)}</div><div class="teacher-name">${escapeHtml(block.teacher)}</div></div>
		<div class="block-controls"><input type="text" class="room-input" data-room-edit value="${escapeAttribute(block.room)}" data-period-index="${idx}" data-block-key="${key}" autocomplete="off">
		<div class="block-actions"><button class="toggle-double-btn ${isDouble ? 'active' : ''}" data-action="toggle-double" data-period-index="${idx}" data-block-key="${key}">Double</button></div></div>
		${isDouble ? '<div class="double-badge">Double</div>' : ''}`}
	</div>`;
}

function setupDragAndDrop() {
	const cards = document.querySelectorAll('.draggable-card');
	const tableBlocks = document.querySelectorAll('.admin-block-cell[draggable="true"]');
	const dayZones = document.querySelectorAll('.admin-table td.block-col');
	const weekZones = document.querySelectorAll('.week-sub-cell');

	cards.forEach(c => c.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', 'lib:' + c.dataset.course)));
	document.querySelectorAll('.draggable-card').forEach(c => c.addEventListener('click', () => {
		document.querySelectorAll('.draggable-card').forEach(card => card.classList.remove('active-selection'));
		if (state.selectedCourse === c.dataset.course) state.selectedCourse = null;
		else { state.selectedCourse = c.dataset.course; c.classList.add('active-selection'); }
	}));

	tableBlocks.forEach(b => b.addEventListener('dragstart', e => {
		const info = { day: state.currentDay, idx: b.dataset.periodIndex, key: b.dataset.blockKey };
		e.dataTransfer.setData('text/plain', 'table:' + JSON.stringify(info));
	}));

	const handleDrop = (e, zone, d, idx, key) => {
		e.preventDefault(); zone.classList.remove('drag-over');
		handleSelection(idx, key, e.dataTransfer.getData('text/plain'), e, zone, d);
	};

	dayZones.forEach(z => {
		const k = z.dataset.block, i = Number(z.dataset.periodIndex);
		z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('drag-over'); });
		z.addEventListener('dragleave', () => z.classList.remove('drag-over'));
		z.addEventListener('drop', e => handleDrop(e, z, state.currentDay, i, k));
		z.addEventListener('click', e => {
			if (!e.target.closest('input,button') && state.selectedCourse) handleSelection(i, k, 'lib:' + state.selectedCourse, e, z, state.currentDay);
		});
	});

	weekZones.forEach(z => {
		const d = z.dataset.day, i = Number(z.dataset.periodIndex), k = z.dataset.block;
		z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('drag-over'); });
		z.addEventListener('dragleave', () => z.classList.remove('drag-over'));
		z.addEventListener('drop', e => handleDrop(e, z, d, i, k));
		z.addEventListener('click', () => { if (state.selectedCourse) handleSelection(i, k, 'lib:' + state.selectedCourse, null, z, d); });
	});
}

function handleSelection(tIdx, key, raw, event, zone, day) {
	if (!raw) return;
	const week = state.schedule.weeks[state.currentWeekIdx];
	if (Number(week[day][tIdx][key].length) === 2 && event) {
		const rect = zone.getBoundingClientRect();
		if ((event.clientY - rect.top) > rect.height / 2) tIdx++;
	}

	if (raw.startsWith('lib:')) {
		const course = raw.replace('lib:', '');
		const block = week[day][tIdx][key];
		block.course = course;
		const lib = COURSE_LIBRARY[course] || COURSE_LIBRARY.Bio;
		block.teacher = lib.teacher; block.room = lib.room; block.length = 1;
	} else if (raw.startsWith('table:')) {
		const src = JSON.parse(raw.replace('table:', ''));
		const sBlock = week[src.day][src.idx][src.key];
		const tBlock = week[day][tIdx][key];
		const temp = { ...sBlock };
		sBlock.course = tBlock.course; sBlock.teacher = tBlock.teacher; sBlock.room = tBlock.room; sBlock.length = 1;
		tBlock.course = temp.course; tBlock.teacher = temp.teacher; tBlock.room = temp.room; tBlock.length = 1;
	}
	saveSchedule(state.schedule);
}

function initAdminPage() {
	if (!isAuthenticated()) { document.body.classList.add('auth-mode'); return; }
	document.body.classList.remove('auth-mode');
	document.getElementById("loginPanel").hidden = true; document.getElementById("adminApp").hidden = false;

	const daysEnum = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
	const today = daysEnum[new Date().getDay()];
	if (DAYS.includes(today)) state.currentDay = today;

	document.getElementById("adminDayViewBtn")?.addEventListener("click", () => { state.adminView = 'day'; renderAdminPage(); });
	document.getElementById("adminWeekViewBtn")?.addEventListener("click", () => { state.adminView = 'week'; renderAdminPage(); });
	document.getElementById("adminWeekSelect")?.addEventListener("change", e => { state.currentWeekIdx = Number(e.target.value); renderAdminPage(); });
	document.getElementById("adminDaySelect")?.addEventListener("change", e => { state.currentDay = e.target.value; renderAdminPage(); });
	document.getElementById("adminLoginForm").addEventListener("submit", handleAdminLogin);
	document.getElementById("logoutButton").addEventListener("click", handleLogout);

	const app = document.getElementById("adminApp");
	app.addEventListener("change", handleAdminInput); app.addEventListener("click", handleAdminClick);
	renderAdminPage(); setupSettingsMenu();
}

function handleAdminClick(event) {
	const target = event.target;
	if (target.closest("#resetButton")) resetSampleSchedule();
	if (target.closest("#clearAllButton")) clearAllClasses();
	if (target.closest("#exportButton")) exportSchedule();
	if (target.closest("#addEventButton")) addEventRow();
	if (target.closest("[data-action='delete-event']")) deleteEventRow(Number(target.closest("[data-action='delete-event']").dataset.eventIndex));
	if (target.closest("[data-action='toggle-description']")) {
		const btn = target.closest("[data-action='toggle-description']");
		const el = document.querySelector(`.desc-container[data-event-index="${btn.dataset.eventIndex}"]`);
		if (el) { el.classList.toggle('hidden'); btn.textContent = el.classList.contains('hidden') ? 'Add description' : 'Hide description'; }
	}
	if (target.closest("[data-action='toggle-double']")) {
		const btn = target.closest("[data-action='toggle-double']");
		const idx = Number(btn.dataset.periodIndex), key = btn.dataset.blockKey;
		const periods = state.schedule.weeks[state.currentWeekIdx][state.currentDay];
		const block = periods[idx][key];
		block.length = Number(block.length) === 1 ? 2 : 1;
		if (Number(block.length) === 2 && periods[idx+1]) {
			const next = periods[idx+1][key];
			next.course = block.course; next.teacher = block.teacher; next.room = block.room; next.length = 1;
		}
		saveSchedule(state.schedule);
	}
}

function renderLiveTimer() {
	const now = new Date();
	const day = now.getDay();
	const time = now.getHours() * 60 + now.getMinutes();
	if (day === 0 || day === 6) return `<div class="live-status-card weekend">Weekend Mode</div>`;
	const sch = [{ p: 1, s: 480, e: 570 }, { p: 2, s: 585, e: 675 }, { p: 3, s: 735, e: 825 }, { p: 4, s: 840, e: 930 }];
	const curr = sch.find(s => time >= s.s && time <= s.e);
	const next = sch.find(s => s.s > time);
	if (curr) return `<div class="live-status-card active">Period ${curr.p} ends in ${curr.e - time}m</div>`;
	if (next) return `<div class="live-status-card break">Break: Period ${next.p} starts in ${next.s - time}m</div>`;
	return `<div class="live-status-card off">School Day Over</div>`;
}

function renderEventFeed(s) {
	if (!s.events.length) return '<p class="muted-copy">No special events scheduled.</p>';
	return s.events.map(ev => `<article class="event-card"><div class="event-header"><span class="event-chip">${ev.period === 'all' ? 'All day' : 'Period ' + ev.period}</span></div><div class="event-title">${escapeHtml(ev.title)}</div>${ev.note ? `<div class="event-note">${escapeHtml(ev.note)}</div>` : ''}${ev.description ? `<div class="event-description">${escapeHtml(ev.description)}</div>` : ''}</article>`).join('');
}

function renderEventsEditor(s) {
	if (!s.events.length) return '<p class="muted-copy">No special events.</p>';
	return `<div class="event-editor-horizontal">${s.events.map((ev, i) => {
		const hasDesc = ev.description && ev.description.length > 0;
		return `<div class="event-editor-card" data-event-index="${i}"><div class="field"><span>When</span><select data-event-field="period" data-event-index="${i}">${['all', 1, 2, 3, 4].map(v => `<option value="${v}" ${ev.period == v ? 'selected' : ''}>${v == 'all' ? 'All day' : 'Period ' + v}</option>`).join('')}</select></div><div class="field"><span>Title</span><input type="text" data-event-field="title" data-event-index="${i}" value="${escapeAttribute(ev.title)}"></div><div class="field"><span>Note</span><input type="text" data-event-field="note" data-event-index="${i}" value="${escapeAttribute(ev.note)}"></div><div class="desc-container ${hasDesc ? '' : 'hidden'}" data-event-index="${i}"><div class="field"><span>Description</span><textarea data-event-field="description" data-event-index="${i}">${escapeAttribute(ev.description)}</textarea></div></div><div class="event-actions"><button class="ghost-btn small-btn" data-action="toggle-description" data-event-index="${i}">${hasDesc ? 'Hide Desc' : 'Add Desc'}</button><button class="ghost-btn small-btn" data-action="delete-event" data-event-index="${i}">Remove</button></div></div>`;
	}).join('')}</div>`;
}

function ensureScheduleShape(s) {
	if (!s) return JSON.parse(JSON.stringify(DEFAULT_SCHEDULE));
	const n = { weeks: s.weeks || [createEmptyWeek(), createEmptyWeek()], events: Array.isArray(s.events) ? s.events : [] };
	if (Array.isArray(s.periods) && !s.weeks) {
		const week = {};
		DAYS.forEach(day => { week[day] = s.periods.map(p => ({ period: p.period, x: normalizeBlock(p.x), y: normalizeBlock(p.y) })); });
		n.weeks = [week, JSON.parse(JSON.stringify(week))];
	}
	n.weeks.forEach(week => {
		DAYS.forEach(day => {
			if (!week[day]) week[day] = createEmptyWeek().MON;
			week[day] = [1, 2, 3, 4].map((num, i) => {
				const ex = week[day][i];
				return { period: num, x: normalizeBlock(ex?.x), y: normalizeBlock(ex?.y) };
			});
		});
	});
	return n;
}

function normalizeBlock(b) {
	if (b?.course === "None") return { course: "None", teacher: "", room: "", length: 1, note: "" };
	const d = COURSE_LIBRARY[b?.course] || COURSE_LIBRARY.Bio;
	return { course: b?.course || "Bio", teacher: b?.teacher || d.teacher, room: b?.room || d.room, length: Number(b?.length) === 2 ? 2 : 1, note: b?.note || "" };
}

function setupSettingsMenu() {
	const btn = document.getElementById('settingsButton');
	const menu = document.getElementById('settingsMenu');
	if (!btn || !menu) return;
	btn.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('hidden'); });
	document.getElementById('darkModeToggle')?.addEventListener('click', () => setDarkMode(true));
	document.getElementById('lightModeToggle')?.addEventListener('click', () => setDarkMode(false));
	document.addEventListener('click', e => { if (!menu.contains(e.target) && !btn.contains(e.target)) menu.classList.add('hidden'); });
}

function setDarkMode(isDark) {
	localStorage.setItem('smcs-schedule-dark-mode', isDark);
	document.body.classList.toggle('dark-mode', isDark);
	document.body.classList.toggle('light-mode', !isDark);
	document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
	document.getElementById('settingsMenu')?.classList.add('hidden');
}

function loadDarkModePreference() {
	const s = localStorage.getItem('smcs-schedule-dark-mode');
	setDarkMode(s === null ? true : s === 'true');
}

function updateSaveStatus() {
	const s = document.getElementById('saveStatus');
	if (s) s.textContent = 'Synced with Cloud';
}

function isAuthenticated() { return localStorage.getItem(AUTH_KEY) === 'ok'; }
function getLoggedInUser() {
	const data = localStorage.getItem(AUTH_USER_KEY);
	return data ? JSON.parse(data) : null;
}
function resetSampleSchedule() { if (confirm('Reset?')) saveSchedule(JSON.parse(JSON.stringify(DEFAULT_SCHEDULE))); }
function clearAllClasses() {
	if (confirm('Clear?')) {
		const s = state.schedule;
		s.weeks[state.currentWeekIdx][state.currentDay].forEach(p => { p.x = { ...EMPTY_BLOCK }; p.y = { ...EMPTY_BLOCK }; });
		saveSchedule(s);
	}
}
function exportSchedule() {
	const blob = new Blob([JSON.stringify(state.schedule, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a'); a.href = url; a.download = 'schedule.json'; a.click();
	URL.revokeObjectURL(url);
}
function addEventRow() { state.schedule.events.push({ period: 'all', title: '', note: '', description: '' }); saveSchedule(state.schedule); }
function deleteEventRow(i) { state.schedule.events.splice(i, 1); saveSchedule(state.schedule); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])); }
function escapeAttribute(s) { return escapeHtml(s).replace(/`/g, '&#96;'); }
