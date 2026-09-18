import AppKit
let args = CommandLine.arguments
guard let img = NSImage(contentsOfFile: args[1]),
      let tiff = img.tiffRepresentation,
      let bmp = NSBitmapImageRep(data: tiff) else { print("LOAD_FAIL"); exit(1) }
var i = 2
while i + 1 < args.count {
  let p = args[i].split(separator: ",").map { Int($0)! }
  let label = args[i+1]
  var r = 0.0, g = 0.0, b = 0.0, n = 0.0
  for px in p[0]..<(p[0]+p[2]) { for py in p[1]..<(p[1]+p[3]) {
    if let c = bmp.colorAt(x: px, y: py) { r += c.redComponent; g += c.greenComponent; b += c.blueComponent; n += 1 }
  }}
  if n > 0 { print(String(format: "%@\t#%02X%02X%02X", label, Int(r/n*255), Int(g/n*255), Int(b/n*255))) }
  i += 2
}
