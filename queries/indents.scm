[
  (block)
  (match_statement)
  (table_constructor)
  (arguments)
  (parameters)
  (array_destructure)
  (map_destructure)
  (parenthesized_expression)
] @indent.begin

[
  "}"
  ")"
  "]"
] @indent.end @indent.branch

(comment) @indent.auto

(string) @indent.auto

; JSX (go-erde `-X jsx`)
[
  (jsx_element)
  (jsx_opening_element)
  (jsx_self_closing_element)
] @indent.begin

(jsx_closing_element) @indent.branch

(jsx_opening_element
  ">" @indent.branch)

(jsx_self_closing_element
  "/>" @indent.branch)
