// Version 3.1 - Enhanced Admin & UI Fixes

const STORAGE_KEY = "smcs-schedule-data-v4";
const AUTH_KEY = "smcs-schedule-admin-auth";
const ADMIN_USERNAME = "charles";
const ADMIN_PASSWORD = "SMCS";
const COURSES = ["Bio", "CS", "ESS", "FOT"];
const PERIODS = [1, 2, 3, 4];
const PERIOD_OPTIONS = [1, 2, 3, 4];

const COURSE_LIBRARY = {
	Bio: { teacher: "Mr. Yu", room: "2614" },
	CS: { teacher: "Mrs. Hallisey", room: "1702" },
	ESS: { teacher: "Mr. Kingman", room: "1708" },
	FOT: { teacher: "Ms. Bayonet", room: "1620" },
};

const DEFAULT_SCHEDULE = {
	periods: [
		createPeriod(1, createBlock("Bio", { room: "2614", note: "" }), createBlock("CS", { room: "1702", note: "" })),
		createPeriod(2, createBlock("CS", { room: "1702", note: "" }), createBlock("Bio", { room: "2614", note: "" })),
		createPeriod(3, createBlock("ESS", { room: "1708", length: 1, note: "" }), createBlock("FOT", { room: "1620", length: 1, note: "" })),
		createPeriod(4, createBlock("FOT", { room: "1620", note: "" }), createBlock("ESS", { room: "1708", note: "" })),
	],
	events: [
		{ period: "all", title: "Welcome Assembly", note: "Gym after Period 2", description: "" },
	],
};

const state = {
	schedule: null,
	darkMode: true,
};

function createBlock(course, overrides = {}) {
	const base = COURSE_LIBRARY[course] || { teacher: "TBA", room: "TBA" };
	return {
		course,
		teacher: overrides.teacher || base.teacher,
		room: overrides.room || base.room,
		length: overrides.length || 1,
		note: overrides.note || "",
	};
}

function createPeriod(period, x, y) {
	return { period, x, y };
}

document.addEventListener("DOMContentLoaded", () => {
	const page = document.body.dataset.page;
	state.schedule = loadSchedule();
	loadDarkModePreference();

	if (page === "public") {
		initPublicPage();
	} else if (page === "admin") {
		initAdminPage();
	}
});

window.addEventListener("storage", (event) => {
	if (event.key === STORAGE_KEY) {
		state.schedule = loadSchedule();
		if (document.body.dataset.page === "public") renderPublicPage();
		if (document.body.dataset.page === "admin" && isAuthenticated()) renderAdminPage();
	}
});

function initPublicPage() {
	renderPublicPage();
	setupSettingsMenu();
}

function initAdminPage() {
	const loginPanel = document.getElementById("loginPanel");
	const adminApp = document.getElementById("adminApp");
	const loginForm = document.getElementById("adminLoginForm");
	const logoutButton = document.getElementById("logoutButton");

	loginForm.addEventListener("submit", handleAdminLogin);
	logoutButton.addEventListener("click", handleLogout);
	bindAdminControls();

	if (isAuthenticated()) {
		loginPanel.hidden = true;
		adminApp.hidden = false;
		renderAdminPage();
		setupSettingsMenu();
	} else {
		adminApp.hidden = true;
		loginPanel.hidden = false;
	}
}

function bindAdminControls() {
	const adminApp = document.getElementById("adminApp");
	adminApp.addEventListener("input", handleAdminInput);
	adminApp.addEventListener("change", handleAdminChange);
	adminApp.addEventListener("click", handleAdminClick);
}

function handleAdminLogin(event) {
	event.preventDefault();
	const username = document.getElementById("adminUsername").value.trim();
	const password = document.getElementById("adminPassword").value;
	const errorBox = document.getElementById("loginError");

	if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
		errorBox.textContent = "Invalid credentials.";
		errorBox.hidden = false;
		return;
	}

	localStorage.setItem(AUTH_KEY, "ok");
	location.reload();
}

function handleLogout() {
	localStorage.removeItem(AUTH_KEY);
	location.reload();
}

function handleAdminInput(event) {
	const target = event.target;
	const schedule = state.schedule;

	if (target.matches("[data-event-field]")) {
		const index = Number(target.dataset.eventIndex);
		const field = target.dataset.eventField;
		if (schedule.events[index]) {
			schedule.events[index][field] = target.value;
			saveSchedule(schedule);
			updateSaveStatus();
		}
	}

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

function handleAdminChange(event) {
	const target = event.target;
	if (target.matches("[data-event-field='period']")) {
		const index = Number(target.dataset.eventIndex);
		state.schedule.events[index].period = target.value === "all" ? "all" : Number(target.value);
		saveSchedule(state.schedule);
		updateSaveStatus();
	}
}

function handleAdminClick(event) {
	const target = event.target;
	
	if (target.matches("#resetButton")) resetSampleSchedule();
	if (target.matches("#exportButton")) exportSchedule();
	if (target.matches("#addEventButton")) addEventRow();

	if (target.matches("[data-action='delete-event']")) {
		deleteEventRow(Number(target.dataset.eventIndex));
	}

	if (target.matches("[data-action='toggle-description']")) {
		const index = target.dataset.eventIndex;
		const container = document.querySelector(`.desc-container[data-event-index="${index}"]`);
		if (container) {
			container.classList.toggle('hidden');
			target.textContent = container.classList.contains('hidden') ? 'Add description' : 'Hide description';
		}
	}

	if (target.matches("[data-action='toggle-double']")) {
		toggleDoublePeriod(target);
	}
}

function renderPublicPage() {
	const schedule = state.schedule;
	document.getElementById("publicSchedule").innerHTML = renderPublicScheduleTable(schedule);
	document.getElementById("publicEvents").innerHTML = renderEventFeed(schedule);
}

function renderAdminPage() {
	const schedule = state.schedule;
	document.getElementById("adminSchedule").innerHTML = renderAdminScheduleTable(schedule);
	document.getElementById("adminClassCards").innerHTML = renderClassCards();
	document.getElementById("eventsEditor").innerHTML = renderEventsEditor(schedule);
	updateSaveStatus();
	setupDragAndDrop();
}

function renderPublicScheduleTable(schedule) {
	return `
		<table class="schedule-table">
			<thead>
				<tr>
					<th class="period-col">Period</th>
					<th class="block-col">Block X</th>
					<th class="block-col">Block Y</th>
				</tr>
			</thead>
			<tbody>
				${schedule.periods.map((period, idx) => {
					const prev = idx > 0 ? schedule.periods[idx - 1] : null;
					const xDoubleCont = prev && Number(prev.x.length) === 2;
					const yDoubleCont = prev && Number(prev.y.length) === 2;
					
					// Determine if we should skip rendering a cell because of a double from above
					// But we still need the row if either column is NOT covered.
					if (xDoubleCont && yDoubleCont) return '';

					return `
						<tr class="period-row">
							<td class="period-col">
								<span class="period-label">Period ${period.period}</span>
							</td>
							${xDoubleCont ? '' : `
								<td class="block-col block-x" ${Number(period.x.length) === 2 ? 'rowspan="2"' : ''}>
									<div class="table-block">
										<div class="course-name">${escapeHtml(period.x.course)}</div>
										<div class="teacher-name">${escapeHtml(period.x.teacher)}</div>
										<div class="room-number">Room ${escapeHtml(period.x.room)}</div>
										${Number(period.x.length) === 2 ? '<span class="double-badge">Double Period</span>' : ''}
									</div>
								</td>
							`}
							${yDoubleCont ? '' : `
								<td class="block-col block-y" ${Number(period.y.length) === 2 ? 'rowspan="2"' : ''}>
									<div class="table-block">
										<div class="course-name">${escapeHtml(period.y.course)}</div>
										<div class="teacher-name">${escapeHtml(period.y.teacher)}</div>
										<div class="room-number">Room ${escapeHtml(period.y.room)}</div>
										${Number(period.y.length) === 2 ? '<span class="double-badge">Double Period</span>' : ''}
									</div>
								</td>
							`}
						</tr>
					`;
				}).filter(r => r).join('')}
			</tbody>
		</table>
	`;
}

function renderAdminScheduleTable(schedule) {
	// In admin view, we always show all 4 periods to avoid "missing period 4" confusion
	return `
		<table class="schedule-table admin-table">
			<thead>
				<tr>
					<th class="period-col">Period</th>
					<th class="block-col">Block X</th>
					<th class="block-col">Block Y</th>
				</tr>
			</thead>
			<tbody>
				${schedule.periods.map((period, idx) => `
					<tr class="period-row" data-period-index="${idx}">
						<td class="period-col">
							<span class="period-label">Period ${period.period}</span>
						</td>
						<td class="block-col block-x" data-block="x" data-period-index="${idx}">
							${renderAdminBlockCell(period, 'x', idx)}
						</td>
						<td class="block-col block-y" data-block="y" data-period-index="${idx}">
							${renderAdminBlockCell(period, 'y', idx)}
						</td>
					</tr>
				`).join('')}
			</tbody>
		</table>
	`;
}

function renderAdminBlockCell(period, key, idx) {
	const block = period[key];
	const isDouble = Number(block.length) === 2;
	const isLastPeriod = idx === state.schedule.periods.length - 1;
	
	return `
		<div class="admin-block-cell" data-period-index="${idx}" data-block-key="${key}">
			<div class="cell-display">
				<div class="course-name">${escapeHtml(block.course)}</div>
				<div class="teacher-name">${escapeHtml(block.teacher)}</div>
				<div class="room-number" title="Click to edit room">
					<input type="text" class="room-input" data-room-edit value="${escapeAttribute(block.room)}" data-period-index="${idx}" data-block-key="${key}">
				</div>
				<div class="block-actions">
					${!isLastPeriod ? `
						<button class="toggle-double-btn ${isDouble ? 'active' : ''}"
							data-action="toggle-double"
							data-period-index="${idx}"
							data-block-key="${key}">
							${isDouble ? 'Double' : 'Single'}
						</button>
					` : ''}
				</div>
			</div>
		</div>
	`;
}

function renderClassCards() {
	return COURSES.map(course => `
		<div class="class-card draggable-card" draggable="true" data-course="${course}">
			<div class="card-title">${course}</div>
			<div class="card-teacher">${COURSE_LIBRARY[course].teacher}</div>
			<div class="card-room">Room ${COURSE_LIBRARY[course].room}</div>
		</div>
	`).join('');
}

function setupDragAndDrop() {
	const adminSchedule = document.getElementById('adminSchedule');
	const adminClassCards = document.getElementById('adminClassCards');
	if (!adminSchedule || !adminClassCards) return;

	adminClassCards.querySelectorAll('.draggable-card').forEach(card => {
		card.addEventListener('dragstart', e => {
			e.dataTransfer.setData('application/json', JSON.stringify({ course: card.dataset.course }));
			card.classList.add('dragging');
		});
		card.addEventListener('dragend', () => card.classList.remove('dragging'));
	});

	adminSchedule.querySelectorAll('.block-col').forEach(cell => {
		cell.addEventListener('dragover', e => {
			e.preventDefault();
			cell.classList.add('drag-over');
		});
		cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
		cell.addEventListener('drop', e => {
			e.preventDefault();
			cell.classList.remove('drag-over');
			try {
				const data = JSON.parse(e.dataTransfer.getData('application/json'));
				const { periodIndex, block } = cell.dataset;
				const schedule = state.schedule;
				const targetBlock = schedule.periods[Number(periodIndex)][block];
				targetBlock.course = data.course;
				applyCourseDefaults(targetBlock, data.course);
				saveSchedule(schedule);
				renderAdminPage();
			} catch (err) {}
		});
	});
}

function toggleDoublePeriod(button) {
	const idx = Number(button.dataset.periodIndex);
	const key = button.dataset.blockKey;
	const schedule = state.schedule;
	const block = schedule.periods[idx][key];
	
	block.length = Number(block.length) === 2 ? 1 : 2;
	saveSchedule(schedule);
	renderAdminPage();
}

function renderEventsEditor(schedule) {
	if (!schedule.events.length) return '<p class="muted-copy">No special events.</p>';

	return schedule.events.map((item, index) => {
		const periodOptions = ['all', 1, 2, 3, 4].map(v => {
			const label = v === 'all' ? 'All day' : `Period ${v}`;
			const selected = item.period === v || (v === 'all' && item.period === 'all');
			return `<option value="${v}" ${selected ? 'selected' : ''}>${label}</option>`;
		}).join('');

		const hasDesc = item.description && item.description.trim().length > 0;

		return `
			<div class="event-row" data-event-index="${index}">
				<div class="field">
					<span>When</span>
					<select data-event-field="period" data-event-index="${index}">${periodOptions}</select>
				</div>
				<div class="field">
					<span>Title</span>
					<input data-event-field="title" data-event-index="${index}" type="text" value="${escapeAttribute(item.title)}">
				</div>
				<div class="field">
					<span>Note</span>
					<input data-event-field="note" data-event-index="${index}" type="text" value="${escapeAttribute(item.note || '')}">
				</div>
				<div class="desc-container ${hasDesc ? '' : 'hidden'}" data-event-index="${index}">
					<div class="field event-description-field">
						<span>Description</span>
						<textarea data-event-field="description" data-event-index="${index}" rows="2">${escapeAttribute(item.description || '')}</textarea>
					</div>
				</div>
				<div class="event-actions">
					<button class="ghost-btn small-btn" data-action="toggle-description" data-event-index="${index}">${hasDesc ? 'Hide description' : 'Add description'}</button>
					<button class="ghost-btn small-btn" data-action="delete-event" data-event-index="${index}">Remove</button>
				</div>
			</div>
		`;
	}).join('');
}

function renderEventFeed(schedule) {
	if (!schedule.events.length) return '<p class="muted-copy">No special events.</p>';
	return schedule.events.map(item => `
		<article class="event-card">
			<div class="inline-line">
				<span class="event-chip"><small>${item.period === 'all' ? 'All day' : `Period ${item.period}`}</small></span>
				<span class="tag">Special event</span>
			</div>
			<div class="event-title">${escapeHtml(item.title)}</div>
			${item.note ? `<div class="event-note">${escapeHtml(item.note)}</div>` : ''}
			${item.description ? `<div class="event-description">${escapeHtml(item.description)}</div>` : ''}
		</article>
	`).join('');
}

function loadSchedule() {
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return saveSchedule(DEFAULT_SCHEDULE);
	try {
		return ensureScheduleShape(JSON.parse(raw));
	} catch (e) {
		return saveSchedule(DEFAULT_SCHEDULE);
	}
}

function ensureScheduleShape(s) {
	if (!s || !Array.isArray(s.periods)) return DEFAULT_SCHEDULE;
	while (s.periods.length < 4) {
		const nextP = s.periods.length + 1;
		s.periods.push(createPeriod(nextP, createBlock("Bio"), createBlock("CS")));
	}
	s.periods = s.periods.slice(0, 4).map((p, i) => ({
		period: i + 1,
		x: normalizeBlock(p.x),
		y: normalizeBlock(p.y)
	}));
	if (!Array.isArray(s.events)) s.events = [];
	return s;
}

function normalizeBlock(b) {
	const defaults = COURSE_LIBRARY[b?.course] || COURSE_LIBRARY.Bio;
	return {
		course: b?.course || "Bio",
		teacher: b?.teacher || defaults.teacher,
		room: b?.room || defaults.room,
		length: Number(b?.length) === 2 ? 2 : 1,
		note: b?.note || ""
	};
}

function saveSchedule(s) {
	state.schedule = s;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
	return s;
}

function setupSettingsMenu() {
	const btn = document.getElementById('settingsButton');
	const menu = document.getElementById('settingsMenu');
	if (!btn || !menu) return;

	btn.addEventListener('click', (e) => {
		e.stopPropagation();
		menu.classList.toggle('hidden');
	});

	document.getElementById('darkModeToggle')?.addEventListener('click', () => setDarkMode(true));
	document.getElementById('lightModeToggle')?.addEventListener('click', () => setDarkMode(false));

	document.addEventListener('click', (e) => {
		if (!menu.contains(e.target) && e.target !== btn) menu.classList.add('hidden');
	});
}

function setDarkMode(isDark) {
	localStorage.setItem('smcs-schedule-dark-mode', isDark);
	document.body.classList.toggle('dark-mode', isDark);
	document.body.classList.toggle('light-mode', !isDark);
	document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
	document.getElementById('settingsMenu')?.classList.add('hidden');
}

function loadDarkModePreference() {
	const saved = localStorage.getItem('smcs-schedule-dark-mode');
	setDarkMode(saved === null ? true : saved === 'true');
}

function applyCourseDefaults(block, course) {
	const d = COURSE_LIBRARY[course];
	if (d) {
		block.teacher = d.teacher;
		block.room = d.room;
	}
}

function updateSaveStatus() {
	const status = document.getElementById('saveStatus');
	if (status) status.textContent = 'Saved to browser';
}

function isAuthenticated() { return localStorage.getItem(AUTH_KEY) === 'ok'; }

function resetSampleSchedule() {
	if (confirm('Reset to default?')) {
		saveSchedule(DEFAULT_SCHEDULE);
		renderAdminPage();
	}
}

function exportSchedule() {
	const blob = new Blob([JSON.stringify(state.schedule, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'schedule.json';
	a.click();
	URL.revokeObjectURL(url);
}

function addEventRow() {
	state.schedule.events.push({ period: 'all', title: '', note: '', description: '' });
	saveSchedule(state.schedule);
	renderAdminPage();
}

function deleteEventRow(idx) {
	state.schedule.events.splice(idx, 1);
	saveSchedule(state.schedule);
	renderAdminPage();
}

function escapeHtml(s) {
	return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));
}

function escapeAttribute(s) {
	return escapeHtml(s).replace(/`/g, '&#96;');
}
