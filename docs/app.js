// Version 4.0 - Firebase Sync Integration

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

// Initialize Firebase using compat mode for simple browser script support
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const AUTH_KEY = "smcs-schedule-admin-auth";
const ADMIN_USERNAME = "charles";
const ADMIN_PASSWORD = "SMCS";
const COURSES = ["Bio", "CS", "ESS", "FOT"];

const COURSE_LIBRARY = {
	Bio: { teacher: "Mr. Yu", room: "2614" },
	CS: { teacher: "Mrs. Hallisey", room: "1702" },
	ESS: { teacher: "Mr. Kingman", room: "1708" },
	FOT: { teacher: "Ms. Bayonet", room: "1620" },
};

const DEFAULT_SCHEDULE = {
	periods: [
		{ period: 1, x: { course: "Bio", teacher: "Mr. Yu", room: "2614", length: 1, note: "" }, y: { course: "CS", teacher: "Mrs. Hallisey", room: "1702", length: 1, note: "" } },
		{ period: 2, x: { course: "CS", teacher: "Mrs. Hallisey", room: "1702", length: 1, note: "" }, y: { course: "Bio", teacher: "Mr. Yu", room: "2614", length: 1, note: "" } },
		{ period: 3, x: { course: "ESS", teacher: "Mr. Kingman", room: "1708", length: 1, note: "" }, y: { course: "FOT", teacher: "Ms. Bayonet", room: "1620", length: 1, note: "" } },
		{ period: 4, x: { course: "FOT", teacher: "Ms. Bayonet", room: "1620", length: 1, note: "" }, y: { course: "ESS", teacher: "Mr. Kingman", room: "1708", length: 1, note: "" } },
	],
	events: [
		{ period: "all", title: "Welcome Assembly", note: "Gym after Period 2", description: "" },
	],
};

const state = {
	schedule: DEFAULT_SCHEDULE,
	darkMode: true,
	selectedCourse: null, // "Bio", "CS", etc.
};

document.addEventListener("DOMContentLoaded", () => {
	const page = document.body.dataset.page;
	loadDarkModePreference();

	// Initialize Real-time Sync
	db.ref('schedule').on('value', (snapshot) => {
		const data = snapshot.val();
		if (data) {
			state.schedule = ensureScheduleShape(data);
		} else {
			// First time setup: push default schedule to Firebase
			saveSchedule(DEFAULT_SCHEDULE);
		}

		// Refresh the UI whenever data changes in Firebase
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
	for (let idx = 0; idx < schedule.periods.length - 1; idx++) {
		const p = schedule.periods[idx];
		const next = schedule.periods[idx + 1];

		['x', 'y'].forEach(key => {
			const b1 = p[key];
			const b2 = next[key];

			// If b1 is already a double, it covers b2, so we don't start a new double at b2
			const prev = idx > 0 ? schedule.periods[idx - 1] : null;
			if (prev && Number(prev[key].length) === 2) return;

			if (b1.course && b1.course !== "None" && b1.course === b2.course) {
				b1.length = 2;
				b2.teacher = b1.teacher;
				b2.room = b1.room;
				b2.length = 1;
			} else if (Number(b1.length) === 2) {
				if (b1.course !== b2.course) {
					b1.length = 1;
				}
			}
		});
	}
}

function initPublicPage() {
	renderPublicPage();
	setupSettingsMenu();
}

function initAdminPage() {
	if (!isAuthenticated()) {
		document.body.classList.add('auth-mode');
		document.getElementById("loginPanel").hidden = false;
		document.getElementById("adminApp").hidden = true;
		document.getElementById("adminLoginForm").addEventListener("submit", handleAdminLogin);
		return;
	}
	document.body.classList.remove('auth-mode');
	document.getElementById("loginPanel").hidden = true;
	document.getElementById("adminApp").hidden = false;
	renderAdminPage();
	setupSettingsMenu();
	document.getElementById("logoutButton").addEventListener("click", handleLogout);
	const adminApp = document.getElementById("adminApp");
	adminApp.addEventListener("change", handleAdminInput); // Changed from 'input' to 'change'
	adminApp.addEventListener("click", handleAdminClick);
}

function handleAdminLogin(event) {
	event.preventDefault();
	const u = document.getElementById("adminUsername").value.trim();
	const p = document.getElementById("adminPassword").value;
	if (u === ADMIN_USERNAME && p === ADMIN_PASSWORD) {
		localStorage.setItem(AUTH_KEY, "ok");
		location.reload();
	} else {
		const err = document.getElementById("loginError");
		err.textContent = "Invalid username or password.";
		err.hidden = false;
	}
}

function handleLogout() {
	localStorage.removeItem(AUTH_KEY);
	location.reload();
}

function handleAdminInput(event) {
	const target = event.target;
	const schedule = state.schedule;

	// Handle Event Fields (Title, Note, Description, Period)
	if (target.matches("[data-event-field]")) {
		const idx = Number(target.dataset.eventIndex);
		const field = target.dataset.eventField;
		if (schedule.events[idx]) {
			schedule.events[idx][field] = target.value === "all" ? "all" : (isNaN(target.value) ? target.value : Number(target.value));
			saveSchedule(schedule);
			updateSaveStatus();
		}
	}

	// Handle Room Edits
	if (target.matches("[data-room-edit]")) {
		const idx = Number(target.dataset.periodIndex);
		const key = target.dataset.blockKey;
		if (schedule.periods[idx]) {
			schedule.periods[idx][key].room = target.value;
			saveSchedule(schedule);
			updateSaveStatus();
		}
	}
}

function handleAdminClick(event) {
	const target = event.target;
	if (target.matches("#resetButton")) resetSampleSchedule();
	if (target.matches("#exportButton")) exportSchedule();
	if (target.matches("#addEventButton")) addEventRow();
	if (target.matches("[data-action='delete-event']")) deleteEventRow(Number(target.dataset.eventIndex));
	if (target.matches("[data-action='toggle-description']")) {
		const idx = target.dataset.eventIndex;
		const el = document.querySelector(`.desc-container[data-event-index="${idx}"]`);
		if (el) {
			el.classList.toggle('hidden');
			target.textContent = el.classList.contains('hidden') ? 'Add description' : 'Hide description';
		}
	}
		if (target.matches("[data-action='toggle-double']")) {
		const idx = Number(target.dataset.periodIndex);
		const key = target.dataset.blockKey;
		const schedule = state.schedule;
		const block = schedule.periods[idx][key];
		const isNowDouble = Number(block.length) === 1;
		if (isNowDouble) {
			block.length = 2;
			if (schedule.periods[idx + 1]) {
				const next = schedule.periods[idx + 1][key];
				next.course = block.course;
				next.teacher = block.teacher;
				next.room = block.room;
				next.length = 1;
			}
		} else {
			block.length = 1;
		}
		saveSchedule(schedule);
	}
}

function renderPublicPage() {
	const schedule = state.schedule;
	document.getElementById("publicSchedule").innerHTML = renderPublicTable(schedule);
	document.getElementById("publicEvents").innerHTML = renderEventFeed(schedule);
}

function renderAdminPage() {
	const schedule = state.schedule;
	document.getElementById("adminSchedule").innerHTML = renderAdminTable(schedule);
	document.getElementById("adminClassCards").innerHTML = renderClassCards();
	document.getElementById("eventsEditor").innerHTML = renderEventsEditor(schedule);
	updateSaveStatus();
	setupDragAndDrop();
}

function renderPublicTable(schedule) {
	let html = `<table class="schedule-table"><thead><tr><th class="period-col">Period</th><th class="block-col">Block X</th><th class="block-col">Block Y</th></tr></thead><tbody>`;
	schedule.periods.forEach((p, idx) => {
		const prev = idx > 0 ? schedule.periods[idx-1] : null;
		const skipX = prev && Number(prev.x.length) === 2;
		const skipY = prev && Number(prev.y.length) === 2;
		html += `<tr class="period-row">
			<td class="period-col"><span class="period-label">Period ${p.period}</span></td>
			${skipX ? '' : `<td class="block-col block-x" ${Number(p.x.length) === 2 ? 'rowspan="2"' : ''}>
				<div class="table-block">
					<div class="course-name">${escapeHtml(p.x.course)}</div>
					<div class="teacher-name">${escapeHtml(p.x.teacher)}</div>
					<div class="room-number">Room ${escapeHtml(p.x.room)}</div>
					${Number(p.x.length) === 2 ? '<div class="double-badge">Double Period</div>' : ''}
				</div>
			</td>`}
			${skipY ? '' : `<td class="block-col block-y" ${Number(p.y.length) === 2 ? 'rowspan="2"' : ''}>
				<div class="table-block">
					<div class="course-name">${escapeHtml(p.y.course)}</div>
					<div class="teacher-name">${escapeHtml(p.y.teacher)}</div>
					<div class="room-number">Room ${escapeHtml(p.y.room)}</div>
					${Number(p.y.length) === 2 ? '<div class="double-badge">Double Period</div>' : ''}
				</div>
			</td>`}
		</tr>`;
	});
	return html + `</tbody></table>`;
}

function renderAdminTable(schedule) {
	let html = `<table class="schedule-table admin-table"><thead><tr><th class="period-col">Period</th><th class="block-col">Block X</th><th class="block-col">Block Y</th></tr></thead><tbody>`;
	schedule.periods.forEach((p, idx) => {
		const prev = idx > 0 ? schedule.periods[idx - 1] : null;
		const skipX = prev && Number(prev.x.length) === 2;
		const skipY = prev && Number(prev.y.length) === 2;
		html += `<tr>
			<td class="period-col"><span class="period-label">Period ${p.period}</span></td>
			${skipX ? '' : `<td class="block-col block-x" data-block="x" data-period-index="${idx}" ${Number(p.x.length) === 2 ? 'rowspan="2"' : ''}>
				${renderAdminBlock(p.x, 'x', idx)}
			</td>`}
			${skipY ? '' : `<td class="block-col block-y" data-block="y" data-period-index="${idx}" ${Number(p.y.length) === 2 ? 'rowspan="2"' : ''}>
				${renderAdminBlock(p.y, 'y', idx)}
			</td>`}
		</tr>`;
	});
	return html + `</tbody></table>`;
}

function renderAdminBlock(block, key, idx) {
	const isDouble = Number(block.length) === 2;
	const canDouble = idx < 3;
	return `<div class="admin-block-cell ${isDouble ? 'is-double' : ''}">
		<div class="block-info">
			<div class="course-name">${escapeHtml(block.course)}</div>
			<div class="teacher-name">${escapeHtml(block.teacher)}</div>
		</div>
		<div class="block-controls">
			<input type="text" class="room-input" data-room-edit value="${escapeAttribute(block.room)}" data-period-index="${idx}" data-block-key="${key}" placeholder="Room">
			<div class="block-actions">
				${canDouble ? `<button class="toggle-double-btn ${isDouble ? 'active' : ''}" data-action="toggle-double" data-period-index="${idx}" data-block-key="${key}">${isDouble ? 'Double Period ON' : 'Make Double'}</button>` : ''}
			</div>
		</div>
		${isDouble ? '<div class="double-badge">Double Period</div>' : ''}
	</div>`;
}

function renderClassCards() {
	return COURSES.map(c => `<div class="class-card draggable-card" draggable="true" data-course="${c}"><div class="card-title">${c}</div><div class="card-teacher">${COURSE_LIBRARY[c].teacher}</div><div class="card-room">Room ${COURSE_LIBRARY[c].room}</div></div>`).join('');
}

function setupDragAndDrop() {
	const cards = document.querySelectorAll('.draggable-card');
	const zones = document.querySelectorAll('.admin-table .block-col');

	// CLICK-TO-ASSIGN logic (Much easier than dragging)
	cards.forEach(c => {
		// Handle Drag
		c.addEventListener('dragstart', e => {
			e.dataTransfer.setData('text/plain', c.dataset.course);
			c.classList.add('dragging');
		});
		c.addEventListener('dragend', () => c.classList.remove('dragging'));

		// Handle Click
		c.addEventListener('click', () => {
			if (state.selectedCourse === c.dataset.course) {
				state.selectedCourse = null;
				c.classList.remove('active-selection');
			} else {
				cards.forEach(card => card.classList.remove('active-selection'));
				state.selectedCourse = c.dataset.course;
				c.classList.add('active-selection');
			}
		});
	});

	zones.forEach(z => {
		// Drag & Drop zones
		z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('drag-over'); });
		z.addEventListener('dragleave', () => z.classList.remove('drag-over'));
		z.addEventListener('drop', e => {
			e.preventDefault();
			z.classList.remove('drag-over');
			const course = e.dataTransfer.getData('text/plain');
			handleSelection(z, course, e);
		});

		// Click to assign
		z.addEventListener('click', (e) => {
			// Don't assign if they clicked an input or button
			if (e.target.closest('input') || e.target.closest('button')) return;

			if (state.selectedCourse) {
				handleSelection(z, state.selectedCourse, e);
			}
		});
	});
}

function handleSelection(zone, course, event) {
	if (!course) return;
	let targetIdx = Number(zone.dataset.periodIndex);
	const targetKey = zone.dataset.block;

	// Check if we are interacting with a double period
	const block = state.schedule.periods[targetIdx][targetKey];
	if (Number(block.length) === 2 && event) {
		const rect = zone.getBoundingClientRect();
		const relativeY = event.clientY - rect.top;
		// If clicked/dropped in the bottom half, target the next period
		if (relativeY > rect.height / 2) {
			targetIdx = targetIdx + 1;
		}
	}

	assignCourseToZone(targetIdx, targetKey, course);
}

function assignCourseToZone(idx, key, course) {
	const block = state.schedule.periods[idx][key];
	block.course = course;
	const lib = COURSE_LIBRARY[course] || COURSE_LIBRARY.Bio;
	block.teacher = lib.teacher;
	block.room = lib.room;
	block.length = 1;

	saveSchedule(state.schedule);
}

function renderEventsEditor(schedule) {
	if (!schedule.events.length) return '<p class="muted-copy">No special events.</p>';
	return `<div class="event-editor-horizontal">
		${schedule.events.map((ev, i) => {
			const hasDesc = ev.description && ev.description.length > 0;
			return `<div class="event-editor-card" data-event-index="${i}">
				<div class="field"><span>When</span><select data-event-field="period" data-event-index="${i}">${['all', 1, 2, 3, 4].map(v => `<option value="${v}" ${ev.period == v ? 'selected' : ''}>${v == 'all' ? 'All day' : 'Period ' + v}</option>`).join('')}</select></div>
				<div class="field"><span>Title</span><input type="text" data-event-field="title" data-event-index="${i}" value="${escapeAttribute(ev.title)}"></div>
				<div class="field"><span>Note</span><input type="text" data-event-field="note" data-event-index="${i}" value="${escapeAttribute(ev.note)}"></div>
				<div class="desc-container ${hasDesc ? '' : 'hidden'}" data-event-index="${i}">
					<div class="field"><span>Description</span><textarea data-event-field="description" data-event-index="${i}">${escapeAttribute(ev.description)}</textarea></div>
				</div>
				<div class="event-actions">
					<button class="ghost-btn small-btn" data-action="toggle-description" data-event-index="${i}">${hasDesc ? 'Hide Desc' : 'Add Desc'}</button>
					<button class="ghost-btn small-btn" data-action="delete-event" data-event-index="${i}">Remove</button>
				</div>
			</div>`;
		}).join('')}
	</div>`;
}

function renderEventFeed(schedule) {
	if (!schedule.events.length) return '<p class="muted-copy">No special events scheduled.</p>';
	return schedule.events.map(ev => `
		<article class="event-card">
			<div class="event-header">
				<span class="event-chip">${ev.period === 'all' ? 'All day' : 'Period ' + ev.period}</span>
			</div>
			<div class="event-title">${escapeHtml(ev.title)}</div>
			${ev.note ? `<div class="event-note">${escapeHtml(ev.note)}</div>` : ''}
			${ev.description ? `<div class="event-description">${escapeHtml(ev.description)}</div>` : ''}
		</article>
	`).join('');
}

function ensureScheduleShape(s) {
	if (!s || !Array.isArray(s.periods)) return JSON.parse(JSON.stringify(DEFAULT_SCHEDULE));
	let ps = s.periods;
	ps = ps.slice(0, 4).map((p, i) => ({
		period: i + 1,
		x: normalizeBlock(p.x),
		y: normalizeBlock(p.y)
	}));
	return { periods: ps, events: Array.isArray(s.events) ? s.events : [] };
}

function normalizeBlock(b) {
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
function resetSampleSchedule() { if (confirm('Reset to default for EVERYONE?')) { saveSchedule(DEFAULT_SCHEDULE); } }
function exportSchedule() {
	const blob = new Blob([JSON.stringify(state.schedule, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url; a.download = 'schedule.json'; a.click();
	URL.revokeObjectURL(url);
}
function addEventRow() { state.schedule.events.push({ period: 'all', title: '', note: '', description: '' }); saveSchedule(state.schedule); }
function deleteEventRow(i) { state.schedule.events.splice(i, 1); saveSchedule(state.schedule); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])); }
function escapeAttribute(s) { return escapeHtml(s).replace(/`/g, '&#96;'); }
