; Lua doc annotations (`---@class`, `---@field`, ...) are re-parsed by the
; `luadoc` grammar, which highlights the annotation structure (keyword, name,
; type, description) distinctly. Same as nvim-treesitter's lua queries: the
; comment `content` (after `--`) starts with a `-` (the third dash), which is
; offset away before handing `@class ...` to luadoc.
(comment
  content: (_) @injection.content
  (#lua-match? @injection.content "^[-][%s]*[@|]")
  (#set! injection.language "luadoc")
  (#offset! @injection.content 0 1 0 0))

((comment) @injection.content
  (#set! injection.language "comment"))

; Markup <style> / <script> content
(markup_element
  open_tag: (markup_opening_element
    name: (markup_tag_name) @_tag)
  (markup_raw_text) @injection.content
  (#eq? @_tag "style")
  (#set! injection.language "css"))

(markup_element
  open_tag: (markup_opening_element
    name: (markup_tag_name) @_tag)
  (markup_raw_text) @injection.content
  (#eq? @_tag "script")
  (#set! injection.language "javascript"))
