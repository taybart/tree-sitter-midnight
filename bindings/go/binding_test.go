package tree_sitter_erde_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_erde "github.com/taybart/tree-sitter-erde/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_erde.Language())
	if language == nil {
		t.Errorf("Error loading Erde grammar")
	}
}
