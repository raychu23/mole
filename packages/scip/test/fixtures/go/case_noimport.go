package main

func localFn() string { return "local" }

func caseNoImport() string {
	return localFn()
}
