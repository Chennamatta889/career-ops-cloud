const test=require("node:test");
const assert=require("node:assert/strict");
const parser=require("../resume-parser.js");

test("detects only explicitly supported resume extensions",()=>{
  assert.equal(parser.kind("resume.PDF"),"pdf");
  assert.equal(parser.kind("resume.docx"),"docx");
  assert.equal(parser.kind("resume.txt"),"txt");
  assert.equal(parser.kind("resume.doc"),"");
  assert.equal(parser.kind("resume.pdf.exe"),"");
});
test("parses text-only resume locally and limits output",async()=>{
  const input="Experience with AWS, Jenkins, Docker, Terraform, production operations.\n".repeat(6);
  const result=await parser.parseFile({name:"candidate.txt",size:input.length,text:async()=>input});
  assert.equal(result.type,"txt");
  assert.match(result.text,/AWS, Jenkins/);
  assert.equal(result.truncated,false);
  assert.equal(result.filename,"candidate.txt");
});
test("truncates oversized text after extraction without inventing details",async()=>{
  const input="AWS Linux Docker Kubernetes ".repeat(800);
  const result=await parser.parseFile({name:"candidate.txt",size:input.length,text:async()=>input});
  assert.equal(result.text.length,16000);
  assert.equal(result.truncated,true);
  assert.ok(result.notes.some(x=>/shortened/i.test(x)));
});
test("rejects oversized and unsupported uploads before any file reads",async()=>{
  await assert.rejects(parser.parseFile({name:"resume.doc",size:200,text:async()=>""}),/Supported resume formats/);
  await assert.rejects(parser.parseFile({name:"resume.pdf",size:7*1024*1024,arrayBuffer:async()=>new ArrayBuffer(1)}),/under 6 MB/);
});
test("rejects image-only PDFs or empty text rather than making up content",async()=>{
  await assert.rejects(parser.parseFile({name:"resume.txt",size:100,text:async()=>"abc"}),/No readable text/);
});
