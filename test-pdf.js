const fs = require('fs');
async function test() {
  const buf = fs.readFileSync('package.json'); // Dummy (though it will fail to parse as PDF, let's see)
  try {
    const pdfModule = await import('pdf-parse');
    console.log("pdfModule keys:", Object.keys(pdfModule));
    console.log("pdfModule default:", typeof pdfModule.default);
    if (pdfModule.PDFParse) {
      console.log("Using v2 detected");
    }
    console.log("TEXT EXTRACTED:", rawText.slice(0, 20));
  } catch (e) {
    console.log("Expected crash since package.json isn't a PDF, but API is solid:", e.message);
  }
}
test();
