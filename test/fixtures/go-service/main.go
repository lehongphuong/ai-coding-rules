package main

import "fmt"

func Greeting(name string) string {
	return fmt.Sprintf("hello, %s", name)
}

func main() {
	fmt.Println(Greeting("world"))
}
