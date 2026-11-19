; Scopes
[
  (chunk)
  (block)
  (for_statement)
  (function_declaration)
  (class_method)
  (arrow_function)
  (catch_block)
  (catch_statement)
] @local.scope

; Definitions
(variable_declaration
  (variable_list
    (identifier) @local.definition))

(destructured_field
  name: (identifier) @local.definition)

(destructured_field
  key: (identifier) @local.definition
  !name)

(function_declaration
  name: (identifier) @local.definition)

(class_declaration
  name: (identifier) @local.definition)

(for_generic_clause
  (variable_list
    (identifier) @local.definition))

(for_numeric_clause
  name: (identifier) @local.definition)

(parameters
  (identifier) @local.definition)

(default_parameter
  name: (identifier) @local.definition)

(arrow_function
  parameters: (identifier) @local.definition)

(catch_block
  name: (identifier) @local.definition)

(catch_statement
  name: (identifier) @local.definition)

; References
(identifier) @local.reference
