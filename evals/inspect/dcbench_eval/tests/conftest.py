import sys
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = EVAL_DIR.parents[1]
sys.path.insert(0, str(EVAL_DIR))
