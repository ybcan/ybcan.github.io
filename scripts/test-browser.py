"""Run the complete inherited browser suite using installed system or Playwright Chromium."""
from pathlib import Path
import os
import subprocess
import sys
from playwright.sync_api import sync_playwright

env = os.environ.copy()
if not env.get('CHROMIUM_PATH'):
    if Path('/usr/bin/chromium').exists():
        env['CHROMIUM_PATH'] = '/usr/bin/chromium'
    else:
        with sync_playwright() as p:
            env['CHROMIUM_PATH'] = p.chromium.executable_path
raise SystemExit(subprocess.call([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'reliability_browser.py'], env=env))
