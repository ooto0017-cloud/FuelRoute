const places = {
  chilonzor: { name: "Метро «Чиланзар»", coords: [41.2758, 69.2034] },
  national: { name: "Национальный парк", coords: [41.3022, 69.2369] },
  friendship: { name: "Дружба народов", coords: [41.3111, 69.2415] },
  amir: { name: "Сквер Амира Темура", coords: [41.3112, 69.2797] },
  station: { name: "Северный вокзал", coords: [41.2919, 69.2876] },
  chorsu: { name: "Базар Чорсу", coords: [41.3266, 69.2358] },
  minor: { name: "Мечеть Минор", coords: [41.3373, 69.2785] },
};
const router = "https://routing.openstreetmap.de/routed-car";
const form = document.querySelector("#plan");
const fields = form.elements;
const result = document.querySelector("#result");
const updated = document.querySelector("#updated");
const formatter = new Intl.NumberFormat("ru", { maximumFractionDigits: 2 });
const clock = new Intl.DateTimeFormat("ru", { timeStyle: "medium", timeZone: "Asia/Tashkent" });
let map;
let drawing;
let timeout;
let revision = 0;
let request;
let stationCatalog;
const routes = new Map();

function pin(point, letter, kind) {
  const icon = L.divIcon({ className: "", html: `<span class="pin ${kind}">${letter}</span>`, iconSize: [32, 32] });
  L.marker(point.coords, { icon, title: point.name, alt: point.name }).addTo(drawing);
}

function renderMap(start, end, route, stop) {
  if (!map) return;
  drawing.clearLayers();
  if (route) {
    const path = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    L.polyline(path, { color: "#fff", weight: 10, opacity: 0.94 }).addTo(drawing);
    L.polyline(path, { color: "#2459e2", weight: 5, opacity: 1 }).addTo(drawing);
  }
  pin(start, "А", "a");
  pin(end, "Б", "b");
  if (stop) {
    L.circleMarker(stop.coords, { radius: 9, color: "#fff", weight: 3,
      fillColor: "#c15c12", fillOpacity: 1 }).addTo(drawing);
  }
  map.fitBounds(drawing.getBounds(), { padding: [35, 35], maxZoom: 15, animate: false });
}

function coordinate(point) {
  return [point.coords[1], point.coords[0]].join(",");
}

async function dataFrom(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function roadRoute(points, signal, refresh = false) {
  const key = points.map(coordinate).join(";");
  const cached = routes.get(key);
  if (!refresh && cached && Date.now() - cached.time < 300000) return cached.route;
  const data = await dataFrom(`${router}/route/v1/driving/${key}?overview=full&geometries=geojson`, signal);
  const route = data.routes?.[0];
  if (!route?.geometry?.coordinates.length) throw new Error("No route");
  routes.set(key, { route, time: Date.now() });
  if (routes.size > 40) routes.delete(routes.keys().next().value);
  return route;
}

function stations() {
  if (!stationCatalog) {
    stationCatalog = dataFrom("/stations.json", AbortSignal.timeout(8000))
      .catch(() => { stationCatalog = undefined; return null; });
  }
  return stationCatalog;
}

async function refuel(start, end, catalog, fuel, consumption, remaining, reserve, capacity, signal, refresh) {
  const compatible = catalog.filter(station => station.fuels.includes(fuel));
  const candidates = compatible
    .sort((a, b) => Math.hypot(a.coords[0] - start.coords[0], (a.coords[1] - start.coords[1]) * 0.75)
                   - Math.hypot(b.coords[0] - start.coords[0], (b.coords[1] - start.coords[1]) * 0.75))
    .slice(0, 12);
  if (!candidates.length) return { stop: null, incomplete: false };
  const points = [start, ...candidates, end].map(coordinate).join(";");
  const sources = [0, ...candidates.map((_, i) => i + 1)].join(";");
  const destinations = [...candidates.map((_, i) => i + 1), candidates.length + 1].join(";");
  const table = await dataFrom(`${router}/table/v1/driving/${points}?sources=${sources}&destinations=${destinations}&annotations=duration,distance`, signal);
  if (!table.distances || !table.durations) throw new Error("No table");
  const ranked = candidates.map((stop, i) => ({
    stop, first: table.distances[0][i], second: table.distances[i + 1].at(-1),
    seconds: table.durations[0][i] + table.durations[i + 1].at(-1),
  })).filter(item => item.first !== null && item.second !== null
      && item.first * consumption / 100000 + reserve <= remaining
      && item.second * consumption / 100000 + reserve <= capacity)
    .sort((a, b) => a.seconds - b.seconds);
  for (const { stop } of ranked) {
    const route = await roadRoute([start, stop, end], signal, refresh);
    const [first, second] = route.legs.map(leg => leg.distance * consumption / 100000);
    if (first + reserve <= remaining && second + reserve <= capacity) {
      return { stop, route, arrival: remaining - first, amount: second + reserve - (remaining - first) };
    }
  }
  return { stop: null, incomplete: compatible.length > candidates.length };
}

function summary(title, message, warning = false, stats = []) {
  result.dataset.state = warning ? "warning" : "";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const note = document.createElement("p");
  note.textContent = message;
  result.replaceChildren(heading, note);
  if (!stats.length) return;
  const list = document.createElement("dl");
  list.className = "stats";
  for (const [label, value] of stats) {
    const pair = document.createElement("div");
    const term = document.createElement("dt");
    const amount = document.createElement("dd");
    term.textContent = label;
    amount.textContent = value;
    pair.append(term, amount);
    list.append(pair);
  }
  result.append(list);
}

async function calculate(version, refresh) {
  const start = places[fields.start.value];
  const end = places[fields.end.value];
  const fuel = fields.fuel.value;
  const unit = fuel === "methane" ? "м³" : "л";
  const [consumption, remaining, reserve, capacity] = ["consumption", "remaining", "reserve", "capacity"]
    .map(name => fields[name].valueAsNumber);
  if (!form.checkValidity() || start === end || remaining > capacity || reserve >= capacity) {
    updated.textContent = "Проверьте параметры";
    summary("Уточните параметры", start === end ? "Выберите разные точки А и Б." :
      "Заполните поля. Остаток не должен превышать ёмкость, а резерв должен быть меньше неё.", true);
    renderMap(start, end);
    return;
  }
  updated.textContent = "Расчёт маршрута…";
  request = new AbortController();
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(22000)]);
  try {
    const direct = await roadRoute([start, end], signal, refresh);
    let route = direct;
    let stop;
    let title = "Топлива хватает";
    let detail = `В точке Б останется около ${formatter.format(remaining - direct.distance * consumption / 100000)} ${unit}.`;
    let warning = false;
    if (direct.distance * consumption / 100000 + reserve > remaining) {
      warning = true;
      title = "Топлива на маршрут не хватает";
      detail = "В каталоге не найдена достижимая АЗС с указанным видом топлива.";
      try {
        const catalog = await stations();
        if (!catalog?.length) throw new Error("No catalog");
        const option = await refuel(start, end, catalog, fuel, consumption, remaining, reserve, capacity, signal, refresh);
        if (option.stop) {
          ({ stop, route } = option);
          title = `Заправка по пути · ${stop.name}`;
          const amount = Math.ceil(Math.max(0, option.amount) * 100) / 100;
          detail = `До АЗС останется ${formatter.format(option.arrival)} ${unit}. Долить от ${formatter.format(amount)} ${unit}.`;
        } else if (option.incomplete) {
          detail = "Среди ближайших проверенных АЗС подходящей не найдено.";
        }
      } catch {
        detail = "Не удалось проверить подходящие АЗС. Попробуйте обновить маршрут.";
      }
    }
    if (version !== revision) return;
    const stats = [["Расстояние", `${formatter.format(route.distance / 1000)} км`],
      ["В пути", `${Math.ceil(route.duration / 60)} мин`],
      ["Расход", `${formatter.format(route.distance * consumption / 100000)} ${unit}`]];
    summary(title, detail, warning, stats);
    renderMap(start, end, route, stop);
    updated.textContent = `Расчёт на ${clock.format(new Date())}`;
  } catch {
    if (version !== revision) return;
    renderMap(start, end);
    updated.textContent = "Маршрут недоступен";
    summary("Не удалось построить маршрут", "Проверьте подключение и нажмите «Обновить маршрут».", true);
  }
}

function schedule(refresh = false) {
  clearTimeout(timeout);
  request?.abort();
  const version = ++revision;
  updated.textContent = "Обновляем расчёт…";
  result.replaceChildren();
  timeout = setTimeout(() => calculate(version, refresh), refresh ? 0 : 450);
}

for (const [id, place] of Object.entries(places)) {
  fields.start.add(new Option(place.name, id));
  fields.end.add(new Option(place.name, id));
}
fields.end.value = "amir";
function updateUnits() {
  document.querySelectorAll("[data-unit]").forEach(node => {
    node.textContent = fields.fuel.value === "methane" ? "м³" : "л";
  });
}
updateUnits();

if (window.L) {
  map = L.map("map", { scrollWheelZoom: false, minZoom: 10 }).setView([41.31, 69.26], 12);
  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://routing.openstreetmap.de/">OSRM</a>',
  }).addTo(map);
  const mapElement = document.querySelector("#map");
  const tileStatus = L.control({ position: "bottomleft" });
  tileStatus.onAdd = () => {
    const node = L.DomUtil.create("div", "tile-status");
    node.textContent = "Подложка карты недоступна";
    return node;
  };
  tiles.on("tileerror", () => {
    if (!mapElement.classList.contains("tiles-unavailable")) {
      mapElement.classList.add("tiles-unavailable");
      tileStatus.addTo(map);
    }
  });
  tiles.on("tileload", () => {
    if (mapElement.classList.contains("tiles-unavailable")) {
      mapElement.classList.remove("tiles-unavailable");
      tileStatus.remove();
    }
  });
  drawing = L.featureGroup().addTo(map);
  renderMap(places[fields.start.value], places[fields.end.value]);
} else {
  const fallback = document.createElement("p");
  fallback.className = "map-failure";
  fallback.textContent = "Карта не загрузилась. Перезагрузите страницу.";
  document.querySelector("#map").append(fallback);
}

form.addEventListener("input", event => {
  if (event.target === fields.fuel) {
    updateUnits();
    for (const name of ["consumption", "remaining", "reserve", "capacity"]) fields[name].value = "";
  }
  schedule();
});
form.addEventListener("submit", event => {
  event.preventDefault();
  schedule(true);
});
document.querySelector("#swap").addEventListener("click", () => {
  [fields.start.value, fields.end.value] = [fields.end.value, fields.start.value];
  schedule();
});
schedule();
