import Vision
import AppKit

let path = CommandLine.arguments[1]
guard let img = NSImage(contentsOfFile: path),
      let tiff = img.tiffRepresentation,
      let bmp = NSBitmapImageRep(data: tiff),
      let cg = bmp.cgImage else { print("LOAD_FAIL"); exit(1) }

let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.recognitionLanguages = ["zh-Hans", "en"]
req.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
try? handler.perform([req])
let W = CGFloat(cg.width), H = CGFloat(cg.height)
for obs in (req.results ?? []) {
  guard let cand = obs.topCandidates(1).first else { continue }
  let b = obs.boundingBox
  // origin at top-left, in pixels
  let x = b.origin.x * W
  let y = (1 - b.origin.y - b.height) * H
  let w = b.width * W
  let h = b.height * H
  print(String(format: "%.0f,%.0f,%.0f,%.0f\t%@", x, y, w, h, cand.string))
}
