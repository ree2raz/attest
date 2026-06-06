from src.calc import add, multiply


def test_add():
    assert add(2, 3) == 5


def test_multiply():
    # Wrong on purpose: this test fails (multiply(2, 3) is 6, not 9)
    assert multiply(2, 3) == 9
