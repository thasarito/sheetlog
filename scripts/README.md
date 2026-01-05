# Verification Scripts

This directory contains scripts to verify UX changes.

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   playwright install chromium
   ```

2. Ensure the app is running:
   ```bash
   pnpm dev
   ```

## Scripts

### `verify_backspace_icon.py`

Verifies that the keypad backspace button uses an icon and has the correct `aria-label`.

**Note:** The script requires the user to be onboarded (past the "Let's get started" screen). If running in a clean environment, you may need to manually bypass onboarding or mock the authentication state.
