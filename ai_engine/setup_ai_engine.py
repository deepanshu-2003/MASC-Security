"""
MASC Security AI Engine - One-Click Setup Script
Run this on any new system to prepare the Python virtual environment.

Usage:
    python setup_ai_engine.py
"""

import subprocess
import sys
import os
import venv

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
VENV_DIR = os.path.join(SCRIPT_DIR, "venv")
REQUIREMENTS = os.path.join(SCRIPT_DIR, "requirements.txt")


def print_step(step, msg):
    print(f"\n[{step}] {msg}")
    print("-" * 50)


def main():
    print("=" * 50)
    print("  MASC Security — AI Engine Setup")
    print("=" * 50)
    print(f"Python version : {sys.version}")
    print(f"AI Engine dir  : {SCRIPT_DIR}")

    # Step 1: Create virtual environment
    print_step("1/3", "Creating Python virtual environment...")
    if os.path.exists(VENV_DIR):
        print("  [SKIP] 'venv' folder already exists. Delete it to recreate.")
    else:
        venv.create(VENV_DIR, with_pip=True)
        print("  [OK] Virtual environment created at: venv/")

    # Step 2: Determine pip path
    if sys.platform == "win32":
        pip_exe = os.path.join(VENV_DIR, "Scripts", "pip.exe")
        python_exe = os.path.join(VENV_DIR, "Scripts", "python.exe")
    else:
        pip_exe = os.path.join(VENV_DIR, "bin", "pip")
        python_exe = os.path.join(VENV_DIR, "bin", "python")

    # Step 3: Install requirements
    print_step("2/3", "Installing packages from requirements.txt...")
    if not os.path.exists(REQUIREMENTS):
        print("  [ERROR] requirements.txt not found!")
        sys.exit(1)

    result = subprocess.run(
        [pip_exe, "install", "-r", REQUIREMENTS],
        capture_output=False
    )
    if result.returncode != 0:
        print("\n  [ERROR] Package installation failed.")
        sys.exit(result.returncode)
    print("  [OK] All packages installed successfully.")

    # Step 4: Verify scikit-learn is importable
    print_step("3/3", "Verifying scikit-learn + numpy installation...")
    verify = subprocess.run(
        [python_exe, "-c", "import sklearn, numpy; print(f'sklearn {sklearn.__version__}, numpy {numpy.__version__}')"],
        capture_output=True,
        text=True
    )
    if verify.returncode == 0:
        print(f"  [OK] {verify.stdout.strip()}")
    else:
        print(f"  [ERROR] Verification failed: {verify.stderr}")
        sys.exit(1)

    print("\n" + "=" * 50)
    print("  Setup complete! AI Engine is ready.")
    print(f"  Python interpreter: {python_exe}")
    print("=" * 50)


if __name__ == "__main__":
    main()
