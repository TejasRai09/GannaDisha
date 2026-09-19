"""Serve the plot map to this machine and to the local network.

The map fetches ~29 MB of typed-array data, which browsers refuse to read over
file:// — so it has to come from a server, however small.

Binds 0.0.0.0, so it answers on localhost and on every LAN address of this PC.
Set HOST=127.0.0.1 to keep it private to this machine, or PORT to move it.
"""

import functools
import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser

PORT = int(os.environ.get("PORT", 8000))
HOST = os.environ.get("HOST", "0.0.0.0")
WEB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")


def local_ips():
    """Every IPv4 address this machine answers on, primary interface first."""
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))          # no traffic sent; picks the default route
        ips.append(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith("127."):
                ips.append(ip)
    except OSError:
        pass
    return ips


class ThreadedServer(socketserver.ThreadingTCPServer):
    """One thread per connection, so a phone pulling 29 MB does not block the PC."""

    daemon_threads = True
    allow_reuse_address = True


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"       # keep-alive; matters over Wi-Fi
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".json": "application/json",
        ".bin": "application/octet-stream",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "304" not in (args[1] if len(args) > 1 else ""):
            super().log_message(fmt, *args)


def main():
    # Request logs go to stderr unbuffered; without this the banner below sits in
    # the stdout buffer and the URLs never appear.
    sys.stdout.reconfigure(line_buffering=True)

    if not os.path.exists(os.path.join(WEB, "data", "geom.bin")):
        raise SystemExit("Missing web/data — run:\n  python build/extract.py\n  python build/build_web.py")

    socketserver.TCPServer.allow_reuse_address = True
    handler = functools.partial(Handler, directory=WEB)
    with ThreadedServer((HOST, PORT), handler) as httpd:
        url = f"http://localhost:{PORT}/"
        print("Varietal plot map")
        print(f"  this PC      {url}")
        if HOST != "127.0.0.1":
            for ip in local_ips():
                print(f"  network      http://{ip}:{PORT}/")
            print("\nPhones/laptops must be on the same network, and Windows Firewall")
            print(f"must allow inbound TCP {PORT} (see README).")
        print("\nCtrl+C to stop.")
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")


if __name__ == "__main__":
    main()
