package tree_sitter_midnight_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_midnight "github.com/taybart/tree-sitter-midnight/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_midnight.Language())
	if language == nil {
		t.Errorf("Error loading Midnight grammar")
	}
}
