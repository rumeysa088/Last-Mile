"""
Root entrypoint for Last-Mile synthetic demo seeding.
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from seed_demo import seed_demo_data

if __name__ == "__main__":
    seed_demo_data()
