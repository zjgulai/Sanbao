import Foundation
import CoreText
import CoreGraphics

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

let inputData = FileHandle.standardInput.readDataToEndOfFile()
guard let input = try JSONSerialization.jsonObject(with: inputData) as? [String: String],
      let fontPath = input["fontPath"], let text = input["text"], !text.isEmpty,
      let provider = CGDataProvider(url: URL(fileURLWithPath: fontPath) as CFURL),
      let graphicsFont = CGFont(provider) else { fail("Cannot read wordmark input/font") }
let font = CTFontCreateWithGraphicsFont(graphicsFont, 64, nil, nil)
let postScriptName = CTFontCopyPostScriptName(font) as String
let attributed = NSAttributedString(string: text, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font])
let line = CTLineCreateWithAttributedString(attributed)
let outline = CGMutablePath()
for run in CTLineGetGlyphRuns(line) as! [CTRun] {
    let attributes = CTRunGetAttributes(run) as NSDictionary
    guard let runFont = attributes[kCTFontAttributeName] as! CTFont? else { fail("Missing run font") }
    guard CTFontCopyPostScriptName(runFont) as String == postScriptName else { fail("Font fallback is not allowed") }
    let count = CTRunGetGlyphCount(run)
    var glyphs = [CGGlyph](repeating: 0, count: count)
    var positions = [CGPoint](repeating: .zero, count: count)
    CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
    CTRunGetPositions(run, CFRange(location: 0, length: 0), &positions)
    for index in 0..<count {
        guard glyphs[index] != 0 else { fail("Font has no glyph for wordmark text") }
        if let path = CTFontCreatePathForGlyph(runFont, glyphs[index], nil) {
            outline.addPath(path, transform: CGAffineTransform(translationX: positions[index].x, y: positions[index].y))
        }
    }
}
guard !outline.isEmpty else { fail("Wordmark has no visible glyphs") }
func number(_ value: CGFloat) -> String {
    String(format: "%.3f", locale: Locale(identifier: "en_US_POSIX"), Double(value))
}
func point(_ value: CGPoint) -> String { number(value.x) + " " + number(value.y) }
var commands: [String] = []
outline.applyWithBlock { pointer in
    let element = pointer.pointee
    switch element.type {
    case .moveToPoint: commands.append("M" + point(element.points[0]))
    case .addLineToPoint: commands.append("L" + point(element.points[0]))
    case .addQuadCurveToPoint: commands.append("Q" + point(element.points[0]) + " " + point(element.points[1]))
    case .addCurveToPoint: commands.append("C" + point(element.points[0]) + " " + point(element.points[1]) + " " + point(element.points[2]))
    case .closeSubpath: commands.append("Z")
    @unknown default: fail("Unsupported outline command")
    }
}
let bounds = outline.boundingBoxOfPath
let output: [String: Any] = [
    "font": postScriptName, "path": commands.joined(separator: " "),
    "x": bounds.minX, "y": bounds.minY, "width": bounds.width, "height": bounds.height
]
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: output, options: [.sortedKeys]))
