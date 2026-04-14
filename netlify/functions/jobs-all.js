const fetch = require("node-fetch");
const xml2js = require("xml2js");
const crypto = require("crypto");

// ---------------------------------------------
// Sector keyword mapping
// ---------------------------------------------
const sectorKeywords = {
  sport: ["sport", "athlete", "coaching", "fitness", "football", "rugby", "cricket"],
  technology: ["developer", "engineer", "software", "data", "ai", "machine learning", "cyber", "cloud", "it", "technical"],
  business: ["marketing", "sales", "finance", "operations", "management", "strategy", "consultant", "commercial"],
  health: ["health", "medical", "nurse", "clinical", "wellbeing", "mental health"],
  arts: ["design", "creative", "artist", "illustration", "fashion", "craft"],
  education: ["teacher", "teaching", "education", "training", "learning", "tutor"],
  media: ["producer", "editor", "journalism", "radio", "tv", "film", "content", "social media", "broadcast"],
  environment: ["environment", "sustainability", "climate", "ecology", "green"]
};

// ---------------------------------------------
// Infer sectorPair from job content
// ---------------------------------------------
function inferSectorPair(title, description) {
  const text = (title + " " + description).toLowerCase();
  const matched = [];

  for (const [sector, keywords] of Object.entries(sectorKeywords)) {
    if (keywords.some(k => text.includes(k))) {
      matched.push(sector);
    }
  }

  // Case A: 2+ matches → take first two
  if (matched.length >= 2) return matched.slice(0, 2);

  // Case B: 1 match → pair with a sensible neighbour
  if (matched.length === 1) {
    const s = matched[0];
    const fallback = {
      sport: "health",
      technology: "business",
      business: "technology",
      health: "education",
      arts: "media",
      education: "health",
      media: "arts",
      environment: "business"
    };
    return [s, fallback[s] || "business"];
  }

  // Case C: no matches → neutral default
  return ["business", "technology"];
}

// ---------------------------------------------
// Main handler
// ---------------------------------------------
exports.handler = async () => {
  try {
    // ---------------------------------------------
    // 1. Fetch BBC RSS (broad search)
    // ---------------------------------------------
    const bbcRSS = "https://careerssearch.bbc.co.uk/jobs/rss";
    const rssResponse = await fetch(bbcRSS);
    const rssText = await rssResponse.text();
    const rssParsed = await xml2js.parseStringPromise(rssText, { mergeAttrs: true });

    const bbcJobs = rssParsed.rss.channel[0].item.map(job => {
      const title = job.title[0];
      const description = job.description[0];

      return {
        id: "bbc-" + crypto.randomUUID(),
        title,
        company: "BBC",
        location: job["bbc:location"] ? job["bbc:location"][0] : "UK",
        salary: null,
        applyUrl: job.link[0],
        category: "job",
        description,
        sectorPair: inferSectorPair(title, description)
      };
    });

    // ---------------------------------------------
    // 2. Fetch Adzuna jobs (all sectors)
    // ---------------------------------------------
    const adzunaURL = `https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id=YOUR_APP_ID&app_key=YOUR_APP_KEY&results_per_page=50&content-type=application/json`;
    const adzunaResponse = await fetch(adzunaURL);
    const adzunaData = await adzunaResponse.json();

    const adzunaJobs = adzunaData.results.map(job => {
      const title = job.title;
      const description = job.description;

      const salary =
        job.salary_min && job.salary_max
          ? `£${Math.round(job.salary_min)} – £${Math.round(job.salary_max)}`
          : null;

      return {
        id: "adzuna-" + job.id.toString(),
        title,
        company: job.company.display_name,
        location: job.location.display_name,
        salary,
        applyUrl: job.redirect_url,
        category: "job",
        description,
        sectorPair: inferSectorPair(title, description)
      };
    });

    // ---------------------------------------------
    // 3. Combine feeds
    // ---------------------------------------------
    const allJobs = [...bbcJobs, ...adzunaJobs];

    return {
      statusCode: 200,
      body: JSON.stringify(allJobs)
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
