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
					if (typeof cb === 'function') cb({ val: () => null, key: null });
					return () => {};
				},
				set(_value) { return Promise.resolve(); },
				push(value) { return { set: () => Promise.resolve(value) }; },
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

let COURSE_LIBRARY = {
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
	publicView: 'day',
	publicBlock: 'x',
	adminView: 'day',
	currentWeekIdx: 0,
	currentDay: "MON",
	settings: {},
	requests: {},
	presets: {},
	// per-day locks to prevent accidental edits
	lockedDays: {},
	// simple undo stack (stores recent schedule snapshots)
	undoStack: [],
	// active drag metadata for drag-out delete handling
	dragContext: null,
};

let page = document.body.dataset.page;

document.addEventListener("DOMContentLoaded", () => {
	page = document.body.dataset.page;
	loadDarkModePreference();
	if (page === "public") renderPublicPage();

	db.ref('schedule').on('value', (snapshot) => {
		const data = snapshot.val();
		state.schedule = ensureScheduleShape(data);
		state.lockedDays = data?.lockedDays || {};
		if (page === "admin") renderAdminPage();
		if (page === "public") renderPublicPage();
	});

	db.ref('settings').on('value', snap => {
		state.settings = snap.val() || {};
		if (page === 'admin') renderAdminPage();
		if (page === 'public') renderPublicPage();
	});

	db.ref('requests').on('value', snap => {
		state.requests = snap.val() || {};
		if (page === 'requests') renderRequestsPage();
		if (page === 'admin') renderAdminPage();
	});

	db.ref('requests').on('child_changed', snap => {
		const req = snap.val();
		const id = snap.key;

		if (!req || req.status !== "PENDING") return;

		const votes = req.votes || {};
		const voteValues = Object.values(votes);

		if (voteValues.includes("rejected")) {
			db.ref(`requests/${id}/status`).set("REJECTED");
			return;
		}

		if (voteValues.length && voteValues.every(v => v === "approved")) {
			db.ref("schedule").set(req.proposed);
			db.ref(`requests/${id}/status`).set("APPROVED");
		}
	});

	db.ref('presets').on('value', snap => {
		state.presets = snap.val() || {};
		if (page === 'admin') renderAdminPage();
	});

	db.ref('library').on('value', snap => {
		if (snap.exists()) {
			COURSE_LIBRARY = { ...COURSE_LIBRARY, ...snap.val() };
			if (page === 'admin') renderAdminPage();
		}
	});

	if (page === "public") initPublicPage();
	if (page === "admin" || page === 'requests') initAdminPage();
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

function isPastDeadline() {
	const d = state.settings?.deadline;
	if (!d) return false;
	return Date.now() > new Date(d).getTime();
}

function submitChangeRequest() {
	const user = getLoggedInUser();
	if (!user) {
		alert("You must be logged in as a teacher to submit a request.");
		return;
	}

	const requesterKey = Object.keys(TEACHERS).find(k => TEACHERS[k].name === user.name) || user.username || user.id;
	const original = JSON.parse(JSON.stringify(state.schedule));
	const proposed = JSON.parse(JSON.stringify(state.schedule));
	const affectedTeachers = Object.keys(TEACHERS);
	const votes = {};
	affectedTeachers.forEach(t => {
		votes[t] = t === requesterKey ? "approved" : "pending";
	});

	const req = {
		requester: requesterKey,
		requesterName: user.name,
		day: state.currentDay,
		original,
		proposed,
		affectedTeachers,
		votes,
		status: "PENDING",
		timestamp: Date.now()
	};

	db.ref("requests").push(req);
	alert("Request submitted for approval.");
}

function voteOnRequest(id, vote) {
	const user = getLoggedInUser();
	if (!user) {
		alert("You must be logged in to vote.");
		return;
	}

	const usernameKey = Object.keys(TEACHERS).find(k => TEACHERS[k].name === user.name);
	if (!usernameKey) {
		alert("Unknown teacher identity.");
		return;
	}

	db.ref(`requests/${id}/votes/${usernameKey}`).set(vote);
}

function viewRequest(id) {
	const req = state.requests[id];
	if (!req) return;

	alert(
		"Original:\n" +
		JSON.stringify(req.original, null, 2) +
		"\n\nProposed:\n" +
		JSON.stringify(req.proposed, null, 2)
	);
}

function goToRequests() {
	page = "requests";
	renderRequestsPage();
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

	// Delegate listener for the block switcher that gets injected
	document.addEventListener('click', e => {
		if (e.target.closest('#blockXBtn')) { state.publicBlock = 'x'; renderPublicPage(); }
		if (e.target.closest('#blockYBtn')) { state.publicBlock = 'y'; renderPublicPage(); }
	});

	setupSettingsMenu();
	renderPublicPage();
}

function renderPublicPage() {
	const container = document.getElementById("publicSchedule");

	document.getElementById("weekViewBtn")?.classList.toggle("active", state.publicView === 'week');
	document.getElementById("dayViewBtn")?.classList.toggle("active", state.publicView === 'day');

	let html = renderLiveTimer();

	// Inject Block Switcher for Week View
	if (state.publicView === 'week') {
		html += `
			<div class="block-switcher-container" style="margin-bottom: 24px;">
				<div class="view-toggle">
					<button id="blockXBtn" class="toggle-btn ${state.publicBlock === 'x' ? 'active' : ''}">Block X</button>
					<button id="blockYBtn" class="toggle-btn ${state.publicBlock === 'y' ? 'active' : ''}">Block Y</button>
				</div>
			</div>
		`;
	}

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

	const key = state.publicBlock || 'x';
	const label = key === 'x' ? 'Block X' : 'Block Y';
	return `<div class="multi-week-container">${renderGroup(key, label)}</div>`;
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
	const isDouble = Number(b.length) === 2;
	const isDefaultRoom = COURSE_LIBRARY[b.course]?.room === b.room;
	return `<div class="table-block ${isDouble ? 'is-double' : ''}">
		<div class="course-name">${escapeHtml(b.course)}</div>
		<div class="teacher-name">${escapeHtml(b.teacher)}</div>
		<div class="room-number ${!isDefaultRoom ? 'custom-room' : ''}">Room ${escapeHtml(b.room)}</div>
		${isDouble ? '<div class="double-indicator">Double Period</div>' : ''}
	</div>`;
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

	// Preset dropdown injection
	const navGroup = document.querySelector(".admin-nav-group");
	if (navGroup) {
		let presetWrap = document.getElementById("presetSelectorWrap");
		if (!presetWrap) {
			navGroup.insertAdjacentHTML('beforeend', `
				<div id="presetSelectorWrap" class="settings-wrapper">
					<button id="presetMenuBtn" class="secondary-btn" type="button">Presets ▼</button>
					<div id="presetMenu" class="settings-menu hidden">
						<button class="settings-item" type="button" onclick="openPresetModal()">+ Add Preset</button>
						<div class="settings-divider"></div>
						<div id="presetItemsList"></div>
					</div>
				</div>
			`);
			const btn = document.getElementById('presetMenuBtn');
			const menu = document.getElementById('presetMenu');
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				menu.classList.toggle('hidden');
			});
			document.addEventListener('click', e => {
				if (menu && !menu.contains(e.target) && !btn.contains(e.target)) menu.classList.add('hidden');
			});
		}
		const list = document.getElementById("presetItemsList");
		if (list) {
			list.innerHTML = "";
			const currentPresets = Object.entries(state.presets || {}).filter(([_, p]) => p.day === state.currentDay);
			if (currentPresets.length === 0) {
				list.innerHTML = '<div class="settings-item" style="opacity: 0.5; cursor: default;">No presets for this day</div>';
			} else {
				currentPresets.forEach(([id, p]) => {
					const item = document.createElement("div");
					item.className = "preset-menu-item";
					item.innerHTML = `
						<button class="preset-load-btn" type="button" onclick="applyPreset('${id}')">${escapeHtml(p.name)}</button>
						<button class="preset-delete-btn" type="button" onclick="deletePreset('${id}', event)" title="Delete Preset">✕</button>
					`;
					list.appendChild(item);
				});
			}
		}
	}

	const afWeekBtn = document.getElementById('autofillWeekButton');
	const clearWeekBtn = document.getElementById('clearWeekButton');
	if (state.adminView === 'week') {
		if (afWeekBtn) afWeekBtn.classList.remove('hidden');
		if (clearWeekBtn) clearWeekBtn.classList.remove('hidden');
	} else {
		if (afWeekBtn) afWeekBtn.classList.add('hidden');
		if (clearWeekBtn) clearWeekBtn.classList.add('hidden');
	}

	const container = document.getElementById("adminSchedule");
	if (container) {
		const deadlinePast = isPastDeadline();
		let header = '';
		if (page === 'requests') {
			renderRequestsPage();
			return;
		}
		if (deadlinePast) {
			header = `<div class="deadline-banner"><strong>Deadline passed.</strong> Direct saves are disabled. Use Submit Request.</div>`;
		}
		if (state.adminView === 'day') {
			container.innerHTML = header + renderTable(state.schedule.weeks[state.currentWeekIdx][state.currentDay], true);
		} else {
			container.innerHTML = header + renderAdminWeekGrid();
		}
	}

	document.getElementById("adminClassCards").innerHTML = renderClassCards();
	document.getElementById("eventsEditor").innerHTML = renderEventsEditor(state.schedule);
	updateSaveStatus();
	setupDragAndDrop();
	const undoBtn = document.getElementById('undoButton'); if (undoBtn) undoBtn.disabled = state.undoStack.length === 0;
	updateLockUI();
	updateAdminActionButtons();
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
		periods.forEach((p, pIdx) => {
			if (pIdx !== idx && p[key].course === block.course) {
				if (Math.abs(pIdx - idx) > 1 || (Number(block.length) !== 2 && Number(p[key].length) !== 2)) conflict = true;
			}
		});
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
	const libData = COURSE_LIBRARY[block.course] || { room: "" };
	const isDefaultRoom = !empty && libData.room === block.room;
	return `<div class="admin-block-cell ${isDouble ? 'is-double' : ''} ${locked ? 'is-locked' : ''} ${conflict ? 'has-conflict' : ''} ${empty ? 'is-empty' : ''}" draggable="${!empty && !locked}" data-period-index="${idx}" data-block-key="${key}">
		${empty ? '<div class="empty-placeholder">Empty</div>' : `
		${renderLockButton(block, idx, key, state.currentDay)}
		<div class="block-info"><div class="course-name">${escapeHtml(block.course)}</div><div class="teacher-name">${escapeHtml(block.teacher)}</div></div>
		<div class="block-controls"><input type="text" class="room-input ${!isDefaultRoom ? 'custom-room' : ''}" data-room-edit value="${escapeAttribute(block.room)}" data-period-index="${idx}" data-block-key="${key}" autocomplete="off" ${locked ? 'disabled' : ''}>
		<div class="block-actions"><button class="toggle-double-btn ${isDouble ? 'active' : ''}" data-action="toggle-double" data-period-index="${idx}" data-block-key="${key}" ${locked ? 'disabled' : ''}>Double</button></div></div>
		`}
	</div>`;
}

function renderClassCards() {
	return COURSES.map(c => {
		const lib = COURSE_LIBRARY[c] || { teacher: "TBD", room: "???" };
		return `<div class="class-card draggable-card" draggable="true" data-course="${c}"><button class="edit-lib-btn" onclick="openEditLibraryModal('${c}', event)" title="Edit course defaults">✎</button><div class="card-title">${c}</div><div class="card-teacher">${escapeHtml(lib.teacher)}</div><div class="card-room">Room ${escapeHtml(lib.room)}</div></div>`;
	}).join('');
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
		if (e.target.closest('button')) {
			e.preventDefault();
			return;
		}
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

	if (state.lockedDays && state.lockedDays[day]) { alert('This day is locked. Unlock to make changes.'); return; }
	if (currentBlock.locked) { alert('This class is locked. Unlock it first.'); return; }

	if (Number(currentBlock.length) === 2 && event && zone.classList.contains('block-col')) {
		const rect = zone.getBoundingClientRect();
		if ((event.clientY - rect.top) > rect.height / 2) tIdx++;
	}

	if (raw.startsWith('lib:')) {
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

		if (event && event.ctrlKey) {
			pushUndo();
			tBlock.course = temp.course; tBlock.teacher = temp.teacher; tBlock.room = temp.room; tBlock.length = temp.length || 1;
			delete tBlock.forceSingle;
			saveSchedule(state.schedule);
			return;
		}

		if (event && event.shiftKey) {
			pushUndo();
			for (let i = 3; i > tIdx; i--) {
				week[day][i][key] = JSON.parse(JSON.stringify(week[day][i-1][key]));
			}
			week[day][tIdx][key] = temp;
			saveSchedule(state.schedule);
			return;
		}

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
	document.getElementById("requestsButton")?.addEventListener("click", goToRequests);
	document.getElementById('undoButton')?.addEventListener('click', () => undo());
	document.getElementById('lockDayButton')?.addEventListener('click', () => toggleLockDay());

	const afDayBtn = document.getElementById('autofillDayButton');
	const afWeekBtn = document.getElementById('autofillWeekButton');
	if (afDayBtn) {
		console.debug('autofill day button found and listener attached');
		afDayBtn.addEventListener('click', () => autofillDay('day'));
	} else {
		console.debug('autofill day button not present at initAdminPage');
	}
	if (afWeekBtn) {
		console.debug('autofill week button found and listener attached');
		afWeekBtn.addEventListener('click', () => autofillDay('week'));
	} else {
		console.debug('autofill week button not present at initAdminPage');
	}

	const clearWeekBtn = document.getElementById('clearWeekButton');
	if (clearWeekBtn) {
		clearWeekBtn.addEventListener('click', () => clearWeek());
	}

	const submitBtn = document.getElementById('submitRequestButton');
	if (submitBtn) submitBtn.addEventListener('click', submitChangeRequest);

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
	const sch = [
		{ p: 1, s: 465, e: 515 },
		{ p: 2, s: 520, e: 565 },
		{ p: 3, s: 570, e: 615 },
		{ p: 4, s: 620, e: 665 },
		{ p: 5, s: 725, e: 770 },
		{ p: 6, s: 775, e: 820 },
		{ p: 7, s: 825, e: 870 },
		{ p: 8, s: 877, e: 925 }
	];
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

function renderRequestsPage() {
	const user = getLoggedInUser();
	const usernameKey = Object.keys(TEACHERS).find(k => TEACHERS[k].name === user?.name);
	const container = document.getElementById("adminSchedule");
	if (!container) return;

	const requests = state.requests || {};
	const entries = Object.entries(requests);

	let html = `<div class="admin-page-header"><h2>Pending Requests</h2><button type="button" class="secondary-btn" onclick="goToAdminEditor()">Back to Editor</button></div>`;

	if (!entries.length) {
		html += `<p>No requests yet.</p>`;
	} else {
		html += `<ul class="request-list">`;
		entries.sort((a, b) => (b[1]?.timestamp || 0) - (a[1]?.timestamp || 0)).forEach(([id, req]) => {
			const votes = req.votes || {};
			const myVote = usernameKey ? votes[usernameKey] : null;

			html += `
				<li class="request-item">
					<div><strong>Requester:</strong> ${escapeHtml(req.requesterName || req.requester || 'Unknown')}</div>
					<div><strong>Day:</strong> ${escapeHtml(req.day || 'N/A')}</div>
					<div><strong>Status:</strong> ${escapeHtml(req.status || 'PENDING')}</div>
					<div><strong>Your vote:</strong> ${escapeHtml(myVote || "N/A")}</div>
					<button type="button" onclick="viewRequest('${id}')">View details</button>
			`;

			if (req.status === "PENDING" && myVote === "pending") {
				html += `
					<button type="button" onclick="voteOnRequest('${id}', 'approved')">Approve</button>
					<button type="button" onclick="voteOnRequest('${id}', 'rejected')">Reject</button>
				`;
			}

			html += `</li>`;
		});
		html += `</ul>`;
	}

	container.innerHTML = html;
}

function goToAdminEditor() {
	page = 'admin';
	renderAdminPage();
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

function autofillDay(scope) {
	const btn = scope === 'day' ? document.getElementById('autofillDayButton') : document.getElementById('autofillWeekButton');
	if (!btn) return;

	const originalHtml = btn.innerHTML;
	btn.disabled = true;
	const label = scope === 'week' ? 'Filling week...' : 'Autofilling...';
	btn.innerHTML = `<span class="btn-icon">✨</span> ${label}`;

	setTimeout(() => {
		const week = state.schedule.weeks[state.currentWeekIdx];
		if (!week) {
			btn.disabled = false;
			btn.innerHTML = originalHtml;
			return;
		}

		const daysToFill = scope === 'week' ? DAYS : [state.currentDay];
		let totalFilled = 0;

		for (const targetDay of daysToFill) {
			const periods = week[targetDay];
			if (!periods) continue;

			// 1. Fill gaps in Block X (Ensure uniqueness)
			const presentInX = periods.map(p => p.x.course).filter(c => c && c !== "None");
			const missingFromX = COURSES.filter(c => !presentInX.includes(c));

			periods.forEach(p => {
				if ((!p.x.course || p.x.course === "None") && missingFromX.length > 0) {
					const course = missingFromX.shift();
					const lib = COURSE_LIBRARY[course] || { teacher: "TBD", room: "???" };
					p.x = { ...EMPTY_BLOCK, course, teacher: lib.teacher, room: lib.room };
				}
			});

			// 2. Smart Mirror to Block Y (Ensuring uniqueness and respecting locks)
			const xCourses = periods.map(p => p.x.course);
			const yPresent = periods.map(p => p.y.course).filter(c => c && c !== "None");
			const yMissing = COURSES.filter(c => !yPresent.includes(c));

			periods.forEach((p, idx) => {
				if (p.y.locked) return; // Keep locked blocks

				const preferredCourse = xCourses[3 - idx];

				// If the mirrored course is already in Y (due to a lock), pick from missing courses
				if (yPresent.includes(preferredCourse) || preferredCourse === "None") {
					if (yMissing.length > 0) {
						const course = yMissing.shift();
						const lib = COURSE_LIBRARY[course] || { teacher: "TBD", room: "???" };
						p.y = { ...EMPTY_BLOCK, course, teacher: lib.teacher, room: lib.room };
						yPresent.push(course);
					} else {
						p.y = { ...EMPTY_BLOCK };
					}
				} else {
					// Use the preferred mirrored course
					const lib = COURSE_LIBRARY[preferredCourse] || { teacher: "TBD", room: "???" };
					p.y = { ...EMPTY_BLOCK, course: preferredCourse, teacher: lib.teacher, room: lib.room };
					yPresent.push(preferredCourse);
					// Remove from missing if it was there
					const mIdx = yMissing.indexOf(preferredCourse);
					if (mIdx > -1) yMissing.splice(mIdx, 1);
				}
			});

			// 3. Conflict Resolution (Same Teacher/Room in same period)
			const checkConflict = (b1, b2) => {
				if (b1.course === "None" || b2.course === "None") return false;
				return (b1.teacher && b1.teacher === b2.teacher) || (b1.room && b1.room === b2.room);
			};

			for (let i = 0; i < 4; i++) {
				if (checkConflict(periods[i].x, periods[i].y)) {
					for (let j = 0; j < 4; j++) {
						if (i === j || periods[j].y.locked) continue;
						if (!checkConflict(periods[i].x, periods[j].y) && !checkConflict(periods[j].x, periods[i].y)) {
							const temp = periods[i].y;
							periods[i].y = periods[j].y;
							periods[j].y = temp;
							break;
						}
					}
				}
			}
		}

		saveSchedule(state.schedule);
		renderAdminPage();
		btn.disabled = false;
		btn.innerHTML = originalHtml;
		const msg = scope === 'week' ? `Week autofill complete!` : `Autofill complete!`;
		alert(msg);
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
	if (s) s.textContent = isPastDeadline() ? 'Request mode' : 'Synced';
}

function updateAdminActionButtons() {
	const saveBtn = document.getElementById('saveButton');
	const submitBtn = document.getElementById('submitRequestButton');
	const deadlinePast = isPastDeadline();
	if (saveBtn) saveBtn.classList.toggle('hidden', deadlinePast);
	if (submitBtn) submitBtn.classList.toggle('hidden', !deadlinePast);
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

function clearWeek() {
	if (!confirm('Clear all classes for the entire week?')) return;
	const s = state.schedule;
	const week = s.weeks[state.currentWeekIdx];
	const DAYS = ["MON","TUE","WED","THU","FRI"];
	DAYS.forEach(day => {
		if (!week[day]) return;
		week[day].forEach(p => { p.x = { ...EMPTY_BLOCK }; p.y = { ...EMPTY_BLOCK }; });
	});
	saveSchedule(s);
	renderAdminPage();
}
function exportSchedule() {
	const blob = new Blob([JSON.stringify(state.schedule, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a'); a.href = url; a.download = 'schedule.json'; a.click();
	URL.revokeObjectURL(url);
}
function addEventRow() { state.schedule.events.push({ period: 'all', title: '', note: '', description: '' }); saveSchedule(state.schedule); }
function deleteEventRow(i) { state.schedule.events.splice(i, 1); saveSchedule(state.schedule); }
function escapeHtml(s) { return String(s).replace(/[&<>"]'/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])); }
function escapeAttribute(s) { return escapeHtml(s).replace(/`/g, '&#96;'); }

window.voteOnRequest = voteOnRequest;
window.viewRequest = viewRequest;
window.goToRequests = goToRequests;
window.goToAdminEditor = goToAdminEditor;
window.submitChangeRequest = submitChangeRequest;

/** PRESET SYSTEM FUNCTIONS **/

function openPresetModal() {
	const miniGrid = [1, 2, 3, 4].map(p => ({
		period: p,
		x: { ...EMPTY_BLOCK },
		y: { ...EMPTY_BLOCK }
	}));

	const modal = document.createElement('div');
	modal.id = 'presetModal';
	Object.assign(modal.style, {
		position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
		background: 'rgba(0,0,0,0.8)', zIndex: '10000', display: 'flex',
		alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)',
		padding: '20px'
	});

	modal.innerHTML = `
		<div class="surface" style="width: min(1000px, 100%); max-height: 90vh; border-radius: var(--radius-xl); padding: 32px; overflow-y: auto;">
			<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
				<div>
					<p class="eyebrow">Templates</p>
					<h2>Create ${state.currentDay} Preset</h2>
				</div>
				<button class="ghost-btn" onclick="closePresetModal()">✕</button>
			</div>

			<div class="field" style="margin-bottom: 24px;">
				<span>Preset Name</span>
				<input type="text" id="presetNameInput" placeholder="Standard Schedule..." style="width: 100%;">
			</div>

			<div class="admin-grid-2">
				<div id="miniScheduleContainer"></div>
				<aside>
					<p class="eyebrow">Library</p>
					<div id="miniClassCards" class="class-cards-panel"></div>
				</aside>
			</div>

			<div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 32px;">
				<button class="ghost-btn" onclick="closePresetModal()">Cancel</button>
				<button class="primary-btn" id="savePresetBtn">Save Preset</button>
			</div>
		</div>
	`;

	document.body.appendChild(modal);

	const renderMiniGrid = () => {
		const container = modal.querySelector('#miniScheduleContainer');
		container.innerHTML = `
			<table class="schedule-table admin-table">
				<thead><tr><th>Period</th><th>Block X</th><th>Block Y</th></tr></thead>
				<tbody>
					${miniGrid.map((p, idx) => `
						<tr>
							<td class="period-col"><span class="period-label">P${p.period}</span></td>
							<td class="block-col block-x" data-idx="${idx}" data-key="x">${renderMiniBlock(p.x)}</td>
							<td class="block-col block-y" data-idx="${idx}" data-key="y">${renderMiniBlock(p.y)}</td>
						</tr>
					`).join('')}
				</tbody>
			</table>
		`;
		setupMiniDragAndDrop();
	};

	const renderMiniBlock = (b) => {
		if (b.course === "None") return '<div class="empty-placeholder">Empty</div>';
		return `
			<div class="admin-block-cell">
				<div class="block-info">
					<div class="course-name">${escapeHtml(b.course)}</div>
					<div class="teacher-name">${escapeHtml(b.teacher)}</div>
				</div>
			</div>
		`;
	};

	const renderMiniCards = () => {
		const container = modal.querySelector('#miniClassCards');
		container.innerHTML = COURSES.map(c => `
			<div class="class-card draggable-mini-card" draggable="true" data-course="${c}">
				<div class="card-title">${c}</div>
				<div class="card-teacher">${COURSE_LIBRARY[c].teacher}</div>
			</div>
		`).join('');
	};

	const setupMiniDragAndDrop = () => {
		modal.querySelectorAll('.draggable-mini-card').forEach(c => {
			c.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', c.dataset.course));
		});
		modal.querySelectorAll('.block-col').forEach(z => {
			z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('drag-over'); });
			z.addEventListener('dragleave', () => z.classList.remove('drag-over'));
			z.addEventListener('drop', e => {
				e.preventDefault();
				z.classList.remove('drag-over');
				const course = e.dataTransfer.getData('text/plain');
				if (course && COURSE_LIBRARY[course]) {
					const idx = z.dataset.idx;
					const key = z.dataset.key;
					const lib = COURSE_LIBRARY[course];
					miniGrid[idx][key] = { ...EMPTY_BLOCK, course, teacher: lib.teacher, room: lib.room };
					renderMiniGrid();
				}
			});
		});
	};

	renderMiniCards(); // Render cards before grid setup
	renderMiniGrid();

	modal.querySelector('#savePresetBtn').addEventListener('click', () => {
		const name = modal.querySelector('#presetNameInput').value.trim();
		if (!name) return alert('Please enter a preset name');
		savePreset(name, miniGrid);
	});
}

function closePresetModal() {
	document.getElementById('presetModal')?.remove();
}

function savePreset(name, blocks) {
	db.ref("presets").push({
		name,
		day: state.currentDay,
		blocks: blocks
	}).then(() => {
		closePresetModal();
	});
}

function applyPreset(id) {
	const preset = state.presets[id];
	if (!preset) return;
	if (!confirm(`Apply preset "${preset.name}"? This will overwrite the current schedule for ${state.currentDay}.`)) return;

	pushUndo();
	state.schedule.weeks[0][state.currentDay] = JSON.parse(JSON.stringify(preset.blocks));
	saveSchedule(state.schedule);
	renderAdminPage();
}

function deletePreset(id, e) {
	if (e) e.stopPropagation();
	const name = state.presets[id]?.name || "this preset";
	if (confirm(`Are you sure you want to delete "${name}"?`)) {
		db.ref(`presets/${id}`).remove();
	}
}

window.openPresetModal = openPresetModal;
window.closePresetModal = closePresetModal;
window.applyPreset = applyPreset;
window.deletePreset = deletePreset;

/** LIBRARY EDITING FUNCTIONS **/

function openEditLibraryModal(course, e) {
	if (e) e.stopPropagation();
	const data = COURSE_LIBRARY[course];
	if (!data) return;

	const modal = document.createElement('div');
	modal.id = 'libEditModal';
	Object.assign(modal.style, {
		position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
		background: 'rgba(0,0,0,0.8)', zIndex: '11000', display: 'flex',
		alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)'
	});

	modal.innerHTML = `
		<div class="surface" style="width: 400px; border-radius: var(--radius-xl); padding: 32px;">
			<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
				<div>
					<p class="eyebrow">Library</p>
					<h2>Edit ${course} Defaults</h2>
				</div>
				<button class="ghost-btn" onclick="document.getElementById('libEditModal').remove()">✕</button>
			</div>

			<div class="field" style="margin-bottom: 16px;">
				<span>Teacher Name</span>
				<input type="text" id="libTeacherInput" value="${escapeAttribute(data.teacher)}">
			</div>

			<div class="field" style="margin-bottom: 24px;">
				<span>Default Room</span>
				<input type="text" id="libRoomInput" value="${escapeAttribute(data.room)}">
			</div>

			<div style="display: flex; justify-content: flex-end; gap: 12px;">
				<button class="ghost-btn" onclick="document.getElementById('libEditModal').remove()">Cancel</button>
				<button class="primary-btn" id="saveLibBtn">Save Changes</button>
			</div>
		</div>
	`;

	document.body.appendChild(modal);

	modal.querySelector('#saveLibBtn').addEventListener('click', () => {
		const teacher = document.getElementById('libTeacherInput').value.trim();
		const room = document.getElementById('libRoomInput').value.trim();
		if (!teacher || !room) return alert('Both fields are required');

		db.ref(`library/${course}`).set({ teacher, room }).then(() => {
			modal.remove();
		});
	});
}

window.openEditLibraryModal = openEditLibraryModal;
