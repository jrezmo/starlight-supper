#!/usr/bin/env python3
"""Regenerate Starlight Supper intro VO with directed Gemini TTS (2.5 flash preview)."""
import os, json, base64, urllib.request, sys

KEY = os.environ["GOOGLE_API_KEY"]
OUT = "/home/j/apps/starlight-supper/assets/vo"
os.makedirs(OUT, exist_ok=True)

# (file, style direction, line) — each beat gets its own delivery
BEATS = [
 ("b00", "Speak as an ancient, warm storyteller opening a legend. Slow, hushed, full of awe, with a pause before 'went cold'.",
  "Three hundred years ago... the Great Kettle — the cosmic hearth that simmered the First Broth — went cold."),
 ("b01", "Somber and heavy, like naming a tragedy. Let the words land slowly.",
  "They call it the Sundering. The stars went quiet. The broth went bland."),
 ("b02", "Affectionate and amused, a fond grandchild recounting family lore. Smile in the voice.",
  "Grandmother said the Kettle burned on three jewels — one on each of three worlds. She drew them on a napkin. We still have the napkin."),
 ("b03", "Bright and wonder-struck, painting a lush green world.",
  "Verdanth — where forests hum in major keys... and Madame Vex judges your table manners before your courage."),
 ("b04", "Hot, punchy, half-laughing at the absurdity. Crank the energy.",
  "Cinder Nine! Where it is ALWAYS too hot for soup — and Chef Braxo solves disagreements with spatulas!"),
 ("b05", "Deep, slow, echoing, like calling across a dark ocean trench.",
  "Pelagia... where Admiral Mor pressure-cooks everything beautifully, and speaks only in whale song, and sighs."),
 ("b06", "Warm, proud, heroic — introducing the hero of our story.",
  "You are Nimbus Quill — last of the Vessari Gourmand Nomads. You inherit her recipes, one rustbucket ship, and a family of worms with very strong opinions."),
 ("b07", "Fast, playful, like a snappy commercial read. Bounce on the rhythm.",
  "By day: cook gourmet dishes, post them on Forklore, raise the galaxy's smartest worms! Fame is fuel. Likes are money."),
 ("b08", "Adventurous and bold — a battle cry, then a wink on the last line.",
  "By energy: explore the worlds. Fight what fights you. And befriend whoever bakes."),
 ("b09", "Conspiratorial and delighted, sharing the game's best secret.",
  "Here's the truth: every rival can be beaten at a tea party. Win the duel of etiquette... and they fight beside you."),
 ("b10", "Gravelly menace building to comic exasperation. Growl 'Baron Volt', then deadpan the last sentence.",
  "Take all three jewels, rekindle the Kettle — and Baron Volt will come down to take them back personally. The galaxy's grumpiest storm-food critic wears the Emerald as a belt buckle. Because it matched nothing."),
 ("b11", "The title call. Grand, resonant, triumphant — then four clean beats, like a bell tolling.",
  "Starlight Supper. Cook. Duel. Brew. Rekindle the Kettle."),
]

MODEL = "gemini-2.5-flash-preview-tts"
VOICE = "Enceladus"  # breathy, cinematic narrator voice

def synth(style, text, out):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={KEY}"
    body = {
        "contents": [{"parts": [{"text": f"{style}\n\nSay: {text}"}]}],
        "generationConfig": {"responseModalities": ["AUDIO"],
                             "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": VOICE}}}},
    }
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        resp = json.load(r)
    parts = resp["candidates"][0]["content"]["parts"]
    audio = base64.b64decode(parts[0]["inlineData"]["data"])
    # Gemini TTS returns raw PCM 24kHz 16-bit mono — wrap in WAV
    import wave
    with wave.open(out.replace(".mp3", ".wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000)
        w.writeframes(audio)
    print("ok", out)

fails = []
for name, style, text in BEATS:
    try:
        synth(style, text, f"{OUT}/{name}.mp3")
    except Exception as e:
        fails.append((name, str(e)[:200])); print("FAIL", name, e)
sys.exit(1 if fails else 0)
