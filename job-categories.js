/* Shared, explainable broad job-category classifier.
 * These are convenient browse labels, NOT eligibility, AI, or job requirements.
 * Unknown/mixed titles are placed in "Other" instead of being excluded.
 */
(function(root){
  "use strict";
  const CATEGORIES=[
    "IT & Software",
    "Sales & Business",
    "Marketing & Creative",
    "Finance & Accounting",
    "HR & Recruitment",
    "Operations & Logistics",
    "Customer Support",
    "Healthcare & Life Sciences",
    "Education & Training",
    "Manufacturing & Engineering",
    "Hospitality & Retail",
    "Legal & Compliance",
    "Other"
  ];
  const PATTERNS=[
    ["Healthcare & Life Sciences",/\b(nurs(?:e|ing)|physician|medical|clinical|healthcare|patient|pharmac(?:y|ist)|radiolog|biotech|therapist|dentist|hospital|laboratory|lab technician|life sciences|care coordinator)\b/i],
    ["Education & Training",/\b(teacher|teaching|tutor|professor|instructor|instructional|curriculum|academic|pedagogy|educator|learning specialist|school administrator)\b/i],
    ["Legal & Compliance",/\b(legal|lawyer|attorney|counsel|paralegal|litigation|compliance|regulatory|contract specialist|risk & compliance|internal audit counsel)\b/i],
    ["HR & Recruitment",/\b(human resources|talent acquisition|recruit(?:er|ing|ment)|people operations|people partner|hrbp|hr generalist|hr manager|employee relations|compensation and benefits|payroll hr)\b/i],
    ["Finance & Accounting",/\b(financ(?:e|ial)|accountant|accounting|bookkeep|auditor|audit manager|tax specialist|fp&a|treasury|investment analyst|credit analyst|payroll|collections|banking|actuar)\b/i],
    ["Marketing & Creative",/\b(marketing|branding|brand manager|copywriter|content strategist|digital media|social media|graphic design|visual design|art director|advertis(?:ing|ement)|creative|communications|public relations|seo|editorial|content creator|videographer|ux designer)\b/i],
    ["Customer Support",/\b(customer support|customer service|customer success|customer care|support specialist|customer experience|call cent(?:er|re)|contact cent(?:er|re)|service representative|client support|helpdesk agent|customer relations)\b/i],
    ["Hospitality & Retail",/\b(hospitality|hotel|restaurant|food service|chef|cook|barista|cashier|store manager|store associate|retail|housekeeping|front desk|retail merchandis|fashion|food and beverage|storekeeper|guest relations)\b/i],
    ["IT & Software",/\b(devops|site reliability|sre|software|developer|programmer|full.?stack|front.?end|back.?end|cloud engineer|cloud architect|platform engineer|data engineer|machine learning|data scientist|cybersecurity|security engineer|network engineer|database administrator|systems administrator|technical architect|qa automation|quality assurance engineer|web engineer|mobile engineer|it support|it administrator|information technology|ai engineer|product engineer|infrastructure engineer)\b/i],
    ["Manufacturing & Engineering",/\b(manufactur|mechanical|electrical|civil engineer|production engineer|plant operator|factory|construction|maintenance engineer|mechanic|industrial engineer|quality engineer|hvac|field technician|laboratory technician|process engineer|assembly|automotive engineer|production supervisor|facility engineer)\b/i],
    ["Sales & Business",/\b(sales|business development|account executive|account manager|business analyst|partnerships|revenue|commercial|client acquisition|relationship manager|business growth|key accounts|channel partner|territory manager|inside sales|outside sales)\b/i],
    ["Operations & Logistics",/\b(operations|logistics|supply chain|warehouse|fulfill(?:ment)?|delivery|fleet|driver|dispatch|inventory|procurement|purchase manager|sourcing|transport|facility manager|field coordinator|project coordinator|business process|shift lead|distribution)\b/i]
  ];
  function classify(title,department,description){
    const heading=[title,department].filter(x=>typeof x==="string"&&x.trim()).join(" ");
    for(const [name,re] of PATTERNS)if(re.test(heading))return name;
    // Do not guess an industry from an unstructured job description unless
    // it is a clearly named department (title alone is often ambiguous).
    if(!heading && typeof description==="string"){
      for(const [name,re] of PATTERNS)if(re.test(description.slice(0,300)))return name;
    }
    return "Other";
  }
  const api={categories:CATEGORIES.slice(),classify};
  if(typeof module!=="undefined" && module.exports)module.exports=api;
  root.CareerOpsCategories=api;
})(typeof globalThis!=="undefined"?globalThis:this);
