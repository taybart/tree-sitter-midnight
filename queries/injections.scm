((comment) @injection.content
  (#set! injection.language "comment"))

; Markup <style> / <script> content (go-erde `-X markup`)
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
