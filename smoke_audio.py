"""Headless smoke test: load game, start new game, advance, assert no page errors."""
import asyncio
from playwright.async_api import async_playwright

async def main():
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto("http://127.0.0.1:8099/index.html?v=20260823b", wait_until="load")
        # title screen visible?
        assert await page.locator("#screen-title.active").count() == 1, "title screen not active"
        # begin journey
        await page.click("#btn-new-game")
        await page.wait_for_timeout(1500)
        # try to advance intro/story if present
        for _ in range(6):
            nxt = page.locator("#story-next")
            if await nxt.count() and await nxt.first.is_visible():
                await nxt.click()
                await page.wait_for_timeout(300)
            else:
                break
        await page.wait_for_timeout(1000)
        # audio engine state (may be suspended in headless without gesture — just record)
        chip_state = await page.evaluate(
            "(() => { try { return typeof Chip !== 'undefined' ? 'chip-loaded' : 'chip-missing'; } catch(e){ return 'err'; } })()"
        )
        print("chip:", chip_state)
        print("pageerrors:", errors if errors else "NONE")
        await browser.close()
        if errors:
            raise SystemExit(1)

asyncio.run(main())
