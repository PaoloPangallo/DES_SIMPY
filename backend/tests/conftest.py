import pytest
import asyncio
from typing import Any

class MockEmitter:
    def __init__(self):
        self.events = []

    def emit(self, event: dict):
        self.events.append(event)

@pytest.fixture
def mock_emitter():
    return MockEmitter()

@pytest.fixture
def event_loop():
    """Create an instance of the default event loop for each test case."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()
