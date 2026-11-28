"""Package the supplied Wangshu GLB with a locally drawn lunar texture."""

import argparse
import gzip
import io
import json
import random
import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps


def lunar_texture():
    rng = random.Random(700)
    size = (768, 384)

    def noise(width):
        height = width // 2
        interior = Image.frombytes("L", (width, height), rng.randbytes(width * height))
        # Tile before interpolation to keep the longitude seam continuous.
        sheet = Image.new("L", (width * 3, height))
        for i in range(3):
            sheet.paste(interior, (width * i, 0))
        return sheet.resize((size[0] * 3, size[1]), Image.Resampling.BICUBIC).crop(
            (size[0], 0, size[0] * 2, size[1])
        )

    terrain = noise(12)
    for width, weight in [(32, 0.31), (96, 0.22), (768, 0.13)]:
        terrain = Image.blend(terrain, noise(width), weight)
    relief = Image.new("L", size, 128)
    draw = ImageDraw.Draw(relief)
    for _ in range(460):
        x, y = rng.randrange(size[0]), rng.randrange(size[1])
        radius = 1 + int(rng.random() ** 5 * 17)
        for dx in (-size[0], 0, size[0]):
            box = (x + dx - radius, y - radius, x + dx + radius, y + radius)
            draw.ellipse(box, fill=109, outline=139)
            draw.arc(box, 165, 280, fill=185, width=max(1, radius // 7))
            draw.arc(box, 0, 86, fill=72, width=max(1, radius // 7))
    terrain = Image.blend(terrain, relief.filter(ImageFilter.GaussianBlur(0.42)), 0.34)
    image = ImageOps.colorize(terrain, (70, 78, 83), (239, 236, 220))
    out = io.BytesIO()
    image.save(out, "JPEG", quality=86, optimize=True)
    return out.getvalue()


def package(source, destination):
    raw = source.read_bytes()
    json_size = struct.unpack_from("<I", raw, 12)[0]
    gltf = json.loads(raw[20 : 20 + json_size])
    blob = bytearray(raw[28 + json_size :])
    moon = next(i for i in gltf["images"] if i["name"] == "lunar_albedo")
    view = gltf["bufferViews"][moon["bufferView"]]
    offset, limit = view["byteOffset"], view["byteLength"]
    data = lunar_texture()
    if len(data) > limit or view["buffer"] != 0:
        raise ValueError("The source lunar buffer cannot hold the replacement")
    # Preserve meshopt offsets while removing all bytes of the old image.
    blob[offset : offset + limit] = data.ljust(limit, b"\0")
    view["byteLength"] = len(data)
    moon["name"] = "procedural_lunar_albedo"
    header = json.dumps(gltf, ensure_ascii=False, separators=(",", ":")).encode()
    header += b" " * (-len(header) % 4)
    glb = (
        struct.pack(
            "<4sIIII", b"glTF", 2, 28 + len(header) + len(blob), len(header), 0x4E4F534A
        )
        + header
        + struct.pack("<II", len(blob), 0x004E4942)
        + blob
    )
    destination.write_bytes(gzip.compress(glb, compresslevel=9, mtime=0))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    package(args.source, args.destination)
