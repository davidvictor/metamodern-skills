// Render every page of a PDF with Apple's PDFKit, the engine behind Preview, Safari and Mail.
// Usage: render_pdfkit PDF OUT_PREFIX SCALE [TILE]
// TILE > 0 draws the page in TILE x TILE pixel tiles and stitches them, the way Preview draws
// a zoomed page, which exposes failures that a single full-page draw can hide.
import AppKit
import PDFKit

let args = CommandLine.arguments
guard args.count >= 4, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])),
      let scaleValue = Double(args[3]) else {
    FileHandle.standardError.write("usage: render_pdfkit PDF OUT_PREFIX SCALE [TILE]\n".data(using: .utf8)!)
    exit(2)
}
let scale = CGFloat(scaleValue)
let tile = args.count > 4 ? Int(args[4]) ?? 0 : 0
let space = CGColorSpaceCreateDeviceRGB()
let info = CGImageAlphaInfo.premultipliedLast.rawValue

func context(_ w: Int, _ h: Int) -> CGContext {
    let c = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: space, bitmapInfo: info)!
    c.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    c.fill(CGRect(x: 0, y: 0, width: w, height: h))
    return c
}

for i in 0..<doc.pageCount {
    let page = doc.page(at: i)!
    let box = page.bounds(for: .mediaBox)
    let w = Int((box.width * scale).rounded()), h = Int((box.height * scale).rounded())
    let canvas = context(w, h)
    if tile > 0 {
        var ty = 0
        while ty < h {
            var tx = 0
            while tx < w {
                let tw = min(tile, w - tx), th = min(tile, h - ty)
                let c = context(tw, th)
                c.translateBy(x: CGFloat(-tx), y: CGFloat(-ty))
                c.scaleBy(x: scale, y: scale)
                page.draw(with: .mediaBox, to: c)
                canvas.draw(c.makeImage()!, in: CGRect(x: tx, y: ty, width: tw, height: th))
                tx += tile
            }
            ty += tile
        }
    } else {
        canvas.scaleBy(x: scale, y: scale)
        page.draw(with: .mediaBox, to: canvas)
    }
    let rep = NSBitmapImageRep(cgImage: canvas.makeImage()!)
    let name = String(format: "%@-%02d.png", args[2], i + 1)
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: name))
}
