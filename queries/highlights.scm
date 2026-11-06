; Keywords
"return" @keyword.return

[
  "goto"
  "in"
] @keyword

(scope) @keyword.modifier

[
  (break_statement)
  (continue_statement)
] @keyword.repeat

"do" @keyword

[
  "while"
  "repeat"
  "until"
  "for"
] @keyword.repeat

[
  "if"
  "elseif"
  "else"
  "match"
] @keyword.conditional

"function" @keyword.function

(label_statement) @label

; Operators
(binary_expression
  operator: _ @operator)

(unary_expression
  operator: _ @operator)

(assignment_statement
  operator: _ @operator)

[
  "="
  "->"
  "=>"
] @operator

; Punctuations
[
  ";"
  ":"
  "::"
  ","
  "."
] @punctuation.delimiter

; Brackets
[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket

(interpolation
  [
    "{"
    "}"
  ] @punctuation.special)

; Variables
(identifier) @variable

; `_` (match anything) match arm
(match_arm
  pattern: (identifier) @character.special
  (#eq? @character.special "_"))

(match_arm
  "|" @punctuation.delimiter)

((identifier) @variable.builtin
  (#eq? @variable.builtin "self"))

((identifier) @module.builtin
  (#any-of? @module.builtin "_G" "_ENV"))

; Constants
((identifier) @constant
  (#match? @constant "^[A-Z][A-Z_0-9]*$"))

(vararg_expression) @constant

(nil) @constant.builtin

[
  (false)
  (true)
] @boolean

; Tables
(field
  name: (identifier) @variable.member)

(dot_index_expression
  field: (identifier) @variable.member)

(table_constructor
  [
    "{"
    "}"
  ] @constructor)

(destructured_field
  key: (identifier) @variable.member)

; Functions
(parameters
  (identifier) @variable.parameter)

(parameters
  (default_parameter
    name: (identifier) @variable.parameter))

(parameters
  (vararg_expression)
  .
  (identifier) @variable.parameter)

(arrow_function
  parameters: (identifier) @variable.parameter)

(function_declaration
  name: [
    (identifier) @function
    (dot_index_expression
      field: (identifier) @function)
  ])

(function_declaration
  name: (method_index_expression
    method: (identifier) @function.method))

(assignment_statement
  (variable_list
    .
    name: [
      (identifier) @function
      (dot_index_expression
        field: (identifier) @function)
    ])
  (expression_list
    .
    value: (arrow_function)))

(variable_declaration
  (variable_list
    .
    name: (identifier) @function)
  (expression_list
    .
    value: (arrow_function)))

(table_constructor
  (field
    name: (identifier) @function
    value: (arrow_function)))

(function_call
  name: [
    (identifier) @function.call
    (dot_index_expression
      field: (identifier) @function.call)
    (method_index_expression
      method: (identifier) @function.method.call)
  ])

(function_call
  (identifier) @function.builtin
  (#any-of? @function.builtin
    "assert" "collectgarbage" "dofile" "error" "getfenv" "getmetatable" "ipairs" "load" "loadfile"
    "loadstring" "module" "next" "pairs" "pcall" "print" "rawequal" "rawget" "rawlen" "rawset"
    "require" "select" "setfenv" "setmetatable" "tonumber" "tostring" "type" "unpack" "xpcall"))

; Others
(comment) @comment @spell

((comment) @comment.documentation
  (#match? @comment.documentation "^---"))

(hash_bang_line) @keyword.directive

(number) @number

(string) @string

(escape_sequence) @string.escape

; Markup (go-erde `-X markup`)
(markup_tag_name) @tag

; HTML elements (lowercase, or w/ `-` / `:`); other tags are components
((markup_tag_name) @tag.builtin
  (#match? @tag.builtin "^([a-z][^.]*|[^.]*[-:][^.]*)$"))

(markup_attribute_name) @tag.attribute

(markup_opening_element
  [
    "<"
    ">"
  ] @tag.delimiter)

(markup_closing_element
  [
    "</"
    ">"
  ] @tag.delimiter)

(markup_self_closing_element
  [
    "<"
    "/>"
  ] @tag.delimiter)

(markup_attribute
  "=" @operator)

[
  (markup_expression
    [
      "{"
      "}"
    ] @punctuation.special)
  (markup_spread_attribute
    [
      "{"
      "}"
    ] @punctuation.special)
]

(markup_spread_attribute
  "..." @operator)

(markup_text) @none @spell
