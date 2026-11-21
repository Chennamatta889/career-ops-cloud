const test=require("node:test");
const assert=require("node:assert/strict");
const {isIndiaLocation,market}=require("../india-jobs.js");
test("India is the fixed job-discovery market",()=>assert.equal(market,"IN"));
test("only verified India country, state or city locations qualify",()=>{
  for(const label of [
    "India","Hyderabad, Telangana, India","Bengaluru, Karnataka","Bangalore",
    "Remote - India","India - Remote","Pan India","Delhi NCR","Mumbai",
    "Pune, Maharashtra","Noida","Gurugram, Haryana","Gurgaon","Kochi, Kerala",
    "Chennai","Kolkata","Ahmedabad","Goa","Visakhapatnam","Hyderabad / Bengaluru",
    "New Delhi","Andhra Pradesh","IN"
  ])assert.equal(isIndiaLocation(label),true,label);
});
test("global remote, missing and overseas jobs never qualify on keyword alone",()=>{
  for(const label of [
    "Remote","Remote Worldwide","Anywhere","Anywhere in the World",
    "Not specified","","Unknown","Indiaapolis, United States",
    "Indianapolis, IN, USA","London, United Kingdom","New York, USA",
    "Singapore","Toronto, Canada","Berlin, Germany",
    "Dublin, Ireland","Dubai, UAE","Remote - United States",
    "Europe / US Remote",null,undefined,123
  ])assert.equal(isIndiaLocation(label),false,String(label));
});
test("location tokens are whole words and explicit overseas country wins over a same-named city",()=>{
  for(const label of ["Delhi, USA","Bangalore, United States","Hyderabad, USA",
    "Pune, Germany","IndiaTech", "Indianapolis","Bangaloreton, Canada"]){
    assert.equal(isIndiaLocation(label),false,label);
  }
  assert.equal(isIndiaLocation("Bangalore / London, India"),true);
});
