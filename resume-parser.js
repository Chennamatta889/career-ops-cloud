/* Career-Ops browser-side PDF/DOCX/TXT extraction.
 * Vendored, pinned parser libraries are packaged into GitHub Pages at build
 * time. Resume bytes never leave this browser until the user explicitly
 * requests AI Review. No external CDN, uploads, or OCR.
 */
(function (root) {
  "use strict";
  const MAX_FILE_BYTES=6*1024*1024;
  const MAX_TEXT=16000;
  const MAX_PAGES=25;
  let mammothPromise=null;
  let pdfModulePromise=null;
  function kind(filename) {
    const name=String(filename||"").toLowerCase();
    if(name.endsWith(".pdf"))return "pdf";
    if(name.endsWith(".docx"))return "docx";
    if(name.endsWith(".txt"))return "txt";
    return "";
  }
  function tidy(raw) {
    return String(raw||"").replace(/\u0000/g,"")
      .replace(/\r\n?/g,"\n").replace(/[\t ]+\n/g,"\n")
      .replace(/\n{4,}/g,"\n\n\n").trim();
  }
  async function pdfLibrary(){
    if(!pdfModulePromise)pdfModulePromise=import("./vendor/pdf.min.mjs");
    try{
      const pdf=await pdfModulePromise;
      pdf.GlobalWorkerOptions.workerSrc=new URL("./vendor/pdf.worker.min.mjs",document.baseURI).href;
      return pdf;
    }catch(e){
      pdfModulePromise=null;
      throw new Error("The PDF parser has not loaded. Verify the latest GitHub Pages deployment.");
    }
  }
  async function mammothLibrary(){
    if(root.mammoth && typeof root.mammoth.extractRawText==="function")return root.mammoth;
    if(!mammothPromise){
      mammothPromise=new Promise((resolve,reject)=>{
        const script=document.createElement("script");
        script.src=new URL("./vendor/mammoth.browser.min.js",document.baseURI).href;
        script.async=true;
        const timer=setTimeout(()=>{script.remove();reject(new Error("DOCX parser load timed out."));},20000);
        script.onload=()=>{
          clearTimeout(timer);
          if(root.mammoth?.extractRawText)resolve(root.mammoth);
          else reject(new Error("DOCX parser did not initialize."));
        };
        script.onerror=()=>{clearTimeout(timer);reject(new Error("DOCX parser is not available in the published site."));};
        document.head.appendChild(script);
      }).catch(e=>{mammothPromise=null;throw e;});
    }
    return mammothPromise;
  }
  async function fromPdf(buffer){
    const lib=await pdfLibrary();
    const data=new Uint8Array(buffer);
    const loading=lib.getDocument({
      data,isEvalSupported:false,enableScripting:false,
      stopAtErrors:true
    });
    let doc;
    try {
      doc=await loading.promise;
      const pageCount=Math.min(doc.numPages,MAX_PAGES);
      let text="";
      for(let p=1;p<=pageCount;p++){
        const page=await doc.getPage(p);
        const content=await page.getTextContent();
        let line="";
        for(const item of content.items){
          if(typeof item.str!=="string")continue;
          line+=item.str+(item.hasEOL?"\n":" ");
        }
        text+=line+"\n";
        if(text.length>MAX_TEXT)break;
      }
      return {text,notes:doc.numPages>MAX_PAGES?["Only the first "+MAX_PAGES+" PDF pages were processed."]:[]};
    } finally {
      if(doc)await doc.destroy().catch(()=>{});
      else await loading.destroy().catch(()=>{});
    }
  }
  async function fromDocx(buffer){
    const mammoth=await mammothLibrary();
    const result=await mammoth.extractRawText({arrayBuffer:buffer});
    return {text:result.value||"",notes:(result.messages||[]).slice(0,3).map(m=>String(m.message||m)).filter(Boolean)};
  }
  async function parseFile(file){
    if(!file || typeof file.name!=="string")throw new Error("Select a PDF, DOCX, or TXT resume.");
    const type=kind(file.name);
    if(!type)throw new Error("Supported resume formats are PDF, DOCX, or TXT.");
    if(file.size<=0||file.size>MAX_FILE_BYTES)throw new Error("Resume must be under 6 MB and must not be empty.");
    let out;
    if(type==="txt")out={text:await file.text(),notes:[]};
    else {
      // Read user-selected Android content:// file immediately, before
      // asynchronous library imports. Delayed file access can fail after
      // the system document picker returns to the browser.
      const buffer=await file.arrayBuffer();
      out=type==="pdf" ? await fromPdf(buffer) : await fromDocx(buffer);
    }
    const content=tidy(out.text);
    if(content.length<80)throw new Error("No readable text was extracted. Scanned/image-only PDFs need OCR; use a text-based PDF, DOCX, or paste your resume.");
    const truncated=content.length>MAX_TEXT;
    return {
      filename:file.name.slice(0,120),type,text:content.slice(0,MAX_TEXT),
      truncated,originalCharacters:content.length,
      notes:[...(out.notes||[]),...(truncated?["Text was shortened to 16,000 characters. Review it before using AI."]:[])]
    };
  }
  const api={parseFile,kind,tidy,MAX_FILE_BYTES,MAX_TEXT};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.CareerOpsResumeParser=api;
})(typeof window!=="undefined"?window:globalThis);
