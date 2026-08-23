#!/usr/bin/env python3
"""Regen planet splashes WITHOUT any diver character (IP hygiene)."""
import urllib.request, json, os, base64, time

KEY = os.environ["GOOGLE_API_KEY"]
OUT = "/home/j/apps/starlight-supper/assets"

STYLE = ("Wide cinematic landscape illustration for an indie game title screen: painterly, rich saturated colors, "
         "dramatic lighting, no people, no humans, no characters, no figures — pure scenery only. ")

PLANETS = {
  "verdanth": ("Verdanth — a mossy alien super-garden at night: bioluminescent jungle with glowing white orchids and a giant "
               "star-shaped luminous flower, mossy stone ruins and arching vine-covered monoliths, winding mossy path, drifting "
               "spore-light orbs, twin moons over a starry sky. Emerald and teal palette."),
  "cinder": ("Cinder Reach — volcanic island archipelago at night: erupting volcano with rivers of orange lava flowing to the sea, "
             "jagged obsidian cliffs, distant coastal settlement with warm lights, swirling ember storm nebula in a deep starry sky. "
             "Orange, charcoal and crimson palette."),
}

NEG = (" Absolutely no divers, no diving suits, no helmets with lamps, no oxygen tanks, no bearded men, no humanoid figures of any kind.")

def gen(name, prompt):
    body = {"contents": [{"parts": [{"text": STYLE + prompt + NEG}]}],
            "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "16:9"}}}
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

for name, prompt in PLANETS.items():
    for attempt in range(3):
        try:
            if gen(name, prompt):
                print(f"OK {name}")
                break
        except Exception as e:
            print("retry", name, e); time.sleep(4)
    else:
        print(f"FAIL {name}"); continue
    time.sleep(2)
