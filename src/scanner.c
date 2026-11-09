#include "tree_sitter/alloc.h"
#include "tree_sitter/parser.h"

#include <string.h>
#include <wctype.h>

enum TokenType {
  BLOCK_COMMENT_START,
  BLOCK_COMMENT_CONTENT,
  BLOCK_COMMENT_END,

  BLOCK_STRING_START,
  BLOCK_STRING_CONTENT,
  BLOCK_STRING_END,

  SINGLE_QUOTE_STRING_CONTENT,
  DOUBLE_QUOTE_STRING_CONTENT,

  CALL_OPEN,

  ARROW_BLOCK_OPEN,

  MATCH_KEYWORD,
  MATCH_EXPRESSION_KEYWORD,

  MARKUP_SCRIPT_RAW_TEXT,
  MARKUP_STYLE_RAW_TEXT,

  ERROR_SENTINEL,
};

// Block strings may nest through interpolation, ex) `[[ { [=[ ]=] } ]]`, so we
// keep a stack of their levels (number of '=').
#define MAX_BLOCK_STRING_DEPTH 64

typedef struct {
  uint8_t block_comment_level;
  uint8_t block_string_depth;
  uint8_t block_string_levels[MAX_BLOCK_STRING_DEPTH];
} Scanner;

static inline void consume(TSLexer *lexer) { lexer->advance(lexer, false); }

static inline void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

static inline bool consume_char(char c, TSLexer *lexer) {
  if (lexer->lookahead != c) {
    return false;
  }

  consume(lexer);
  return true;
}

static inline uint8_t consume_and_count_char(char c, TSLexer *lexer) {
  uint8_t count = 0;
  while (lexer->lookahead == c) {
    ++count;
    consume(lexer);
  }
  return count;
}

void *tree_sitter_midnight_external_scanner_create() {
  return ts_calloc(1, sizeof(Scanner));
}

void tree_sitter_midnight_external_scanner_destroy(void *payload) {
  ts_free(payload);
}

unsigned tree_sitter_midnight_external_scanner_serialize(void *payload, char *buffer) {
  Scanner *scanner = (Scanner *)payload;
  buffer[0] = (char)scanner->block_comment_level;
  buffer[1] = (char)scanner->block_string_depth;
  memcpy(&buffer[2], scanner->block_string_levels, scanner->block_string_depth);
  return 2 + scanner->block_string_depth;
}

void tree_sitter_midnight_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  Scanner *scanner = (Scanner *)payload;
  memset(scanner, 0, sizeof(Scanner));

  if (length < 2) {
    return;
  }

  scanner->block_comment_level = (uint8_t)buffer[0];
  scanner->block_string_depth = (uint8_t)buffer[1];
  memcpy(scanner->block_string_levels, &buffer[2], scanner->block_string_depth);
}

// '[' {'='} '['
static bool scan_block_start(TSLexer *lexer, uint8_t *level) {
  if (consume_char('[', lexer)) {
    uint8_t count = consume_and_count_char('=', lexer);

    if (consume_char('[', lexer)) {
      *level = count;
      return true;
    }
  }

  return false;
}

// ']' {'='} ']'
static bool scan_block_end(TSLexer *lexer, uint8_t level) {
  if (consume_char(']', lexer)) {
    uint8_t count = consume_and_count_char('=', lexer);
    return count == level && consume_char(']', lexer);
  }

  return false;
}

static inline uint8_t block_string_level(Scanner *scanner) {
  return scanner->block_string_depth > 0
    ? scanner->block_string_levels[scanner->block_string_depth - 1]
    : 0;
}

static bool scan_block_comment_content(Scanner *scanner, TSLexer *lexer) {
  bool has_content = false;

  while (!lexer->eof(lexer)) {
    if (lexer->lookahead == ']') {
      lexer->mark_end(lexer);

      if (scan_block_end(lexer, scanner->block_comment_level)) {
        return has_content;
      }
    } else {
      consume(lexer);
    }

    has_content = true;
  }

  lexer->mark_end(lexer);
  return has_content;
}

// Block string content stops at an (unescaped) interpolation or at the closing
// quote matching the opening level.
static bool scan_block_string_content(Scanner *scanner, TSLexer *lexer) {
  uint8_t level = block_string_level(scanner);
  bool has_content = false;

  while (!lexer->eof(lexer)) {
    if (lexer->lookahead == '{') {
      break;
    } else if (lexer->lookahead == '\\') {
      consume(lexer);

      if (lexer->lookahead == '{' || lexer->lookahead == '}') {
        consume(lexer);
      }
    } else if (lexer->lookahead == ']') {
      lexer->mark_end(lexer);

      if (scan_block_end(lexer, level)) {
        return has_content;
      }
    } else {
      consume(lexer);
    }

    has_content = true;
  }

  lexer->mark_end(lexer);
  return has_content;
}

// Quoted string content stops at escapes (lexed by the grammar), the closing
// quote, newlines (unterminated string), and (for double quotes) interpolation.
static bool scan_quote_string_content(TSLexer *lexer, char quote) {
  bool has_content = false;

  while (!lexer->eof(lexer)) {
    int32_t c = lexer->lookahead;

    if (c == quote || c == '\\' || c == '\n' || (quote == '"' && c == '{')) {
      break;
    }

    consume(lexer);
    has_content = true;
  }

  lexer->mark_end(lexer);
  return has_content;
}

static inline bool is_identifier_char(int32_t c) { return iswalnum(c) || c == '_'; }

// scan_match scans `match` as a keyword, unless it is followed by something
// that continues a name (same as midnight's isMatchStatement):
//
//   match = 1, match, y = ..., match.x, match[i], match:f(), match += 1, match(x)
//
// `match (x) {` is still a match statement.
static bool scan_match(TSLexer *lexer) {
  for (const char *c = "match"; *c; c++) {
    if (!consume_char(*c, lexer)) {
      return false;
    }
  }
  if (is_identifier_char(lexer->lookahead)) {
    return false;
  }
  lexer->mark_end(lexer);
  lexer->result_symbol = MATCH_KEYWORD;

  while (iswspace(lexer->lookahead)) {
    consume(lexer);
  }

  switch (lexer->lookahead) {
    case '=':
    case ',':
    case '[':
    case ':':
      return false;
    case '.':
      // `match ...` (varargs) vs `match.x` / `match ..= x`
      consume(lexer);
      return consume_char('.', lexer) && consume_char('.', lexer);
    case '(': {
      // `match(x)` is a call, `match (x) {` is a match statement.
      unsigned depth = 0;
      do {
        if (lexer->eof(lexer)) {
          return false;
        }
        if (lexer->lookahead == '\'' || lexer->lookahead == '"') {
          int32_t quote = lexer->lookahead;
          consume(lexer);
          while (!lexer->eof(lexer) && lexer->lookahead != quote && lexer->lookahead != '\n') {
            if (lexer->lookahead == '\\') {
              consume(lexer);
            }
            consume(lexer);
          }
        } else if (lexer->lookahead == '(') {
          depth++;
        } else if (lexer->lookahead == ')') {
          depth--;
        }
        consume(lexer);
      } while (depth > 0);

      while (iswspace(lexer->lookahead)) {
        consume(lexer);
      }
      return lexer->lookahead == '{';
    }
  }

  // Assignment operators (`match += 1`, `match //= 2`), but not unary
  // operators (`match -x {`).
  for (int i = 0; i < 2 && lexer->lookahead > 0 && lexer->lookahead < 128 && strchr("+-*/%^|&~<>", lexer->lookahead); i++) {
    consume(lexer);
  }
  return lexer->lookahead != '=';
}

// scan_match_expression scans `match` as the keyword of a match expression
// (where an expression is expected). Same as midnight's isMatchExpression
// (w/o looking for the arm): the subject starts on the same line, w/ a name,
// number, string, or `(...)` followed by `{`. So `match - 1`, `match + x`, and
// `local y = match` (the next statement on the next line) stay names.
static bool scan_match_expression(TSLexer *lexer) {
  for (const char *c = "match"; *c; c++) {
    if (!consume_char(*c, lexer)) {
      return false;
    }
  }
  if (is_identifier_char(lexer->lookahead)) {
    return false;
  }
  lexer->mark_end(lexer);
  lexer->result_symbol = MATCH_EXPRESSION_KEYWORD;

  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
    consume(lexer);
  }

  int32_t c = lexer->lookahead;
  if (iswalpha(c) || c == '_' || iswdigit(c) || c == '\'' || c == '"') {
    return true;
  }
  if (c != '(') {
    return false;
  }
  // `match(x)` is a call, `match (x) {` is a match expression.
  unsigned depth = 0;
  do {
    if (lexer->eof(lexer)) {
      return false;
    }
    if (lexer->lookahead == '\'' || lexer->lookahead == '"') {
      int32_t quote = lexer->lookahead;
      consume(lexer);
      while (!lexer->eof(lexer) && lexer->lookahead != quote && lexer->lookahead != '\n') {
        if (lexer->lookahead == '\\') {
          consume(lexer);
        }
        consume(lexer);
      }
    } else if (lexer->lookahead == '(') {
      depth++;
    } else if (lexer->lookahead == ')') {
      depth--;
    }
    consume(lexer);
  } while (depth > 0);

  while (iswspace(lexer->lookahead)) {
    consume(lexer);
  }
  return lexer->lookahead == '{';
}

// scan_raw_text scans the content of a <script> / <style> up to (not including)
// `</` + tag, like midnight's markupRawText. Empty content is no token.
static bool scan_raw_text(TSLexer *lexer, const char *tag) {
  bool has_content = false;

  while (!lexer->eof(lexer)) {
    if (lexer->lookahead == '<') {
      lexer->mark_end(lexer);
      consume(lexer);
      if (consume_char('/', lexer)) {
        const char *c = tag;
        while (*c && consume_char(*c, lexer)) {
          c++;
        }
        if (!*c) {
          return has_content;
        }
      }
      has_content = true;
      continue;
    }
    consume(lexer);
    has_content = true;
  }

  // unterminated, take the rest
  lexer->mark_end(lexer);
  return has_content;
}

bool tree_sitter_midnight_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  Scanner *scanner = (Scanner *)payload;
  bool in_error_recovery = valid_symbols[ERROR_SENTINEL];

  if (!in_error_recovery) {
    if (valid_symbols[MARKUP_SCRIPT_RAW_TEXT] || valid_symbols[MARKUP_STYLE_RAW_TEXT]) {
      bool script = valid_symbols[MARKUP_SCRIPT_RAW_TEXT];
      lexer->result_symbol = script ? MARKUP_SCRIPT_RAW_TEXT : MARKUP_STYLE_RAW_TEXT;
      if (scan_raw_text(lexer, script ? "script" : "style")) {
        return true;
      }
      // empty: fall through, the closing tag is lexed by the grammar
      return false;
    }

    // Inside strings: never skip whitespace or look for comments.
    if (valid_symbols[BLOCK_STRING_END] || valid_symbols[BLOCK_STRING_CONTENT]) {
      if (valid_symbols[BLOCK_STRING_END] && scan_block_end(lexer, block_string_level(scanner))) {
        if (scanner->block_string_depth > 0) {
          --scanner->block_string_depth;
        }

        lexer->result_symbol = BLOCK_STRING_END;
        return true;
      }

      if (valid_symbols[BLOCK_STRING_CONTENT] && scan_block_string_content(scanner, lexer)) {
        lexer->result_symbol = BLOCK_STRING_CONTENT;
        return true;
      }

      return false;
    }

    if (valid_symbols[SINGLE_QUOTE_STRING_CONTENT]) {
      lexer->result_symbol = SINGLE_QUOTE_STRING_CONTENT;
      return scan_quote_string_content(lexer, '\'');
    }

    if (valid_symbols[DOUBLE_QUOTE_STRING_CONTENT]) {
      lexer->result_symbol = DOUBLE_QUOTE_STRING_CONTENT;
      return scan_quote_string_content(lexer, '"');
    }

    if (valid_symbols[BLOCK_COMMENT_END] || valid_symbols[BLOCK_COMMENT_CONTENT]) {
      if (valid_symbols[BLOCK_COMMENT_END] && scan_block_end(lexer, scanner->block_comment_level)) {
        lexer->result_symbol = BLOCK_COMMENT_END;
        return true;
      }

      if (valid_symbols[BLOCK_COMMENT_CONTENT] && scan_block_comment_content(scanner, lexer)) {
        lexer->result_symbol = BLOCK_COMMENT_CONTENT;
        return true;
      }

      return false;
    }
  }

  // Skip horizontal whitespace only, so we know whether a '(' follows on the
  // same line.
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t' || lexer->lookahead == '\r') {
    skip(lexer);
  }

  if (!in_error_recovery && valid_symbols[CALL_OPEN] && consume_char('(', lexer)) {
    lexer->result_symbol = CALL_OPEN;
    return true;
  }

  while (iswspace(lexer->lookahead)) {
    skip(lexer);
  }

  if (!in_error_recovery && valid_symbols[ARROW_BLOCK_OPEN] && consume_char('{', lexer)) {
    lexer->result_symbol = ARROW_BLOCK_OPEN;
    return true;
  }

  if (!in_error_recovery && valid_symbols[MATCH_KEYWORD] && lexer->lookahead == 'm') {
    return scan_match(lexer);
  }

  if (!in_error_recovery && valid_symbols[MATCH_EXPRESSION_KEYWORD] && lexer->lookahead == 'm') {
    return scan_match_expression(lexer);
  }

  if (!in_error_recovery && valid_symbols[BLOCK_STRING_START]) {
    uint8_t level;

    if (scan_block_start(lexer, &level)) {
      if (scanner->block_string_depth == MAX_BLOCK_STRING_DEPTH) {
        return false;
      }

      scanner->block_string_levels[scanner->block_string_depth++] = level;
      lexer->result_symbol = BLOCK_STRING_START;
      return true;
    }
  }

  if (valid_symbols[BLOCK_COMMENT_START] && consume_char('-', lexer) && consume_char('-', lexer)) {
    uint8_t level;

    if (scan_block_start(lexer, &level)) {
      scanner->block_comment_level = level;
      lexer->result_symbol = BLOCK_COMMENT_START;
      return true;
    }
  }

  return false;
}
