// 扫描一行像素，按颜色分段（量化容差 + 最小段宽），用于实测侧栏边界。
// 用法: scanrow.swift <img> <y> <x0> <x1> [tol] [minW]
import AppKit
let a = CommandLine.arguments
guard a.count >= 5, let img = NSImage(contentsOfFile: a[1]),
      let tiff = img.tiffRepresentation, let bmp = NSBitmapImageRep(data: tiff) else {
  print("LOAD_FAIL"); exit(1)
}
let y = Int(a[2])!, x0 = Int(a[3])!, x1 = Int(a[4])!
let tol = a.count > 5 ? Int(a[5])! : 8
let minW = a.count > 6 ? Int(a[6])! : 8
func rgb(_ x: Int) -> (Int, Int, Int) {
  guard let c = bmp.colorAt(x: x, y: y) else { return (-1, -1, -1) }
  return (Int(c.redComponent * 255), Int(c.greenComponent * 255), Int(c.blueComponent * 255))
}
var start = x0
var base = rgb(x0)
for x in (x0 + 1)...x1 {
  let c = rgb(x)
  if abs(c.0 - base.0) > tol || abs(c.1 - base.1) > tol || abs(c.2 - base.2) > tol {
    if x - start >= minW {
      print(String(format: "x=%4d..%4d w=%4d  #%02X%02X%02X", start, x - 1, x - start, base.0, base.1, base.2))
    }
    start = x; base = c
  }
}
if x1 - start >= minW {
  print(String(format: "x=%4d..%4d w=%4d  #%02X%02X%02X", start, x1, x1 - start + 1, base.0, base.1, base.2))
}
