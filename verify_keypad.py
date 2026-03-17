import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Setup context with a specific viewport and start tracing
        context = await browser.new_context(
            viewport={'width': 1400, 'height': 900},
            record_video_dir="verification/"
        )
        page = await context.new_page()

        print("Navigating to http://localhost:6882/")
        await page.goto("http://localhost:6882/")
        await page.wait_for_load_state("networkidle")

        print("Clicking Activate demo...")
        activate_demo = page.locator('[aria-label="Activate demo"]').first
        await activate_demo.wait_for(state="visible", timeout=5000)
        await activate_demo.click(force=True)
        await page.wait_for_timeout(1000)

        print("Finding ANY button...")
        # Since the first matched "button" was the transaction history item, we need to find the category grid buttons.
        # They have `.flex.flex-col.items-center.rounded-2xl`

        all_buttons = await page.locator('button.flex.flex-col.items-center.rounded-2xl').all()
        for i, btn in enumerate(all_buttons):
            text = await btn.text_content()
            if text and ("Groceries" in text or "Food" in text or "Coffee" in text or "Dining" in text):
                print(f"Found category grid button: {text.strip()}, clicking...")
                await btn.click(force=True)
                break

        await page.wait_for_timeout(1500)

        try:
            done_btn = page.get_by_role("button", name="Done", exact=True).first
            if await done_btn.is_visible(timeout=2000):
                print("Closing DateTimeDrawer...")
                await done_btn.click()
                await page.wait_for_timeout(1000)
        except:
            pass

        print("Waiting for Keypad to appear...")
        dot_key = page.get_by_label("Decimal point", exact=True).first

        try:
            await dot_key.wait_for(state="visible", timeout=5000)

            # Interact with the keys to prove they work
            print("Pressing 5...")
            await page.get_by_role("button", name="5", exact=True).first.click()
            await page.wait_for_timeout(500)

            print("Pressing decimal point...")
            await dot_key.click()
            await page.wait_for_timeout(500)

            print("Pressing 0...")
            await page.get_by_role("button", name="0", exact=True).first.click()
            await page.wait_for_timeout(500)

            print("Pressing Delete...")
            del_key = page.get_by_label("Delete", exact=True).first
            await del_key.click()
            await page.wait_for_timeout(500)

            await page.screenshot(path="verification/keypad_visible.png", full_page=True)
            print("Keypad verified successfully.")

        except Exception as e:
            print(f"Failed to find Keypad: {e}")
            await page.screenshot(path="verification/failed_to_find_keypad.png", full_page=True)

        await context.close()
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
