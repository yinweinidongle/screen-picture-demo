"""Recenter the four authored wheel meshes and convert the licensed GLB to metres."""

import argparse
import copy
import hashlib
import json
import struct
from pathlib import Path

SOURCE_SHA = "72beab0139dc7212f63d79822a9a6250fb9e77f81ef86f10e010d92e49146367"


def prepare(source, destination):
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA:
        raise ValueError("Expected the pinned Arion Digital Aventador source GLB")
    size = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20 : 20 + size])
    binary = bytearray(raw[28 + size :])
    doc["materials"].append(copy.deepcopy(doc["materials"][0]))
    doc["materials"][2]["name"] = "Aventador body paint atlas"
    doc["materials"][1]["name"] = "Glass"
    doc["materials"][0]["name"] = "Aventador wheel atlas"
    for node in doc["nodes"]:
        if "mesh" not in node:
            continue
        primitive = doc["meshes"][node["mesh"]]["primitives"][0]
        pos = doc["accessors"][primitive["attributes"]["POSITION"]]
        view = doc["bufferViews"][pos["bufferView"]]
        start = view.get("byteOffset", 0) + pos.get("byteOffset", 0)
        stride = view.get("byteStride", 12)
        wheel = node["name"].startswith("Wheel_")
        centre = [(a + b) / 2 if wheel else 0 for a, b in zip(pos["min"], pos["max"])]
        for i in range(pos["count"]):
            offset = start + i * stride
            xyz = struct.unpack_from("<3f", binary, offset)
            struct.pack_into(
                "<3f", binary, offset, *((v - c) * 0.01 for v, c in zip(xyz, centre))
            )
        for bound in ("min", "max"):
            pos[bound] = [(v - c) * 0.01 for v, c in zip(pos[bound], centre)]
        if wheel:
            node["translation"] = [v * 0.01 for v in centre]
            node["extras"] = {"aeroAxle": node["name"].split("_")[1]}
        elif node["name"].startswith("Body_"):
            primitive["material"] = 2
    payload = json.dumps(doc, separators=(",", ":")).encode()
    payload += b" " * (-len(payload) % 4)
    destination.write_bytes(
        struct.pack(
            "<4sIIII",
            b"glTF",
            2,
            28 + len(payload) + len(binary),
            len(payload),
            0x4E4F534A,
        )
        + payload
        + struct.pack("<II", len(binary), 0x004E4942)
        + binary
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    options = parser.parse_args()
    prepare(options.source, options.destination)
