#!/usr/bin/env python3
"""Generate Starlight Supper painted assets via Gemini image models."""
import urllib.request, json, os, base64, sys, time

KEY = os.environ["GOOGLE_API_KEY"]
OUT = os.path.join(os.path.dirname(__file__), "assets")
os.makedirs(OUT, exist_ok=True)

STYLE = ("Chunky painterly indie-game illustration, original cozy sci-fi style: "
         "thick visible brush strokes, vibrant saturated colors, warm humor, "
         "soft rim lighting, clean shapes, high detail character art. ")

ASSETS = {
    "title": ("Wide game title splash art: a small teal three-eyed alien chef in a white chef hat and apron "
              "stands on the wing of a rusty flying saucer, holding a steaming gourmet platter toward a giant "
              "ancient bronze kettle floating among nebulae; three glowing jewels (ruby, emerald, sapphire) orbit "
              "the kettle. Deep purple space background, stars, warm kettle glow.", "16:9"),
    "nimbus": ("Character portrait of Nimbus Quill: a friendly teal-skinned alien with THREE eyes, antenna with "
               "golden bulbs, wearing a white puffy chef hat and cream apron over a teal suit. Confident grin, "
               "holding a glowing spatula. Solid very dark purple background (#1d1740), centered bust composition.", None),
    "vex": ("Character portrait of Madame Vex: an elegant imperious alien duchess with lavender skin, tall silver "
            "updo hair, magenta gown, rose-shaped brooch, one raised eyebrow, holding an ornate teacup like a weapon. "
            "Solid very dark purple background (#1d1740), bust composition.", None),
    "bramble": ("Character portrait of Chef Bramble: a burly exiled pirate-chef with orange bandana, wild beard with "
                "flame motifs, red coat covered in sauce stains, wooden spoon tucked behind ear, manic delighted grin, "
                "sparks of ember around him. Solid very dark purple background (#1d1740), bust composition.", None),
    "nell": ("Character portrait of Admiral Nell: a stern regal amphibian alien admiral in deep blue naval uniform with "
             "gold epaulettes and white cap, sleek blue-gray skin, large dark eyes, pearl earrings, calm commanding gaze. "
             "Solid very dark purple background (#1d1740), bust composition.", None),
    "volt": ("Character portrait of BARON VOLT, the Storm Sommelier: a tall imperious storm-spirit "
             "dandy whose hair is literally small rainclouds crackling with tiny lightning bolts, pale "
             "lavender-blue skin, a curled silver mustache, a high-collared indigo tailcoat with gold "
             "celestial embroidery, a jeweled monocle glowing electric blue, holding a golden tasting-fork "
             "like a scepter. A large glowing green gem sits in his belt buckle, clashing with his cape. "
             "Smug theatrical expression. IMPORTANT FRAMING: full head visible with generous margin above "
             "the hair, waist-up composition, nothing cropped by frame edges. Solid very dark purple "
             "background (#1d1740), centered bust composition.", None),
    "hub": ("Game environment art, cozy alien home base: a ramshackle dome shelter built of spaceship salvage, "
            "pots and pans hanging outside, a chimney puffing star-shaped steam, raised garden bins glowing with "
            "earthworms and strange vegetables, a small rusted flying saucer parked beside, warm lantern light "
            "spilling from the doorway onto purple grass under a nebula sky. Warm teal-purple palette, painterly, no text.", "16:9"),
    "verdanth": ("Game environment art, planet Verdanth: a lush mossy super-garden world at night, giant musical glowing "
                 "plants and bioluminescent groves, floating spores, ancient vine-covered stone arches, two moons. "
                 "Deep green-teal palette, painterly, no text.", "16:9"),
    "cinder": ("Game environment art, planet Cinder Reach: volcanic archipelago at night, rivers of lava between black "
               "glass cliffs, ember storms, a distant storm vortex glowing orange against starry sky. Fiery orange-red "
               "palette, painterly, no text.", "16:9"),
    "pelagia": ("Game environment art, planet Pelagia: a single vast ocean under starlight, bioluminescent deep-sea city "
                "domes glowing cyan beneath the waves, colossal sea creature silhouettes below, floating dock platforms. "
                "Deep blue-cyan palette, painterly, no text.", "16:9"),
    "grubble": ("Enemy sprite art: three small round moss-green gremlin blobs with mischievous grins and stubby teeth, "
                "big cartoon eyes, standing on a forest floor. Full body, centered, solid very dark purple background "
                "(#1d1740).", None),
    "magmaw": ("Enemy sprite art: a chubby lava wyrmling — molten orange magma body with obsidian spikes, glowing yellow "
               "maw full of blunt rocky teeth, tiny wings, adorable-menacing. Full body, centered, solid very dark purple "
               "background (#1d1740).", None),
    "tidehulk": ("Enemy sprite art: a hulking brute of living ocean water — translucent deep-blue body with coral armor "
                 "plates, glowing white eyes, barnacle knuckles, kelp hair. Full body, centered, solid very dark purple "
                 "background (#1d1740).", None),
}

def gen(name, prompt, aspect):
    model = "gemini-3.1-flash-image"
    gencfg = {"responseModalities": ["IMAGE"]}
    if aspect: gencfg["imageConfig"] = {"aspectRatio": aspect}
    else: prompt += " Square composition."
    body = {"contents": [{"parts": [{"text": STYLE + prompt}]}], "generationConfig": gencfg}
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={KEY}",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        resp = json.load(r)
    for part in resp["candidates"][0]["content"]["parts"]:
        if "inlineData" in part:
            path = os.path.join(OUT, name + ".png")
            with open(path, "wb") as f:
                f.write(base64.b64decode(part["inlineData"]["data"]))
            return True
    return False

todo = [(n, p, a) for n, (p, a) in ASSETS.items() if not os.path.exists(os.path.join(OUT, n + ".png"))]
print(f"generating {len(todo)} assets...")
fails = []
for name, prompt, aspect in todo:
    ok = False
    for attempt in range(2):
        try:
            ok = gen(name, prompt, aspect)
            if ok: break
        except Exception as e:
            print(f"  {name}: {e}", file=sys.stderr); time.sleep(2)
    print(("OK  " if ok else "FAIL") + f" {name}")
    if not ok: fails.append(name)
print("DONE. fails:", fails or "none")
