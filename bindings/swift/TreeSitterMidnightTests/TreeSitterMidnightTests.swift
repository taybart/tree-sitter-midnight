import XCTest
import SwiftTreeSitter
import TreeSitterMidnight

final class TreeSitterMidnightTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_midnight())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Midnight grammar")
    }
}
