from heapq import heappop, heappush
from math import isfinite

POINTS = {
    "chilonzor": ["Чиланзар", 80, 310],
    "national": ["Национальный парк", 205, 225],
    "friendship": ["Дружба народов", 305, 155],
    "amir": ["Сквер Амира Темура", 495, 110],
    "north": ["Северный вокзал", 520, 310],
    "station1": ["АЗС А · демонстрационная", 230, 315],
    "station2": ["АЗС Б · демонстрационная", 370, 245],
}
STATIONS = {
    "station1": ["gasoline", "diesel", "propane"],
    "station2": ["gasoline", "methane"],
}
UNITS = {"gasoline": "л", "diesel": "л", "methane": "м³", "propane": "л"}
# Each bidirectional edge stores kilometers, normal minutes and extra minutes.
ROADS = [
    ("chilonzor", "national", 3.2, 7, 3),
    ("national", "friendship", 2.1, 5, 9),
    ("friendship", "amir", 3.2, 8, 6),
    ("national", "north", 5.4, 13, 2),
    ("north", "amir", 3.7, 9, 1),
    ("chilonzor", "station1", 2.2, 6, 1),
    ("station1", "national", 1.4, 4, 0),
    ("national", "station2", 2.4, 6, 2),
    ("station2", "north", 2.8, 7, 2),
]
GRAPH = {point: [] for point in POINTS}
for a, b, distance, minutes, delay in ROADS:
    GRAPH[a].append((b, distance, minutes, delay))
    GRAPH[b].append((a, distance, minutes, delay))


def shortest(start, end, traffic, consumption, fuel_limit=None, reserve=0):
    queue = [(0, 0, (start,))]
    while queue:
        minutes, distance, path = heappop(queue)
        current = path[-1]
        if current == end:
            return {"points": list(path), "km": distance, "minutes": minutes,
                    "fuel": distance * consumption / 100}
        for neighbor, km, time, delay in GRAPH[current]:
            if neighbor in path:
                continue
            next_distance = distance + km
            if fuel_limit is not None and next_distance * consumption / 100 + reserve > fuel_limit + 1e-9:
                continue
            heappush(queue, (minutes + time + (delay if traffic else 0),
                             next_distance, (*path, neighbor)))
    return None


def calculate(data):
    if not isinstance(data, dict):
        raise ValueError("Ожидается объект JSON.")
    start, end, fuel = (data.get(key) for key in ("start", "end", "fuel"))
    if not all(isinstance(item, str) for item in (start, end, fuel)):
        raise ValueError("Укажите маршрут и топливо.")
    if start not in POINTS or end not in POINTS or start in STATIONS or end in STATIONS or start == end:
        raise ValueError("Выберите две разные доступные точки Ташкента.")
    if fuel not in UNITS or type(data.get("traffic")) is not bool:
        raise ValueError("Проверьте тип топлива и режим пробок.")
    values = [data.get(key) for key in ("consumption", "remaining", "reserve", "capacity")]
    if any(type(value) not in (int, float) or not 0 <= value <= 1000 or not isfinite(value) for value in values):
        raise ValueError("Введите числа от 0 до 1000.")
    consumption, remaining, reserve, capacity = values
    if consumption <= 0 or capacity <= 0 or remaining > capacity or reserve >= capacity:
        raise ValueError("Проверьте расход, остаток, запас и ёмкость.")
    traffic = data["traffic"]
    direct = shortest(start, end, traffic, consumption)
    feasible = shortest(start, end, traffic, consumption, remaining, reserve)
    result = {"unit": UNITS[fuel], "direct": direct, "route": feasible or direct}
    if feasible:
        result["status"] = "alternate" if feasible != direct else "enough"
        return result

    options = []
    for station, fuels in STATIONS.items():
        if fuel not in fuels:
            continue
        first = shortest(start, station, traffic, consumption, remaining, reserve)
        second = shortest(station, end, traffic, consumption, capacity, reserve)
        if not first or not second:
            continue
        options.append({
            "station": station,
            "points": first["points"] + second["points"][1:],
            "km": first["km"] + second["km"],
            "minutes": first["minutes"] + second["minutes"],
            "fuel": first["fuel"] + second["fuel"],
            "arrivalFuel": max(0, remaining - first["fuel"]),
            "minimumRefill": max(0, second["fuel"] + reserve - (remaining - first["fuel"])),
        })
    if options:
        best = min(options, key=lambda option: (option["minutes"], option["km"], option["station"]))
        result.update(status="refuel", route=best)
    else:
        result["status"] = "unreachable"
    return result
