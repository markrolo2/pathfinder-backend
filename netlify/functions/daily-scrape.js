const fs = require("fs");
const path = require("path");
const jobsAll = require("./jobs-all.js"); // your existing scraper

exports.handler = async () => {
  try {
    // Run your existing scraper
    const result = await jobsAll.handler();

    // Save the JSON to Netlify's persistent storage
    const filePath = path.join("/tmp", "jobs.json");
    fs.writeFileSync(filePath, result.body);

    return {
      statusCode: 200,
      body: "Daily scrape completed"
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: "Scrape failed: " + err.message
    };
  }
};
