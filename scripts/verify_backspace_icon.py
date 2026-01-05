from playwright.sync_api import Page, expect, sync_playwright

def verify_keypad_ux(page: Page):
    try:
        # Navigate to the app (assuming it starts on localhost:3100)
        # Note: Ensure the app is running (e.g., `pnpm dev`)
        page.goto("http://localhost:3100")

        # Wait for app load
        page.wait_for_timeout(3000)

        # Check for onboarding screen
        if page.get_by_text("Sign in with Google").is_visible() or page.get_by_text("Let's get started").is_visible():
            print("Detected Onboarding screen.")
            print("Please sign in or bypass onboarding to verify the Keypad.")
            # We can't proceed automatically without credentials/mock
            page.screenshot(path="onboarding_blocked.png")
            return

        print("On main screen. Proceeding to Keypad verification.")

        # Try to navigate to Keypad (Expense -> Category -> Keypad)
        # Click "Food Delivery" or similar category if visible
        # This selector targets text that looks like a category
        if page.get_by_text("Food Delivery").is_visible():
            print("Clicking 'Food Delivery'...")
            page.get_by_text("Food Delivery").click()
        elif page.get_by_text("Expense").is_visible():
             # Fallback: maybe we need to select Expense first
             page.get_by_text("Expense").click()
             page.wait_for_timeout(1000)
             # Then pick first button
             page.locator("button").first.click()

        page.wait_for_timeout(1000)

        # If DateTimeDrawer appears, confirm it
        if page.get_by_text("Done").is_visible():
            print("Confirming Date/Time...")
            page.get_by_text("Done").click()

        page.wait_for_timeout(1000)

        # Verify Keypad Backspace Button
        backspace = page.locator('button[aria-label="Backspace"]')
        if backspace.is_visible():
            print("SUCCESS: Backspace button found with aria-label='Backspace'.")

            # Verify Icon
            if backspace.locator("svg").is_visible():
                print("SUCCESS: Icon SVG is visible inside the button.")
            else:
                print("WARNING: SVG not found inside button.")

            page.screenshot(path="verification_success.png")
        else:
            print("FAILURE: Backspace button not found.")
            page.screenshot(path="verification_failure.png")

    except Exception as e:
        print(f"Error during verification: {e}")
        page.screenshot(path="error_state.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_keypad_ux(page)
        finally:
            browser.close()
