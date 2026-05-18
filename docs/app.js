// Version 3.0 - Simple 4-period schedule without weeks

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
		createPeriod(1, createBlock("Bio", { room: "2614", note: "Lab prep" }), createBlock("CS", { room: "1702", note: "Design intro" })),
		createPeriod(2, createBlock("CS", { room: "1702", note: "Coding workshop" }), createBlock("Bio", { room: "2614", note: "Theory review" })),
		createPeriod(3, createBlock("ESS", { room: "1708", length: 2, note: "Field study" }), createBlock("FOT", { room: "1620", length: 2, note: "Workshop block" })),
		createPeriod(4, createBlock("FOT", { room: "1620", note: "Build sprint" }), createBlock("ESS", { room: "1708", note: "Map work" })),
	],
	events: [
		{ period: "all", title: "Welcome Assembly", note: "Gym after Period 2", description: "" },
		{ period: 3, title: "Advisory Check-In", note: "Shortened transition between blocks", description: "" },
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

function createWeek(id, name, focus, notes, events, periods) {
	return {
		id,
		name,
		focus,
		notes,
		events,
		periods,
	};
}

document.addEventListener("DOMContentLoaded", () => {
	const page = document.body.dataset.page;
	state.schedule = loadSchedule();
	loadDarkModePreference();

	if (page === "public") {
		initPublicPage();
		return;
	}

	if (page === "admin") {
		initAdminPage();
	}
});

window.addEventListener("storage", (event) => {
	if (event.key === STORAGE_KEY) {
		state.schedule = loadSchedule();
		if (document.body.dataset.page === "public") {
			renderPublicPage();
		}
		if (document.body.dataset.page === "admin" && isAuthenticated()) {
			renderAdminPage();
		}
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
		setupDragAndDrop();
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
		errorBox.textContent = "Invalid username or password.";
		errorBox.hidden = false;
		return;
	}

	localStorage.setItem(AUTH_KEY, "ok");
	document.getElementById("loginPanel").hidden = true;
	document.getElementById("adminApp").hidden = false;
	errorBox.hidden = true;
	state.adminWeekId = state.schedule.activeWeekId;
	renderAdminPage();
}

function handleLogout() {
	localStorage.removeItem(AUTH_KEY);
	location.reload();
}

function handleAdminInput(event) {
	const target = event.target;
	const schedule = state.schedule;

	if (target.matches("[data-event-field]")) {
		const eventIndex = Number(target.dataset.eventIndex);
		const eventField = target.dataset.eventField;
		if (!schedule.events[eventIndex]) {
			return;
		}
		schedule.events[eventIndex][eventField] = target.value;
		saveSchedule(schedule);
		updateSaveStatus();
		return;
	}

	if (target.matches("[data-block-field]")) {
		const periodIndex = Number(target.dataset.periodIndex);
		const blockKey = target.dataset.blockKey;
		const field = target.dataset.blockField;
		const period = schedule.periods[periodIndex];
		if (!period) {
			return;
		}

		const block = period[blockKey];
		block[field] = field === "length" ? Number(target.value) : target.value;

		if (field === "course") {
			applyCourseDefaults(block, target.value);
			saveSchedule(schedule);
			renderAdminPage();
			return;
		}

		saveSchedule(schedule);
		updateSaveStatus();
	}

	// Handle room number inline editing
	if (target.matches("[data-room-edit]")) {
		const periodIndex = Number(target.dataset.periodIndex);
		const blockKey = target.dataset.blockKey;
		const period = schedule.periods[periodIndex];
		if (!period) return;
		
		const block = period[blockKey];
		block.room = target.value;
		saveSchedule(schedule);
		updateSaveStatus();
	}
}

function handleAdminChange(event) {
	const target = event.target;
	const schedule = state.schedule;

	if (target.matches("[data-block-field='length']")) {
		const periodIndex = Number(target.dataset.periodIndex);
		const blockKey = target.dataset.blockKey;
		schedule.periods[periodIndex][blockKey].length = Number(target.value);
		saveSchedule(schedule);
		updateSaveStatus();
	}

	if (target.matches("[data-event-field='period']")) {
		const eventIndex = Number(target.dataset.eventIndex);
		schedule.events[eventIndex].period = target.value === "all" ? "all" : Number(target.value);
		saveSchedule(schedule);
		updateSaveStatus();
	}
}

function handleAdminClick(event) {
	const target = event.target;
	
	if (target.matches("#resetButton")) {
		resetSampleSchedule();
		return;
	}
	if (target.matches("#exportButton")) {
		exportSchedule();
		return;
	}
	if (target.matches("#addEventButton")) {
		addEventRow();
		return;
	}
	if (target.matches("[data-action='delete-event']")) {
		deleteEventRow(Number(target.dataset.eventIndex));
		return;
	}
	if (target.matches("[data-action='toggle-description']")) {
		const eventIndex = Number(target.dataset.eventIndex);
		const descField = document.querySelector(`[data-event-field="description"][data-event-index="${eventIndex}"]`);
		if (descField) {
			descField.parentElement.classList.toggle('hidden');
			target.textContent = descField.parentElement.classList.contains('hidden') ? 'Add description' : 'Hide description';
		}
	}
	if (target.matches("[data-action='edit-room']")) {
		toggleRoomEdit(target, event);
		return;
	}
	if (target.matches("[data-action='make-double']")) {
		makeDoublePeriod(target);
		return;
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
	const tableHtml = `
		<table class="schedule-table public-table">
			<thead>
				<tr>
					<th class="period-col">Period</th>
					<th class="block-col">Block X</th>
					<th class="block-col">Block Y</th>
				</tr>
			</thead>
			<tbody>
				${schedule.periods.map((period, idx) => {
					const xDouble = Number(period.x.length) === 2;
					const yDouble = Number(period.y.length) === 2;
					
					// Skip if this period is part of a double (but not the first)
					if (idx > 0 && (Number(schedule.periods[idx - 1].x.length) === 2 || Number(schedule.periods[idx - 1].y.length) === 2)) {
						return '';
					}
					
					return `
						<tr class="period-row ${xDouble || yDouble ? 'has-double' : ''}">
							<td class="period-col">
								<span class="period-label">Period ${period.period}</span>
								${xDouble || yDouble ? '<span class="double-indicator">(double)</span>' : ''}
							</td>
							<td class="block-col block-x" ${xDouble ? 'rowspan="2"' : ''}>
								<div class="table-block">
									<div class="course-name">${escapeHtml(period.x.course)}</div>
									<div class="teacher-name">${escapeHtml(period.x.teacher)}</div>
									<div class="room-number">Room ${escapeHtml(period.x.room)}</div>
								</div>
							</td>
							<td class="block-col block-y" ${yDouble ? 'rowspan="2"' : ''}>
								<div class="table-block">
									<div class="course-name">${escapeHtml(period.y.course)}</div>
									<div class="teacher-name">${escapeHtml(period.y.teacher)}</div>
									<div class="room-number">Room ${escapeHtml(period.y.room)}</div>
								</div>
							</td>
						</tr>
					`;
				}).filter(row => row).join('')}
			</tbody>
		</table>
	`;
	return tableHtml;
}

function renderAdminScheduleTable(schedule) {
	const tableHtml = `
		<table class="schedule-table admin-table">
			<thead>
				<tr>
					<th class="period-col">Period</th>
					<th class="block-col">Block X</th>
					<th class="block-col">Block Y</th>
				</tr>
			</thead>
			<tbody>
				${schedule.periods.map((period, idx) => {
					const xDouble = Number(period.x.length) === 2;
					const yDouble = Number(period.y.length) === 2;
					
					// Skip if this period is part of a double (but not the first)
					if (idx > 0 && (Number(schedule.periods[idx - 1].x.length) === 2 || Number(schedule.periods[idx - 1].y.length) === 2)) {
						return '';
					}
					
					return `
						<tr class="period-row ${xDouble || yDouble ? 'has-double' : ''}" data-period="${period.period}">
							<td class="period-col">
								<span class="period-label">Period ${period.period}</span>
								${xDouble || yDouble ? '<span class="double-indicator">(double)</span>' : ''}
							</td>
							<td class="block-col block-x" ${xDouble ? 'rowspan="2"' : ''} data-period="${period.period}" data-block="x" data-period-index="${idx}">
								${renderAdminBlockCell(period, 'x', idx, schedule)}
							</td>
							<td class="block-col block-y" ${yDouble ? 'rowspan="2"' : ''} data-period="${period.period}" data-block="y" data-period-index="${idx}">
								${renderAdminBlockCell(period, 'y', idx, schedule)}
							</td>
						</tr>
					`;
				}).filter(row => row).join('')}
			</tbody>
		</table>
	`;
	return tableHtml;
}

function renderAdminBlockCell(period, blockKey, periodIndex, schedule) {
	const block = period[blockKey];
	const courseOptions = COURSES.map((course) => `<option value="${course}" ${course === block.course ? 'selected' : ''}>${course}</option>`).join('');
	
	return `
		<div class="admin-block-cell" draggable="false" data-period-index="${periodIndex}" data-block-key="${blockKey}">
			<div class="cell-display">
				<div class="course-name">${escapeHtml(block.course)}</div>
				<div class="teacher-name">${escapeHtml(block.teacher)}</div>
				<div class="room-number" title="Click to edit">
					<span class="room-value">Room ${escapeHtml(block.room)}</span>
					<input type="text" class="room-input hidden" data-room-edit value="${escapeAttribute(block.room)}" data-period-index="${periodIndex}" data-block-key="${blockKey}">
				</div>
				${Number(block.length) === 2 ? '<span class="double-badge">(double)</span>' : ''}
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

	// Setup dragging from class cards
	const classCards = adminClassCards.querySelectorAll('.draggable-card');
	classCards.forEach((card) => {
		card.addEventListener('dragstart', handleClassCardDragStart);
		card.addEventListener('dragend', handleClassCardDragEnd);
	});

	// Setup drop zones on table cells
	const tableCells = adminSchedule.querySelectorAll('.block-col');
	tableCells.forEach((cell) => {
		cell.addEventListener('dragover', handleDragOver);
		cell.addEventListener('drop', handleDropFromClassCard);
		cell.addEventListener('dragleave', handleDragLeave);
	});
	
	// Setup room number click handlers
	const roomNumbers = adminSchedule.querySelectorAll('.room-number');
	roomNumbers.forEach((room) => {
		room.addEventListener('click', toggleRoomEditMode);
	});
}

function handleClassCardDragStart(event) {
	const card = event.currentTarget;
	const course = card.dataset.course;
	
	event.dataTransfer.effectAllowed = 'copy';
	event.dataTransfer.setData('application/json', JSON.stringify({
		type: 'classCard',
		course,
	}));
	
	card.classList.add('dragging');
}

function handleClassCardDragEnd(event) {
	event.currentTarget.classList.remove('dragging');
	document.querySelectorAll('.block-col').forEach((col) => {
		col.classList.remove('drag-over');
	});
}

function handleDragOver(event) {
	event.preventDefault();
	event.dataTransfer.dropEffect = 'copy';
	event.currentTarget.classList.add('drag-over');
}

function handleDragLeave(event) {
	if (event.currentTarget === event.target) {
		event.currentTarget.classList.remove('drag-over');
	}
}

function handleDropFromClassCard(event) {
	event.preventDefault();
	event.currentTarget.classList.remove('drag-over');
	
	try {
		const data = JSON.parse(event.dataTransfer.getData('application/json'));
		if (data.type !== 'classCard') return;
		
		const course = data.course;
		const targetCell = event.currentTarget;
		const periodIndex = Number(targetCell.dataset.periodIndex);
		const blockKey = targetCell.dataset.block;
		
		if (isNaN(periodIndex) || !blockKey) return;
		
		const schedule = state.schedule;
		const period = schedule.periods[periodIndex];
		
		if (!period) return;
		
		// Assign the course to the cell
		const block = period[blockKey];
		block.course = course;
		applyCourseDefaults(block, course);
		
		saveSchedule(schedule);
		renderAdminPage();
	} catch (err) {
		console.error('Drop error:', err);
	}
}

function toggleRoomEditMode(event) {
	const roomNumberDiv = event.currentTarget;
	const roomValue = roomNumberDiv.querySelector('.room-value');
	const roomInput = roomNumberDiv.querySelector('.room-input');
	
	if (roomValue.classList.contains('hidden')) {
		// Currently in edit mode, save and exit
		const periodIndex = Number(roomInput.dataset.periodIndex);
		const blockKey = roomInput.dataset.blockKey;
		const newRoom = roomInput.value.trim();
		
		if (newRoom && !isNaN(periodIndex) && blockKey) {
			const period = state.schedule.periods[periodIndex];
			if (period) {
				period[blockKey].room = newRoom;
				saveSchedule(state.schedule);
				updateSaveStatus();
			}
		}
		
		roomValue.classList.remove('hidden');
		roomInput.classList.add('hidden');
	} else {
		// Switch to edit mode
		const periodIndex = Number(roomInput.dataset.periodIndex);
		const blockKey = roomInput.dataset.blockKey;
		const period = state.schedule.periods[periodIndex];
		
		if (period) {
			roomInput.value = period[blockKey].room;
			roomValue.classList.add('hidden');
			roomInput.classList.remove('hidden');
			roomInput.focus();
			roomInput.select();
		}
	}
}

function makeDoublePeriod(button) {
	const periodIndex = Number(button.dataset.periodIndex);
	const blockKey = button.dataset.blockKey;
	
	if (isNaN(periodIndex) || !blockKey || periodIndex >= state.schedule.periods.length - 1) return;
	
	const schedule = state.schedule;
	schedule.periods[periodIndex][blockKey].length = 2;
	
	saveSchedule(schedule);
	renderAdminPage();
}

function renderEventsEditor(schedule) {
	if (!schedule.events.length) {
		return '<p class="muted-copy">No special events yet.</p>';
	}

	return schedule.events.map((item, index) => {
		const periodOptions = ['all', ...PERIOD_OPTIONS].map((option) => {
			const value = option === 'all' ? 'all' : String(option);
			const label = option === 'all' ? 'All day' : `Period ${option}`;
			const selected = item.period === 'all' ? value === 'all' : Number(item.period) === option;
			return `<option value="${value}" ${selected ? 'selected' : ''}>${label}</option>`;
		}).join('');
		const hasDescription = item.description && item.description.trim().length > 0;
		const descriptionHidden = !hasDescription;

		return `
			<div class="event-row">
				<label class="field">
					<span>When</span>
					<select data-event-field="period" data-event-index="${index}">${periodOptions}</select>
				</label>
				<label class="field">
					<span>Title</span>
					<input data-event-field="title" data-event-index="${index}" type="text" value="${escapeAttribute(item.title)}">
				</label>
				<label class="field">
					<span>Note</span>
					<input data-event-field="note" data-event-index="${index}" type="text" value="${escapeAttribute(item.note || '')}">
				</label>
				<div class="event-actions">
					<button class="ghost-btn small-btn" data-action="toggle-description" data-event-index="${index}" type="button">${descriptionHidden ? 'Add description' : 'Hide description'}</button>
					<button class="ghost-btn small-btn" data-action="delete-event" data-event-index="${index}" type="button">Remove</button>
				</div>
				<label class="field full-span ${descriptionHidden ? 'hidden' : ''}">
					<span>Description (optional)</span>
					<textarea data-event-field="description" data-event-index="${index}" rows="2" placeholder="Add more details about this event...">${escapeAttribute(item.description || '')}</textarea>
				</label>
			</div>
		`;
	}).join('');
}

function renderEventFeed(schedule) {
	if (!schedule.events.length) {
		return '<p class="muted-copy">No special events.</p>';
	}

	return schedule.events.map((item) => {
		const when = item.period === 'all' ? 'All day' : `Period ${item.period}`;
		return `
			<article class="event-card">
				<div class="inline-line">
					<span class="event-chip"><small>${escapeHtml(when)}</small></span>
					<span class="tag">Special event</span>
				</div>
				<div class="event-title">${escapeHtml(item.title)}</div>
				${item.note ? `<div class="event-note">${escapeHtml(item.note)}</div>` : ''}
				${item.description ? `<div class="event-description">${escapeHtml(item.description)}</div>` : ''}
			</article>
		`;
	}).join('');
}

function loadSchedule() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			const fresh = clone(DEFAULT_SCHEDULE);
			saveSchedule(fresh);
			return fresh;
		}

		const parsed = JSON.parse(raw);
		const normalized = ensureScheduleShape(parsed);
		saveSchedule(normalized);
		return normalized;
	} catch (err) {
		console.error('Error loading schedule:', err);
		const fresh = clone(DEFAULT_SCHEDULE);
		saveSchedule(fresh);
		return fresh;
	}
}

function ensureScheduleShape(schedule) {
	if (!schedule || !Array.isArray(schedule.periods) || schedule.periods.length !== 4) {
		return clone(DEFAULT_SCHEDULE);
	}

	const normalized = {
		periods: schedule.periods.map((period, idx) => ({
			period: PERIODS[idx] || (idx + 1),
			x: normalizeBlock(period.x, DEFAULT_SCHEDULE.periods[idx].x),
			y: normalizeBlock(period.y, DEFAULT_SCHEDULE.periods[idx].y),
		})),
		events: Array.isArray(schedule.events) ? schedule.events.map((item) => ({
			period: item.period === 'all' ? 'all' : Number(item.period) || 'all',
			title: item.title || '',
			note: item.note || '',
			description: item.description || '',
		})) : clone(DEFAULT_SCHEDULE.events),
	};
	
	return normalized;
}

function normalizeBlock(block, fallback) {
	if (!block || typeof block !== 'object') {
		return clone(fallback);
	}
	
	const course = COURSES.includes(block.course) ? block.course : (fallback?.course || 'Bio');
	const courseDefaults = COURSE_LIBRARY[course] || COURSE_LIBRARY.Bio;
	return {
		course,
		teacher: block.teacher || courseDefaults.teacher,
		room: block.room || courseDefaults.room,
		length: Number(block.length) === 2 ? 2 : 1,
		note: block.note || '',
	};
}

function saveSchedule(schedule) {
	const normalized = ensureScheduleShape(schedule);
	state.schedule = normalized;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

function setupSettingsMenu() {
	const settingsBtn = document.getElementById('settingsButton');
	const settingsMenu = document.getElementById('settingsMenu');
	const darkModeToggle = document.getElementById('darkModeToggle');
	const lightModeToggle = document.getElementById('lightModeToggle');

	if (!settingsBtn) return;

	settingsBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		if (settingsMenu) {
			settingsMenu.classList.toggle('hidden');
		}
	});

	if (darkModeToggle) {
		darkModeToggle.addEventListener('click', () => {
			setDarkMode(true);
			if (settingsMenu) settingsMenu.classList.add('hidden');
		});
	}

	if (lightModeToggle) {
		lightModeToggle.addEventListener('click', () => {
			setDarkMode(false);
			if (settingsMenu) settingsMenu.classList.add('hidden');
		});
	}

	document.addEventListener('click', (e) => {
		if (settingsMenu && !settingsMenu.contains(e.target) && e.target !== settingsBtn) {
			settingsMenu.classList.add('hidden');
		}
	});
}

function setDarkMode(isDark) {
	state.darkMode = isDark;
	localStorage.setItem('smcs-schedule-dark-mode', isDark ? 'true' : 'false');
	
	if (isDark) {
		document.documentElement.style.colorScheme = 'dark';
		document.body.classList.remove('light-mode');
		document.body.classList.add('dark-mode');
	} else {
		document.documentElement.style.colorScheme = 'light';
		document.body.classList.remove('dark-mode');
		document.body.classList.add('light-mode');
	}
}

function loadDarkModePreference() {
	const saved = localStorage.getItem('smcs-schedule-dark-mode');
	const isDark = saved === null ? true : saved === 'true';
	setDarkMode(isDark);
}

function periodHasDouble(period) {
	return Number(period.x.length) === 2 || Number(period.y.length) === 2;
}

function applyCourseDefaults(block, course) {
	const defaults = COURSE_LIBRARY[course] || COURSE_LIBRARY.Bio;
	block.teacher = defaults.teacher;
	block.room = defaults.room;
}

function updateSaveStatus(message = 'Saved to this browser') {
	const status = document.getElementById('saveStatus');
	if (status) {
		status.textContent = message;
	}
}

function isAuthenticated() {
	return localStorage.getItem(AUTH_KEY) === 'ok';
}

function resetSampleSchedule() {
	if (!window.confirm('Reset the schedule to the default?')) {
		return;
	}
	const fresh = clone(DEFAULT_SCHEDULE);
	saveSchedule(fresh);
	renderAdminPage();
}

function exportSchedule() {
	const blob = new Blob([JSON.stringify(state.schedule, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = 'smcs-schedule.json';
	link.click();
	URL.revokeObjectURL(url);
	updateSaveStatus('Exported schedule JSON');
}

function addEventRow() {
	const schedule = state.schedule;
	schedule.events.push({ period: 'all', title: '', note: '', description: '' });
	saveSchedule(schedule);
	renderAdminPage();
}

function deleteEventRow(index) {
	const schedule = state.schedule;
	schedule.events.splice(index, 1);
	saveSchedule(schedule);
	renderAdminPage();
}

function clone(value) {
	return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
	return escapeHtml(value).replaceAll('`', '&#96;');
}
