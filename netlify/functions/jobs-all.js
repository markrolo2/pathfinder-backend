const fetch = require("node-fetch");
const xml2js = require("xml2js");

// Helper: safely run any fetch function without breaking the whole endpoint
async function safeFetch(fn, label) {
  try {
    return await fn();
  } catch (err) {
    console.error(`❌ ${label} failed:`, err.message);
    return []; // return empty array so the rest still works
  }
}

// -----------------------------
// BBC JOBS (RSS)
// -----------------------------
async function fetchBBCJobs() {
  const url = "https://careerssearch.bbc.co.uk/jobs/rss";
  const response = await fetch(url);
  const xml = await response.text();

  const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });

  const items = parsed?.rss?.channel?.item || [];

  return items.map((item) => ({
    source: "BBC",
    title: item.title,
    link: item.link,
    description: item.description,
    pubDate: item.pubDate
  }));
}

// -----------------------------
// EXAMPLE: ANOTHER SOURCE
// (Add your other job sources here)
// -----------------------------
async function fetchOtherJobs() {
  // Example placeholder — replace with your real fetch logic
  return [
    {
      source: "Example",
      title: "Example Job",
      link: "https://example.com",
      description: "This is a placeholder job.",
      pubDate: new Date().toISOString()
    }
  ];
}

// -----------------------------
// MAIN HANDLER
// -----------------------------
exports.handler = async () => {
  // Wrap each source in safeFetch so one failure doesn't break everything
  const bbcJobs = await safeFetch(fetchBBCJobs, "BBC Jobs");
  const otherJobs = await safeFetch(fetchOtherJobs, "Other Jobs");

  // Combine all results
  const allJobs = [...bbcJobs, ...otherJobs];

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(allJobs)
  };
};
