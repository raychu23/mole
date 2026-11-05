// Package greet is a tiny local module, vendored into this fixture's vendor/ tree below, so the
// reader can be proven against a real `vendor/` dependency (one of the required test cases) without
// a network fetch of a public module.
package greet

// Greet is the function the vendored-module case calls across a vendored dependency.
func Greet() string { return "vendored-greet" }
