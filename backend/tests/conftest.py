"""Conftest for pytest - shared fixtures."""

import pytest
import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"
