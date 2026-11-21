const form = document.querySelector("#plan");
const fields = form.elements;
const button = form.querySelector("[type=submit]");
const swap = document.querySelector("#swap");
const result = document.querySelector("#result");
const canvas = document.querySelector("#map");
const ctx = canvas.getContext("2d");
const number = new Intl.NumberFormat("ru", { maximumFractionDigits: 2 });
let network;

function line(points, color, width) {
  ctx.beginPath();
  points.forEach((id, index) => {
    const [, x, y] = network.points[id];
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function draw(route = []) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  for (let x = 0; x < canvas.width; x += 32) {
    for (let y = 0; y < canvas.height; y += 32) ctx.rect(x, y, 2, 2);
  }
  ctx.fillStyle = "#29443b";
  ctx.fill();
  for (const [a, b, , , delay] of network.roads) {
    line([a, b], fields.traffic.checked && delay >= 3 ? "#bb6668" : "#526c75", 4);
  }
  if (route.length) line(route, "#77e3c4", 7);
  ctx.font = "bold 14px system-ui";
  for (const [id, [name, x, y]] of Object.entries(network.points)) {
    const station = network.stations[id];
    const eligible = station?.includes(fields.fuel.value);
    ctx.beginPath();
    const marker = id === fields.start.value ? "А" : id === fields.end.value ? "Б" : "";
    ctx.arc(x, y, marker ? 12 : 7, 0, Math.PI * 2);
    ctx.fillStyle = eligible ? "#ffcc6e" : station ? "#7b8c91" : "#dce9eb";
    ctx.fill();
    if (marker) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#132b26";
      ctx.fillText(marker, x, y + 5);
      ctx.fillStyle = "#dce9eb";
    }
    const label = station ? name.split(" · ")[0] : name;
    ctx.textAlign = x > 450 ? "right" : "left";
    ctx.fillText(label, x > 450 ? x - 9 : x + 9, y - 12);
  }
}

function reset() {
  const unit = fields.fuel.value === "methane" ? "м³" : "л";
  document.querySelectorAll("[data-unit]").forEach(label => { label.textContent = unit; });
  result.textContent = "";
  draw();
}

async function init() {
  try {
    const response = await fetch("/api/network");
    if (!response.ok) throw new Error("Не удалось загрузить схему.");
    network = await response.json();
    for (const [id, [name]] of Object.entries(network.points)) {
      if (id in network.stations) continue;
      fields.start.add(new Option(name, id));
      fields.end.add(new Option(name, id));
    }
    fields.end.value = "amir";
    reset();
    button.disabled = false;
    swap.disabled = false;
    form.requestSubmit();
  } catch {
    result.textContent = "Не удалось загрузить схему.";
  }
}

swap.addEventListener("click", () => {
  [fields.start.value, fields.end.value] = [fields.end.value, fields.start.value];
  reset();
  form.requestSubmit();
});
form.addEventListener("input", () => { if (network) reset(); });
fields.fuel.addEventListener("change", () => {
  for (const name of ["consumption", "remaining", "reserve", "capacity"]) fields[name].value = "";
  reset();
});
form.addEventListener("submit", async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  data.traffic = fields.traffic.checked;
  for (const name of ["consumption", "remaining", "reserve", "capacity"]) data[name] = Number(data[name]);
  form.querySelectorAll("input, select, button").forEach(control => { control.disabled = true; });
  try {
    const response = await fetch("/api/plan", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
    const plan = await response.json();
    if (!response.ok) throw new Error(plan.error);
    const { route, status, unit } = plan;
    const labels = {
      enough: "Топлива хватает",
      alternate: "Найден маршрут с меньшим расходом",
      refuel: `Заправка по пути · ${network.points[route.station]?.[0] || ""}`,
      unreachable: "Поездка с текущим остатком невозможна",
    };
    const summary = document.createElement("section");
    summary.className = "trip-summary";
    summary.dataset.status = status;
    const title = document.createElement("h3");
    title.textContent = labels[status];
    const detail = document.createElement("p");
    if (status === "refuel") {
      const extraMinutes = route.minutes - plan.direct.minutes;
      const refill = Math.ceil(route.minimumRefill * 100 - 1e-9) / 100;
      detail.textContent = `До АЗС останется ${number.format(route.arrivalFuel)} ${unit}. Дозаправка от ${number.format(refill)} ${unit}. Объезд +${extraMinutes} мин.`;
    } else if (status === "unreachable") {
      detail.textContent = "В учебной сети нет доступной АЗС с этим топливом. Ниже — параметры базового маршрута.";
    } else {
      detail.textContent = `В точке Б останется около ${number.format(data.remaining - route.fuel)} ${unit}.`;
    }
    const stats = document.createElement("dl");
    stats.className = "trip-stats";
    for (const [label, value] of [
      ["Длина", `${number.format(route.km)} км`],
      ["В пути", `${route.minutes} мин`],
      ["Расход", `${number.format(route.fuel)} ${unit}`],
    ]) {
      const stat = document.createElement("div");
      const term = document.createElement("dt");
      const amount = document.createElement("dd");
      term.textContent = label;
      amount.textContent = value;
      stat.append(term, amount);
      stats.append(stat);
    }
    summary.append(title, detail, stats);
    result.replaceChildren(summary);
    draw(status === "unreachable" ? [] : route.points);
  } catch (error) {
    result.textContent = error.message;
    draw();
  } finally {
    form.querySelectorAll("input, select, button").forEach(control => { control.disabled = false; });
  }
});

init();
