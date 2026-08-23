#!/usr/bin/env python3
"""Generate 4 additional intro splash arts for beats lacking art."""
import urllib.request, json, os, base64

KEY = os.environ["GOOGLE_API_KEY"]
OUT = os.path.join(os.path.dirname(__file__), "assets")

STYLE = ("Chunky painterly indie-game illustration, original cozy sci-fi style: "
         "thick visible brush strokes, vibrant saturated colors, warm humor, "
         "soft rim lighting, clean shapes, high detail character art. ")

ASSETS = {
    # Beat: THE SUNDERING — kettle going cold
    "sundering": ("Wide cinematic splash: a giant ancient bronze cosmic kettle floating alone in deep "
                  "purple space, its warm golden inner glow fading to cold blue-grey; three glowing jewels "
                  "(ruby, sapphire, emerald) drifting away from it like sparks into the dark starfield; "
                  "faint nebula clouds, melancholy beautiful mood, no characters."),
    # Beat: GRANDMOTHER'S MAP
    "napkin": ("Wide splash art: a close view of a weathered paper napkin on a rustic wooden galley table, "
               "covered in charming crayon drawings — three colorful planets connected by dotted lines to a "
               "ruby, a sapphire and an emerald, plus a doodle of a steaming kettle and a childlike drawing of "
               "an alien chef with three eyes; a small oil lantern glows warmly at the edge of the table."),
    # Beat: BY DAY (cooking/worms/Forklore life)
    "byday": ("Wide splash: cozy spaceship kitchen interior bursting with life — a teal three-eyed alien chef in "
              "white chef hat plating a gourmet dish that sparkles, shelves of glowing ingredient jars, hanging "
              "copper pots, and a glass terrarium where cute worms wear tiny hats and monocles; a floating "
              "holographic phone screen shows rising like-counts. Warm golden light, steam curls."),
    # Beat: BY EXPEDITION (night exploration)
    "expedition": ("Wide splash: night side of an alien mossy planet under a huge ringed gas giant in the sky; "
                   "a small determined teal alien chef with a lantern walks a winding path between bioluminescent "
                   "plants toward distant glowing ruins; her rusty saucer ship parked behind her, tiny worms with "
                   "lanterns following in a line. Moody blues and teals with warm lantern glow."),
}

for name, prompt in ASSETS.items():
    path = os.path.join(OUT, name + ".png")
    if os.path.exists(path):
        print(f"skip {name} (exists)"); continue
    body = {"contents": [{"parts": [{"text": STYLE + prompt}]}],
            "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "16:9"}}}
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key={KEY}",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            resp = json.load(r)
        for part in resp["candidates"][0]["content"]["parts"]:
            if "inlineData" in part:
                with open(path, "wb") as f:
                    f.write(base64.b64decode(part["inlineData"]["data"]))
                print(f"OK {name}")
                break
        else:
            print(f"FAIL {name}: no image in response")
    except Exception as e:
        print(f"FAIL {name}: {e}")
