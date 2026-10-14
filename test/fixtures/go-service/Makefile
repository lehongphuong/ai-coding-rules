.PHONY: test lint run

GOFLAGS := -mod=readonly

test:
	go test ./...

lint:
	golangci-lint run

run: test
	go run .
