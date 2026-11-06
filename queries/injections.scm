((comment) @injection.content
  (#set! injection.language "comment"))

; JSX <style> / <script> content (go-erde `-X jsx`)
(jsx_element
  open_tag: (jsx_opening_element
    name: (jsx_tag_name) @_tag)
  (jsx_raw_text) @injection.content
  (#eq? @_tag "style")
  (#set! injection.language "css"))

(jsx_element
  open_tag: (jsx_opening_element
    name: (jsx_tag_name) @_tag)
  (jsx_raw_text) @injection.content
  (#eq? @_tag "script")
  (#set! injection.language "javascript"))
