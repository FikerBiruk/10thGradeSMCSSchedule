const DAYS = ["MON", "TUE", "WED", "THU", "FRI"];
const DAY_LABELS = {
	MON: "Mon",
	TUE: "Tue",
	WED: "Wed",
	THU: "Thu",
	FRI: "Fri",
};
const PERIODS = [1, 2, 3, 4];
const TOKEN_KEY = "smcsPagesToken";
const BLOCKS_KEY = "smcsPagesBlocks";
const ADMIN_USERNAME = "charles";
const ADMIN_PASSWORD = "SMCS";

const DEFAULT_BLOCKS = [
	{id: "seed-1", day: "MON", periodStart: 1, length: 1, course: "Bio", group: "X", room: "101"},
	{id: "seed-2", day: "TUE", periodStart: 2, length: 2, course: "CS", group: "Y", room: "203"},
	{id: "seed-3", day: "WED", periodStart: 3, length: 1, course: "ESS", group: "X", room: "104"},
];

const state = {
	blocks: [],
	draggedId: null,
	mobileDay: "MON",
};

document.addEventListener("DOMContentLoaded", () => {
	const loginForm = document.getElementById("loginForm");
	if (loginForm) {
		setupLoginPage();
		return;
	}

	const grid = document.getElementById("scheduleGrid");
	if (grid) {
		setupAdminPage();
	}
});

function setupLoginPage() {
	const form = document.getElementById("loginForm");
	const errorBox = document.getElementById("loginError");

	form.addEventListener("submit", (event) => {
		event.preventDefault();
		hideError(errorBox);

		const username = document.getElementById("username").value.trim();
		const password = document.getElementById("password").value;

		if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
			showError(errorBox, "Invalid username or password.");
			return;
		}

		localStorage.setItem(TOKEN_KEY, createSessionToken());
		ensureScheduleData();
		window.location.href = getAdminPath();
	});
}

function setupAdminPage() {
	if (!getToken()) {
		window.location.href = getLoginPath();
		return;
	}

	ensureScheduleData();
	wireModal();
	wireLogout();
	wireMobileSelector();
	wireAddBlockForm();
	loadSchedule();
}

function wireModal() {
	const modal = document.getElementById("blockModal");
	const addButton = document.getElementById("addBlockButton");
	const closeButton = document.getElementById("closeModalButton");

	addButton.addEventListener("click", () => openModal());
	closeButton.addEventListener("click", () => closeModal());
	modal.addEventListener("click", (event) => {
		if (event.target === modal) {
			closeModal();
		}
	});
}

function wireLogout() {
	const logoutButton = document.getElementById("logoutButton");
	if (!logoutButton) {
		return;
	}

	logoutButton.addEventListener("click", () => {
		localStorage.removeItem(TOKEN_KEY);
		window.location.href = getLoginPath();
	});
}

function wireMobileSelector() {
	const selector = document.getElementById("mobileDaySelect");
	if (!selector) {
		return;
	}

	selector.innerHTML = DAYS.map((day) => `<option value="${day}">${DAY_LABELS[day]}</option>`).join("");
	selector.value = state.mobileDay;
	selector.addEventListener("change", () => {
		state.mobileDay = selector.value;
		renderMobileSchedule();
	});
}

function wireAddBlockForm() {
	const form = document.getElementById("blockForm");
	form.addEventListener("submit", (event) => {
		event.preventDefault();
		const formData = new FormData(form);
		const payload = {
			day: formData.get("day"),
			periodStart: Number(formData.get("periodStart")),
			length: Number(formData.get("length")),
			course: formData.get("course"),
			group: formData.get("group"),
			room: formData.get("room").trim(),
		};

		const blocks = readBlocks();
		blocks.push({
			id: createId(),
			...payload,
		});
		saveBlocks(blocks);
		closeModal();
		form.reset();
		loadSchedule();
	});
}

function loadSchedule() {
	state.blocks = readBlocks();
	renderDesktopSchedule();
	renderMobileSchedule();
}

function renderDesktopSchedule() {
	const grid = document.getElementById("scheduleGrid");
	grid.innerHTML = "";

	DAYS.forEach((day) => {
		const column = document.createElement("div");
		column.className = "grid-column";
		column.innerHTML = `<div class="grid-head">${DAY_LABELS[day]}</div>`;

		PERIODS.forEach((period) => {
			const cell = document.createElement("div");
			cell.className = "grid-cell";
			cell.dataset.day = day;
			cell.dataset.period = String(period);
			cell.addEventListener("dragover", allowDrop);
			cell.addEventListener("drop", handleDrop);

			const label = document.createElement("div");
			label.className = "cell-label";
			label.textContent = `Period ${period}`;
			cell.appendChild(label);

			getBlocksForCell(day, period).forEach((block) => {
				cell.appendChild(createBlockCard(block));
			});

			column.appendChild(cell);
		});

		grid.appendChild(column);
	});
}

function renderMobileSchedule() {
	const container = document.getElementById("mobileSchedule");
	container.innerHTML = "";

	const panel = document.createElement("div");
	panel.className = "day-panel";
	panel.innerHTML = `<h2>${DAY_LABELS[state.mobileDay]}</h2>`;

	PERIODS.forEach((period) => {
		const periodCell = document.createElement("div");
		periodCell.className = "mobile-period";
		periodCell.dataset.day = state.mobileDay;
		periodCell.dataset.period = String(period);
		periodCell.addEventListener("dragover", allowDrop);
		periodCell.addEventListener("drop", handleDrop);

		const label = document.createElement("div");
		label.className = "cell-label";
		label.textContent = `Period ${period}`;
		periodCell.appendChild(label);

		getBlocksForCell(state.mobileDay, period).forEach((block) => {
			periodCell.appendChild(createBlockCard(block));
		});

		panel.appendChild(periodCell);
	});

	container.appendChild(panel);
}

function createBlockCard(block) {
	const card = document.createElement("article");
	card.className = "block-card";
	card.draggable = true;
	card.dataset.id = block.id;
	card.addEventListener("dragstart", handleDragStart);
	card.addEventListener("dragend", handleDragEnd);

	card.innerHTML = `
		<div class="block-top">
			<div>
				<div class="block-title">${escapeHtml(block.course)} ${escapeHtml(block.group)}</div>
				<div class="block-meta">Room ${escapeHtml(block.room)}</div>
			</div>
			<button class="block-delete" type="button" aria-label="Delete block">×</button>
		</div>
		<div class="block-meta">${block.day} · Period ${block.periodStart} · Length ${block.length}</div>
	`;

	card.querySelector(".block-delete").addEventListener("click", (event) => {
		event.stopPropagation();
		deleteBlock(block.id);
	});

	return card;
}

function handleDragStart(event) {
	state.draggedId = event.currentTarget.dataset.id;
	event.dataTransfer.setData("text/plain", state.draggedId);
}

function handleDragEnd() {
	state.draggedId = null;
	document.querySelectorAll(".drag-over").forEach((element) => element.classList.remove("drag-over"));
}

function allowDrop(event) {
	event.preventDefault();
	event.currentTarget.classList.add("drag-over");
}

function handleDrop(event) {
	event.preventDefault();
	event.currentTarget.classList.remove("drag-over");

	const blockId = event.dataTransfer.getData("text/plain") || state.draggedId;
	const targetDay = event.currentTarget.dataset.day;
	const targetPeriod = Number(event.currentTarget.dataset.period);
	const blocks = readBlocks();
	const index = blocks.findIndex((item) => item.id === blockId);
	if (index < 0) {
		return;
	}

	blocks[index] = {
		...blocks[index],
		day: targetDay,
		periodStart: targetPeriod,
	};

	saveBlocks(blocks);
	loadSchedule();
}

function deleteBlock(blockId) {
	const blocks = readBlocks().filter((block) => block.id !== blockId);
	saveBlocks(blocks);
	loadSchedule();
}

function getBlocksForCell(day, period) {
	return state.blocks
		.filter((block) => block.day === day && block.periodStart === period)
		.sort((left, right) => left.course.localeCompare(right.course));
}

function getToken() {
	return localStorage.getItem(TOKEN_KEY);
}

function getLoginPath() {
	return window.location.pathname.includes("/admin/") ? "../" : "login.html";
}

function getAdminPath() {
	return window.location.pathname.includes("login.html") ? "admin.html" : "admin/";
}

function ensureScheduleData() {
	if (!localStorage.getItem(BLOCKS_KEY)) {
		saveBlocks(DEFAULT_BLOCKS);
	}
}

function readBlocks() {
	const raw = localStorage.getItem(BLOCKS_KEY);
	if (!raw) {
		return DEFAULT_BLOCKS.slice();
	}

	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : DEFAULT_BLOCKS.slice();
	} catch {
		return DEFAULT_BLOCKS.slice();
	}
}

function saveBlocks(blocks) {
	localStorage.setItem(BLOCKS_KEY, JSON.stringify(blocks));
	state.blocks = blocks;
}

function createSessionToken() {
	return `pages-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createId() {
	return `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openModal() {
	const modal = document.getElementById("blockModal");
	modal.classList.remove("hidden");
	modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
	const modal = document.getElementById("blockModal");
	modal.classList.add("hidden");
	modal.setAttribute("aria-hidden", "true");
}

function hideError(element) {
	if (!element) {
		return;
	}
	element.hidden = true;
	element.textContent = "";
}

function showError(element, message) {
	if (!element) {
		return;
	}
	element.hidden = false;
	element.textContent = message;
}

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}
