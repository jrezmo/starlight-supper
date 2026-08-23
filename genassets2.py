#!/usr/bin/env python3
"""Batch 2: dish art + misc."""
import urllib.request, json, os, base64, sys, time

KEY = os.environ["GOOGLE_API_KEY"]
OUT = "/home/j/apps/starlight-supper/assets"

STYLE = ("Overhead gourmet food illustration, chunky painterly indie-game art: "
         "rich saturated colors, visible brush strokes, appetizing steam, dark purple background (#1d1740), centered plate. ")

DISHES = {
  "dish1": "Starbloom Nectar Foam with Glowsroom Dust: a pale golden glowing dessert foam in an elegant coupe glass, dusted with luminous green mushroom powder, tiny star-shaped flowers on top.",
  "dish2": "Cloudfruit Tart with Lavasalt Crust: a fluffy white-pink fruit tart, slice revealing airy layers, black-pink salt flakes sparkling on the crust edge.",
  "dish3": "Ember-Cured Cinderfin Ceviche: vivid orange-red raw fish ceviche in a shell bowl, glowing embers of chili, served cold with steam rising paradoxically.",
  "dish4": "Abysskelp Risotto with Pearlroot Chip: deep teal-black risotto glowing faintly cyan, crowned with a crisp pearl-white root chip.",
  "dish5": "Moonroe Wellington in Starbloom Jus: an elegant sliced wellington showing rosy meat wrapped in golden pastry, surrounded by a pool of shimmering golden sauce.",
  "dish6": "First Broth of the Cosmos: a humble clay bowl of broth containing what looks like a swirling miniature nebula, stars reflected in its surface, softly radiant.",
}
EXTRA = {
  "cooking": ("Cozy kitchen scene illustration: a teal three-eyed alien chef tossing a flaming wok in a cluttered salvage-dome kitchen, "
              "ingredients flying, warm lantern light, comedic energy.", None),
  "worm": ("Close-up portrait of an adorable fancy earthworm wearing a tiny monocle and top hat, iridescent pink-green skin, "
           "curled elegantly like a mustache, solid very dark purple background (#1d1740).", None),
}

def gen(name, prompt, aspect):
    gencfg = {"responseModalities": ["IMAGE"]}
    if aspect: gencfg["imageConfig"] = {"aspectRatio": aspect}
    body = {"contents": [{"parts": [{"text": STYLE + prompt}]}], "generationConfig": gencfg}
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key={KEY}",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        resp = json.load(r)
    for part in resp["candidates"][0]["content"]["parts"]:
        if "inlineData" in part:
            with open(os.path.join(OUT, name + ".png"), "wb") as f:
                f.write(base64.b64decode(part["inlineData"]["data"]))
            return True
    return False

fails = []
for name, prompt in {**DISHES, **{k: v for k, v in EXTRA.items()}}.items():
    p, aspect = (prompt, None) if name in EXTRA else (prompt, "1:1")
    if os.path.exists(os.path.join(OUT, name + ".png")): continue
    ok = False
    for _ in range(2):
        try:
            ok = gen(name, p, aspect)
            if ok: break
        except Exception as e:
            print(f"  {name}: {e}", file=sys.stderr); time.sleep(2)
    print(("OK  " if ok else "FAIL") + f" {name}")
    if not ok: fails.append(name)
print("DONE. fails:", fails or "none")
