[
  (block)
  (match_statement)
  (if_expression)
  (match_expression)
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

; Markup
[
  (markup_element)
  (markup_opening_element)
  (markup_self_closing_element)
] @indent.begin

(markup_closing_element) @indent.branch

(markup_opening_element
  ">" @indent.branch)

(markup_self_closing_element
  "/>" @indent.branch)
