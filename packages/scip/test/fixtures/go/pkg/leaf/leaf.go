// Package leaf is imported by every "plain/aliased/dot/blank import" case below.
package leaf

// Helper is the plain exported function other packages import and call.
func Helper() string { return "leaf" }

// Thing has a method (Method) used by the method-call case.
type Thing struct{}

func (Thing) Method() string { return "method" }
