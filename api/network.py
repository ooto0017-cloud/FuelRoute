from server import Handler


class handler(Handler):
    def do_GET(self):
        from engine import POINTS, ROADS, STATIONS

        self.send_json({"points": POINTS, "roads": ROADS, "stations": STATIONS})
