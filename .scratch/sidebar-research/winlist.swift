import CoreGraphics
let target = CommandLine.arguments[1]
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
for w in list {
  let owner = w[kCGWindowOwnerName as String] as? String ?? ""
  if owner.lowercased().contains(target.lowercased()) {
    let id = w[kCGWindowNumber as String] as? Int ?? 0
    let b = w[kCGWindowBounds as String] as? [String: CGFloat] ?? [:]
    let name = w[kCGWindowName as String] as? String ?? ""
    print("\(id)\t\(Int(b["X"] ?? 0)),\(Int(b["Y"] ?? 0)),\(Int(b["Width"] ?? 0)),\(Int(b["Height"] ?? 0))\t\(name)")
  }
}
