import os
import pytest

# Configure fast bcrypt hashing for test suite
os.environ["BCRYPT_ROUNDS"] = "4"
os.environ["TESTING"] = "1"
