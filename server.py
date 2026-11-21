import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from engine import POINTS, ROADS, STATIONS, calculate

WEB = Path(__file__).resolve().parent / "web"


class Handler(BaseHTTPRequestHandler):
    route = None

    def send_body(self, body, content_type, status=200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, data, status=200):
        self.send_body(json.dumps(data, ensure_ascii=False).encode(), "application/json; charset=utf-8", status)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/network":
            self.send_json({"points": POINTS, "roads": ROADS, "stations": STATIONS})
            return
        assets = {"/": ("index.html", "text/html"), "/app.js": ("app.js", "text/javascript"),
                  "/style.css": ("style.css", "text/css"), "/stations.json": ("stations.json", "application/json")}
        if path not in assets:
            self.send_json({"error": "Страница не найдена."}, 404)
            return
        filename, content_type = assets[path]
        self.send_body((WEB / filename).read_bytes(), content_type + "; charset=utf-8")

    def do_POST(self):
        if (self.route or self.path) != "/api/plan":
            self.send_json({"error": "Страница не найдена."}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 4096:
                raise ValueError("Недопустимый размер запроса.")
            data = json.loads(self.rfile.read(length))
            self.send_json(calculate(data))
        except ValueError as error:
            message = "Некорректный JSON." if isinstance(error, (json.JSONDecodeError, UnicodeError)) else str(error)
            self.send_json({"error": message}, 400)


if __name__ == "__main__":
    with ThreadingHTTPServer(("127.0.0.1", 8000), Handler) as server:
        print("FuelRoute: http://127.0.0.1:8000", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
