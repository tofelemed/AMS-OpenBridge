"""Stage 10 transport smoke: SPA bundle + /mqtt-ws WebSocket via nginx and gateway."""
import re
import time

import requests

html = requests.get("http://127.0.0.1:3000/", timeout=10).text
assets = re.findall(r'(?:src|href)="(/[^"]+\.(?:js|css))"', html)
print("assets:", assets)
for a in assets[:3]:
    r = requests.get("http://127.0.0.1:3000" + a, timeout=15)
    print(a, r.status_code, len(r.content), "bytes")

import paho.mqtt.client as mqtt
import simlib as sl

# the gateway authenticates /mqtt-ws via ?access_token= (mqttStore.ts:279-286)
token = sl.login()

for host, port, label in [("127.0.0.1", 3000, "nginx:3000"), ("127.0.0.1", 8081, "gateway:8081")]:
    got = {"rc": None, "msgs": 0}
    c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, transport="websockets",
                    client_id=f"sim-ws-{port}")
    c.ws_set_options(path=f"/mqtt-ws?access_token={token}")
    c.username_pw_set("ams_edge", "changeme_edge")
    c.on_connect = lambda cl, u, f, rc, props=None, g=got: g.__setitem__("rc", str(rc))
    c.on_message = lambda cl, u, m, g=got: g.__setitem__("msgs", g["msgs"] + 1)
    try:
        c.connect(host, port, keepalive=20)
        c.subscribe("spBv1.0/ams_site1/#", qos=0)
        c.loop_start()
        time.sleep(6)
        c.loop_stop()
        c.disconnect()
        print(label, "connect rc =", got["rc"], "msgs in 6s =", got["msgs"])
    except Exception as e:
        print(label, "WS ERROR:", e)
