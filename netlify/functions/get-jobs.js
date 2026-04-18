const fs = require("fs");
const path = require("path");

exports.handler = async () => {
  const filePath = path.join("/tmp", "jobs.json");

  if (!fs.existsSync(filePath)) {
    return {
      statusCode: 404,
      body: "No cached jobs yet. Try again after the first daily scrape."
    };
  }

  const data = fs.readFileSync(filePath, "utf8");

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: data
  };
};
