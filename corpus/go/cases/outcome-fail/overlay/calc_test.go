package calc

import "testing"

func TestAdd(t *testing.T) {
	if Add(2, 3) != 5 {
		t.Fatalf("expected 5, got %d", Add(2, 3))
	}
}

func TestMultiply(t *testing.T) {
	// Wrong on purpose: this test fails (Multiply(2, 3) is 6, not 9)
	if Multiply(2, 3) != 9 {
		t.Fatalf("expected 9, got %d", Multiply(2, 3))
	}
}
