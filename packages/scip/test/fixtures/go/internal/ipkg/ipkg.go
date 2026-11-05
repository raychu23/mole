// Package ipkg lives under internal/, so case_internal.go proves scip-go resolves an internal/
// package import the same way it resolves a regular one.
package ipkg

// InternalHelper is called from case_internal.go.
func InternalHelper() string { return "internal" }
