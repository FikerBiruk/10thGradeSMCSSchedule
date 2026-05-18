const DAYS = ["MON", "TUE", "WED", "THU", "FRI"];
const DAY_LABELS = {
	MON: "Mon",
	TUE: "Tue",
	WED: "Wed",
	THU: "Thu",
	FRI: "Fri",
};
const PERIODS = [1, 2, 3, 4];
const TOKEN_KEY = "smcsSessionToken";

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

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		hideError(errorBox);

		const payload = {
			username: document.getElementById("username").value.trim(),
			password: document.getElementById("password").value,
		};

		try {
			const response = await fetch("/api/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				throw new Error("Invalid username or password.");
			}

			const data = await response.json();
			localStorage.setItem(TOKEN_KEY, data.token);
			window.location.href = "admin.html";
		} catch (error) {
			showError(errorBox, error.message);
		}
	});
}

async function setupAdminPage() {
	const token = getToken();
	if (!token) {
		window.location.href = "login.html";
		return;
	}

	wireModal();
	wireLogout();
	wireMobileSelector();
	wireAddBlockForm();

	try {
		await loadSchedule();
	} catch (error) {
		if (String(error.message).includes("401")) {
			authorizeFailure();
			return;
		}
		alert(error.message);
	}
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
		window.location.href = "login.html";
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
	form.addEventListener("submit", async (event) => {
		try {
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

			const response = await authorizedFetch("/api/blocks", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				throw new Error(`Unable to create block (${response.status}).`);
			}

			closeModal();
			form.reset();
			await loadSchedule();
		} catch (error) {
			alert(error.message);
			if (String(error.message).includes("401")) {
				authorizeFailure();
			}
		}
	});
}

async function loadSchedule() {
	const response = await authorizedFetch("/api/schedule");
	if (!response.ok) {
		throw new Error(`Failed to load schedule (${response.status}).`);
	}

	state.blocks = await response.json();
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

	card.querySelector(".block-delete").addEventListener("click", async (event) => {
		event.stopPropagation();
		await deleteBlock(block.id);
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

async function handleDrop(event) {
	try {
		event.preventDefault();
		event.currentTarget.classList.remove("drag-over");

		const blockId = event.dataTransfer.getData("text/plain") || state.draggedId;
		const targetDay = event.currentTarget.dataset.day;
		const targetPeriod = Number(event.currentTarget.dataset.period);
		const block = state.blocks.find((item) => item.id === blockId);
		if (!block) {
			return;
		}

		const updated = {
			...block,
			day: targetDay,
			periodStart: targetPeriod,
		};

		const response = await authorizedFetch(`/api/blocks/${block.id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(updated),
		});

		if (!response.ok) {
			throw new Error(`Failed to move block (${response.status}).`);
		}

		await loadSchedule();
	} catch (error) {
		alert(error.message);
		if (String(error.message).includes("401")) {
			authorizeFailure();
		}
	}
}

async function deleteBlock(blockId) {
	try {
		const response = await authorizedFetch(`/api/blocks/${blockId}`, { method: "DELETE" });
		if (!response.ok && response.status !== 204) {
			throw new Error(`Failed to delete block (${response.status}).`);
		}

		await loadSchedule();
	} catch (error) {
		alert(error.message);
		if (String(error.message).includes("401")) {
			authorizeFailure();
		}
	}
}

function getBlocksForCell(day, period) {
	return state.blocks
		.filter((block) => block.day === day && block.periodStart === period)
		.sort((left, right) => left.course.localeCompare(right.course));
}

function authorizedFetch(url, options = {}) {
	const token = getToken();
	const headers = new Headers(options.headers || {});
	headers.set("X-Session-Token", token);

	return fetch(url, {
		...options,
		headers,
	});
}

function getToken() {
	return localStorage.getItem(TOKEN_KEY);
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

function authorizeFailure() {
	localStorage.removeItem(TOKEN_KEY);
	window.location.href = "login.html";
}

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}
