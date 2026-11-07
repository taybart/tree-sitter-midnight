/**
 * @file Midnight grammar for tree-sitter
 * @author Munif Tanjim (original Lua grammar)
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Mirrors the operator precedence of the Erde reference compiler (erde/constants.erde).
const PREC = {
  ARROW: 0, // -> =>
  OR: 1, // ||
  AND: 2, // &&
  COMPARE: 3, // < > <= >= != ==
  BIT_OR: 4, // |
  BIT_XOR: 5, // ~
  BIT_AND: 6, // &
  BIT_SHIFT: 7, // << >>
  CONCAT: 8, // ..
  PLUS: 9, // + -
  MULTI: 10, // * / // %
  UNARY: 11, // ! # - ~
  POWER: 12, // ^
};

const ASSIGNMENT_OPERATORS = [
  '=',
  '||=',
  '&&=',
  '..=',
  '+=',
  '-=',
  '*=',
  '/=',
  '//=',
  '%=',
  '^=',
  '|=',
  '~=',
  '&=',
  '<<=',
  '>>=',
];

const list_seq = (rule, separator, trailing_separator = false) =>
  trailing_separator
    ? seq(rule, repeat(seq(separator, rule)), optional(separator))
    : seq(rule, repeat(seq(separator, rule)));

const escape_sequence = (standard_escape_chars) =>
  token.immediate(
    seq(
      '\\',
      choice(
        standard_escape_chars,
        /z\s*/,
        /[0-9]{1,3}/,
        /x[0-9a-fA-F]{2}/,
        /u\{[0-9a-fA-F]+\}/
      )
    )
  );

export default grammar({
  name: 'midnight',

  extras: ($) => [$.comment, /\s/],

  externals: ($) => [
    $._block_comment_start,
    $._block_comment_content,
    $._block_comment_end,

    $._block_string_start,
    $._block_string_content,
    $._block_string_end,

    $._single_quote_string_content,
    $._double_quote_string_content,

    // A '(' on the same line as the preceding token. Midnight only treats '(' as a
    // function call when it is on the same line as the callee, otherwise it
    // starts a new statement.
    $._call_open,

    // A '{' directly following '->' or '=>'. Midnight always parses this as a
    // block (never a table constructor).
    $._arrow_block_open,

    // `match` at the start of a match statement. `match` is a contextual
    // keyword, so the scanner only produces this when the next token can't
    // continue a name (ex. not `match = 1`, `match.x`, or a call `match(x)`).
    $._match_keyword,

    // Never valid in the grammar. When the scanner sees this as valid, the
    // parser is in error recovery.
    $._error_sentinel,
  ],

  supertypes: ($) => [$.statement, $.expression, $.variable],

  word: ($) => $.identifier,

  conflicts: ($) => [
    // `(a)` vs `(a) -> ...`
    [$.variable, $._parameter],
    [$.expression, $._vararg_parameter],
    // `{ a }` vs `{ a } -> ...`
    [$.variable, $._map_destructured_field],
    [$.variable, $.destructured_field],
    [$.field, $._map_destructured_field],
    // `a => { ... }` as a match arm vs an arrow function
    [$.variable, $.arrow_function],
  ],

  rules: {
    chunk: ($) =>
      seq(
        optional($.hash_bang_line),
        repeat($.statement),
        optional($.return_statement)
      ),

    hash_bang_line: (_) => /#!.*/,

    block: ($) =>
      seq('{', repeat($.statement), optional($.return_statement), '}'),
    _arrow_block: ($) =>
      seq(
        alias($._arrow_block_open, '{'),
        repeat($.statement),
        optional($.return_statement),
        '}'
      ),

    statement: ($) =>
      choice(
        $.empty_statement,
        $.assignment_statement,
        $.function_call,
        $.label_statement,
        $.break_statement,
        $.continue_statement,
        $.goto_statement,
        $.do_statement,
        $.while_statement,
        $.repeat_statement,
        $.if_statement,
        $.match_statement,
        $.for_statement,
        $.variable_declaration,
        $.function_declaration
      ),

    // return [explist | '(' explist ')'] [';']
    return_statement: ($) =>
      seq(
        'return',
        optional(
          choice(
            alias($._expression_list, $.expression_list),
            alias($._parenthesized_expression_list, $.expression_list)
          )
        ),
        optional(';')
      ),

    empty_statement: (_) => ';',

    // varlist ('=' | op'=') explist
    assignment_statement: ($) =>
      seq(
        alias($._variable_list, $.variable_list),
        field('operator', choice(...ASSIGNMENT_OPERATORS)),
        alias($._expression_list, $.expression_list)
      ),
    _variable_list: ($) => list_seq(field('name', $.variable), ','),

    label_statement: ($) => seq('::', $.identifier, '::'),

    break_statement: (_) => 'break',

    continue_statement: (_) => 'continue',

    goto_statement: ($) => seq('goto', $.identifier),

    do_statement: ($) => seq('do', field('body', $.block)),

    while_statement: ($) =>
      seq('while', field('condition', $.expression), field('body', $.block)),

    repeat_statement: ($) =>
      seq(
        'repeat',
        field('body', $.block),
        'until',
        field('condition', $.expression)
      ),

    if_statement: ($) =>
      seq(
        'if',
        field('condition', $.expression),
        field('consequence', $.block),
        repeat(field('alternative', $.elseif_statement)),
        optional(field('alternative', $.else_statement))
      ),
    elseif_statement: ($) =>
      seq(
        'elseif',
        field('condition', $.expression),
        field('consequence', $.block)
      ),
    else_statement: ($) => seq('else', field('body', $.block)),

    // Experimental (midnight w/ `-X match`), always parsed here since the
    // compiler is what enforces the experiment.
    // 'match' exp '{' {pattern {'|' pattern} ['if' exp] '=>' block [',']} '}'
    match_statement: ($) =>
      seq(
        alias($._match_keyword, 'match'),
        field('value', $.expression),
        '{',
        repeat(field('arm', $.match_arm)),
        '}'
      ),
    match_arm: ($) =>
      seq(
        list_seq(field('pattern', $._match_pattern), '|'),
        optional(seq('if', field('guard', $.expression))),
        '=>',
        field('body', choice($.block, alias($._arrow_block, $.block))),
        optional(',')
      ),
    // Patterns stop before `|` (and lower precedence operators), same as the
    // compiler, so `|` separates patterns.
    _match_pattern: ($) => prec.right(PREC.BIT_XOR, $.expression),

    for_statement: ($) =>
      seq(
        'for',
        field('clause', choice($.for_generic_clause, $.for_numeric_clause)),
        field('body', $.block)
      ),
    for_generic_clause: ($) =>
      seq(
        alias($._declaration_list, $.variable_list),
        'in',
        alias($._expression_list, $.expression_list)
      ),
    for_numeric_clause: ($) =>
      seq(
        field('name', $.identifier),
        field('operator', '='),
        field('start', $.expression),
        ',',
        field('end', $.expression),
        optional(seq(',', field('step', $.expression)))
      ),

    // ('local' | 'global' | 'module') declist ['=' explist]
    variable_declaration: ($) =>
      seq(
        field('scope', $.scope),
        alias($._declaration_list, $.variable_list),
        optional(
          seq(
            field('operator', '='),
            alias($._expression_list, $.expression_list)
          )
        )
      ),
    _declaration_list: ($) => list_seq(field('name', $._declaration), ','),
    _declaration: ($) =>
      choice($.identifier, $.array_destructure, $.map_destructure),

    scope: (_) => choice('local', 'global', 'module'),

    // '[' name ['=' exp] {',' name ['=' exp]} [','] ']'
    array_destructure: ($) =>
      seq('[', list_seq($.destructured_field, ',', true), ']'),
    // '{' key [':' name] ['=' exp] {',' ...} [','] '}'
    map_destructure: ($) =>
      seq(
        '{',
        list_seq(alias($._map_destructured_field, $.destructured_field), ',', true),
        '}'
      ),
    destructured_field: ($) =>
      seq(
        field('name', $.identifier),
        optional(seq('=', field('default', $.expression)))
      ),
    _map_destructured_field: ($) =>
      seq(
        field('key', $.identifier),
        optional(seq(':', field('name', $.identifier))),
        optional(seq('=', field('default', $.expression)))
      ),

    // ['local' | 'global' | 'module'] 'function' funcname params block
    function_declaration: ($) =>
      choice(
        seq('function', field('name', $._function_name), $._function_body),
        seq(
          field('scope', $.scope),
          'function',
          field('name', $.identifier),
          $._function_body
        )
      ),
    // funcname ::= Name {'.' Name} [':' Name]
    _function_name: ($) =>
      choice(
        $._function_name_prefix_expression,
        alias(
          $._function_name_method_index_expression,
          $.method_index_expression
        )
      ),
    _function_name_prefix_expression: ($) =>
      choice(
        $.identifier,
        alias($._function_name_dot_index_expression, $.dot_index_expression)
      ),
    _function_name_dot_index_expression: ($) =>
      seq(
        field('table', $._function_name_prefix_expression),
        '.',
        field('field', $.identifier)
      ),
    _function_name_method_index_expression: ($) =>
      seq(
        field('table', $._function_name_prefix_expression),
        ':',
        field('method', $.identifier)
      ),
    _function_body: ($) =>
      seq(field('parameters', $.parameters), field('body', $.block)),

    // '(' [param {',' param}] [',' '...' [Name]] [','] ')'
    parameters: ($) =>
      seq(
        '(',
        optional(
          choice(
            seq(
              list_seq($._parameter, ','),
              optional(seq(',', $._vararg_parameter)),
              optional(',')
            ),
            seq($._vararg_parameter, optional(','))
          )
        ),
        ')'
      ),
    _parameter: ($) =>
      choice(
        $.identifier,
        $.array_destructure,
        $.map_destructure,
        $.default_parameter
      ),
    default_parameter: ($) =>
      seq(
        field('name', choice($.identifier, $.array_destructure, $.map_destructure)),
        '=',
        field('value', $.expression)
      ),
    _vararg_parameter: ($) =>
      seq($.vararg_expression, optional(field('name', $.identifier))),

    _expression_list: ($) => list_seq(field('value', $.expression), ','),
    // '(' exp ',' exp {',' exp} [','] ')'
    _parenthesized_expression_list: ($) =>
      seq(
        '(',
        field('value', $.expression),
        repeat1(seq(',', field('value', $.expression))),
        optional(','),
        ')'
      ),

    expression: ($) =>
      choice(
        $.nil,
        $.false,
        $.true,
        $.number,
        $.string,
        $.vararg_expression,
        $.arrow_function,
        $.variable,
        $.function_call,
        $.parenthesized_expression,
        $.table_constructor,
        $.binary_expression,
        $.unary_expression,
        $.markup_element
      ),

    nil: (_) => 'nil',
    false: (_) => 'false',
    true: (_) => 'true',

    number: (_) => {
      const decimal = /([0-9]+(\.[0-9]+)?|\.[0-9]+)([eE][+-]?[0-9]+)?/;
      const hex =
        /0[xX]([0-9a-fA-F]+(\.[0-9a-fA-F]+)?|\.[0-9a-fA-F]+)([pP][+-]?[0-9]+)?/;
      const binary = /0[bB][01]+/;
      return token(choice(decimal, hex, binary));
    },

    string: ($) =>
      choice(
        seq(
          field('start', "'"),
          repeat(
            choice(
              alias($._single_quote_string_content, $.string_content),
              alias($._single_quote_escape_sequence, $.escape_sequence)
            )
          ),
          field('end', "'")
        ),
        seq(
          field('start', '"'),
          repeat(
            choice(
              alias($._double_quote_string_content, $.string_content),
              $.escape_sequence,
              $.interpolation
            )
          ),
          field('end', '"')
        ),
        seq(
          field('start', alias($._block_string_start, '[[')),
          repeat(
            choice(
              alias($._block_string_content, $.string_content),
              $.interpolation
            )
          ),
          field('end', alias($._block_string_end, ']]'))
        )
      ),

    // '{' exp '}'
    interpolation: ($) => seq('{', $.expression, '}'),

    // Double quote strings additionally allow escaping interpolation braces.
    escape_sequence: (_) => escape_sequence(/[\nabfnrtv\\'"{}]/),
    _single_quote_escape_sequence: (_) => escape_sequence(/[\nabfnrtv\\'"]/),

    vararg_expression: (_) => '...',

    // (params | Name | destructure) ('->' | '=>') (block | '(' explist ')' | exp)
    arrow_function: ($) =>
      prec.right(
        PREC.ARROW,
        seq(
          field(
            'parameters',
            choice(
              $.parameters,
              $.identifier,
              $.array_destructure,
              $.map_destructure
            )
          ),
          field('operator', choice('->', '=>')),
          field(
            'body',
            choice(
              alias($._arrow_block, $.block),
              alias($._parenthesized_expression_list, $.expression_list),
              $.expression
            )
          )
        )
      ),

    // Strings may also start an index chain, ex) `'abc':upper()`
    _prefix_expression: ($) =>
      prec(
        1,
        choice(
          $.variable,
          $.function_call,
          $.parenthesized_expression,
          $.string
        )
      ),

    variable: ($) =>
      choice($.identifier, $.bracket_index_expression, $.dot_index_expression),
    bracket_index_expression: ($) =>
      seq(
        field('table', $._prefix_expression),
        '[',
        field('field', $.expression),
        ']'
      ),
    dot_index_expression: ($) =>
      seq(
        field('table', $._prefix_expression),
        '.',
        field('field', $.identifier)
      ),

    function_call: ($) =>
      choice(
        seq(
          field('name', $._prefix_expression),
          field('arguments', $.arguments)
        ),
        // Unlike plain calls, method call arguments may start on a new line.
        seq(
          field('name', $.method_index_expression),
          field('arguments', alias($._method_arguments, $.arguments))
        )
      ),
    method_index_expression: ($) =>
      seq(
        field('table', $._prefix_expression),
        ':',
        field('method', $.identifier)
      ),
    arguments: ($) =>
      seq(
        alias($._call_open, '('),
        optional(list_seq($.expression, ',', true)),
        ')'
      ),
    _method_arguments: ($) =>
      seq(
        choice(alias($._call_open, '('), '('),
        optional(list_seq($.expression, ',', true)),
        ')'
      ),

    parenthesized_expression: ($) => seq('(', $.expression, ')'),

    // '{' [field {',' field} [',']] '}'
    table_constructor: ($) =>
      seq('{', optional(list_seq($.field, ',', true)), '}'),
    field: ($) =>
      choice(
        seq(
          '[',
          field('name', $.expression),
          ']',
          field('operator', '='),
          field('value', $.expression)
        ),
        seq(
          field('name', $.identifier),
          field('operator', '='),
          field('value', $.expression)
        ),
        field('value', $.expression)
      ),

    binary_expression: ($) =>
      choice(
        ...[
          ['||', PREC.OR],
          ['&&', PREC.AND],
          ['<', PREC.COMPARE],
          ['<=', PREC.COMPARE],
          ['==', PREC.COMPARE],
          ['!=', PREC.COMPARE],
          ['>=', PREC.COMPARE],
          ['>', PREC.COMPARE],
          ['|', PREC.BIT_OR],
          ['~', PREC.BIT_XOR],
          ['&', PREC.BIT_AND],
          ['<<', PREC.BIT_SHIFT],
          ['>>', PREC.BIT_SHIFT],
          ['..', PREC.CONCAT],
          ['+', PREC.PLUS],
          ['-', PREC.PLUS],
          ['*', PREC.MULTI],
          ['/', PREC.MULTI],
          ['//', PREC.MULTI],
          ['%', PREC.MULTI],
        ].map(([operator, precedence]) =>
          prec.left(
            precedence,
            seq(
              field('left', $.expression),
              field('operator', operator),
              field('right', $.expression)
            )
          )
        ),
        prec.right(
          PREC.POWER,
          seq(
            field('left', $.expression),
            field('operator', '^'),
            field('right', $.expression)
          )
        )
      ),

    unary_expression: ($) =>
      prec.left(
        PREC.UNARY,
        seq(
          field('operator', choice('!', '#', '-', '~')),
          field('operand', $.expression)
        )
      ),

    // Experimental (midnight w/ `-X markup`), always parsed here since the
    // compiler is what enforces the experiment. An element can only start
    // where an expression can, so `a < b` is still a comparison.
    //
    //   <div class="x" id={id}>text {expr}</div>
    //   <Card {...props} title="t"/>
    //   <>fragment</>
    markup_element: ($) =>
      choice(
        seq(
          field('open_tag', $.markup_opening_element),
          repeat($._markup_child),
          field('close_tag', $.markup_closing_element)
        ),
        // <style> / <script> content is raw text (like HTML)
        seq(
          field(
            'open_tag',
            alias($._markup_raw_text_opening_element, $.markup_opening_element)
          ),
          optional($.markup_raw_text),
          field('close_tag', $.markup_closing_element)
        ),
        $.markup_self_closing_element
      ),
    _markup_raw_text_opening_element: ($) =>
      seq(
        '<',
        field('name', alias(choice('style', 'script'), $.markup_tag_name)),
        repeat(field('attribute', $._markup_attribute)),
        '>'
      ),
    // up to the closing tag (anything but `</`)
    markup_raw_text: (_) => token(prec(1, /([^<]|<[^\/])+/)),
    markup_opening_element: ($) =>
      seq(
        '<',
        optional(
          seq(
            field('name', $.markup_tag_name),
            repeat(field('attribute', $._markup_attribute))
          )
        ),
        '>'
      ),
    markup_closing_element: ($) =>
      seq('</', optional(field('name', $.markup_tag_name)), '>'),
    markup_self_closing_element: ($) =>
      seq(
        '<',
        field('name', $.markup_tag_name),
        repeat(field('attribute', $._markup_attribute)),
        '/>'
      ),

    // Lowercase (or w/ `-` / `:`) names are HTML elements, others are
    // (dotted) names of components, ex) `ui.Button`.
    markup_tag_name: (_) => /[a-zA-Z_][a-zA-Z0-9_\-.:]*/,

    _markup_attribute: ($) => choice($.markup_attribute, $.markup_spread_attribute),
    // ex) `hx-post="/x"`, `@click={f}`, `x-on:click.prevent`, `disabled`
    markup_attribute: ($) =>
      seq(
        field('name', $.markup_attribute_name),
        optional(
          seq('=', field('value', choice($.string, $.markup_expression)))
        )
      ),
    markup_attribute_name: (_) => /[a-zA-Z_@:][a-zA-Z0-9_\-.:]*/,
    markup_spread_attribute: ($) => seq('{', '...', $.expression, '}'),

    _markup_child: ($) => choice($.markup_text, $.markup_element, $.markup_expression),
    markup_text: (_) => /[^{}<\s]([^{}<]*[^{}<\s])?/,
    // `{}` (or w/ only a comment) is allowed, same as the compiler.
    markup_expression: ($) => seq('{', optional($.expression), '}'),

    identifier: (_) => /[a-zA-Z_][a-zA-Z0-9_]*/,

    comment: ($) =>
      choice(
        seq(
          field('start', '--'),
          field('content', alias(/[^\r\n]*/, $.comment_content))
        ),
        seq(
          field('start', alias($._block_comment_start, '[[')),
          optional(
            field('content', alias($._block_comment_content, $.comment_content))
          ),
          field('end', alias($._block_comment_end, ']]'))
        )
      ),
  },
});
