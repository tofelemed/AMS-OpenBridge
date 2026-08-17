"""Minimal Sparkplug B payload decoder (no protobuf dependency).

Decodes only what the sims verify: Payload{timestamp=1, metrics=2, seq=3} and
Metric{name=1, alias=2, timestamp=3, datatype=4, is_null=7, int=10, long=11,
float=12, double=13, boolean=14, string=15}. Unknown fields are skipped by
wire type, so extra fields never break decoding.
"""
from __future__ import annotations

import struct
from typing import Any


def _varint(buf: bytes, i: int) -> tuple[int, int]:
    shift = 0
    val = 0
    while True:
        b = buf[i]
        val |= (b & 0x7F) << shift
        i += 1
        if not b & 0x80:
            return val, i
        shift += 7


def _skip(buf: bytes, i: int, wire: int) -> int:
    if wire == 0:
        _, i = _varint(buf, i)
    elif wire == 1:
        i += 8
    elif wire == 2:
        ln, i = _varint(buf, i)
        i += ln
    elif wire == 5:
        i += 4
    else:
        raise ValueError(f"unsupported wire type {wire}")
    return i


def _fields(buf: bytes):
    i = 0
    while i < len(buf):
        tag, i = _varint(buf, i)
        field, wire = tag >> 3, tag & 7
        if wire == 0:
            val, i = _varint(buf, i)
        elif wire == 1:
            val = buf[i:i + 8]
            i += 8
        elif wire == 2:
            ln, i = _varint(buf, i)
            val = buf[i:i + ln]
            i += ln
        elif wire == 5:
            val = buf[i:i + 4]
            i += 4
        else:
            i = _skip(buf, i, wire)
            continue
        yield field, wire, val


def decode_metric(buf: bytes) -> dict[str, Any]:
    m: dict[str, Any] = {}
    for field, wire, val in _fields(buf):
        if field == 1 and wire == 2:
            m["name"] = val.decode("utf-8", "replace")
        elif field == 2 and wire == 0:
            m["alias"] = val
        elif field == 3 and wire == 0:
            m["timestamp"] = val
        elif field == 4 and wire == 0:
            m["datatype"] = val
        elif field == 7 and wire == 0:
            m["is_null"] = bool(val)
        elif field == 10 and wire == 0:
            m["value"] = val
        elif field == 11 and wire == 0:
            m["value"] = val
        elif field == 12 and wire == 5:
            m["value"] = struct.unpack("<f", val)[0]
        elif field == 13 and wire == 1:
            m["value"] = struct.unpack("<d", val)[0]
        elif field == 14 and wire == 0:
            m["value"] = bool(val)
        elif field == 15 and wire == 2:
            m["value"] = val.decode("utf-8", "replace")
    return m


def decode_payload(buf: bytes) -> dict[str, Any]:
    p: dict[str, Any] = {"metrics": []}
    for field, wire, val in _fields(buf):
        if field == 1 and wire == 0:
            p["timestamp"] = val
        elif field == 2 and wire == 2:
            p["metrics"].append(decode_metric(val))
        elif field == 3 and wire == 0:
            p["seq"] = val
    return p
