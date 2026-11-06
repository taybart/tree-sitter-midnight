import XCTest
import SwiftTreeSitter
import TreeSitterErde

final class TreeSitterErdeTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_erde())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Erde grammar")
    }
}
