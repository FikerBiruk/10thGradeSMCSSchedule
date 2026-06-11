// Version 5.7 - Guaranteed Grid Alignment and Final Layering Fixes

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

let db = null;
try {
	if (window.firebase) {
		firebase.initializeApp(firebaseConfig);
		db = firebase.database();
	}
} catch (err) {
	console.warn('Firebase init failed; falling back to local-only mode.', err);
}

if (!db) {
	db = {
		ref() {
			return {
				on(_event, cb) {
					if (typeof cb === 'function') cb({ val: () => null });
					return () => {};
				},
				set(_value) { return Promise.resolve(); },
			};
		},
	};
}

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
	weeks: [createEmptyWeek()],
	events: [{ period: "all", title: "Welcome Assembly", note: "Gym after Period 2", description: "" }],
};

const state = {
	schedule: DEFAULT_SCHEDULE,
	darkMode: true,
	selectedCourse: null,
	publicView: 'week',
	adminView: 'day',
	currentWeekIdx: 0,
	currentDay: "MON",
	// per-day locks to prevent accidental edits
	lockedDays: {},
	// simple undo stack (stores recent schedule snapshots)
	undoStack: [],
	// active drag metadata for drag-out delete handling
	dragContext: null,
};

document.addEventListener("DOMContentLoaded", () => {
	const page = document.body.dataset.page;
	loadDarkModePreference();
					if (page === "public") renderPublicPage();

	db.ref('schedule').on('value', (snapshot) => {
		const data = snapshot.val();
		state.schedule = ensureScheduleShape(data);
		state.lockedDays = data?.lockedDays || {};
		if (page === "admin") renderAdminPage();
	});

	if (page === "public") initPublicPage();
	if (page === "admin") initAdminPage();
});

function saveSchedule(s) {
	const n = ensureScheduleShape(s);
	applyAutoMerge(n);
	state.schedule = n;
	db.ref('schedule').set({
		...n,
		lockedDays: state.lockedDays || {}
	});
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

					if (b1.forceSingle) return;

					const prev = idx > 0 ? periods[idx-1] : null;
					if (prev && Number(prev[key].length) === 2) return;

					if (b1.course && b1.course !== "None" && b1.course === b2.course) {
						b1.length = 2; b2.teacher = b1.teacher; b2.room = b1.room; b2.length = 1;
					} else if (Number(b1.length) === 2) {
						if (b1.course !== b2.course) b1.length = 1;
					}
				});
			}
			periods[3].x.length = 1;
			periods[3].y.length = 1;
		});
	});
}

function initPublicPage() {
	document.getElementById("weekViewBtn")?.addEventListener("click", () => { state.publicView = 'week'; renderPublicPage(); });
	document.getElementById("dayViewBtn")?.addEventListener("click", () => { state.publicView = 'day'; renderPublicPage(); });
	setupSettingsMenu();
	renderPublicPage();
}

function renderPublicPage() {
	const container = document.getElementById("publicSchedule");

	document.getElementById("weekViewBtn")?.classList.toggle("active", state.publicView === 'week');
	document.getElementById("dayViewBtn")?.classList.toggle("active", state.publicView === 'day');

	let html = renderLiveTimer();
	if (state.publicView === 'day') {
		const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
		let today = days[new Date().getDay()];
		if (!DAYS.includes(today)) today = "MON";
		html += `<h2 class="day-view-title">${today} Schedule</h2>`;
		html += renderTable(state.schedule.weeks[0][today], false);
	} else {
		html += renderFullWeekView();
	}
	container.innerHTML = html;
	document.getElementById("publicEvents").innerHTML = renderEventFeed(state.schedule);
}

function renderFullWeekView() {
	const weekData = state.schedule.weeks[0];
	const daysEnum = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
	const todayDay = daysEnum[new Date().getDay()];

	const renderGroup = (key, label) => {
		let h = `<div class="week-group-section"><h3 class="week-group-title ${key}">${label}</h3><div class="full-week-grid"><div class="week-corner" style="grid-column: 1; grid-row: 1;"></div>`;

		DAYS.forEach((day, dIdx) => {
			const isToday = day === todayDay;
			h += `<div class="week-day-header ${isToday ? 'is-today' : ''}" style="grid-column: ${dIdx + 2}; grid-row: 1;">${day}</div>`;
		});

		for (let pIdx = 0; pIdx < 4; pIdx++) {
			h += `<div class="week-period-row"><div class="week-period-label" style="grid-column: 1; grid-row: ${pIdx + 2};">P${pIdx+1}</div>`;
			DAYS.forEach((day, dIdx) => {
				const isToday = day === todayDay;
				const periods = weekData[day];
				const block = periods[pIdx][key];

				const prev = pIdx > 0 ? periods[pIdx-1] : null;
				const isCovered = prev && Number(prev[key].length) === 2;

				if (!isCovered) {
					const isDouble = Number(block.length) === 2;
					const empty = block.course === "None";
					h += `<div class="week-cell ${key} ${empty ? 'empty' : 'has-class'} ${isToday ? 'is-today' : ''} ${isDouble ? 'row-span-2' : ''}"
						style="grid-column: ${dIdx + 2}; grid-row: ${pIdx + 2} / span ${isDouble ? 2 : 1};">
						${empty ? '' : `<div class="week-course">${escapeHtml(block.course)}</div><div class="week-room">Rm ${escapeHtml(block.room)}</div>`}
					</div>`;
				}
			});
			h += `</div>`;
		}
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
			${skipX ? '' : `<td class="block-col block-x" data-period-index="${idx}" data-block="x" ${Number(p.x.length) === 2 ? 'rowspan="2"' : ''}>${isAdmin ? renderAdminBlock(p.x, 'x', idx) : renderPublicBlock(p.x)}</td>`}
			${skipY ? '' : `<td class="block-col block-y" data-period-index="${idx}" data-block="y" ${Number(p.y.length) === 2 ? 'rowspan="2"' : ''}>${isAdmin ? renderAdminBlock(p.y, 'y', idx) : renderPublicBlock(p.y)}</td>`}
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
	// update undo button enabled/disabled state
	const undoBtn = document.getElementById('undoButton'); if (undoBtn) undoBtn.disabled = state.undoStack.length === 0;
	// update lock UI
	updateLockUI();
}

function renderAdminWeekGrid() {
	const weekData = state.schedule.weeks[state.currentWeekIdx];
	const renderGroup = (key, label) => {
		let h = `<div class="week-group-section"><h3 class="week-group-title ${key}">${label}</h3><div class="full-week-grid admin-week-grid"><div class="week-corner" style="grid-column: 1; grid-row: 1;"></div>`;
		DAYS.forEach((day, dIdx) => h += `<div class="week-day-header" style="grid-column: ${dIdx + 2}; grid-row: 1;"><div class="week-day-name">${day}</div></div>`);
		for (let pIdx = 0; pIdx < 4; pIdx++) {
			h += `<div class="week-period-row"><div class="week-period-label" style="grid-column: 1; grid-row: ${pIdx + 2};">P${pIdx+1}</div>`;
			DAYS.forEach((day, dIdx) => {
				const periods = weekData[day];
				const block = periods[pIdx][key];
				const prev = pIdx > 0 ? periods[pIdx-1] : null;
				const isCovered = prev && Number(prev[key].length) === 2;

				if (!isCovered) {
					const isDouble = Number(block.length) === 2;
					const empty = block.course === "None";
					const locked = !!block.locked;
					h += `<div class="week-cell admin-cell ${key} ${empty ? 'empty' : 'has-class'} ${locked ? 'is-locked' : ''} ${isDouble ? 'row-span-2' : ''}"
						style="grid-column: ${dIdx + 2}; grid-row: ${pIdx + 2} / span ${isDouble ? 2 : 1};"
						draggable="${!empty && !locked}" data-day="${day}" data-period-index="${pIdx}" data-block="${key}">
						<span class="sub-label">${key.toUpperCase()}</span>
						${empty ? '<div class="empty-placeholder">Empty</div>' : `${renderLockButton(block, pIdx, key, day)}<div class="week-course">${escapeHtml(block.course)}</div>`}
					</div>`;
				}
			});
			h += `</div>`;
		}
		return h + `</div></div>`;
	};
	return `<div class="multi-week-container">${renderGroup('x', 'Block X')}${renderGroup('y', 'Block Y')}</div>`;
}

function renderAdminBlock(block, key, idx) {
	const isDouble = Number(block.length) === 2;
	const empty = block.course === "None";
	const locked = !!block.locked;
	const periods = state.schedule.weeks[state.currentWeekIdx][state.currentDay];
	let conflict = false;
	if (!empty) {
		// Existing course duplication heuristic (non-adjacent duplicate)
		periods.forEach((p, pIdx) => {
			if (pIdx !== idx && p[key].course === block.course) {
				if (Math.abs(pIdx - idx) > 1 || (Number(block.length) !== 2 && Number(p[key].length) !== 2)) conflict = true;
			}
		});
		// Teacher/room conflicts: same day, same time slot, opposite group(s)
		const otherKey = key === 'x' ? 'y' : 'x';
		const slotIndexes = [idx];
		if (isDouble && idx + 1 < periods.length) slotIndexes.push(idx + 1);
		slotIndexes.forEach(slotIdx => {
			const sibling = periods[slotIdx]?.[otherKey];
			if (!sibling || sibling.course === 'None') return;
			if (block.teacher && sibling.teacher && sibling.teacher === block.teacher) conflict = true;
			if (block.room && sibling.room && sibling.room === block.room) conflict = true;
		});
	}
	return `<div class="admin-block-cell ${isDouble ? 'is-double' : ''} ${locked ? 'is-locked' : ''} ${conflict ? 'has-conflict' : ''} ${empty ? 'is-empty' : ''}" draggable="${!empty && !locked}" data-period-index="${idx}" data-block-key="${key}">
		${empty ? '<div class="empty-placeholder">Empty</div>' : `
		${renderLockButton(block, idx, key, state.currentDay)}
		<div class="block-info"><div class="course-name">${escapeHtml(block.course)}</div><div class="teacher-name">${escapeHtml(block.teacher)}</div></div>
		<div class="block-controls"><input type="text" class="room-input" data-room-edit value="${escapeAttribute(block.room)}" data-period-index="${idx}" data-block-key="${key}" autocomplete="off" ${locked ? 'disabled' : ''}>
		<div class="block-actions"><button class="toggle-double-btn ${isDouble ? 'active' : ''}" data-action="toggle-double" data-period-index="${idx}" data-block-key="${key}" ${locked ? 'disabled' : ''}>Double</button></div></div>
		${isDouble ? '<div class="double-badge">Double</div>' : ''}`}
	</div>`;
}

function renderClassCards() {
	return COURSES.map(c => `<div class="class-card draggable-card" draggable="true" data-course="${c}"><div class="card-title">${c}</div><div class="card-teacher">${COURSE_LIBRARY[c].teacher}</div><div class="card-room">Room ${COURSE_LIBRARY[c].room}</div></div>`).join('');
}

function renderLockButton(block, idx, key, day) {
	const locked = !!block.locked;
	const dayLocked = !!(state.lockedDays && state.lockedDays[day]);
	const label = locked ? 'Unlock class' : 'Lock class';
	const title = dayLocked ? 'Day is locked (Unlock Day to edit)' : label;
	return `<button type="button" class="lock-toggle-btn ${locked ? 'locked' : ''}" draggable="false" data-action="toggle-lock" data-day="${day}" data-period-index="${idx}" data-block-key="${key}" aria-label="${label}" title="${title}" ${dayLocked ? 'style="opacity: 0.6; cursor: not-allowed;"' : ''}>${locked ? '🔒' : '🔓'}</button>`;
}

function setupDragAndDrop() {
	const cards = document.querySelectorAll('.draggable-card');
	const tableBlocks = document.querySelectorAll('.admin-block-cell[draggable="true"]');
	const weekBlocks = document.querySelectorAll('.admin-cell[draggable="true"]');

	const dayZones = document.querySelectorAll('.admin-table td.block-col');
	const weekZones = document.querySelectorAll('.admin-cell');

	cards.forEach(c => c.addEventListener('dragstart', e => {
		state.dragContext = { sourceType: 'library', handled: false };
		e.dataTransfer.setData('text/plain', 'lib:' + c.dataset.course);
	}));

	[...tableBlocks, ...weekBlocks].forEach(b => {
		b.addEventListener('dragstart', e => {
			if (e.target && e.target.closest && e.target.closest('button,input,textarea,select')) return;
			const info = { day: b.dataset.day || state.currentDay, idx: Number(b.dataset.periodIndex), key: b.dataset.blockKey || b.dataset.block };
			const week = state.schedule.weeks[state.currentWeekIdx];
			const sourceBlock = week[info.day]?.[info.idx]?.[info.key];
			state.dragContext = { sourceType: 'table', handled: false, ...info, block: JSON.parse(JSON.stringify(sourceBlock || EMPTY_BLOCK)) };
			e.dataTransfer.setData('text/plain', 'table:' + JSON.stringify(info));
		});
		b.addEventListener('dragend', () => finalizeDragOutDelete());
	});

	const handleDrop = (e, zone, d, idx, key) => {
		e.preventDefault(); zone.classList.remove('drag-over');
		const raw = e.dataTransfer.getData('text/plain');
		if (!raw) return;
		if (state.dragContext) state.dragContext.handled = true;
		// prevent changes on locked days
		if (state.lockedDays && state.lockedDays[d]) { alert('This day is locked. Unlock to make changes.'); return; }
		handleSelection(idx, key, raw, e, zone, d);
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

	function finalizeDragOutDelete() {
		const ctx = state.dragContext;
		state.dragContext = null;
		if (!ctx || ctx.sourceType !== 'table' || ctx.handled) return;
		const week = state.schedule.weeks[state.currentWeekIdx];
		const srcDay = ctx.day;
		const srcIdx = Number(ctx.idx);
		const srcKey = ctx.key;
		const srcBlock = ctx.block || week[srcDay]?.[srcIdx]?.[srcKey];
		if (!srcDay || Number.isNaN(srcIdx) || !srcKey) return;
		if (state.lockedDays && state.lockedDays[srcDay]) return;
		if (week[srcDay]?.[srcIdx]?.[srcKey]?.locked) return;
		pushUndo();
		clearBlockAt(week, srcDay, srcIdx, srcKey, srcBlock);
		saveSchedule(state.schedule);
		renderAdminPage();
	}
}

function handleSelection(tIdx, key, raw, event, zone, day) {
	const week = state.schedule.weeks[state.currentWeekIdx];
	const currentBlock = week[day][tIdx][key];

	// prevent edits if the day is locked
	if (state.lockedDays && state.lockedDays[day]) { alert('This day is locked. Unlock to make changes.'); return; }
	if (currentBlock.locked) { alert('This class is locked. Unlock it first.'); return; }

	if (Number(currentBlock.length) === 2 && event && zone.classList.contains('block-col')) {
		const rect = zone.getBoundingClientRect();
		if ((event.clientY - rect.top) > rect.height / 2) tIdx++;
	}

	if (raw.startsWith('lib:')) {
		// placing from library - behaves like copy
		const course = raw.replace('lib:', '');
		const block = week[day][tIdx][key];
		pushUndo();
		block.course = course;
		const lib = COURSE_LIBRARY[course] || COURSE_LIBRARY.Bio;
		block.teacher = lib.teacher; block.room = lib.room; block.length = 1;
		delete block.forceSingle;
		saveSchedule(state.schedule);
		return;
	} else if (raw.startsWith('table:')) {
		const src = JSON.parse(raw.replace('table:', ''));
		if (src.day == day && src.idx == tIdx && src.key == key) return;

		const sBlock = week[src.day][src.idx][src.key];
		const tBlock = week[day][tIdx][key];
		const temp = JSON.parse(JSON.stringify(sBlock));

		if (sBlock.locked) { alert('This class is locked. Unlock it first.'); return; }
		if (tBlock.locked) { alert('This class is locked. Unlock it first.'); return; }

		// Ctrl key => copy source to target (leave source intact)
		if (event && event.ctrlKey) {
			pushUndo();
			tBlock.course = temp.course; tBlock.teacher = temp.teacher; tBlock.room = temp.room; tBlock.length = temp.length || 1;
			delete tBlock.forceSingle;
			saveSchedule(state.schedule);
			return;
		}

		// Shift key => insert/shift mode: shift target and following down by one
		if (event && event.shiftKey) {
			pushUndo();
			// shift down within target day for the same key
			for (let i = 3; i > tIdx; i--) {
				week[day][i][key] = JSON.parse(JSON.stringify(week[day][i-1][key]));
			}
			// place source into target
			week[day][tIdx][key] = temp;
			saveSchedule(state.schedule);
			return;
		}

		// Default behavior: swap source and target
		pushUndo();
		sBlock.course = tBlock.course; sBlock.teacher = tBlock.teacher; sBlock.room = tBlock.room; sBlock.length = 1;
		delete sBlock.forceSingle;
		tBlock.course = temp.course; tBlock.teacher = temp.teacher; tBlock.room = temp.room; tBlock.length = temp.length || 1;
		delete tBlock.forceSingle;
		saveSchedule(state.schedule);
		return;
	}
}

function handleAdminLogin(event) {
	event.preventDefault();
	const user = document.getElementById("adminUsername").value.toLowerCase().trim();
	const pass = document.getElementById("adminPassword").value;
	const error = document.getElementById("loginError");

	if (TEACHERS[user] && TEACHERS[user].password === pass) {
		localStorage.setItem(AUTH_KEY, 'ok');
		localStorage.setItem(AUTH_USER_KEY, JSON.stringify(TEACHERS[user]));
		location.reload();
	} else {
		error.textContent = "Invalid credentials";
		error.hidden = false;
	}
}

function handleLogout() {
	localStorage.removeItem(AUTH_KEY);
	localStorage.removeItem(AUTH_USER_KEY);
	location.reload();
}

function initAdminPage() {
	if (!isAuthenticated()) {
		document.getElementById("adminLoginForm")?.addEventListener("submit", handleAdminLogin);
		return;
	}
	document.getElementById("loginPanel").hidden = true;
	document.getElementById("adminApp").hidden = false;

	const daysEnum = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
	const today = daysEnum[new Date().getDay()];
	if (DAYS.includes(today)) state.currentDay = today;

	document.getElementById("adminDayViewBtn")?.addEventListener("click", () => { state.adminView = 'day'; renderAdminPage(); });
	document.getElementById("adminWeekViewBtn")?.addEventListener("click", () => { state.adminView = 'week'; renderAdminPage(); });
	document.getElementById("adminDaySelect")?.addEventListener("change", e => { state.currentDay = e.target.value; renderAdminPage(); });
	document.getElementById("logoutButton")?.addEventListener("click", handleLogout);
	// Admin controls: undo & lock day
	document.getElementById('undoButton')?.addEventListener('click', () => undo());
	document.getElementById('lockDayButton')?.addEventListener('click', () => toggleLockDay());
	const afBtn = document.getElementById('autofillButton');
	if (afBtn) {
		console.debug('autofill button found and listener attached');
		afBtn.addEventListener('click', () => autofillCurrentDay());
	} else {
		console.debug('autofill button not present at initAdminPage');
	}

	const app = document.getElementById("adminApp");
	app.addEventListener("change", handleAdminInput);
	app.addEventListener("click", handleAdminClick);
	renderAdminPage();
	setupSettingsMenu();
}

function handleAdminInput(event) {
	const target = event.target;
	if (target.hasAttribute('data-room-edit')) {
		const idx = Number(target.dataset.periodIndex), key = target.dataset.blockKey;
		const block = state.schedule.weeks[state.currentWeekIdx][state.currentDay][idx][key];
		if (block.locked) return;
		block.room = target.value;
		saveSchedule(state.schedule);
	}
	if (target.hasAttribute('data-event-field')) {
		const idx = Number(target.dataset.eventIndex), field = target.dataset.eventField;
		state.schedule.events[idx][field] = target.value;
		saveSchedule(state.schedule);
	}
}

function handleAdminClick(event) {
	const target = event.target;
	if (target.closest("#clearAllButton")) clearAllClasses();
	if (target.closest("#exportButton")) exportSchedule();
	if (target.closest("#addEventButton")) addEventRow();
	if (target.closest("[data-action='delete-event']")) deleteEventRow(Number(target.closest("[data-action='delete-event']").dataset.eventIndex));
	if (target.closest("[data-action='toggle-lock']")) {
		const btn = target.closest("[data-action='toggle-lock']");
		const day = btn.dataset.day || state.currentDay;
		const idx = Number(btn.dataset.periodIndex), key = btn.dataset.blockKey;
		const block = state.schedule.weeks[state.currentWeekIdx][day][idx][key];
		if (state.lockedDays && state.lockedDays[day]) { alert('This day is locked. Unlock to change block locks.'); return; }
		block.locked = !block.locked;
		saveSchedule(state.schedule);
		renderAdminPage();
		return;
	}
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
		if (block.locked) { alert('This class is locked. Unlock it first.'); return; }

		if (idx >= 3 && Number(block.length) === 1) {
			alert("Period 4 cannot be a double period start.");
			return;
		}

		block.length = Number(block.length) === 1 ? 2 : 1;
		if (block.length === 1) {
			block.forceSingle = true;
		} else {
			delete block.forceSingle;
			if (periods[idx+1]) {
				const next = periods[idx+1][key];
				next.course = block.course; next.teacher = block.teacher; next.room = block.room; next.length = 1;
				delete next.forceSingle;
			}
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
	if (!s.events || !s.events.length) return '<p class="muted-copy">No special events scheduled.</p>';
	return s.events.map(ev => `
        <article class="event-card">
            <div class="event-header">
                <span class="event-chip ${ev.period === 'all' ? 'all-day' : ''}">
                    ${ev.period === 'all' ? 'All Day' : 'Period ' + ev.period}
                </span>
            </div>
            <div class="event-body">
                <h3 class="event-title">${escapeHtml(ev.title)}</h3>
                ${ev.note ? `<p class="event-note">${escapeHtml(ev.note)}</p>` : ''}
                ${ev.description ? `<p class="event-desc">${escapeHtml(ev.description)}</p>` : ''}
            </div>
        </article>
    `).join('');
}

function renderEventsEditor(s) {
	if (!s.events || !s.events.length) return '<p class="muted-copy">No special events.</p>';
	return `<div class="event-editor-horizontal">${s.events.map((ev, i) => {
		const hasDesc = ev.description && ev.description.length > 0;
		return `<div class="event-editor-card" data-event-index="${i}"><div class="field"><span>When</span><select data-event-field="period" data-event-index="${i}">${['all', 1, 2, 3, 4].map(v => `<option value="${v}" ${ev.period == v ? 'selected' : ''}>${v == 'all' ? 'All day' : 'Period ' + v}</option>`).join('')}</select></div><div class="field"><span>Title</span><input type="text" data-event-field="title" data-event-index="${i}" value="${escapeAttribute(ev.title)}"></div><div class="field"><span>Note</span><input type="text" data-event-field="note" data-event-index="${i}" value="${escapeAttribute(ev.note)}"></div><div class="desc-container ${hasDesc ? '' : 'hidden'}" data-event-index="${i}"><div class="field"><span>Description</span><textarea data-event-field="description" data-event-index="${i}">${escapeAttribute(ev.description)}</textarea></div></div><div class="event-actions"><button class="ghost-btn small-btn" data-action="toggle-description" data-event-index="${i}">${hasDesc ? 'Hide Desc' : 'Add Desc'}</button><button class="ghost-btn small-btn" data-action="delete-event" data-event-index="${i}">Remove</button></div></div>`;
	}).join('')}</div>`;
}

function ensureScheduleShape(s) {
	if (!s) return JSON.parse(JSON.stringify(DEFAULT_SCHEDULE));
	const n = { weeks: s.weeks || [createEmptyWeek()], events: Array.isArray(s.events) ? s.events : [] };
	if (Array.isArray(s.periods) && !s.weeks) {
		const week = {};
		DAYS.forEach(day => { week[day] = s.periods.map(p => ({ period: p.period, x: normalizeBlock(p.x), y: normalizeBlock(p.y) })); });
		n.weeks = [week];
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
	const course = typeof b?.course === 'string' ? b.course.trim() : b?.course;
	if (!course || course === "None") return { course: "None", teacher: "", room: "", length: 1, note: "", locked: !!b?.locked };
	const d = COURSE_LIBRARY[course] || COURSE_LIBRARY.Bio;
	return { course, teacher: b.teacher || d.teacher, room: b.room || d.room, length: Number(b.length) === 2 ? 2 : 1, note: b.note || "", forceSingle: b.forceSingle || false, locked: !!b.locked };
}

function clearBlockAt(week, day, idx, key, sourceBlock) {
	if (!week[day] || !week[day][idx]) return;
	week[day][idx][key] = { ...EMPTY_BLOCK };
	if (sourceBlock && Number(sourceBlock.length) === 2 && week[day][idx + 1]) {
		week[day][idx + 1][key] = { ...EMPTY_BLOCK };
	}
}

function setupSettingsMenu() {
	const btn = document.getElementById('settingsButton');
	const menu = document.getElementById('settingsMenu');
	if (!btn || !menu) return;
	btn.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('hidden'); });
	document.getElementById('darkModeToggle')?.addEventListener('click', () => setTheme('dark'));
	document.getElementById('lightModeToggle')?.addEventListener('click', () => setTheme('light'));
	document.getElementById('redModeToggle')?.addEventListener('click', () => setTheme('red'));
	document.addEventListener('click', e => { if (!menu.contains(e.target) && !btn.contains(e.target)) menu.classList.add('hidden'); });
}
//revert back if issues arrise
function setTheme(theme) {
	localStorage.setItem('smcs-schedule-theme', theme);
	localStorage.removeItem('smcs-schedule-dark-mode');
	document.body.classList.toggle('dark-mode', theme === 'dark');
	document.body.classList.toggle('light-mode', theme === 'light');
	document.body.classList.toggle('red-mode', theme === 'red');
	document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
	document.getElementById('settingsMenu')?.classList.add('hidden');
}

function loadDarkModePreference() {
	const savedTheme = localStorage.getItem('smcs-schedule-theme');
	if (savedTheme === 'dark' || savedTheme === 'light' || savedTheme === 'red') {
		setTheme(savedTheme);
		return;
	}

	const legacy = localStorage.getItem('smcs-schedule-dark-mode');
	setTheme(legacy === null ? 'dark' : legacy === 'true' ? 'dark' : 'light');
}

function pushUndo() {
	try {
		const snapshot = JSON.parse(JSON.stringify(state.schedule));
		state.undoStack = state.undoStack || [];
		state.undoStack.push(snapshot);
		// keep stack bounded
		if (state.undoStack.length > 20) state.undoStack.shift();
	} catch (e) { /* ignore */ }
}

function undo() {
	if (!state.undoStack || !state.undoStack.length) return;
	const prev = state.undoStack.pop();
	if (prev) {
		state.schedule = prev;
		saveSchedule(state.schedule);
		renderAdminPage();
	}
}

function toggleLockDay() {
	const day = state.currentDay;
	state.lockedDays = state.lockedDays || {};
	const newState = !state.lockedDays[day];
	state.lockedDays[day] = newState;

	// Explicitly force all blocks for this day into the new lock state
	const week = state.schedule.weeks[state.currentWeekIdx];
	if (week && week[day]) {
		week[day].forEach(p => {
			if (p.x) p.x.locked = newState;
			if (p.y) p.y.locked = newState;
		});
	}

	saveSchedule(state.schedule);
	renderAdminPage();
}

function autofillCurrentDay() {
	const btn = document.getElementById('autofillButton');
	console.debug('autofillCurrentDay invoked, button element:', btn);
	if (!btn) return;
	const originalHtml = btn.innerHTML;
	btn.disabled = true;
	btn.innerHTML = `<span class="btn-icon">✨</span> Autofilling...`;

	// Use a short timeout to ensure the UI updates before the synchronous work runs
	setTimeout(() => {
		const day = state.currentDay;
		const week = state.schedule.weeks[state.currentWeekIdx];
		if (!week || !week[day]) {
			btn.disabled = false;
			btn.innerHTML = originalHtml;
			return;
		}

		// Get all blocks from other days to use as templates
		const DAYS = ["MON", "TUE", "WED", "THU", "FRI"];
		console.debug('autofill: currentDay=', day);
		// quick snapshot of available courses per day for debugging
		DAYS.forEach(d => console.debug(`autofill: day=${d} -> X: ${week[d].map(p=>p.x.course).join(', ')} | Y: ${week[d].map(p=>p.y.course).join(', ')}`));
		let filledCount = 0;

		for (const sourceDay of DAYS) {
			if (sourceDay === day) continue;
			if (!week[sourceDay]) continue;

			// Try to copy each block from the source day to the current day
			week[sourceDay].forEach((sourcePeriod, idx) => {
				// Try to fill x position (only when source has a real course)
				if (sourcePeriod.x && sourcePeriod.x.course && sourcePeriod.x.course !== "None" && week[day][idx]) {
					const targetX = week[day][idx].x;
					if (!targetX || !targetX.course || targetX.course === "None" || targetX.course === "") {
						console.debug(`autofill: filling ${day} period ${idx} x from ${sourceDay}`);
						week[day][idx].x = JSON.parse(JSON.stringify(sourcePeriod.x));
						filledCount++;
					}
				}
				// Try to fill y position (only when source has a real course)
				if (sourcePeriod.y && sourcePeriod.y.course && sourcePeriod.y.course !== "None" && week[day][idx]) {
					const targetY = week[day][idx].y;
					if (!targetY || !targetY.course || targetY.course === "None" || targetY.course === "") {
						console.debug(`autofill: filling ${day} period ${idx} y from ${sourceDay}`);
						week[day][idx].y = JSON.parse(JSON.stringify(sourcePeriod.y));
						filledCount++;
					}
				}
			});
		}

		saveSchedule(state.schedule);
		renderAdminPage();
		btn.disabled = false;
		btn.innerHTML = originalHtml;
		alert(`Autofill complete! ${filledCount} slot(s) filled.`);
	}, 50);
}

function updateLockUI() {
	const btn = document.getElementById('lockDayButton');
	if (!btn) return;
	const locked = !!(state.lockedDays && state.lockedDays[state.currentDay]);
	btn.classList.toggle('active', locked);
	btn.innerHTML = `<span class="btn-icon">${locked ? '🔒' : '🔓'}</span> ${locked ? 'Unlock Day' : 'Lock Day'}`;
}

function updateSaveStatus() {
	const s = document.getElementById('saveStatus');
	if (s) s.textContent = 'Synced';
}

function isAuthenticated() { return localStorage.getItem(AUTH_KEY) === 'ok'; }
function getLoggedInUser() {
	const data = localStorage.getItem(AUTH_USER_KEY);
	return data ? JSON.parse(data) : null;
}
function clearAllClasses() {
	if (confirm('Clear all classes for today?')) {
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
