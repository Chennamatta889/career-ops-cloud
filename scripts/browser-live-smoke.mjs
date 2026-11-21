/**
 * Phase 08 read-only/live-browser QA against GitHub Pages.
 * Creates only an anonymous, throwaway browser-session job at example.org.
 * Never signs in, opens employer application forms or sends applications.
 */
import assert from "node:assert/strict";
import {chromium} from "playwright";
const website=process.env.CAREEROPS_LIVE_ORIGIN||"https://chennamatta889.github.io";
const browser=await chromium.launch({headless:true,args:["--disable-dev-shm-usage"]});
const failures=[];
function watch(page){page.on("pageerror",error=>failures.push(String(error.message||error)));}
try{
  const context=await browser.newContext({viewport:{width:1365,height:850},reducedMotion:"reduce"});
  const page=await context.newPage();watch(page);
  await page.goto(website+"/?browser-qa="+Date.now()+"#discover",{waitUntil:"domcontentloaded",timeout:35000});
  await page.waitForFunction(()=>document.querySelector("#dataModeTag")?.textContent.includes("Published"),null,{timeout:45000});
  await page.waitForFunction(()=>document.querySelectorAll("#jobsGrid .job-card").length>0,null,{timeout:25000});
  assert.ok(await page.locator("#jobsGrid .job-card").count()>0,"live published job cards missing");
  assert.ok(await page.locator('#experienceFilter option[value="3-5"]').count()===1);
  await page.locator("#experienceFilter").selectOption("3-5");
  await page.locator("#resetDiscoverFilters").click();
  assert.equal(await page.locator("#experienceFilter").inputValue(),"");

  // Exercise only a synthetic browser-local job in an unsigned-in session.
  await page.locator("#openAddJob").click();
  await page.locator('#addJobForm input[name="title"]').fill("Career-Ops QA Example Job");
  await page.locator('#addJobForm input[name="company"]').fill("Sandbox Example");
  await page.locator('#addJobForm input[name="location"]').fill("Remote");
  await page.locator('#addJobForm input[name="url"]').fill("https://example.org/jobs/qa-only");
  await page.locator('#addJobForm button[type="submit"]').click();
  await page.locator('[data-nav="applications"]').first().click();
  await page.waitForFunction(()=>document.querySelector("#applicationsBoard")?.textContent.includes("Career-Ops QA Example Job"),null,{timeout:10000});
  const savedCard=page.locator("#applicationsBoard .board-card").filter({hasText:"Career-Ops QA Example Job"});
  assert.ok(await savedCard.count()>=1);
  await savedCard.locator('button[data-action="confirm-applied"]').click();
  assert.equal(await page.locator("#applicationFollowup").isVisible(),true);
  await page.locator("#confirmNotYet").click();
  assert.ok(await savedCard.locator('select[data-stage-id]').inputValue()==="Saved");
  await page.locator("#emailReviewPanel summary").click();
  const jobId=await savedCard.locator('select[data-stage-id]').getAttribute("data-stage-id");
  await page.locator("#emailReviewJob").selectOption(jobId);
  await page.locator("#emailReviewSender").fill("recruiting@sandbox.example");
  await page.locator("#emailReviewSubject").fill("Application received");
  await page.locator("#emailReviewBody").fill("We have received your application for Career-Ops QA Example Job at Sandbox Example.");
  await page.locator("#emailReviewAnalyze").click();
  assert.equal(await page.locator("#emailReviewAttach").isEnabled(),true);
  await page.locator("#emailReviewAttach").click();
  assert.ok(await savedCard.locator('select[data-stage-id]').inputValue()==="Saved","email review must not auto apply");
  await savedCard.locator('button[data-action="confirm-applied"]').click();
  await page.locator("#confirmApplied").click();
  await page.waitForFunction(()=>document.querySelector("#applicationsBoard")?.textContent.includes("Applied"),null,{timeout:10000});
  assert.ok(await page.locator("#applicationsBoard .board-card").filter({hasText:"Career-Ops QA Example Job"})
    .locator('select[data-stage-id]').inputValue()==="Applied");
  await context.close();

  // Separate real-Chromium regression with a fixture feed intercepted in-memory.
  // Never changes public jobs.json and never opens an employer application.
  const searchContext=await browser.newContext({viewport:{width:1365,height:850}});
  const searchPage=await searchContext.newPage();watch(searchPage);
  const exampleFeed={
    schema:"careerops.public-jobs.v1",generated_at:new Date().toISOString(),
    scan:{status:"success",scanned:2,found:2,error_count:0},
    jobs:[
      {id:"test-servicenow",title:"ServiceNow Developer",company:"ITSM Example",
        url:"https://example.org/jobs/servicenow",location:"Remote",
        description:"Configure ITSM workflows and ServiceNow modules.",skills:[]},
      {id:"test-salesforce",title:"Salesforce Developer",company:"CRM Example",
        url:"https://example.org/jobs/salesforce",location:"Remote",
        description:"Integrate Salesforce CRM with ServiceNow ticketing.",skills:[]}
    ]
  };
  await searchPage.route("**/data/jobs.json*",route=>route.fulfill({
    status:200,contentType:"application/json",body:JSON.stringify(exampleFeed)
  }));
  await searchPage.goto(website+"/?browser-qa=search-"+Date.now()+"#discover",
    {waitUntil:"domcontentloaded",timeout:35000});
  await searchPage.waitForFunction(()=>document.querySelector("#dataModeTag")?.textContent.includes("Published"),null,{timeout:20000});
  await searchPage.locator("#jobSearch").fill("ServiceNow");
  const titles=searchPage.locator("#jobsGrid .job-card h3");
  assert.deepEqual(await titles.allTextContents(),["ServiceNow Developer"],
    "ServiceNow must not match Salesforce description-only job by default");
  await searchPage.locator("#searchDescriptions").check();
  assert.deepEqual(await titles.allTextContents(),["ServiceNow Developer","Salesforce Developer"],
    "description-only mentions must be opt-in and ranked below title");
  await searchPage.locator("#resetDiscoverFilters").click();
  assert.equal(await searchPage.locator("#searchDescriptions").isChecked(),false);
  await searchContext.close();

  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});
  const mpage=await mobile.newPage();watch(mpage);
  await mpage.goto(website+"/?browser-qa=mobile-"+Date.now()+"#discover",{waitUntil:"domcontentloaded",timeout:35000});
  await mpage.waitForFunction(()=>document.querySelector("#dataModeTag")?.textContent.includes("Published"),null,{timeout:45000});
  await mpage.waitForSelector("#jobsGrid .job-card",{timeout:25000});
  const dimensions=await mpage.evaluate(()=>({viewport:document.documentElement.clientWidth,content:document.documentElement.scrollWidth}));
  assert.ok(dimensions.content<=dimensions.viewport+5,"mobile page has horizontal overflow: "+JSON.stringify(dimensions));
  assert.ok(await mpage.locator("#experienceFilter").count()===1);
  await mobile.close();
  assert.deepEqual(failures,[],"unhandled browser JavaScript errors");
  console.log("Career-Ops live Chromium QA PASSED: desktop, mobile, ServiceNow relevance and synthetic guest tracking.");
}catch(e){
  console.error("Phase 08 live browser QA failed:",e?.stack||e);
  if(failures.length)console.error("Browser errors:",failures.slice(0,5));
  process.exitCode=1;
}finally{await browser.close();}
