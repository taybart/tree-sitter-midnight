# tree-sitter-erde

[Erde](https://erde-lang.github.io/) grammar for tree-sitter.

## Neovim

Build the parser and put it, along with the queries, on your `runtimepath`:

```sh
tree-sitter build -o ~/.config/nvim/parser/erde.so
mkdir -p ~/.config/nvim/queries/erde
cp queries/*.scm ~/.config/nvim/queries/erde/
```

Then register the filetype and start highlighting:

```lua
vim.filetype.add({ extension = { erde = 'erde' } })

vim.api.nvim_create_autocmd('FileType', {
  pattern = 'erde',
  callback = function() vim.treesitter.start() end,
})
```

## Development

```sh
tree-sitter generate   # regenerate src/parser.c after editing grammar.js
tree-sitter test       # corpus, highlight, and tag tests
tree-sitter parse path/to/file.erde
```

Most of the syntax is plain `grammar.js`. The [external scanner](/src/scanner.c)
handles the context-sensitive parts:

- Block strings / comments (`[==[ ... ]==]`), including interpolation inside
  block strings and nested block strings inside interpolations.
- Quoted string contents, so that `--` inside a string is never a comment.
- `(` on the same line as the preceding expression, which is a function call.
  On a new line, `(` starts a new statement (this mirrors the Erde compiler).
- `{` directly after `->` / `=>`, which is always a block (never a table).

## Acknowledgement

Forked from [tree-sitter-grammars/tree-sitter-lua](https://github.com/tree-sitter-grammars/tree-sitter-lua).
Its external scanner was initially based on:

- [Azganoth/tree-sitter-lua](https://github.com/Azganoth/tree-sitter-lua)
- [euclidianAce/tree-sitter-teal](https://github.com/euclidianAce/tree-sitter-teal)
