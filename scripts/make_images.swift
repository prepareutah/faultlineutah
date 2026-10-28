// Draws the link-preview image (share.png, 1200x630) and the iPhone home-screen
// icon (apple-touch-icon.png, 180x180) in the site's brand colors.
// Run from the project root:  swift scripts/make_images.swift
import AppKit

let out = URL(fileURLWithPath: "site/assets/img")
let brand = NSColor(srgbRed: 0x1b / 255, green: 0x4d / 255, blue: 0x5c / 255, alpha: 1)
let accent = NSColor(srgbRed: 0xe4 / 255, green: 0x83 / 255, blue: 0x57 / 255, alpha: 1)

func render(_ w: Int, _ h: Int, to name: String, draw: (CGContext) -> Void) {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8,
                             samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                             bytesPerRow: 0, bitsPerPixel: 0)!
  let gc = NSGraphicsContext(bitmapImageRep: rep)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = gc
  // Flip so y runs down, like the SVG logo.
  gc.cgContext.translateBy(x: 0, y: CGFloat(h))
  gc.cgContext.scaleBy(x: 1, y: -1)
  draw(gc.cgContext)
  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: out.appendingPathComponent(name))
  print("wrote", name)
}

// The logo in its 40x40 SVG coordinates: mountains, and a ground line with a fault step.
func mountains(_ c: CGContext, scale s: CGFloat, at o: CGPoint) {
  c.move(to: CGPoint(x: o.x + 4 * s, y: o.y + 28 * s))
  for (x, y) in [(12, 15.5), (16.5, 21), (22, 12), (36, 28)] { c.addLine(to: CGPoint(x: o.x + CGFloat(x) * s, y: o.y + CGFloat(y) * s)) }
  c.closePath()
}
func faultLine(_ c: CGContext, scale s: CGFloat, at o: CGPoint, x0: CGFloat = 4, x1: CGFloat = 36) {
  c.move(to: CGPoint(x: o.x + x0 * s, y: o.y + 32.5 * s))
  c.addLine(to: CGPoint(x: o.x + 18 * s, y: o.y + 32.5 * s))
  c.addLine(to: CGPoint(x: o.x + 21 * s, y: o.y + 29 * s))
  c.addLine(to: CGPoint(x: o.x + x1 * s, y: o.y + 29 * s))
}

func text(_ s: String, font: NSFont, color: NSColor, at p: CGPoint, kern: CGFloat = 0) {
  let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color, .kern: kern]
  // Flip back locally so text draws upright; `p` is where the text's baseline starts.
  let ctx = NSGraphicsContext.current!.cgContext
  ctx.saveGState()
  ctx.translateBy(x: p.x, y: p.y)
  ctx.scaleBy(x: 1, y: -1)
  NSAttributedString(string: s, attributes: attrs).draw(at: .zero)
  ctx.restoreGState()
}

let serifBold = NSFont(name: "IowanOldStyle-Bold", size: 92) ?? NSFont.boldSystemFont(ofSize: 92)
let serif = NSFont(name: "IowanOldStyle-Roman", size: 40) ?? NSFont.systemFont(ofSize: 40)

render(1200, 630, to: "share.png") { c in
  c.setFillColor(brand.cgColor)
  c.fill(CGRect(x: 0, y: 0, width: 1200, height: 630))
  // Big, faint mountains on the right.
  c.setFillColor(NSColor(white: 1, alpha: 0.10).cgColor)
  mountains(c, scale: 24, at: CGPoint(x: 600, y: -120))
  c.fillPath()
  // The fault-step ground line across the whole image.
  c.setStrokeColor(accent.cgColor)
  c.setLineWidth(10)
  c.setLineCap(.round)
  c.setLineJoin(.round)
  c.move(to: CGPoint(x: -10, y: 560))
  c.addLine(to: CGPoint(x: 700, y: 560))
  c.addLine(to: CGPoint(x: 760, y: 500))
  c.addLine(to: CGPoint(x: 1210, y: 500))
  c.strokePath()
  // Logo mark.
  c.setFillColor(NSColor.white.cgColor)
  mountains(c, scale: 3.2, at: CGPoint(x: 72, y: 26))
  c.fillPath()

  text("LIVING ON THE FAULT", font: .systemFont(ofSize: 26, weight: .semibold), color: accent, at: CGPoint(x: 86, y: 168), kern: 4)
  text("FaultLine Utah", font: serifBold, color: .white, at: CGPoint(x: 80, y: 278))
  text("Know the ground you live on.", font: serif, color: NSColor(white: 1, alpha: 0.92), at: CGPoint(x: 84, y: 362))
  text("Earthquake hazards for any Utah address, in plain language.", font: .systemFont(ofSize: 27, weight: .regular),
       color: NSColor(white: 1, alpha: 0.78), at: CGPoint(x: 84, y: 418))
  text("faultlineutah.com", font: .systemFont(ofSize: 26, weight: .semibold), color: .white, at: CGPoint(x: 84, y: 522))
}

render(180, 180, to: "apple-touch-icon.png") { c in
  c.setFillColor(brand.cgColor)
  c.fill(CGRect(x: 0, y: 0, width: 180, height: 180))
  c.setFillColor(NSColor.white.cgColor)
  mountains(c, scale: 4.5, at: CGPoint(x: 0, y: -4))
  c.fillPath()
  c.setStrokeColor(accent.cgColor)
  c.setLineWidth(13)
  c.setLineCap(.round)
  c.setLineJoin(.round)
  faultLine(c, scale: 4.5, at: CGPoint(x: 0, y: -4))
  c.strokePath()
}
