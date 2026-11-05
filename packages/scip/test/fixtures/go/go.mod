module counterfixture

go 1.22

require github.com/example/greet v0.0.0-00010101000000-000000000000

replace github.com/example/greet => ./local/greet
