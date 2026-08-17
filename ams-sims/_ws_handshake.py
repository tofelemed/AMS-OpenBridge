"""Raw WebSocket handshake probe for /mqtt-ws through nginx and gateway."""
import base64
import os
import socket

for host, port in [("127.0.0.1", 3000), ("127.0.0.1", 8081)]:
    key = base64.b64encode(os.urandom(16)).decode()
    req = (
        f"GET /mqtt-ws HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "Sec-WebSocket-Protocol: mqtt\r\n"
        "Origin: http://localhost:3000\r\n"
        "\r\n"
    )
    s = socket.create_connection((host, port), timeout=10)
    s.sendall(req.encode())
    s.settimeout(5)
    try:
        data = s.recv(1024).decode("utf-8", "replace")
    except socket.timeout:
        data = "(no response within 5s)"
    print(f"--- {host}:{port} ---")
    print(data.split("\r\n\r\n")[0][:500])
    s.close()
