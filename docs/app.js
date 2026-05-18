const STORAGE_KEY = "smcs-schedule-data-v2";
const AUTH_KEY = "smcs-schedule-admin-auth";
const ADMIN_USERNAME = "charles";
const ADMIN_PASSWORD = "SMCS";
const COURSES = ["Bio", "CS", "ESS", "FOT"];
const PERIODS = [1, 2, 3, 4];
const WEEK_OPTIONS = ["all", ...PERIODS];

const COURSE_LIBRARY = {
	Bio: { teacher: "Ms. Perez", room: "214" },
	CS: { teacher: "Mr. Vega", room: "118" },
	ESS: { teacher: "Ms. Hart", room: "305" },
	FOT: { teacher: "Mr. Singh", room: "402" },
};

const DEFAULT_SCHEDULE = {
	activeWeekId: "week-1",
	weeks: [
		createWeek("week-1", "Week 1", "Launch Week", "Welcome assembly Tuesday. Double Bio lab on Thursday.", [
			{ period: "all", title: "Welcome Assembly", note: "Gym after Period 2" },
			{ period: 3, title: "Advisory Check-In", note: "Shortened transition between blocks" },
		], [
			createPeriod(1, createBlock("Bio", { room: "214", note: "Lab prep" }), createBlock("CS", { room: "118", note: "Design intro" })),
			createPeriod(2, createBlock("CS", { room: "121", note: "Coding workshop" }), createBlock("Bio", { room: "216", note: "Theory review" })),
			createPeriod(3, createBlock("ESS", { room: "310", length: 2, note: "Field study" }), createBlock("FOT", { room: "405", length: 2, note: "Workshop block" })),
			createPeriod(4, createBlock("FOT", { room: "404", note: "Build sprint" }), createBlock("ESS", { room: "309", note: "Map work" })),
		]),
		createWeek("week-2", "Week 2", "Rotation Week", "Some rooms swap for lab access and community projects.", [
			{ period: 2, title: "Club Fair", note: "Commons at lunch" },
		], [
			createPeriod(1, createBlock("CS", { room: "120", note: "Programming lab" }), createBlock("Bio", { room: "214", note: "Lesson review" })),
			createPeriod(2, createBlock("ESS", { room: "308", note: "Slides and notes" }), createBlock("FOT", { room: "407", length: 2, note: "Double project block" })),
			createPeriod(3, createBlock("FOT", { room: "404", note: "Prototype build" }), createBlock("ESS", { room: "312", note: "Research work" })),
			createPeriod(4, createBlock("Bio", { room: "217", note: "Lab rotation" }), createBlock("CS", { room: "118", note: "Debugging session" })),
		]),
		createWeek("week-3", "Week 3", "Mid-cycle", "Block X and Y switch emphasis with a couple of longer periods.", [
			{ period: "all", title: "Pep Rally", note: "End of week, modified schedule" },
		], [
			createPeriod(1, createBlock("ESS", { room: "305", note: "Maps and climate" }), createBlock("FOT", { room: "402", note: "Design review" })),
			createPeriod(2, createBlock("FOT", { room: "403", length: 2, note: "Double fabrication block" }), createBlock("ESS", { room: "311", note: "Lab notes" })),
			createPeriod(3, createBlock("Bio", { room: "214", note: "Case study" }), createBlock("CS", { room: "118", note: "Algorithm practice" })),
			createPeriod(4, createBlock("CS", { room: "122", note: "Portfolio review" }), createBlock("Bio", { room: "215", note: "Lab cleanup" })),
		]),
		createWeek("week-4", "Week 4", "Wrap-up", "Final presentations and room changes for testing.", [
			{ period: 4, title: "Community Showcase", note: "Families invited after school" },
		], [
			createPeriod(1, createBlock("FOT", { room: "405", note: "Build showcase" }), createBlock("ESS", { room: "310", note: "Review session" })),
			createPeriod(2, createBlock("Bio", { room: "216", note: "Final lab" }), createBlock("CS", { room: "119", note: "Live coding" })),
			createPeriod(3, createBlock("CS", { room: "121", length: 2, note: "Double capstone block" }), createBlock("Bio", { room: "214", note: "Study hall" })),
			createPeriod(4, createBlock("ESS", { room: "307", note: "Presentations" }), createBlock("FOT", { room: "404", note: "Cleanup and storage" })),
		]),
	],
};

const state = {
	schedule: null,
	publicWeekId: null,
	adminWeekId: null,
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
	state.publicWeekId = state.schedule.activeWeekId;
	renderPublicPage();
	const weekSelect = document.getElementById("publicWeekSelect");
	weekSelect.addEventListener("change", () => {
		state.publicWeekId = weekSelect.value;
		renderPublicPage();
	});
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
		state.adminWeekId = state.schedule.activeWeekId;
		renderAdminPage();
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
	const week = getActiveAdminWeek();
	if (!week) {
		return;
	}

	if (target.matches("[data-week-field]")) {
		week[target.dataset.weekField] = target.value;
		saveSchedule(schedule);
		updateSaveStatus();
		return;
	}

	if (target.matches("[data-event-field]")) {
		const eventIndex = Number(target.dataset.eventIndex);
		const eventField = target.dataset.eventField;
		if (!week.events[eventIndex]) {
			return;
		}
		week.events[eventIndex][eventField] = target.value;
		saveSchedule(schedule);
		updateSaveStatus();
	}

	if (target.matches("[data-block-field]")) {
		const periodIndex = Number(target.dataset.periodIndex);
		const blockKey = target.dataset.blockKey;
		const field = target.dataset.blockField;
		const period = week.periods[periodIndex];
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
}

function handleAdminChange(event) {
	const target = event.target;
	const schedule = state.schedule;
	const week = getActiveAdminWeek();
	if (!week) {
		return;
	}

	if (target.matches("#adminWeekSelect")) {
		state.adminWeekId = target.value;
		schedule.activeWeekId = target.value;
		saveSchedule(schedule);
		renderAdminPage();
		return;
	}

	if (target.matches("[data-block-field='length']")) {
		const periodIndex = Number(target.dataset.periodIndex);
		const blockKey = target.dataset.blockKey;
		week.periods[periodIndex][blockKey].length = Number(target.value);
		saveSchedule(schedule);
		updateSaveStatus();
	}

	if (target.matches("[data-event-field='period']")) {
		const eventIndex = Number(target.dataset.eventIndex);
		week.events[eventIndex].period = target.value === "all" ? "all" : Number(target.value);
		saveSchedule(schedule);
		updateSaveStatus();
	}
}

function handleAdminClick(event) {
	const target = event.target;
	if (target.matches("#newWeekButton")) {
		createNewWeek();
		return;
	}
	if (target.matches("#duplicateWeekButton")) {
		duplicateWeek();
		return;
	}
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
	}
}

function renderPublicPage() {
	const weeks = state.schedule.weeks;
	const selectedWeekId = state.publicWeekId || state.schedule.activeWeekId;
	const week = getWeekById(selectedWeekId) || weeks[0];
	state.publicWeekId = week.id;
	populateWeekSelect("publicWeekSelect", weeks, week.id);

	document.getElementById("publicSummary").innerHTML = buildSummaryChips(week, false);
	document.getElementById("publicOrder").innerHTML = buildOrderChips(week);
	document.getElementById("publicSchedule").innerHTML = renderPeriodBoard(week, false);
	document.getElementById("publicEvents").innerHTML = renderEventFeed(week);
}

function renderAdminPage() {
	const weeks = state.schedule.weeks;
	const week = getActiveAdminWeek() || weeks[0];
	state.adminWeekId = week.id;
	populateWeekSelect("adminWeekSelect", weeks, week.id);
	document.getElementById("adminWeekHeading").textContent = week.name;
	document.getElementById("weekBadge").innerHTML = `<strong>${week.focus}</strong><small>${week.id}</small>`;
	document.getElementById("weekNameInput").value = week.name;
	document.getElementById("weekFocusInput").value = week.focus;
	document.getElementById("weekNotesInput").value = week.notes;
	document.getElementById("adminOrder").innerHTML = buildOrderChips(week);
	document.getElementById("adminPeriods").innerHTML = renderPeriodBoard(week, true);
	document.getElementById("eventsEditor").innerHTML = renderEventsEditor(week);
	updateSaveStatus();
}

function renderPeriodBoard(week, editable) {
	return week.periods.map((period) => {
		return `
			<section class="period-card">
				<div class="period-card-header">
					<div>
						<h3>Period ${period.period}</h3>
						<p>${editable ? "Edit the class mapping for both blocks." : "Block X and Block Y for this period."}</p>
					</div>
					${periodHasDouble(period) ? '<span class="double-pill">Double period present</span>' : ''}
				</div>
				<div class="block-columns">
					${renderBlockCard(period, 'x', editable)}
					${renderBlockCard(period, 'y', editable)}
				</div>
			</section>
		`;
	}).join('');
}

function renderBlockCard(period, blockKey, editable) {
	const block = period[blockKey];
	const courseOptions = COURSES.map((course) => `<option value="${course}" ${course === block.course ? 'selected' : ''}>${course}</option>`).join('');
	const lengthOptions = [1, 2].map((length) => `<option value="${length}" ${Number(block.length) === length ? 'selected' : ''}>${length === 1 ? '1 period' : '2 periods'}</option>`).join('');
	const defaultTeacher = COURSE_LIBRARY[block.course]?.teacher || 'TBA';
	const defaultRoom = COURSE_LIBRARY[block.course]?.room || 'TBA';
	const helper = `${block.room === defaultRoom ? 'Default room' : 'Room override'} ${block.room} · Default teacher ${defaultTeacher}`;

	if (!editable) {
		return `
			<article class="block-card ${blockKey}">
				<div class="block-head">
					<span class="block-pill ${blockKey}">Block ${blockKey.toUpperCase()}</span>
					${Number(block.length) === 2 ? '<span class="double-pill">Double</span>' : ''}
				</div>
				<div class="block-title">${escapeHtml(block.course)}</div>
				<div class="block-meta">
					<span>${escapeHtml(block.teacher)}</span>
					<span>Room ${escapeHtml(block.room)}</span>
				</div>
				${block.note ? `<div class="block-note">${escapeHtml(block.note)}</div>` : ''}
			</article>
		`;
	}

	return `
		<article class="block-card ${blockKey}">
			<div class="block-head">
				<span class="block-pill ${blockKey}">Block ${blockKey.toUpperCase()}</span>
				<span class="tag">Default: ${escapeHtml(defaultRoom)}</span>
			</div>
			<div class="block-form-grid">
				<label class="field">
					<span>Course</span>
					<select data-block-field="course" data-period-index="${period.period - 1}" data-block-key="${blockKey}">${courseOptions}</select>
				</label>
				<label class="field">
					<span>Teacher</span>
					<input data-block-field="teacher" data-period-index="${period.period - 1}" data-block-key="${blockKey}" type="text" value="${escapeAttribute(block.teacher)}">
				</label>
				<label class="field">
					<span>Room</span>
					<input data-block-field="room" data-period-index="${period.period - 1}" data-block-key="${blockKey}" type="text" value="${escapeAttribute(block.room)}">
				</label>
				<label class="field">
					<span>Length</span>
					<select data-block-field="length" data-period-index="${period.period - 1}" data-block-key="${blockKey}">${lengthOptions}</select>
				</label>
				<label class="field">
					<span>Note</span>
					<input data-block-field="note" data-period-index="${period.period - 1}" data-block-key="${blockKey}" type="text" value="${escapeAttribute(block.note || '')}" placeholder="Optional note">
				</label>
				<p class="helper-copy">${escapeHtml(helper)}</p>
			</div>
		</article>
	`;
}

function renderEventsEditor(week) {
	if (!week.events.length) {
		return '<p class="muted-copy">No special events yet.</p>';
	}

	return week.events.map((item, index) => {
		const periodOptions = WEEK_OPTIONS.map((option) => {
			const value = option === 'all' ? 'all' : String(option);
			const label = option === 'all' ? 'All day' : `Period ${option}`;
			const selected = item.period === 'all' ? value === 'all' : Number(item.period) === option;
			return `<option value="${value}" ${selected ? 'selected' : ''}>${label}</option>`;
		}).join('');

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
				<button class="ghost-btn" data-action="delete-event" data-event-index="${index}" type="button">Remove</button>
			</div>
		`;
	}).join('');
}

function buildSummaryChips(week, editable) {
	const doubleCount = week.periods.filter(periodHasDouble).length;
	const eventCount = week.events.length;
	return [
		`<span class="stat-chip"><small>Week</small><strong>${escapeHtml(week.name)}</strong></span>`,
		`<span class="stat-chip"><small>Focus</small><strong>${escapeHtml(week.focus)}</strong></span>`,
		`<span class="stat-chip"><small>Double periods</small><strong>${doubleCount}</strong></span>`,
		`<span class="stat-chip"><small>Events</small><strong>${eventCount}</strong></span>`,
		editable ? '<span class="stat-chip"><small>Mode</small><strong>Editor</strong></span>' : '<span class="stat-chip"><small>Mode</small><strong>Public</strong></span>',
	].join('');
}

function buildOrderChips(week) {
	const blockX = week.periods.map((period) => period.x.course).join(' · ');
	const blockY = week.periods.map((period) => period.y.course).join(' · ');
	return `
		<span class="order-chip"><small>Block X</small><strong>${escapeHtml(blockX)}</strong></span>
		<span class="order-chip"><small>Block Y</small><strong>${escapeHtml(blockY)}</strong></span>
	`;
}

function renderEventFeed(week) {
	if (!week.events.length) {
		return '<p class="muted-copy">No special events for this week.</p>';
	}

	return week.events.map((item) => {
		const when = item.period === 'all' ? 'All day' : `Period ${item.period}`;
		return `
			<article class="event-card">
				<div class="inline-line">
					<span class="event-chip"><small>${escapeHtml(when)}</small></span>
					<span class="tag">Special event</span>
				</div>
				<div class="event-title">${escapeHtml(item.title)}</div>
				${item.note ? `<div class="event-note">${escapeHtml(item.note)}</div>` : ''}
			</article>
		`;
	}).join('');
}

function populateWeekSelect(selectId, weeks, activeWeekId) {
	const select = document.getElementById(selectId);
	select.innerHTML = weeks.map((week) => `<option value="${week.id}" ${week.id === activeWeekId ? 'selected' : ''}>${escapeAttribute(week.name)}</option>`).join('');
}

function getWeekById(id) {
	return state.schedule.weeks.find((week) => week.id === id);
}

function getActiveAdminWeek() {
	return getWeekById(state.adminWeekId || state.schedule.activeWeekId);
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
	} catch {
		const fresh = clone(DEFAULT_SCHEDULE);
		saveSchedule(fresh);
		return fresh;
	}
}

function ensureScheduleShape(schedule) {
	if (!schedule || !Array.isArray(schedule.weeks) || !schedule.weeks.length) {
		return clone(DEFAULT_SCHEDULE);
	}

	const normalized = clone(schedule);
	normalized.activeWeekId = normalized.weeks.some((week) => week.id === normalized.activeWeekId) ? normalized.activeWeekId : normalized.weeks[0].id;
	normalized.weeks = normalized.weeks.map((week, weekIndex) => normalizeWeek(week, weekIndex));
	return normalized;
}

function normalizeWeek(week, weekIndex) {
	const fallback = DEFAULT_SCHEDULE.weeks[weekIndex % DEFAULT_SCHEDULE.weeks.length];
	return {
		id: week.id || fallback.id,
		name: week.name || fallback.name,
		focus: week.focus || fallback.focus,
		notes: week.notes || fallback.notes,
		events: Array.isArray(week.events) ? week.events.map((item) => ({
			period: item.period === 'all' ? 'all' : Number(item.period) || 'all',
			title: item.title || '',
			note: item.note || '',
		})) : clone(fallback.events),
		periods: Array.isArray(week.periods) && week.periods.length === 4 ? week.periods.map((period, periodIndex) => ({
			period: PERIODS[periodIndex],
			x: normalizeBlock(period.x, fallback.periods[periodIndex].x),
			y: normalizeBlock(period.y, fallback.periods[periodIndex].y),
		})) : clone(fallback.periods),
	};
}

function normalizeBlock(block, fallback) {
	const course = COURSES.includes(block?.course) ? block.course : fallback.course;
	const courseDefaults = COURSE_LIBRARY[course] || COURSE_LIBRARY.Bio;
	return {
		course,
		teacher: block?.teacher || courseDefaults.teacher,
		room: block?.room || courseDefaults.room,
		length: Number(block?.length) === 2 ? 2 : 1,
		note: block?.note || '',
	};
}

function saveSchedule(schedule) {
	const normalized = ensureScheduleShape(schedule);
	state.schedule = normalized;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
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

function createNewWeek() {
	const schedule = state.schedule;
	const nextNumber = schedule.weeks.length + 1;
	const weekId = `week-${nextNumber}`;
	const week = createBlankWeek(weekId, `Week ${nextNumber}`, `Custom Week ${nextNumber}`);
	schedule.weeks.push(week);
	schedule.activeWeekId = weekId;
	state.adminWeekId = weekId;
	saveSchedule(schedule);
	renderAdminPage();
}

function duplicateWeek() {
	const week = getActiveAdminWeek();
	if (!week) {
		return;
	}
	const schedule = state.schedule;
	const nextNumber = schedule.weeks.length + 1;
	const duplicate = clone(week);
	duplicate.id = `week-${nextNumber}`;
	duplicate.name = `${week.name} Copy`;
	schedule.weeks.push(duplicate);
	schedule.activeWeekId = duplicate.id;
	state.adminWeekId = duplicate.id;
	saveSchedule(schedule);
	renderAdminPage();
}

function resetSampleSchedule() {
	if (!window.confirm('Reset the schedule in this browser to the sample weeks?')) {
		return;
	}
	const fresh = clone(DEFAULT_SCHEDULE);
	saveSchedule(fresh);
	state.adminWeekId = fresh.activeWeekId;
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
	const week = getActiveAdminWeek();
	if (!week) {
		return;
	}
	week.events.push({ period: 'all', title: '', note: '' });
	saveSchedule(state.schedule);
	renderAdminPage();
}

function deleteEventRow(index) {
	const week = getActiveAdminWeek();
	if (!week) {
		return;
	}
	week.events.splice(index, 1);
	saveSchedule(state.schedule);
	renderAdminPage();
}

function createBlankWeek(id, name, focus) {
	return {
		id,
		name,
		focus,
		notes: 'Add weekly notes here.',
		events: [],
		periods: [
			createPeriod(1, createBlock('Bio'), createBlock('CS')),
			createPeriod(2, createBlock('CS'), createBlock('Bio')),
			createPeriod(3, createBlock('ESS'), createBlock('FOT')),
			createPeriod(4, createBlock('FOT'), createBlock('ESS')),
		],
	};
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
