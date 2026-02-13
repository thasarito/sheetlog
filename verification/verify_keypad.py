from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Go to the test page
    page.goto("http://localhost:6882/keypad-test")

    # Wait for the keypad to be visible
    expect(page.get_by_role("button", name="1", exact=True)).to_be_visible()

    # Click some buttons
    page.get_by_role("button", name="1", exact=True).click()
    page.get_by_role("button", name="2", exact=True).click()
    page.get_by_role("button", name="3", exact=True).click()

    # Verify the value updated (using locator for the display div)
    # The display div has class "text-4xl"
    display = page.locator(".text-4xl")
    expect(display).to_have_text("123")

    # Check for the delete button using the new ARIA label
    delete_button = page.get_by_role("button", name="Delete")
    expect(delete_button).to_be_visible()

    # Focus on a button to test focus styles
    page.get_by_role("button", name="5", exact=True).focus()

    # Take a screenshot
    page.screenshot(path="verification/keypad.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
