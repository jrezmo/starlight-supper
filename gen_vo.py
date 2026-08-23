#!/usr/bin/env python3
"""Render narrator voiceover for Starlight Supper intro beats via edge-tts."""
import asyncio, sys, os
sys.path.insert(0, "/home/j/.hermes/gws-venv/lib/python3*/site-packages")
import edge_tts

VOICE = "en-US-DatBoiceNeural"  # placeholder, replaced below
NARRATOR = "en-US-GuyNeural"     # warm male narrator
OUT = "/home/j/apps/starlight-supper/assets/vo"
os.makedirs(OUT, exist_ok=True)

BEATS = {
  "b00": "Three hundred years ago, the Great Kettle — the cosmic hearth that simmered the First Broth — went cold.",
  "b01": "They call it the Sundering. The stars went quiet. The broth went bland.",
  "b02": "Grandmother said the Kettle burned on three jewels — one on each of three worlds. She drew them on a napkin. We still have the napkin.",
  "b03": "Verdanth, where forests hum in major keys, and Madame Vex judges your table manners before your courage.",
  "b04": "Cinder nine — where it is always too hot for soup, and Chef Braxo solves disagreements with spatulas.",
  "b05": "Pelagia, where Admiral Mor pressure-cooks everything beautifully, and speaks only in whale song and sighs.",
  "b06": "You are Nimbus Quill — last of the Vessari Gourmand Nomads. You inherit her recipes, one rustbucket ship, and a family of worms with strong opinions.",
  "b07": "By day: cook gourmet dishes, post them on Forklore, raise the galaxy's smartest worms. Fame is fuel. Likes are money.",
  "b08": "By energy: explore the worlds. Fight what fights you. Befriend who bakes.",
  "b09": "Every rival can be beaten at a tea party. Win the duel of etiquette, and they fight beside you.",
  "b10": "Take all three jewels, rekindle the Kettle — and Baron Volt will come down to take them back personally. The galaxy's grumpiest storm-food critic wears the Emerald as a belt buckle. It matched nothing.",
  "b11": "Starlight Supper. Cook. Duel. Brew. Rekindle the Kettle.",
}

async def main():
    for name, text in BEATS.items():
        mp3 = f"{OUT}/{name}.mp3"
        await edge_tts.Communicate(text, NARRATOR, rate="-8%").save(mp3)
        print("ok", name)

asyncio.run(main())
