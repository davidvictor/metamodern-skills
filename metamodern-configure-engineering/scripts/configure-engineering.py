#!/usr/bin/env python3
# Managed by metamodern-configure-engineering
"""Plan by default; use --apply to install a preflighted profile."""
import sys
sys.dont_write_bytecode = True
from engineering_profile import main

if __name__ == "__main__":
    raise SystemExit(main("configure"))
