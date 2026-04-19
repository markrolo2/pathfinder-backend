const fetch = require("node-fetch");
const xml2js = require("xml2js");
const cheerio = require("cheerio");

// ------------------------------
// SIMPLE KEYWORD CLASSIFIER
// ------------------------------

const SECTOR_KEYWORDS = {
  technology: ["software", "developer", "engineer", "data", "cloud", "cyber", "AI", "IT"],
  media: ["journalism", "editor", "broadcast", "content", "film", "tv", "radio", "digital"],
  business: ["manager", "strategy", "consultant", "finance", "operations", "commercial"],
  education: ["teacher", "school", "lecturer", "tutor", "curriculum", "education"],
  health: ["nurse", "doctor", "clinical", "healthcare", "mental health", "NHS"],
  arts: ["design", "creative", "illustrator", "music", "theatre", "graphic"],
  sport: ["coach", "fitness", "athlete", "sport"],
  environment: ["sustainability", "climate", "ecology", "renewable", "environment"]
};

function classifySectorsKeyword(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  const scores = {};

  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    scores[sector] = keywords.reduce(
      (count, kw) => count + (text.includes(kw.toLowerCase()) ? 1 : 0),
      0
    );
  }

  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([sector]) => sector);
}

// ------------------------------
// HELPERS
// ------------------------------

async function safeFetch(fn, label) {
  try {
    return await fn();
  } catch (err) {
    console.error(`❌ ${label} failed:`, err.message);
    return [];
  }
}

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (err) {
    console.error("❌ fetchJSON failed:", err.message);
    return null;
  }
}

async function fetchHTML(url) {
  try {
    const res = await fetch(url);
    return await res.text();
  } catch (err) {
    console.error("❌ fetchHTML failed:", err.message);
    return "";
  }
}

// ------------------------------
// BBC MAIN JOBS — JSON API
// ------------------------------

async function fetchBBCMainJobs() {
  const jobs = [];
  const MAX_PAGES = 3;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://careers.bbc.co.uk/api/search?page=${page}`;
    const data = await fetchJSON(url);

    if (!data || !data.results) continue;

    for (const item of data.results) {
      jobs.push({
        id: `bbc-main-${jobs.length}`,
        title: item.title,
        company: "BBC",
        location: item.location || "UK",
        applyUrl: item.url.startsWith("http") ? item.url : "https://careers.bbc.co.uk" + item.url,
        description: item.description || "",
        sectorPair: classifySectorsKeyword(item.title, item.description),
        category: "job",
        salary: null
      });
    }
  }

  return jobs;
}

// --------------------------------------
// BBC EARLY CAREERS SCRAPER (HTML)
// --------------------------------------

async function fetchBBCEarlyCareers() {
  const url = "https://www.bbc.co.uk/careers/trainee-schemes-and-apprenticeships";
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  const jobs = [];

  $(".promo").each((i, el) => {
    const title = $(el).find(".promo__title").text().trim();
    const link = $(el).find("a").attr("href");
    const summary = $(el).find(".promo__summary").text().trim();

    if (!title || !link) return;

    jobs.push({
      id: `bbc-early-${i}`,
      title,
      company: "BBC Early Careers",
      location: "UK",
      applyUrl: link.startsWith("http") ? link : "https://www.bbc.co.uk" + link,
      description: summary || "",
      sectorPair: classifySectorsKeyword(title, summary),
      category: "job",
      salary: null
    });
  });

  return jobs;
}

// ------------------------------
// GUARDIAN JOBS (RSS)
// ------------------------------

async function fetchGuardianJobs() {
  const url = "https://jobs.theguardian.com/jobsrss/";
  const xml = await fetchHTML(url);

  if (!xml || xml.trim() === "") {
    console.error("❌ Guardian RSS returned empty XML");
    return [];
  }

  const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });
  const items = parsed?.rss?.channel?.item || [];

  return items.map((item, i) => ({
    id: `guardian-${i}`,
    title: item.title,
    company: "The Guardian",
    location: "UK",
    salary: null,
    applyUrl: item.link,
    category: "job",
    description: item.description || "",
    sectorPair: classifySectorsKeyword(item.title, item.description)
  }));
}

// ------------------------------
// EXAMPLE JOB
// ------------------------------

async function fetchExampleJobs() {
  return [
    {
      id: "example-001",
      title: "Example Job",
      company: "Example Co",
      location: "Remote",
      salary: null,
      applyUrl: "https://example.com",
      category: "job",
      description: "This is a placeholder job.",
      sectorPair: classifySectorsKeyword("Example Job", "This is a placeholder job.")
    }
  ];
}

// ------------------------------
// MAIN HANDLER
// ------------------------------

exports.handler = async () => {
  const bbcMain = await safeFetch(fetchBBCMainJobs, "BBC Main Jobs");
  const bbcEarly = await safeFetch(fetchBBCEarlyCareers, "BBC Early Careers");
  const guardian = await safeFetch(fetchGuardianJobs, "Guardian Jobs");
  const example = await safeFetch(fetchExampleJobs, "Example Jobs");

  const allJobs = [...bbcMain, ...bbcEarly, ...guardian, ...example];

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    body: JSON.stringify(allJobs)
  };
};
