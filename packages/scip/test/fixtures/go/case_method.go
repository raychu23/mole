package main

import "counterfixture/pkg/leaf"

func caseMethod() string {
	t := leaf.Thing{}
	return t.Method()
}
