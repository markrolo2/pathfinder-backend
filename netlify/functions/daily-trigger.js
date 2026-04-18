// netlify/functions/daily-trigger.js

const fetch = require("node-fetch");

exports.handler = async () => {
  try {
    await fetch(
      "https://YOUR-SITE-NAME.netlify.app/.netlify/functions/jobs-all"
    );

    return {
      statusCode: 200,
      body: "Triggered jobs-all successfully"
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: "Failed to trigger jobs-all: " + err.message
    };
  }
};
